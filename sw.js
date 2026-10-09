/* Network-first shell strategy: fetch updates when online and fall back to cache offline. */
const CACHE_VERSION = 'ikigai-shell-v5';
const APP_SHELL = ['./','./index.html','./portal.html','./portal.css','./api-client.js','./portal.js','./reset-password.html','./reset-password.js','./manifest.webmanifest','./assets/brand/tokens.css','./assets/icons/ikigai-symbols.svg','./assets/ikigai-logo.jpg','./assets/pwa/icon-192.png','./assets/pwa/icon-512.png','./assets/pwa/icon-maskable-512.png','./assets/pwa/favicon-48.png','./assets/pwa/apple-touch-icon.png','./assets/social/og-image.png','./assets/illustrations/welcome.svg','./assets/illustrations/empty-members.svg','./assets/illustrations/offline.svg','./assets/illustrations/error-state.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Never cache API responses: they may contain authenticated personal or financial data.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;
  if (url.pathname.endsWith('/demo.html') || url.pathname.endsWith('/app.js') || url.pathname.endsWith('/styles.css')) return;
  if (request.cache === 'no-store') return;
  event.respondWith(
    fetch(request).then(response => {
      const cacheControl = response.headers.get('Cache-Control') || '';
      if (response.ok && response.type === 'basic' && !/\bno-store\b/i.test(cacheControl)) {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request).then(cached => cached || (request.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
