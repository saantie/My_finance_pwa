/* ===================================================================
   views-shared.js — primitives ที่ทุก view cluster + add.js ใช้ร่วมกัน
   ===================================================================
   แยกออกจาก views.js (Phase B) เพื่อให้ cluster files (dashboard/list/
   settings/import) import ได้โดยไม่ต้องวน import กลับไป views.js
   views.js re-export ของพวกนี้ต่อ เพื่อ backward-compat กับ app.js/add.js
   =================================================================== */

import * as State from './state.js';
import { svgIcon } from './icons.js';
import { haptic } from './utils.js';
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
