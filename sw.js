// Keeps the app usable offline. The page is fetched fresh when online (falls back to the
// saved copy after 3 s or with no signal).
const CACHE = 'plant-care-v2';
const FILES = ['./', './index.html', './manifest.webmanifest', './apple-touch-icon.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
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
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  event.respondWith(networkFirst(event.request));
});
