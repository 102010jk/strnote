import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createStudioEnvironment } from './environment.js';

const MAX_PIXEL_RATIO = 2;
const MAX_DELTA = 0.1; // pojistka proti skoku po návratu na zapnutou záložku
const BASE_FOV = 42;
const BASE_ASPECT = 16 / 9;
const MAX_FOV = 72;

// Let v odpojeném režimu: jedno cvaknutí kolečka posune kameru celkem
// o FLY_STEP násobek vzdálenosti od bodu otáčení, s doběhem jako otáčení.
const FLY_STEP = 0.15;
const FLY_DAMPING = 6; // čím víc, tím kratší doběh

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
      bloom = { strength: 1.15, radius: 0.55, threshold: 0.15 },
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

    // composer renderuje víc průchodů za snímek; bez tohohle by statistiky
    // ukazovaly jen ten poslední (fullscreen quad = 1 draw)
    this.renderer.info.autoReset = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(background);
    if (fog) this.scene.fog = new THREE.Fog(fog.color, fog.near, fog.far);
    if (environment) this.scene.environment = createStudioEnvironment(this.renderer);

    // near/far se přepočítávají za běhu podle vzdálenosti kamery (viz _updateClipping)
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.camera.position.set(...cameraPosition);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(...cameraTarget);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.screenSpacePanning = true;
    this.controls.enablePan = false;
    this.cameraMode = 'centered';

    this._flyVelocity = 0;
    this._forward = new THREE.Vector3();

    // nekonečný zoom: OrbitControls přibližuje násobením, takže bez limitů
    // jde plynule od milimetrů po kilometry
    this.controls.minDistance = 1e-4;
    this.controls.maxDistance = Infinity;
    this.controls.zoomSpeed = 1.2;
    this.controls.update();

    this._home = {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
    };

    // bloom – bez něj koule světla vypadá jako obyčejná bílá kulička
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      bloom.strength,
      bloom.radius,
      bloom.threshold,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

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

    this._onWheel = (event) => this._handleWheel(event);

    window.addEventListener('resize', this._onResize);
    // passive: false, jinak nejde zastavit výchozí chování kolečka
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
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

    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.composer?.setPixelRatio(pixelRatio);
    this.composer?.setSize(width, height);

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

  /**
   * 'centered'  – kamera krouží kolem pevného středu, posouvat nejde
   * 'detached'  – střed otáčení se dá posunout, kamera je volná
   */
  setCameraMode(mode) {
    this.cameraMode = mode;
    this.controls.enablePan = mode === 'detached';

    // odpojená kamera kolečkem letí, nepřibližuje – zoom by jen dojížděl k bodu
    this.controls.enableZoom = mode !== 'detached';
    this._flyVelocity = 0;

    // návrat na střed: odpojená kamera mohla odjet kamkoliv
    if (mode === 'centered') {
      this.controls.target.copy(this._home.target);
      this.controls.update();
    }
  }

  /** Kolečko v odpojeném režimu: rozjet kameru dopředu nebo dozadu. */
  _handleWheel(event) {
    if (this.cameraMode !== 'detached') return; // na střed zoomuje OrbitControls

    event.preventDefault();

    // myš posílá ~100 na cvaknutí, touchpad spoustu malých hodnot – srovnat
    const scale = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 600 : 1;
    const notches = Math.max(-3, Math.min(3, (event.deltaY * scale) / 100));

    // rychlost odvozená od vzdálenosti drží let použitelný v každém měřítku
    const distance = this.camera.position.distanceTo(this.controls.target);
    this._flyVelocity -= notches * distance * FLY_STEP * FLY_DAMPING;
  }

  /** Posune kameru i bod otáčení společně, aby se let neměnil v zoom. */
  _updateFlight(delta) {
    if (this._flyVelocity === 0) return;

    this.camera.getWorldDirection(this._forward);

    // Přesný integrál exponenciálního doběhu přes tenhle snímek. Prosté
    // rychlost × delta by uletělo víc při nízkých fps – na telefonu by jedno
    // cvaknutí doletělo jinam než na počítači.
    const decay = Math.exp(-FLY_DAMPING * delta);
    const step = (this._flyVelocity * (1 - decay)) / FLY_DAMPING;

    this.camera.position.addScaledVector(this._forward, step);
    this.controls.target.addScaledVector(this._forward, step);

    this._flyVelocity *= decay;

    const distance = this.camera.position.distanceTo(this.controls.target);
    if (Math.abs(this._flyVelocity) < distance * 1e-4) this._flyVelocity = 0;
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

    this.renderer.info.reset();
    this._updateFlight(delta);
    this.controls.update();
    this._updateClipping();
    for (const fn of this.updaters) fn(delta, elapsed);
    this.composer.render(delta);
  };

  /**
   * Pevné near/far by nekonečný zoom neustály – zblízka by scéna mizela,
   * zdálky by se ořízla. Roviny proto jedou s odstupem kamery od středu.
   */
  _updateClipping() {
    const distance = Math.max(this.camera.position.distanceTo(this.controls.target), 1e-4);

    const near = distance * 0.002;
    const far = Math.max(distance * 4000, 5000);

    if (Math.abs(this.camera.near - near) < near * 0.1) return;

    this.camera.near = near;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.stop();
    this.updaters.clear();
    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('wheel', this._onWheel);
    this.canvas.removeEventListener('webglcontextlost', this._onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this._onContextRestored);
    this.controls.dispose();
    this.composer.dispose();
    this.scene.environment?.dispose?.();
    this.renderer.dispose();
  }
}
