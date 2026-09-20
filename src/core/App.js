import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createStudioEnvironment } from './environment.js';

const MAX_PIXEL_RATIO = 2;
const MAX_DELTA = 0.1; // pojistka proti skoku po návratu na zapnutou záložku
const BASE_FOV = 42;
const BASE_ASPECT = 16 / 9;
const MAX_FOV = 72;

/**
 * Renderer + scéna + kamera + smyčka. Obsah scény sem nepatří,
 * ten se přidává přes `app.scene.add(...)` a `app.onUpdate(...)`.
 */
export class App {
  constructor(canvas, options = {}) {
    const {
      background = 0x0a0c11,
      fog = { color: 0x0a0c11, near: 16, far: 58 },
      cameraPosition = [7.5, 5.5, 9.5],
      cameraTarget = [0, 0.8, 0],
      environment = true,
    } = options;

    this.canvas = canvas;
    this.updaters = new Set();
    this.running = false;
    this.fps = 0;

    this._fpsTime = 0;
    this._fpsFrames = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(background);
    if (fog) this.scene.fog = new THREE.Fog(fog.color, fog.near, fog.far);
    if (environment) this.scene.environment = createStudioEnvironment(this.renderer);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.camera.position.set(...cameraPosition);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(...cameraTarget);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 30;
    this.controls.maxPolarAngle = Math.PI * 0.495; // nedovolí podjet pod podlahu
    this.controls.update();

    this._home = {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
    };

    this.clock = new THREE.Clock();

    this._onResize = () => this.resize();
    this._onContextLost = (event) => {
      event.preventDefault();
      this.stop();
      console.warn('[strnote] WebGL kontext ztracen');
    };
    this._onContextRestored = () => {
      console.info('[strnote] WebGL kontext obnoven');
      this.resize();
      this.start();
    };

    window.addEventListener('resize', this._onResize);
    canvas.addEventListener('webglcontextlost', this._onContextLost);
    canvas.addEventListener('webglcontextrestored', this._onContextRestored);

    this.resize();
  }

  /** Zaregistruje callback volaný každý snímek: (delta, elapsed) => void. Vrací odhlašovací funkci. */
  onUpdate(fn) {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;

    const aspect = width / Math.max(height, 1);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.setSize(width, height, false);

    this.camera.aspect = aspect;
    // na úzkých displejích rozšíříme FOV, aby scéna zůstala vodorovně v záběru
    this.camera.fov =
      aspect >= BASE_ASPECT
        ? BASE_FOV
        : Math.min(
            MAX_FOV,
            THREE.MathUtils.radToDeg(
              2 * Math.atan((Math.tan(THREE.MathUtils.degToRad(BASE_FOV) / 2) * BASE_ASPECT) / aspect),
            ),
          );
    this.camera.updateProjectionMatrix();
  }

  resetView() {
    this.camera.position.copy(this._home.position);
    this.controls.target.copy(this._home.target);
    this.controls.update();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    this.renderer.setAnimationLoop(this._tick);
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  _tick = () => {
    const delta = Math.min(this.clock.getDelta(), MAX_DELTA);
    const elapsed = this.clock.elapsedTime;

    this._fpsTime += delta;
    this._fpsFrames += 1;
    if (this._fpsTime >= 0.4) {
      this.fps = this._fpsFrames / this._fpsTime;
      this._fpsTime = 0;
      this._fpsFrames = 0;
    }

    this.controls.update();
    for (const fn of this.updaters) fn(delta, elapsed);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.stop();
    this.updaters.clear();
    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('webglcontextlost', this._onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this._onContextRestored);
    this.controls.dispose();
    this.scene.environment?.dispose?.();
    this.renderer.dispose();
  }
}
