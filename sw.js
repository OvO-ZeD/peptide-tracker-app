self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open("peptide-tracker-v1").then(function(cache) {
      return cache.addAll(["/", "/style.css", "/script.js", "/manifest.webmanifest"]);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(key) {
          if (key !== "peptide-tracker-v1") {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function(event) {
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }
        var responseClone = response.clone();
        caches.open("peptide-tracker-v1").then(function(cache) {
          cache.put(event.request, responseClone);
        });
        return response;
      });
    })
  );
});