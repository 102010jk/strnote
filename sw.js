// Service worker: web funguje i offline a po instalaci na plochu startuje okamžitě.
// V nativním obalu (Capacitor) se neregistruje – tam jsou soubory lokálně už tak.
const VERSION = '1.5.1';
const CACHE = `strnote-${VERSION}`;
const CDN = 'https://cdn.jsdelivr.net/';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/main.css',
  './src/main.js',
  './src/core/App.js',
  './src/core/environment.js',
  './src/scenes/MainScene.js',
  './src/ui/Hud.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // three.js z CDN je připnutá na verzi, takže se nikdy nemění – ber z cache.
  if (request.url.startsWith(CDN)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            cachePut(request, response.clone());
            return response;
          }),
      ),
    );
    return;
  }

  if (new URL(request.url).origin !== self.location.origin) return;

  // Vlastní soubory: vždycky nejdřív síť, cache je záloha pro offline.
  // Stale-while-revalidate by bylo rychlejší, ale ukázalo by čerstvě nasazenou
  // verzi až na druhé načtení – to jde proti „commitni a je to nasazené".
  event.respondWith(
    fetch(request)
      .then((response) => {
        cachePut(request, response.clone());
        return response;
      })
      .catch(() =>
        caches
          .match(request)
          .then((hit) => hit ?? (request.mode === 'navigate' ? caches.match('./index.html') : undefined)),
      ),
  );
});

function cachePut(request, response) {
  if (!response || !response.ok) return;
  caches.open(CACHE).then((cache) => cache.put(request, response));
}
