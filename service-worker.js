const CACHE_NAME = 'jurijpower-cache-v2';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.json',
  './icon.png'
];

// Install
self.addEventListener('install', event => {
  console.log('[SW] Service Worker installiert');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate
self.addEventListener('activate', event => {
  console.log('[SW] Aktiviert');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch (Offline-Fallback)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

// Optional Push (kann später erweitert werden)
self.addEventListener('push', event => {
  const data = event.data ? event.data.text() : '⚽ Tor!';
  event.waitUntil(
    self.registration.showNotification('⚽ TOR!', {
      body: data,
      icon: 'icon.png'
    })
  );
});
