/* ===================================================================
   reminders.js — Smart reminders (gentle, once-per-day)
   ===================================================================
   เรียกจาก app.js ตอน startup — แสดง toast ครั้งเดียวต่อวัน
   ไม่ตัดสินผู้ใช้, แค่บอกข้อมูลที่เป็นประโยชน์

   Check 3 เรื่อง:
   1. Recurring templates ที่ครบกำหนดวันนี้
   2. บัญชีที่ยอดต่ำกว่าเกณฑ์
   3. Weekly digest (วันจันทร์)
   =================================================================== */

import { todayISO, formatBaht } from './utils.js';
import * as State from './state.js';
import * as Recurring from './recurring.js';


/**
 * ตรวจ + แสดง reminders ที่เหมาะสมสำหรับวันนี้
 * @param {Function} showToast — รับ message string (inject จาก app.js หลีกเลี่ยง circular import)
 */
export function checkReminders(showToast) {
  const today = todayISO();

  // ไม่แสดงซ้ำวันเดียวกัน
  const shownDate = localStorage.getItem('reminder_shown_date');
  if (shownDate === today) return;

  const toasts = [];

  // --- 1. Recurring due today -------------------------------------------
  // ใช้ next_due จาก template ตรงๆ — runScheduler วิ่งก่อนแล้ว
  Recurring.getActiveTemplates()
    .filter(t => t.next_due === today)
    .forEach(t => {
      toasts.push(`📅 ${t.description} ครบกำหนดวันนี้ — ${formatBaht(t.amount)} ฿`);
    });

  // --- 2. Min balance warning -------------------------------------------
  // ใช้ computeAccountBalance (ยอดจริงจาก transactions) แทน a.current_balance
  // ใช้ per-account threshold ถ้ามี มิฉะนั้น fallback เป็น global threshold
  const globalThreshold = State.getSettings().threshold_satang;

  State.getAccounts()
    .filter(a => {
      // ข้ามบัญชีที่ไม่มีกิจกรรมเลย (default placeholder)
      const bal = a.type === 'cash'
        ? State.getEffectiveCashBalance(a.id)
        : State.computeAccountBalance(a.id);
      const limit = (a.threshold && a.threshold > 0) ? a.threshold : globalThreshold;
      return bal < limit;
    })
    .forEach(a => {
      const bal = a.type === 'cash'
        ? State.getEffectiveCashBalance(a.id)
        : State.computeAccountBalance(a.id);
      toasts.push(`⚠️ ${a.display_name} ยอดเหลือ ${formatBaht(bal)} ฿ — ใกล้เกณฑ์ต่ำสุด`);
    });

  // --- 3. Weekly digest (วันจันทร์เท่านั้น) ----------------------------
  if (new Date().getDay() === 1) {
    const lastWeek = _getLastWeekSummary();
    if (lastWeek.count > 0) {
      toasts.push(
        `📊 สัปดาห์ที่แล้วบันทึก ${lastWeek.count} รายการ รายจ่าย ${formatBaht(lastWeek.expense)} ฿`
      );
    }
  }

  if (toasts.length === 0) return;

  // แสดง toast ทีละอัน ห่าง 1.5 วิ (ไม่กองพร้อมกัน)
  toasts.forEach((msg, i) => {
    setTimeout(() => showToast(msg), i * 1500);
  });

  // บันทึกวันที่แสดงแล้ว — ไม่แสดงซ้ำวันเดียวกัน
  localStorage.setItem('reminder_shown_date', today);
}


/* === Internal helpers ============================================ */

/**
 * คำนวณสรุป 7 วันที่ผ่านมา (ไม่รวมวันนี้)
 * @returns {{ count: number, expense: number }}
 */
function _getLastWeekSummary() {
  const today = new Date();
  const dates = new Set();
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.add(d.toISOString().slice(0, 10));
  }

  const txs = State.getTransactions().filter(t => dates.has(t.date));
  const expense = txs
    .filter(t => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);

  return { count: txs.length, expense };
}
