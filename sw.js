/* ===================================================================
   sw.js — Service Worker for offline + caching
   ===================================================================
   Strategy:
   - App shell (HTML, CSS, JS, fonts) → cache-first (instant load)
   - Other → network-first
   เปลี่ยน VERSION เพื่อ force update ทุก deploy
   =================================================================== */

const VERSION = 'diary-v6.25.26';
const SHELL_CACHE = `shell-${VERSION}`;

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
  './js/voice.js',
  './js/slip.js',
  './js/chart.js',
  './js/recurring.js',
  './js/onboarding.js',
  './js/drive.js',
  './js/reminders.js',
  './js/catchup.js',
  './js/aha-moments.js',
  './js/coach-mark.js',
  './js/parsers.js',
  './js/export.js',
  './js/demo-data.js',
  './js/lib/pdf.min.mjs',
  './js/lib/pdf.worker.min.mjs',
  './icons/icon.svg',
  // Self-hosted fonts — loaded once, always available offline
  './fonts/sarabun-300-thai.woff2',
  './fonts/sarabun-400-thai.woff2',
  './fonts/sarabun-500-thai.woff2',
  './fonts/sarabun-600-thai.woff2',
  './fonts/sarabun-700-thai.woff2',
  './fonts/sarabun-300-latin.woff2',
  './fonts/sarabun-400-latin.woff2',
  './fonts/sarabun-500-latin.woff2',
  './fonts/sarabun-600-latin.woff2',
  './fonts/sarabun-700-latin.woff2',
  './fonts/mali-400-thai.woff2',
  './fonts/mali-500-thai.woff2',
  './fonts/mali-400-latin.woff2',
  './fonts/mali-500-latin.woff2',
  './fonts/noto-sans-thai-thai.woff2',
  './fonts/noto-sans-thai-latin-ext.woff2',
  './fonts/noto-sans-thai-latin.woff2'
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
          .filter(k => k !== SHELL_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});


/* === Message: ตอบกลับเวอร์ชันให้หน้าเว็บ ======================== */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: VERSION });
  }
});


/* === Fetch: routing ============================================= */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ไม่ cache POST และ cross-origin requests
  if (request.method !== 'GET') return;

  // Same-origin → cache-first (fonts + shell + everything)
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

