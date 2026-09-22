import { MOUSE } from 'three';
import { formatNumber, formatPeriod, formatSpeed } from './format.js';

// Hrot šipky v pixelech.
const HEAD_LENGTH = 12;
const HEAD_WIDTH = 7;

/**
 * Vypouštění těles tažením. V režimu tvoření levé tlačítko neotáčí kamerou:
 * stisk určí místo vzniku, tažení šipku (směr a rychlost), puštění těleso
 * vypustí. Kamerou se v tu chvíli otáčí pravým tlačítkem.
 *
 * Výpočty dělá scéna (beginLaunch / aimLaunch / updateLaunch / commitLaunch),
 * tady je jen ovládání a kreslení šipky s popiskem.
 */
export function createLauncher({ app, scene, toast }) {
  const canvas = app.canvas;
  const overlay = document.querySelector('[data-launch]');
  const shaft = overlay?.querySelector('[data-launch-shaft]');
  const head = overlay?.querySelector('[data-launch-head]');
  const dot = overlay?.querySelector('[data-launch-dot]');
  const label = document.querySelector('[data-launch-label]');

  let pointerId = null;

  const hide = () => {
    // SVG nemá vlastnost `hidden` jako HTML prvky, jen atribut
    overlay?.toggleAttribute('hidden', true);
    if (label) label.hidden = true;
  };

  const release = () => {
    if (pointerId !== null && canvas.hasPointerCapture?.(pointerId)) canvas.releasePointerCapture(pointerId);
    pointerId = null;
    app.controls.enabled = true;
  };

  const cancel = () => {
    if (pointerId === null && !scene.launching) return false;
    scene.cancelLaunch();
    release();
    hide();
    return true;
  };

  // Capture na window běží dřív než OrbitControls na plátně – ty se vypnou
  // a kamera se při tažení šipky neotočí.
  window.addEventListener('pointerdown', (event) => {
    if (event.target !== canvas || event.button !== 0 || !event.isPrimary) return;
    if (!scene.creating || scene.deleting) return;

    app.controls.enabled = false;
    pointerId = event.pointerId;
    // tažení pokračuje i mimo plátno (nad panelem); bez zachycení to jde taky
    try {
      canvas.setPointerCapture(pointerId);
    } catch {
      // ukazatel už není aktivní – nevadí
    }

    const result = scene.beginLaunch(event.clientX, event.clientY, canvas.getBoundingClientRect());
    if (result.error) toast(result.error, true);
  }, true);

  window.addEventListener('pointermove', (event) => {
    if (event.pointerId === pointerId) scene.aimLaunch(event.clientX, event.clientY);
  });

  window.addEventListener('pointerup', (event) => {
    if (event.pointerId !== pointerId) return;
    release();
    if (!scene.launching) return;

    scene.aimLaunch(event.clientX, event.clientY);
    const result = scene.commitLaunch();
    hide();

    if (result.error) {
      toast(`Nevypuštěno: ${result.error}`, true);
    } else if (result.parentName) {
      toast(`Vytvořeno: ${scene.describe(result.index)} · kolem: ${result.parentName} · oběh ${formatPeriod(result.period)}`);
    } else {
      toast(`Vytvořeno: ${scene.describe(result.index)} · stojí na místě`);
    }
  });

  window.addEventListener('pointercancel', (event) => {
    if (event.pointerId === pointerId) cancel();
  });

  // Až po pohybu kamery, jinak by šipka při sledování tělesa ujížděla.
  app.onLateUpdate(() => {
    const launch = scene.updateLaunch(canvas.getBoundingClientRect());
    if (!launch || !launch.screen) {
      hide();
      return;
    }
    draw(launch);
  });

  function draw(launch) {
    const bad = launch.reason !== null;
    const { x, y } = launch.screen;

    overlay?.toggleAttribute('hidden', false);
    overlay?.classList.toggle('launch--bad', bad);
    dot?.setAttribute('cx', x);
    dot?.setAttribute('cy', y);

    // šipka jen při tažení; bez něj je to kliknutí = kruhová dráha
    const dx = launch.pointer.x - x;
    const dy = launch.pointer.y - y;
    const length = Math.hypot(dx, dy);
    const showArrow = launch.dragged && length > HEAD_LENGTH;
    shaft?.toggleAttribute('hidden', !showArrow);
    head?.toggleAttribute('hidden', !showArrow);

    if (showArrow) {
      const ux = dx / length;
      const uy = dy / length;
      const baseX = launch.pointer.x - ux * HEAD_LENGTH;
      const baseY = launch.pointer.y - uy * HEAD_LENGTH;

      shaft.setAttribute('x1', x);
      shaft.setAttribute('y1', y);
      shaft.setAttribute('x2', baseX);
      shaft.setAttribute('y2', baseY);
      head.setAttribute('points', [
        `${launch.pointer.x},${launch.pointer.y}`,
        `${baseX - uy * HEAD_WIDTH},${baseY + ux * HEAD_WIDTH}`,
        `${baseX + uy * HEAD_WIDTH},${baseY - ux * HEAD_WIDTH}`,
      ].join(' '));
    }

    if (!label) return;
    label.hidden = false;
    label.classList.toggle('launch-label--bad', bad);
    label.textContent = describe(launch);

    // vedle kurzoru, ale uvnitř okna
    const left = Math.min(launch.pointer.x + 16, window.innerWidth - label.offsetWidth - 8);
    const top = Math.min(launch.pointer.y + 18, window.innerHeight - label.offsetHeight - 8);
    label.style.transform = `translate(${Math.max(left, 8)}px, ${Math.max(top, 8)}px)`;
  }

  function describe(launch) {
    if (launch.reason) return launch.reason;

    if (launch.free) {
      return launch.parentName
        ? `Hvězda zůstane stát\ntáhni = vypustit kolem: ${launch.parentName}`
        : 'Hvězda zůstane stát';
    }

    const plan = launch.plan;
    const snapped = launch.snapped ? ' (přichyceno)' : '';
    const lines = [`Kolem: ${launch.parentName}${snapped} · oběh ${formatPeriod(plan.period)}`];
    if (launch.dragged) {
      const shape = plan.e < 0.01 ? 'skoro kruh' : `elipsa, výstřednost ${formatNumber(plan.e)}`;
      lines.push(`${formatSpeed(launch.speed)} (${formatNumber(launch.ratio)}× kruhová) · ${shape}`);
    } else {
      lines.push(`${formatSpeed(launch.speed)} · kruhová dráha`, 'táhni = směr a rychlost');
    }
    return lines.join('\n');
  }

  // v tvoření patří levé tlačítko šipce, otáčí se pravým
  const sync = () => {
    const launching = scene.creating && !scene.deleting;
    app.controls.mouseButtons.RIGHT = launching ? MOUSE.ROTATE : MOUSE.PAN;
    if (!launching) cancel();
  };

  return { cancel, sync };
}
