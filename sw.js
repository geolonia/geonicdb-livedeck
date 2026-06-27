/* GeonicDB live-deck — service worker (PWA offline shell) */
var CACHE = "geonicdb-livedeck-v2";

// App shell precached on install. Live-demo data (GeonicDB API, map tiles,
// fonts, SDK CDN) is cross-origin and intentionally left to the network.
var CORE = [
  "./",
  "index.html",
  "styles.css",
  "config.js",
  "slides.js",
  "aed-map.js",
  "temporal.js",
  "survey.js",
  "dual.js",
  "manifest.webmanifest",
  "assets/geonicdb-sdk.iife.js",
  "assets/map-style.json",
  "assets/context-broker-illustration.svg",
  "assets/future-city.svg",
  "assets/geonic-logo-dark.svg",
  "assets/geonic-logo-h-dark.svg",
  "assets/geonic-mark.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/icon-180.png",
  "assets/og-image.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(CORE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // network for API / tiles / CDN
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        // offline navigation fallback to the app shell
        if (req.mode === "navigate") return caches.match("index.html");
      });
    })
  );
});
