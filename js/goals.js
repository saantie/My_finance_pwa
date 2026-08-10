/* ===================================================================
   goals.js — เป้าหมายท้าทาย (challenge goals)
   ===================================================================
   ผู้ใช้ตั้งเป้าเองจากหน้าแรก: จำนวนเงิน + ประเภท + ระยะเวลา
   - type 'save' = ประหยัด — ใช้ "ไม่เกิน" target ภายในช่วงเวลา
   - type 'earn' = หาเงินเพิ่ม — หารายรับ "ให้ถึง" target ภายในช่วงเวลา
   - group (optional) = จำกัดเฉพาะหมวด เช่น ประหยัดค่าอาหาร / หาเงินจากงานเสริม
                        null = ทุกหมวด

   Schema (เก็บใน state.goals — ดู state.js):
   {
     id, type: 'save'|'earn', target_amount: satang,
     group: string|null,
     start_date, end_date: 'YYYY-MM-DD' (inclusive ทั้งคู่),
     status: 'active' | 'done' | 'archived',
     achieved: boolean|null,      // ผลลัพธ์ ตั้งตอน status → 'done'
     resolved_at: 'YYYY-MM-DD'|null,
     createdAt, updatedAt
   }

   หลักการ (CLAUDE.md §3): ไม่มี guilt — เป้าที่ไม่สำเร็จรายงานเป็นข้อเท็จจริง
   ไม่มี streak, ไม่มี popup, ยกเลิก/แก้ไขได้ทุกเมื่อ (reversible)
   =================================================================== */

import * as State from './state.js';
import { todayISO, offsetDateISO, daysBetweenISO } from './utils.js';
import { getCategory } from './icons.js';
import { awardXP } from './gamification.js';

/** จำนวนวันของช่วงเวลาที่เลือกได้จาก UI (นับรวมวันนี้) */
export const GOAL_DURATIONS = [7, 14, 30];

/** ระยะเวลาสูงสุดที่ยอมให้ตั้ง — กันเป้าที่ยาวจนไม่มีความหมาย */
const MAX_GOAL_DAYS = 366;


/* === Create / edit ============================================== */

/**
 * สร้างเป้าหมายใหม่
 * @param {object} o
 *   - type: 'save' | 'earn'
 *   - target_amount: satang (integer, > 0)
 *   - group: category key | null
 *   - start_date: ISO (default วันนี้)
 *   - end_date: ISO (inclusive) — หรือส่ง days มาแทน
 *   - days: จำนวนวันรวมวันแรก (ใช้เมื่อไม่ส่ง end_date)
 * @returns {object|null} goal ที่สร้าง หรือ null ถ้า input ไม่ถูกต้อง
 */
export function createGoal(o = {}) {
  const goal = normalizeGoalInput(o);
  if (!goal) return null;
  return State.addGoal({
    ...goal,
    status: 'active',
    achieved: null,
    resolved_at: null
  });
}

/**
 * แก้ไขเป้าหมายที่มีอยู่ (จำนวนเงิน/ประเภท/หมวด/ช่วงเวลา)
 * patch บางส่วนได้ — field ที่ไม่ส่งมาใช้ค่าเดิม
 */
export function editGoal(id, o = {}) {
  const existing = State.getGoal(id);
  if (!existing) return null;
  const goal = normalizeGoalInput({
    type: existing.type,
    target_amount: existing.target_amount,
    group: existing.group,
    start_date: existing.start_date,
    end_date: existing.end_date,
    ...o
  });
  if (!goal) return null;
  // แก้เป้าที่ปิดไปแล้ว → กลับมา active และล้างผลลัพธ์เดิม
  return State.updateGoal(id, { ...goal, status: 'active', achieved: null, resolved_at: null });
}

/** ตรวจ + เติมค่า default ให้ input — คืน null ถ้าใช้ไม่ได้ */
function normalizeGoalInput(o) {
  const type = o.type === 'earn' ? 'earn' : 'save';
  const target = Math.round(Math.abs(Number(o.target_amount) || 0));
  if (!target) return null;

  const start = o.start_date || todayISO();
  // days ชนะ end_date เมื่อส่งมาทั้งคู่ (edit ที่เปลี่ยนระยะเวลาจึงไม่ติดค่าเดิม)
  const days  = Number(o.days);
  const end   = days >= 1 ? offsetDateISO(start, Math.floor(days) - 1) : (o.end_date || null);
  if (!end || end < start) return null;
  if (daysBetweenISO(start, end) + 1 > MAX_GOAL_DAYS) return null;

  return {
    type,
    target_amount: target,
    group: o.group || null,
    start_date: start,
    end_date: end
  };
}

export function removeGoal(id) { State.deleteGoal(id); }

/** ซ่อนเป้าที่ปิดแล้วออกจากหน้าแรก (เก็บประวัติไว้) */
export function archiveGoal(id) { State.updateGoal(id, { status: 'archived' }); }


/* === Read ======================================================= */

export function getActiveGoals() {
  return State.getGoals().filter(g => g.status === 'active');
}

/**
 * เป้าที่ต้องแสดงบนหน้าแรก — active ก่อน แล้วตามด้วยเป้าที่เพิ่งปิด
 * (ยังไม่ archive) เรียงจากวันครบกำหนดใกล้สุด
 */
export function getVisibleGoals() {
  const goals = State.getGoals().filter(g => g.status === 'active' || g.status === 'done');
  return goals.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return a.end_date.localeCompare(b.end_date);
  });
}


/* === Progress =================================================== */

/**
 * คำนวณความคืบหน้าของเป้าหมาย ณ วันนี้
 * นับจาก activeTxs (getTransactions กรอง soft-deleted แล้ว) —
 * โอนระหว่างบัญชีไม่นับ เพราะไม่ใช่รายรับ/รายจ่าย (CLAUDE.md §4)
 */
export function getGoalProgress(goal, today = todayISO()) {
  const wantType = goal.type === 'save' ? 'expense' : 'income';

  let actual = 0;
  for (const t of State.getTransactions()) {
    if (t.type !== wantType) continue;
    if (t.date < goal.start_date || t.date > goal.end_date) continue;
    if (goal.group && t.group !== goal.group) continue;
    actual += t.amount;
  }

  const target     = goal.target_amount;
  const pct        = target > 0 ? Math.round(actual / target * 100) : 0;
  const remaining  = target - actual;               // save = งบที่เหลือ, earn = ยังขาดอีก
  const totalDays  = daysBetweenISO(goal.start_date, goal.end_date) + 1;
  const expired    = today > goal.end_date;
  const notStarted = today < goal.start_date;

  // วันที่ผ่านไปแล้ว (รวมวันนี้) — clamp ให้อยู่ใน [0, totalDays]
  const elapsedDays = Math.min(Math.max(daysBetweenISO(goal.start_date, today) + 1, 0), totalDays);
  // วันที่เหลือ ไม่รวมวันนี้ (0 = วันสุดท้าย)
  const daysLeft    = Math.max(daysBetweenISO(today, goal.end_date), 0);
  const daysUsable  = notStarted ? totalDays : daysLeft + 1;   // รวมวันนี้

  // จังหวะที่ควรอยู่ ณ วันนี้ ถ้าเดินเป็นเส้นตรง
  const expectedPct = totalDays > 0 ? Math.round(elapsedDays / totalDays * 100) : 0;

  const perDay = daysUsable > 0 && remaining > 0
    ? Math.floor(remaining / daysUsable)
    : 0;

  const hit      = goal.type === 'save' ? actual <= target : actual >= target;
  const achieved = goal.type === 'earn' ? actual >= target : (expired && actual <= target);
  const over     = goal.type === 'save' && actual > target;
  const onTrack  = goal.type === 'save' ? pct <= expectedPct : pct >= expectedPct;

  return {
    actual, target, pct, remaining,
    totalDays, elapsedDays, daysLeft, daysUsable, expectedPct, perDay,
    expired, notStarted, hit, achieved, over, onTrack
  };
}


/* === Evaluate (เรียกตอนเปิดแอป) ================================ */

/**
 * ปิดเป้าที่ถึงผลลัพธ์แล้ว:
 * - earn ที่ถึงยอด → ปิดทันที (สำเร็จ)
 * - เป้าที่เลยวันครบกำหนด → ปิดพร้อมบันทึกผล
 * save goal ที่ใช้เกินงบแล้ว "ไม่" ปิดกลางทาง — ผู้ใช้ยังเห็นตัวเลขจริงจนหมดเวลา
 * @returns {Array} [{ goal, achieved }] เป้าที่เพิ่งปิดในรอบนี้
 */
export function evaluateGoals(today = todayISO()) {
  const resolved = [];

  for (const g of getActiveGoals()) {
    const p = getGoalProgress(g, today);
    const finishedEarly = g.type === 'earn' && p.actual >= g.target_amount;
    if (!finishedEarly && !p.expired) continue;

    const achieved = finishedEarly || p.hit;
    const updated = State.updateGoal(g.id, {
      status: 'done',
      achieved,
      resolved_at: today
    });
    if (achieved) awardXP('goal_completed');
    resolved.push({ goal: updated || g, achieved });
  }

  return resolved;
}


/* === Labels ===================================================== */

/** ขอบเขตของเป้า เช่น "ค่าอาหาร" / "ทุกหมวด" */
export function goalScopeLabel(goal) {
  if (goal.group) return getCategory(goal.group).label;
  return goal.type === 'save' ? 'ทุกหมวด' : 'ทุกรายรับ';
}

/** ชื่อเป้าแบบสั้น สำหรับ toast/หัวการ์ด */
export function goalTitle(goal) {
  const scope = goal.group ? getCategory(goal.group).label : null;
  if (goal.type === 'save') return scope ? `ประหยัด${scope}` : 'ประหยัดรายจ่าย';
  return scope ? `หาเงินเพิ่มจาก${scope}` : 'หาเงินเพิ่ม';
}
