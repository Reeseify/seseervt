
/* Reese's TV service worker: cache images on-device (patched) */
const VERSION = 'v1.0.1';
const CORE_CACHE = `core-${VERSION}`;
const IMG_CACHE = `img-${VERSION}`;

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
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      if (k !== CORE_CACHE && k !== IMG_CACHE) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

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

// Ignore Drive JSON listing calls entirely (let network handle & CORS apply)
function isDriveJsonList(req) {
  const url = new URL(req.url);
  return url.hostname.endsWith('googleapis.com')
    && url.pathname.startsWith('/drive/v3/files')
    && !url.search.includes('alt=media')
    && !/thumbnail/i.test(url.href);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (isDriveJsonList(request)) {
    // Do not intercept Drive API JSON
    return;
  }

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (isImageRequest(request)) {
    event.respondWith((async () => {
      const cache = await caches.open(IMG_CACHE);
      const cached = await cache.match(request, { ignoreVary: true, ignoreSearch: false });
      if (cached) {
        // Try to update in background without breaking if opaque/cache fails
        event.waitUntil((async () => {
          try {
            const res = await fetch(request);
            if (res && (res.ok || res.type === 'opaque')) {
              const key = (request.mode === 'no-cors' || res.type === 'opaque')
                ? new Request(request.url, { mode: 'no-cors' })
                : request;
              await cache.put(key, res.clone());
            }
          } catch {}
        })());
        return cached;
      }
      try {
        const res = await fetch(request);
        if (res && (res.ok || res.type === 'opaque')) {
          const key = (request.mode === 'no-cors' || res.type === 'opaque')
            ? new Request(request.url, { mode: 'no-cors' })
            : request;
          await cache.put(key, res.clone());
        }
        return res;
      } catch (e) {
        return cached || Response.error();
      }
    })());
    return;
  }

  if (sameOrigin) {
    event.respondWith((async () => {
      const cache = await caches.open(CORE_CACHE);
      const cached = await cache.match(request);
      const fetchPromise = fetch(request).then(res => {
        cache.put(request, res.clone()).catch(()=>{});
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })());
  }
});
