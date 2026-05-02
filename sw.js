// sw.js — service worker for offline support.
// Strategy:
//   - HTML / start_url: network-first, fallback to cache.
//   - Static assets (js/css/icons/manifest): cache-first, lazy populate.
//   - CDN assets (Chart.js, pdf.js, fonts): cache-first.
//   - Sheets API / OAuth: NEVER cache (always live).
//   - On install: precache the app shell.

const VERSION = 'fpwa-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/config.js',
  './js/utils.js',
  './js/store.js',
  './js/parsers.js',
  './js/voice.js',
  './js/pdf.js',
  './js/dashboard.js',
  './js/google.js',
  './js/ui.js',
  './js/app.js',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

const NEVER_CACHE = [
  'sheets.googleapis.com',
  'oauth2.googleapis.com',
  'accounts.google.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(SHELL).catch(err => {
      // Don't fail SW install if one URL fails; just log.
      console.warn('SW precache partial:', err);
    }))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache live Google APIs
  if (NEVER_CACHE.some(host => url.hostname.includes(host))) return;

  // Navigation = network first
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match('./index.html');
      }
    })());
    return;
  }

  // Cache first for everything else (assets + CDN)
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      // Only cache same-origin or known CDN
      if (fresh.ok && (url.origin === self.location.origin
                       || url.hostname.endsWith('cloudflare.com')
                       || url.hostname.endsWith('googleapis.com')
                       || url.hostname.endsWith('gstatic.com'))) {
        const cache = await caches.open(VERSION);
        cache.put(req, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch {
      return cached || Response.error();
    }
  })());
});

// Background sync: when the queue contains Sheets ops, the page itself flushes
// them when back online (via window 'online' event). The SW just keeps the
// shell available offline.
