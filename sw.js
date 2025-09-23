
/* Reese's TV service worker: cache images on-device */
const VERSION = 'v1.0.0';
const CORE_CACHE = `core-${VERSION}`;
const IMG_CACHE = `img-${VERSION}`;

// Core assets to precache (add others if you host on same origin)
const CORE_ASSETS = [
  './',
  './index.html','./browse.html','./library.html','./show.html','./watch.html','./about.html',
  './styles.css','./app.js','./drive.js',
  './img/favicon.png','./img/logo-full.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE).then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => {
        if (k !== CORE_CACHE && k !== IMG_CACHE) return caches.delete(k);
      }));
      await self.clients.claim();
    })()
  );
});

// Helper to detect "image-like" requests we want to cache
function isImageRequest(req) {
  const url = new URL(req.url);
  if (req.destination === 'image') return true;
  const u = url.href.toLowerCase();
  return (
    u.endsWith('.png') || u.endsWith('.jpg') || u.endsWith('.jpeg') || u.endsWith('.webp') ||
    u.includes('thumbnail') ||
    (u.includes('googleapis.com/drive/v3/files') && (u.includes('alt=media') || u.includes('/thumbnail')))
  );
}

// Cache-First for images (including cross-origin/opaque).
// Stale-While-Revalidate for core same-origin GET requests.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (isImageRequest(request)) {
    event.respondWith((async () => {
      const cache = await caches.open(IMG_CACHE);
      const cached = await cache.match(request, { ignoreVary: true, ignoreSearch: false });
      if (cached) {
        // Try to update in background
        event.waitUntil(fetch(request, { mode: 'no-cors' }).then(res => cache.put(request, res.clone())).catch(()=>{}));
        return cached;
      }
      try {
        const res = await fetch(request, { mode: 'no-cors' });
        if (res && res.type !== 'error') {
          // Can cache opaque responses
          cache.put(request, res.clone());
        }
        return res;
      } catch (e) {
        // Optional: offline fallback image
        return cached || Response.error();
      }
    })());
    return;
  }

  if (sameOrigin) {
    // S-W-R for app shell/static assets
    event.respondWith((async () => {
      const cache = await caches.open(CORE_CACHE);
      const cached = await cache.match(request);
      const fetchPromise = fetch(request).then(res => {
        cache.put(request, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })());
  }
});
