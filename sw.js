/* ===================================================================
   sw.js — Service Worker for offline + caching
   ===================================================================
   Strategy:
   - App shell (HTML, CSS, JS) → cache-first (instant load)
   - Google Fonts → stale-while-revalidate
   - Other → network-first
   เปลี่ยน VERSION เพื่อ force update ทุก deploy
   =================================================================== */

const VERSION = 'diary-v1.0.0';
const SHELL_CACHE = `shell-${VERSION}`;
const FONT_CACHE  = `fonts-${VERSION}`;

/** ไฟล์ที่ cache ตอน install */
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/state.js',
  './js/utils.js',
  './js/icons.js',
  './js/views.js',
  './js/add.js',
  './icons/icon.svg'
];


/* === Install: pre-cache shell =================================== */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});


/* === Activate: clean old caches ================================= */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => ![SHELL_CACHE, FONT_CACHE].includes(k))
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});


/* === Fetch: routing ============================================= */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ไม่ cache POST, ไม่ cache cross-origin ที่ไม่ใช่ฟอนต์
  if (request.method !== 'GET') return;

  // Google Fonts → stale-while-revalidate
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  // Same-origin → cache-first สำหรับ shell, network-first สำหรับอื่นๆ
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
  }
});


/* === Caching strategies ========================================= */

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (e) {
    // Offline fallback — ถ้าขอ HTML แต่ไม่มี cache, return index.html
    if (request.destination === 'document') {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    throw e;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}
