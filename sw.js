const CACHE = 'solitude-v9';
const CORE = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/pesquisa.css',
  '/pesquisa.js',
  '/plataforma.css',
  '/plataforma.js',
  '/publicacao.css',
  '/publicacao.js',
  '/zip-leitor.js',
  '/vendor/supabase-js-2.45.4.min.js',
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

/* Nunca guardar em cache: dados de API, respostas autenticadas,
   conteúdo de outro domínio e respostas marcadas como privadas. */
function podeCachear(req, url) {
  if (req.method !== 'GET') return false;
  if (req.headers.has('range') || req.headers.has('authorization')) return false;
  if (url.origin !== self.location.origin) return false;
  if (url.pathname === '/sw.js') return false;
  if (/^\/(api|rest|auth|storage)\//i.test(url.pathname)) return false;
  return true;
}

function guardavel(res) {
  if (!res || !res.ok || res.status !== 200 || res.type !== 'basic') return false;
  const cc = (res.headers.get('cache-control') || '').toLowerCase();
  return !/no-store|private/.test(cc);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (!podeCachear(req, url)) return;

  const isAsset = /\.(css|js|png|svg|webp|jpg|jpeg|woff2?|webmanifest)$/i.test(url.pathname);

  if (isAsset) {
    e.respondWith(
      caches.match(req).then(cached => {
        const rede = fetch(req).then(res => {
          if (guardavel(res)) {
            const copia = res.clone();
            caches.open(CACHE).then(c => c.put(req, copia)).catch(() => null);
          }
          return res;
        }).catch(() => cached || Response.error());
        return cached || rede;
      })
    );
    return;
  }

  e.respondWith(
    fetch(req)
      .then(res => {
        if (guardavel(res)) {
          const copia = res.clone();
          e.waitUntil(caches.open(CACHE).then(c => c.put(req, copia)).catch(() => null));
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
});
