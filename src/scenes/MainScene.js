import * as THREE from 'three';

const MAX_ORBS = 100000;

export const ORBIT_MODES = { SPHERE: 0, DISC: 1, HIERARCHY: 2, PLANETS: 3 };
export const GLOW_MODES = { SOFT: 0, PHYSICAL: 1, STAR: 2 };

const PLANET_SCALE = [0.22, 0.55]; // planeta je zlomek velikosti hvězdy
const PLANET_GREY = [0.24, 0.46];

/**
 * Roj hvězd obíhajících střed scény.
 *
 * Instance nesou pozici (vec3), barvu (vec3) a měřítko (float). Pozice se
 * přepisuje každý snímek, barva a měřítko jen při změně nastavení.
 * Záře se počítá ve fragment shaderu, ne z textury.
 * Podrobnosti v docs/instancing.md.
 */
export class MainScene {
  constructor(app) {
    this.app = app;

    this.params = {
      count: 1,
      orbitMode: ORBIT_MODES.SPHERE,
      orbit: 14,
      orbitSpeed: 0.6,
      camera: 'centered',
      glowMode: GLOW_MODES.STAR,
      colorA: '#ffd7a3',
      colorB: '#6aa9ff',
      colorSpread: 0.08,
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

    this._offsets = new Float32Array(MAX_ORBS * 3);
    this._tints = new Float32Array(MAX_ORBS * 3);
    this._sizes = new Float32Array(MAX_ORBS);
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
    this._isPlanet = new Uint8Array(MAX_ORBS);
  }

  /**
   * Dráhy se spočítají jednou pro celou kapacitu. Každé těleso má rovinu oběhu
   * (dvojici kolmých vektorů u, v), poloměr, fázi a rodiče, kolem kterého obíhá
   * (-1 = střed scény). Za běhu pak stačí rodič + u*cos(a) + v*sin(a).
   *
   * Uprostřed scény samotné nic nestojí – všechna tělesa mají nenulový poloměr.
   */
  _buildOrbits(mode) {
    const random = mulberry32(0x5f37);
    const golden = Math.PI * (3 - Math.sqrt(5));

    const u = new THREE.Vector3();
    const v = new THREE.Vector3();

    this._isPlanet.fill(0);
    this._sizes.fill(1);

    if (mode === ORBIT_MODES.PLANETS) {
      this._buildPlanetSystems(random, u, v);
      if (this._sizeAttribute) this._sizeAttribute.needsUpdate = true;
      return;
    }

    const depth = new Uint8Array(MAX_ORBS);
    const roots = Math.max(1, Math.round(MAX_ORBS * 0.004));

    for (let i = 0; i < MAX_ORBS; i++) {
      let radius;
      let parent = -1;

      if (mode === ORBIT_MODES.DISC) {
        // všechno v jedné rovině – soustava při pohledu z boku
        const theta = golden * i;
        u.set(Math.cos(theta), 0, Math.sin(theta));
        v.set(-Math.sin(theta), 0, Math.cos(theta));
        radius = Math.sqrt((i + 0.5) / MAX_ORBS);
      } else if (mode === ORBIT_MODES.HIERARCHY) {
        // každé těleso obíhá nějaké dřívější
        randomPlane(u, v, random);

        if (i < roots) {
          radius = Math.cbrt((i + 0.5) / roots);
        } else {
          // druhá mocnina posouvá volbu k nižším indexům, tedy dovnitř
          parent = Math.min(i - 1, Math.floor(random() * random() * i));
          depth[i] = Math.min(depth[parent] + 1, 6);
          radius = 0.07 * Math.pow(0.45, depth[i] - 1) * (0.5 + random());
        }
      } else {
        // koule: směry Fibonacciho spirálou, poloměr přes třetí odmocninu
        const y = 1 - (i / (MAX_ORBS - 1)) * 2;
        const ring = Math.sqrt(Math.max(1 - y * y, 0));
        const theta = golden * i;
        u.set(Math.cos(theta) * ring, y, Math.sin(theta) * ring).normalize();
        perpendicular(u, v);
        radius = Math.cbrt((i + 0.5) / MAX_ORBS);
      }

      this._write(i, u, v, radius, parent);
    }

    if (this._sizeAttribute) this._sizeAttribute.needsUpdate = true;
  }

  /** Hvězda a k ní 0 až 9 planet, které obíhají ji. */
  _buildPlanetSystems(random, u, v) {
    let i = 0;

    while (i < MAX_ORBS) {
      const star = i++;

      randomPlane(u, v, random);
      this._write(star, u, v, Math.cbrt(random()), -1);
      this._sizes[star] = 1;

      const planets = Math.min(Math.floor(random() * 10), MAX_ORBS - i);

      for (let k = 0; k < planets; k++) {
        const index = i++;

        randomPlane(u, v, random);
        this._write(index, u, v, 0.012 + random() * 0.05, star);

        this._isPlanet[index] = 1;
        this._sizes[index] = PLANET_SCALE[0] + random() * (PLANET_SCALE[1] - PLANET_SCALE[0]);
      }
    }
  }

  _write(index, u, v, radius, parent) {
    this._ux[index] = u.x;
    this._uy[index] = u.y;
    this._uz[index] = u.z;
    this._vx[index] = v.x;
    this._vy[index] = v.y;
    this._vz[index] = v.z;
    this._radius[index] = radius;
    this._parent[index] = parent;
    this._angularSpeed[index] = Math.min(1 / Math.sqrt(Math.max(radius, 0.02)), 14);
    this._phase[index] = (index * 2.39996) % (Math.PI * 2);
  }

  /**
   * Barvy se berou z úsečky mezi dvěma zvolenými odstíny a každé těleso dostane
   * ještě malé náhodné okolí kolem toho bodu – roj tak není jednobarevný.
   * Planety jsou šedé, samy nesvítí.
   */
  _buildColors() {
    const from = new THREE.Color(this.params.colorA);
    const to = new THREE.Color(this.params.colorB);
    const spread = this.params.colorSpread;

    const random = mulberry32(0x9e1f);
    const color = new THREE.Color();
    const tints = this._tints;

    for (let i = 0; i < MAX_ORBS; i++) {
      const o = i * 3;

      if (this._isPlanet[i]) {
        const grey = PLANET_GREY[0] + random() * (PLANET_GREY[1] - PLANET_GREY[0]);
        tints[o] = grey;
        tints[o + 1] = grey;
        tints[o + 2] = grey * 1.03; // sotva znatelný nádech do modra
        continue;
      }

      color.copy(from).lerp(to, random());

      tints[o] = clamp01(color.r + (random() * 2 - 1) * spread);
      tints[o + 1] = clamp01(color.g + (random() * 2 - 1) * spread);
      tints[o + 2] = clamp01(color.b + (random() * 2 - 1) * spread);
    }

    if (this._tintAttribute) this._tintAttribute.needsUpdate = true;
  }

  _buildSwarm() {
    this._offsetAttribute = new THREE.InstancedBufferAttribute(this._offsets, 3);
    this._offsetAttribute.setUsage(THREE.DynamicDrawUsage);
    this._tintAttribute = new THREE.InstancedBufferAttribute(this._tints, 3);
    this._sizeAttribute = new THREE.InstancedBufferAttribute(this._sizes, 1);

    this._coreUniforms = {
      uScale: { value: 1 },
      uBrightness: { value: 1 },
    };
    this._haloUniforms = {
      uScale: { value: 1 },
      uBrightness: { value: 1 },
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

    // Jedno skutečné světlo, aby měla podlaha čím svítit. Sto tisíc bodových
    // světel WebGL neutáhne, záře těles je vizuální efekt, ne zdroj osvětlení.
    this.light = new THREE.PointLight(0xffffff, 1, 10, 2);
    this.group.add(this.light);
  }

  /** Udělá z běžné geometrie instancovanou se sdílenými atributy. */
  _instanced(source) {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = source.index;
    geometry.attributes = source.attributes;
    geometry.setAttribute('aOffset', this._offsetAttribute);
    geometry.setAttribute('aTint', this._tintAttribute);
    geometry.setAttribute('aSize', this._sizeAttribute);
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
          { value: ORBIT_MODES.HIERARCHY, label: 'Hierarchie' },
          { value: ORBIT_MODES.PLANETS, label: 'Planety (0–9 na hvězdu)' },
        ],
        get: () => p.orbitMode,
        set: (v) => {
          if (v === p.orbitMode) return;
          p.orbitMode = v;
          this._buildOrbits(v);
          this._buildColors(); // planety jsou šedé, hvězdy barevné
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
        id: 'camera', label: 'Kamera', type: 'select', raw: true,
        options: [
          { value: 'centered', label: 'Na střed' },
          { value: 'detached', label: 'Odpojená (posuv myší)' },
        ],
        get: () => p.camera,
        set: (v) => { p.camera = v; this.app.setCameraMode(v); },
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
        id: 'colorA', label: 'Barva od', type: 'color',
        get: () => p.colorA,
        set: (v) => { p.colorA = v; this._buildColors(); this.applyBrightness(); },
      },
      {
        id: 'colorB', label: 'Barva do', type: 'color',
        get: () => p.colorB,
        set: (v) => { p.colorB = v; this._buildColors(); },
      },
      {
        id: 'colorSpread', label: 'Rozptyl barev', min: 0, max: 0.4, step: 0.005,
        get: () => p.colorSpread,
        set: (v) => { p.colorSpread = v; this._buildColors(); },
      },
      {
        id: 'core', label: 'Jas jádra', min: 0.2, max: 8, step: 0.05,
        get: () => p.core,
        set: (v) => { p.core = v; this.applyBrightness(); },
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

  applyBrightness() {
    const { core, colorA } = this.params;

    this._coreUniforms.uBrightness.value = core;
    this._haloUniforms.uBrightness.value = core * 0.4;
    this.light.color.set(colorA);
  }

  applyAll() {
    for (const control of this.controls) control.set(control.get());
    this._buildColors();
    this.applyBrightness();
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

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

/** Libovolný vektor kolmý na u. */
function perpendicular(u, target) {
  if (Math.abs(u.y) > 0.95) target.set(1, 0, 0);
  else target.set(0, 1, 0);

  target.crossVectors(u, target).normalize();
}

function randomPlane(u, v, random) {
  const z = random() * 2 - 1;
  const theta = random() * Math.PI * 2;
  const ring = Math.sqrt(Math.max(1 - z * z, 0));

  u.set(Math.cos(theta) * ring, z, Math.sin(theta) * ring).normalize();
  perpendicular(u, v);
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
attribute vec3 aTint;
attribute float aSize;
uniform float uScale;
varying vec3 vTint;

void main() {
  vTint = aTint;
  vec3 world = position * (uScale * aSize) + aOffset;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
`;

const CORE_FRAGMENT = `
uniform float uBrightness;
varying vec3 vTint;

void main() {
  gl_FragColor = vec4(vTint * uBrightness, 1.0);
}
`;

// Placka otočená k obrazovce – billboard se dělá tady, ne na procesoru.
const HALO_VERTEX = `
attribute vec3 aOffset;
attribute vec3 aTint;
attribute float aSize;
uniform float uScale;
uniform float uPixelHeight;
varying vec2 vLocal;
varying vec3 vTint;
varying float vDim;

// Pod určitou velikost se hvězda zmenšit nesmí – rasterizér by ji podle pohybu
// kamery náhodně trefoval a míjel a roj by při oddálení blikal. Místo zmenšování
// ji držíme na minimu a ubíráme jí jas úměrně ploše, takže celkové množství
// světla zůstává stejné.
//
// Hodnota platí pro celou placku, ne pro jasné jádro – to je zhruba její šestina.
// Naměřené kolísání jasu při podpixelových pohybech kamery (60 000 těles):
// 2 px → 0,68 %, 5 px → 0,05 %, 10 px → 0,04 %, 16 px → 0,01 %.
const float MIN_PIXELS = 10.0;

void main() {
  vLocal = position.xy;
  vTint = aTint;

  float scale = uScale * aSize;
  vec4 viewPosition = modelViewMatrix * vec4(aOffset, 1.0);
  float depth = max(-viewPosition.z, 1e-6);
  float pixels = scale * projectionMatrix[1][1] / depth * uPixelHeight * 0.5;

  float boost = max(MIN_PIXELS / max(pixels, 1e-6), 1.0);
  vDim = 1.0 / (boost * boost);

  viewPosition.xy += position.xy * scale * boost;
  gl_Position = projectionMatrix * viewPosition;
}
`;

// Záře se počítá pro každý pixel. Žádná textura, takže se nerozmaže
// ani při maximálním přiblížení a nemá okraje jako obrázek.
const HALO_FRAGMENT = `
uniform float uBrightness;
uniform int uMode;
varying vec2 vLocal;
varying vec3 vTint;
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

  gl_FragColor = vec4(vTint * uBrightness * intensity * vDim, 1.0);
}
`;
