/* ===================================================================
   catchup.js — Welcome-back logic สำหรับ user ที่หยุดใช้แล้วกลับมา
   ===================================================================
   Trigger: ไม่ได้บันทึก ≥7 วัน AND ไม่ได้เปิดแอป ≥3 วัน
   Dismiss: sessionStorage (แสดงใหม่ได้ใน session ถัดไป)
   Tone: observational — ไม่ตัดสิน ไม่ guilt trip
   =================================================================== */

import { todayISO, parseLocalDate } from './utils.js';
import * as State from './state.js';
import * as Recurring from './recurring.js';

const SESSION_DISMISSED_KEY = 'catchup_dismissed';
const LAST_VISIT_KEY        = 'last_visit_date';


/**
 * ตรวจสอบว่ามี catch-up opportunity ไหม
 * @returns {{ daysSinceLastTx, lastTxDate, missedRecurring }} หรือ null
 */
export function checkCatchupOpportunity() {
  // ถ้า dismiss แล้วใน session นี้ → skip
  if (sessionStorage.getItem(SESSION_DISMISSED_KEY)) return null;

  // first-time user ไม่มี transaction → skip
  const txs = State.getTransactions();
  if (!txs.length) return null;

  const lastTx  = txs[0];                   // sorted date desc อยู่แล้ว
  const today   = todayISO();
  const daysSinceLastTx = _daysBetween(lastTx.date, today);

  // อัปเดต last visit ทุกครั้ง (หลังคำนวณแล้ว)
  const lastVisit = localStorage.getItem(LAST_VISIT_KEY);
  const daysSinceLastVisit = lastVisit ? _daysBetween(lastVisit, today) : 0;
  localStorage.setItem(LAST_VISIT_KEY, today);

  // เงื่อนไข: หยุดบันทึก ≥7 วัน + ห่างจาก session ล่าสุด ≥3 วัน
  if (daysSinceLastTx < 7 || daysSinceLastVisit < 3) return null;

  // Smart suggestion D: recurring ที่ครบกำหนดในช่วงที่หายไป
  // (runScheduler สร้างรายการให้อัตโนมัติแล้ว — แค่แจ้งให้ทราบ)
  const missedRecurring = Recurring.getActiveTemplates()
    .filter(t => t.next_due > lastTx.date && t.next_due <= today)
    .length;

  return { daysSinceLastTx, lastTxDate: lastTx.date, missedRecurring };
}

/** บันทึก dismiss ใน sessionStorage — หายเมื่อปิด tab */
export function dismissCatchup() {
  sessionStorage.setItem(SESSION_DISMISSED_KEY, '1');
}


/* === Internal helpers =========================================== */

function _daysBetween(isoA, isoB) {
  const a = parseLocalDate(isoA);
  const b = parseLocalDate(isoB);
  return Math.round((b - a) / 86400000);
}
