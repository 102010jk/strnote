/**
 * Postaví ovládací panel z popisu v `scene.controls` a napojí ho na scénu.
 * Žádná UI knihovna – přidání dalšího ovladače se dělá ve scéně, ne tady.
 */
export function createHud({ app, scene }) {
  const panel = document.querySelector('[data-panel]');
  const fpsEl = document.querySelector('[data-fps]');
  const drawsEl = document.querySelector('[data-draws]');
  const trisEl = document.querySelector('[data-tris]');
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
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;

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

    const { render } = app.renderer.info;
    if (fpsEl) fpsEl.textContent = String(Math.round(app.fps));
    if (drawsEl) drawsEl.textContent = String(render.calls);
    if (trisEl) trisEl.textContent = formatCount(render.triangles);
  });
}

function formatCount(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${Math.round(value / 1e3)}k`;
  return String(value);
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

  if (control.type === 'color') {
    wrapper.append(head, colorInput(control));
  } else if (control.type === 'toggle') {
    wrapper.classList.add('field--toggle');
    wrapper.append(head, toggleInput(control));
  } else if (control.type === 'select') {
    wrapper.append(head, selectInput(control));
  } else {
    wrapper.append(head, ...rangeInputs(control, head));
  }

  return wrapper;
}

function colorInput(control) {
  const input = document.createElement('input');
  input.type = 'color';
  input.dataset.control = control.id;
  input.value = control.get();
  input.addEventListener('input', () => control.set(input.value));
  return input;
}

function toggleInput(control) {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.dataset.control = control.id;
  input.checked = Boolean(control.get());
  input.addEventListener('change', () => control.set(input.checked));
  return input;
}

function selectInput(control) {
  const select = document.createElement('select');
  select.dataset.control = control.id;

  for (const option of control.options) {
    const element = document.createElement('option');
    element.value = String(option.value);
    element.textContent = option.label;
    select.append(element);
  }

  select.value = String(control.get());

  // `raw` = hodnota je řetězec (režim kamery), jinak číslo
  select.addEventListener('change', () => {
    control.set(control.raw ? select.value : Number(select.value));
  });

  return select;
}

/** Posuvník plus políčko na přesné číslo – obojí drží stejnou hodnotu. */
function rangeInputs(control, head) {
  const range = document.createElement('input');
  range.type = 'range';
  range.dataset.control = control.id;
  range.min = control.min;
  range.max = control.max;
  range.step = control.step;
  range.value = control.get();

  // Políčko nemá min ani max: posuvník drží rozumný rozsah na tažení,
  // napsat se dá cokoliv. Prohlížeč jinak hlásí „hodnota musí být ≤ …"
  // a šipky se zastaví na kraji posuvníku.
  const number = document.createElement('input');
  number.type = 'number';
  number.className = 'field__value';
  number.dataset.controlNumber = control.id;
  number.step = 'any';
  number.value = format(control.get());
  head.append(number);

  const apply = (raw, source) => {
    const value = Number(raw);
    if (raw === '' || !Number.isFinite(value)) {
      number.value = format(control.get()); // prázdné nebo nesmysl = vrátit, co platí
      return;
    }

    control.set(value);

    // ukázat, co se opravdu nastavilo – počet se zaokrouhlí na celé
    // a nemusí se vejít do paměti, pak zůstane menší
    const applied = control.get();
    if (source !== range) range.value = String(applied);
    number.value = format(applied);
  };

  range.addEventListener('input', () => apply(range.value, range));

  // až po opuštění políčka nebo Enteru, ať se nepřepisuje během psaní
  number.addEventListener('change', () => apply(number.value, number));
  number.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') number.blur();
  });

  function format(value) {
    return control.step >= 1 ? String(Math.round(value)) : String(Number(value.toFixed(3)));
  }

  return [range];
}

