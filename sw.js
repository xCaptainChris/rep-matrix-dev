// REP MATRIX Service Worker — offline app shell caching
const CACHE_NAME = 'rep-matrix-v2';

// Install: take over immediately
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Pre-cache the app shell + key assets
            return cache.addAll([
                './',
                './index.html',
                './manifest.json',
                './icon-192.png',
                './icon-512.png'
            ]).catch(() => {});
        })
    );
});

// Activate: clean up old cache versions
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch strategy:
// - Google Apps Script API calls: network only, never cached
//   (the app has its own localStorage cache + offline submit queue)
// - Page navigations: network first (so updates propagate), cache fallback
//   (so the app cold-starts offline)
// - Everything else: cache first, then network
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Never intercept the data API — let the app's own offline logic handle failures
    if (url.hostname.includes('script.google.com') || url.hostname.includes('googleusercontent.com')) {
        return;
    }

    // App shell navigation: network-first with cache fallback
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                    return response;
                })
                .catch(() =>
                    caches.match(event.request).then((cached) => cached || caches.match('./'))
                )
        );
        return;
    }

    // Static assets: cache-first
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                // Only cache successful same-origin responses
                if (response.ok && url.origin === self.location.origin) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                }
                return response;
            });
        })
    );
});
