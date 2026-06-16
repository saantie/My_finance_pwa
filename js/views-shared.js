/* ===================================================================
   views-shared.js — primitives ที่ทุก view cluster + add.js ใช้ร่วมกัน
   ===================================================================
   แยกออกจาก views.js (Phase B) เพื่อให้ cluster files (dashboard/list/
   settings/import) import ได้โดยไม่ต้องวน import กลับไป views.js
   views.js re-export ของพวกนี้ต่อ เพื่อ backward-compat กับ app.js/add.js
   =================================================================== */

import * as State from './state.js';
import { svgIcon, getCategory, CATEGORIES, ICON_PICKER_KEYS, COLOR_PALETTE } from './icons.js';
import { haptic, formatTime, formatBaht, todayISO } from './utils.js';
import { getLevelInfo } from './gamification.js';
import { deriveLabelFromText } from './categorize.js';

/* ป้ายหมวดสำหรับแสดงผล — รายการที่จับหมวดไม่ได้ (group='other')
   ใช้คำที่มีความหมายจาก description แทน "อื่นๆ" (ดู deriveLabelFromText) */
export function categoryLabel(tx) {
  if (tx && tx.group === 'other') {
    const derived = deriveLabelFromText(tx.description);
    if (derived) return derived;
  }
  return getCategory(tx?.group).label;
}

/* === Empty state card (icon + title + subtitle + ปุ่ม CTA) ======== */
export function renderEmptyState({ icon, title, subtitle = '', actions = [] }) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${svgIcon(icon, { size: 48, stroke: 1.5 })}</div>
      <h3 class="empty-title">${title}</h3>
      ${subtitle ? `<p class="empty-subtitle">${subtitle}</p>` : ''}
      ${actions.length ? `
        <div class="empty-actions">
          ${actions.map(a =>
            `<button class="${a.style || 'btn-ghost'}" data-action="${a.action}">${a.label}</button>`
          ).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

/* === XSS escape — ทุก user input ใน innerHTML ต้องผ่านตัวนี้ ======= */
export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* === Appearance — apply ลง <html> element ========================= */
const NAMED_THEMES = ['ocean', 'forest', 'rose', 'citrus', 'violet', 'carbon', 'pro'];

export function applyTheme(theme) {
  document.documentElement.dataset.theme = NAMED_THEMES.includes(theme) ? theme : '';
}

export function applyTextSize(size) {
  document.documentElement.dataset.textSize = (size === 'normal' || !size) ? '' : size;
}

export function applyDark(dark) {
  document.documentElement.dataset.dark = dark ? '1' : '';
}

/* === Toast =======================================================
 * @param {string} message
 * @param {number} duration — ms ที่แสดง (default 3500, reminder ควรใช้ 7000)
 */
export function showToast(message, duration = 3500) {
  const container = document.getElementById('toast');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  // คำนวณ delay ก่อน fade-out: duration - 630ms (380 spring-in + 250 fade-out)
  const fadeDelay = Math.max((duration - 630) / 1000, 0.5).toFixed(2);
  el.style.animation = `toast-in 0.38s cubic-bezier(0.34,1.56,0.64,1), toast-out 0.25s ease ${fadeDelay}s forwards`;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

/** Toast เล็กๆ หลังได้เหรียญ/level up — ไม่มี toast กรณี streak reset */
export function showCoinToast(reward) {
  if (!reward) return;
  const COIN_LABEL = { bronze: '🥉 ทองแดง', silver: '🥈 เงิน', gold: '🥇 ทอง' };
  const label = COIN_LABEL[reward.coin] || '';
  const bonusTxt = reward.bonusXP ? ` ✨ (+${reward.bonusXP} milestone)` : '';
  showToast(`${label} +${reward.xp} XP${bonusTxt}`);
  if (reward.levelUp) {
    const info = getLevelInfo(State.getUserProgress().xp);
    setTimeout(() => showToast(`⬆️ Level ${reward.newLevel}: ${info.current.name}`), 400);
  }
  haptic([10, 30]);
}


/* === Recurring suggestions — shared state ระหว่าง import flow (เขียน)
   กับ settings (อ่าน/ลบ). เก็บเป็น array เดียว เข้าถึงผ่าน accessor
   (splice บน getRecurSuggestions() ได้เพราะคืน reference เดิม) ================= */
let _recurSuggestions = [];
export function getRecurSuggestions() { return _recurSuggestions; }
export function setRecurSuggestions(v) { _recurSuggestions = Array.isArray(v) ? v : []; }


/* === Transaction entry row (ใช้ร่วม dashboard + list) ============= */
function shortName(email) {
  if (!email) return null;
  return email.split('@')[0];
}

export function renderEntryRow(tx, decimals = 0) {
  const def = getCategory(tx.group);
  const time = formatTime(tx.createdAt || tx.date);
  const isIncome = tx.type === 'income';
  const isTransfer = tx.type === 'transfer';
  const sign = isIncome ? '+' : (isTransfer ? '↔' : '−');
  const amtClass = isIncome ? 'income' : (isTransfer ? 'transfer' : '');
  const isDeleted = tx.deleted_by != null;

  // ตรวจว่าเป็นรายการในบัญชีแชร์ (cloud account) หรือไม่
  const acctIdForShared = tx.account_from || tx.account_to;
  const acctForShared = acctIdForShared ? State.getAccount(acctIdForShared) : null;
  const isShared = acctForShared?.storage === 'cloud';

  // Account line (แยกบรรทัดใต้หมวด — อ่านง่ายกว่า badge เล็กๆ)
  let acctLine = '';
  if (isTransfer && tx.account_from && tx.account_to) {
    const fromName = State.getAccount(tx.account_from)?.display_name || tx.account_from;
    const toName   = State.getAccount(tx.account_to)?.display_name   || tx.account_to;
    acctLine = `<div class="entry-acct-line">${escapeHtml(fromName)} → ${escapeHtml(toName)}</div>`;
  } else {
    const acctId = isIncome ? tx.account_to : tx.account_from;
    const acct = acctId ? State.getAccount(acctId) : null;
    if (acct) {
      acctLine = `<div class="entry-acct-line">${escapeHtml(acct.display_name)}</div>`;
    }
  }

  const authorNote = isDeleted
    ? `<div class="entry-author">ลบโดย ${escapeHtml(shortName(tx.deleted_by))}</div>`
    : (tx.created_by
        ? `<div class="entry-author">เพิ่มโดย ${escapeHtml(shortName(tx.created_by))}</div>`
        : '');

  // สัญลักษณ์บัญชีแชร์ — ไอคอน users เล็กๆ หน้าหมวดหมู่
  const sharedBadge = isShared
    ? `<span class="shared-badge" title="บัญชีแชร์">${svgIcon('users', { size: 11, stroke: 2 })}</span>`
    : '';

  return `
    <div class="entry${isDeleted ? ' entry-deleted' : ''}" data-tx-id="${tx.id}">
      <span class="entry-time">${time}</span>
      <div class="entry-icon" style="background: ${def.color}">
        ${svgIcon(def.icon, { size: 16, stroke: 2 })}
      </div>
      <div class="entry-body">
        <div class="entry-name">${escapeHtml(tx.description || def.label)}${tx.source === 'sample' ? ' <span class="demo-tag">Demo</span>' : ''}</div>
        <div class="entry-cat">${sharedBadge}${categoryLabel(tx)}${tx.balance != null
          ? ` · <span style="color:${tx.balance < 0 ? 'var(--expense,#d96b5e)' : 'inherit'}">คงเหลือ ${formatBaht(tx.balance)} ฿</span>`
          : ''}</div>
        ${acctLine}
        ${authorNote}
      </div>
      <div class="entry-right">
        <div class="entry-amt ${amtClass}">${sign}${formatBaht(tx.amount, { decimals })} ฿</div>
        <div class="entry-actions">
          ${isDeleted ? '' : `<button class="entry-action-btn" data-action="edit-tx" data-tx-id="${tx.id}" aria-label="แก้ไข">${svgIcon('edit', { size: 13, stroke: 2 })}</button>`}
          <button class="entry-action-btn del" data-action="delete-tx" data-tx-id="${tx.id}" aria-label="${isDeleted ? 'ลบถาวร' : 'ลบ'}" title="${isDeleted ? 'ลบถาวร' : 'ลบ'}">${svgIcon('delete', { size: 13, stroke: 2 })}</button>
        </div>
      </div>
      <div class="entry-swipe-actions">
        ${isDeleted ? '' : `<button class="swipe-btn swipe-edit" data-action="edit-tx" data-tx-id="${tx.id}" aria-label="แก้ไข">${svgIcon('edit', { size: 18, stroke: 2 })}</button>`}
        <button class="swipe-btn swipe-del" data-action="delete-tx" data-tx-id="${tx.id}" aria-label="${isDeleted ? 'ลบถาวร' : 'ลบ'}">${svgIcon('delete', { size: 18, stroke: 2 })}</button>
      </div>
    </div>
  `;
}

// ป้องกัน bindEntryActions ถูกเรียกซ้ำบน container เดิม (event delegation ผูกครั้งเดียวพอ)
const _boundEntryContainers = new WeakSet();

/** Bind edit/delete actions บน container ที่มี entry rows */
export function bindEntryActions(container) {
  if (_boundEntryContainers.has(container)) return;
  _boundEntryContainers.add(container);

  // === Click / tap ===
  container.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-action="edit-tx"]');
    const delBtn  = e.target.closest('[data-action="delete-tx"]');

    // Tap on swiped entry body (not a button) → close swipe
    const tappedEntry = e.target.closest('.entry');
    if (tappedEntry?.classList.contains('swiped') && !editBtn && !delBtn) {
      tappedEntry.classList.remove('swiped');
      return;
    }

    // Close swipe panel before opening edit/delete
    if (editBtn || delBtn) {
      tappedEntry?.classList.remove('swiped');
    }

    if (editBtn) {
      const id = editBtn.dataset.txId;
      const tx = State.getTransactions().find(t => t.id === id);
      if (!tx) return;
      history.pushState({ view: 'modal', modal: 'edit' }, '', '#edit');
      const { openEditModal } = await import('./add.js');
      openEditModal(tx);
    }

    if (delBtn) {
      const id = delBtn.dataset.txId;
      // ใช้ getState().transactions แทน getTransactions() เพราะ
      // getTransactions() กรอง soft-deleted (deleted_by != null) ออก
      // → หา transaction สีเทาไม่เจอ → if (!tx) return ก่อนเลย
      const tx = State.getState().transactions.find(t => t.id === id);
      if (!tx) return;
      const desc = tx.description || getCategory(tx.group).label;
      // รายการที่ถูก soft-delete แล้ว → ลบถาวร (หายจริงจากทุกฝ่าย)
      const isPermanent = tx.deleted_by != null;
      const msg = isPermanent ? `ลบถาวร "${desc}"?\nรายการจะหายจากทุกฝ่าย` : `ลบ "${desc}"?`;
      if (!confirm(msg)) return;
      const entryEl = delBtn.closest('.entry');
      if (entryEl) {
        entryEl.style.transition = 'transform 0.2s, opacity 0.2s';
        entryEl.style.transform  = 'translateX(100%)';
        entryEl.style.opacity    = '0';
        setTimeout(() => {
          State.deleteTransaction(id);
          showToast(isPermanent ? 'ลบถาวรแล้ว' : 'ลบรายการแล้ว');
        }, 200);
      } else {
        State.deleteTransaction(id);
        showToast(isPermanent ? 'ลบถาวรแล้ว' : 'ลบรายการแล้ว');
      }
    }
  });

  // === Swipe-left gesture (touch devices) ===
  let _startX = 0, _startY = 0, _dir = null, _swipeEl = null;

  container.addEventListener('touchstart', e => {
    const touched = e.target.closest('.entry');
    container.querySelectorAll('.entry.swiped').forEach(el => {
      if (el !== touched) el.classList.remove('swiped');
    });
    if (!touched) { _swipeEl = null; return; }
    _startX  = e.touches[0].clientX;
    _startY  = e.touches[0].clientY;
    _swipeEl = touched;
    _dir     = null;
  }, { passive: true });

  container.addEventListener('touchmove', e => {
    if (!_swipeEl) return;
    const dx = e.touches[0].clientX - _startX;
    const dy = e.touches[0].clientY - _startY;
    if (!_dir) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      _dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (_dir === 'v') _swipeEl = null;
  }, { passive: true });

  container.addEventListener('touchend', e => {
    if (!_swipeEl) return;
    const dx = e.changedTouches[0].clientX - _startX;
    if (_swipeEl.classList.contains('swiped')) {
      if (dx > 40) _swipeEl.classList.remove('swiped');
    } else {
      if (dx < -60) _swipeEl.classList.add('swiped');
    }
    _swipeEl = null; _dir = null;
  }, { passive: true });
}


/* ===================================================================
   Category Manager — หน้าจัดการหมวดหมู่
   =================================================================== */

const MAX_CUSTOM_CATEGORIES = 27; // 50 total - 23 built-in

/** เปิด overlay จัดการหมวดหมู่ */
export function openCategoryManager(onClose = null) {
  history.pushState({ view: 'modal', modal: 'cat-manager' }, '', '#cat-manager');

  const overlay = document.createElement('div');
  overlay.className = 'overlay cat-manager-overlay';
  overlay.innerHTML = `
    <div class="cat-manager">
      <div class="cat-manager-head">
        <button class="cat-manager-back">${svgIcon('back', { size: 20, stroke: 2 })}</button>
        <h2 class="cat-manager-title">หมวดหมู่</h2>
        <button class="cat-manager-add" id="cat-add-btn">${svgIcon('plus', { size: 20, stroke: 2.5 })}</button>
      </div>
      <div class="cat-manager-body" id="cat-manager-body"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  function closeOverlay() {
    overlay.remove();
    window.removeEventListener('popstate', onPopState);
    onClose?.();   // ให้ผู้เรียก refresh UI (เช่น cat-strip ใน add modal)
  }
  function onPopState() { closeOverlay(); }
  window.addEventListener('popstate', onPopState);

  function renderBody() {
    const body = overlay.querySelector('#cat-manager-body');
    const custom = State.getCustomCategories();
    const builtinEntries = Object.entries(CATEGORIES);

    let html = `
      <div class="cat-section-label">หมวดหมู่ตั้งต้น (${builtinEntries.length} หมวด)</div>
      <div class="cat-grid">
        ${builtinEntries.map(([key, def]) => `
          <div class="cat-item cat-item--builtin">
            <div class="cat-item-icon" style="background:${_catColorToCss(def.color)}">
              ${svgIcon(def.icon, { size: 20, stroke: 2 })}
            </div>
            <div class="cat-item-label">${escapeHtml(def.label)}</div>
          </div>
        `).join('')}
      </div>

      <div class="cat-section-label" style="margin-top:16px">
        หมวดหมู่ที่กำหนดเอง (${custom.length}/${MAX_CUSTOM_CATEGORIES})
        ${custom.length < MAX_CUSTOM_CATEGORIES
          ? `<span class="cat-add-hint">— กด + เพิ่ม</span>`
          : `<span class="cat-add-hint" style="color:var(--clay)">— ถึงขีดสูงสุดแล้ว</span>`}
      </div>
      ${custom.length === 0 ? `
        <div class="cat-empty">ยังไม่มีหมวดหมู่ที่กำหนดเอง<br>กด + ด้านบนเพื่อเพิ่ม</div>
      ` : `
        <div class="cat-grid">
          ${custom.map(c => `
            <div class="cat-item" data-cat-id="${escapeHtml(c.id)}">
              <div class="cat-item-icon" style="background:${escapeHtml(c.color)}">
                ${svgIcon(c.icon, { size: 20, stroke: 2 })}
              </div>
              <div class="cat-item-label">${escapeHtml(c.label)}</div>
              <div class="cat-item-actions">
                <button class="cat-item-edit" data-cat-id="${escapeHtml(c.id)}">${svgIcon('edit', { size: 14, stroke: 2 })}</button>
                <button class="cat-item-del"  data-cat-id="${escapeHtml(c.id)}">${svgIcon('delete', { size: 14, stroke: 2 })}</button>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    `;
    body.innerHTML = html;

    // Edit handlers
    body.querySelectorAll('.cat-item-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = State.getCustomCategories().find(c => c.id === btn.dataset.catId);
        if (cat) openCategoryEditModal(cat, renderBody);
      });
    });

    // Delete handlers
    body.querySelectorAll('.cat-item-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = State.getCustomCategories().find(c => c.id === btn.dataset.catId);
        if (!cat) return;
        if (confirm(`ลบหมวด "${cat.label}"?\nรายการที่ใช้หมวดนี้จะแสดงเป็น "อื่นๆ"`)) {
          State.deleteCustomCategory(btn.dataset.catId);
          renderBody();
        }
      });
    });
  }

  renderBody();

  overlay.querySelector('.cat-manager-back').addEventListener('click', () => history.back());
  overlay.querySelector('#cat-add-btn').addEventListener('click', () => {
    const custom = State.getCustomCategories();
    if (custom.length >= MAX_CUSTOM_CATEGORIES) {
      showToast(`เพิ่มได้สูงสุด ${MAX_CUSTOM_CATEGORIES} หมวด`);
      return;
    }
    openCategoryEditModal(null, renderBody);
  });
}

/** แปลง CSS variable สี → hex สำหรับ background ใน cat manager */
function _catColorToCss(colorVal) {
  // ถ้าเป็น hex แล้วคืนตรงๆ
  if (colorVal && colorVal.startsWith('#')) return colorVal;
  // Built-in categories ใช้ CSS var → map เป็น hex
  const varMap = {
    'var(--clay)':      '#e88563',
    'var(--mocha)':     '#c89368',
    'var(--dust-blue)': '#5e9bd6',
    'var(--plum)':      '#b378c0',
    'var(--honey)':     '#e8b649',
    'var(--sage)':      '#5a9d63',
  };
  return varMap[colorVal] || '#e88563';
}

/** Modal เพิ่ม / แก้ไข custom category */
function openCategoryEditModal(existingCat, onSave) {
  const isEdit = !!existingCat;
  const draft = {
    label:    existingCat?.label    || '',
    icon:     existingCat?.icon     || 'circle',
    color:    existingCat?.color    || COLOR_PALETTE[0],
    type:     existingCat?.type     || ['expense'],
    keywords: existingCat?.keywords || []
  };

  const modal = document.createElement('div');
  modal.className = 'overlay cat-edit-overlay';
  modal.innerHTML = `
    <div class="acct-modal cat-edit-modal">
      <div class="acct-modal-head">${isEdit ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่'}</div>
      <div class="acct-modal-body" id="cat-edit-body">

        <!-- ชื่อหมวด -->
        <div class="acct-field-label">ชื่อหมวดหมู่ <span style="color:var(--ink-faint);font-weight:400;font-size:12px">(สูงสุด 20 ตัวอักษร)</span></div>
        <input class="acct-field-input" id="cat-label" type="text" maxlength="20"
               placeholder="เช่น ค่าเลี้ยงสัตว์, ท่องเที่ยว"
               value="${escapeHtml(draft.label)}">

        <!-- ประเภท -->
        <div class="acct-field-label" style="margin-top:14px">ใช้กับ</div>
        <div class="cat-type-seg" id="cat-type-seg">
          <button class="cat-type-btn ${draft.type.includes('expense') && draft.type.includes('income') ? '' : draft.type.includes('expense') ? 'active' : ''}"
                  data-type="expense">รายจ่าย</button>
          <button class="cat-type-btn ${draft.type.includes('income') && !draft.type.includes('expense') ? 'active' : ''}"
                  data-type="income">รายรับ</button>
          <button class="cat-type-btn ${draft.type.includes('expense') && draft.type.includes('income') ? 'active' : ''}"
                  data-type="both">ทั้งคู่</button>
        </div>

        <!-- ไอคอน -->
        <div class="acct-field-label" style="margin-top:14px">ไอคอน</div>
        <div class="cat-icon-grid" id="cat-icon-grid">
          ${ICON_PICKER_KEYS.map(key => `
            <button class="cat-icon-btn ${draft.icon === key ? 'active' : ''}" data-icon="${key}">
              ${svgIcon(key, { size: 20, stroke: 1.8 })}
            </button>
          `).join('')}
        </div>

        <!-- สี -->
        <div class="acct-field-label" style="margin-top:14px">สีไอคอน</div>
        <div class="cat-color-row" id="cat-color-row">
          ${COLOR_PALETTE.map(hex => `
            <button class="cat-color-btn ${draft.color === hex ? 'active' : ''}"
                    data-color="${hex}" style="background:${hex}"></button>
          `).join('')}
        </div>

        <!-- Preview -->
        <div style="display:flex;align-items:center;gap:10px;margin-top:14px">
          <div class="cat-preview-icon" id="cat-preview-icon" style="background:${escapeHtml(draft.color)}">
            ${svgIcon(draft.icon, { size: 24, stroke: 2 })}
          </div>
          <span class="cat-preview-label" id="cat-preview-label">${escapeHtml(draft.label) || 'ตัวอย่าง'}</span>
        </div>

        <!-- Keywords -->
        <div class="acct-field-label" style="margin-top:16px">คำค้นหา (สำหรับ PDF import)</div>
        <textarea class="acct-field-input" id="cat-keywords" rows="3"
                  placeholder="ใส่คำทีละบรรทัด เช่น&#10;ค่าสัตว์เลี้ยง&#10;pet shop&#10;หมา"
                  style="resize:vertical;min-height:72px">${escapeHtml(draft.keywords.join('\n'))}</textarea>
        <div class="acct-field-hint">ถ้า description ใน PDF มีคำเหล่านี้ จะจำแนกเป็นหมวดนี้อัตโนมัติ</div>

      </div>
      <div class="acct-modal-footer">
        <button class="cancel" id="cat-edit-cancel">ยกเลิก</button>
        <button class="confirm" id="cat-edit-save">${isEdit ? 'บันทึก' : 'เพิ่ม'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  function updatePreview() {
    const previewIcon = modal.querySelector('#cat-preview-icon');
    const previewLabel = modal.querySelector('#cat-preview-label');
    if (previewIcon) {
      previewIcon.style.background = draft.color;
      previewIcon.innerHTML = svgIcon(draft.icon, { size: 24, stroke: 2 });
    }
    if (previewLabel) {
      const label = modal.querySelector('#cat-label').value.trim();
      previewLabel.textContent = label || 'ตัวอย่าง';
    }
  }

  // Type selector (expense / income / both)
  modal.querySelectorAll('.cat-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.cat-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      draft.type = btn.dataset.type === 'both' ? ['expense', 'income']
                 : btn.dataset.type === 'income' ? ['income']
                 : ['expense'];
    });
  });

  // Icon picker
  modal.querySelectorAll('.cat-icon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.cat-icon-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      draft.icon = btn.dataset.icon;
      updatePreview();
    });
  });

  // Color picker
  modal.querySelectorAll('.cat-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.cat-color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      draft.color = btn.dataset.color;
      updatePreview();
    });
  });

  // Label live preview
  modal.querySelector('#cat-label').addEventListener('input', updatePreview);

  modal.querySelector('#cat-edit-cancel').addEventListener('click', () => modal.remove());

  modal.querySelector('#cat-edit-save').addEventListener('click', () => {
    const label = modal.querySelector('#cat-label').value.trim();
    if (!label) { showToast('กรุณาใส่ชื่อหมวดหมู่'); return; }

    const keywords = modal.querySelector('#cat-keywords').value
      .split('\n').map(k => k.trim()).filter(Boolean);

    if (isEdit) {
      State.updateCustomCategory(existingCat.id, { label, icon: draft.icon, color: draft.color, type: draft.type, keywords });
    } else {
      State.addCustomCategory({ label, icon: draft.icon, color: draft.color, type: draft.type, keywords });
    }
    modal.remove();
    onSave?.();
    showToast(isEdit ? 'แก้ไขหมวดหมู่แล้ว' : 'เพิ่มหมวดหมู่แล้ว');
  });
}


/* === Cash override dialog (ใช้ร่วม import flow + settings) ======== */
/** Dialog ถามยอดเงินสดจริงในมือ — แสดงหลัง e-Statement import มี ATM / หรือกด แก้ไข ใน settings */
export function showCashOverrideDialog(cashAcct, onClose = null) {
  const existing = cashAcct.cash_balance_override != null
    ? (cashAcct.cash_balance_override / 100).toFixed(0)
    : '';

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="acct-modal">
      <div class="acct-modal-head">เงินสดในมือตอนนี้</div>
      <div class="acct-modal-body">
        <div class="setting-sub" style="margin-bottom:14px;line-height:1.5">
          พบรายการถอน ATM — ตอนนี้มีเงินสดในมือจริงๆ เท่าไหร่?<br>
          (ใส่ยอดปัจจุบัน เพื่อให้ยอดคงเหลือถูกต้อง)
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <input id="cash-override-input" type="number" inputmode="decimal"
            placeholder="0" value="${existing}"
            style="flex:1;padding:10px 12px;border:1px solid var(--rule);border-radius:8px;font-size:18px;background:var(--surface);color:var(--ink);text-align:right">
          <span style="font-size:16px;color:var(--ink-faint)">฿</span>
        </div>
      </div>
      <div class="acct-modal-footer" style="display:flex;gap:8px">
        <button class="cancel" id="cash-override-skip" style="flex:1">ข้ามก่อน</button>
        <button class="confirm" id="cash-override-save" style="flex:2">บันทึก</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // ปรับตำแหน่ง overlay เมื่อแป้นพิมพ์โผล่
  if (window.visualViewport) {
    const adjustForKeyboard = () => {
      const vv = window.visualViewport;
      overlay.style.height = vv.height + 'px';
      overlay.style.top = vv.offsetTop + 'px';
    };
    adjustForKeyboard();
    window.visualViewport.addEventListener('resize', adjustForKeyboard);
    window.visualViewport.addEventListener('scroll', adjustForKeyboard);
    const origRemoveOverlay = overlay.remove.bind(overlay);
    overlay.remove = () => {
      window.visualViewport.removeEventListener('resize', adjustForKeyboard);
      window.visualViewport.removeEventListener('scroll', adjustForKeyboard);
      origRemoveOverlay();
    };
  }

  const input = overlay.querySelector('#cash-override-input');
  input.focus();
  input.select();

  const closeDialog = () => {
    overlay.remove();
    onClose?.();
  };

  overlay.querySelector('#cash-override-skip').addEventListener('click', closeDialog);

  overlay.querySelector('#cash-override-save').addEventListener('click', () => {
    const val = parseFloat(input.value);
    if (isNaN(val) || val < 0) {
      showToast('ใส่จำนวนเงินให้ถูกต้อง');
      return;
    }
    State.setCashOverride(cashAcct.id, Math.round(val * 100), todayISO());
    showToast('บันทึกยอดเงินสดแล้ว');
    closeDialog();
  });
}
