/* Network-first shell strategy: fetch updates when online and fall back to cache offline. */
const CACHE_VERSION = 'ikigai-shell-v26';
const APP_SHELL = ['./','./index.html','./portal.html','./portal.css','./api-client.js','./tour.js','./iron-pixel.js','./portal.js','./reset-password.html','./reset-password.js','./accept-invitation.html','./accept-invitation.js','./sw-register.js','./assets/fonts/fonts.css','./assets/fonts/bebas-neue-400.woff2','./assets/fonts/rajdhani-400.woff2','./assets/fonts/rajdhani-500.woff2','./assets/fonts/rajdhani-600.woff2','./assets/fonts/rajdhani-700.woff2','./manifest.webmanifest','./assets/brand/tokens.css','./assets/icons/ikigai-symbols.svg','./assets/ikigai-logo.jpg','./assets/pwa/icon-192.png','./assets/pwa/icon-512.png','./assets/pwa/icon-maskable-512.png','./assets/pwa/favicon-48.png','./assets/pwa/apple-touch-icon.png','./assets/social/og-image.png','./assets/illustrations/welcome.svg','./assets/illustrations/empty-members.svg','./assets/illustrations/offline.svg','./assets/illustrations/error-state.svg'];

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
  if (/(^|\/)api(?:\/|$)/.test(url.pathname)) return;
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

// Notificaciones push de avisos: el servidor manda el mensaje cifrado y aca se muestra.
// Siempre se muestra una notificacion por cada push (iOS revoca el permiso a las apps que no lo hacen).
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Ikigai Training';
  const body = typeof data.body === 'string' && data.body ? data.body : 'Tenés un aviso nuevo del gimnasio.';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: './assets/pwa/icon-192.png',
    tag: data.id ? `aviso-${data.id}` : 'ikigai-aviso',
    data: { url: './portal.html#announcements' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './portal.html#announcements', self.location.href).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const open = windows.find(client => new URL(client.url).pathname.endsWith('/portal.html'));
    if (open) { open.postMessage({ type: 'open-announcements' }); return open.focus(); }
    return self.clients.openWindow(target);
  }));
});
