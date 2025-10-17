self.addEventListener('install', event => {
  console.log('[SW] Service Worker installiert');
  event.waitUntil(
    caches.open('jurijpower-cache-v1').then(cache => {
      return cache.addAll([
        './',
        './index.html',
        './script.js',
        './style.css',
        './manifest.json',
        './icon.png'
      ]);
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Aktiviert');
});

self.addEventListener('push', event => {
  const data = event.data ? event.data.text() : '⚽ Tor!';
  event.waitUntil(
    self.registration.showNotification('⚽ TOR!', {
      body: data,
      icon: 'icon.png'
    })
  );
});
