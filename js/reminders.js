/* ===================================================================
   reminders.js — Smart reminders (gentle, once-per-day)
   ===================================================================
   เรียกจาก app.js ตอน startup — แสดง toast ครั้งเดียวต่อวัน

   Priority queue (สูง → ต่ำ):
   1. รายการประจำครบกำหนด (สรุปรวม 1 toast แม้มีหลายตัว)
   2. ยอดใกล้เกณฑ์ต่ำสุด
   3. สรุปประจำสัปดาห์ (วันจันทร์เท่านั้น)

   cap: แสดงสูงสุด 2 toasts ต่อวัน
   mutual exclusion: ถ้ามี catchup banner → skip (ส่ง hasCatchup=true)
   =================================================================== */

import { todayISO, formatBaht } from './utils.js';
import * as State from './state.js';
import * as Recurring from './recurring.js';
import { notifyRecurringDue, daysUntil, dueLabel, getPermissionState } from './notify.js';


/**
 * เลือก templates ที่ถึง/ใกล้ครบกำหนดใน [today, today+daysAhead]
 * (pure function — แยกออกมาเพื่อ test ได้)
 * @returns [{ ...template, diffDays }] เรียงใกล้สุดก่อน
 */
export function getUpcomingDue(templates, today, daysAhead) {
  return templates
    .filter(t => t.active !== false && t.next_due)
    .map(t => ({ ...t, diffDays: daysUntil(t.next_due, today) }))
    .filter(t => t.diffDays >= 0 && t.diffDays <= daysAhead)
    .sort((a, b) => a.diffDays - b.diffDays);
}

/**
 * ตรวจ + แสดง reminders ที่เหมาะสมสำหรับวันนี้
 * @param {Function} showToast  — inject จาก app.js
 * @param {boolean}  hasCatchup — true = มี catchup banner แสดงอยู่ → skip reminder วันนี้
 */
export function checkReminders(showToast, hasCatchup = false) {
  const today = todayISO();

  // ไม่แสดงซ้ำวันเดียวกัน
  if (localStorage.getItem('reminder_shown_date') === today) return;

  // mutual exclusion — catchup banner แสดงอยู่ → งดวันนี้
  if (hasCatchup) return;

  const settings = State.getSettings();
  const toasts = [];

  // --- 1. Recurring due/ใกล้ครบกำหนด (เตือนล่วงหน้า N วัน) ---------
  if (settings.notify_recurring !== false) {
    const daysAhead = settings.notify_days_ahead ?? 1;
    const upcoming = getUpcomingDue(Recurring.getActiveTemplates(), today, daysAhead);

    if (upcoming.length > 0) {
      // ถ้าผู้ใช้เปิด system notification แล้ว → เด้งแบบมีเสียง (dedupe ใน notify.js)
      // toast แสดงเป็น fallback เฉพาะเมื่อยังไม่ได้อนุญาต notification
      if (getPermissionState() === 'granted') {
        notifyRecurringDue(upcoming).catch(console.warn);
      } else if (upcoming.length === 1) {
        const t = upcoming[0];
        toasts.push(`📅 ${t.description} ${dueLabel(t.diffDays)} — ${formatBaht(t.amount)} ฿`);
      } else {
        // รวมเป็น toast เดียว ไม่ spam หลายอัน
        const total = upcoming.reduce((s, t) => s + t.amount, 0);
        toasts.push(`📅 มี ${upcoming.length} รายการประจำใกล้ครบกำหนด — รวม ${formatBaht(total)} ฿`);
      }
    }
  }

  // --- 2. Min balance warning (1 toast รวม ถ้ามีหลายบัญชี) ---------
  if (settings.notify_low_balance !== false) {
    const globalThreshold = settings.threshold_satang;

    const lowAccounts = State.getAccounts().filter(a => {
      const bal = a.type === 'cash'
        ? State.getEffectiveCashBalance(a.id)
        : State.computeAccountBalance(a.id);
      const limit = (a.threshold && a.threshold > 0) ? a.threshold : globalThreshold;
      return bal < limit;
    });

    if (lowAccounts.length === 1) {
      const a = lowAccounts[0];
      const bal = a.type === 'cash'
        ? State.getEffectiveCashBalance(a.id)
        : State.computeAccountBalance(a.id);
      toasts.push(`⚠️ ${a.display_name} ยอดเหลือ ${formatBaht(bal)} ฿ — ใกล้เกณฑ์ต่ำสุด`);
    } else if (lowAccounts.length > 1) {
      toasts.push(`⚠️ ${lowAccounts.length} บัญชียอดใกล้เกณฑ์ต่ำสุด — ดูในแท็บ Dashboard`);
    }
  }

  // --- 3. Weekly digest (วันจันทร์เท่านั้น) -------------------------
  if (settings.notify_weekly !== false && new Date().getDay() === 1) {
    const lastWeek = _getLastWeekSummary();
    if (lastWeek.count > 0) {
      toasts.push(
        `📊 สัปดาห์ที่แล้วบันทึก ${lastWeek.count} รายการ รายจ่าย ${formatBaht(lastWeek.expense)} ฿`
      );
    }
  }

  if (toasts.length === 0) return;

  // cap: แสดงสูงสุด 2 toasts (priority อยู่ในลำดับ push ข้างต้น)
  const queue = toasts.slice(0, 2);

  const DURATION = 7000;
  const GAP      = 3500;
  queue.forEach((msg, i) => {
    setTimeout(() => showToast(msg, DURATION), i * GAP);
  });

  localStorage.setItem('reminder_shown_date', today);
}


/* === Internal helpers ============================================ */

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
