const CACHE = 'solitude-v6';
const CORE = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-32.png',
  '/apple-touch-icon.png',
  '/404.html'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(CORE.map(url => c.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname === '/sw.js') return;

  const isAsset = /\.(css|js|png|svg|webp|jpg|jpeg|woff2?|webmanifest)$/i.test(url.pathname);

  if (isAsset) {
    e.respondWith(
      caches.match(req).then(cached => {
        const network = fetch(req).then(res => {
          if (res.ok && res.status === 200 && res.type === 'basic') {
            const copia = res.clone();
            caches.open(CACHE).then(c => c.put(req, copia));
          }
          return res;
        }).catch(() => cached || Response.error());
        return cached || network;
      })
    );
  } else {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok && res.status === 200 && res.type === 'basic') {
            const copia = res.clone();
            e.waitUntil(caches.open(CACHE).then(c => c.put(req, copia)));
          }
          return res;
        })
        .catch(async () => {
          const salvo = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
          if (salvo) return salvo;
          if (req.mode === 'navigate') return (await caches.match('/index.html')) || Response.error();
          return Response.error();
        })
    );
  }
});
