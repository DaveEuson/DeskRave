// Minimal service worker — enough for installability + a fast shell.
// Caches the app shell; network-first for navigations so updates land, with the
// cached shell as the offline fallback. Streams/media are never cached.
const CACHE = "pixeldj-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // never intercept audio/media or our API (streams must pass straight through)
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/")));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
