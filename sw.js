// SmartGrocer — Service Worker
// ============================================================
// Objectif simple et prudent : permettre à l'app de se recharger même
// hors ligne (l'écran principal, la liste déjà sauvegardée, etc.), sans
// jamais mettre en cache les appels aux APIs externes (Groq, Stripe/Apps
// Script, Open Food Facts) — ces données doivent toujours être fraîches,
// jamais servies depuis un vieux cache.

const CACHE_NAME = 'smartgrocer-v1';
const APP_SHELL = ['./', './beta.html'];

// Domaines dont les requêtes ne doivent JAMAIS être mises en cache —
// tout ce qui est dynamique (prix, IA, paiements, produits).
const NEVER_CACHE_HOSTS = [
  'api.groq.com',
  'script.google.com',
  'world.openfoodfacts.org',
  'api.stripe.com',
  'buy.stripe.com'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(APP_SHELL).catch(function() {
        // Si la mise en cache initiale échoue (ex: hors ligne à l'installation),
        // ce n'est pas grave — l'app continuera de fonctionner normalement en ligne.
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Ne jamais intercepter les appels vers les APIs externes — toujours réseau direct.
  if (NEVER_CACHE_HOSTS.indexOf(url.hostname) !== -1) {
    return;
  }

  // Pour la page principale : réseau en priorité (contenu toujours à jour),
  // avec le cache comme filet de sécurité si hors ligne.
  if (event.request.mode === 'navigate' || url.pathname.endsWith('beta.html')) {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
          return response;
        })
        .catch(function() {
          return caches.match(event.request).then(function(cached) {
            return cached || caches.match('./beta.html');
          });
        })
    );
    return;
  }

  // Tout le reste (images, polices, etc.) : cache d'abord, réseau en secours.
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request);
    })
  );
});
