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

// Kliknutí = stisk a puštění bez velkého pohybu. Tažení otáčí kamerou.
const CLICK_SLOP_PX = 6;
const CLICK_MAX_MS = 400;

// Jak dlouho trvá přelet ke kliknutému tělesu.
const FOCUS_DURATION = 1.2;

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

    this._focus = null;
    this._focusPoint = new THREE.Vector3();
    this._focusDelta = new THREE.Vector3();
    this._clickHandlers = new Set();
    this._pointerDown = null;

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
    this._onPointerDown = (event) => {
      if (event.button !== 0) return;
      this._pointerDown = { x: event.clientX, y: event.clientY, time: performance.now() };
    };
    this._onPointerUp = (event) => this._handlePointerUp(event);

    window.addEventListener('resize', this._onResize);
    // passive: false, jinak nejde zastavit výchozí chování kolečka
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointerup', this._onPointerUp);
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
      this.clearFocus();
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

  /** Registruje funkci volanou při kliknutí na plátno: (clientX, clientY) => void. */
  onClick(fn) {
    this._clickHandlers.add(fn);
    return () => this._clickHandlers.delete(fn);
  }

  _handlePointerUp(event) {
    const down = this._pointerDown;
    this._pointerDown = null;
    if (!down || event.button !== 0) return;

    // tažení myší otáčí kamerou – to kliknutí není
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    if (moved > CLICK_SLOP_PX || performance.now() - down.time > CLICK_MAX_MS) return;

    for (const fn of this._clickHandlers) fn(event.clientX, event.clientY);
  }

  /**
   * Přeletí k tělesu, dá ho do středu a pak ho sleduje, jak obíhá.
   * `getPosition(target)` zapíše aktuální polohu tělesa do `target` a vrátí ho,
   * nebo vrátí null, když těleso přestalo existovat – sledování pak skončí.
   * `distance` je odstup kamery, ze kterého je těleso dobře vidět.
   */
  focusOn(getPosition, distance) {
    if (!getPosition(this._focusPoint)) return;

    const fromTarget = this.controls.target.clone();
    const direction = this.camera.position.clone().sub(fromTarget);
    const fromDistance = Math.max(direction.length(), 1e-6);
    direction.divideScalar(fromDistance);

    this._flyVelocity = 0;
    this._focus = { getPosition, fromTarget, direction, fromDistance, distance, progress: 0 };
  }

  clearFocus() {
    this._focus = null;
  }

  get focused() {
    return this._focus !== null;
  }

  _updateFocus(delta) {
    const focus = this._focus;
    if (!focus) return;

    const position = focus.getPosition(this._focusPoint);
    if (!position) {
      this.clearFocus();
      return;
    }

    if (focus.progress < 1) {
      focus.progress = Math.min(1, focus.progress + delta / FOCUS_DURATION);
      const eased = easeInOutCubic(focus.progress);

      // Odstup se prolíná logaritmicky: přelet z celé galaxie k planetě jde
      // přes několik řádů a lineárně by se kamera přiblížila až na samém konci.
      const distance = Math.exp(
        THREE.MathUtils.lerp(Math.log(focus.fromDistance), Math.log(focus.distance), eased),
      );

      this.controls.target.lerpVectors(focus.fromTarget, position, eased);
      this.camera.position.copy(this.controls.target).addScaledVector(focus.direction, distance);
      this.camera.lookAt(this.controls.target);
      return;
    }

    // Sledování: kamera i střed se posunou o tolik, o kolik se těleso pohnulo.
    // Je to čistý posun, takže natočení i odstup, který si člověk mezitím
    // nastavil kolečkem nebo tažením, zůstanou.
    this._focusDelta.subVectors(position, this.controls.target);
    this.camera.position.add(this._focusDelta);
    this.controls.target.copy(position);
  }

  resetView() {
    this.clearFocus();
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
    for (const fn of this.updaters) fn(delta, elapsed);

    // Až po scéně: polohy těles se počítají v jejím update, takže dřív by
    // kamera sledovala polohu z minulého snímku a byla by pořád o kus pozadu.
    this._updateFocus(delta);
    this._updateClipping();
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
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointerup', this._onPointerUp);
    this.canvas.removeEventListener('webglcontextlost', this._onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this._onContextRestored);
    this.controls.dispose();
    this.composer.dispose();
    this.scene.environment?.dispose?.();
    this.renderer.dispose();
  }
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
