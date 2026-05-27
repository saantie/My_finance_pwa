/* ===================================================================
   aha-moments.js — "Wow" insight screen หลัง PDF import ครั้งแรก
   ===================================================================
   Trigger: PDF import สำเร็จ + เป็นครั้งแรกของบัญชีนั้น
   Storage key: aha_done_{accountId}  (per-account)
   Tone: celebrate insight ไม่ judge — "Starbucks 23 ครั้ง" ไม่ใช่ "คุณใช้เยอะ!"
   =================================================================== */

import { formatBaht } from './utils.js';
import { getCategory } from './icons.js';
import * as State from './state.js';
import * as Recurring from './recurring.js';


/* ─── Storage helpers ──────────────────────────────────────────── */

/** ตรวจว่าบัญชีนี้ยัง "ครั้งแรก" อยู่ไหม */
export function isFirstPdfForAccount(accountId) {
  const key = accountId ? `aha_done_${accountId}` : 'aha_done_global';
  return !localStorage.getItem(key);
}

/** บันทึกว่าแสดงแล้วสำหรับบัญชีนี้ */
function markAhaDone(accountId) {
  const key = accountId ? `aha_done_${accountId}` : 'aha_done_global';
  localStorage.setItem(key, '1');
  // compat: global key (จาก prompt Section A)
  localStorage.setItem('first_pdf_done', '1');
}


/* ─── Insight generator ────────────────────────────────────────── */

/**
 * วิเคราะห์ transactions ที่เพิ่งนำเข้า → คืน array of insight objects
 * @param {Array} transactions  — cleanTxs จาก PDF parse (satang)
 * @returns {Array<{ icon, title, detail, accentColor }>}  — สูงสุด 4 อัน
 */
export function generateAhaInsights(transactions) {
  const insights = [];
  const expenses = transactions.filter(t => t.type === 'expense');

  /* 1. Top spending category — universal ─────────────────────── */
  if (expenses.length > 0) {
    const byGroup = _groupBy(expenses, t => t.group || 'other');
    const topGroup = _maxBy(byGroup, v => v.total);
    if (topGroup) {
      const cat = getCategory(topGroup.key);
      insights.push({
        icon: cat.icon || 'pie-chart',
        iconColor: cat.color || 'var(--terracotta)',
        title: `ใช้กับ "${cat.label}" มากที่สุด`,
        detail: `${formatBaht(topGroup.total)} ฿  ·  ${topGroup.items.length} รายการ`
      });
    }
  }

  /* 2. Most frequent merchant (surprise factor) ──────────────── */
  const normalizeDesc = d => (d || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 30);
  const byMerchant = _groupBy(
    transactions.filter(t => t.description),
    t => normalizeDesc(t.description)
  );
  const topMerchant = _maxBy(byMerchant, v => v.items.length);
  if (topMerchant && topMerchant.items.length >= 3) {
    const displayName = transactions.find(t =>
      normalizeDesc(t.description) === topMerchant.key
    )?.description || topMerchant.key;
    insights.push({
      icon: 'repeat',
      iconColor: 'var(--transfer, #5e9bd6)',
      title: `"${_trimDescription(displayName)}" บ่อยที่สุด`,
      detail: `${topMerchant.items.length} ครั้ง  ·  รวม ${formatBaht(topMerchant.total)} ฿`
    });
  }

  /* 3. Daily average ─────────────────────────────────────────── */
  const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);
  if (expenses.length > 0 && totalExpense > 0) {
    // หาช่วงวันในข้อมูล
    const dates = expenses.map(t => t.date).sort();
    const spanDays = Math.max(1, _daysBetween(dates[0], dates[dates.length - 1]) + 1);
    const avgDaily = Math.round(totalExpense / spanDays);
    insights.push({
      icon: 'calendar',
      iconColor: 'var(--honey, #e8b649)',
      title: `เฉลี่ยใช้วันละ ${formatBaht(avgDaily)} ฿`,
      detail: `จาก ${expenses.length} รายจ่าย ใน ${spanDays} วัน`
    });
  }

  /* 4. Net / savings ─────────────────────────────────────────── */
  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0);
  if (totalIncome > 0) {
    const net = totalIncome - totalExpense;
    if (net > 0) {
      insights.push({
        icon: 'trending-up',
        iconColor: 'var(--income, #5a9d63)',
        title: `เก็บได้ ${formatBaht(net)} ฿ เดือนนี้`,
        detail: `รับ ${formatBaht(totalIncome)} ฿ — ใช้ ${formatBaht(totalExpense)} ฿`
      });
    } else {
      // net ติดลบหรือ 0 → แสดงยอดรวมแทน (ไม่ guilty)
      insights.push({
        icon: 'bar-chart-2',
        iconColor: 'var(--ink-faint, #a0aec0)',
        title: `รายการทั้งหมด ${transactions.length} รายการ`,
        detail: `รับ ${formatBaht(totalIncome)} ฿ · ใช้ ${formatBaht(totalExpense)} ฿`
      });
    }
  } else if (expenses.length > 0) {
    // ไม่มี income ใน statement → แสดงยอดรวมรายจ่าย
    insights.push({
      icon: 'bar-chart-2',
      iconColor: 'var(--ink-faint, #a0aec0)',
      title: `รายจ่ายรวม ${formatBaht(totalExpense)} ฿`,
      detail: `จาก ${expenses.length} รายการที่นำเข้า`
    });
  }

  /* 5. Forecast hook (USP demo) — ถ้ามี recurring templates ────── */
  try {
    const forecast = Recurring.getForecast(30);
    const threshold = State.getSettings().threshold_satang;
    if (forecast.length > 0) {
      // ประมาณยอดคงเหลือปัจจุบัน
      let runningBalance = State.computeAccountBalance(
        transactions[0]?.account_from || transactions[0]?.account_to
      ) || 0;

      let lowBalanceDay = null;
      const today = new Date();
      for (const item of forecast.sort((a, b) => a.date.localeCompare(b.date))) {
        if (item.type === 'expense') runningBalance -= item.amount;
        else runningBalance += item.amount;
        if (runningBalance < threshold && !lowBalanceDay) {
          const itemDate = new Date(item.date);
          lowBalanceDay = Math.round((itemDate - today) / 86400000);
        }
      }

      if (lowBalanceDay !== null && lowBalanceDay > 0 && lowBalanceDay <= 30) {
        insights.push({
          icon: 'alert-circle',
          iconColor: 'var(--expense, #d96b5e)',
          title: `อีก ${lowBalanceDay} วัน ยอดจะใกล้เกณฑ์`,
          detail: 'ดู Forecast 30 วัน ในแท็บ Dashboard'
        });
      }
    }
  } catch (_) {
    // forecast ไม่พร้อม — ข้ามไป
  }

  return insights.slice(0, 4);
}


/* ─── UI Screen ────────────────────────────────────────────────── */

/**
 * แสดง full-screen Aha-moment screen
 * @param {Array}  transactions  — cleanTxs จาก PDF import
 * @param {string} accountId     — account ที่ import (สำหรับ per-account tracking)
 */
export function showAhaMomentScreen(transactions, accountId) {
  // guard: ถ้าแสดงแล้วสำหรับบัญชีนี้ → ข้ามไป
  if (!isFirstPdfForAccount(accountId)) return;
  markAhaDone(accountId);

  const insights = generateAhaInsights(transactions);

  // fallback ถ้าไม่มี insight (data น้อยเกินไป)
  if (insights.length === 0) {
    insights.push({
      icon: 'check-circle',
      iconColor: 'var(--income, #5a9d63)',
      title: `นำเข้า ${transactions.length} รายการสำเร็จ`,
      detail: 'ดู dashboard เพื่อดูภาพรวมการเงิน'
    });
  }

  const cardsHtml = insights.map((ins, i) => `
    <div class="aha-card" style="animation-delay: ${i * 120}ms">
      <div class="aha-card-icon" style="color: ${ins.iconColor}">
        ${_svgIconInline(ins.icon)}
      </div>
      <div class="aha-card-text">
        <div class="aha-card-title">${ins.title}</div>
        <div class="aha-card-detail">${ins.detail}</div>
      </div>
    </div>
  `).join('');

  const overlay = document.createElement('div');
  overlay.className = 'aha-overlay';
  overlay.innerHTML = `
    <div class="aha-screen">
      <div class="aha-header">
        <div class="aha-emoji">✨</div>
        <h2 class="aha-title">นี่คือภาพการเงิน<br>เดือนนี้ของคุณ</h2>
        <p class="aha-subtitle">จาก ${transactions.length} รายการที่เพิ่งนำเข้า</p>
      </div>

      <div class="aha-cards">
        ${cardsHtml}
      </div>

      <div class="aha-footer">
        <button class="aha-cta" id="aha-close">ไปดู Dashboard →</button>
        <p class="aha-note">Dashboard จะอัปเดตอัตโนมัติ</p>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // ป้องกัน scroll ด้านหลัง
  document.body.style.overflow = 'hidden';

  // bind close
  overlay.querySelector('#aha-close')?.addEventListener('click', () => {
    overlay.classList.add('aha-overlay--out');
    setTimeout(() => {
      overlay.remove();
      document.body.style.overflow = '';
      // navigate ไป dashboard
      document.querySelector('.nav-item[data-view="dashboard"]')?.click();
    }, 300);
  });
}


/* ─── Internal helpers ─────────────────────────────────────────── */

/** groupBy ง่ายๆ — คืน Map ของ { key, total, items } */
function _groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, { key: k, total: 0, items: [] });
    const bucket = map.get(k);
    bucket.total += item.amount || 0;
    bucket.items.push(item);
  }
  return [...map.values()];
}

/** หา bucket ที่มีค่า scoreFn สูงสุด */
function _maxBy(buckets, scoreFn) {
  return buckets.reduce((best, b) => (scoreFn(b) > scoreFn(best || { total: 0, items: [] }) ? b : best), null);
}

/** จำนวนวันระหว่าง 2 ISO date */
function _daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

/** ตัด description ยาวเกิน 18 ตัวอักษร */
function _trimDescription(s) {
  return s.length > 18 ? s.slice(0, 17) + '…' : s;
}

/**
 * Inline SVG icon — รองรับ icons ที่ใช้ใน Aha screen
 * (ไม่ import svgIcon จาก icons.js เพื่อหลีกเลี่ยง circular deps)
 */
function _svgIconInline(name) {
  const paths = {
    'pie-chart':    '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
    'repeat':       '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    'calendar':     '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    'trending-up':  '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    'alert-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    'bar-chart-2':  '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  };
  const p = paths[name] || paths['bar-chart-2'];
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="26" height="26">${p}</svg>`;
}
