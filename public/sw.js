/*
 * Sehati service worker.
 *
 * Deliberately small. It caches ONLY public, non-personal files:
 *   - hashed build assets under /_next/static/ (cache-first; the hash changes when content does),
 *   - the web app manifest and app icons (stale-while-revalidate),
 *   - the /offline page, shown when a page cannot be loaded without a network.
 * Pages, Server Actions, React Server Component payloads, API routes, invitation media and
 * payments always go to the network and are never stored, so no wedding data ends up in a cache.
 */
const VERSION = "v1";
const STATIC_CACHE = `sehati-static-${VERSION}`;
const SHELL_CACHE = `sehati-shell-${VERSION}`;
const OFFLINE_URL = "/offline";
const SHELL_URLS = [OFFLINE_URL, "/manifest.webmanifest", "/pwa-icon/192", "/pwa-icon/512"];

/** "static" | "shell" | "navigate" | "bypass" — pure, unit-tested. */
function classifyRequest(url, request, origin) {
  if (request.method !== "GET") return "bypass";
  if (url.origin !== origin) return "bypass";
  if (request.headers.get("RSC") || request.headers.get("Next-Router-State-Tree") || url.searchParams.has("_rsc")) return "bypass";
  if (request.mode === "navigate") return "navigate";
  if (url.pathname.startsWith("/_next/static/")) return "static";
  if (url.pathname === "/manifest.webmanifest" || url.pathname.startsWith("/pwa-icon/")) return "shell";
  return "bypass";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith("sehati-") && key !== STATIC_CACHE && key !== SHELL_CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok && response.type === "basic") cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

async function networkWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const offline = await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE });
    if (offline) return offline;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const kind = classifyRequest(url, event.request, self.location.origin);
  if (kind === "static") event.respondWith(cacheFirst(event.request));
  else if (kind === "shell") event.respondWith(staleWhileRevalidate(event.request));
  else if (kind === "navigate") event.respondWith(networkWithOfflineFallback(event.request));
  // "bypass": do not call respondWith — the browser handles the request as if there were no worker.
});
