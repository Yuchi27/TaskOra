const CACHE = "tmapp-v2"; // bumpa ni nga number (v3, v4...) kada dako nga deploy/structural change
const ASSETS = [
  "/index.html",
  "/pages/auth.html",
  "/pages/dashboard.html",
  "/pages/tasks.html",
  "/pages/calendar.html",
  "/pages/schedule.html",
  "/pages/settings.html",
  "/pages/analytics.html",
  "/styles/main.css",
  "/styles/auth.css",
  "/styles/dashboard.css",
  "/styles/tasks.css",
  "/styles/calendar.css",
  "/styles/schedule.css",
  "/styles/settings.css",
  "/styles/analytics.css",
  "/styles/darkmode.css",
  "/styles/responsive.css",
  "/scripts/firebase.js",
  "/scripts/auth.js",
  "/scripts/dashboard.js",
  "/scripts/tasks.js",
  "/scripts/calendar.js",
  "/scripts/schedule.js",
  "/scripts/settings.js",
  "/scripts/analytics.js",
  "/scripts/nav.js",
  "/scripts/loader.js",
  "/scripts/theme.js",
  "/scripts/pwa.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Pwede pud i-trigger gikan sa page side (pwa.js) para pugson mag-activate
// dayon ang bag-ong SW imbes maghulat sa tanan tabs nga masirado.
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});