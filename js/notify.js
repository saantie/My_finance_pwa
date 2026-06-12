/* ===================================================================
   notify.js — system notifications (เด้ง + เสียงระบบ) + background check
   ===================================================================
   ระดับ 1: ตอนเปิดแอป — reminders.js เรียก notifyRecurringDue() →
            เด้ง notification ผ่าน SW registration (Android เล่นเสียงระบบเอง)
   ระดับ 2: ตอนแอปปิด — Periodic Background Sync (Android + installed PWA):
            sw.js ตื่นมาอ่านข้อมูลจาก IndexedDB แล้วเด้งเอง

   ⚠️ Service worker อ่าน localStorage ไม่ได้ → ต้อง mirror ข้อมูล
   recurring templates + config ลง IndexedDB (syncNotifyData) ทุกครั้งที่เปลี่ยน
   Dedupe: key `${id}|${next_due}|${phase}` ใน IDB — เตือน 1 ครั้งตอนใกล้ครบ
   ('pre') + 1 ครั้งวันครบกำหนด ('due') ต่อ 1 งวด ไม่ spam ซ้ำ
   =================================================================== */

import * as State from './state.js';
import * as Recurring from './recurring.js';
import { todayISO, offsetDateISO, formatBaht, parseLocalDate } from './utils.js';

const DB_NAME  = 'diary-notify';
const DB_STORE = 'kv';

/* === IndexedDB helpers (mirror สำหรับ sw.js) ===================== */

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, val) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(val, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/* === Mirror ข้อมูลให้ sw.js ====================================== */

/**
 * เขียน active templates + config ลง IndexedDB
 * เรียกตอน init + ทุกครั้งที่ templates/settings เปลี่ยน (debounced ใน app.js)
 */
export async function syncNotifyData() {
  if (!('indexedDB' in self)) return;
  try {
    const settings = State.getSettings();
    const templates = Recurring.getActiveTemplates()
      .filter(t => t.next_due)
      .map(t => ({
        id: t.id,
        description: t.description,
        amount: t.amount,
        next_due: t.next_due
      }));
    await idbSet('notify-data', {
      cfg: {
        enabled: settings.notify_recurring !== false,
        daysAhead: settings.notify_days_ahead ?? 1
      },
      templates,
      updatedAt: Date.now()
    });
  } catch (e) {
    console.warn('[notify] syncNotifyData failed', e);
  }
}

/* === Dedupe (แชร์ logic เดียวกับ sw.js ผ่าน IDB) ================= */

async function wasNotified(key) {
  try {
    const map = (await idbGet('notified')) || {};
    return !!map[key];
  } catch { return false; }
}

async function markNotified(key, dueISO) {
  try {
    const map = (await idbGet('notified')) || {};
    map[key] = dueISO;
    // prune รายการเก่ากว่า 60 วัน กัน map โตไม่จำกัด
    const cutoff = offsetDateISO(todayISO(), -60);
    for (const k of Object.keys(map)) {
      if (map[k] < cutoff) delete map[k];
    }
    await idbSet('notified', map);
  } catch { /* non-fatal */ }
}

/* === Permission + แสดง notification ============================== */

export function getPermissionState() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;   // 'granted' | 'denied' | 'default'
}

/** ขอ permission — ต้องเรียกจาก user gesture (ปุ่มใน Settings) */
export async function ensurePermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/**
 * เด้ง system notification ผ่าน SW registration
 * (new Notification() ใช้ไม่ได้บน Android Chrome — ต้องผ่าน SW เท่านั้น)
 */
export async function showSystemNotification(title, body, tag = 'diary-recurring') {
  if (getPermissionState() !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body,
      tag,
      icon: './icons/icon.svg',
      badge: './icons/icon.svg',
      vibrate: [200, 100, 200],
      data: { view: 'settings', acc: 'recurring' }
    });
    return true;
  } catch (e) {
    console.warn('[notify] showNotification failed', e);
    return false;
  }
}

/* === แจ้งเตือนรายการประจำใกล้ครบกำหนด ============================ */

/** ข้อความตามจำนวนวันที่เหลือ — ภาษาบอกข้อเท็จจริง ไม่กดดัน */
export function dueLabel(diffDays) {
  if (diffDays <= 0) return 'ครบกำหนดวันนี้';
  if (diffDays === 1) return 'ครบกำหนดพรุ่งนี้';
  return `ครบกำหนดในอีก ${diffDays} วัน`;
}

/**
 * เด้ง notification สำหรับรายการที่ใกล้/ถึงกำหนด (เรียกจาก reminders.js)
 * @param {Array} items — [{ id, description, amount, next_due, diffDays }]
 * @returns {boolean} true = เด้งสำเร็จอย่างน้อย 1 รายการ (reminders.js จะข้าม toast)
 */
export async function notifyRecurringDue(items) {
  if (getPermissionState() !== 'granted' || items.length === 0) return false;

  let shown = false;
  for (const item of items) {
    const phase = item.diffDays <= 0 ? 'due' : 'pre';
    const key = `${item.id}|${item.next_due}|${phase}`;
    if (await wasNotified(key)) continue;

    const ok = await showSystemNotification(
      `📅 ${item.description || 'รายการประจำ'}`,
      `${dueLabel(item.diffDays)} — ${formatBaht(item.amount)} ฿`,
      `diary-recur-${item.id}`
    );
    if (ok) {
      await markNotified(key, item.next_due);
      shown = true;
    }
  }
  return shown;
}

/** ทดสอบจากปุ่มใน Settings */
export async function testNotification() {
  return showSystemNotification(
    '📅 ทดสอบการแจ้งเตือน',
    'ถ้าเห็นข้อความนี้พร้อมเสียง แปลว่าใช้งานได้ ✓',
    'diary-test'
  );
}

/* === Periodic Background Sync (ระดับ 2 — Android installed PWA) === */

/**
 * ลงทะเบียนให้ SW ตื่นมาเช็ครายการครบกำหนดเป็นระยะ แม้แอปปิดอยู่
 * รองรับเฉพาะ Chrome/Edge Android ที่ติดตั้ง PWA — ที่อื่น silently skip
 * ความถี่จริงขึ้นกับเบราว์เซอร์ (อย่างเร็วสุด ~12 ชม. ตาม site engagement)
 */
export async function registerPeriodicSync() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!('periodicSync' in reg)) return false;
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (status.state !== 'granted') return false;
    await reg.periodicSync.register('recurring-check', {
      minInterval: 12 * 60 * 60 * 1000   // 12 ชม.
    });
    return true;
  } catch (e) {
    console.warn('[notify] periodicSync register failed', e);
    return false;
  }
}

/** จำนวนวันจาก today → iso (ใช้ parseLocalDate กัน timezone shift) */
export function daysUntil(iso, today = todayISO()) {
  return Math.round((parseLocalDate(iso) - parseLocalDate(today)) / 86400000);
}
