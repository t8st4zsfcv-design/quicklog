// QuickLog Service Worker V2.2
// Strategy:
//   - GET requests for app shell (HTML/CSS/JS/icons): cache-first with network fallback
//   - API requests (/api/*): network-only (no caching)
//   - Other requests: network-first with cache fallback (offline support)

const CACHE_NAME = "quicklog-v2-2";
const APP_VERSION = "V2.2";
const CORE_SHELL = [
  "/",
  "/index.html",
  `/dennik.css?v=${APP_VERSION}`,
  `/dennik-turbo.css?v=${APP_VERSION}`,
  `/dennik.jsx?v=${APP_VERSION}`,
  `/manifest.webmanifest?v=${APP_VERSION}`
];
const OPTIONAL_SHELL = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-192-maskable.png",
  "/icons/icon-512-maskable.png",
  "/icons/apple-touch-icon.png"
];
const APP_SHELL_PATHS = new Set([
  "/",
  "/index.html",
  "/dennik.css",
  "/dennik-turbo.css",
  "/dennik.jsx",
  "/manifest.webmanifest"
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cacheCoreShell(cache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(JSON.stringify({
        error: "Server is unreachable. Check internet and try again.",
        code: "network_unavailable"
      }), {
        status: 503,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store"
        }
      }))
    );
    return;
  }

  if (event.request.method !== "GET") return;

  if (isNavigationRequest(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put("/", clone.clone());
              cache.put("/index.html", clone);
            });
          }
          return response;
        })
        .catch(() => (
          caches.match("/", { ignoreSearch: false })
            .then((cached) => cached || caches.match("/index.html", { ignoreSearch: false }))
            .then((cached) => cached || new Response("Offline", { status: 503 }))
        ))
    );
    return;
  }

  if (isAppShellRequest(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: false })
          .then((cached) => cached || new Response("Offline", { status: 503 })))
    );
    return;
  }

  // Network-first with cache fallback for non-shell assets
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Update cache for successful same-origin responses
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || new Response("Offline", { status: 503 })))
  );
});

function isAppShellRequest(url) {
  if (url.origin !== self.location.origin) return false;
  if (APP_SHELL_PATHS.has(url.pathname)) return true;
  return url.pathname.startsWith("/icons/");
}

async function cacheCoreShell(cache) {
  for (const path of CORE_SHELL) {
    const request = new Request(path, { cache: "reload" });
    const response = await fetch(request);
    if (!response.ok) throw new Error(`Failed to precache ${path}`);
    await cache.put(request, response);
  }

  await Promise.allSettled(
    OPTIONAL_SHELL.map(async (path) => {
      const request = new Request(path, { cache: "reload" });
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response);
    })
  );
}

function isNavigationRequest(request) {
  if (request.mode === "navigate") return true;
  if (request.destination === "document") return true;
  return request.headers.get("accept")?.includes("text/html");
}
