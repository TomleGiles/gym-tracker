/*
 * Service worker minimal — l'app doit démarrer sans réseau, en salle.
 *
 * Stratégie :
 *  - navigations : réseau d'abord (pour récupérer un nouveau déploiement),
 *    repli sur le cache si le réseau ne répond pas ;
 *  - assets versionnés (/_expo/static/**) : cache d'abord, ils sont immuables ;
 *  - le reste : réseau, mis en cache au passage.
 *
 * Les données ne passent jamais par ici : elles sont dans SQLite/OPFS.
 */
const CACHE = 'muscu-tracker-v1';
const APP_SHELL = ['/', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/').then((r) => r ?? Response.error())),
    );
    return;
  }

  const immutable = url.pathname.startsWith('/_expo/static/');
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached && immutable) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached ?? Response.error());
    }),
  );
});
