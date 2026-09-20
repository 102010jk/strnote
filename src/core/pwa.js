/**
 * Registrace service workeru – jen na ostrém webu.
 * Na localhostu by cache jen mátla při vývoji a v Capacitoru (https://localhost)
 * je celý web už lokálně, takže tam nemá co dělat.
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:') return;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .catch((error) => console.warn('[strnote] service worker neregistrován:', error));
  });
}

/** Běžíme jako nainstalovaná aplikace (plocha / launcher), ne jako karta v prohlížeči? */
export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    location.protocol === 'capacitor:'
  );
}
