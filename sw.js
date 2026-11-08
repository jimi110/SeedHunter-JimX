// Service worker de SeedHunter Jimx: permite instalar la app y abrirla sin conexion.
// Solo guarda en cache los archivos de la propia app (codigo, .wasm, iconos). NO guarda datos del usuario.
// Estrategia: red primero (siempre la version nueva si hay conexion), cache como respaldo sin conexion.
const CACHE = 'seedhunter-jimx-v0.3.0';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png',
  'app.js', 'app-state.js', 'biome-engine.js', 'collision-engine.js', 'configuration.js', 'cpu-engine.js',
  'export-engine.js', 'feasibility-engine.js', 'game-data.js', 'gpu-engine.js', 'icons.js', 'loot-engine.js',
  'map-engine.js', 'minecraft-versions.js', 'pwa.js', 'rarity-engine.js', 'search-controller.js', 'search-engine.js',
  'search-worker.js', 'structure-engine.js', 'ui-analysis.js', 'ui-results.js', 'ui-rules.js', 'utilities.js',
  'wasm-engine.js', 'seedhunter-engine.wasm', 'seedhunter-engine-simd.wasm',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('seedhunter-jimx-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((m) => m || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});
