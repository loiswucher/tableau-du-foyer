// Service worker du Tableau du Foyer.
// Objectif : l'appli s'ouvre instantanément et fonctionne sans réseau.
const CACHE = "foyer-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(["./", "./index.html", "./manifest.webmanifest"]).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  // Navigation : on tente le réseau (pour avoir les mises à jour), sinon le cache
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((r) => { caches.open(CACHE).then((c) => c.put(request, r.clone())); return r; })
        .catch(() => caches.match(request).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // Ressources : cache d'abord (rapide), mise à jour en arrière-plan
  e.respondWith(
    caches.match(request).then((cached) => {
      const fresh = fetch(request)
        .then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(request, r.clone())); return r; })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
