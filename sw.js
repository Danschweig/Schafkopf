// ─────────────────────────────────────────────────────────────────
// Schafkopf PWA Service Worker
//
// WICHTIG FÜR UPDATES: Wenn du eine neue Version der App deployst,
// ändere die Versionsnummer in CACHE_NAME (z.B. v2, v3 ...).
// Das erzwingt dass alle Nutzer die neue Version laden.
// ─────────────────────────────────────────────────────────────────
const CACHE_NAME = 'schafkopf-v1';

// Lokale Dateien – werden beim ersten Start gecacht
const LOCAL_FILES = [
  './schafkopf.html',
  './manifest.json',
  './icon.svg',
];

// CDN-Bibliotheken – werden beim ersten Abruf gecacht
const CDN_URLS = [
  'https://unpkg.com/react@18/umd/react.development.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.development.js',
  'https://unpkg.com/prop-types@15/prop-types.min.js',
  'https://unpkg.com/recharts@2.12.7/umd/Recharts.js',
  'https://unpkg.com/@babel/standalone@7.23.10/babel.min.js',
  'https://unpkg.com/lz-string@1.5.0/libs/lz-string.min.js',
];

// ── Install: lokale Dateien sofort cachen ────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(LOCAL_FILES))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: alte Cache-Versionen löschen ───────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: Cache-Strategie je nach Quelle ───────────────────────
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Nur GET-Requests behandeln
  if (event.request.method !== 'GET') return;

  // CDN-Ressourcen: Network-first, Cache als Fallback
  if (CDN_URLS.some(cdn => url.startsWith(cdn.slice(0, 30)))) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Lokale Dateien: Cache-first, Network als Fallback
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
  );
});
