/* ===================================================================
   sw.js — Service Worker for offline + caching
   ===================================================================
   Strategy:
   - App shell (HTML, CSS, JS, fonts) → cache-first (instant load)
   - Other → network-first
   เปลี่ยน VERSION เพื่อ force update ทุก deploy
   =================================================================== */

const VERSION = 'diary-v6.25.53';
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
  './js/views-shared.js',
  './js/add.js',
  './js/voice.js',
  './js/slip.js',
  './js/chart.js',
  './js/recurring.js',
  './js/onboarding.js',
  './js/drive.js',
  './js/reminders.js',
  './js/notify.js',
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


/* === Recurring-due notifications (Periodic Background Sync) ======
   Android + installed PWA เท่านั้น — Chrome ปลุก SW เป็นระยะ (~12 ชม.+)
   อ่านข้อมูล recurring จาก IndexedDB ที่ notify.js mirror ไว้
   (SW อ่าน localStorage ไม่ได้) แล้วเด้ง notification พร้อมเสียงระบบ
   Dedupe ผ่าน key `${id}|${next_due}|${phase}` ใน IDB — รูปแบบเดียวกับ
   notify.js ฝั่งแอป จะได้ไม่เด้งซ้ำกับตอนผู้ใช้เปิดแอปเอง
================================================================== */

const NOTIFY_DB = 'diary-notify';
const NOTIFY_STORE = 'kv';

function notifyDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NOTIFY_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(NOTIFY_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function notifyGet(db, key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(NOTIFY_STORE, 'readonly').objectStore(NOTIFY_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function notifySet(db, key, val) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTIFY_STORE, 'readwrite');
    tx.objectStore(NOTIFY_STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function swTodayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function swDaysUntil(iso, today) {
  const [y1, m1, d1] = today.split('-').map(Number);
  const [y2, m2, d2] = iso.split('-').map(Number);
  return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
}

function swBaht(satang) {
  return (satang / 100).toLocaleString('th-TH', { maximumFractionDigits: 2 });
}

function swDueLabel(diffDays) {
  if (diffDays <= 0) return 'ครบกำหนดวันนี้';
  if (diffDays === 1) return 'ครบกำหนดพรุ่งนี้';
  return `ครบกำหนดในอีก ${diffDays} วัน`;
}

async function checkRecurringDue() {
  let db;
  try {
    db = await notifyDB();
    const data = await notifyGet(db, 'notify-data');
    if (!data || !data.cfg || data.cfg.enabled === false) return;

    const today = swTodayISO();
    const daysAhead = data.cfg.daysAhead ?? 1;
    const notified = (await notifyGet(db, 'notified')) || {};
    let changed = false;

    for (const t of (data.templates || [])) {
      const diff = swDaysUntil(t.next_due, today);
      if (diff < 0 || diff > daysAhead) continue;

      const phase = diff <= 0 ? 'due' : 'pre';
      const key = `${t.id}|${t.next_due}|${phase}`;
      if (notified[key]) continue;

      // ไม่ใช้ emoji นำหน้า title — กัน Chrome flag ว่าอาจเป็นสแปม (เหมือน notify.js)
      await self.registration.showNotification(t.description || 'รายการประจำ', {
        body: `${swDueLabel(diff)} ${swBaht(t.amount)} ฿ — จากรายการประจำที่คุณตั้งไว้`,
        tag: `diary-recur-${t.id}`,
        icon: './icons/icon.svg',
        badge: './icons/icon.svg',
        vibrate: [200, 100, 200],
        data: { view: 'settings', acc: 'recurring' }
      });
      notified[key] = t.next_due;
      changed = true;
    }

    if (changed) await notifySet(db, 'notified', notified);
  } catch (e) {
    console.warn('[sw] checkRecurringDue failed', e);
  } finally {
    db?.close();
  }
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'recurring-check') {
    event.waitUntil(checkRecurringDue());
  }
});

/* กด notification → focus แอปที่เปิดอยู่ หรือเปิดหน้าต่างใหม่ */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow('./');
    })
  );
});

