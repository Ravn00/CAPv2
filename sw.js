const CACHE = "capv2-v4";
const URLS = ["index.html", "manifest.json",
  "css/styles.css",
  "js/config.js", "js/supabase.js", "js/constants.js",
  "js/license.js", "js/init.js", "js/ai.js",
  "js/ui.js", "js/backup.js", "js/health.js", "js/diag.js",
  "js/app.js"];

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