/* Increment when the public offline page changes. Never cache authenticated HTML, API or uploaded photos. */
const CACHE = "sorow-offline-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("sorow-offline-") && key !== CACHE).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || request.mode !== "navigate" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE)) || new Response("인터넷 연결을 확인한 뒤 다시 시도해 주세요.", {
    status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
  })));
});
