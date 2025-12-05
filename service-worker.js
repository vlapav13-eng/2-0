const CACHE_NAME = 'my-pwa-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './script.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of ASSETS) {
      try {
        const resp = await fetch(url, {cache: 'no-store'});
        if (resp && resp.ok) {
          await cache.put(url, resp.clone());
        } else {
          console.warn('Не кэшируется (ответ не OK):', url);
        }
      } catch (err) {
        console.warn('Не кэшируется (ошибка):', url, err);
      }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (k !== CACHE_NAME) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch (err) {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match('./');
        return cached || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const networkResp = await fetch(req);
      if (networkResp && networkResp.ok) {
        cache.put(req, networkResp.clone()).catch(()=>{});
      }
      return networkResp;
    } catch (err) {
      return Response.error();
    }
  })());
});
