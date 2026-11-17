// Service worker: caches the whole app at install so it opens and works with no connection.
const VERSION = "__VERSION__";
const CACHE = `fmt-${VERSION}`;
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("fmt-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// ignoreVary: static hosts often send "Vary: Origin"; module scripts carry an Origin header and would otherwise miss the cache.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  // Dictionary packs are large and stored in IndexedDB by the app, never in this cache.
  if (url.pathname.includes("/dict/")) return;
  if (req.mode === "navigate") {
    e.respondWith(caches.match("./index.html", { ignoreSearch: true, ignoreVary: true }).then((r) => r || caches.match("./", { ignoreVary: true })).then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((r) => r || fetch(req)));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow("./#/track"))));
});
