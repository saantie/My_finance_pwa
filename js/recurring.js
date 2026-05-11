/* ===================================================================
   recurring.js — Recurring + Scheduled + Installment templates
   ===================================================================
   จัดการ template ที่จะ generate transaction อัตโนมัติเมื่อถึงเวลา

   Frequency types:
   - 'one-time'    = ครั้งเดียวในอนาคต (รายจ่ายล่วงหน้า)
   - 'monthly'     = ทุกเดือน (ค่าไฟ, ค่าเน็ต)
   - 'weekly'      = ทุกสัปดาห์
   - 'yearly'      = ทุกปี (ภาษี, ประกัน)
   - 'installment' = ผ่อนชำระ (3/12 งวด, ลดทีละเดือน)

   Auto-execute:
   - app.js เรียก runScheduler() ทุกครั้งเปิดแอป
   - Scheduler หา template ที่ next_due <= วันนี้ → สร้าง real tx
   - Update next_due ตาม frequency

   หมายเหตุ: รายการ "ล่วงหน้า" = next_due อยู่ในอนาคต → ไม่สร้างจนกว่าจะถึง
   แต่ user ดู forecast ได้
   =================================================================== */

import * as State from './state.js';
import { uuid, todayISO, parseLocalDate } from './utils.js';

const TEMPLATE_KEY = 'diary_recurring_v1';

let _templates = loadTemplates();
const _listeners = new Set();


/* === Persistence ================================================ */

function loadTemplates() {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save() {
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(_templates));
  _listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
}

export function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}


/* === Public API ================================================= */

/**
 * เพิ่ม template ใหม่
 * @param {object} t
 *   - type: 'expense' | 'income' | 'transfer'
 *   - amount: satang
 *   - group, description, account_id
 *   - frequency: 'one-time' | 'monthly' | 'weekly' | 'yearly' | 'installment'
 *   - first_due: 'YYYY-MM-DD' (วันแรกที่ครบกำหนด)
 *   - installment_total (ถ้า installment)
 * @returns template ที่สร้างเสร็จ
 */
export function addTemplate(t) {
  const template = {
    id: uuid(),
    type: t.type || 'expense',
    amount: Math.abs(t.amount || 0),
    group: t.group || 'other',
    category: t.category || '',
    description: t.description || '',
    account_id: t.account_id || null,

    frequency: t.frequency || 'monthly',
    first_due: t.first_due || todayISO(),
    next_due: t.first_due || todayISO(),

    // Installment-specific
    installment_total: t.installment_total || null,
    installment_paid: 0,

    // Status
    active: true,
    last_executed: null,
    createdAt: new Date().toISOString()
  };
  _templates.push(template);
  save();
  return template;
}

export function getTemplates() {
  return [..._templates];
}

export function getActiveTemplates() {
  return _templates.filter(t => t.active);
}

export function getTemplate(id) {
  return _templates.find(t => t.id === id);
}

export function updateTemplate(id, patch) {
  const idx = _templates.findIndex(t => t.id === id);
  if (idx === -1) return null;
  _templates[idx] = { ..._templates[idx], ...patch };
  save();
  return _templates[idx];
}

export function deleteTemplate(id) {
  _templates = _templates.filter(t => t.id !== id);
  save();
}


/* === Forecast: รายการที่จะเกิดใน N วันข้างหน้า ================= */

/**
 * ดูรายการที่จะเกิดในช่วง [today, today+days]
 * @returns array ของ { date, template, amount, type }
 */
export function getForecast(days = 30) {
  const today = todayISO();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);
  const endISO = endDate.toISOString().slice(0, 10);

  const results = [];
  for (const t of _templates) {
    if (!t.active) continue;

    // Generate occurrences ใน range
    let cursor = t.next_due;
    let installmentLeft = t.installment_total ? (t.installment_total - t.installment_paid) : null;

    while (cursor <= endISO) {
      results.push({
        date: cursor,
        templateId: t.id,
        type: t.type,
        amount: t.amount,
        group: t.group,
        description: t.description,
        account_id: t.account_id,
        frequency: t.frequency,
        installment_info: t.frequency === 'installment'
          ? { current: t.installment_paid + 1 + (results.filter(r => r.templateId === t.id).length), total: t.installment_total }
          : null
      });

      cursor = computeNextDue(cursor, t.frequency);

      // One-time + Installment ที่ใช้หมดงวด → stop
      if (t.frequency === 'one-time') break;
      if (t.frequency === 'installment') {
        installmentLeft--;
        if (installmentLeft <= 0) break;
      }

      if (!cursor) break;
    }
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}


/* === Scheduler: execute templates ที่ครบกำหนด ================= */

/**
 * เรียกทุกครั้งเปิดแอป — สร้าง transaction จาก template ที่ next_due <= วันนี้
 * @returns { executed: number, skipped: number }
 */
export function runScheduler() {
  const today = todayISO();
  let executed = 0;
  let skipped = 0;

  for (const t of _templates) {
    if (!t.active) continue;

    // Loop: อาจ overdue หลายงวด (เช่น ไม่ได้เปิดแอป 2 เดือน)
    let safety = 24;  // กันลูปไม่จบ
    while (t.active && t.next_due && t.next_due <= today && safety-- > 0) {
      // Skip ถ้ามี transaction จาก template นี้ในวันเดียวกันแล้ว (ป้องกัน duplicate)
      const existing = State.getTransactions().filter(tx =>
        tx.source === 'scheduled' &&
        tx.template_id === t.id &&
        tx.date === t.next_due
      );

      if (existing.length === 0) {
        State.addTransaction({
          type: t.type,
          amount: t.amount,
          group: t.group,
          category: t.category,
          description: t.description + (t.frequency === 'installment'
            ? ` (งวด ${t.installment_paid + 1}/${t.installment_total})`
            : ''),
          account_from: t.type !== 'income' ? t.account_id : null,
          account_to: t.type === 'income' ? t.account_id : null,
          date: t.next_due,
          source: 'scheduled',
          template_id: t.id,
          user_classified: false
        });
        executed++;
      } else {
        skipped++;
      }

      // Advance
      advanceTemplate(t);
    }
  }

  if (executed > 0) save();
  return { executed, skipped };
}

/** Internal: ขยับ template ไปงวดต่อไป */
function advanceTemplate(t) {
  t.last_executed = t.next_due;

  if (t.frequency === 'one-time') {
    t.active = false;
    t.next_due = null;
    return;
  }

  if (t.frequency === 'installment') {
    t.installment_paid++;
    if (t.installment_paid >= t.installment_total) {
      t.active = false;
      t.next_due = null;
      return;
    }
  }

  t.next_due = computeNextDue(t.next_due, t.frequency);
}

/** คำนวณ next_due ตาม frequency */
function computeNextDue(currentISO, frequency) {
  const d = parseLocalDate(currentISO);
  switch (frequency) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
    case 'installment':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
    case 'one-time':
      return null;
    default:
      return null;
  }
  // กลับเป็น ISO local
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}


/* === Stats ====================================================== */

/** สรุป recurring rate รายเดือน */
export function getMonthlyRecurringTotal() {
  let income = 0;
  let expense = 0;
  for (const t of _templates) {
    if (!t.active) continue;
    // ปรับเป็น "per month" rate
    let perMonth = 0;
    if (t.frequency === 'monthly') perMonth = t.amount;
    else if (t.frequency === 'weekly') perMonth = t.amount * 4.33;
    else if (t.frequency === 'yearly') perMonth = t.amount / 12;
    else if (t.frequency === 'installment') perMonth = t.amount;
    // one-time ไม่นับใน monthly recurring

    if (t.type === 'income') income += perMonth;
    else if (t.type === 'expense') expense += perMonth;
  }
  return { income: Math.round(income), expense: Math.round(expense) };
}
