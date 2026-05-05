/**
 * Retina Review — Service Worker
 *
 * Strategy:
 *   - On install: pre-cache the core shell (HTML, manifest, icons).
 *   - On runtime: cache-first for everything except analytics.
 *     Images cache lazily as the resident encounters them while studying online,
 *     so anything they've seen is available offline.
 *   - On deploy: bump CACHE_VERSION below to force a clean cache rebuild.
 *
 * BUMP THIS NUMBER ON EACH DEPLOY THAT INCLUDES NEW QUESTIONS OR CHANGES TO index.html
 */
const CACHE_VERSION = "retina-review-v6";

// Files to grab during install. Keep this list small —  if any of them fail
// to fetch, the entire install fails. Images are intentionally NOT here;
// they cache opportunistically as the user encounters them.
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./apple-touch-icon.png",
  "./favicon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];

// --- Install: pre-cache the shell ---
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())  // take control on next page load
  );
});

// --- Activate: nuke old caches, take control of open tabs ---
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
        )
      ),
      self.clients.claim()
    ])
  );
});

// --- Fetch: cache-first for our origin, network-only for analytics ---
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Don't cache analytics — let them hit the network normally.
  // GoatCounter requests will also fail silently when offline, which is fine.
  if (url.hostname.includes("goatcounter") || url.hostname.includes("zgo.at")) {
    return; // browser handles normally
  }

  // Only handle GETs from our own origin
  if (req.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Stale-while-revalidate for HTML so deploys propagate fast
        if (req.destination === "document" || req.url.endsWith(".html")) {
          fetch(req).then((fresh) => {
            if (fresh.ok) {
              caches.open(CACHE_VERSION).then((c) => c.put(req, fresh));
            }
          }).catch(() => {});
        }
        return cached;
      }
      // Not in cache — fetch and cache (this is how images warm up over time)
      return fetch(req).then((fresh) => {
        if (fresh.ok && fresh.type === "basic") {
          const clone = fresh.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, clone));
        }
        return fresh;
      }).catch(() => {
        // Offline + not cached — let the page's onerror fallback render
        return new Response("", { status: 503, statusText: "offline" });
      });
    })
  );
});
