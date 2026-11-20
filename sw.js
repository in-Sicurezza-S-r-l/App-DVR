// Service worker: tiene una copia dei file dell'app per aprirla anche senza rete.
// Strategia: rete prima (così gli aggiornamenti arrivano subito), copia salvata se manca la rete.
// I dati di SharePoint (graph.microsoft.com) NON passano di qui: li gestisce l'app.
const CACHE = "pilota-dvr-app-v2";
const FILE = [
  "./", "./index.html", "./app.css", "./config.js", "./app.js", "./auth.js", "./dati.js",
  "./store.js", "./esempio.js", "./bozza.js", "./lib/msal-browser.min.js", "./manifest.webmanifest",
  "./icone/icona-192.png", "./icone/icona-512.png", "./icone/apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then(r => r || caches.match("./index.html")))
  );
});
