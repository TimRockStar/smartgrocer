// SmartGrocer — Service Worker
// ============================================================
// Objectif simple et prudent : permettre à l'app de se recharger même
// hors ligne (l'écran principal, la liste déjà sauvegardée, etc.), sans
// jamais mettre en cache les appels aux APIs externes (Groq, Stripe/Apps
// Script, Open Food Facts) — ces données doivent toujours être fraîches,
// jamais servies depuis un vieux cache.
//
// IMPORTANT : le numéro de version ci-dessous doit être changé à CHAQUE
// mise à jour de ce fichier — c'est ce qui force les téléphones des
// utilisateurs à vraiment recharger la dernière version de l'app, sans
// qu'ils aient besoin de vider leur cache manuellement.
const CACHE_NAME = 'smartgrocer-v2';
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
  //
  // IMPORTANT : {cache: 'no-store'} force un vrai appel réseau, en ignorant
  // complètement le cache HTTP du navigateur (une couche séparée du cache
  // du service worker) — sans ça, le navigateur pouvait répondre avec une
  // ancienne version même quand le service worker "pensait" aller au réseau.
  if (event.request.mode === 'navigate' || url.pathname.endsWith('beta.html')) {
    event.respondWith(
      fetch(event.request, {cache: 'no-store'})
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
