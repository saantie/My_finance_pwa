/* ===================================================================
   add.js — Add transaction modal (full-screen overlay)
   ===================================================================
   รองรับ:
   - บันทึกธรรมดา (วันนี้)
   - บันทึกล่วงหน้า (one-time future)
   - บันทึกประจำ (รายเดือน, รายสัปดาห์, รายปี)
   - ผ่อนชำระ (installment N งวด)
   - Voice input (ภาษาไทย NLP)
   - Calculator keypad

   Flow:
   1. กด FAB → openAddModal() → draft = freshDraft()
   2. User เลือก type, amount, category, account, frequency
   3. ถ้า frequency = 'today' → State.addTransaction()
      ไม่งั้น → Recurring.addTemplate() (scheduler จะสร้าง tx เมื่อถึงเวลา)
   4. ปิด modal

   Voice:
   - กด mic icon → VoiceRecorder.start()
   - Result → parseIntent() → fill draft
   =================================================================== */

import * as State from './state.js';
import * as Recurring from './recurring.js';
import { svgIcon, CATEGORIES, categoriesByType, getCategory } from './icons.js';
import {
  formatBaht, formatLongDate, formatShortDate, todayISO, calc,
  bahtToSatang, haptic
} from './utils.js';
import { showToast } from './views.js';
import { VoiceRecorder, parseIntent } from './voice.js';

const modal = () => document.getElementById('add-modal');


/* === Draft state ================================================ */
let draft = null;
let editingTxId = null;   // ถ้าไม่ null = edit mode

function freshDraft() {
  return {
    type: 'expense',                  // expense | income | transfer
    expression: '',                   // raw input "1500+200"
    amount: 0,                        // satang
    group: 'food',
    account_id: 'cash:default',
    note: '',
    date: todayISO(),

    // Frequency:
    // 'today'      = ครั้งเดียววันนี้ (default)
    // 'scheduled'  = ล่วงหน้า (one-time future) — ใช้ first_due
    // 'monthly'    = ทุกเดือน
    // 'weekly'     = ทุกสัปดาห์
    // 'yearly'     = ทุกปี
    // 'installment'= ผ่อน N งวด
    frequency: 'today',
    first_due: todayISO(),
    installment_total: 12              // default
  };
}


/* === Public API ================================================= */

export function openAddModal(prefill = null) {
  editingTxId = null;
  draft = freshDraft();

  // Default category = หมวดแรกของ type
  const cats = categoriesByType(draft.type);
  if (cats.length) draft.group = cats[0].key;

  // Default account
  const accts = State.getAccounts();
  if (accts.length) draft.account_id = accts[0].id;

  // Apply prefill (จาก slip / voice / etc.)
  if (prefill) {
    Object.assign(draft, prefill);
    if (prefill.amount != null && prefill.amount > 0) {
      draft.expression = String(prefill.amount / 100);
    }
  }

  render();
  modal().classList.remove('hidden');
  haptic(8);
}

/** เปิด modal โดย pre-fill จาก transaction ที่มีอยู่ (edit mode) */
export function openEditModal(tx) {
  editingTxId = tx.id;
  draft = {
    type:              tx.type,
    expression:        String(tx.amount / 100),
    amount:            tx.amount,
    group:             tx.group,
    account_id:        tx.account_from || tx.account_to || 'cash:default',
    // เก็บ account_to ต้นฉบับของ transfer ไว้ (เช่น ATM → cash:default)
    // เพราะ modal มี account picker แค่ตัวเดียว (account_from) — account_to ต้องรักษาไว้
    _orig_account_to:  tx.type === 'transfer' ? (tx.account_to || null) : null,
    note:              tx.description || '',
    date:              tx.date,
    frequency:         'today',
    first_due:         tx.date,
    installment_total: 12
  };

  render();
  modal().classList.remove('hidden');
  haptic(8);
}

export function closeAddModal() {
  modal().classList.add('hidden');
  draft = null;
  editingTxId = null;
}


/* === Render ===================================================== */

function render() {
  const el = modal();
  if (!el || !draft) return;

  const cats = categoriesByType(draft.type);
  const accts = State.getAccounts();
  const acct = accts.find(a => a.id === draft.account_id) || accts[0];

  // Compute amount
  const computed = calc(draft.expression);
  draft.amount = computed != null ? bahtToSatang(computed) : 0;

  const amountDisplay = draft.expression
    ? (computed != null
        ? Number(computed).toLocaleString('en-US', { maximumFractionDigits: 2 })
        : draft.expression)
    : '0';

  const titleByType = {
    expense:  editingTxId ? 'แก้ไขรายการ' : 'บันทึกรายการ',
    income:   editingTxId ? 'แก้ไขรายการ' : 'บันทึกรายการ',
    transfer: editingTxId ? 'แก้ไขการโอน' : 'โอนระหว่างบัญชี'
  };

  // Title prefix ถ้าเป็น recurring (ไม่แสดงใน edit mode)
  let titlePrefix = '';
  if (!editingTxId) {
    if (draft.frequency === 'past') titlePrefix = 'ย้อนหลัง · ';
    else if (draft.frequency === 'scheduled') titlePrefix = 'ล่วงหน้า · ';
    else if (draft.frequency === 'monthly' || draft.frequency === 'weekly' || draft.frequency === 'yearly') titlePrefix = 'ประจำ · ';
    else if (draft.frequency === 'installment') titlePrefix = 'ผ่อน · ';
  }
  const displayDate = draft.frequency === 'past' ? draft.first_due : draft.date;

  el.innerHTML = `
    <div class="add-topbar">
      <button class="add-close" data-action="close" aria-label="ปิด">
        ${svgIcon('close', { size: 18, stroke: 2 })}
      </button>
      <div class="add-title">${titlePrefix}${titleByType[draft.type]}</div>
      <button class="add-save" data-action="save" ${draft.amount === 0 ? 'disabled' : ''}>
        บันทึก
      </button>
    </div>

    <div class="add-date">— ${formatLongDate(displayDate)} —</div>

    <div class="add-segmented">
      <div class="seg-item ${draft.type === 'expense' ? 'active' : ''}" data-type="expense">รายจ่าย</div>
      <div class="seg-item ${draft.type === 'income' ? 'active' : ''}" data-type="income">รายรับ</div>
      <div class="seg-item ${draft.type === 'transfer' ? 'active' : ''}" data-type="transfer">โอน</div>
    </div>

    <!-- Account picker — ย้ายมาก่อนใส่จำนวน -->
    <div class="add-acct-row">
      <button class="acct-pill" data-action="pick-account">
        <div class="ic" style="background: ${bankGradient(acct?.bank, acct?.type)}">
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

    <div class="add-amount">
      <div class="add-amount-label">ใส่จำนวน</div>
      <div class="add-amount-row">
        <button class="voice-btn-large" data-action="voice" aria-label="พูดเพื่อบันทึก">
          ${svgIcon('mic', { size: 40, stroke: 1.6 })}
        </button>
        <div class="add-amount-value" data-type="${draft.type}">
          <span class="num">${escapeHtml(amountDisplay)}</span>
          <span class="unit">฿</span>
        </div>
        <div class="voice-btn-spacer"></div>
      </div>
      ${draft.expression && /[+\-*/]/.test(draft.expression)
        ? `<div class="add-calc-hint">= ${escapeHtml(draft.expression)}</div>`
        : ''}
    </div>

    <div class="add-meta">
      <!-- Category -->
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

      <!-- Frequency / scheduling (ซ่อนใน edit mode) -->
      ${editingTxId ? '' : `
      <div class="meta-block">
        <div class="meta-label">เกิดเมื่อไหร่</div>
        <div class="freq-grid">
          ${renderFreqOption('today',       'วันนี้',      'check')}
          ${renderFreqOption('past',        'ย้อนหลัง',   'clock')}
          ${renderFreqOption('scheduled',   'ล่วงหน้า',   'plus')}
          ${renderFreqOption('monthly',     'ทุกเดือน',   'transfer')}
          ${renderFreqOption('weekly',      'ทุกสัปดาห์', 'transfer')}
          ${renderFreqOption('installment', 'ผ่อน',        'gamepad')}
        </div>
        ${renderFreqDetails()}
      </div>
      `}

      <!-- Note -->
      <div class="meta-block">
        <div class="meta-label">บันทึกเพิ่มเติม</div>
        <input class="note-input" type="text" placeholder="กาแฟกับเพื่อน, ขนมเย็น..." value="${escapeHtml(draft.note)}" data-field="note">
      </div>
    </div>

    <!-- Custom keypad -->
    <div class="keypad">
      ${renderKey('1')}${renderKey('2')}${renderKey('3')}${renderKey('+', 'op')}
      ${renderKey('4')}${renderKey('5')}${renderKey('6')}${renderKey('-', 'op')}
      ${renderKey('7')}${renderKey('8')}${renderKey('9')}${renderKey('×', 'op', '*')}
      ${renderKey('.')}${renderKey('0')}${renderKeyDel()}${renderKey('=', 'op', '=')}
    </div>
  `;

  bindEvents();
}


function renderFreqOption(key, label, icon) {
  const active = draft.frequency === key;
  return `<button class="freq-opt ${active ? 'active' : ''}" data-freq="${key}">
    <span>${label}</span>
  </button>`;
}

/** Render รายละเอียดเพิ่มของ frequency (date picker, จำนวนงวด) */
function renderFreqDetails() {
  if (draft.frequency === 'today') return '';

  if (draft.frequency === 'past') {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const maxDate = yesterday.toISOString().slice(0, 10);
    return `
      <div class="freq-detail">
        <label>วันที่เกิดขึ้น</label>
        <input type="date" data-field="first_due" value="${draft.first_due}" max="${maxDate}">
      </div>
    `;
  }

  if (draft.frequency === 'scheduled') {
    return `
      <div class="freq-detail">
        <label>วันที่จะเกิด</label>
        <input type="date" data-field="first_due" value="${draft.first_due}" min="${todayISO()}">
      </div>
    `;
  }

  if (draft.frequency === 'monthly' || draft.frequency === 'weekly' || draft.frequency === 'yearly') {
    return `
      <div class="freq-detail">
        <label>เริ่มวันแรก</label>
        <input type="date" data-field="first_due" value="${draft.first_due}">
        <div class="freq-hint">— จะสร้างรายการให้อัตโนมัติทุกครั้งเมื่อถึงกำหนด</div>
      </div>
    `;
  }

  if (draft.frequency === 'installment') {
    const monthly = draft.amount > 0 && draft.installment_total > 0
      ? Math.round(draft.amount / draft.installment_total / 100)
      : 0;
    return `
      <div class="freq-detail">
        <label>จำนวนงวด</label>
        <div class="installment-row">
          <button class="install-btn" data-install="-">−</button>
          <span class="install-val">${draft.installment_total} งวด</span>
          <button class="install-btn" data-install="+">+</button>
        </div>
        <label>งวดแรกครบกำหนด</label>
        <input type="date" data-field="first_due" value="${draft.first_due}">
        ${monthly > 0
          ? `<div class="freq-hint">≈ <strong>${monthly.toLocaleString()} ฿</strong> ต่องวด · รวม <strong>${(draft.amount / 100).toLocaleString()} ฿</strong></div>`
          : `<div class="freq-hint">ใส่ยอดรวมที่ต้องผ่อนทั้งหมด</div>`}
      </div>
    `;
  }

  return '';
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

  el.querySelector('[data-action="close"]')?.addEventListener('click', closeAddModal);
  el.querySelector('[data-action="save"]')?.addEventListener('click', save);
  el.querySelector('[data-action="voice"]')?.addEventListener('click', startVoice);
  el.querySelector('[data-action="pick-account"]')?.addEventListener('click', pickAccount);

  // Type segmented
  el.querySelectorAll('.seg-item').forEach(item => {
    item.addEventListener('click', () => {
      draft.type = item.dataset.type;
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

  // Frequency options
  el.querySelectorAll('.freq-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      draft.frequency = opt.dataset.freq;
      if (draft.frequency === 'past') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        draft.first_due = yesterday.toISOString().slice(0, 10);
      } else if (draft.frequency === 'scheduled') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        draft.first_due = tomorrow.toISOString().slice(0, 10);
      }
      render();
    });
  });

  // Date picker for first_due
  el.querySelector('[data-field="first_due"]')?.addEventListener('change', (e) => {
    draft.first_due = e.target.value;
    render();
  });

  // Installment +/-
  el.querySelectorAll('[data-install]').forEach(btn => {
    btn.addEventListener('click', () => {
      const op = btn.dataset.install;
      if (op === '+') draft.installment_total = Math.min(60, draft.installment_total + 1);
      else if (op === '-') draft.installment_total = Math.max(2, draft.installment_total - 1);
      render();
    });
  });

  // Note
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


/* === Voice input ================================================ */

function startVoice() {
  const recorder = new VoiceRecorder();
  if (!recorder.supported) {
    showToast('เบราว์เซอร์ไม่รองรับเสียง — ใช้ Chrome');
    return;
  }

  // Show full-screen listening overlay
  const overlay = document.createElement('div');
  overlay.className = 'voice-overlay';
  overlay.innerHTML = `
    <div class="voice-stage">
      <div class="mic-pulse">
        ${svgIcon('mic', { size: 32, stroke: 1.8 })}
      </div>
      <div class="voice-prompt">พูดได้เลย</div>
      <div class="voice-transcript"></div>
      <div class="voice-hint">
        ลอง: <em>"ค่ากาแฟ 65 บาท"</em> · <em>"เงินเดือน สองหมื่น"</em>
      </div>
      <button class="voice-cancel" data-action="cancel-voice">ยกเลิก</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const transcriptEl = overlay.querySelector('.voice-transcript');
  const promptEl = overlay.querySelector('.voice-prompt');

  let finalText = '';

  const close = () => {
    recorder.stop();
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };

  overlay.querySelector('[data-action="cancel-voice"]').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    // คลิกพื้นที่ว่างนอก stage = ปิด
    if (e.target === overlay) close();
  });

  recorder.start(
    ({ transcript, isFinal }) => {
      transcriptEl.textContent = transcript;
      promptEl.textContent = 'กำลังฟัง...';
      if (isFinal) finalText = transcript;
    },
    (err) => {
      const errMsg = {
        'not-allowed': 'ไม่ได้รับสิทธิ์ใช้ไมค์',
        'no-speech': 'ไม่ได้ยินเสียง — ลองใหม่',
        'network': 'ต้องต่อ internet',
        'browser_not_supported': 'เบราว์เซอร์ไม่รองรับ'
      }[err] || 'เกิดข้อผิดพลาด';
      showToast(errMsg);
      close();
    },
    () => {
      // ended — process result
      if (!finalText) {
        close();
        return;
      }

      const intent = parseIntent(finalText);
      if (intent && intent.amount != null) {
        // Apply ลง draft
        draft.type = intent.type;
        draft.expression = String(intent.amount);
        draft.group = intent.group !== 'other' ? intent.group : draft.group;
        if (intent.description) draft.note = intent.description;

        render();
        showToast(`ฟังได้: ${intent.description || ''} ${intent.amount.toLocaleString()} ฿`);
      } else if (intent) {
        // เจอ category/type แต่ไม่มี amount — ใส่แค่หมวดกับ note
        draft.type = intent.type;
        if (intent.group !== 'other') draft.group = intent.group;
        if (intent.description) draft.note = intent.description;
        render();
        showToast('ใส่จำนวนเงินด้วย');
      } else {
        showToast('ไม่เข้าใจ — ลองใหม่');
      }
      close();
    }
  );
}


/* === Keypad logic =============================================== */

function handleKey(key) {
  if (key === 'DEL') {
    draft.expression = draft.expression.slice(0, -1);
  } else if (key === '=') {
    const result = calc(draft.expression);
    if (result != null) draft.expression = String(result);
  } else if ('+-*/'.includes(key)) {
    const last = draft.expression.slice(-1);
    if ('+-*/'.includes(last)) {
      draft.expression = draft.expression.slice(0, -1) + key;
    } else if (draft.expression) {
      draft.expression += key;
    }
  } else if (key === '.') {
    const lastNum = draft.expression.split(/[+\-*/]/).pop();
    if (!lastNum.includes('.')) draft.expression += '.';
  } else {
    draft.expression += key;
  }
  render();
}


/* === Account picker ============================================= */

/* คำนวณยอดคงเหลือต่อบัญชีจากรายการจริง */
function calcAccountBalance(accountId) {
  return State.getTransactions().reduce((sum, tx) => {
    if (tx.type === 'expense'  && tx.account_from === accountId) return sum - tx.amount;
    if (tx.type === 'income'   && tx.account_to   === accountId) return sum + tx.amount;
    if (tx.type === 'transfer') {
      if (tx.account_from === accountId) return sum - tx.amount;
      if (tx.account_to   === accountId) return sum + tx.amount;
    }
    return sum;
  }, 0);
}

/**
 * Bottom-sheet picker สำหรับเลือกบัญชี
 * @param {string} currentAccountId — account ที่เลือกอยู่ปัจจุบัน
 * @param {function} onSelect — callback(accountId) เมื่อ user เลือก
 */
export function openAccountPickerModal(currentAccountId, onSelect) {
  const accts = State.getAccounts();
  if (accts.length === 0) return;

  // ป้องกัน picker ซ้อนกัน
  document.querySelector('.picker-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'picker-overlay';

  overlay.innerHTML = `
    <div class="picker-sheet">
      <div class="picker-handle"></div>
      <div class="picker-title">เลือกบัญชี</div>
      <div class="picker-list">
        ${accts.map(a => {
          const bal = calcAccountBalance(a.id);
          const balStr = formatBaht(bal);
          const isActive = a.id === currentAccountId;
          return `
            <button class="picker-row${isActive ? ' active' : ''}" data-id="${escapeHtml(a.id)}">
              <div class="ic" style="background: ${bankGradient(a.bank, a.type)}">
                ${(a.bank || '$').toUpperCase().slice(0, 2)}
              </div>
              <div class="picker-row-info">
                <div class="nm">${escapeHtml(a.display_name)}</div>
                <div class="num">${balStr} ฿${a.account_number_masked ? ' · ' + escapeHtml(a.account_number_masked) : ''}</div>
              </div>
              ${isActive ? svgIcon('check', { size: 16, stroke: 2.5 }) : ''}
            </button>
          `;
        }).join('')}
      </div>
      <button class="picker-add">+ เพิ่มบัญชีใหม่</button>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };

  // ESC key → cancel (desktop)
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  // tap row → select + close
  overlay.querySelectorAll('.picker-row').forEach(btn => {
    btn.addEventListener('click', () => {
      onSelect(btn.dataset.id);
      close();
    });
  });

  // tap overlay (outside sheet) → cancel
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });

  // swipe-down handle → cancel (touch)
  const handle = overlay.querySelector('.picker-handle');
  let startY = 0;
  handle.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
  handle.addEventListener('touchmove', e => {
    if (e.touches[0].clientY - startY > 50) close();
  }, { passive: true });

  // + เพิ่มบัญชีใหม่ → navigate to settings
  overlay.querySelector('.picker-add').addEventListener('click', () => {
    close();
    document.querySelector('[data-tab="settings"]')?.click();
  });
}

/* wrapper ภายใน — เชื่อม draft กับ openAccountPickerModal */
function pickAccount() {
  openAccountPickerModal(draft.account_id, id => {
    draft.account_id = id;
    render();
  });
}


/* === Duplicate detection ======================================== */

function hasDuplicate(amount, date) {
  const dateTime = new Date(date).getTime();
  return State.getTransactions().some(ex =>
    ex.amount === amount &&
    Math.abs(new Date(ex.date).getTime() - dateTime) <= 86400000
  );
}

function showDupConfirm(onConfirm) {
  const m = modal();
  m.querySelector('.dup-confirm')?.remove();

  const bar = document.createElement('div');
  bar.className = 'dup-confirm';
  bar.innerHTML = `
    <div class="dup-confirm-msg">
      ${svgIcon('alert-triangle', { size: 15, stroke: 2 })}
      พบรายการจำนวนนี้ในวันใกล้เคียง — บันทึกซ้ำหรือไม่?
    </div>
    <div class="dup-confirm-btns">
      <button class="dup-btn-cancel">ยกเลิก</button>
      <button class="dup-btn-save">บันทึกต่อ</button>
    </div>
  `;

  const topbar = m.querySelector('.add-topbar');
  topbar.insertAdjacentElement('afterend', bar);

  bar.querySelector('.dup-btn-cancel').addEventListener('click', () => bar.remove());
  bar.querySelector('.dup-btn-save').addEventListener('click', () => {
    bar.remove();
    onConfirm();
  });
}


/* === Save ======================================================= */

function save() {
  if (draft.amount <= 0) {
    showToast('ใส่จำนวนเงินก่อน');
    return;
  }

  const description = draft.note || getCategory(draft.group).label;
  const category = getCategory(draft.group).label;

  // === Edit mode: อัปเดตรายการที่มีอยู่ ===
  if (editingTxId) {
    // สำหรับ transfer → รักษา account_to ต้นฉบับ (เช่น ATM → cash:default)
    // เพราะ modal มี picker แค่ตัวเดียว (account_from) — ผู้ใช้ไม่ได้เปลี่ยน account_to
    const newAccountTo = draft.type === 'income'
      ? draft.account_id
      : (draft.type === 'transfer' ? (draft._orig_account_to || null) : null);
    State.updateTransaction(editingTxId, {
      type:             draft.type,
      amount:           draft.amount,
      group:            draft.group,
      category,
      description,
      account_from:     draft.type !== 'income' ? draft.account_id : null,
      account_to:       newAccountTo,
      user_classified:  true    // user แก้แล้ว → parser ไม่ override
    });
    haptic([5, 30, 50]);
    showToast('แก้ไขแล้ว');
    closeAddModal();
    return;
  }

  // === Case 1: บันทึกธรรมดา (วันนี้ หรือ ย้อนหลัง) ===
  if (draft.frequency === 'today' || draft.frequency === 'past') {
    const txDate = draft.frequency === 'past' ? draft.first_due : draft.date;

    function doSave() {
      State.addTransaction({
        type: draft.type,
        amount: draft.amount,
        group: draft.group,
        category,
        description,
        account_from: draft.type !== 'income' ? draft.account_id : null,
        account_to: draft.type === 'income' ? draft.account_id : null,
        date: txDate,
        source: 'manual',
        user_classified: true
      });
      haptic([5, 30, 50]);
      showToast('บันทึกแล้ว');
      closeAddModal();
    }

    if (hasDuplicate(draft.amount, txDate)) {
      showDupConfirm(doSave);
      return;
    }

    doSave();
    return;
  }

  // === Case 2: บันทึกล่วงหน้า / ประจำ / ผ่อน ===
  // ผ่อน: amount เป็นยอดรวม ต้องหารต่องวด
  let perOccurrenceAmount = draft.amount;
  if (draft.frequency === 'installment' && draft.installment_total > 0) {
    perOccurrenceAmount = Math.round(draft.amount / draft.installment_total);
  }

  const tmplFreq = draft.frequency === 'scheduled' ? 'one-time' : draft.frequency;

  Recurring.addTemplate({
    type: draft.type,
    amount: perOccurrenceAmount,
    group: draft.group,
    category,
    description,
    account_id: draft.account_id,
    frequency: tmplFreq,
    first_due: draft.first_due,
    installment_total: draft.frequency === 'installment' ? draft.installment_total : null
  });

  haptic([5, 30, 50]);

  // ถ้า first_due คือวันนี้ → run scheduler ทันที
  if (draft.first_due === todayISO()) {
    Recurring.runScheduler();
  }

  // Toast บอกว่าตั้งอะไรไว้
  const toastByFreq = {
    scheduled:    `ตั้งล่วงหน้า ${formatShortDate(draft.first_due)}`,
    monthly:      `ตั้งประจำ ทุกเดือน เริ่ม ${formatShortDate(draft.first_due)}`,
    weekly:       `ตั้งประจำ ทุกสัปดาห์`,
    yearly:       `ตั้งประจำ ทุกปี`,
    installment:  `ตั้งผ่อน ${draft.installment_total} งวด · ${(perOccurrenceAmount / 100).toLocaleString()} ฿/งวด`
  };
  showToast(toastByFreq[draft.frequency] || 'บันทึกแล้ว');
  closeAddModal();
}


/* === Helpers ==================================================== */

function bankGradient(bank, type) {
  const MAP = {
    ktb:        'linear-gradient(135deg, #5fb0e0, #3787c5)',
    kbank:      'linear-gradient(135deg, #6cc16c, #45984a)',
    scb:        'linear-gradient(135deg, #b378c0, #8a59a0)',
    bbl:        'linear-gradient(135deg, #4f7eb8, #2a5a94)',
    bay:        'linear-gradient(135deg, #e8b649, #c79939)',
    investment: 'linear-gradient(135deg, #3aafa9, #2a8780)',
    debt:       'linear-gradient(135deg, #d96b5e, #b84f44)',
    credit_card:'linear-gradient(135deg, #8b6db5, #6a4f96)',
    ewallet:    'linear-gradient(135deg, #5e9bd6, #3a77b8)',
  };
  return MAP[bank] || MAP[type] || 'linear-gradient(135deg, #c89368, #a07246)';
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
