// js/utils.js — Core utilities: money math, Thai dates, Thai number words.
// Exposes window.U for browser; also exports for Node testing.
//
// MONEY: We always store amounts as INTEGER SATANG (1 baht = 100 satang)
// to avoid float precision bugs (e.g. 0.1 + 0.2 ≠ 0.3).
//
// DATES: Thai bank statements use Buddhist Era (พ.ศ.). BE = CE + 543.
//   "01/01/2569"   → CE 2026
//   "01/01/69"     → BE 2569 → CE 2026 (2-digit BE convention in Thai context)
//   "01/01/2026"   → CE 2026 (already CE)

(function (root) {
  'use strict';

  // ---------- Money ----------

  /** Parse an amount string ("1,234.56", "(500.00)", "  12.5  ") to integer satang.
   *  Returns null for empty/invalid; throws on truly bad input only when strict=true. */
  function toSatang(input, opts = {}) {
    if (input == null) return null;
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) return null;
      return Math.round(input * 100);
    }
    let s = String(input).trim();
    if (!s) return null;

    // Handle parenthesized negatives: "(123.45)" → -123.45
    let neg = false;
    if (s.startsWith('(') && s.endsWith(')')) {
      neg = true;
      s = s.slice(1, -1).trim();
    }
    if (s.startsWith('-')) { neg = !neg; s = s.slice(1).trim(); }
    if (s.startsWith('+')) { s = s.slice(1).trim(); }

    // Strip THB markers, spaces, commas
    s = s.replace(/บาท|THB|฿/gi, '').replace(/,/g, '').trim();
    if (!s) return null;

    // Some banks use "Cr" / "Dr" suffix
    if (/cr$/i.test(s)) { s = s.replace(/cr$/i, '').trim(); }
    else if (/dr$/i.test(s)) { neg = !neg; s = s.replace(/dr$/i, '').trim(); }

    if (!/^\d+(\.\d+)?$/.test(s)) {
      if (opts.strict) throw new Error('Bad amount: ' + input);
      return null;
    }

    // Multiply via string split to avoid float drift entirely.
    const [intPart, fracPart = ''] = s.split('.');
    const frac2 = (fracPart + '00').slice(0, 2);
    const satang = Number(intPart) * 100 + Number(frac2);
    return neg ? -satang : satang;
  }

  /** Format integer satang as Thai baht string. */
  function formatTHB(satang, opts = {}) {
    if (satang == null || !Number.isFinite(satang)) return '—';
    const sign = satang < 0 ? '-' : '';
    const abs = Math.abs(satang);
    const baht = Math.floor(abs / 100);
    const sat = abs % 100;
    const bahtStr = baht.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const out = `${sign}${bahtStr}.${sat.toString().padStart(2, '0')}`;
    return opts.suffix === false ? out : `${out} ฿`;
  }

  /** Convert satang back to baht number — only for charting/display, never for math. */
  function satangToBaht(satang) {
    if (satang == null || !Number.isFinite(satang)) return 0;
    return satang / 100;
  }

  // ---------- Dates ----------

  // Thai month names → 1-12. Includes both full and abbreviated forms.
  const TH_MONTHS = {
    'มกราคม': 1, 'ม.ค.': 1, 'มค': 1,
    'กุมภาพันธ์': 2, 'ก.พ.': 2, 'กพ': 2,
    'มีนาคม': 3, 'มี.ค.': 3, 'มีค': 3,
    'เมษายน': 4, 'เม.ย.': 4, 'เมย': 4,
    'พฤษภาคม': 5, 'พ.ค.': 5, 'พค': 5,
    'มิถุนายน': 6, 'มิ.ย.': 6, 'มิย': 6,
    'กรกฎาคม': 7, 'ก.ค.': 7, 'กค': 7,
    'สิงหาคม': 8, 'ส.ค.': 8, 'สค': 8,
    'กันยายน': 9, 'ก.ย.': 9, 'กย': 9,
    'ตุลาคม': 10, 'ต.ค.': 10, 'ตค': 10,
    'พฤศจิกายน': 11, 'พ.ย.': 11, 'พย': 11,
    'ธันวาคม': 12, 'ธ.ค.': 12, 'ธค': 12
  };

  const EN_MONTHS = {
    JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
    JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12
  };

  /** Convert a year value to CE.
   *  - 4-digit ≥ 2400 → BE, subtract 543
   *  - 4-digit ≤ 2200 → already CE
   *  - 2-digit:
   *      Heuristic: in Thai bank context, 2-digit years are almost always BE (25xx).
   *      So "69" → 2569 → 2026. "25" → 2525 → 1982 (unlikely, but fall back).
   *      We use a "current BE year" window: if 2-digit yy yields a BE year within
   *      ±20 years of "now BE", treat as BE; otherwise treat as CE 19xx/20xx.
   */
  function normalizeYear(y, refDate) {
    const ref = refDate || new Date();
    const refCE = ref.getFullYear();
    const refBE = refCE + 543;

    if (y >= 2400) return y - 543;        // 4-digit BE
    if (y >= 1900) return y;              // 4-digit CE
    if (y >= 100) {                        // 3-digit — invalid
      return null;
    }
    // 2-digit
    const beCandidate = 2500 + y;          // assume 25xx BE
    if (Math.abs(beCandidate - refBE) <= 25) return beCandidate - 543;
    // fallback: treat as 20xx if within window, else 19xx
    const ce20 = 2000 + y;
    if (Math.abs(ce20 - refCE) <= 25) return ce20;
    return 1900 + y;
  }

  /** Parse a Thai-style date string into ISO "YYYY-MM-DD" (Gregorian).
   *  Accepts:
   *    "01/01/2569", "01/01/69", "1 ม.ค. 69", "01-01-2569",
   *    "01 ม.ค. 2569", "2569-01-01", "01/JAN/69", "01/01/2026"
   *  Returns null if unparseable. */
  function parseThaiDate(s, refDate) {
    if (!s) return null;
    const str = String(s).trim();
    if (!str) return null;

    // ISO already
    let m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const y = normalizeYear(Number(m[1]), refDate);
      const mo = Number(m[2]), d = Number(m[3]);
      return mkISO(y, mo, d);
    }

    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (year 2 or 4 digits)
    m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
      const d = Number(m[1]), mo = Number(m[2]);
      const y = normalizeYear(Number(m[3]), refDate);
      return mkISO(y, mo, d);
    }

    // DD MMM YY[YY] or DD MMM YY[YY] — Thai month name
    m = str.match(/^(\d{1,2})\s*([^\d\s][^\d]*?)\s*(\d{2,4})$/);
    if (m) {
      const d = Number(m[1]);
      const monStr = m[2].trim();
      const y = normalizeYear(Number(m[3]), refDate);
      const mo = TH_MONTHS[monStr] || EN_MONTHS[monStr.toUpperCase().slice(0, 3)];
      if (mo) return mkISO(y, mo, d);
    }

    // DD/MMM/YY where MMM is English abbrev
    m = str.match(/^(\d{1,2})[\/\-]([A-Za-z]{3})[\/\-](\d{2,4})$/);
    if (m) {
      const d = Number(m[1]);
      const mo = EN_MONTHS[m[2].toUpperCase()];
      const y = normalizeYear(Number(m[3]), refDate);
      if (mo) return mkISO(y, mo, d);
    }

    return null;
  }

  function mkISO(y, mo, d) {
    if (!y || !mo || !d) return null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    // Validate via Date round-trip
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return `${y.toString().padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  /** "2026-01-15" → "2026-01" */
  function monthKey(iso) {
    return iso ? iso.slice(0, 7) : null;
  }

  /** "2026-01" → "ม.ค. 69" */
  function formatThaiMonth(monthKey) {
    if (!monthKey) return '';
    const [y, m] = monthKey.split('-').map(Number);
    const beShort = (y + 543) % 100;
    const names = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                   'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${names[m - 1]} ${String(beShort).padStart(2, '0')}`;
  }

  /** Format an ISO date as Thai display: "15 ม.ค. 69" */
  function formatThaiDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const beShort = (y + 543) % 100;
    const names = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                   'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${d} ${names[m - 1]} ${String(beShort).padStart(2, '0')}`;
  }

  // ---------- Thai number-words → number ----------
  // Handles "หนึ่งพันห้าร้อย" type spelling that Web Speech sometimes produces
  // alongside or instead of digits.

  const TH_DIGIT = { ศูนย์: 0, หนึ่ง: 1, สอง: 2, สาม: 3, สี่: 4, ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9, เอ็ด: 1, ยี่: 2 };
  const TH_PLACE = { สิบ: 10, ร้อย: 100, พัน: 1000, หมื่น: 10000, แสน: 100000, ล้าน: 1000000 };

  /** Parse a chunk of Thai text into an integer (best-effort). */
  function parseThaiNumberWord(text) {
    if (!text) return null;
    let total = 0, current = 0, lastDigit = null;
    let i = 0;
    while (i < text.length) {
      let matched = false;
      // try place words first (longer match priority)
      for (const w of ['ล้าน', 'แสน', 'หมื่น', 'พัน', 'ร้อย', 'สิบ']) {
        if (text.startsWith(w, i)) {
          const place = TH_PLACE[w];
          const val = (lastDigit == null ? 1 : lastDigit);
          if (w === 'ล้าน') {
            total = (total + (current === 0 ? val : current * (lastDigit == null ? 1 : 1))) * place;
            // simpler: collapse current and continue
            current = 0;
          } else {
            current += val * place;
          }
          lastDigit = null;
          i += w.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;
      for (const w of ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า', 'เอ็ด', 'ยี่']) {
        if (text.startsWith(w, i)) {
          lastDigit = TH_DIGIT[w];
          i += w.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;
      i++;
    }
    if (lastDigit != null) current += lastDigit;
    total += current;
    return total === 0 && !/(ศูนย์|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า)/.test(text) ? null : total;
  }

  /** Extract first numeric amount from text — digits OR Thai words. */
  function extractAmount(text) {
    if (!text) return null;
    const s = String(text);
    // Try digits first. Three patterns, prefer longest match:
    //   (1) comma-grouped with optional decimal:  1,234,567.89
    //   (2) bare digits with optional decimal:     1234567.89
    // We try comma-grouped first (more specific), then bare.
    const mComma = s.match(/(\d{1,3}(?:,\d{3})+(?:\.\d+)?)/);
    if (mComma) {
      const n = Number(mComma[1].replace(/,/g, ''));
      if (Number.isFinite(n)) return n;
    }
    const mBare = s.match(/(\d+(?:\.\d+)?)/);
    if (mBare) {
      const n = Number(mBare[1]);
      if (Number.isFinite(n)) return n;
    }
    // Try Thai words
    const wm = s.match(/(?:[ก-๛]+)+/);
    if (wm) {
      const n = parseThaiNumberWord(wm[0]);
      if (n != null && n > 0) return n;
    }
    return null;
  }

  // ---------- Generic helpers ----------

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  const API = {
    toSatang, formatTHB, satangToBaht,
    normalizeYear, parseThaiDate, monthKey, formatThaiMonth, formatThaiDate,
    parseThaiNumberWord, extractAmount,
    uuid, debounce,
    TH_MONTHS, EN_MONTHS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  }
  if (typeof root !== 'undefined') {
    root.U = API;
  }
})(typeof window !== 'undefined' ? window : globalThis);
