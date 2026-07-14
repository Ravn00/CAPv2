const CACHE = "capv2-v5";
const URLS = ["index.html", "manifest.json",
  "css/styles.css",
  "js/config.js?v=2", "js/supabase.js?v=2", "js/constants.js?v=2",
  "js/license.js?v=2", "js/init.js?v=2", "js/ai.js?v=2",
  "js/ui.js?v=2", "js/backup.js?v=2", "js/health.js?v=2", "js/diag.js?v=2",
  "js/app.js?v=2"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // API calls: network only
  if (url.hostname.endsWith("supabase.co")) return;
  // App shell: network first
  if (url.pathname === "/CAPv2/" || url.pathname === "/CAPv2/index.html") {
    e.respondWith(
      fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); return r; })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // Everything else: stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchP = fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); return r; });
      return cached || fetchP;
    })
  );
});