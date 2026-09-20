import * as THREE from 'three';

const MAX_ORBS = 10000;

/**
 * Roj světelných koulí obíhajících střed.
 *
 * Kapacita je naalokovaná na maximum hned při startu a slider hýbe jen
 * `InstancedMesh.count` – posuvník je tím okamžitý, nic se při tažení nestaví znovu.
 * Podrobnosti v docs/instancing.md.
 */
export class MainScene {
  constructor(app) {
    this.app = app;

    this.params = {
      color: '#ffd7a3',
      core: 1.8,
      size: 0.85,
      count: 1,
      orbit: 14, // poloměr oběhu
      orbitSpeed: 0.6,
      power: 220,
      reach: 30,
      glow: 0.85,
      spread: 0.55, // rozptyl záře (bloom)
      cutoff: 0.28,
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
    this._matrix = new THREE.Matrix4();
    this._position = new THREE.Vector3();
    this._coreScale = new THREE.Vector3();
    this._haloScale = new THREE.Vector3();
    this._noRotation = new THREE.Quaternion();

    this._buildOrbits();
    this._buildSwarm();
    this._buildFloor();

    this.controls = this._describeControls();
    this.applyAll();
  }

  _track(...objects) {
    this._disposables.push(...objects);
  }

  /**
   * Dráhy se spočítají jednou pro celou kapacitu. Každá koule má vlastní rovinu
   * oběhu (dvojice kolmých vektorů u, v), poloměr a fázi – za běhu pak stačí
   * u*cos(a) + v*sin(a), nic dražšího.
   */
  _buildOrbits() {
    this._ux = new Float32Array(MAX_ORBS);
    this._uy = new Float32Array(MAX_ORBS);
    this._uz = new Float32Array(MAX_ORBS);
    this._vx = new Float32Array(MAX_ORBS);
    this._vy = new Float32Array(MAX_ORBS);
    this._vz = new Float32Array(MAX_ORBS);
    this._radius = new Float32Array(MAX_ORBS);
    this._angularSpeed = new Float32Array(MAX_ORBS);
    this._phase = new Float32Array(MAX_ORBS);

    const golden = Math.PI * (3 - Math.sqrt(5));
    const u = new THREE.Vector3();
    const v = new THREE.Vector3();
    const axis = new THREE.Vector3();

    for (let i = 0; i < MAX_ORBS; i++) {
      // rovnoměrné rozmístění směrů po kouli (Fibonacciho spirála)
      const y = 1 - (i / (MAX_ORBS - 1)) * 2;
      const ring = Math.sqrt(Math.max(1 - y * y, 0));
      const theta = golden * i;
      u.set(Math.cos(theta) * ring, y, Math.sin(theta) * ring).normalize();

      // kolmý vektor, spolu s u určuje rovinu oběhu
      axis.set(0, 1, 0);
      if (Math.abs(u.y) > 0.95) axis.set(1, 0, 0);
      v.crossVectors(u, axis).normalize();

      // třetí odmocnina = koule se plní rovnoměrně, ne jen skořápka
      const normalized = i === 0 ? 0 : Math.cbrt((i + 0.5) / MAX_ORBS);

      this._ux[i] = u.x;
      this._uy[i] = u.y;
      this._uz[i] = u.z;
      this._vx[i] = v.x;
      this._vy[i] = v.y;
      this._vz[i] = v.z;
      this._radius[i] = normalized;
      this._angularSpeed[i] = 1 / Math.sqrt(Math.max(normalized, 0.08)); // blíž = rychleji
      this._phase[i] = (i * 2.39996) % (Math.PI * 2);
    }
  }

  _buildSwarm() {
    const coreMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
    this._track(coreMaterial);

    this.cores = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), coreMaterial, MAX_ORBS);
    this.cores.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cores.frustumCulled = false;
    this.group.add(this.cores);

    const haloTexture = createRadialTexture();
    const haloGeometry = new THREE.PlaneGeometry(1, 1);
    const haloMaterial = new THREE.MeshBasicMaterial({
      map: haloTexture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    });
    this._track(haloTexture, haloGeometry, haloMaterial);

    this.halos = new THREE.InstancedMesh(haloGeometry, haloMaterial, MAX_ORBS);
    this.halos.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 1;
    this.group.add(this.halos);

    // Jedno skutečné světlo na střed roje. Deset tisíc bodových světel WebGL
    // neutáhne (limit jsou jednotky až desítky), záře koulí je proto jen vizuál.
    this.light = new THREE.PointLight(0xffffff, 1, 10, 2);
    this.group.add(this.light);
  }

  /** Míň trojúhelníků na kouli, když jich je na scéně hodně. */
  _setDetail(count) {
    const detail =
      count <= 32 ? [48, 32] : count <= 256 ? [24, 16] : count <= 2000 ? [12, 8] : [8, 6];

    if (this._detail && this._detail[0] === detail[0]) return;

    this._detail = detail;
    this.cores.geometry.dispose();
    this.cores.geometry = new THREE.SphereGeometry(1, detail[0], detail[1]);
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
        id: 'count', label: 'Počet koulí', min: 1, max: MAX_ORBS, step: 1,
        get: () => p.count,
        set: (v) => {
          p.count = Math.round(v);
          this._setDetail(p.count);
        },
      },
      {
        id: 'orbit', label: 'Poloměr oběhu', min: 0, max: 200, step: 0.5,
        get: () => p.orbit,
        set: (v) => { p.orbit = v; },
      },
      {
        id: 'orbitSpeed', label: 'Rychlost oběhu', min: 0, max: 3, step: 0.01,
        get: () => p.orbitSpeed,
        set: (v) => { p.orbitSpeed = v; },
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
        id: 'size', label: 'Velikost', min: 0.02, max: 3, step: 0.01,
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

    this.cores.material.color.copy(this._color).multiplyScalar(core);
    this.halos.material.color.copy(this._color).multiplyScalar(Math.min(core * 0.35, 1.3));
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

    this._coreScale.setScalar(p.size * beat);
    this._haloScale.setScalar(p.size * beat * 3.4);

    const facing = this.app.camera.quaternion; // halo je placka, musí koukat na kameru
    const position = this._position;
    const matrix = this._matrix;

    for (let i = 0; i < count; i++) {
      const angle = this._orbitTime * this._angularSpeed[i] + this._phase[i];
      const radius = this._radius[i] * p.orbit;
      const c = Math.cos(angle) * radius;
      const s = Math.sin(angle) * radius;

      position.set(
        this._ux[i] * c + this._vx[i] * s,
        this._uy[i] * c + this._vy[i] * s,
        this._uz[i] * c + this._vz[i] * s,
      );

      matrix.compose(position, this._noRotation, this._coreScale);
      this.cores.setMatrixAt(i, matrix);

      matrix.compose(position, facing, this._haloScale);
      this.halos.setMatrixAt(i, matrix);
    }

    this.cores.count = count;
    this.halos.count = count;
    this.cores.instanceMatrix.needsUpdate = true;
    this.halos.instanceMatrix.needsUpdate = true;

    this.light.intensity = p.power * beat;
  }

  dispose() {
    this.group.removeFromParent();
    this.cores.geometry.dispose();
    this.cores.dispose();
    this.halos.dispose();
    for (const item of this._disposables) item.dispose();
    this._disposables.length = 0;
  }
}

/** Měkký kruhový přechod pro halo kolem koule. */
function createRadialTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);

  gradient.addColorStop(0.0, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(0.14, 'rgba(255,255,255,0.22)');
  gradient.addColorStop(0.38, 'rgba(255,255,255,0.055)');
  gradient.addColorStop(1.0, 'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
