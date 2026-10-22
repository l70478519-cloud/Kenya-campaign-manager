/* Public application files only. Never cache authenticated API responses. */
const PREFIX = 'kenya-shell-';
const CACHE = PREFIX + 'v1';
const STATIC = ['/offline.html', '/pwa.css', '/pwa-install.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch('/precache.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Offline asset list unavailable');
    const assets = await response.json();
    const cache = await caches.open(CACHE);
    await cache.addAll([...STATIC, ...assets.filter(path => /^\/assets\/[\w.-]+\.(js|css)$/.test(path))]);
    // No automatic skipWaiting: open forms keep their current application version.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Keep hashed assets from the previous release for any still-open page.
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/s/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.open(CACHE)).match('/offline.html')));
    return;
  }
  // Cache-first only for content-hashed JS/CSS and the explicit public install files.
  const hashed = /^\/assets\/[\w.-]+-[\w-]+\.(js|css)$/.test(url.pathname);
  if (!hashed && !STATIC.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(url.pathname);
    if (hit) return hit;
    const response = await fetch(request);
    if (response.ok && response.type !== 'opaque') await cache.put(url.pathname, response.clone());
    return response;
  })());
});
