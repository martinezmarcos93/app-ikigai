/* Network-first shell strategy: fetch updates when online and fall back to cache offline. */
const CACHE_VERSION = 'ikigai-shell-v4';
const APP_SHELL = ['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./assets/brand/tokens.css','./assets/icons/ikigai-symbols.svg','./assets/ikigai-logo.jpg','./assets/pwa/icon-192.png','./assets/pwa/icon-512.png','./assets/pwa/icon-maskable-512.png','./assets/pwa/favicon-48.png','./assets/pwa/apple-touch-icon.png','./assets/social/og-image.png','./assets/illustrations/welcome.svg','./assets/illustrations/empty-members.svg','./assets/illustrations/offline.svg','./assets/illustrations/error-state.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request).then(cached => cached || (request.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
