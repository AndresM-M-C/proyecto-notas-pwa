const CACHE_NAME = 'notas-pwa-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/inicio.html',
  '/agregar.html',
  '/manifest.json',
  '/css/estilo_1.css',
  '/css/inicio.css',
  '/css/agregar.css',
  '/js/login.js',
  '/js/mostrar.js',
  '/js/agregar.js',
  '/js/salir.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
          return cache.addAll(ASSETS);
      })
  );
  self.skipWaiting(); 
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
      caches.keys().then((keys) => {
          return Promise.all(
              keys.map((key) => {
                  if (key !== CACHE_NAME) {
                      return caches.delete(key);
                  }
              })
          );
      })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
      fetch(e.request).catch(() => {
          return caches.match(e.request);
      })
  );
});