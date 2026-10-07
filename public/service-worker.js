const CACHE_NAME = 'territory-trail-shell-v4';
const BASE_URL = new URL('./', self.location.href);
const SHELL = [
  '', 'index.html', 'styles.css', 'app.js', 'game-engine.js',
  'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
].map((file) => new URL(file, BASE_URL).href);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE_URL.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(BASE_URL.href, copy));
      return response;
    }).catch(() => caches.match(BASE_URL.href)));
    return;
  }
  event.respondWith(fetch(request).then((response) => {
    if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request)));
});
