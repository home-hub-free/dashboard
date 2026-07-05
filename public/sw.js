/* HomeHubFree service worker.
 *
 * Purpose: make repeat loads and especially the home-screen (standalone PWA) launch
 * fast. A standalone iOS/Android web app runs in its own WebView with a cold cache,
 * so without this it re-downloaded + re-parsed the whole bundle on every launch.
 *
 * Strategy:
 *   • /assets/*  — Vite content-hashed, immutable → cache-first (served instantly).
 *   • navigations / "/" shell — network-first, fall back to cached shell offline
 *     (so a new deploy is always picked up when online).
 *   • live API/service routes — passthrough, never cached (always hit the network).
 *
 * VERSION is stamped per build (vite.config.js replaces __BUILD_VERSION__), so every
 * deploy changes this file's bytes → the browser installs a new worker and `activate`
 * drops the previous build's caches. (Falls back to a constant for the un-stamped dev
 * copy served straight from public/.)
 */
const VERSION = "hhf-__BUILD_VERSION__";
const SHELL = "shell-" + VERSION;
const ASSETS = "assets-" + VERSION;

const SHELL_URLS = [
  "/", "/manifest.webmanifest", "/home.svg",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon-180.png",
];

// Live backends + the deploy stamp — must always go to the network (never cached),
// so the version guard reads the *deployed* version, not a cached one.
const BYPASS = [
  /^\/api\//, /^\/gateway\//, /^\/voice\//, /^\/tts\//, /^\/memory\//,
  /^\/vision\//, /^\/speaker\//, /^\/calendar\//, /^\/version\.json$/,
];

// Let the page tell a waiting worker to take over immediately (main.ts posts this
// when it detects an update), so a new build activates without a manual close.
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;       // cross-origin → passthrough
  if (BYPASS.some((re) => re.test(url.pathname))) return; // live API/services → passthrough

  // Immutable content-hashed assets: cache-first.
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.open(ASSETS).then((cache) =>
        cache.match(req).then((hit) =>
          hit || fetch(req).then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
        )
      )
    );
    return;
  }

  // Navigations / app shell: network-first, fall back to cache (offline), then "/".
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/")))
    );
    return;
  }

  // Other same-origin GETs (icons, manifest, svg): cache-first, fall back to network.
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
