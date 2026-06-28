/* GeonicDB live-deck — service worker DISABLED (self-destroying kill switch).
   The previous SW cached the app shell and kept serving stale JS/CSS during
   development. This replacement registers NO fetch handler, so it never serves
   anything from cache. On activation it deletes only THIS app's caches (by the
   "geonicdb-livedeck" name prefix, so other same-origin apps are left intact),
   takes control of open tabs, unregisters itself, and reloads those tabs so they
   pick up fresh, network-served files. Browsers automatically re-fetch sw.js on
   navigation, so any browser that still has the old caching SW will receive this
   kill switch on its next visit and clean itself up. */
var CACHE_PREFIX = "geonicdb-livedeck";

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      // Delete each cache independently so one rejection can't abort the
      // self-disable path below (claim → unregister → reload must always run).
      .then(function (keys) {
        return Promise.all(keys
          .filter(function (k) { return k.indexOf(CACHE_PREFIX) === 0; })
          .map(function (k) { return caches.delete(k).catch(function () {}); }));
      })
      .catch(function () {})
      .then(function () { return self.clients.claim(); })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll({ type: "window" }); })
      .then(function (clients) {
        clients.forEach(function (c) {
          if (c.navigate) c.navigate(c.url); // reload tabs so SW control is dropped
        });
      })
      .catch(function () {})
  );
});
