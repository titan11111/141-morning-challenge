// Neon Ridge Racer — Service Worker
// Cache-first for assets, network-first for HTML (so updates are picked up)
const CACHE = 'neon-ridge-racer-v1';
const ASSETS = [
  './gpt-race.html',
  './manifest.webmanifest',
  './icon.svg',
  './car-sprite.png',
  './ai-car-red.png',
  './ai-car-yellow.png'
];

// Install: pre-cache all game assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first strategy (game assets rarely change)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache successful responses for future offline use
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached); // fallback to cache on network error
    })
  );
});
