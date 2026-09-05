const CACHE_NAME = 'mediadrop-shell-v3';
const SHELL = ['/', '/index.html', '/css/style.css', '/css/logos.css', '/js/app.js', '/assets/mediadrop-logo.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
    self.skipWaiting();
    return;
  }
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') return;
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy)).catch(() => {});
        return response;
      }).catch(() => caches.match('/index.html')).catch(() => Response.error())
    );
    return;
  }

  event.respondWith(
    fetch(event.request).then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
      }
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
  );
});
