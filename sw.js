// Keeps the app usable offline. The page is fetched fresh when online (falls back to the
// saved copy after 3 s or with no signal).
const CACHE = 'plant-care-v3';
// Firebase (sign-in and shared homes) is versioned, so it is served from the cache once saved.
const LIBS = ['app', 'auth', 'firestore'].map(m => 'https://www.gstatic.com/firebasejs/10.14.1/firebase-' + m + '-compat.js');
const FILES = ['./', './index.html', './manifest.webmanifest', './apple-touch-icon.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES).then(() => cache.addAll(LIBS).catch(() => {}))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('plant-care-') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const key = request.mode === 'navigate' ? './index.html' : request;
  const network = fetch(request).then(response => { if (response.ok) cache.put(key, response.clone()); return response; });
  const timeout = new Promise(resolve => setTimeout(resolve, 3000));
  const response = await Promise.race([network.catch(() => null), timeout]);
  if (response) return response;
  return (await cache.match(key, { ignoreSearch: true })) || network;
}
async function libFromCache(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') (await caches.open(CACHE)).put(request, response.clone());
  return response;
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (LIBS.includes(event.request.url)) { event.respondWith(libFromCache(event.request)); return; }
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  event.respondWith(networkFirst(event.request));
});
