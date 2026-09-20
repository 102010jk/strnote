/**
 * Propojí HTML overlay se scénou. Žádná UI knihovna, jen querySelector.
 */
export function createHud({ app, scene }) {
  const fpsEl = document.querySelector('[data-fps]');
  const amplitudeEl = document.querySelector('[data-control="amplitude"]');
  const speedEl = document.querySelector('[data-control="speed"]');
  const motionBtn = document.querySelector('[data-action="toggle-motion"]');
  const resetBtn = document.querySelector('[data-action="reset-view"]');

  const syncMotionLabel = () => {
    if (motionBtn) motionBtn.textContent = scene.params.animate ? 'Pauza' : 'Spustit';
  };

  const toggleMotion = () => {
    scene.params.animate = !scene.params.animate;
    syncMotionLabel();
  };

  amplitudeEl?.addEventListener('input', () => {
    scene.params.amplitude = Number(amplitudeEl.value);
  });

  speedEl?.addEventListener('input', () => {
    scene.params.speed = Number(speedEl.value);
  });

  motionBtn?.addEventListener('click', toggleMotion);
  resetBtn?.addEventListener('click', () => app.resetView());

  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement) return;

    if (event.code === 'Space') {
      event.preventDefault();
      toggleMotion();
    } else if (event.key.toLowerCase() === 'h') {
      document.body.classList.toggle('hud-hidden');
    }
  });

  let accumulator = 0;
  app.onUpdate((delta) => {
    accumulator += delta;
    if (accumulator < 0.25) return;
    accumulator = 0;
    if (fpsEl) fpsEl.textContent = String(Math.round(app.fps));
  });

  // slidery můžou mít po reloadu jinou hodnotu, než je výchozí v params
  if (amplitudeEl) scene.params.amplitude = Number(amplitudeEl.value);
  if (speedEl) scene.params.speed = Number(speedEl.value);
  syncMotionLabel();
}
