import { createLauncher } from './launcher.js';

/**
 * Postaví ovládací panel z popisu v `scene.controls` a napojí ho na scénu.
 * Žádná UI knihovna – přidání dalšího ovladače se dělá ve scéně, ne tady.
 */
export function createHud({ app, scene }) {
  const panel = document.querySelector('[data-panel]');
  const fpsEl = document.querySelector('[data-fps]');
  const drawsEl = document.querySelector('[data-draws]');
  const trisEl = document.querySelector('[data-tris]');
  const focusEl = document.querySelector('[data-focus]');
  const toastEl = document.querySelector('[data-toast]');
  const motionBtn = document.querySelector('[data-action="toggle-motion"]');
  const resetBtn = document.querySelector('[data-action="reset-view"]');

  const fields = (scene.controls ?? []).map((control) => {
    const element = buildControl(control);
    panel?.append(element);
    return { control, element };
  });

  // tlačítka s potvrzením: první klik se zeptá, druhý do 3 s provede
  for (const { control, element } of fields) {
    if (control.type !== 'button') continue;

    let armed = 0;
    element.addEventListener('click', () => {
      if (control.confirm && !armed) {
        element.textContent = control.confirm;
        element.classList.add('field-button--armed');
        armed = setTimeout(() => {
          armed = 0;
          element.textContent = control.label;
          element.classList.remove('field-button--armed');
        }, 3000);
        return;
      }

      clearTimeout(armed);
      armed = 0;
      element.textContent = control.label;
      element.classList.remove('field-button--armed');

      const result = control.action();
      if (control.message) toast(control.message(result));
    });
  }

  let focusedId = null;

  // Některé ovladače patří jen k jednomu typu tělesa (`visible`). Stačí to
  // přepočítat po každé změně v panelu – události z polí k němu probublají.
  let toastTimer = 0;
  const toast = (text, isError = false) => {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.toggle('toast--error', isError);
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, isError ? 5000 : 3500);
  };

  const launcher = createLauncher({ app, scene, toast });

  const refresh = () => {
    for (const { control, element } of fields) {
      element.hidden = control.visible ? !control.visible() : false;
    }
    document.body.classList.toggle('is-creating', Boolean(scene.creating));
    launcher.sync();
  };
  panel?.addEventListener('input', refresh);
  panel?.addEventListener('change', refresh);
  refresh();

  const stopCreating = () => {
    const select = panel?.querySelector('[data-control="create"]');
    if (!select) return;
    select.value = 'none';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const syncMotionLabel = () => {
    if (motionBtn) motionBtn.textContent = scene.params.animate ? 'Pauza' : 'Spustit';
  };

  const toggleMotion = () => {
    scene.params.animate = !scene.params.animate;
    syncMotionLabel();
  };

  app.onClick((x, y) => {
    const rect = app.canvas.getBoundingClientRect();

    // mazání: kliknutí smaže těleso pod kurzorem
    if (scene.deleting) {
      const index = scene.pick(x, y, rect);
      if (index < 0) toast('Tady není co smazat – klikni přímo na těleso.', true);
      else toast(describeRemoval(scene.removeBody(index)));
      return;
    }

    // tvoření obstarává launcher (stisk – tažení – puštění), i obyčejné kliknutí
    if (scene.creating) return;

    // jinak kliknutí na těleso: kamera k němu přeletí a sleduje ho
    const index = scene.pick(x, y, rect);
    if (index < 0) return;

    app.focusOn(scene.bodyTracker(index), scene.focusDistance(index));
    focusedId = scene.idOf(index);
    if (focusEl) {
      focusEl.textContent = `${scene.describe(index)} · Esc pustí`;
      focusEl.hidden = false;
    }
  });

  motionBtn?.addEventListener('click', toggleMotion);
  resetBtn?.addEventListener('click', () => app.resetView());
  syncMotionLabel();

  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;

    if (event.key === 'Escape') {
      // Esc nejdřív zruší rozdělanou šipku, pak tvoření, teprve pak sledování
      if (launcher.cancel()) return;
      if (scene.creating) stopCreating();
      else app.clearFocus();
    } else if (event.key === 'Delete' && app.focused && focusedId) {
      // Delete smaže těleso, které se právě sleduje
      toast(describeRemoval(scene.removeBody(scene.indexOfId(focusedId))));
      focusedId = null;
    } else if (event.code === 'Space') {
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

    // sledování mohlo skončit i jinak než přes Esc (reset, změna režimu…)
    if (focusEl && !app.focused) focusEl.hidden = true;

    const { render } = app.renderer.info;
    if (fpsEl) fpsEl.textContent = String(Math.round(app.fps));
    if (drawsEl) drawsEl.textContent = String(render.calls);
    if (trisEl) trisEl.textContent = formatCount(render.triangles);
  });
}

/** Zpráva po smazání: první jméno je těleso, na které se kliklo. */
function describeRemoval(names) {
  if (names.length === 0) return 'Nic se nesmazalo.';
  const [first, ...rest] = names;
  if (rest.length === 0) return `Smazáno: ${first}`;
  const orbiting = rest.length === 1 ? '1 těleso, které kolem obíhalo' : `${rest.length} těles, která kolem obíhala`;
  return `Smazáno: ${first} a ${orbiting}`;
}

function formatCount(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${Math.round(value / 1e3)}k`;
  return String(value);
}

function buildControl(control) {
  if (control.type === 'button') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `field-button${control.danger ? ' field-button--danger' : ''}`;
    button.dataset.control = control.id;
    button.textContent = control.label;
    return button;
  }

  if (control.type === 'heading') {
    const heading = document.createElement('h3');
    heading.className = 'panel__section';
    heading.textContent = control.label;
    return heading;
  }

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

/**
 * Posuvník plus políčko na přesné číslo – obojí drží stejnou hodnotu.
 *
 * `log: true` = logaritmická stupnice. U rozsahu 1–10 000 by lineární posuvník
 * měl celé rozmezí 1–100 v prvním procentu dráhy; takhle má každý řád stejně.
 */
function rangeInputs(control, head) {
  const log = control.log === true;
  const steps = 1000;
  const ratio = control.max / control.min;

  const toSlider = (value) =>
    log ? (Math.log(Math.max(value, control.min) / control.min) / Math.log(ratio)) * steps : value;
  const fromSlider = (position) => (log ? control.min * Math.pow(ratio, position / steps) : position);

  const range = document.createElement('input');
  range.type = 'range';
  range.dataset.control = control.id;
  range.min = log ? 0 : control.min;
  range.max = log ? steps : control.max;
  range.step = log ? 1 : control.step;
  range.value = toSlider(control.get());

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
    if (source !== range) range.value = String(toSlider(applied));
    number.value = format(applied);
  };

  range.addEventListener('input', () => apply(fromSlider(Number(range.value)), range));

  // až po opuštění políčka nebo Enteru, ať se nepřepisuje během psaní
  number.addEventListener('change', () => apply(number.value, number));
  number.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') number.blur();
  });

  function format(value) {
    if (log) return String(Number(value.toPrecision(value >= 100 ? 5 : 3)));
    return control.step >= 1 ? String(Math.round(value)) : String(Number(value.toFixed(3)));
  }

  return [range];
}

