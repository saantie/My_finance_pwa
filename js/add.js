/* ===================================================================
   add.js — Add transaction modal (full-screen overlay)
   ===================================================================
   Flow:
   1. กด FAB → openAddModal()
   2. User เลือก type, ใส่ amount ผ่าน keypad, เลือก category, account
   3. กด "บันทึก" → State.addTransaction() → ปิด modal
   4. กด X / back → ปิดโดยไม่บันทึก

   Keypad รองรับ calculator (1500+200) — เห็น utils.calc()
   =================================================================== */

import * as State from './state.js';
import { svgIcon, CATEGORIES, categoriesByType, getCategory } from './icons.js';
import {
  formatBaht, formatLongDate, todayISO, calc, bahtToSatang, haptic
} from './utils.js';
import { showToast } from './views.js';

const modal = () => document.getElementById('add-modal');

/* === Internal draft state ======================================= */
// State ของ modal ปัจจุบัน — reset ทุกครั้งที่เปิดใหม่
let draft = null;

function freshDraft() {
  return {
    type: 'expense',          // expense | income | transfer
    expression: '',           // raw input "1500+200"
    amount: 0,                // satang (computed จาก expression)
    group: 'food',
    account_id: 'cash:default',
    note: '',
    date: todayISO()
  };
}


/* === Public API ================================================= */

/** เปิด modal (เรียกจาก app.js เมื่อกด FAB) */
export function openAddModal() {
  draft = freshDraft();
  // Default category = หมวดแรกของ type ปัจจุบัน
  const cats = categoriesByType(draft.type);
  if (cats.length) draft.group = cats[0].key;

  // Default account = บัญชีแรก (cash)
  const accts = State.getAccounts();
  if (accts.length) draft.account_id = accts[0].id;

  render();
  modal().classList.remove('hidden');
  haptic(8);
}

/** ปิด modal */
export function closeAddModal() {
  modal().classList.add('hidden');
  draft = null;
}


/* === Render ===================================================== */

function render() {
  const el = modal();
  if (!el || !draft) return;

  const cats = categoriesByType(draft.type);
  const accts = State.getAccounts();
  const acct = accts.find(a => a.id === draft.account_id) || accts[0];

  // คำนวณ amount จาก expression
  const computed = calc(draft.expression);
  draft.amount = computed != null ? bahtToSatang(computed) : 0;

  const amountDisplay = draft.expression
    ? (computed != null
        ? Number(computed).toLocaleString('en-US', { maximumFractionDigits: 2 })
        : draft.expression)
    : '0';

  const titleByType = {
    expense:  'บันทึกรายจ่าย',
    income:   'บันทึกรายรับ',
    transfer: 'โอนระหว่างบัญชี'
  };

  el.innerHTML = `
    <!-- Top bar -->
    <div class="add-topbar">
      <button class="add-close" data-action="close" aria-label="ปิด">
        ${svgIcon('close', { size: 18, stroke: 2 })}
      </button>
      <div class="add-title">${titleByType[draft.type]}</div>
      <button class="add-save" data-action="save" ${draft.amount === 0 ? 'disabled' : ''}>
        บันทึก
      </button>
    </div>

    <!-- Date display -->
    <div class="add-date">— ${formatLongDate(draft.date)} —</div>

    <!-- Type segmented control -->
    <div class="add-segmented">
      <div class="seg-item ${draft.type === 'expense' ? 'active' : ''}" data-type="expense">รายจ่าย</div>
      <div class="seg-item ${draft.type === 'income' ? 'active' : ''}" data-type="income">รายรับ</div>
      <div class="seg-item ${draft.type === 'transfer' ? 'active' : ''}" data-type="transfer">โอน</div>
    </div>

    <!-- Big amount -->
    <div class="add-amount">
      <div class="add-amount-label">ใส่จำนวน</div>
      <div class="add-amount-value" data-type="${draft.type}">
        <span class="num">${escapeHtml(amountDisplay)}</span>
        <span class="unit">฿</span>
      </div>
      ${draft.expression && /[+\-*/]/.test(draft.expression)
        ? `<div class="add-calc-hint">= ${escapeHtml(draft.expression)}</div>`
        : ''}
    </div>

    <!-- Meta: category, account, note -->
    <div class="add-meta">
      <div class="meta-block">
        <div class="meta-label">หมวด</div>
        <div class="cat-strip">
          ${cats.map(c => `
            <button class="cat-chip ${draft.group === c.key ? 'active' : ''}" data-cat="${c.key}">
              <div class="cat-chip-icon" style="background: ${c.color}">
                ${svgIcon(c.icon, { size: 18, stroke: 2 })}
              </div>
              <div class="cat-chip-name">${c.label}</div>
            </button>
          `).join('')}
        </div>
      </div>

      <div class="meta-block">
        <div class="meta-label">บัญชี</div>
        <button class="acct-pill" data-action="pick-account">
          <div class="ic" style="background: linear-gradient(135deg, ${acct?.bank ? '#6cc16c' : 'var(--mocha)'}, ${acct?.bank ? '#45984a' : '#a07246'})">
            ${(acct?.bank || '$').toUpperCase().slice(0, 2)}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div class="nm">${escapeHtml(acct?.display_name || 'เลือกบัญชี')}</div>
            ${acct?.account_number_masked
              ? `<div class="num">${escapeHtml(acct.account_number_masked)}</div>`
              : ''}
          </div>
          ${svgIcon('chevron', { size: 16, stroke: 2 })}
        </button>
      </div>

      <div class="meta-block">
        <div class="meta-label">บันทึกเพิ่มเติม</div>
        <input class="note-input" type="text" placeholder="กาแฟกับเพื่อน, ขนมเย็น..." value="${escapeHtml(draft.note)}" data-field="note">
      </div>
    </div>

    <!-- Custom keypad (แทน system keyboard) -->
    <div class="keypad">
      ${renderKey('1')}${renderKey('2')}${renderKey('3')}${renderKey('+', 'op')}
      ${renderKey('4')}${renderKey('5')}${renderKey('6')}${renderKey('-', 'op')}
      ${renderKey('7')}${renderKey('8')}${renderKey('9')}${renderKey('×', 'op', '*')}
      ${renderKey('.')}${renderKey('0')}${renderKeyDel()}${renderKey('=', 'op', '=')}
    </div>
  `;

  bindEvents();
}

function renderKey(label, extraClass = '', value = null) {
  const v = value ?? label;
  return `<button class="key ${extraClass}" data-key="${escapeHtml(v)}">${escapeHtml(label)}</button>`;
}

function renderKeyDel() {
  return `<button class="key del" data-key="DEL" aria-label="ลบ">
    ${svgIcon('bksp', { size: 22, stroke: 2 })}
  </button>`;
}


/* === Event bindings ============================================= */

function bindEvents() {
  const el = modal();
  if (!el) return;

  // Close
  el.querySelector('[data-action="close"]')?.addEventListener('click', closeAddModal);

  // Save
  el.querySelector('[data-action="save"]')?.addEventListener('click', save);

  // Type segmented
  el.querySelectorAll('.seg-item').forEach(item => {
    item.addEventListener('click', () => {
      draft.type = item.dataset.type;
      // Reset category เมื่อเปลี่ยน type
      const cats = categoriesByType(draft.type);
      if (cats.length && !cats.find(c => c.key === draft.group)) {
        draft.group = cats[0].key;
      }
      render();
    });
  });

  // Category chips
  el.querySelectorAll('.cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      draft.group = chip.dataset.cat;
      render();
    });
  });

  // Account picker
  el.querySelector('[data-action="pick-account"]')?.addEventListener('click', pickAccount);

  // Note input — bind ตรงๆ ไม่ re-render
  el.querySelector('[data-field="note"]')?.addEventListener('input', (e) => {
    draft.note = e.target.value;
  });

  // Keypad
  el.querySelectorAll('.key').forEach(k => {
    k.addEventListener('click', () => {
      handleKey(k.dataset.key);
      haptic(5);
    });
  });
}


/* === Keypad logic =============================================== */

function handleKey(key) {
  if (key === 'DEL') {
    draft.expression = draft.expression.slice(0, -1);
  } else if (key === '=') {
    // ประเมิน expression แล้ว replace
    const result = calc(draft.expression);
    if (result != null) {
      draft.expression = String(result);
    }
  } else if ('+-*/'.includes(key)) {
    // Operator: ป้องกัน double operator
    const last = draft.expression.slice(-1);
    if ('+-*/'.includes(last)) {
      draft.expression = draft.expression.slice(0, -1) + key;
    } else if (draft.expression) {
      draft.expression += key;
    }
  } else if (key === '.') {
    // ป้องกัน "." ซ้ำในตัวเลขเดียวกัน
    const lastNum = draft.expression.split(/[+\-*/]/).pop();
    if (!lastNum.includes('.')) draft.expression += '.';
  } else {
    // Digit
    draft.expression += key;
  }
  render();
}


/* === Account picker (simple) ==================================== */

function pickAccount() {
  const accts = State.getAccounts();
  if (accts.length <= 1) return;

  // Simple prompt — production ควรใช้ bottom sheet
  const list = accts.map((a, i) => `${i + 1}. ${a.display_name}`).join('\n');
  const choice = prompt(`เลือกบัญชี:\n${list}\n\nพิมพ์เลข:`);
  const idx = Number(choice) - 1;
  if (idx >= 0 && idx < accts.length) {
    draft.account_id = accts[idx].id;
    render();
  }
}


/* === Save ======================================================= */

function save() {
  if (draft.amount <= 0) {
    showToast('ใส่จำนวนเงินก่อน');
    return;
  }

  // Auto-set description ถ้า user ไม่ใส่
  const description = draft.note || getCategory(draft.group).label;

  State.addTransaction({
    type: draft.type,
    amount: draft.amount,
    group: draft.group,
    category: getCategory(draft.group).label,
    description,
    account_from: draft.type === 'transfer' ? draft.account_id : (draft.type === 'expense' ? draft.account_id : null),
    account_to: draft.type === 'transfer' ? null : (draft.type === 'income' ? draft.account_id : null),
    date: draft.date,
    source: 'manual',
    user_classified: true
  });

  haptic([5, 30, 50]);
  showToast('บันทึกแล้ว');
  closeAddModal();
}


/* === Helper ===================================================== */
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
