/* ===================================================================
   views-shared.js — primitives ที่ทุก view cluster + add.js ใช้ร่วมกัน
   ===================================================================
   แยกออกจาก views.js (Phase B) เพื่อให้ cluster files (dashboard/list/
   settings/import) import ได้โดยไม่ต้องวน import กลับไป views.js
   views.js re-export ของพวกนี้ต่อ เพื่อ backward-compat กับ app.js/add.js
   =================================================================== */

import * as State from './state.js';
import { svgIcon, getCategory } from './icons.js';
import { haptic, formatTime, formatBaht } from './utils.js';
import { getLevelInfo } from './gamification.js';

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
        <div class="entry-cat">${sharedBadge}${def.label}${tx.balance != null
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
