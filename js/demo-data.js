/* ===================================================================
   demo-data.js — ข้อมูลตัวอย่างสำหรับ first-run empty state
   ===================================================================
   - getDemoTransactions() คืน array ของรายการสมมุติที่สมจริง
   - getDemoRecurringTemplates() คืน recurring templates ตัวอย่าง 3 รายการ
   - ทุกรายการมี source: 'sample' / _sample: true → ลบออกได้ตอนเริ่มใช้จริง
   - amount เป็น satang (1 ฿ = 100 satang)
   =================================================================== */

import { todayISO, offsetDateISO } from './utils.js';

/**
 * สร้าง ~32 รายการสมมุติที่ครอบคลุมพฤติกรรมการเงินทั่วไป
 * วันที่สัมพัทธ์กับวันนี้ (daysAgo) → ข้อมูลดู recent เสมอ
 */
export function getDemoTransactions() {
  const today = todayISO();
  const d = (n) => offsetDateISO(today, -n);
  const B = 'bank:manual:default';   // บัญชีเริ่มต้น

  return [
    /* ── รายรับ ───────────────────────────────────────────────── */
    { date: d(28), type: 'income',  group: 'salary', description: 'เงินเดือน พฤษภาคม',
      amount: 3500000, account_to: B, source: 'sample' },
    { date: d(14), type: 'income',  group: 'bonus',  description: 'โบนัสไตรมาส 1',
      amount:  350000, account_to: B, source: 'sample' },

    /* ── ค่าบ้าน / สาธารณูปโภค ───────────────────────────────── */
    { date: d(27), type: 'expense', group: 'rent',    description: 'ค่าเช่าห้อง',
      amount: 750000, account_from: B, source: 'sample' },
    { date: d(22), type: 'expense', group: 'utility', description: 'ค่าไฟ MEA',
      amount:  98000, account_from: B, source: 'sample' },
    { date: d(21), type: 'expense', group: 'utility', description: 'ค่าน้ำ MWA',
      amount:  24500, account_from: B, source: 'sample' },
    { date: d(20), type: 'expense', group: 'utility', description: 'Internet True',
      amount:  59000, account_from: B, source: 'sample' },

    /* ── อาหาร ────────────────────────────────────────────────── */
    { date: d(1),  type: 'expense', group: 'food', description: 'ข้าวราดแกง',
      amount:  7000, account_from: B, source: 'sample' },
    { date: d(3),  type: 'expense', group: 'food', description: '7-Eleven ซื้อของ',
      amount: 14500, account_from: B, source: 'sample' },
    { date: d(5),  type: 'expense', group: 'food', description: 'ก๋วยเตี๋ยวเรือ',
      amount:  6000, account_from: B, source: 'sample' },
    { date: d(7),  type: 'expense', group: 'food', description: "McDonald's",
      amount: 16500, account_from: B, source: 'sample' },
    { date: d(9),  type: 'expense', group: 'food', description: 'ส้มตำ + ไก่ทอด',
      amount:  9000, account_from: B, source: 'sample' },
    { date: d(12), type: 'expense', group: 'food', description: 'ข้าวต้มหมู',
      amount:  7500, account_from: B, source: 'sample' },
    { date: d(16), type: 'expense', group: 'food', description: 'MK Restaurants',
      amount: 52000, account_from: B, source: 'sample' },
    { date: d(19), type: 'expense', group: 'food', description: 'Big C ซื้อของสด',
      amount: 87500, account_from: B, source: 'sample' },
    { date: d(23), type: 'expense', group: 'food', description: 'ต้มยำกุ้ง',
      amount: 12000, account_from: B, source: 'sample' },
    { date: d(25), type: 'expense', group: 'food', description: 'ร้านข้าวแกงใกล้บ้าน',
      amount:  6500, account_from: B, source: 'sample' },

    /* ── กาแฟ ─────────────────────────────────────────────────── */
    { date: d(2),  type: 'expense', group: 'coffee', description: 'Café Amazon',
      amount:  8500, account_from: B, source: 'sample' },
    { date: d(6),  type: 'expense', group: 'coffee', description: 'กาแฟสดข้างออฟฟิศ',
      amount:  4000, account_from: B, source: 'sample' },
    { date: d(11), type: 'expense', group: 'coffee', description: 'Starbucks',
      amount: 16500, account_from: B, source: 'sample' },
    { date: d(18), type: 'expense', group: 'coffee', description: 'True Coffee',
      amount:  8000, account_from: B, source: 'sample' },

    /* ── เดินทาง ──────────────────────────────────────────────── */
    { date: d(4),  type: 'expense', group: 'transport', description: 'Grab Car',
      amount: 12000, account_from: B, source: 'sample' },
    { date: d(8),  type: 'expense', group: 'transport', description: 'BTS รายเดือน',
      amount: 90000, account_from: B, source: 'sample' },
    { date: d(15), type: 'expense', group: 'transport', description: 'Grab Bike',
      amount:  5500, account_from: B, source: 'sample' },
    { date: d(24), type: 'expense', group: 'transport', description: 'Grab Car',
      amount: 14500, account_from: B, source: 'sample' },

    /* ── ช้อปปิ้ง ─────────────────────────────────────────────── */
    { date: d(10), type: 'expense', group: 'shopping', description: 'Lazada สั่งของ',
      amount:  54500, account_from: B, source: 'sample' },
    { date: d(17), type: 'expense', group: 'shopping', description: 'Watsons ของใช้',
      amount:  38000, account_from: B, source: 'sample' },
    { date: d(26), type: 'expense', group: 'shopping', description: 'Central เสื้อผ้า',
      amount: 189000, account_from: B, source: 'sample' },

    /* ── สุขภาพ ───────────────────────────────────────────────── */
    { date: d(13), type: 'expense', group: 'health', description: 'Boots ค่ายา',
      amount: 32000, account_from: B, source: 'sample' },
    { date: d(29), type: 'expense', group: 'health', description: 'ฟิตเนสรายเดือน',
      amount: 50000, account_from: B, source: 'sample' },

    /* ── บันเทิง ──────────────────────────────────────────────── */
    { date: d(8),  type: 'expense', group: 'entertainment', description: 'ดูหนัง SF Cinema',
      amount: 38000, account_from: B, source: 'sample' },
    { date: d(15), type: 'expense', group: 'entertainment', description: 'Spotify Premium',
      amount:  9900, account_from: B, source: 'sample' },
    { date: d(20), type: 'expense', group: 'entertainment', description: 'Netflix',
      amount: 18900, account_from: B, source: 'sample' },
  ];
}

/**
 * Recurring templates ตัวอย่าง 3 รายการ — ให้เห็น feature รายการประจำ/ผ่อน
 * + forecast 30 วัน + เตือนล่วงหน้า ตั้งแต่ยังไม่มีข้อมูลจริง
 *
 * วันที่ทุกตัวเป็นอนาคตเสมอ — scheduler จะได้ไม่สร้าง transaction จริงทันที
 * _sample: true → ถูกลบพร้อมข้อมูลตัวอย่างตอน "เริ่มใช้งานจริง" / import จริง
 */
export function getDemoRecurringTemplates() {
  const today = todayISO();
  const [y, m, day] = today.split('-').map(Number);
  const pad = (n) => String(n).padStart(2, '0');

  // วันที่ 1 ของเดือนถัดไป (ค่าเช่า)
  const firstOfNextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;

  // วันที่ 20 ของเดือนนี้ ถ้ายังไม่ถึง — ไม่งั้นเดือนถัดไป (ค่าเน็ต)
  const day20 = day < 20
    ? `${y}-${pad(m)}-20`
    : (m === 12 ? `${y + 1}-01-20` : `${y}-${pad(m + 1)}-20`);

  return [
    { type: 'expense', amount: 750000, group: 'rent', description: 'ค่าเช่าห้อง',
      frequency: 'monthly', first_due: firstOfNextMonth, _sample: true },
    { type: 'expense', amount: 59000, group: 'utility', description: 'ค่าอินเทอร์เน็ต True',
      frequency: 'monthly', first_due: day20, _sample: true },
    { type: 'expense', amount: 250000, group: 'shopping', description: 'ผ่อนมือถือ',
      frequency: 'installment', installment_total: 10,
      first_due: offsetDateISO(today, 5), _sample: true },
  ];
}
