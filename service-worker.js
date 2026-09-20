// MCPS — Service Worker (PWA)
// Mise en cache de l'app shell pour un chargement rapide et un accès hors-ligne
// aux dernières données synchronisées. Les écritures (sauvegarde cloud) nécessitent
// toujours une connexion — seule la consultation fonctionne hors-ligne.

const CACHE_NAME = 'mcps-cache-v2';
const APP_SHELL = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './css/styles.css',
  './js/01-app-core.js',
  './js/02-dashboard-extras.js',
  './js/03-suivi-module.js',
  './js/04-legacy-patches.js',
  './js/05-intelligence-layer.js',
  './js/06-auth-cloud.js',
  './js/07-ui-enhancements.js',
  './js/08-error-boundary.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Stratégie : réseau d'abord (données à jour), repli sur le cache si hors-ligne.
// Les appels vers Firebase/Stripe/Google ne sont jamais interceptés — seul l'app shell l'est.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // laisse passer les appels externes (Firebase, etc.)

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
