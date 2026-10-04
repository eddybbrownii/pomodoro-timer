// Network-first: always try to load the latest version, and fall back to the
// cached copy only when offline. Bump CACHE_NAME when the asset list changes.
const CACHE_NAME = 'flow-timer-v5';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener ('install', event => {
  event.waitUntil (
    caches
      .open (CACHE_NAME)
      .then (cache => cache.addAll (ASSETS))
      .then (() => self.skipWaiting ())
  );
});

self.addEventListener ('activate', event => {
  event.waitUntil (
    caches
      .keys ()
      .then (keys =>
        Promise.all (
          keys
            .filter (key => key !== CACHE_NAME)
            .map (key => caches.delete (key))
        )
      )
      .then (() => self.clients.claim ())
  );
});

self.addEventListener ('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL (request.url).origin !== self.location.origin) return;

  event.respondWith (
    fetch (request)
      .then (response => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone ();
          caches.open (CACHE_NAME).then (cache => cache.put (request, copy));
        }
        return response;
      })
      .catch (() =>
        caches
          .match (request, {ignoreSearch: true})
          .then (cached => cached || caches.match ('./index.html'))
      )
  );
});
