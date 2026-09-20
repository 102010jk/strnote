/**
 * Postaví ovládací panel z popisu v `scene.controls` a napojí ho na scénu.
 * Žádná UI knihovna – přidání dalšího slideru se dělá ve scéně, ne tady.
 */
export function createHud({ app, scene }) {
  const panel = document.querySelector('[data-panel]');
  const fpsEl = document.querySelector('[data-fps]');
  const motionBtn = document.querySelector('[data-action="toggle-motion"]');
  const resetBtn = document.querySelector('[data-action="reset-view"]');

  for (const control of scene.controls ?? []) {
    panel?.append(buildControl(control));
  }

  const syncMotionLabel = () => {
    if (motionBtn) motionBtn.textContent = scene.params.animate ? 'Pauza' : 'Spustit';
  };

  const toggleMotion = () => {
    scene.params.animate = !scene.params.animate;
    syncMotionLabel();
  };

  motionBtn?.addEventListener('click', toggleMotion);
  resetBtn?.addEventListener('click', () => app.resetView());
  syncMotionLabel();

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
}

function buildControl(control) {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';

  const head = document.createElement('span');
  head.className = 'field__head';

  const label = document.createElement('span');
  label.className = 'field__label';
  label.textContent = control.label;
  head.append(label);

  const input = document.createElement('input');
  input.dataset.control = control.id;

  if (control.type === 'color') {
    input.type = 'color';
    input.value = control.get();
    input.addEventListener('input', () => control.set(input.value));
  } else if (control.type === 'toggle') {
    input.type = 'checkbox';
    input.checked = Boolean(control.get());
    input.addEventListener('change', () => control.set(input.checked));
    wrapper.classList.add('field--toggle');
  } else {
    const value = document.createElement('span');
    value.className = 'field__value';

    const render = (v) => {
      value.textContent = control.step >= 1 ? String(Math.round(v)) : Number(v).toFixed(2);
    };

    input.type = 'range';
    input.min = control.min;
    input.max = control.max;
    input.step = control.step;
    input.value = control.get();
    render(control.get());

    input.addEventListener('input', () => {
      const v = Number(input.value);
      control.set(v);
      render(v);
    });

    head.append(value);
  }

  wrapper.append(head, input);
  return wrapper;
}
