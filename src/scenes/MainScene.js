import * as THREE from 'three';

const GRID = 32;          // GRID × GRID sloupků
const SPACING = 0.46;
const COLUMN = 0.26;      // půdorys sloupku

/**
 * Obsah scény. Tohle je soubor, který se při stavbě něčeho vlastního přepisuje —
 * App.js a environment.js můžou zůstat, jak jsou.
 */
export class MainScene {
  constructor() {
    this.group = new THREE.Group();
    this.params = { animate: true, amplitude: 0.55, speed: 1 };

    this._disposables = [];
    this._dummy = new THREE.Object3D();
    this._time = 0;

    this._buildLights();
    this._buildGround();
    this._buildField();
    this._buildHero();

    this.update(0, 0); // první rozložení, ať není prázdný první snímek
  }

  _track(...objects) {
    this._disposables.push(...objects);
  }

  _buildLights() {
    const hemi = new THREE.HemisphereLight(0x9ec4ff, 0x090b10, 0.45);
    this.group.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(6, 11, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;

    const d = 11;
    key.shadow.camera.left = -d;
    key.shadow.camera.right = d;
    key.shadow.camera.top = d;
    key.shadow.camera.bottom = -d;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 32;
    this.group.add(key);

    const rim = new THREE.PointLight(0xff7a45, 40, 26, 2);
    rim.position.set(-6, 2.5, -5);
    this.group.add(rim);
  }

  _buildGround() {
    const geometry = new THREE.CircleGeometry(17, 96);
    const material = new THREE.MeshStandardMaterial({
      color: 0x0d1017,
      roughness: 0.82,
      metalness: 0.15,
    });
    this._track(geometry, material);

    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  _buildField() {
    const geometry = new THREE.BoxGeometry(COLUMN, 1, COLUMN);
    geometry.translate(0, 0.5, 0); // pivot na spodek, aby sloupek rostl nahoru

    const material = new THREE.MeshStandardMaterial({
      roughness: 0.28,
      metalness: 0.65,
    });
    this._track(geometry, material);

    const count = GRID * GRID;
    const field = new THREE.InstancedMesh(geometry, material, count);
    field.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    field.castShadow = true;
    field.receiveShadow = true;
    field.frustumCulled = false; // pole je vždy v záběru, culling by jen počítal bounding sphere

    const near = new THREE.Color(0x6aa9ff);
    const far = new THREE.Color(0x121a2b);
    const color = new THREE.Color();

    this._cells = new Array(count);
    const offset = ((GRID - 1) * SPACING) / 2;

    for (let i = 0, x = 0; x < GRID; x++) {
      for (let z = 0; z < GRID; z++, i++) {
        const px = x * SPACING - offset;
        const pz = z * SPACING - offset;
        const distance = Math.hypot(px, pz);

        this._cells[i] = { x: px, z: pz, distance };

        color.copy(near).lerp(far, Math.min(distance / 8, 1));
        field.setColorAt(i, color);
      }
    }

    field.instanceColor.needsUpdate = true;
    this.field = field;
    this.group.add(field);
  }

  _buildHero() {
    const geometry = new THREE.TorusKnotGeometry(1.05, 0.31, 220, 32);
    const material = new THREE.MeshStandardMaterial({
      color: 0xf2f5ff,
      roughness: 0.12,
      metalness: 1,
    });
    this._track(geometry, material);

    const hero = new THREE.Mesh(geometry, material);
    hero.position.set(0, 3.4, 0);
    hero.castShadow = true;
    this.hero = hero;
    this.group.add(hero);
  }

  update(delta, _elapsed) {
    if (this.params.animate) this._time += delta * this.params.speed;
    const t = this._time;

    const dummy = this._dummy;
    const amplitude = this.params.amplitude;

    for (let i = 0; i < this._cells.length; i++) {
      const cell = this._cells[i];
      const wave =
        Math.sin(cell.distance * 1.15 - t * 1.9) * 0.6 +
        Math.sin(cell.x * 0.6 + t * 0.8) * 0.25 +
        Math.cos(cell.z * 0.55 - t * 0.6) * 0.25;

      const height = 0.12 + Math.max(wave * amplitude + 0.35, 0.02);

      dummy.position.set(cell.x, 0, cell.z);
      dummy.scale.set(1, height, 1);
      dummy.updateMatrix();
      this.field.setMatrixAt(i, dummy.matrix);
    }

    this.field.instanceMatrix.needsUpdate = true;

    this.hero.rotation.x = t * 0.32;
    this.hero.rotation.y = t * 0.45;
    this.hero.position.y = 3.4 + Math.sin(t * 0.9) * 0.22;
  }

  dispose() {
    this.group.removeFromParent();
    this.field.dispose();
    for (const item of this._disposables) item.dispose();
    this._disposables.length = 0;
  }
}
