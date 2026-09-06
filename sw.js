// Service worker "Clics Optiques" — usage hors-ligne au stand.
// Incrémenter CACHE_VERSION à chaque mise à jour du contenu.
const CACHE_VERSION = "v3";
const CACHE_NAME = "clics-optiques-" + CACHE_VERSION;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// On met en cache les réponses de même origine ("basic") ET les réponses
// cross-origin autorisées ("cors") : les polices Google conditionnent la
// lisibilité de l'appli et doivent survivre à l'absence de réseau.
// L'ancienne version ne gardait que "basic" : les polices n'étaient donc
// jamais mises en cache et retombaient sur les polices système au stand.
function isCacheable(response) {
  return response && response.status === 200 &&
         (response.type === "basic" || response.type === "cors");
}

function putInCache(request, response) {
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(function(){});
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  // La page elle-même : réseau d'abord, cache en secours. Un lancement avec du
  // réseau donne ainsi toujours la version la plus récente — plus besoin
  // d'ouvrir l'appli deux fois après une mise à jour — et un lancement sans
  // réseau repart du cache.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (isCacheable(response)) { putInCache(request, response); }
          return response;
        })
        .catch(function () {
          return caches.match(request)
            .then(function (cached) { return cached || caches.match("./index.html"); })
            .then(function (cached) { return cached || Response.error(); });
        })
    );
    return;
  }

  // Le reste (polices, styles, icônes) : cache d'abord pour une réponse
  // instantanée, rafraîchi en arrière-plan dès qu'il y a du réseau.
  // On ne renvoie jamais "undefined" à respondWith, ce qui provoquerait une
  // erreur réseau brutale au lieu d'un échec propre.
  event.respondWith(
    caches.match(request).then(function (cached) {
      const network = fetch(request)
        .then(function (response) {
          if (isCacheable(response)) { putInCache(request, response); }
          return response;
        })
        .catch(function () { return cached || Response.error(); });
      return cached || network;
    })
  );
});
