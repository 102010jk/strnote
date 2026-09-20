import * as THREE from 'three';

/**
 * Koule světla uprostřed scény.
 * Všechno, co na ní jde nastavit, je vypsané v `this.controls` – z toho si HUD
 * sám postaví panel, takže přidat další slider znamená přidat sem jednu položku.
 */
export class MainScene {
  constructor(app) {
    this.app = app;

    this.params = {
      color: '#ffd7a3',
      core: 1.8,      // jas jádra
      size: 0.85,     // poloměr koule
      power: 220,     // síla svícení do okolí
      reach: 30,      // dosah svícení
      glow: 0.85,     // síla záře (bloom)
      spread: 0.55,   // rozptyl záře
      cutoff: 0.28,   // od jaké svítivosti záře začíná
      pulse: 0.25,    // tep
      exposure: 1.05,
      floor: true,
      animate: true,
    };

    this.group = new THREE.Group();
    this._disposables = [];
    this._time = 0;
    this._color = new THREE.Color();

    this._buildOrb();
    this._buildFloor();

    this.controls = this._describeControls();
    this.applyAll();
  }

  _track(...objects) {
    this._disposables.push(...objects);
  }

  _buildOrb() {
    const geometry = new THREE.SphereGeometry(1, 64, 48);
    const material = new THREE.MeshBasicMaterial({ toneMapped: false });
    this._track(geometry, material);

    this.core = new THREE.Mesh(geometry, material);
    this.group.add(this.core);

    const haloTexture = createRadialTexture();
    const haloMaterial = new THREE.SpriteMaterial({
      map: haloTexture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    });
    this._track(haloTexture, haloMaterial);

    this.halo = new THREE.Sprite(haloMaterial);
    this.group.add(this.halo);

    this.light = new THREE.PointLight(0xffffff, 1, 10, 2);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
    this.light.shadow.bias = -0.002;
    this.group.add(this.light);
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
    this.floor.receiveShadow = true;
    this.group.add(this.floor);
  }

  /** Popis ovládání – HUD z toho generuje panel. */
  _describeControls() {
    const p = this.params;

    return [
      { id: 'color', label: 'Barva', type: 'color',
        get: () => p.color, set: (v) => { p.color = v; this.applyColor(); } },

      { id: 'core', label: 'Jas jádra', min: 0.2, max: 8, step: 0.05,
        get: () => p.core, set: (v) => { p.core = v; this.applyColor(); } },

      { id: 'size', label: 'Velikost', min: 0.15, max: 3, step: 0.01,
        get: () => p.size, set: (v) => { p.size = v; } },

      { id: 'power', label: 'Síla svícení', min: 0, max: 800, step: 5,
        get: () => p.power, set: (v) => { p.power = v; } },

      { id: 'reach', label: 'Dosah', min: 2, max: 80, step: 0.5,
        get: () => p.reach, set: (v) => { p.reach = v; this.light.distance = v; } },

      { id: 'glow', label: 'Záře', min: 0, max: 3, step: 0.01,
        get: () => p.glow, set: (v) => { p.glow = v; this.app.bloom.strength = v; } },

      { id: 'spread', label: 'Rozptyl záře', min: 0, max: 1.5, step: 0.01,
        get: () => p.spread, set: (v) => { p.spread = v; this.app.bloom.radius = v; } },

      { id: 'cutoff', label: 'Práh záře', min: 0, max: 1, step: 0.01,
        get: () => p.cutoff, set: (v) => { p.cutoff = v; this.app.bloom.threshold = v; } },

      { id: 'pulse', label: 'Tep', min: 0, max: 1, step: 0.01,
        get: () => p.pulse, set: (v) => { p.pulse = v; } },

      { id: 'exposure', label: 'Expozice', min: 0.2, max: 2.5, step: 0.01,
        get: () => p.exposure, set: (v) => { p.exposure = v; this.app.renderer.toneMappingExposure = v; } },

      { id: 'floor', label: 'Podlaha', type: 'toggle',
        get: () => p.floor, set: (v) => { p.floor = v; this.floor.visible = v; } },
    ];
  }

  applyColor() {
    const { color, core } = this.params;
    this._color.set(color);

    this.core.material.color.copy(this._color).multiplyScalar(core);
    this.halo.material.color.copy(this._color).multiplyScalar(Math.min(core * 0.35, 1.3));
    this.light.color.set(color);
  }

  /** Nacpe všechny hodnoty z params tam, kam patří (po startu i po resetu). */
  applyAll() {
    for (const control of this.controls) control.set(control.get());
    this.applyColor();
  }

  update(delta, _elapsed) {
    if (this.params.animate) this._time += delta;

    const { size, power, pulse } = this.params;
    const beat = 1 + Math.sin(this._time * 1.6) * pulse * 0.22;

    this.core.scale.setScalar(size * beat);
    this.halo.scale.setScalar(size * beat * 3.4);
    this.light.intensity = power * beat;
  }

  dispose() {
    this.group.removeFromParent();
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

  gradient.addColorStop(0.00, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(0.14, 'rgba(255,255,255,0.22)');
  gradient.addColorStop(0.38, 'rgba(255,255,255,0.055)');
  gradient.addColorStop(1.00, 'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
