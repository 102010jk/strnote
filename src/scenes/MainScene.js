import * as THREE from 'three';

const MAX_ORBS = 100000;

export const ORBIT_MODES = { SPHERE: 0, DISC: 1, HIERARCHY: 2 };
export const GLOW_MODES = { SOFT: 0, PHYSICAL: 1, STAR: 2 };

/**
 * Roj hvězd obíhajících střed.
 *
 * Instance nesou jen pozici (vec3), velikost jde do shaderu jako uniform –
 * proti plné matici to je 3 floaty místo 16 a při 100 000 tělesech to je rozdíl
 * mezi 1,2 MB a 6,4 MB nahrávaných na GPU každý snímek.
 *
 * Záře se počítá ve fragment shaderu, ne z textury. Podrobnosti v docs/instancing.md.
 */
export class MainScene {
  constructor(app) {
    this.app = app;

    this.params = {
      count: 1,
      orbitMode: ORBIT_MODES.SPHERE,
      orbit: 14,
      orbitSpeed: 0.6,
      glowMode: GLOW_MODES.STAR,
      color: '#ffd7a3',
      core: 1.8,
      size: 0.85,
      power: 220,
      reach: 30,
      glow: 0.7,
      spread: 0.3,
      cutoff: 0.55,
      pulse: 0.25,
      exposure: 1.05,
      floor: true,
      animate: true,
    };

    this.group = new THREE.Group();
    this._disposables = [];
    this._pulseTime = 0;
    this._orbitTime = 0;
    this._detail = null;

    this._color = new THREE.Color();
    this._offsets = new Float32Array(MAX_ORBS * 3);
    this._px = new Float32Array(MAX_ORBS);
    this._py = new Float32Array(MAX_ORBS);
    this._pz = new Float32Array(MAX_ORBS);

    this._allocateOrbits();
    this._buildOrbits(this.params.orbitMode);
    this._buildSwarm();
    this._buildFloor();

    this.controls = this._describeControls();
    this.applyAll();
  }

  _track(...objects) {
    this._disposables.push(...objects);
  }

  _allocateOrbits() {
    this._ux = new Float32Array(MAX_ORBS);
    this._uy = new Float32Array(MAX_ORBS);
    this._uz = new Float32Array(MAX_ORBS);
    this._vx = new Float32Array(MAX_ORBS);
    this._vy = new Float32Array(MAX_ORBS);
    this._vz = new Float32Array(MAX_ORBS);
    this._radius = new Float32Array(MAX_ORBS);
    this._angularSpeed = new Float32Array(MAX_ORBS);
    this._phase = new Float32Array(MAX_ORBS);
    this._parent = new Int32Array(MAX_ORBS);
  }

  /**
   * Dráhy se počítají jednou pro celou kapacitu. Každé těleso má rovinu oběhu
   * (dvojice kolmých vektorů u, v), poloměr, fázi a rodiče, kolem kterého obíhá
   * (-1 = střed scény). Za běhu pak stačí u*cos(a) + v*sin(a) plus pozice rodiče.
   */
  _buildOrbits(mode) {
    const random = mulberry32(0x5f37);
    const golden = Math.PI * (3 - Math.sqrt(5));

    const u = new THREE.Vector3();
    const v = new THREE.Vector3();
    const axis = new THREE.Vector3();

    const depth = new Uint8Array(MAX_ORBS);
    const roots = Math.max(1, Math.round(MAX_ORBS * 0.004));

    for (let i = 0; i < MAX_ORBS; i++) {
      let radius;
      let parent = -1;

      if (mode === ORBIT_MODES.DISC) {
        // všechno v jedné rovině – klasická soustava při pohledu z boku
        const theta = golden * i;
        u.set(Math.cos(theta), 0, Math.sin(theta));
        v.set(-Math.sin(theta), 0, Math.cos(theta));
        radius = Math.sqrt((i + 0.5) / MAX_ORBS);
      } else if (mode === ORBIT_MODES.HIERARCHY) {
        // hvězdy → planety → měsíce: každé těleso obíhá nějaké dřívější
        randomDirection(u, random);
        axis.set(0, 1, 0);
        if (Math.abs(u.y) > 0.95) axis.set(1, 0, 0);
        v.crossVectors(u, axis).normalize();

        if (i < roots) {
          radius = Math.cbrt((i + 0.5) / roots);
        } else {
          // druhá mocnina posouvá volbu k nižším indexům = k větším tělesům
          parent = Math.min(i - 1, Math.floor(random() * random() * i));
          depth[i] = Math.min(depth[parent] + 1, 6);
          radius = 0.07 * Math.pow(0.45, depth[i] - 1) * (0.5 + random());
        }
      } else {
        // koule: rovnoměrné rozmístění směrů Fibonacciho spirálou
        const y = 1 - (i / (MAX_ORBS - 1)) * 2;
        const ring = Math.sqrt(Math.max(1 - y * y, 0));
        const theta = golden * i;
        u.set(Math.cos(theta) * ring, y, Math.sin(theta) * ring).normalize();

        axis.set(0, 1, 0);
        if (Math.abs(u.y) > 0.95) axis.set(1, 0, 0);
        v.crossVectors(u, axis).normalize();

        radius = i === 0 ? 0 : Math.cbrt((i + 0.5) / MAX_ORBS);
      }

      this._ux[i] = u.x;
      this._uy[i] = u.y;
      this._uz[i] = u.z;
      this._vx[i] = v.x;
      this._vy[i] = v.y;
      this._vz[i] = v.z;
      this._radius[i] = radius;
      this._parent[i] = parent;
      this._angularSpeed[i] = Math.min(1 / Math.sqrt(Math.max(radius, 0.02)), 14);
      this._phase[i] = (i * 2.39996) % (Math.PI * 2);
    }
  }

  _buildSwarm() {
    this._offsetAttribute = new THREE.InstancedBufferAttribute(this._offsets, 3);
    this._offsetAttribute.setUsage(THREE.DynamicDrawUsage);

    this._coreUniforms = {
      uScale: { value: 1 },
      uColor: { value: new THREE.Color(1, 1, 1) },
    };
    this._haloUniforms = {
      uScale: { value: 1 },
      uColor: { value: new THREE.Color(1, 1, 1) },
      uMode: { value: this.params.glowMode },
      uPixelHeight: { value: 1080 },
    };

    const coreMaterial = new THREE.ShaderMaterial({
      uniforms: this._coreUniforms,
      vertexShader: CORE_VERTEX,
      fragmentShader: CORE_FRAGMENT,
    });

    const haloMaterial = new THREE.ShaderMaterial({
      uniforms: this._haloUniforms,
      vertexShader: HALO_VERTEX,
      fragmentShader: HALO_FRAGMENT,
      transparent: true,
      depthWrite: false,
      // čistý součet barev, nezávislý na alfě
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });

    this._track(coreMaterial, haloMaterial);

    this._coreSource = new THREE.SphereGeometry(1, 8, 6);
    this.cores = new THREE.Mesh(this._instanced(this._coreSource), coreMaterial);
    this.cores.frustumCulled = false;
    this.group.add(this.cores);

    this.halos = new THREE.Mesh(this._instanced(new THREE.PlaneGeometry(2, 2)), haloMaterial);
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 1;
    this.group.add(this.halos);

    // Jedno skutečné světlo na střed. Sto tisíc bodových světel WebGL neutáhne,
    // záře těles je proto vizuální efekt, ne zdroj osvětlení.
    this.light = new THREE.PointLight(0xffffff, 1, 10, 2);
    this.group.add(this.light);
  }

  /** Udělá z běžné geometrie instancovanou se sdíleným atributem pozic. */
  _instanced(source) {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = source.index;
    geometry.attributes = source.attributes;
    geometry.setAttribute('aOffset', this._offsetAttribute);
    geometry.instanceCount = this.params.count;
    return geometry;
  }

  /** Míň trojúhelníků na tělese, když jich je na scéně hodně. */
  _setDetail(count) {
    const detail =
      count <= 32 ? [48, 32]
      : count <= 256 ? [24, 16]
      : count <= 2000 ? [12, 8]
      : count <= 20000 ? [8, 6]
      : [6, 4];

    if (this._detail && this._detail[0] === detail[0]) return;
    this._detail = detail;

    const previous = this._coreSource;
    this._coreSource = new THREE.SphereGeometry(1, detail[0], detail[1]);

    this.cores.geometry.index = this._coreSource.index;
    this.cores.geometry.attributes = this._coreSource.attributes;

    // až teď – dispose uvolní buffery staré geometrie na GPU
    previous?.dispose();
  }

  _buildFloor() {
    const geometry = new THREE.CircleGeometry(90, 128);
    const material = new THREE.MeshStandardMaterial({
      color: 0x10141c,
      roughness: 0.72,
      metalness: 0.1,
    });
    this._track(geometry, material);

    this.floor = new THREE.Mesh(geometry, material);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -2.4;
    this.group.add(this.floor);
  }

  _describeControls() {
    const p = this.params;

    return [
      {
        id: 'count', label: 'Počet těles', min: 1, max: MAX_ORBS, step: 1,
        get: () => p.count,
        set: (v) => { p.count = Math.round(v); this._setDetail(p.count); },
      },
      {
        id: 'orbitMode', label: 'Typ oběhu', type: 'select',
        options: [
          { value: ORBIT_MODES.SPHERE, label: 'Koule' },
          { value: ORBIT_MODES.DISC, label: 'Disk (jedna rovina)' },
          { value: ORBIT_MODES.HIERARCHY, label: 'Hierarchie (jedno kolem druhého)' },
        ],
        get: () => p.orbitMode,
        set: (v) => {
          if (v === p.orbitMode) return;
          p.orbitMode = v;
          this._buildOrbits(v);
        },
      },
      {
        id: 'orbit', label: 'Poloměr oběhu', min: 0, max: 20000, step: 0.5,
        get: () => p.orbit,
        set: (v) => { p.orbit = v; },
      },
      {
        id: 'orbitSpeed', label: 'Rychlost oběhu', min: 0, max: 20, step: 0.01,
        get: () => p.orbitSpeed,
        set: (v) => { p.orbitSpeed = v; },
      },
      {
        id: 'glowMode', label: 'Režim záře', type: 'select',
        options: [
          { value: GLOW_MODES.SOFT, label: 'Měkká' },
          { value: GLOW_MODES.PHYSICAL, label: 'Fyzikální (1/r²)' },
          { value: GLOW_MODES.STAR, label: 'Hvězda (s paprsky)' },
        ],
        get: () => p.glowMode,
        set: (v) => { p.glowMode = v; this._haloUniforms.uMode.value = v; },
      },
      {
        id: 'color', label: 'Barva', type: 'color',
        get: () => p.color,
        set: (v) => { p.color = v; this.applyColor(); },
      },
      {
        id: 'core', label: 'Jas jádra', min: 0.2, max: 8, step: 0.05,
        get: () => p.core,
        set: (v) => { p.core = v; this.applyColor(); },
      },
      {
        id: 'size', label: 'Velikost', min: 0.005, max: 3, step: 0.005,
        get: () => p.size,
        set: (v) => { p.size = v; },
      },
      {
        id: 'power', label: 'Síla svícení', min: 0, max: 800, step: 5,
        get: () => p.power,
        set: (v) => { p.power = v; },
      },
      {
        id: 'reach', label: 'Dosah', min: 2, max: 400, step: 1,
        get: () => p.reach,
        set: (v) => { p.reach = v; this.light.distance = v; },
      },
      {
        id: 'glow', label: 'Záře', min: 0, max: 3, step: 0.01,
        get: () => p.glow,
        set: (v) => { p.glow = v; this.app.bloom.strength = v; },
      },
      {
        id: 'spread', label: 'Rozptyl záře', min: 0, max: 1.5, step: 0.01,
        get: () => p.spread,
        set: (v) => { p.spread = v; this.app.bloom.radius = v; },
      },
      {
        id: 'cutoff', label: 'Práh záře', min: 0, max: 1, step: 0.01,
        get: () => p.cutoff,
        set: (v) => { p.cutoff = v; this.app.bloom.threshold = v; },
      },
      {
        id: 'pulse', label: 'Tep', min: 0, max: 1, step: 0.01,
        get: () => p.pulse,
        set: (v) => { p.pulse = v; },
      },
      {
        id: 'exposure', label: 'Expozice', min: 0.2, max: 2.5, step: 0.01,
        get: () => p.exposure,
        set: (v) => { p.exposure = v; this.app.renderer.toneMappingExposure = v; },
      },
      {
        id: 'floor', label: 'Podlaha', type: 'toggle',
        get: () => p.floor,
        set: (v) => { p.floor = v; this.floor.visible = v; },
      },
    ];
  }

  applyColor() {
    const { color, core } = this.params;
    this._color.set(color);

    this._coreUniforms.uColor.value.copy(this._color).multiplyScalar(core);
    this._haloUniforms.uColor.value.copy(this._color).multiplyScalar(core * 0.4);
    this.light.color.set(color);
  }

  applyAll() {
    for (const control of this.controls) control.set(control.get());
    this.applyColor();
  }

  update(delta, _elapsed) {
    const p = this.params;

    if (p.animate) {
      this._pulseTime += delta;
      this._orbitTime += delta * p.orbitSpeed;
    }

    const beat = 1 + Math.sin(this._pulseTime * 1.6) * p.pulse * 0.22;
    const count = p.count;
    const time = this._orbitTime;
    const scale = p.size * beat;

    const offsets = this._offsets;
    const px = this._px;
    const py = this._py;
    const pz = this._pz;

    for (let i = 0; i < count; i++) {
      const angle = time * this._angularSpeed[i] + this._phase[i];
      const radius = this._radius[i] * p.orbit;
      const c = Math.cos(angle) * radius;
      const s = Math.sin(angle) * radius;

      const parent = this._parent[i];
      const bx = parent < 0 ? 0 : px[parent];
      const by = parent < 0 ? 0 : py[parent];
      const bz = parent < 0 ? 0 : pz[parent];

      const x = bx + this._ux[i] * c + this._vx[i] * s;
      const y = by + this._uy[i] * c + this._vy[i] * s;
      const z = bz + this._uz[i] * c + this._vz[i] * s;

      px[i] = x;
      py[i] = y;
      pz[i] = z;

      const o = i * 3;
      offsets[o] = x;
      offsets[o + 1] = y;
      offsets[o + 2] = z;
    }

    // nahrávej na GPU jen tu část, která se opravdu kreslí
    const attribute = this._offsetAttribute;
    attribute.clearUpdateRanges?.();
    attribute.addUpdateRange?.(0, count * 3);
    attribute.needsUpdate = true;

    this.cores.geometry.instanceCount = count;
    this.halos.geometry.instanceCount = count;

    this._coreUniforms.uScale.value = scale;
    this._haloUniforms.uScale.value = scale * 9.0;
    this._haloUniforms.uPixelHeight.value = this.app.renderer.domElement.height;

    this.light.intensity = p.power * beat;
  }

  dispose() {
    this.group.removeFromParent();
    this._coreSource?.dispose();
    this.cores.geometry.dispose();
    this.halos.geometry.dispose();
    for (const item of this._disposables) item.dispose();
    this._disposables.length = 0;
  }
}

function randomDirection(target, random) {
  const z = random() * 2 - 1;
  const theta = random() * Math.PI * 2;
  const ring = Math.sqrt(Math.max(1 - z * z, 0));
  target.set(Math.cos(theta) * ring, z, Math.sin(theta) * ring).normalize();
}

/** Deterministický generátor – stejný roj po každém načtení. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CORE_VERTEX = `
attribute vec3 aOffset;
uniform float uScale;

void main() {
  vec3 world = position * uScale + aOffset;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
`;

const CORE_FRAGMENT = `
uniform vec3 uColor;

void main() {
  gl_FragColor = vec4(uColor, 1.0);
}
`;

// Placka otočená k obrazovce – billboard se dělá tady, ne na procesoru.
const HALO_VERTEX = `
attribute vec3 aOffset;
uniform float uScale;
uniform float uPixelHeight;
varying vec2 vLocal;
varying float vDim;

// Pod určitou velikost se hvězda zmenšit nesmí – rasterizér by ji podle pohybu
// kamery náhodně trefoval a míjel a roj by při oddálení blikal. Místo zmenšování
// ji držíme na minimu a ubíráme jí jas úměrně ploše, takže celkové množství
// světla zůstává stejné.
//
// Hodnota platí pro celou placku, ne pro jasné jádro – to je zhruba její šestina.
// Naměřené kolísání jasu při podpixelových pohybech kamery (60 000 těles):
// 2 px → 0,68 %, 5 px → 0,05 %, 10 px → 0,04 %, 16 px → 0,01 %.
// Vyšší hodnoty už jen zbytečně rozmazávají a ubírají jas.
const float MIN_PIXELS = 10.0;

void main() {
  vLocal = position.xy;

  vec4 viewPosition = modelViewMatrix * vec4(aOffset, 1.0);
  float depth = max(-viewPosition.z, 1e-6);
  float pixels = uScale * projectionMatrix[1][1] / depth * uPixelHeight * 0.5;

  float boost = max(MIN_PIXELS / max(pixels, 1e-6), 1.0);
  vDim = 1.0 / (boost * boost);

  viewPosition.xy += position.xy * uScale * boost;
  gl_Position = projectionMatrix * viewPosition;
}
`;

// Záře se počítá pro každý pixel. Žádná textura, takže se nerozmaže
// ani při maximálním přiblížení a nemá to okraje jako obrázek.
const HALO_FRAGMENT = `
uniform vec3 uColor;
uniform int uMode;
varying vec2 vLocal;
varying float vDim;

void main() {
  float r = length(vLocal);
  if (r > 1.0) discard;

  float fade = 1.0 - smoothstep(0.82, 1.0, r);
  float intensity;

  if (uMode == 0) {
    // měkká: prostý gaussovský spád
    intensity = exp(-r * r * 34.0);
  } else if (uMode == 1) {
    // fyzikální: ubývání s druhou mocninou vzdálenosti, dlouhý doběh
    intensity = 1.0 / (1.0 + 520.0 * r * r) - 0.0019;
  } else {
    // hvězda: spád plus difrakční paprsky, jaké dělá clona objektivu
    vec2 d = abs(vLocal);
    float spikes =
        pow(max(0.0, 1.0 - d.x * 5.5), 3.0) * exp(-d.y * 16.0)
      + pow(max(0.0, 1.0 - d.y * 5.5), 3.0) * exp(-d.x * 16.0);
    intensity = exp(-r * r * 42.0) + spikes * 0.5;
  }

  intensity = max(intensity, 0.0) * fade;
  intensity += smoothstep(0.022, 0.0, r) * 2.0; // jádro

  gl_FragColor = vec4(uColor * intensity * vDim, 1.0);
}
`;
