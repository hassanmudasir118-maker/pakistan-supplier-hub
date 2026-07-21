// Cache version bumped on every meaningful change to force old caches to be
// dropped. IMPORTANT: bump this string whenever JS/CSS behavior changes —
// otherwise returning users can get stuck on stale cached files indefinitely,
// even after a hard refresh (service worker cache is separate from the
// browser's normal HTTP cache, which is what a hard refresh usually clears).
const CACHE_NAME = 'psh-v2';
const PRECACHE_URLS = ['/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return; // never cache API calls

  // Network-first for pages and app code (HTML/JS/CSS): always try to get the
  // latest version first, since this app is under active development and a
  // stale JS/CSS file can silently break features. Falls back to cache only
  // when offline. Other same-origin assets (images, fonts) stay cache-first
  // for performance, since they change far less often.
  const isAppShell = event.request.mode === 'navigate'
    || url.pathname.endsWith('.js')
    || url.pathname.endsWith('.css');

  if (isAppShell) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && url.origin === location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && url.origin === location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match('/'));
    })
  );
});
