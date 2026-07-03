// App-shell cache. NETWORK-FIRST for the shell so new deploys land on next open;
// falls back to cache when offline. Bump CACHE to force a clean sweep.
const CACHE = 'protocol-tracker-v10';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './content/coimbra/catalog.json',
  './content/coimbra/timing.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

const cachePut = (req, res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); return res; };

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isShell = e.request.mode === 'navigate' || /\.(html|js|css|json|webmanifest)$/.test(url.pathname);
  if (isShell) {
    // Network-first: always try the freshest app; cache is the offline fallback.
    e.respondWith(
      fetch(e.request).then((res) => cachePut(e.request, res))
        .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')))
    );
  } else {
    // Cache-first for immutable static assets (icons).
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => cachePut(e.request, res))));
  }
});
