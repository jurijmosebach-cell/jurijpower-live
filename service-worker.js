self.addEventListener('install', (e) => {
  console.log('Service Worker installiert');
  e.waitUntil(caches.open('jurijpower-v1').then((cache) => cache.addAll([
    './',
    './index.html',
    './style.css',
    './script.js'
  ])));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((response) => response || fetch(e.request)));
});