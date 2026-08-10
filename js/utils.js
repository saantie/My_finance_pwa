/* ===================================================================
   utils.js — Helper functions ที่ใช้ทั่วทั้งแอป
   ===================================================================
   - Money: ระบบเก็บเป็น "satang" (integer) เพื่อหลีกเลี่ยง float bug
   - Date: เก็บ ISO Gregorian ภายใน, แสดง พ.ศ. เมื่อ render
   - calc: parser สำหรับ expression "1500+200" ใน keypad
   =================================================================== */


/* === Money ====================================================== */

/** บาท → satang (integer) */
export function bahtToSatang(baht) {
  return Math.round(Number(baht) * 100);
}

/** satang → บาท (number) */
export function satangToBaht(satang) {
  return satang / 100;
}

/**
 * Format satang เป็นข้อความ "1,234" หรือ "−1,234"
 * @param {number} satang
 * @param {object} opts { sign: เพิ่ม + / − ข้างหน้า, decimals: ทศนิยม }
 */
export function formatBaht(satang, opts = {}) {
  const { sign = false, decimals = 0 } = opts;
  const baht = satang / 100;
  const abs = Math.abs(baht);

  // ใช้ toLocaleString เพื่อ comma separator
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });

  if (sign) {
    if (satang > 0) return '+' + formatted;
    if (satang < 0) return '−' + formatted;
  } else if (satang < 0) {
    return '−' + formatted;
  }
  return formatted;
}


/* === Date ======================================================= */

/** วันนี้ในรูป YYYY-MM-DD (timezone ของ device) */
export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** ISO date string → Date (timezone-safe; ไม่โดน UTC shift) */
export function parseLocalDate(iso) {
  // "2026-05-08" → new Date(2026, 4, 8) เลี่ยงปัญหา new Date("2026-05-08") ที่อ่านเป็น UTC
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** เลื่อนวัน ISO โดย offset วัน (บวก/ลบ) */
export function offsetDateISO(iso, days) {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** จำนวนวันจาก a → b (binary: b − a) — ผ่าน parseLocalDate จึงไม่โดน UTC shift */
export function daysBetweenISO(aISO, bISO) {
  return Math.round((parseLocalDate(bISO) - parseLocalDate(aISO)) / 86400000);
}

/** ค.ศ. → พ.ศ. */
export function ceToBe(year) {
  return year + 543;
}

/** ชื่อวันภาษาไทย */
const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
export function dayNameTH(date) {
  return THAI_DAYS[date.getDay()];
}

/** ชื่อเดือนภาษาไทย */
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];
const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];
export function monthNameTH(date, short = false) {
  return (short ? THAI_MONTHS_SHORT : THAI_MONTHS)[date.getMonth()];
}

/**
 * Format วันที่แบบ "วันศุกร์ ที่ 8 พฤษภาคม"
 * (ไม่มีปี เพราะไม่ใช่ context ที่ต้องการ พ.ศ.)
 */
export function formatLongDate(iso) {
  const d = parseLocalDate(iso);
  return `วัน${dayNameTH(d)} ที่ ${d.getDate()} ${monthNameTH(d)}`;
}

/** Format "8 พ.ค. 2569" — สำหรับ list/meta */
export function formatShortDate(iso) {
  const d = parseLocalDate(iso);
  return `${d.getDate()} ${monthNameTH(d, true)} ${ceToBe(d.getFullYear())}`;
}

/** เปรียบเทียบว่า ISO เป็นวันเดียวกันไหม */
export function isSameDay(isoA, isoB) {
  return isoA === isoB;
}


/* === Time ======================================================= */

/** "10:30" — สำหรับ entry timestamp */
export function formatTime(date) {
  const d = (date instanceof Date) ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}


/* === Calculator ================================================= */

/**
 * ประเมิน expression "1500+200*0.93" → number
 * รับเฉพาะตัวเลข + - * / . ( ) และ space — ปลอดภัยจาก code injection
 * @returns {number|null} null ถ้า invalid
 */
export function calc(expr) {
  if (!expr || typeof expr !== 'string') return null;
  // อนุญาตเฉพาะตัวเลขและ operator
  if (!/^[\d+\-*/.()\s]+$/.test(expr)) return null;
  try {
    // Function constructor ใน strict mode ไม่ได้เข้าถึง global ที่อันตราย
    // และ regex ด้านบนรับประกันแล้วว่าไม่มี identifier
    const result = Function('"use strict"; return (' + expr + ')')();
    return (typeof result === 'number' && isFinite(result)) ? result : null;
  } catch {
    return null;
  }
}


/* === Misc ======================================================= */

/** UUID v4 แบบง่าย (ไม่ต้องการ crypto-grade) */
export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/** Debounce — สำหรับ search input */
export function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

/** Haptic feedback (ถ้า device รองรับ) */
export function haptic(pattern = 10) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}
