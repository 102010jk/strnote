import * as THREE from 'three';
import { SOLAR_SYSTEM } from './solarSystem.js';

// Halo je placka HALO_RATIO× větší než jádro.
const HALO_RATIO = 9;

// Jádro menší než tohle (poloměr v pixelech) se nekreslí – viz CORE_VERTEX.
const MIN_CORE_PIXELS = 1.5;

// Kliknutí trefí těleso, když je kurzor na jeho kouli, nebo do téhle
// vzdálenosti od ní – planetu o dvou pixelech jinak trefit nejde.
const PICK_TOLERANCE_PX = 12;

// Odstup kamery po kliknutí, v poloměrech tělesa: planeta zabere zhruba
// třetinu výšky obrazovky, hvězda je vidět i s okolím.
const FOCUS_PLANET_RADII = 7;
const FOCUS_STAR_RADII = 30;

// Čas simulace se počítá ve dnech od epochy J2000 (1. 1. 2000, 12:00 UT),
// ke které jsou vztažené dráhové prvky. Začíná se v aktuálním okamžiku.
const J2000 = Date.UTC(2000, 0, 1, 12);
const DAY_MS = 86400000;
const SECONDS_PER_DAY = 86400;
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

// Rychlost: 1 = skutečný čas. Posuvník jde logaritmicky do MAX_SPEED,
// napsat se dá cokoliv.
const MAX_SPEED = 10000;

// Gravitační konstanta v jednotkách scény: Gm³ / (kg · den²). Ověřeno:
// z hmotností v datech vyjdou skutečné oběžné doby všech planet i Měsíce
// s chybou pod 0,13 %.
const G = 6.6743e-11 * 1e-27 * SECONDS_PER_DAY ** 2;

const EARTH_MASS = 5.972e24;
const EARTH_RADIUS = 0.006371;
const SUN_MASS = 1.989e30;
const SUN_RADIUS = 0.6957;

// Vzhled nově vytvořených planet a měsíců podle materiálu.
const MATERIAL_LOOKS = {
  rock: { label: 'kámen', color: [0.55, 0.52, 0.48] },
  grass: { label: 'tráva', color: [0.2, 0.46, 0.16] },
  iron: { label: 'železo', color: [0.56, 0.57, 0.6] },
  water: { label: 'voda', color: [0.07, 0.24, 0.55] },
  gas: { label: 'plyn', color: [0.85, 0.72, 0.55], bands: [0.25, 12] },
  earth: { label: 'jako Země', color: [0.28, 0.48, 0.85] },
};
const PLANET_MATERIALS = ['rock', 'grass', 'iron', 'water', 'gas', 'earth'];
const MOON_MATERIALS = ['rock', 'iron', 'water'];

const UP = new THREE.Vector3(0, 1, 0);

// Dráhy v zobrazení: kolik bodů má kružnice a kdy zmizí. Mizí, když je kamera
// blíž než ORBIT_FADE × poloměr dráhy – zblízka je čára jen rovná úsečka
// vedle planety a ruší.
const ORBIT_SEGMENTS = 512;
const ORBIT_FADE = [0.02, 0.1];
const ORBIT_OPACITY = 0.35;

export const GLOW_MODES = { SOFT: 0, PHYSICAL: 1, STAR: 2 };

// Druh tělesa = větev ve shaderu (CORE_FRAGMENT).
const KIND = { star: 0, rock: 1, grass: 2, iron: 3, water: 4, gas: 5, earth: 6 };

/**
 * Replika sluneční soustavy ve skutečných velikostech a vzdálenostech.
 *
 * Tělesa se kreslí instancovaně (jádra + halo), stejně jako dřív roj.
 * Polohy se počítají ve float64 na procesoru a na GPU jdou relativně
 * ke kameře – viz docs/slunecni-soustava.md, proč bez toho Neptun třese.
 */
export class MainScene {
  constructor(app) {
    this.app = app;

    this.params = {
      // tvoření: co vznikne kliknutím a s jakými vlastnostmi
      create: 'none',
      planetMaterial: 'rock',
      planetMass: 1, // hmotnosti Země
      planetRadius: 1, // poloměry Země
      planetSpeed: 1, // násobek rychlosti podle Keplera
      moonMaterial: 'rock',
      moonMass: 0.0123,
      moonRadius: 0.27,
      moonSpeed: 1,
      starMass: 1, // hmotnosti Slunce
      starRadius: 1, // poloměry Slunce
      starTemperature: 5778, // K

      speed: 1,
      camera: 'centered',
      glowMode: GLOW_MODES.PHYSICAL,
      core: 1.8,
      // při 1,6 byla Venuše z 87 % a Jupiter z 55 % čistě bílá (naměřeno)
      planetLight: 1.0,
      glow: 0.9,
      spread: 0.3,
      cutoff: 0.8,
      pulse: 0.05,
      exposure: 0.75,
      animate: true,
    };

    // `group` stojí v počátku (Slunce), `bodies` se každý snímek přesune
    // na kameru – všechno v něm je relativní ke kameře.
    this.group = new THREE.Group();
    this.bodies = new THREE.Group();
    this.group.add(this.bodies);

    this._disposables = [];
    this._pulseTime = 0;
    this._days = (Date.now() - J2000) / DAY_MS;
    this._pickMatrix = new THREE.Matrix4();
    this._cameraOffset = new THREE.Vector3();
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._spawnPlane = new THREE.Plane();
    this._created = { planet: 0, moon: 0, star: 0 };
    this._orbitLines = [];

    this._setBodies(SOLAR_SYSTEM);
    this._buildMaterials();
    this._buildInstances();
    for (let i = 0; i < this.count; i++) this._addOrbitLine(i);
    this._buildRings();

    this.controls = this._describeControls();
    this.applyAll();
    this.update(0);
  }

  _track(...objects) {
    this._disposables.push(...objects);
  }

  /** Z popisu těles postaví pole pro výpočet drah a instanční atributy. */
  _setBodies(list) {
    const count = list.length;
    const indexOf = new Map(list.map((body, i) => [body.id, i]));

    this.list = list;
    this.count = count;
    this._indexOf = indexOf;

    // polohy a dráhy ve float64 – v float32 by Neptun měl přesnost 2 % poloměru
    this._px = new Float64Array(count);
    this._py = new Float64Array(count);
    this._pz = new Float64Array(count);
    this._ux = new Float64Array(count);
    this._uy = new Float64Array(count);
    this._uz = new Float64Array(count);
    this._vx = new Float64Array(count);
    this._vy = new Float64Array(count);
    this._vz = new Float64Array(count);
    this._a = new Float64Array(count);
    this._angle0 = new Float64Array(count);
    this._meanMotion = new Float64Array(count); // rad za den
    this._spinRate = new Float64Array(count); // rad za den
    this._parent = new Int32Array(count);
    this._lightSource = new Int32Array(count);
    // tělesa bez rodiče stojí na místě (Slunce v počátku, nové hvězdy tam, kde vznikly)
    this._fx = new Float64Array(count);
    this._fy = new Float64Array(count);
    this._fz = new Float64Array(count);

    // instanční atributy
    this._offsets = new Float32Array(count * 3);
    this._lights = new Float32Array(count * 3);
    this._spins = new Float32Array(count * 2);
    this._tints = new Float32Array(count * 3);
    this._sizes = new Float32Array(count);
    this._kinds = new Float32Array(count);
    this._lightColors = new Float32Array(count * 3);
    this._surface = new Float32Array(count * 2);

    list.forEach((body, i) => {
      const parent = body.parent ? indexOf.get(body.parent) : -1;
      if (parent >= i) throw new Error(`${body.id}: rodič musí být v seznamu dřív`);
      this._parent[i] = parent;

      if (body.position) {
        this._fx[i] = body.position[0];
        this._fy[i] = body.position[1];
        this._fz[i] = body.position[2];
      }

      if (parent >= 0) {
        // Rovina dráhy z ekliptických prvků. Ekliptika (x, y, z nahoru)
        // se v three.js mapuje na (x, z, −y), aby ležela v rovině XZ.
        const node = body.node * DEG;
        const inclination = body.inclination * DEG;
        this._ux[i] = Math.cos(node);
        this._uy[i] = 0;
        this._uz[i] = -Math.sin(node);
        this._vx[i] = -Math.sin(node) * Math.cos(inclination);
        this._vy[i] = Math.sin(inclination);
        this._vz[i] = -Math.cos(node) * Math.cos(inclination);

        this._a[i] = body.a;
        // kruhová dráha: argument šířky = střední délka − délka uzlu;
        // vytvořená tělesa mají rovnou úhel v J2000 (`phase0`)
        this._angle0[i] = body.phase0 ?? (body.meanLongitude - body.node) * DEG;
        this._meanMotion[i] = TAU / body.period;
      }

      this._spinRate[i] = TAU / body.spin;
      this._spins[i * 2 + 1] = body.tilt * DEG;

      // osvětluje ho nejbližší hvězda nad ním – Měsíc tedy Slunce, ne Země
      let source = i;
      while (list[source].material !== 'star' && this._parent[source] >= 0) source = this._parent[source];
      this._lightSource[i] = source;

      this._kinds[i] = KIND[body.material];
      this._sizes[i] = body.radius;
      this._tints.set(body.color, i * 3);
      this._surface.set(body.bands ?? [0, 0], i * 2);
    });

    for (let i = 0; i < count; i++) {
      this._lightColors.set(list[this._lightSource[i]].color, i * 3);
    }
  }

  _buildMaterials() {
    const shared = {
      uBrightness: { value: 1 },
      uBeat: { value: 1 },
      uPixelHeight: { value: 1080 },
    };

    this._coreUniforms = {
      ...cloneUniforms(shared),
      uPlanetLight: { value: 1 },
      uCameraOffset: { value: this._cameraOffset },
    };
    this._haloUniforms = {
      ...cloneUniforms(shared),
      uMode: { value: this.params.glowMode },
    };

    this._coreMaterial = new THREE.ShaderMaterial({
      uniforms: this._coreUniforms,
      vertexShader: CORE_VERTEX,
      fragmentShader: CORE_FRAGMENT,
    });

    this._haloMaterial = new THREE.ShaderMaterial({
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

    // těles je pár, takže koule může mít plný detail
    this._sphere = new THREE.SphereGeometry(1, 64, 48);
    this._quad = new THREE.PlaneGeometry(2, 2);

    this._track(this._coreMaterial, this._haloMaterial, this._sphere, this._quad);
  }

  /**
   * Instanční atributy a geometrie nad aktuálními poli. Volá se znovu po
   * přidání tělesa: pole mají novou délku, takže nové musí být i atributy
   * a geometrie. Staré geometrie se uvolní až po přepojení meshů – dispose
   * je jediná cesta, jak three.js pustí jejich buffery na GPU.
   */
  _buildInstances() {
    this._offsetAttribute = dynamicAttribute(this._offsets, 3);
    this._lightAttribute = dynamicAttribute(this._lights, 3);
    this._spinAttribute = dynamicAttribute(this._spins, 2);
    const attributes = {
      aOffset: this._offsetAttribute,
      aLight: this._lightAttribute,
      aSpin: this._spinAttribute,
      aTint: new THREE.InstancedBufferAttribute(this._tints, 3),
      aSize: new THREE.InstancedBufferAttribute(this._sizes, 1),
      aKind: new THREE.InstancedBufferAttribute(this._kinds, 1),
      aLightColor: new THREE.InstancedBufferAttribute(this._lightColors, 3),
      aSurface: new THREE.InstancedBufferAttribute(this._surface, 2),
    };

    const cores = instanced(this._sphere, attributes, this.count);
    const halos = instanced(this._quad, attributes, this.count);

    if (this.cores) {
      const previous = [this.cores.geometry, this.halos.geometry];
      this.cores.geometry = cores;
      this.halos.geometry = halos;
      for (const geometry of previous) geometry.dispose();
      return;
    }

    this.cores = new THREE.Mesh(cores, this._coreMaterial);
    this.cores.frustumCulled = false;
    // Odstup kamery od skupiny se nastavuje těsně před kreslením: kamera se po
    // update scény ještě posune (sledování tělesa) a osvětlení by bylo o snímek
    // pozadu.
    this.cores.onBeforeRender = (_renderer, _scene, camera) => {
      this._cameraOffset.subVectors(camera.position, this.bodies.position);
    };
    this.bodies.add(this.cores);

    this.halos = new THREE.Mesh(halos, this._haloMaterial);
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 1;
    this.bodies.add(this.halos);
  }

  /** Kružnice dráhy tělesa. Kreslí se kolem rodiče, takže Měsíc má svou kolem Země. */
  _addOrbitLine(i) {
    const parent = this._parent[i];
    if (parent < 0) return;

    const points = new Float32Array(ORBIT_SEGMENTS * 3);
    for (let k = 0; k < ORBIT_SEGMENTS; k++) {
      const angle = (k / ORBIT_SEGMENTS) * TAU;
      const c = Math.cos(angle) * this._a[i];
      const s = Math.sin(angle) * this._a[i];
      points[k * 3] = this._ux[i] * c + this._vx[i] * s;
      points[k * 3 + 1] = this._uy[i] * c + this._vy[i] * s;
      points[k * 3 + 2] = this._uz[i] * c + this._vz[i] * s;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(...this.list[i].color).multiplyScalar(0.6),
      transparent: true,
      opacity: ORBIT_OPACITY,
      depthWrite: false,
    });

    const line = new THREE.LineLoop(geometry, material);
    line.frustumCulled = false;
    this.bodies.add(line);
    this._orbitLines.push({ line, geometry, material, parent, radius: this._a[i] });
  }

  /** Prstence u těles, která je mají (Saturn). */
  _buildRings() {
    this._rings = [];

    this.list.forEach((body, i) => {
      if (!body.rings) return;

      const [inner, outer] = body.rings;
      const geometry = new THREE.RingGeometry(inner, outer, 256, 1);
      const uniforms = {
        uColor: { value: new THREE.Color(0.86, 0.79, 0.62) },
        uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
        uNormal: { value: new THREE.Vector3(0, 1, 0) },
        uLight: { value: 1 },
        uFade: { value: 1 },
      };
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: RING_VERTEX,
        fragmentShader: RING_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.scale.setScalar(body.radius);
      // prstence leží v rovině rovníku: RingGeometry je v XY, otočit do XZ
      // a naklonit stejně jako osu planety
      mesh.rotation.x = -Math.PI / 2 + body.tilt * DEG;
      mesh.updateMatrix();
      uniforms.uNormal.value.set(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), body.tilt * DEG);

      this.bodies.add(mesh);
      this._rings.push({ mesh, uniforms, index: i, outer: outer * body.radius });
    });
  }

  /**
   * Kružnice drah a prstence znovu. Po smazání tělesa se posunou indexy,
   * na které odkazují, takže je jednodušší je postavit celé znovu (je jich pár).
   */
  _rebuildGuides() {
    for (const { line, geometry, material } of this._orbitLines) {
      line.removeFromParent();
      geometry.dispose();
      material.dispose();
    }
    for (const { mesh } of this._rings) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh.material.dispose();
    }

    this._orbitLines = [];
    for (let i = 0; i < this.count; i++) this._addOrbitLine(i);
    this._buildRings();
  }

  _describeControls() {
    const p = this.params;

    const only = (kind) => () => p.create === kind;
    const materials = (keys) => keys.map((key) => ({ value: key, label: MATERIAL_LOOKS[key].label }));

    return [
      { type: 'heading', label: 'Tvoření' },
      {
        id: 'create', label: 'Kliknutí', type: 'select', raw: true,
        options: [
          { value: 'none', label: 'sleduje těleso' },
          { value: 'planet', label: 'vytvoří planetu' },
          { value: 'moon', label: 'vytvoří měsíc' },
          { value: 'star', label: 'vytvoří hvězdu' },
          { value: 'delete', label: 'smaže těleso' },
        ],
        get: () => p.create,
        set: (v) => { p.create = v; },
      },

      {
        id: 'planetMaterial', label: 'Materiál', type: 'select', raw: true, visible: only('planet'),
        options: materials(PLANET_MATERIALS),
        get: () => p.planetMaterial,
        set: (v) => { p.planetMaterial = v; },
      },
      {
        id: 'planetMass', label: 'Hmotnost (× Země)', min: 0.01, max: 3000, step: 0.01, log: true, visible: only('planet'),
        get: () => p.planetMass,
        set: (v) => { p.planetMass = v; },
      },
      {
        id: 'planetRadius', label: 'Poloměr (× Země)', min: 0.1, max: 25, step: 0.01, log: true, visible: only('planet'),
        get: () => p.planetRadius,
        set: (v) => { p.planetRadius = v; },
      },
      {
        id: 'planetSpeed', label: 'Rychlost oběhu (× Kepler)', min: 0.1, max: 10, step: 0.01, log: true, visible: only('planet'),
        get: () => p.planetSpeed,
        set: (v) => { p.planetSpeed = v; },
      },

      {
        id: 'moonMaterial', label: 'Materiál', type: 'select', raw: true, visible: only('moon'),
        options: materials(MOON_MATERIALS),
        get: () => p.moonMaterial,
        set: (v) => { p.moonMaterial = v; },
      },
      {
        id: 'moonMass', label: 'Hmotnost (× Země)', min: 0.0001, max: 1, step: 0.0001, log: true, visible: only('moon'),
        get: () => p.moonMass,
        set: (v) => { p.moonMass = v; },
      },
      {
        id: 'moonRadius', label: 'Poloměr (× Země)', min: 0.02, max: 2, step: 0.01, log: true, visible: only('moon'),
        get: () => p.moonRadius,
        set: (v) => { p.moonRadius = v; },
      },
      {
        id: 'moonSpeed', label: 'Rychlost oběhu (× Kepler)', min: 0.1, max: 10, step: 0.01, log: true, visible: only('moon'),
        get: () => p.moonSpeed,
        set: (v) => { p.moonSpeed = v; },
      },

      {
        id: 'starMass', label: 'Hmotnost (× Slunce)', min: 0.08, max: 100, step: 0.01, log: true, visible: only('star'),
        get: () => p.starMass,
        set: (v) => { p.starMass = v; },
      },
      {
        id: 'starRadius', label: 'Poloměr (× Slunce)', min: 0.1, max: 100, step: 0.01, log: true, visible: only('star'),
        get: () => p.starRadius,
        set: (v) => { p.starRadius = v; },
      },
      {
        id: 'starTemperature', label: 'Teplota (K)', min: 2500, max: 30000, step: 1, log: true, visible: only('star'),
        get: () => p.starTemperature,
        set: (v) => { p.starTemperature = v; },
      },

      {
        id: 'clearAll', type: 'button', label: 'Smazat všechno', danger: true,
        confirm: 'Opravdu smazat vše?',
        action: () => this.removeAll(),
        message: (count) =>
          `Smazáno ${countBodies(count)}. Obnovení stránky vrátí sluneční soustavu.`,
      },

      { type: 'heading', label: 'Čas a kamera' },
      {
        id: 'speed', label: 'Rychlost (× skutečný čas)', min: 1, max: MAX_SPEED, step: 0.01, log: true,
        get: () => p.speed,
        set: (v) => { p.speed = v; },
      },
      {
        id: 'camera', label: 'Kamera', type: 'select', raw: true,
        options: [
          { value: 'centered', label: 'Na střed' },
          { value: 'detached', label: 'Odpojená (kolečko = let)' },
        ],
        get: () => p.camera,
        set: (v) => { p.camera = v; this.app.setCameraMode(v); },
      },
      { type: 'heading', label: 'Světlo' },
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
        id: 'core', label: 'Jas Slunce', min: 0.2, max: 8, step: 0.05,
        get: () => p.core,
        set: (v) => { p.core = v; this.applyBrightness(); },
      },
      {
        id: 'planetLight', label: 'Osvětlení planet', min: 0, max: 6, step: 0.05,
        get: () => p.planetLight,
        set: (v) => { p.planetLight = v; this._coreUniforms.uPlanetLight.value = v; },
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
        id: 'cutoff', label: 'Práh záře', min: 0, max: 2.5, step: 0.01,
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
    ];
  }

  applyBrightness() {
    this._coreUniforms.uBrightness.value = this.params.core;
    this._haloUniforms.uBrightness.value = this.params.core * 0.4;
  }

  applyAll() {
    for (const control of this.controls) control.set?.(control.get());
    this.applyBrightness();
  }

  update(delta, _elapsed) {
    const p = this.params;

    if (p.animate) {
      this._pulseTime += delta;
      this._days += (delta * p.speed) / SECONDS_PER_DAY;
    }

    const days = this._days;
    const px = this._px;
    const py = this._py;
    const pz = this._pz;

    // polohy ve float64; rodič je v seznamu vždycky dřív než potomek
    for (let i = 0; i < this.count; i++) {
      const parent = this._parent[i];
      if (parent < 0) {
        px[i] = this._fx[i];
        py[i] = this._fy[i];
        pz[i] = this._fz[i];
        continue;
      }

      const angle = this._angle0[i] + this._meanMotion[i] * days;
      const c = Math.cos(angle) * this._a[i];
      const s = Math.sin(angle) * this._a[i];

      px[i] = px[parent] + this._ux[i] * c + this._vx[i] * s;
      py[i] = py[parent] + this._uy[i] * c + this._vy[i] * s;
      pz[i] = pz[parent] + this._uz[i] * c + this._vz[i] * s;
    }

    // Na GPU relativně ke kameře: skupina `bodies` stojí na kameře a tělesa
    // mají polohu vůči ní. Rozdíl velkých čísel se spočítá tady ve float64,
    // na kartu jdou už malá čísla s plnou přesností.
    const camera = this.app.camera.position;
    this.bodies.position.copy(camera);

    for (let i = 0; i < this.count; i++) {
      const o = i * 3;
      this._offsets[o] = px[i] - camera.x;
      this._offsets[o + 1] = py[i] - camera.y;
      this._offsets[o + 2] = pz[i] - camera.z;

      const light = this._lightSource[i];
      this._lights[o] = px[light] - camera.x;
      this._lights[o + 1] = py[light] - camera.y;
      this._lights[o + 2] = pz[light] - camera.z;

      // otočka kolem osy, zkrácená na jednu otáčku ještě ve float64
      this._spins[i * 2] = (this._spinRate[i] * days) % TAU;
    }

    this._offsetAttribute.needsUpdate = true;
    this._lightAttribute.needsUpdate = true;
    this._spinAttribute.needsUpdate = true;

    const beat = 1 + Math.sin(this._pulseTime * 1.6) * p.pulse * 0.22;
    const pixelHeight = this.app.renderer.domElement.height;
    for (const uniforms of [this._coreUniforms, this._haloUniforms]) {
      uniforms.uBeat.value = beat;
      uniforms.uPixelHeight.value = pixelHeight;
    }

    this._updateOrbitLines(camera);
    this._updateRings(camera, pixelHeight);
  }

  _updateOrbitLines(camera) {
    // jak daleko je kamera od toho, na co se dívá – podle toho zmizí dráhy,
    // které jsou vůči pohledu obří a zblízka by jen protínaly obraz
    const viewDistance = camera.distanceTo(this.app.controls.target);

    for (const orbit of this._orbitLines) {
      const parent = orbit.parent;
      orbit.line.position.set(
        this._px[parent] - camera.x,
        this._py[parent] - camera.y,
        this._pz[parent] - camera.z,
      );

      const fade = smoothstep(ORBIT_FADE[0], ORBIT_FADE[1], viewDistance / orbit.radius);
      orbit.material.opacity = ORBIT_OPACITY * fade;
      orbit.line.visible = fade > 0;
    }
  }

  _updateRings(camera, pixelHeight) {
    const toPixels = this.app.camera.projectionMatrix.elements[5] * pixelHeight * 0.5;

    for (const ring of this._rings) {
      const i = ring.index;
      const x = this._px[i] - camera.x;
      const y = this._py[i] - camera.y;
      const z = this._pz[i] - camera.z;
      ring.mesh.position.set(x, y, z);

      // prstence pod pár pixely by blikaly stejně jako vzdálená jádra
      const pixels = (ring.outer * toPixels) / Math.max(Math.hypot(x, y, z), 1e-9);
      const fade = smoothstep(2, 6, pixels);
      ring.mesh.visible = fade > 0;
      ring.uniforms.uFade.value = fade;

      const light = this._lightSource[i];
      ring.uniforms.uSunDirection.value
        .set(this._px[light] - this._px[i], this._py[light] - this._py[i], this._pz[light] - this._pz[i])
        .normalize();
      ring.uniforms.uLight.value = this.params.planetLight;
    }
  }

  /** Kliknutí dělá něco jiného než sledování (tvoří nebo maže). */
  get creating() {
    return this.params.create !== 'none';
  }

  get deleting() {
    return this.params.create === 'delete';
  }

  /**
   * Smaže těleso a všechno, co kolem něj obíhá – měsíc bez planety nemá kolem
   * čeho obíhat. Vrací jména smazaných těles, první je to, na které se kliklo.
   *
   * Pro zápisník takhle mazání zůstat nemůže: smazání tématu nesmí potichu
   * smazat zápisky pod ním. Viz docs/tvoreni.md.
   */
  removeBody(index) {
    if (index < 0 || index >= this.count) return [];

    const removed = new Set([index]);
    // potomek má vždycky vyšší index než rodič, stačí jeden průchod
    for (let i = index + 1; i < this.count; i++) {
      if (removed.has(this._parent[i])) removed.add(i);
    }

    const names = [...removed].map((i) => this.list[i].name);
    this._replaceBodies(this.list.filter((_, i) => !removed.has(i)));
    return names;
  }

  /** Smaže všechno včetně Slunce. Obnovení stránky vrátí sluneční soustavu. */
  removeAll() {
    const count = this.count;
    this._replaceBodies([]);
    return count;
  }

  _replaceBodies(list) {
    this._setBodies(list);
    this._buildInstances();
    this._rebuildGuides();
    this.update(0);
  }

  idOf(index) {
    return this.list[index]?.id;
  }

  indexOfId(id) {
    return this._indexOf.get(id) ?? -1;
  }

  /**
   * Přidá těleso do soustavy. Popis má stejný tvar jako v solarSystem.js.
   * Pole i buffery se postaví znovu – těles je pár, takže je to okamžité.
   * Stávající tělesa si nechají indexy, sledování kamerou tak nepřeskočí.
   */
  addBody(body) {
    this._setBodies([...this.list, body]);
    this._buildInstances();
    this._addOrbitLine(this.count - 1);
    this.update(0);
    return this.count - 1;
  }

  /**
   * Vytvoří těleso tam, kam míří kliknutí.
   * Vrací `{ index, period }`, nebo `{ error }` s vysvětlením pro člověka.
   */
  spawn(clientX, clientY, rect) {
    const camera = this.app.camera;
    camera.updateMatrixWorld();
    this._pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this._raycaster.setFromCamera(this._pointer, camera);
    const ray = this._raycaster.ray;

    if (this.params.create === 'moon') return this._spawnMoon(ray);

    // planety a hvězdy vznikají v rovině ekliptiky, tam kde ji protne paprsek
    const point = ray.intersectPlane(this._spawnPlane.set(UP, 0), new THREE.Vector3());
    if (!point) return { error: 'Klikni do roviny soustavy – teď míříš mimo ni.' };

    return this.params.create === 'star' ? this._spawnStar(point) : this._spawnPlanet(point);
  }

  _spawnPlanet(point) {
    const p = this.params;
    const star = this._nearest(point, (i) => this.list[i].material === 'star');
    if (star < 0) return { error: 'Není kolem čeho obíhat – nejdřív vytvoř hvězdu.' };
    const distance = point.distanceTo(this._positionOf(star));

    if (distance < this._sizes[star] * 2) {
      return { error: `Moc blízko hvězdy ${this.list[star].name} – planeta by shořela.` };
    }

    const look = MATERIAL_LOOKS[p.planetMaterial];
    const n = ++this._created.planet;
    return this._orbit(
      {
        id: `planet-${n}`, name: `Planeta ${n}`, material: p.planetMaterial,
        color: look.color, bands: look.bands,
        mass: p.planetMass * EARTH_MASS, radius: p.planetRadius * EARTH_RADIUS,
        spin: 1, tilt: 0,
      },
      star, point, p.planetSpeed,
    );
  }

  /**
   * Měsíc obíhá planetu, které je paprsek nejblíž, v rovině rovnoběžné
   * s ekliptikou vedenou jejím středem. Planeta ho udrží jen uvnitř své
   * Hillovy sféry – dál by ho k sobě stáhla hvězda.
   */
  _spawnMoon(ray) {
    const p = this.params;
    let planet = -1;
    let best = Infinity;

    for (let i = 0; i < this.count; i++) {
      const parent = this._parent[i];
      if (parent < 0 || this.list[parent].material !== 'star') continue; // jen planety
      const distance = ray.distanceToPoint(this._positionOf(i));
      if (distance < best) {
        best = distance;
        planet = i;
      }
    }
    if (planet < 0) return { error: 'Není kolem čeho obíhat – nejdřív vytvoř planetu.' };

    const center = this._positionOf(planet);
    const point = ray.intersectPlane(this._spawnPlane.set(UP, -center.y), new THREE.Vector3());
    if (!point) return { error: 'Klikni do roviny planety – teď míříš mimo ni.' };

    const name = this.list[planet].name;
    const distance = point.distanceTo(center);
    if (distance < this._sizes[planet] * 1.5) {
      return { error: `Moc blízko tělesa ${name} – měsíc by do něj narazil.` };
    }

    const star = this._parent[planet];
    const hill = this._a[planet] * Math.cbrt(this.list[planet].mass / (3 * this.list[star].mass));
    if (distance > hill) {
      return {
        error: `Tak daleko se u tělesa ${name} měsíc neudrží – musí být do ${formatGm(hill)} (teď ${formatGm(distance)}).`,
      };
    }

    const look = MATERIAL_LOOKS[p.moonMaterial];
    const n = ++this._created.moon;
    return this._orbit(
      {
        id: `moon-${n}`, name: `Měsíc ${n}`, material: p.moonMaterial,
        color: look.color, bands: look.bands,
        mass: p.moonMass * EARTH_MASS, radius: p.moonRadius * EARTH_RADIUS,
        tilt: 0,
      },
      planet, point, p.moonSpeed,
    );
  }

  _spawnStar(point) {
    const p = this.params;
    const n = ++this._created.star;
    const index = this.addBody({
      id: `star-${n}`, name: `Hvězda ${n}`, material: 'star',
      color: kelvinToColor(p.starTemperature),
      mass: p.starMass * SUN_MASS, radius: p.starRadius * SUN_RADIUS,
      spin: 25, tilt: 0,
      position: [point.x, point.y, point.z],
    });
    return { index };
  }

  /**
   * Kruhová dráha kolem rodiče přes bod kliknutí. Oběžná doba z 3. Keplerova
   * zákona, T = 2π √(a³ / G(M + m)), vydělená násobkem rychlosti. Fáze je
   * nastavená tak, aby se těleso objevilo přesně tam, kam se kliklo.
   */
  _orbit(body, parent, point, speed) {
    const center = this._positionOf(parent);
    const dx = point.x - center.x;
    const dz = point.z - center.z;
    const a = Math.hypot(dx, dz);

    const period = (TAU * Math.sqrt(a ** 3 / (G * (this.list[parent].mass + body.mass)))) / speed;
    const angle = Math.atan2(-dz, dx); // stejná rovina jako u prvků s nulovým sklonem a uzlem
    const phase0 = angle - (TAU / period) * this._days;

    const index = this.addBody({
      spin: period, // měsíc bez vlastní rotace je k rodiči natočený pořád stejně
      ...body,
      parent: this.list[parent].id,
      a, period, inclination: 0, node: 0, phase0,
    });
    return { index, period };
  }

  _nearest(point, filter) {
    let best = -1;
    let bestDistance = Infinity;

    for (let i = 0; i < this.count; i++) {
      if (!filter(i)) continue;
      const distance = point.distanceTo(this._positionOf(i));
      if (distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    }
    return best;
  }

  _positionOf(index, target = new THREE.Vector3()) {
    return target.set(this._px[index], this._py[index], this._pz[index]);
  }

  /**
   * Těleso pod kurzorem, nebo -1.
   *
   * Běžný Raycaster tu nejde použít – o poloze těles ví jen shader (aOffset).
   * Polohy ale držíme i na procesoru, takže stačí je promítnout na obrazovku.
   * Kurzor na kouli tělesa vyhrává (z více koulí ta bližší), jinak nejbližší
   * těleso do PICK_TOLERANCE_PX.
   */
  pick(clientX, clientY, rect) {
    const camera = this.app.camera;
    camera.updateMatrixWorld();

    const matrix = this._pickMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const e = matrix.elements;

    const halfW = rect.width / 2;
    const halfH = rect.height / 2;
    const mouseX = clientX - rect.left - halfW;
    const mouseY = halfH - (clientY - rect.top);
    const toPixels = camera.projectionMatrix.elements[5] * halfH;

    let hit = -1;
    let hitDepth = Infinity;
    let near = -1;
    let nearDistance = PICK_TOLERANCE_PX * PICK_TOLERANCE_PX;

    for (let i = 0; i < this.count; i++) {
      const x = this._px[i];
      const y = this._py[i];
      const z = this._pz[i];

      const w = e[3] * x + e[7] * y + e[11] * z + e[15];
      if (w <= camera.near) continue; // za kamerou

      const dx = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / w) * halfW - mouseX;
      const dy = ((e[1] * x + e[5] * y + e[9] * z + e[13]) / w) * halfH - mouseY;
      const distance = dx * dx + dy * dy;
      const radius = (this._sizes[i] * toPixels) / w;

      if (distance <= radius * radius) {
        if (w < hitDepth) {
          hit = i;
          hitDepth = w;
        }
      } else if (distance < nearDistance) {
        near = i;
        nearDistance = distance;
      }
    }

    return hit >= 0 ? hit : near;
  }

  /** Funkce pro kameru: aktuální poloha tělesa, nebo null, když už není. */
  bodyTracker(index) {
    // podle id, ne indexu – po smazání jiného tělesa se indexy posunou
    // a kamera by najednou sledovala něco jiného
    const id = this.list[index].id;
    return (target) => {
      const i = this._indexOf.get(id);
      if (i === undefined) return null;
      return target.set(this._px[i], this._py[i], this._pz[i]);
    };
  }

  /** Odstup kamery, ze kterého je těleso dobře vidět. */
  focusDistance(index) {
    const radius = this._sizes[index];
    return radius * (this._kinds[index] === KIND.star ? FOCUS_STAR_RADII : FOCUS_PLANET_RADII);
  }

  /** Krátký popis tělesa pro štítek. */
  describe(index) {
    return this.list[index].name;
  }

  dispose() {
    this.group.removeFromParent();
    this._orbitLines.forEach(({ geometry, material }) => { geometry.dispose(); material.dispose(); });
    this._rings.forEach(({ mesh }) => { mesh.geometry.dispose(); mesh.material.dispose(); });
    this.cores.geometry.dispose();
    this.halos.geometry.dispose();
    for (const item of this._disposables) item.dispose();
    this._disposables.length = 0;
  }
}

function instanced(source, attributes, count) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(source.index);

  // atributy jednotlivě – sdílený objekt `attributes` by schoval jádra (1.3.0)
  for (const [name, attribute] of Object.entries(source.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  for (const [name, attribute] of Object.entries(attributes)) {
    geometry.setAttribute(name, attribute);
  }

  geometry.instanceCount = count;
  return geometry;
}

function dynamicAttribute(array, size) {
  const attribute = new THREE.InstancedBufferAttribute(array, size);
  attribute.setUsage(THREE.DynamicDrawUsage);
  return attribute;
}

function cloneUniforms(uniforms) {
  return Object.fromEntries(Object.entries(uniforms).map(([key, { value }]) => [key, { value }]));
}

/** „1 těleso", „3 tělesa", „7 těles". */
function countBodies(n) {
  if (n === 1) return '1 těleso';
  if (n >= 2 && n <= 4) return `${n} tělesa`;
  return `${n} těles`;
}

/** Vzdálenost v milionech km, česky. */
function formatGm(value) {
  return `${value.toLocaleString('cs-CZ', { maximumFractionDigits: value < 10 ? 2 : 0 })} mil. km`;
}

/**
 * Barva hvězdy podle povrchové teploty – přibližná křivka černého tělesa
 * (Tanner Helland). Chladné hvězdy oranžovo-červené, Slunce skoro bílé,
 * horké modrobílé. Normalizované tak, aby nejsilnější složka byla 1.
 */
function kelvinToColor(kelvin) {
  const t = kelvin / 100;
  let r;
  let g;
  let b;

  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }

  const rgb = [r, g, b].map((c) => Math.min(Math.max(c, 0), 255) / 255);
  const max = Math.max(...rgb);
  return rgb.map((c) => c / max);
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

// Otočení bodu na kouli do soustavy tělesa: nejdřív sklon osy (kolem X),
// pak otočka kolem osy (kolem Y). Povrch se kreslí z téhle polohy, takže
// se s tělesem otáčí a pásy i ledové čepičky sedí na jeho skloněné ose.
const BODY_FRAME = `
vec3 toBodyFrame(vec3 p, float spin, float tilt) {
  float ct = cos(tilt);
  float st = sin(tilt);
  p = vec3(p.x, ct * p.y + st * p.z, -st * p.y + ct * p.z);

  float cs = cos(spin);
  float ss = sin(spin);
  return vec3(cs * p.x - ss * p.z, p.y, ss * p.x + cs * p.z);
}
`;

// Jádro menší než pár pixelů by rasterizér podle pohybu kamery trefoval
// a míjel a tělesa by blikala. Zmenšit a ztlumit (jako halo) nejde, jádro je
// neprůhledné a zakrylo by záři okolí. Pod hranicí se proto nekreslí vůbec
// a těleso zastoupí halo. Podrobně v docs/instancing.md.
//
// Všechno je relativní ke kameře: aOffset, aLight i vRel jsou polohy vůči
// skupině `bodies`, která stojí na kameře.
const CORE_VERTEX = `
attribute vec3 aOffset;
attribute vec3 aLight;
attribute vec2 aSpin;
attribute vec3 aTint;
attribute float aSize;
attribute float aKind;
attribute vec3 aLightColor;
attribute vec2 aSurface;
uniform float uBeat;
uniform float uPixelHeight;
varying vec3 vTint;
varying vec3 vNormal;
varying vec3 vRel;
varying vec3 vBody;
varying vec3 vLight;
varying vec3 vLightColor;
varying vec2 vSurface;
varying float vKind;
varying float vSeed;

const float MIN_CORE_PIXELS = ${MIN_CORE_PIXELS.toFixed(2)};

${BODY_FRAME}

void main() {
  vTint = aTint;
  vKind = aKind;
  vLightColor = aLightColor;
  vSurface = aSurface;
  vSeed = mod(float(gl_InstanceID), 997.0) * 1.618;

  // tep jen u hvězd – planeta, která se nafukuje, by vypadala divně
  float scale = aSize * (aKind < 0.5 ? uBeat : 1.0);
  vec4 center = modelViewMatrix * vec4(aOffset, 1.0);
  float depth = max(-center.z, 1e-9);
  float pixels = scale * projectionMatrix[1][1] / depth * uPixelHeight * 0.5;

  float visible = step(MIN_CORE_PIXELS, pixels);
  vec3 local = position * (scale * visible) + aOffset;

  vNormal = normal;
  vBody = toBodyFrame(position, aSpin.x, aSpin.y);
  vRel = local;
  vLight = aLight;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
}
`;

// Hvězda svítí sama (s okrajovým ztemněním, jako skutečné Slunce).
// Planetu osvětluje její hvězda: difúzní složka, lesk podle materiálu
// a povrch ze šumu nad polohou na kouli – žádné textury.
const CORE_FRAGMENT = `
uniform float uBrightness;
uniform float uPlanetLight;
uniform vec3 uCameraOffset;
varying vec3 vTint;
varying vec3 vNormal;
varying vec3 vRel;
varying vec3 vBody;
varying vec3 vLight;
varying vec3 vLightColor;
varying vec2 vSurface;
varying float vKind;
varying float vSeed;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
        mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
        mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraOffset - vRel);

  if (vKind < 0.5) {
    // okrajové ztemnění: ke kraji kotouče se díváme šikmo do chladnějších vrstev
    float mu = max(dot(N, V), 0.0);
    gl_FragColor = vec4(vTint * uBrightness * (0.55 + 0.45 * mu), 1.0);
    return;
  }

  vec3 L = normalize(vLight - vRel);
  vec3 H = normalize(L + V);

  float diffuse = max(dot(N, L), 0.0);
  vec3 p = vBody * 2.6 + vSeed;
  float n = fbm(p);

  vec3 albedo;
  float specStrength = 0.0;
  float shininess = 16.0;
  vec3 extra = vec3(0.0);

  if (vKind < 1.5) {
    // kámen: nerovnoměrně tmavší a světlejší plochy
    albedo = vTint * (0.7 + 0.6 * n);
    specStrength = 0.05;
  } else if (vKind < 2.5) {
    // tráva: zelené pevniny, mezi nimi hnědá půda
    float land = smoothstep(0.44, 0.56, n);
    albedo = mix(vec3(0.32, 0.24, 0.13), vTint * (0.8 + 0.4 * n), land);
    specStrength = 0.04;
  } else if (vKind < 3.5) {
    // železo: kov s ostrým odleskem, místy rez
    float rust = smoothstep(0.52, 0.72, fbm(p * 1.7 + 11.0));
    albedo = mix(vTint, vec3(0.42, 0.19, 0.09), rust * 0.7);
    specStrength = mix(0.9, 0.12, rust);
    shininess = 64.0;
  } else if (vKind < 4.5) {
    // voda: hluboká modrá, odlesk hvězdy a jemný okraj proti světlu
    albedo = vTint * (0.85 + 0.3 * n);
    specStrength = 0.75;
    shininess = 96.0;
    extra = vec3(0.05, 0.11, 0.2) * pow(1.0 - max(dot(N, V), 0.0), 3.0) * diffuse;
  } else if (vKind < 5.5) {
    // plyn: pásy podle zeměpisné šířky, rozvlněné šumem
    float turbulence = fbm(p * 1.5) - 0.5;
    float bands = sin((vBody.y + turbulence * 0.12) * vSurface.y);
    albedo = vTint * (1.0 + bands * vSurface.x + (n - 0.5) * vSurface.x * 0.5);
    specStrength = 0.02;
  } else {
    // Země: oceán, pevniny, ledové čepičky a mraky
    float land = smoothstep(0.5, 0.54, n);
    float dry = smoothstep(0.55, 0.72, fbm(p * 2.0 + 5.0));
    vec3 ground = mix(vec3(0.2, 0.36, 0.13), vec3(0.47, 0.39, 0.25), dry);
    albedo = mix(vec3(0.03, 0.1, 0.3), ground, land);

    float ice = smoothstep(0.8, 0.9, abs(vBody.y) + (n - 0.5) * 0.25);
    albedo = mix(albedo, vec3(0.92), ice);

    float cloud = smoothstep(0.56, 0.78, fbm(p * 1.6 + 23.0));
    albedo = mix(albedo, vec3(0.96), cloud * 0.7);

    specStrength = 0.6 * (1.0 - land) * (1.0 - ice) * (1.0 - cloud);
    shininess = 80.0;
  }

  float specular = specStrength * pow(max(dot(N, H), 0.0), shininess) * step(0.0, dot(N, L));
  vec3 color = (albedo * (diffuse + 0.03) + specular + extra) * vLightColor;

  gl_FragColor = vec4(color * uPlanetLight, 1.0);
}
`;

// Placka otočená k obrazovce – billboard se dělá tady, ne na procesoru.
const HALO_VERTEX = `
attribute vec3 aOffset;
attribute vec3 aTint;
attribute float aSize;
attribute float aKind;
uniform float uBeat;
uniform float uPixelHeight;
varying vec2 vLocal;
varying vec3 vTint;
varying float vDim;
varying float vGlow;
varying float vMarker;

// Pod určitou velikost se halo nezmenší – rasterizér by ho podle pohybu kamery
// náhodně trefoval a míjel a tělesa by zdálky blikala. Viz docs/instancing.md.
const float MIN_PIXELS = 10.0;
const float HALO_RATIO = ${HALO_RATIO.toFixed(1)};
const float MIN_CORE_PIXELS = ${MIN_CORE_PIXELS.toFixed(2)};

// Planeta sama nesvítí. Zdálky, kde se její koule nedá vykreslit, z ní zbude
// tečka v barvě materiálu; zblízka ji převezme osvětlená koule.
const float PLANET_GLOW = 0.35;

// Kolik jasu smí vzdálené těleso ztratit, když se jeho halo drží na minimu.
// V roji tisíců hvězd se jas ubíral úměrně ploše, jinak by splynuly v bílou
// skvrnu. Tady je těles pár a slouží jako značky – ve skutečném měřítku by
// planety zdálky vůbec nebyly vidět a nešlo by na ně kliknout.
const float MARKER_MIN_DIM = 1.0;

void main() {
  vLocal = position.xy;
  vTint = aTint;

  float scale = aSize * HALO_RATIO * (aKind < 0.5 ? uBeat : 1.0);
  vec4 viewPosition = modelViewMatrix * vec4(aOffset, 1.0);
  float depth = max(-viewPosition.z, 1e-9);
  float pixels = scale * projectionMatrix[1][1] / depth * uPixelHeight * 0.5;

  float boost = max(MIN_PIXELS / max(pixels, 1e-9), 1.0);

  // 0 = skutečná záře, 1 = značka; přechod, když je těleso 1–2× pod minimem
  vMarker = smoothstep(1.0, 2.0, boost);

  float corePixels = pixels / HALO_RATIO;
  vGlow = aKind > 0.5
    ? mix(PLANET_GLOW, 1.0, vMarker) * (1.0 - smoothstep(MIN_CORE_PIXELS, MIN_CORE_PIXELS * 2.0, corePixels))
    : 1.0;

  vDim = max(1.0 / (boost * boost), MARKER_MIN_DIM);

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
varying float vGlow;
varying float vMarker;

// Značka vzdáleného tělesa: měkká tečka o pevné velikosti v pixelech.
// Fyzikální záře má tak ostrý vrchol, že se zdálky vejde pod jeden pixel
// a planeta by z obrazu zmizela. Placka má ve stavu značky poloměr
// MIN_PIXELS, takže r × MIN_PIXELS je vzdálenost od středu v pixelech.
const float MIN_PIXELS = 10.0;
const float MARKER_RADIUS_PX = 1.6;
const float MARKER_BRIGHTNESS = 1.5;

void main() {
  if (vGlow <= 0.0) discard;

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

  float markerPx = r * MIN_PIXELS / MARKER_RADIUS_PX;
  float marker = exp(-markerPx * markerPx) * MARKER_BRIGHTNESS;
  intensity = mix(intensity, marker, vMarker);

  gl_FragColor = vec4(vTint * uBrightness * intensity * vDim * vGlow, 1.0);
}
`;

// Prstence: hustota podle vzdálenosti od planety (v jejích poloměrech) –
// kruh C, hustý kruh B, Cassiniho dělení a kruh A. Osvětlené Sluncem podle
// toho, jak šikmo na ně svítí.
const RING_VERTEX = `
varying vec2 vRing;

void main() {
  vRing = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RING_FRAGMENT = `
uniform vec3 uColor;
uniform vec3 uSunDirection;
uniform vec3 uNormal;
uniform float uLight;
uniform float uFade;
varying vec2 vRing;

float band(float r, float from, float to) {
  return smoothstep(from, from + 0.015, r) * (1.0 - smoothstep(to - 0.015, to, r));
}

void main() {
  float r = length(vRing);

  float density =
      band(r, 1.239, 1.525) * 0.3    // C
    + band(r, 1.525, 1.95) * 0.95    // B
    + band(r, 2.025, 2.27) * 0.7;    // A (mezi B a A je Cassiniho dělení)

  // jemné kroužky uvnitř kruhů
  density *= 0.78 + 0.22 * sin(r * 190.0) * sin(r * 71.0);

  float lit = 0.25 + 0.75 * abs(dot(uNormal, uSunDirection));
  gl_FragColor = vec4(uColor * lit * uLight * 0.6, density * uFade);
}
`;
