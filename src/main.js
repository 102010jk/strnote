import { App } from './core/App.js';
import { MainScene } from './scenes/MainScene.js';
import { createHud } from './ui/Hud.js';

const canvas = document.getElementById('scene');
const bootText = document.querySelector('[data-boot-text]');

function fail(error) {
  console.error('[strnote]', error);
  document.body.classList.add('has-error');
  document.body.classList.remove('is-ready');
  if (bootText) {
    bootText.textContent =
      'Scénu se nepodařilo spustit.\n\n' +
      String(error?.message ?? error) +
      '\n\nZkontroluj podporu WebGL2 v prohlížeči a síť (three.js se načítá z jsDelivr).';
  }
}

try {
  const app = new App(canvas, {
    background: 0x05070c,
    fog: null,
    cameraPosition: [0, 2.4, 9.5],
    cameraTarget: [0, 0, 0],
    environment: false, // scénu má osvětlovat jen ta koule
  });
  const scene = new MainScene(app);

  app.scene.add(scene.group);
  app.onUpdate((delta, elapsed) => scene.update(delta, elapsed));

  createHud({ app, scene });
  app.start();

  document.body.classList.add('is-ready');

  // pohodlný přístup z konzole při ladění
  window.strnote = { app, scene };
} catch (error) {
  fail(error);
}

window.addEventListener('unhandledrejection', (event) => fail(event.reason));
