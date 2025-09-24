
/* Reese's TV service worker (images + core pages) */
const VERSION = 'v1.0.8';
const CORE_CACHE = `core-${VERSION}`;
const IMG_CACHE = `img-${VERSION}`;

const CORE_ASSETS = [
  './',
  './index.html','./browse.html','./library.html','./show.html','./watch.html','./about.html',
  './img/favicon.png','./img/logo-full.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CORE_CACHE).then((c)=>c.addAll(CORE_ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k=>{ if(![CORE_CACHE, IMG_CACHE].includes(k)) return caches.delete(k); }));
    await self.clients.claim();
  })());
});

function isDriveJson(req){
  const u = new URL(req.url);
  return u.hostname.endsWith('googleapis.com') && u.pathname.startsWith('/drive/v3/files') && !u.search.includes('alt=media') && !/thumbnail/i.test(u.href);
}
function isImage(req){
  const u = req.url.toLowerCase();
  return req.destination==='image' || u.endsWith('.png')||u.endsWith('.jpg')||u.endsWith('.jpeg')||u.endsWith('.webp')||u.includes('thumbnail');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if(request.method!=='GET') return;
  if(isDriveJson(request)) return; // don't intercept Drive JSON

  if(isImage(request)){
    event.respondWith((async()=>{
      const cache = await caches.open(IMG_CACHE);
      const cached = await cache.match(request);
      if(cached){
        event.waitUntil(fetch(request).then(r=>cache.put(request, r.clone())).catch(()=>{}));
        return cached;
      }
      try{
        const r = await fetch(request);
        if(r && (r.ok || r.type==='opaque')) await cache.put(request, r.clone());
        return r;
      }catch(e){ return cached || Response.error(); }
    })());
    return;
  }

  // S-W-R for core
  const url = new URL(request.url);
  if(url.origin === self.location.origin){
    event.respondWith((async()=>{
      const cache = await caches.open(CORE_CACHE);
      const cached = await cache.match(request);
      const fresher = fetch(request).then(r=>{ cache.put(request, r.clone()); return r; }).catch(()=>cached);
      return cached || fresher;
    })());
  }
});
