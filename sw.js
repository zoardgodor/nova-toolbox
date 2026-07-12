/* Nova Toolbox — Service Worker
   Cache-first strategy for the app shell so the toolbox keeps working offline.
   Bump CACHE_VERSION whenever any cached file changes to force an update. */

const CACHE_VERSION = "nova-toolbox-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./translations.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(APP_SHELL).catch(() => {
        /* Ignore missing optional assets (e.g. icons not added yet) so install still succeeds */
        return Promise.all(
          APP_SHELL.map((url) =>
            cache.add(url).catch((err) => console.warn("[sw] skip", url, err))
          )
        );
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle same-origin GET requests; let everything else (e.g. REST API Tester calls) pass through.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached || caches.match("./index.html"));

      // Cache-first: serve cached copy instantly, refresh cache in background.
      return cached || networkFetch;
    })
  );
});
