/* ===================================================================
   views.js — Render แต่ละ view (ไม่ใช้ framework)
   ===================================================================
   หลักการ:
   - ทุก view รับ container element เป็น parameter
   - รับ state ผ่าน import จาก state.js
   - Return HTML string → set innerHTML
   - Event binding ทำหลัง render เสร็จ (delegation จาก app.js)

   Views: dashboard, list, import, settings
   =================================================================== */

import * as State from './state.js';
import * as Recurring from './recurring.js';
import { svgIcon, CATEGORIES, getCategory, ICON_PICKER_KEYS, COLOR_PALETTE } from './icons.js';
import { track } from './analytics.js';
import {
  formatBaht, formatLongDate, formatShortDate, formatTime,
  todayISO, parseLocalDate, dayNameTH, monthNameTH, ceToBe, debounce, haptic, offsetDateISO
} from './utils.js';
import { cashflowForecast, dailyExpenseBars } from './chart.js';
import { findPotentialDuplicates } from './duplicate-detector.js';
import { getLevelInfo } from './gamification.js';
import {
  signInWithGoogle, signOut as firebaseSignOut, getCurrentUser, getAccessToken,
  updateSharedWith, migrateAccountToCloud
} from './firebase.js';
import { checkCatchupOpportunity, dismissCatchup } from './catchup.js';
import { getDemoTransactions } from './demo-data.js';


/* === Skeleton loading =========================================== */
export function renderDashboardSkeleton() {
  return `
    <div class="skeleton" style="height:80px;margin:16px 0 8px;border-radius:18px"></div>
    ${[1, 2, 3].map(() => `
      <div style="display:flex;gap:12px;padding:12px 0;border-bottom:0.5px solid var(--rule)">
        <div class="skeleton" style="width:36px;height:36px;border-radius:10px;flex-shrink:0"></div>
        <div style="flex:1">
          <div class="skeleton" style="height:14px;width:60%;margin-bottom:6px"></div>
          <div class="skeleton" style="height:12px;width:40%"></div>
        </div>
        <div class="skeleton" style="height:16px;width:70px"></div>
      </div>
    `).join('')}
  `;
}


/* === Empty state component ====================================== */
/**
 * @param {object} opts
 * @param {string} opts.icon    — ชื่อ icon ใน ICONS
 * @param {string} opts.title   — หัวข้อหลัก
 * @param {string} [opts.subtitle] — ข้อความรอง (optional)
 * @param {Array}  [opts.actions] — [{label, style, action}] (optional)
 */
function renderEmptyState({ icon, title, subtitle = '', actions = [] }) {
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


/* === Hero amount counter animation ============================== */
function animateCount(el, target) {
  const start = performance.now();
  const dur = 600;
  (function step(now) {
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = formatBaht(Math.round(target * eased));
    if (p < 1) requestAnimationFrame(step);
  })(performance.now());
}


/* === Squiggle SVG (decorative divider) ========================== */
const SQUIGGLE = `<svg class="squiggle" viewBox="0 0 200 12" preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
  <path d="M0 6 Q 10 0, 20 6 T 40 6 T 60 6 T 80 6 T 100 6 T 120 6 T 140 6 T 160 6 T 180 6 T 200 6"/>
</svg>`;


/* ===================================================================
   HERO CARD (B+A style) — spending pace vs last month
   =================================================================== */

let _heroChartInstance = null;
let _ChartClass        = null;
let _heroChartPayload  = null;  // ข้อมูลสำหรับ initHeroChart ที่เรียกหลัง DOM insert

// Recurring suggestions ที่ detect หลัง e-Statement import (module-level, reset เมื่อ dismiss)
let _recurSuggestions = [];

/** คืน yearMonth ก่อนหน้า เช่น "2026-05" → "2026-04" */
function prevYearMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * สร้าง array cumulative spending % รายวัน ความยาว chartDays
 * วันที่ > limitToDay จะเป็น null (ยังไม่มาถึง)
 */
function buildDailyCumulative(ym, totalAvail, chartDays, limitToDay = null) {
  const byDate = {};
  for (const t of State.getTransactions()) {
    if (t.deleted_by != null) continue;
    if (!t.date.startsWith(ym) || t.type !== 'expense') continue;
    byDate[t.date] = (byDate[t.date] || 0) + t.amount;
  }
  const result = [];
  let cum = 0;
  for (let d = 1; d <= chartDays; d++) {
    if (limitToDay !== null && d > limitToDay) {
      result.push(null);
    } else {
      const key = `${ym}-${String(d).padStart(2, '0')}`;
      cum += byDate[key] || 0;
      result.push(totalAvail > 0 ? Math.round(cum / totalAvail * 100) : 0);
    }
  }
  return result;
}

/** HTML string สำหรับ Hero Card ใหม่ */
function renderHeroCard() {
  const today = todayISO();
  const ym    = today.slice(0, 7);
  const pYm   = prevYearMonth(ym);

  const curr = State.getMonthSummaryWithCarry(ym);
  const prev = State.getMonthSummaryWithCarry(pYm);

  const dayOfMonth  = parseInt(today.slice(8, 10));
  const daysInMonth = new Date(parseInt(today.slice(0, 4)), parseInt(today.slice(5, 7)), 0).getDate();
  const [py, pm]    = pYm.split('-').map(Number);
  const prevDaysInMonth = new Date(py, pm, 0).getDate();

  const totalAvailable = curr.opening + curr.income;
  const spentAmount    = curr.expense;
  const remaining      = totalAvailable - spentAmount;
  const spentPct       = totalAvailable > 0 ? Math.round(spentAmount / totalAvailable * 100) : 0;

  const prevTotalAvail    = prev.opening + prev.income;
  const prevSpentAtSameDay = prevTotalAvail > 0
    ? Math.round((prev.expense / prevDaysInMonth) * dayOfMonth / prevTotalAvail * 100)
    : 0;

  const diffPct = prevSpentAtSameDay - spentPct; // บวก = ใช้ช้ากว่า

  const amountColor = remaining < 0 ? '#d96b5e'
    : spentPct >= 90 ? '#A32D2D'
    : spentPct >= 70 ? '#854F0B'
    : '#3B6D11';

  let verdictHtml;
  if (diffPct > 0) {
    verdictHtml = `<span class="verdict-good">ใช้ช้ากว่าเดือนที่แล้ว ${diffPct}% — ดีมาก</span>`;
  } else if (diffPct < 0) {
    verdictHtml = `<span class="verdict-warn">ใช้เร็วกว่าเดือนที่แล้ว ${Math.abs(diffPct)}%</span>`;
  } else {
    verdictHtml = `<span class="verdict-neutral">ใช้ในอัตราเดียวกับเดือนที่แล้ว</span>`;
  }

  _heroChartPayload = { ym, pYm, daysInMonth, prevDaysInMonth, dayOfMonth, totalAvailable, prevTotalAvail };

  const clampedSpent = Math.min(spentPct, 100);
  const clampedPrev  = Math.min(prevSpentAtSameDay, 100);

  return `
    <div class="hero-card">

      <!-- 1. ตัวเลขหลัก -->
      <div class="hero-card-main">
        <div class="hero-card-label">${remaining < 0 ? 'ตอนนี้คุณขาด' : 'ตอนนี้คุณเหลือ'}</div>
        <div class="hero-card-amount" style="color:${amountColor}"><span id="hero-val" data-target="${Math.abs(remaining)}">${formatBaht(Math.abs(remaining))}</span> <span class="hero-card-unit">฿</span></div>
      </div>

      <!-- 2. Legend -->
      <div class="hero-card-legend">
        <span class="hero-legend-item"><span class="hero-legend-line curr"></span>เดือนนี้</span>
        <span class="hero-legend-item"><span class="hero-legend-line prev"></span>เดือนที่แล้ว</span>
      </div>

      <!-- 3. Area chart -->
      <div class="hero-chart-wrap">
        <canvas id="heroAreaChart"></canvas>
      </div>

      <!-- 4. Date labels -->
      <div class="hero-date-labels">
        <span>1</span><span>7</span><span>14</span><span>21</span><span>28</span>
      </div>

      <!-- 5. Divider -->
      <div class="hero-rule"></div>

      <!-- 6. Pace bar -->
      <div class="hero-pace">
        <div class="hero-pace-row">
          <span class="hero-pace-spent">ใช้ไปแล้ว ${formatBaht(spentAmount)} ฿</span>
          <span class="hero-pace-target">เป้าสิ้นเดือน ${formatBaht(totalAvailable)} ฿ (100%)</span>
        </div>
        <div class="pace-track">
          <div class="pace-fill" style="width:${clampedSpent}%">
            ${spentPct > 10 ? `<span class="pace-pct">${spentPct}%</span>` : ''}
            <div class="pace-cursor"></div>
          </div>
          ${clampedPrev > 0 ? `
          <div class="pace-prev-mark" style="left:${clampedPrev}%">
            <div class="pace-prev-tick"></div>
            <span class="pace-prev-label">เดือนที่แล้ว ${prevSpentAtSameDay}%</span>
          </div>` : ''}
        </div>
        <div class="pace-ends">
          <span>0 ฿</span>
          <span>${formatBaht(totalAvailable)} ฿</span>
        </div>
      </div>

      <!-- 7. Verdict row -->
      <div class="hero-verdict">
        ${verdictHtml}
        <span class="verdict-date">วันที่ ${dayOfMonth}/${daysInMonth}</span>
      </div>

      <!-- 8. Breakdown 2 คอลัมน์ -->
      <div class="hero-breakdown">
        <div class="breakdown-col">
          <div class="breakdown-lbl">ยอดที่มีทั้งหมด</div>
          <div class="breakdown-val">${formatBaht(totalAvailable)} ฿</div>
          <div class="breakdown-sub">รายรับ + ยกมา</div>
        </div>
        <div class="breakdown-col breakdown-right">
          <div class="breakdown-lbl">คงเหลือ</div>
          <div class="breakdown-val">${formatBaht(remaining)} ฿</div>
          <div class="breakdown-sub">${100 - spentPct}% ของทั้งหมด</div>
        </div>
      </div>

    </div>
  `;
}

/** Init / re-init Chart.js บน canvas #heroAreaChart หลัง DOM insert */
async function initHeroChart() {
  const canvas = document.getElementById('heroAreaChart');
  if (!canvas || !_heroChartPayload) return;

  if (!_ChartClass) {
    try {
      const mod = await import('https://cdn.jsdelivr.net/npm/chart.js/auto/+esm');
      _ChartClass = mod.Chart;
    } catch (e) {
      console.warn('[hero] Chart.js load failed:', e);
      return;
    }
  }

  if (_heroChartInstance) { _heroChartInstance.destroy(); _heroChartInstance = null; }

  const c = document.getElementById('heroAreaChart');
  if (!c) return;  // canvas อาจหายถ้า navigate ออกระหว่าง import

  // อ่านสีจาก CSS vars ณ เวลา render (เปลี่ยนตามธีม + dark mode)
  const cs = getComputedStyle(document.documentElement);
  const primaryHex = cs.getPropertyValue('--terracotta').trim() || '#e88563';
  const prevLineHex = cs.getPropertyValue('--ink-faint').trim()  || '#b3a596';

  // แปลง hex → rgba (รองรับ #rrggbb และ #rgb)
  function hexRgba(hex, a) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  const { ym, pYm, daysInMonth, dayOfMonth, totalAvailable, prevTotalAvail } = _heroChartPayload;

  const currentCurve = buildDailyCumulative(ym,  totalAvailable, daysInMonth, dayOfMonth);
  const prevCurve    = buildDailyCumulative(pYm, prevTotalAvail, daysInMonth);
  const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  _heroChartInstance = new _ChartClass(c, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'เดือนนี้',
          data: currentCurve,
          borderColor: primaryHex,
          backgroundColor: hexRgba(primaryHex, 0.10),
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
          spanGaps: false,
        },
        {
          label: 'เดือนที่แล้ว',
          data: prevCurve,
          borderColor: prevLineHex,
          backgroundColor: 'transparent',
          borderDash: [5, 3],
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 1.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y ?? '—'}%` },
        },
      },
      scales: {
        x: { display: false },
        y: { display: false, min: 0 },
      },
      animation: { duration: 400 },
    },
  });
}


/* ===================================================================
   CATCHUP BANNER — แสดงเมื่อ user กลับมาหลังหาย ≥7 วัน
   =================================================================== */
function renderCatchupBanner({ daysSinceLastTx, lastTxDate, missedRecurring }) {
  const lastDateFmt = formatLongDate(parseLocalDate(lastTxDate));

  // เดือนที่ควรนำเข้า — เดือนของ lastTxDate (ภาษาไทย)
  const lastD = parseLocalDate(lastTxDate);
  const monthLabel = monthNameTH(lastD, false);

  const recurringNote = missedRecurring > 0
    ? `<div class="catchup-hint">✓ ระบบลงรายการประจำ ${missedRecurring} รายการให้แล้ว</div>`
    : '';

  return `
    <div class="catchup-banner">
      <div class="catchup-title">ยินดีต้อนรับกลับ ✨</div>
      <div class="catchup-body">
        บันทึกล่าสุดเมื่อ <strong>${daysSinceLastTx} วันที่แล้ว</strong>
        (${lastDateFmt})
        <br>อยากนำเข้า e-Statement เดือน${monthLabel}
        เพื่อตามให้ทันไหม?
        ${recurringNote}
      </div>
      <div class="catchup-actions">
        <button class="catchup-btn-primary" data-action="import-pdf">นำเข้า e-Statement ตอนนี้</button>
        <button class="catchup-btn-secondary" data-action="skip-catchup">เริ่มจดต่อ</button>
      </div>
      <button class="catchup-close" data-action="skip-catchup">✕</button>
    </div>
  `;
}


/* ===================================================================
   DASHBOARD VIEW
   =================================================================== */
export function renderDashboard(container) {
  // === Empty state: fresh install (ไม่มีรายการใดๆ) ===
  if (State.getTransactions().length === 0) {
    const today = todayISO();
    const todayDate = parseLocalDate(today);
    container.innerHTML = `
      <div class="page-header">
        <div class="page-meta">${monthNameTH(todayDate, true).toUpperCase()} · ${ceToBe(todayDate.getFullYear())}</div>
        <h1 class="page-date">วัน${dayNameTH(todayDate)} <span class="accent">ที่ ${todayDate.getDate()}</span></h1>
        <div class="page-sub">— สมุดบันทึกของฉัน —</div>
      </div>
      ${SQUIGGLE}
      ${renderEmptyState({
        icon:     'book-open',
        title:    'เริ่มต้นกันเถอะ',
        subtitle: 'บันทึกแรกใน 3 tap หรือนำเข้า e-Statement จากธนาคารเพื่อเห็นภาพรวมทันที',
        actions:  [
          { label: 'นำเข้า e-Statement',   style: 'btn-primary', action: 'import-pdf' },
          { label: 'ลองข้อมูลตัวอย่าง',    style: 'btn-ghost',   action: 'load-demo'  },
        ]
      })}
    `;
    container.querySelector('[data-action="import-pdf"]')?.addEventListener('click', () => {
      document.querySelector('.nav-item[data-view="import"]')?.click();
    });
    container.querySelector('[data-action="load-demo"]')?.addEventListener('click', () => {
      State.markAsDemoMode();
      State.addTransactionsBatch(getDemoTransactions());
      showToast('ใส่ข้อมูลตัวอย่างแล้ว — ลองสำรวจแอปได้เลย');
    });
    return;
  }

  const today = todayISO();
  const todayDate = parseLocalDate(today);
  const monthSummary = State.getMonthSummary();
  const topCats = State.getTopCategories();
  const todayTxs = State.getTodayTransactions();

  // --- Catchup banner (welcome back after long absence) ---
  const catchupData = checkCatchupOpportunity();

  // --- Demo banner ---
  const demoBannerHtml = State.isDemoMode() ? `
    <div class="demo-banner">
      <span class="demo-banner-text">📊 กำลังดูข้อมูลตัวอย่าง</span>
      <button class="demo-clear-btn" data-action="clear-demo">ลบ + เริ่มใช้งานจริง</button>
    </div>
  ` : '';

  container.innerHTML = `
    ${demoBannerHtml}
    <!-- Catchup / welcome-back banner (แสดงเมื่อหยุดบันทึก ≥7 วัน + ไม่เปิดแอป ≥3 วัน) -->
    ${catchupData ? renderCatchupBanner(catchupData) : ''}

    <!-- Page header (date as diary opening) -->
    <div class="page-header">
      <div class="page-meta">${monthNameTH(todayDate, true).toUpperCase()} · ${ceToBe(todayDate.getFullYear())}</div>
      <h1 class="page-date">วัน${dayNameTH(todayDate)} <span class="accent">ที่ ${todayDate.getDate()}</span></h1>
      <div class="page-sub">— สมุดบันทึกของฉัน —</div>
    </div>

    ${SQUIGGLE}

    <!-- Hero: spending pace card (B+A style) -->
    ${renderHeroCard()}

    <!-- Today entries — ต่อจาก hero card -->
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">บันทึกวันนี้</h2>
      </div>
      <div class="card card-padded">
        ${todayTxs.length === 0
          ? `<div class="empty" style="padding: 24px 12px;">
               <div class="title">หน้านี้ยังว่างอยู่</div>
               <div class="desc">— กดปุ่ม <strong>+</strong> ตรงกลางเพื่อเริ่ม —</div>
             </div>`
          : todayTxs.map(t => renderEntryRow(t)).join('')}
      </div>
    </div>

    <!-- Spending chart: 14 วันล่าสุด -->
    ${renderSpendingChart()}

    <!-- Cashflow forecast: 30 วันข้างหน้า (Chart.js) -->
    ${renderForecastCard()}

    <!-- Upcoming recurring/scheduled -->
    ${renderUpcomingSection()}

    <!-- Top categories -->
    ${topCats.length > 0 ? `
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">ใช้ไปกับอะไร</h2>
      </div>
      <div class="card donut-card">
        ${renderDonutChart(topCats)}
      </div>
    </div>
    ` : ''}

    <!-- Export card -->
    <div class="card export-card">
      <div class="export-card-top">
        <div class="export-card-icon">${svgIcon('download', { size: 20, stroke: 2 })}</div>
        <div class="export-card-text">
          <div class="export-card-title">ส่งออกรายงานเป็นไฟล์ Excel</div>
        </div>
      </div>
      <button class="btn-primary export-card-btn" data-action="open-export">
        ${svgIcon('download', { size: 15, stroke: 2 })}&ensp;ดาวน์โหลด .xlsx
      </button>
    </div>

    <div class="signoff">— จบหน้าวันนี้ —</div>
  `;

  bindEntryActions(container);

  // Hero amount counter animation
  const heroVal = container.querySelector('#hero-val');
  if (heroVal) animateCount(heroVal, +heroVal.dataset.target);

  // Catchup banner actions
  container.querySelector('[data-action="skip-catchup"]')?.addEventListener('click', () => {
    dismissCatchup();
    container.querySelector('.catchup-banner')?.remove();
  });
  container.querySelectorAll('[data-action="import-pdf"]').forEach(btn => btn.addEventListener('click', () => {
    dismissCatchup();
    document.querySelector('.nav-item[data-view="import"]')?.click();
  }));

  // Demo mode: ลบข้อมูลตัวอย่าง + เริ่มใช้งานจริง
  container.querySelector('[data-action="clear-demo"]')?.addEventListener('click', () => {
    if (confirm('ลบข้อมูลตัวอย่างทั้งหมดและเริ่มใช้งานจริง?')) {
      State.clearSampleData();
      State.markDemoComplete();
      showToast('พร้อมแล้ว — เริ่มบันทึกข้อมูลจริงได้เลย');
    }
  });

  // "จัดการ" ในส่วนรายการล่วงหน้า → navigate ไปหน้า Settings ส่วนรายการประจำ
  container.querySelector('[data-action="view-recurring"]')?.addEventListener('click', () => {
    document.querySelector('.nav-item[data-view="settings"]')?.click();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById('recurring-section')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  });

  // init charts หลัง DOM พร้อม
  requestAnimationFrame(() => {
    initHeroChart();
    initForecastChart();
    initSpendingChart(container);
  });
}


/* === Helper: spending chart (14 วันล่าสุด) ====================
   เป้าหมาย: เห็น pattern รายจ่ายทันทีในมุมมองเดียว
   - แท่งสีแสดงระดับ: ปกติ (mocha จาง), สูงกว่าเฉลี่ย (clay), วันนี้ (terracotta)
   - insight banner ใต้ chart: comparison + runway-style hint
================================================================ */
function renderSpendingChart() {
  const days = 14;
  const cmp = State.getMonthComparison();
  const activeTxs = State.getTransactions().filter(t => t.deleted_by == null);

  // เฉลี่ยรายรับต่อวัน — ใช้ 30 วันย้อนหลัง (ครอบ 1 รอบเงินเดือนเสมอ)
  const past30Start = offsetDateISO(todayISO(), -30);
  const income30    = activeTxs.filter(t =>
    t.type === 'income' && t.date >= past30Start && t.date <= todayISO()
  );
  const incomeAvgPerDay = income30.reduce((s, t) => s + t.amount, 0) / 30;

  const { svg, avg, todayTotal } = dailyExpenseBars(activeTxs, days, incomeAvgPerDay);

  // Insight banner
  let insightHtml = '';
  if (cmp.percentChange !== null && cmp.lastMonth > 0) {
    const better = cmp.percentChange < 0;
    const cls = better ? 'good' : (cmp.percentChange > 20 ? 'warn' : '');
    const arrow = better ? svgIcon('check', { size: 14, stroke: 2.5 }) : svgIcon('trending', { size: 14, stroke: 2.5 });
    const verb = better ? 'น้อยกว่า' : 'มากกว่า';
    insightHtml = `
      <div class="insight-banner ${cls}">
        <div class="ic">${arrow}</div>
        <div class="text">
          ${cmp.dayCount} วันแรกของเดือน คุณใช้ <strong>${formatBaht(cmp.thisMonth)} ฿</strong> —
          ${verb}ช่วงเดียวกันเดือนก่อน <strong>${Math.abs(cmp.percentChange)}%</strong>
        </div>
      </div>
    `;
  } else if (avg > 0) {
    const netDaily = incomeAvgPerDay - avg;
    const netLabel = netDaily >= 0
      ? `<span style="color:var(--income,#5a9d63)">+${formatBaht(netDaily)} ฿/วัน</span>`
      : `<span style="color:var(--expense,#d96b5e)">${formatBaht(netDaily)} ฿/วัน</span>`;
    insightHtml = `
      <div class="insight-banner">
        <div class="ic">${svgIcon('trending', { size: 14, stroke: 2.5 })}</div>
        <div class="text">
          ใช้เฉลี่ยวันละ <strong>${formatBaht(avg)} ฿</strong>
          ${incomeAvgPerDay > 0 ? `· รับเฉลี่ย <strong>${formatBaht(incomeAvgPerDay)} ฿</strong> · สุทธิ ${netLabel}` : ''}
        </div>
      </div>
    `;
  }

  return `
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">รายจ่าย ${days} วันล่าสุด</h2>
      </div>
      <div class="card chart-card">
        ${svg}
        ${insightHtml}
      </div>
    </div>
  `;
}


/* === Bar chart: tap-to-show tooltip ============================
   bind หลัง DOM render ใน requestAnimationFrame
   Tooltip ถูก render เป็น SVG <g> ภายใน .chart-svg
================================================================ */
function initSpendingChart(container) {
  const svg = container.querySelector('.chart-card .chart-svg');
  if (!svg) return;

  const MONTH_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                        'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

  function hideTip() {
    const tip = svg.getElementById('chart-bar-tip');
    if (tip) {
      tip.setAttribute('visibility', 'hidden');
      tip.innerHTML = '';
    }
    svg.querySelectorAll('.bar-hit--active').forEach(el =>
      el.setAttribute('fill', 'transparent')
    );
  }

  function showTip(hitRect) {
    hideTip();
    const date  = hitRect.dataset.date;
    const total = parseInt(hitRect.dataset.total, 10);
    const cx    = parseFloat(hitRect.dataset.cx);
    const barY  = parseFloat(hitRect.dataset.bary);

    const tip = svg.getElementById('chart-bar-tip');
    if (!tip) return;

    // วันที่แสดง
    const [, mm, dd] = date.split('-');
    const todayStr = todayISO();
    const isToday  = date === todayStr;
    const dateLabel = isToday
      ? 'วันนี้'
      : `${parseInt(dd, 10)} ${MONTH_SHORT[parseInt(mm, 10) - 1]}`;

    // ตัวเลข
    const amtLabel = total > 0 ? `${formatBaht(total)} ฿` : 'ไม่มีรายจ่าย';

    // ขนาด tooltip
    const tipW = 88, tipH = 36, tipR = 8;
    const SVG_W = 320;

    // จำกัดไม่ให้เกินขอบ SVG
    let tx = cx - tipW / 2;
    tx = Math.max(2, Math.min(tx, SVG_W - tipW - 2));
    const ty = Math.max(2, barY - tipH - 7);

    // ลูกศรชี้ลงหาแท่ง
    const arrowCX = Math.min(Math.max(cx, tx + 10), tx + tipW - 10).toFixed(1);
    const arrowY  = (ty + tipH).toFixed(1);

    tip.innerHTML = `
      <rect x="${tx.toFixed(1)}" y="${ty.toFixed(1)}"
        width="${tipW}" height="${tipH}" rx="${tipR}"
        fill="var(--ink,#2d3748)"/>
      <polygon points="${arrowCX},${(ty + tipH + 6).toFixed(1)} ${(parseFloat(arrowCX)-5).toFixed(1)},${arrowY} ${(parseFloat(arrowCX)+5).toFixed(1)},${arrowY}"
        fill="var(--ink,#2d3748)"/>
      <text x="${(tx + tipW / 2).toFixed(1)}" y="${(ty + 14).toFixed(1)}"
        text-anchor="middle" font-size="11" font-weight="700" fill="#fff"
        font-family="inherit">${amtLabel}</text>
      <text x="${(tx + tipW / 2).toFixed(1)}" y="${(ty + 27).toFixed(1)}"
        text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.68)"
        font-family="inherit">${dateLabel}</text>
    `;
    tip.setAttribute('visibility', 'visible');

    // ไฮไลต์ hit area ที่กด (เพิ่ม subtle fill)
    hitRect.setAttribute('fill', 'rgba(255,255,255,0.08)');
  }

  // click ครอบคลุมทั้ง mouse + touch (iOS/Android)
  svg.addEventListener('click', e => {
    const hit = e.target.closest('.bar-hit');
    if (hit) {
      showTip(hit);
    } else {
      hideTip();
    }
  });

  // touch: ป้องกัน scroll แล้ว handle ทันที (ลด delay 300ms บน iOS เก่า)
  svg.addEventListener('touchstart', e => {
    const touch = e.touches[0];
    const el    = document.elementFromPoint(touch.clientX, touch.clientY);
    const hit   = el?.closest('.bar-hit');
    if (hit) {
      e.preventDefault();
      showTip(hit);
    }
  }, { passive: false });
}


/* === Forecast Card (Chart.js) — 30 วันข้างหน้า ================ */

let _forecastChartInstance = null;
let _forecastChartPayload  = null;

/** คำนวณข้อมูล forecast 30 วัน
 *
 *  สูตร (ป้องกัน double count):
 *  1. รายการประจำ (recurring templates) → exact date + exact amount
 *  2. รายจ่ายผันแปร (variable) = เฉลี่ยต่อวันปีนี้  MINUS  เฉลี่ยต่อวันของ templates
 *  3. รายรับผันแปร (variable) = เฉลี่ยต่อวันปีนี้  MINUS  เฉลี่ยต่อวันของ templates
 *  → templates บวกเข้าแบบ exact แล้ว ไม่ต้องนับซ้ำใน average
 */
function getForecastData() {
  const today      = todayISO();
  const yearStart  = today.slice(0, 4) + '-01-01';

  // ยอดรวมทุกบัญชี ณ ปัจจุบัน
  const startBalance = State.getAccounts().reduce((s, a) =>
    s + (a.type === 'cash' ? State.getEffectiveCashBalance(a.id) : State.computeAccountBalance(a.id)), 0);

  const txs = State.getTransactions().filter(t => t.deleted_by == null);

  // === YTD transactions (ปีปัจจุบัน, ไม่เกินวันนี้) ===
  const ytdTxs      = txs.filter(t => t.date >= yearStart && t.date <= today);
  const ytdExpenses = ytdTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const ytdIncomes  = ytdTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

  // จำนวนวันที่มีข้อมูล (วันแรกที่บันทึก → วันนี้)
  const firstDate   = ytdTxs.length > 0
    ? ytdTxs.reduce((m, t) => (t.date < m ? t.date : m), today)
    : yearStart;
  const daysElapsed = Math.max(1, Math.round((new Date(today) - new Date(firstDate)) / 86400000) + 1);

  // === เฉลี่ยต่อวันของ recurring templates (ทุก frequency) ===
  const templates = Recurring.getTemplates().filter(t => t.active);
  let tplDailyExpense = 0;
  let tplDailyIncome  = 0;
  for (const t of templates) {
    let occPerMonth = 0;
    if      (t.frequency === 'monthly')     occPerMonth = 1;
    else if (t.frequency === 'weekly')      occPerMonth = 4.33;
    else if (t.frequency === 'yearly')      occPerMonth = 1 / 12;
    else if (t.frequency === 'installment') {
      if ((t.installment_paid ?? 0) < (t.installment_total ?? 0)) occPerMonth = 1;
    }
    // one-time → ไม่มี recurring ต่อเดือน
    const daily = (t.amount * occPerMonth) / 30;
    if (t.type === 'expense') tplDailyExpense += daily;
    else if (t.type === 'income') tplDailyIncome += daily;
  }

  // === Variable daily averages (หลังหัก template impact) ===
  const hasSufficientData = ytdTxs.length >= 5;   // ต้องมีข้อมูลพอสมควร

  let varDailyExpense, varDailyIncome, dataSource;
  if (hasSufficientData) {
    varDailyExpense = Math.max(0, (ytdExpenses / daysElapsed) - tplDailyExpense);
    varDailyIncome  = Math.max(0, (ytdIncomes  / daysElapsed) - tplDailyIncome);
    dataSource = 'year';
  } else {
    // fallback: 30 วันย้อนหลัง (พฤติกรรมเดิม) พร้อมหัก template
    const p30Start   = offsetDateISO(today, -30);
    const p30Txs     = txs.filter(t => t.date >= p30Start && t.date < today);
    varDailyExpense  = Math.max(0,
      p30Txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0) / 30 - tplDailyExpense);
    varDailyIncome   = Math.max(0,
      p30Txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0) / 30 - tplDailyIncome);
    dataSource = 'month30';
  }

  // === Recurring/scheduled ===
  const schedule = Recurring.getForecast(30);
  const schedByDate = {};
  for (const r of schedule) {
    (schedByDate[r.date] = schedByDate[r.date] || []).push(r);
  }

  // === Build 30-day projection ===
  const days = [];
  let running = startBalance;
  for (let i = 0; i < 30; i++) {
    const date      = offsetDateISO(today, i);
    const recurring = schedByDate[date] || [];
    const schedNet  = recurring.reduce((s, r) => s + (r.type === 'income' ? r.amount : -r.amount), 0);

    if (i === 0) {
      // วันนี้: แค่รวม scheduled event (ยอดเริ่มต้นสะท้อน balance จริงอยู่แล้ว)
      running += schedNet;
    } else {
      running += schedNet + varDailyIncome - varDailyExpense;
    }

    days.push({
      date,
      balance:      Math.round(running),
      hasRecurring: recurring.length > 0,
      recurringItems: recurring,
    });
  }

  return {
    days,
    avgDailyExpense: varDailyExpense,   // ← ชื่อ field เดิม (ใช้กับ note)
    varDailyIncome,
    tplDailyExpense,
    tplDailyIncome,
    daysElapsed,
    startBalance,
    dataSource,
  };
}

/** HTML card สำหรับ forecast — chart init ผ่าน initForecastChart() */
function renderForecastCard() {
  const { days, avgDailyExpense, varDailyIncome, tplDailyExpense, daysElapsed, dataSource } = getForecastData();

  // ข้อมูลน้อยเกินไป → แสดง empty state แทนกราฟ
  if (daysElapsed < 7) {
    return `
      <div class="section">
        <div class="section-head">
          <h2 class="section-title">เงินใน 30 วันข้างหน้า</h2>
        </div>
        <div class="card card-padded">
          ${renderEmptyState({
            icon:     'trending',
            title:    'ยังไม่พอสร้างกราฟ',
            subtitle: 'ต้องการข้อมูลอย่างน้อย 7 วัน — กลับมาดูสัปดาห์หน้า',
          })}
        </div>
      </div>
    `;
  }
  const threshold   = State.getSettings().threshold_satang;
  const minBalance  = Math.min(...days.map(d => d.balance));
  const dangerDays  = days.filter(d => d.balance < threshold);

  _forecastChartPayload = { days, threshold, avgDailyExpense };

  const xLabels = days.map((d, i) => {
    if (i === 0) return 'วันนี้';
    const day = parseInt(d.date.slice(8, 10));
    return day % 7 === 0 ? String(day) : '';
  });

  return `
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">เงินใน 30 วันข้างหน้า</h2>
      </div>
      <div class="card forecast-card">

        <div class="forecast-stats">
          <div class="forecast-stat">
            <div class="forecast-stat-label">ยอดวันนี้</div>
            <div class="forecast-stat-value ok">${formatBaht(days[0]?.balance ?? 0)} ฿</div>
          </div>
          <div class="forecast-stat">
            <div class="forecast-stat-label">คาดต่ำสุดในช่วง 30 วัน</div>
            <div class="forecast-stat-value ${minBalance < threshold ? 'danger' : 'ok'}">
              ${formatBaht(minBalance)} ฿
            </div>
          </div>
        </div>

        <div class="forecast-legend">
          <span class="fl-item"><span class="fl-line primary"></span>ยอดคาดการณ์</span>
          <span class="fl-item"><span class="fl-dash danger"></span>เกณฑ์ ${formatBaht(threshold)} ฿</span>
          <span class="fl-item"><span class="fl-dot primary"></span>วันนี้</span>
          ${dangerDays.length > 0 ? `<span class="fl-item"><span class="fl-dot danger"></span>เกณฑ์เตือน</span>` : ''}
        </div>

        <div class="forecast-chart-wrap">
          <canvas id="forecastChart30"
            aria-label="กราฟยอดเงินคาดการณ์ 30 วัน เริ่มต้น ${formatBaht(days[0]?.balance ?? 0)} บาท ต่ำสุด ${formatBaht(minBalance)} บาท">
          </canvas>
        </div>

        ${dangerDays.length > 0 ? `
        <div class="forecast-warning">
          ⚠️ คาดว่ายอดจะต่ำกว่าเกณฑ์ ${dangerDays.length} วัน
          (เริ่มวันที่ ${dangerDays[0].date.slice(8, 10)}/${dangerDays[0].date.slice(5, 7)})
        </div>` : ''}

        <div class="forecast-note">
          <div class="forecast-note-text">
            <b>รายการประจำ</b> (exact) +
            ใช้จ่ายผันแปร <b>${formatBaht(avgDailyExpense)} ฿/วัน</b>
            ${varDailyIncome > 0 ? `− รายรับผันแปร <b>${formatBaht(varDailyIncome)} ฿/วัน</b>` : ''}
            · อิงจาก${dataSource === 'year'
              ? `ข้อมูล <b>${daysElapsed} วัน</b>ในปีนี้ (หักรายการประจำออกแล้ว)`
              : '30 วันย้อนหลัง (ข้อมูลปีนี้ยังน้อย)'}
          </div>
        </div>

      </div>
    </div>
  `;
}

/** Init / re-init Chart.js บน #forecastChart30 หลัง DOM insert */
async function initForecastChart() {
  const canvas = document.getElementById('forecastChart30');
  if (!canvas || !_forecastChartPayload) return;

  if (!_ChartClass) {
    try {
      const mod = await import('https://cdn.jsdelivr.net/npm/chart.js/auto/+esm');
      _ChartClass = mod.Chart;
    } catch (e) {
      console.warn('[forecast] Chart.js load failed:', e);
      return;
    }
  }

  if (_forecastChartInstance) { _forecastChartInstance.destroy(); _forecastChartInstance = null; }

  const c = document.getElementById('forecastChart30');
  if (!c) return;

  // อ่านสีตามธีม ณ เวลา render
  const cs = getComputedStyle(document.documentElement);
  const primaryHex  = cs.getPropertyValue('--terracotta').trim() || '#e88563';
  const inkFaintHex = cs.getPropertyValue('--ink-faint').trim()  || '#b3a596';

  function hexRgba(hex, a) {
    let hx = hex.replace('#', '');
    if (hx.length === 3) hx = hx.split('').map(x => x + x).join('');
    const r = parseInt(hx.slice(0, 2), 16);
    const g = parseInt(hx.slice(2, 4), 16);
    const b = parseInt(hx.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  const { days, threshold } = _forecastChartPayload;

  const balanceData    = days.map(d => Math.round(d.balance / 100));       // → บาท
  const thresholdData  = Array(30).fill(Math.round(threshold / 100));
  const recurringData  = days.map(d => d.hasRecurring ? Math.round(d.balance / 100) : null);

  const xLabels = days.map((d, i) => {
    if (i === 0) return 'วันนี้';
    const day = parseInt(d.date.slice(8, 10));
    return day % 7 === 0 ? String(day) : '';
  });

  _forecastChartInstance = new _ChartClass(c, {
    type: 'line',
    data: {
      labels: xLabels,
      datasets: [
        {
          label: 'ยอดคาดการณ์',
          data: balanceData,
          borderColor: primaryHex,
          borderWidth: 2.5,
          backgroundColor: hexRgba(primaryHex, 0.08),
          fill: true,
          pointRadius: days.map((_, i) => i === 0 ? 5 : 0),
          pointHoverRadius: 5,
          pointBackgroundColor: days.map((_, i) => i === 0 ? primaryHex : 'transparent'),
          tension: 0.3,
        },
        {
          label: 'เกณฑ์ต่ำสุด',
          data: thresholdData,
          borderColor: '#A32D2D',
          borderWidth: 1.5,
          borderDash: [5, 4],
          pointRadius: 0,
          fill: false,
          tension: 0,
        },
        {
          label: 'รายการประจำ',
          data: recurringData,
          borderColor: 'transparent',
          backgroundColor: inkFaintHex,
          pointRadius: 5,
          pointHoverRadius: 6,
          showLine: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ctx => {
              const d = days[ctx[0].dataIndex];
              return `วันที่ ${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`;
            },
            label: ctx => {
              if (ctx.dataset.label === 'รายการประจำ' && ctx.parsed.y == null) return null;
              if (ctx.dataset.label === 'เกณฑ์ต่ำสุด')
                return `เกณฑ์: ${ctx.parsed.y.toLocaleString()} ฿`;
              if (ctx.dataset.label === 'ยอดคาดการณ์')
                return `คาดการณ์: ${ctx.parsed.y.toLocaleString()} ฿`;
              return ctx.parsed.y != null
                ? `รายการประจำ: ${ctx.parsed.y.toLocaleString()} ฿`
                : null;
            },
            afterBody: ctx => {
              const d = days[ctx[0].dataIndex];
              if (!d.hasRecurring) return [];
              return d.recurringItems.map(r =>
                `  ${r.type === 'income' ? '+' : '-'}${formatBaht(r.amount)} ${r.description}`
              );
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.04)', drawTicks: false },
          border: { display: false },
          ticks: { font: { size: 10 }, color: inkFaintHex, maxRotation: 0 },
        },
        y: {
          grid: { color: 'rgba(0,0,0,0.05)', drawTicks: false },
          border: { display: false },
          ticks: {
            font: { size: 10 },
            color: inkFaintHex,
            callback: v => v >= 1000 ? `${Math.round(v / 1000)}k` : v,
          },
          min: 0,
        },
      },
    },
  });
}

/* === เดิม: SVG-based forecast (ถูกแทนที่โดย renderForecastCard ด้านบน) === */
function renderForecastChart() {
  const accounts = State.getAccounts().filter(a => !a.exclude_from_summary);
  const totalBalance = accounts.reduce((s, a) =>
    s + (a.type === 'cash' ? State.getEffectiveCashBalance(a.id) : State.computeAccountBalance(a.id)), 0);
  const threshold = State.getSettings().threshold_satang;

  // ดึง recurring forecast 30 วัน
  const forecast = Recurring.getForecast(30);

  // เพิ่ม projected daily expense จาก average 14 วันล่าสุด
  // เพื่อให้ forecast realistic — ไม่ใช่แค่ recurring
  const recentExpenses = State.getDailyExpenses(14);
  const totalRecent = recentExpenses.reduce((s, d) => s + d.total, 0);
  const avgDaily = Math.round(totalRecent / 14);

  // เติม "ค่าใช้จ่ายเฉลี่ยต่อวัน" เข้า forecast
  // (ไม่ duplicate กับ recurring เพราะ recurring มี date เฉพาะ)
  const todayDate = new Date();
  const enriched = [...forecast];
  for (let i = 1; i <= 30; i++) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    if (avgDaily > 0) {
      enriched.push({
        date: iso,
        type: 'expense',
        amount: avgDaily,
        group: 'projected',
        description: 'ค่าใช้จ่ายเฉลี่ย'
      });
    }
  }

  const result = cashflowForecast(totalBalance, enriched, threshold, 30);

  // Insight banner
  let insight = '';
  if (result.willHitThreshold && result.daysUntilThreshold != null) {
    insight = `
      <div class="forecast-insight warn">
        ${svgIcon('alert', { size: 16, stroke: 2 })}
        <div>ยอดใกล้เกณฑ์ในอีก <strong>${result.daysUntilThreshold} วัน</strong></div>
      </div>
    `;
  } else if (result.finalBalance > totalBalance) {
    insight = `
      <div class="forecast-insight good">
        ${svgIcon('check', { size: 16, stroke: 2.5 })}
        <div>คาดว่าจะเหลือ <strong>${formatBaht(result.finalBalance)} ฿</strong> ใน 30 วัน — ดูดี</div>
      </div>
    `;
  } else {
    const diff = totalBalance - result.finalBalance;
    insight = `
      <div class="forecast-insight">
        ${svgIcon('trending', { size: 16, stroke: 2 })}
        <div>คาดว่าจะใช้ไป <strong>${formatBaht(diff)} ฿</strong> ใน 30 วัน —
          เหลือ ${formatBaht(result.finalBalance)} ฿</div>
      </div>
    `;
  }

  return `
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">เงินใน 30 วันข้างหน้า</h2>
      </div>
      <div class="card chart-card">
        ${result.svg}
        ${insight}
      </div>
    </div>
  `;
}


/* === Helper: upcoming recurring/scheduled =====================
   แสดงรายการล่วงหน้า/ประจำที่จะเกิดใน 7 วันข้างหน้า
================================================================ */
function renderUpcomingSection() {
  const upcoming = Recurring.getForecast(14).slice(0, 5);
  if (upcoming.length === 0) return '';

  return `
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">รายการล่วงหน้า</h2>
        <a class="section-action" data-action="view-recurring">จัดการ</a>
      </div>
      <div class="card card-padded">
        ${upcoming.map(u => renderUpcomingRow(u)).join('')}
      </div>
    </div>
  `;
}

function renderUpcomingRow(u) {
  const def = getCategory(u.group);
  const dateObj = parseLocalDate(u.date);
  const today = todayISO();
  const daysAway = Math.round((dateObj - new Date()) / 86400000);

  let dateLabel;
  if (u.date === today) dateLabel = 'วันนี้';
  else if (daysAway === 1) dateLabel = 'พรุ่งนี้';
  else if (daysAway <= 7) dateLabel = `อีก ${daysAway} วัน`;
  else dateLabel = formatShortDate(u.date);

  const sign = u.type === 'income' ? '+' : '−';
  const amtClass = u.type === 'income' ? 'income' : '';

  const installmentLabel = u.installment_info
    ? `<span class="install-tag">งวด ${u.installment_info.current}/${u.installment_info.total}</span>`
    : '';

  // ตรวจว่า template นี้ผูกกับ sample account หรือไม่
  const isDemoAcct = u.account_id
    ? State.getAccount(u.account_id)?._sample === true
    : false;
  const demoTag = isDemoAcct ? ' <span class="demo-tag">Demo</span>' : '';

  return `
    <div class="entry upcoming">
      <span class="entry-time">${dateLabel}</span>
      <div class="entry-icon" style="background: ${def.color}; opacity: 0.7">
        ${svgIcon(def.icon, { size: 16, stroke: 2 })}
      </div>
      <div>
        <div class="entry-name">${escapeHtml(u.description || def.label)} ${installmentLabel}${demoTag}</div>
        <div class="entry-cat">${def.label} · ประจำ</div>
      </div>
      <div class="entry-amt ${amtClass}">${sign}${formatBaht(u.amount)} ฿</div>
    </div>
  `;
}


/* === Helper: account row ======================================== */
const ACCT_INIT = { cash: '฿', bank: 'BNK', investment: 'INV', debt: 'DEBT', credit_card: 'CC', ewallet: 'EW' };

function renderAccountRow(acct) {
  const balance = acct.type === 'cash'
    ? State.getEffectiveCashBalance(acct.id)
    : State.computeAccountBalance(acct.id);
  const isNegative = balance < 0;
  const rowClass   = isNegative ? 'account-row--danger' : '';
  const initial    = acct.bank ? acct.bank.toUpperCase().slice(0, 3) : (ACCT_INIT[acct.type] || '?');

  return `
    <div class="acct${rowClass ? ` ${rowClass}` : ''}">
      <div class="acct-icon ${acct.bank || acct.type}">${initial}</div>
      <div class="acct-body">
        <div class="acct-name">${escapeHtml(acct.display_name)}${acct._sample ? ' <span class="demo-tag">Demo</span>' : ''}${acct.exclude_from_summary ? ' <span class="excl-badge">ไม่นับสรุป</span>' : ''}</div>
        ${acct.account_number_masked
          ? `<div class="acct-num">${escapeHtml(acct.account_number_masked)}</div>`
          : ''}
      </div>
      <div>
        <div class="acct-balance" style="${isNegative ? 'color:var(--expense,#d96b5e)' : ''}">${formatBaht(balance)} ฿</div>
        ${isNegative ? `<div style="font-size:11px;color:var(--expense,#d96b5e);text-align:right;margin-top:1px;">ติดลบ</div>` : ''}
      </div>
    </div>
  `;
}


/* === Helper: category donut chart ================================ */
function renderDonutChart(cats) {
  const r = 38, cx = 50, cy = 50;
  const totalCirc = 2 * Math.PI * r;
  const grandTotal = cats.reduce((s, c) => s + c.total, 0);

  let cumLen = 0;
  const segs = cats.map(c => {
    const segLen = grandTotal > 0 ? (c.total / grandTotal) * totalCirc : 0;
    const offset = cumLen;
    cumLen += segLen;
    const def = getCategory(c.group);
    return { segLen, offset, rest: totalCirc - segLen, color: def.color, label: def.label, pct: c.percent, total: c.total };
  });

  const segsSVG = segs.map(s =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="14"
      stroke-dasharray="${s.segLen.toFixed(2)} ${s.rest.toFixed(2)}"
      stroke-dashoffset="${(-s.offset).toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})"/>`
  ).join('');

  const legendHTML = segs.map(s => `
    <div class="donut-leg-row">
      <span class="donut-leg-dot" style="background:${s.color}"></span>
      <span class="donut-leg-name">${s.label}</span>
      <span class="donut-leg-right">
        <span class="donut-leg-amt">${formatBaht(s.total)}</span>
        <span class="donut-leg-pct">${s.pct}%</span>
      </span>
    </div>`
  ).join('');

  return `
    <div class="donut-wrap">
      <div class="donut-svg-wrap">
        <svg viewBox="0 0 100 100" class="donut-svg">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--rule)" stroke-width="14"/>
          ${segsSVG}
        </svg>
        <div class="donut-center">
          <div class="donut-center-sub">รายจ่าย</div>
          <div class="donut-center-val">${formatBaht(grandTotal)}</div>
          <div class="donut-center-sub">฿</div>
        </div>
      </div>
      <div class="donut-legend">${legendHTML}</div>
    </div>`;
}


/* === Helper: entry row (transaction) ============================ */
function shortName(email) {
  if (!email) return null;
  return email.split('@')[0];
}

function shortAcctName(name) {
  if (!name) return '';
  // ตัดคำซ้ำซ้อน เช่น "เงินสด" หรือ "กสิกร ...1234" → "1234"
  // แสดงแค่ส่วนท้าย (หลัง space) ถ้าชื่อยาวกว่า 8 ตัวอักษร
  if (name.length <= 8) return name;
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

function renderEntryRow(tx, decimals = 0) {
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


/* ===================================================================
   LIST VIEW (บันทึก)
   =================================================================== */
let listState = { search: '', filter: 'all', month: todayISO().slice(0, 7) };

export function renderList(container) {
  // Empty state — ยังไม่มีรายการใดๆ เลย
  if (State.getTransactions().length === 0) {
    container.innerHTML = `
      <div class="app-bar">
        <h1 class="title">ที่จดไว้</h1>
      </div>
      <div class="empty-state">
        <div class="empty-icon">${svgIcon('book-open', { size: 48, stroke: 1.5 })}</div>
        <h3 class="empty-title">เริ่มต้นกันเถอะ</h3>
        <div class="empty-actions">
          <button data-action="import-pdf" class="btn-primary">นำเข้า e-Statement</button>
          <button id="fab-trigger" class="btn-ghost">บันทึกรายการแรก</button>
        </div>
      </div>
    `;
    container.querySelector('[data-action="import-pdf"]')?.addEventListener('click', () => {
      document.querySelector('.nav-item[data-view="import"]')?.click();
    });
    container.querySelector('#fab-trigger')?.addEventListener('click', () => {
      document.getElementById('fab')?.click();
    });
    return;
  }

  const filterFn = makeFilterFn(listState);
  const groups = State.getTransactionsByDay(filterFn);

  // Month label: "พฤษภาคม 2568"
  const [mYear, mMonth] = listState.month.split('-').map(Number);
  const mDate = new Date(mYear, mMonth - 1, 1);
  const monthLabel = `${monthNameTH(mDate)} ${ceToBe(mDate.getFullYear())}`;
  const isCurrentMonth = listState.month === todayISO().slice(0, 7);

  const carry = State.getMonthSummaryWithCarry(listState.month);

  // ยอดรวมแต่ละประเภทของเดือนที่เลือก (ไม่กรองตาม search/filter ปัจจุบัน)
  const _mTxs       = State.getTransactions().filter(t => t.deleted_by == null && t.date?.startsWith(listState.month));
  const _totExp      = _mTxs.filter(t => t.type === 'expense' ).reduce((s,t) => s + t.amount, 0);
  const _totInc      = _mTxs.filter(t => t.type === 'income'  ).reduce((s,t) => s + t.amount, 0);
  const _totTrf      = _mTxs.filter(t => t.type === 'transfer').reduce((s,t) => s + t.amount, 0);
  const _netAll      = _totInc - _totExp;
  const _fmt = (n) => n > 0 ? `${formatBaht(n)} ฿` : '—';
  const _netFmt = _netAll === 0 ? '—'
    : `${_netAll > 0 ? '+' : '−'}${formatBaht(Math.abs(_netAll))} ฿`;
  const _netCls = _netAll > 0 ? 'pos' : _netAll < 0 ? 'neg' : '';

  container.innerHTML = `
    <div class="app-bar">
      <h1 class="title">ที่จดไว้</h1>
    </div>

    <div class="month-nav">
      <button class="month-nav-btn" data-action="prev-month"><span class="flip-h">${svgIcon('chevron', { size: 16, stroke: 2.5 })}</span></button>
      <span class="month-nav-label">${monthLabel}</span>
      <button class="month-nav-btn${isCurrentMonth ? ' disabled' : ''}" data-action="next-month"${isCurrentMonth ? ' disabled' : ''}>${svgIcon('chevron', { size: 16, stroke: 2.5 })}</button>
    </div>

    <div class="search-bar">
      ${svgIcon('search', { size: 16, stroke: 2 })}
      <input id="search-input" type="text" placeholder="ค้นหา..." value="${escapeHtml(listState.search)}">
    </div>

    <div class="filter-chips">
      <button class="chip ${listState.filter === 'all' ? 'active' : ''}" data-filter="all">
        <span class="chip-label">ทั้งหมด</span>
        <span class="chip-amt ${_netCls}">${_netFmt}</span>
      </button>
      <button class="chip ${listState.filter === 'expense' ? 'active' : ''}" data-filter="expense">
        <span class="chip-label">รายจ่าย</span>
        <span class="chip-amt exp">${_fmt(_totExp)}</span>
      </button>
      <button class="chip ${listState.filter === 'income' ? 'active' : ''}" data-filter="income">
        <span class="chip-label">รายรับ</span>
        <span class="chip-amt inc">${_fmt(_totInc)}</span>
      </button>
      <button class="chip ${listState.filter === 'transfer' ? 'active' : ''}" data-filter="transfer">
        <span class="chip-label">โอน</span>
        <span class="chip-amt trf">${_fmt(_totTrf)}</span>
      </button>
    </div>

    <div class="month-carry-header">
      <span class="month-carry-title">${monthLabel}</span>
      <span class="month-carry-balance">
        ยกมา ${formatBaht(carry.opening)}
        <span class="month-carry-net ${carry.income - carry.expense >= 0 ? 'positive' : 'negative'}">${carry.income - carry.expense >= 0 ? '+' : '−'}${formatBaht(Math.abs(carry.income - carry.expense))}</span>
        คงเหลือ ${formatBaht(carry.closing)}
      </span>
    </div>

    ${groups.length === 0
      ? listState.search
        ? renderEmptyState({
            icon:     'search',
            title:    'หาไม่เจอ',
            subtitle: `ไม่มีรายการที่ตรงกับ "${escapeHtml(listState.search)}" — ลองคำอื่น หรือล้างการค้นหา`,
            actions:  [{ label: 'ล้างการค้นหา', style: 'btn-ghost', action: 'clear-search' }],
          })
        : `<div class="empty">
             <div class="icon">📖</div>
             <div class="title">ไม่มีรายการในเดือนนี้</div>
             <div class="desc">— ลองเลื่อนไปเดือนอื่น หรือเพิ่มรายการใหม่ —</div>
           </div>`
      : groups.map(g => renderDayGroup(g)).join('')}
  `;

  // === Bind events ===

  // "clear-search" จาก empty state ของผลค้นหาว่าง
  container.querySelector('[data-action="clear-search"]')?.addEventListener('click', () => {
    listState.search = '';
    renderList(container);
  });

  const searchInput = container.querySelector('#search-input');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(e => {
      listState.search = e.target.value;
      renderList(container);
      const newInput = container.querySelector('#search-input');
      if (newInput) {
        newInput.focus();
        newInput.setSelectionRange(newInput.value.length, newInput.value.length);
      }
    }, 200));
  }

  container.querySelectorAll('.chip[data-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      listState.filter = chip.dataset.filter;
      renderList(container);
    });
  });

  container.querySelector('[data-action="prev-month"]')?.addEventListener('click', () => {
    const [y, m] = listState.month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    listState.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    renderList(container);
  });

  container.querySelector('[data-action="next-month"]')?.addEventListener('click', () => {
    if (isCurrentMonth) return;
    const [y, m] = listState.month.split('-').map(Number);
    const d = new Date(y, m, 1);
    listState.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    renderList(container);
  });

  bindEntryActions(container);
}


function makeFilterFn(state) {
  return (tx) => {
    if (tx.date.slice(0, 7) !== state.month) return false;
    if (state.filter !== 'all' && tx.type !== state.filter) return false;
    if (state.search) {
      const q = state.search.toLowerCase();
      const cat = getCategory(tx.group).label.toLowerCase();
      const desc = (tx.description || '').toLowerCase();
      if (!cat.includes(q) && !desc.includes(q)) return false;
    }
    return true;
  };
}


function renderDayGroup(g) {
  const d = parseLocalDate(g.date);
  const today = todayISO();
  const yesterday = (() => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return y.toISOString().slice(0, 10);
  })();

  // Day label: "วันนี้", "เมื่อวาน", หรือชื่อวัน
  let dayLabel;
  if (g.date === today) dayLabel = 'วันนี้';
  else if (g.date === yesterday) dayLabel = 'เมื่อวาน';
  else dayLabel = `วัน${dayNameTH(d)}`;

  return `
    <div class="day-group">
      <div class="day-head">
        <div class="day-name">${dayLabel} <span class="num">ที่ ${d.getDate()}</span></div>
        <div class="day-meta">
          ${monthNameTH(d, true)} ${ceToBe(d.getFullYear())}
          ${g.dayTotalExpense > 0 ? ` · <span class="total">−${formatBaht(g.dayTotalExpense)} ฿</span>` : ''}
          ${g.dayTotalIncome > 0 ? ` · <span class="income">+${formatBaht(g.dayTotalIncome)} ฿</span>` : ''}
        </div>
      </div>
      <div class="card card-padded">
        ${g.transactions.map(t => renderEntryRow(t, 2)).join('')}
      </div>
    </div>
  `;
}


/* ===================================================================
   IMPORT VIEW (e-Statement / Slip)
   =================================================================== */
export function renderImport(container) {
  container.innerHTML = `
    <div class="import-header">
      <div class="import-title">นำเข้า<span class="accent"> รายการ</span></div>
      <div class="import-sub">เลือกวิธีที่สะดวก — รวบยอดเดือน หรือสแกนทีละรายการ</div>
    </div>

    <!-- e-Statement tile -->
    <div class="import-tile pdf" data-action="import-pdf">
      <div class="tile-icon">
        ${svgIcon('pdf', { size: 26, stroke: 1.6 })}
        <span class="badge">eS</span>
      </div>
      <div class="tile-title">e-Statement</div>
      <div class="tile-desc">ลาก e-Statement จากแอปธนาคาร — รวบทั้งเดือน</div>
      <button class="tile-btn">เลือกไฟล์</button>
    </div>

    <!-- Bank grid -->
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">ธนาคารที่รองรับ</h2>
      </div>
      <div class="bank-grid">
        ${renderBankCell('KTB',   '#0e9bdc')}
        ${renderBankCell('KBank', '#138f3f')}
        ${renderBankCell('SCB',   '#4d2882')}
        ${renderBankCell('BBL',   '#1e4486')}
        ${renderBankCell('BAY',   '#fec43b')}
        ${renderBankCell('อื่นๆ', '#7a6a5c')}
      </div>
    </div>

    <!-- Recent imports -->
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">นำเข้าล่าสุด</h2>
      </div>
      <div class="card card-padded">
        <div class="empty" style="padding: 16px;">
          <div class="desc">— ยังไม่มีประวัตินำเข้า —</div>
        </div>
      </div>
    </div>

    <!-- Privacy note -->
    <div class="privacy-footer">
      ${svgIcon('shield', { size: 18, stroke: 2 })}
      <div class="text">
        <strong>ข้อมูลของคุณอยู่ในเครื่องเท่านั้น</strong><br>
        e-Statement และรายการทั้งหมดประมวลผลในเครื่อง — ไม่ส่งออกไปไหน
      </div>
    </div>

    <!-- Hidden file input -->
    <input id="pdf-file-input" type="file" accept="application/pdf" hidden>
  `;

  // === Bind events ===
  container.querySelector('[data-action="import-pdf"]')?.addEventListener('click', () => {
    container.querySelector('#pdf-file-input').click();
  });

  container.querySelector('#pdf-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';   // reset เผื่อเลือกไฟล์เดิมซ้ำ
    await handlePdfImport(file);
  });

}


/* === Slip scan handler ==========================================
   Lazy-import slip.js + add.js เพื่อไม่ load 128KB ของ jsQR
   ตอนแรกเข้า dashboard
================================================================ */
async function handleSlipScan(file) {
  showToast('กำลังสแกน...');
  try {
    const { scanSlipImage } = await import('./slip.js');
    const result = await scanSlipImage(file);

    if (!result) {
      showToast('ไม่พบ QR code — ลองรูปอื่น หรือบันทึกเอง');
      return;
    }

    // Lazy import เพื่อหลีกเลี่ยง circular dep (add.js → views.js)
    const { openAddModal } = await import('./add.js');

    // ถ้ามี amount → pre-fill add modal
    if (result.amount != null && result.amount > 0) {
      const satang = Math.round(result.amount * 100);
      openAddModal({
        type: 'expense',
        group: 'transfer',
        amount: satang,
        note: result.ref ? `Ref: ${result.ref}` : 'จาก slip',
        source: 'slip'
      });
      showToast(`อ่านได้ ${result.amount.toLocaleString()} ฿`);
    } else {
      // QR อ่านได้แต่ไม่เจอ amount — เปิด modal เปล่า
      const note = result.bank
        ? `slip ${result.bank.toUpperCase()}${result.ref ? ' · ' + result.ref : ''}`
        : 'จาก slip — กรุณากรอกจำนวน';
      openAddModal({
        type: 'expense',
        group: 'transfer',
        note,
        source: 'slip'
      });
      showToast('อ่าน QR ได้ — โปรดกรอกจำนวนเงิน');
    }
  } catch (err) {
    console.error('Slip scan failed', err);
    showToast('สแกนไม่สำเร็จ — ลองใหม่');
  }
}


/* === e-Statement import handler ================================
   Flow: parse (handle password) → confidence check → review / AI
================================================================ */
async function handlePdfImport(file) {
  const { parsePDF, scoreParseResult } = await import('./parsers.js');
  let result;

  // ── first attempt ──────────────────────────────────────────────
  const prog1 = createProgressModal('กำลังประมวลผล e-Statement');
  document.body.appendChild(prog1.el);
  try {
    result = await parsePDF(file, null, step => prog1.update(step));
    prog1.el.remove();
  } catch (err) {
    prog1.el.remove();
    if (err.name !== 'PasswordException') {
      console.error('PDF parse failed', err);
      showToast('อ่าน e-Statement ไม่สำเร็จ: ' + (err.message || 'unknown'));
      return;
    }

    // ── password prompt ──────────────────────────────────────────
    const password = prompt('e-Statement นี้มีรหัสผ่าน กรุณาใส่รหัส:');
    if (!password) return;

    // ── retry with password ──────────────────────────────────────
    const prog2 = createProgressModal('กำลังประมวลผล e-Statement');
    document.body.appendChild(prog2.el);
    try {
      result = await parsePDF(file, password, step => prog2.update(step));
      prog2.el.remove();
    } catch (err2) {
      prog2.el.remove();
      if (err2.name === 'PasswordException') {
        showToast('รหัสผ่านไม่ตรง — ลองใหม่');
      } else {
        console.error('PDF parse failed', err2);
        showToast('อ่าน e-Statement ไม่สำเร็จ: ' + (err2.message || 'unknown'));
      }
      return;
    }
  }

  // ── confidence scoring ─────────────────────────────────────────
  const score = scoreParseResult(result);
  if (score < 60) {
    const useAI = confirm(
      `อ่านได้ ${result.transactions.length} รายการ (ความแม่นยำต่ำ)\n` +
      `ต้องการให้ AI ช่วยวิเคราะห์ไหม?\n` +
      `(ข้อความจาก e-Statement จะถูกส่งไปยัง Google AI)`
    );
    if (useAI) {
      // PDF มีรหัส → ส่ง extractedText (string); PDF ปกติ → ส่งไฟล์ (File)
      const fileOrText = result.extractedText ? result.extractedText : file;
      await handleGeminiFallback(fileOrText, file.name);
      return;
    }
  }

  showReviewModal(result, file.name);
}


/* === Gemini AI fallback =========================================
   fileOrText: string (extractedText จาก PDF มีรหัส) หรือ File (PDF ปกติ)
   throw 'AI_STUDIO_TERMS_NOT_ACCEPTED' → dialog แนะนำแสดงไปแล้วใน gemini.js
================================================================ */
async function handleGeminiFallback(fileOrText, fileName) {
  const { getAccessToken, getCurrentUser } = await import('./firebase.js');
  let token = getAccessToken();

  // token หมดหลัง reload แต่ยัง sign-in อยู่ → ขอ token ใหม่ผ่าน popup
  if (!token && getCurrentUser()) {
    try {
      showToast('กำลังขอ access token ใหม่…');
      const { signInWithGoogle } = await import('./firebase.js');
      const res = await signInWithGoogle();
      token = res.accessToken || getAccessToken();
    } catch {
      showToast('ไม่สามารถขอ token ได้ — กรุณาออกจากระบบแล้วลงชื่อเข้าใหม่');
      return;
    }
  }

  if (!token) {
    showToast('ต้องลงชื่อเข้าใช้ก่อนใช้ AI วิเคราะห์');
    return;
  }

  const prog = createProgressModal('AI กำลังวิเคราะห์ e-Statement');
  document.body.appendChild(prog.el);

  try {
    const { parseStatementWithGemini } = await import('./gemini.js');
    const geminiResult = await parseStatementWithGemini(fileOrText, token);
    prog.el.remove();

    // แปลงผล Gemini → รูปแบบเดียวกับ parsePDF result
    const transactions = (geminiResult.transactions || []).map(t => ({
      date:        t.date,
      amount:      Math.abs(t.amount || 0),
      description: t.description || '',
      type:        t.type || 'expense',
      balance:     t.balance ?? null,
      source:      'pdf',
    }));

    const result = {
      transactions,
      bank:        geminiResult.bank_name || null,
      accountInfo: { account_number_last4: geminiResult.account_number_last4 || null },
      extractedText: typeof fileOrText === 'string' ? fileOrText : '',
    };

    showReviewModal(result, fileName || 'gemini-import');
  } catch (err) {
    prog.el.remove();
    if (err.message === 'AI_STUDIO_TERMS_NOT_ACCEPTED') return; // dialog แสดงแล้ว
    console.error('[gemini fallback]', err);
    showToast('AI วิเคราะห์ไม่สำเร็จ: ' + (err.message || 'unknown'));
  }
}


/* === Progress modal ============================================ */
function createProgressModal(title) {
  const el = document.createElement('div');
  el.className = 'import-progress';
  el.innerHTML = `
    <div class="import-progress-card">
      <div class="title">${escapeHtml(title)}</div>
      <div class="step">กำลังเริ่ม...</div>
      <div class="bar"><div class="bar-fill" style="width: 5%"></div></div>
    </div>
  `;
  const stepEl = el.querySelector('.step');
  const barEl = el.querySelector('.bar-fill');
  let p = 5;
  return {
    el,
    update(msg) {
      stepEl.textContent = msg;
      p = Math.min(95, p + 12);
      barEl.style.width = p + '%';
    }
  };
}


/* === Review modal (preview transactions ก่อน confirm import) === */
function showReviewModal(result, fileName) {
  const modal = document.createElement('div');
  modal.className = 'review-modal';

  const bankLabel = {
    kbank: 'KBank', ktb: 'กรุงไทย', scb: 'SCB', bbl: 'BBL', bay: 'กรุงศรี',
    ttb: 'TTB', gsb: 'GSB', baac: 'ธ.ก.ส.', ghb: 'GHB',
    cimb: 'CIMB', uob: 'UOB', tisco: 'TISCO', kkp: 'KKP',
    unknown: 'ไม่รู้จัก'
  }[result.bank] || result.bank;

  // ตรวจสอบรายการที่อาจซ้ำ — ใช้ findPotentialDuplicates เพื่อ description similarity ด้วย
  const existingTxs = State.getTransactions();
  const dupMap = new Map(); // index → existing tx ที่ match (top candidate)
  result.transactions.forEach((tx, i) => {
    const candidates = findPotentialDuplicates(
      { amount: tx.amount, date: tx.date, description: tx.description || '' },
      existingTxs
    );
    if (candidates.length > 0) dupMap.set(i, candidates[0].tx);
  });

  // Selection — รายการที่อาจซ้ำเริ่มต้นไม่ถูกเลือก, อื่นๆ เลือกทั้งหมด
  const sel = new Set(result.transactions.map((_, i) => i).filter(i => !dupMap.has(i)));

  // จัดกลุ่มตาม date พร้อม index
  const groups = {};
  result.transactions.forEach((tx, i) => {
    if (!groups[tx.date]) groups[tx.date] = [];
    groups[tx.date].push({ tx, i });
  });
  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  // Summary
  const income = result.transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = result.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const transfer = result.transactions.filter(t => t.type === 'transfer').reduce((s, t) => s + t.amount, 0);
  const dupCount = dupMap.size;

  modal.innerHTML = `
    <div class="review-header">
      <div class="review-title">ตรวจดูก่อนนำเข้า</div>
      <div class="review-sub">
        ${escapeHtml(fileName)} · ${bankLabel}
        ${result.accountInfo?.account_number_masked ? ` · ${result.accountInfo.account_number_masked}` : ''}
        · พบ ${result.transactions.length} รายการ
      </div>
      ${dupCount > 0 ? `<div class="review-dup-warn">⚠️ พบ ${dupCount} รายการที่อาจซ้ำกับที่มีอยู่แล้ว — ยกเลิกการเลือกไว้แล้ว</div>` : ''}
    </div>
    <div class="review-body">
      <!-- Summary -->
      <div class="card card-padded" style="padding: 14px 18px; margin-bottom: 12px;">
        <div class="recur-summary" style="grid-template-columns: 1fr 1fr 1fr;">
          ${income > 0 ? `<div><div class="setting-sub">รายรับ</div><div class="setting-label" style="color: var(--sage)">+${formatBaht(income)} ฿</div></div>` : ''}
          ${expense > 0 ? `<div><div class="setting-sub">รายจ่าย</div><div class="setting-label" style="color: var(--clay)">−${formatBaht(expense)} ฿</div></div>` : ''}
          ${transfer > 0 ? `<div><div class="setting-sub">โอน/ATM</div><div class="setting-label" style="color: var(--dust-blue)">${formatBaht(transfer)} ฿</div></div>` : ''}
        </div>
      </div>

      <!-- Select all toggle -->
      <div class="review-select-all">
        <label class="review-select-all-label">
          <input type="checkbox" id="review-check-all">
          <span>เลือกทั้งหมด</span>
        </label>
        <span class="review-sel-count" id="review-sel-count">${sel.size} / ${result.transactions.length} รายการ</span>
      </div>

      <!-- Transaction list grouped by date -->
      ${sortedDates.map(date => {
        const dayItems = groups[date];
        const d = parseLocalDate(date);
        return `
          <div class="day-group">
            <div class="day-head">
              <div class="day-name">วัน${dayNameTH(d)} <span class="num">ที่ ${d.getDate()}</span></div>
              <div class="day-meta">${monthNameTH(d, true)} ${ceToBe(d.getFullYear())} · ${dayItems.length} รายการ</div>
            </div>
            <div class="card card-padded">
              ${dayItems.map(({ tx, i }) => renderReviewRow(tx, i, dupMap.get(i), sel.has(i))).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="review-footer">
      <button class="cancel" data-action="cancel">ยกเลิก</button>
      <button class="confirm" data-action="confirm" id="review-confirm-btn">นำเข้า (${sel.size} รายการ)</button>
    </div>
  `;

  document.body.appendChild(modal);

  function syncUI() {
    const btn = modal.querySelector('#review-confirm-btn');
    const countEl = modal.querySelector('#review-sel-count');
    btn.textContent = sel.size > 0 ? `นำเข้า (${sel.size} รายการ)` : 'ไม่มีรายการที่เลือก';
    btn.disabled = sel.size === 0;
    if (countEl) countEl.textContent = `${sel.size} / ${result.transactions.length} รายการ`;
    const allCb = modal.querySelector('#review-check-all');
    if (allCb) {
      allCb.checked = sel.size === result.transactions.length;
      allCb.indeterminate = sel.size > 0 && sel.size < result.transactions.length;
    }
  }

  syncUI();

  // Checkbox events (delegate บน body เพื่อจับทุก row)
  modal.querySelector('.review-body').addEventListener('change', e => {
    const cb = e.target.closest('.review-check');
    if (!cb) return;
    const i = parseInt(cb.dataset.idx);
    if (cb.checked) sel.add(i); else sel.delete(i);
    syncUI();
  });

  modal.querySelector('#review-check-all').addEventListener('change', e => {
    if (e.target.checked) {
      result.transactions.forEach((_, i) => sel.add(i));
      modal.querySelectorAll('.review-check').forEach(cb => cb.checked = true);
    } else {
      sel.clear();
      modal.querySelectorAll('.review-check').forEach(cb => cb.checked = false);
    }
    syncUI();
  });

  modal.querySelector('[data-action="cancel"]').addEventListener('click', () => modal.remove());

  modal.querySelector('[data-action="confirm"]').addEventListener('click', () => {
    const selectedTxs = result.transactions.filter((_, i) => sel.has(i));
    confirmImport({ ...result, transactions: selectedTxs });
    modal.remove();
  });
}

function renderReviewRow(tx, idx, matchingTx, isSelected) {
  const isDuplicate = !!matchingTx;
  const def = getCategory(tx.group);
  const sign = tx.type === 'income' ? '+' : (tx.type === 'transfer' ? '↔' : '−');
  const amtClass = tx.type === 'income' ? 'income' : (tx.type === 'transfer' ? 'transfer' : '');
  const isATM = tx.type === 'transfer' && /(?:atm|ถอน|withdraw)/i.test(tx.description || '');

  let compareHtml = '';
  if (matchingTx) {
    const exDef = getCategory(matchingTx.group);
    const exSign = matchingTx.type === 'income' ? '+' : (matchingTx.type === 'transfer' ? '↔' : '−');
    const exAmtClass = matchingTx.type === 'income' ? 'income' : (matchingTx.type === 'transfer' ? 'transfer' : '');
    compareHtml = `
      <div class="dup-compare-row">
        <div class="dup-compare-label">รายการที่มีอยู่แล้ว</div>
        <div class="dup-compare-body">
          <div class="dup-compare-icon" style="background: ${exDef.color}">
            ${svgIcon(exDef.icon, { size: 11, stroke: 2 })}
          </div>
          <div class="dup-compare-info">
            <span class="dup-compare-desc">${escapeHtml(matchingTx.description || exDef.label)}</span>
            <span class="dup-compare-date">${formatShortDate(matchingTx.date)}</span>
          </div>
          <span class="dup-compare-amt ${exAmtClass}">${exSign}${formatBaht(matchingTx.amount)} ฿</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="entry review-entry ${isDuplicate ? 'entry--dup-warn' : ''}">
      <input type="checkbox" class="review-check" data-idx="${idx}" ${isSelected ? 'checked' : ''}>
      <div class="entry-icon" style="background: ${def.color}">
        ${svgIcon(def.icon, { size: 14, stroke: 2 })}
      </div>
      <div class="review-entry-info">
        <div class="entry-name">
          ${escapeHtml(tx.description || def.label)}
          ${isDuplicate ? `<span class="dup-badge">อาจซ้ำกับ ${formatShortDate(matchingTx.date)}</span>` : ''}
          ${isATM ? '<span class="atm-badge">→ เงินสด</span>' : ''}
        </div>
        <div class="entry-cat">${def.label}${tx.balance != null
          ? ` · <span style="color:${tx.balance < 0 ? 'var(--expense,#d96b5e)' : 'inherit'}">คงเหลือ ${formatBaht(tx.balance)} ฿</span>`
          : ''}</div>
      </div>
      <div class="entry-amt ${amtClass}">${sign}${formatBaht(tx.amount)} ฿</div>
      ${compareHtml}
    </div>
  `;
}

function confirmImport(result) {
  // Add/update account if detected
  let _importedAccountId = null;  // เก็บไว้สำหรับ aha-moments trigger
  if (result.accountInfo?.last4 && result.bank !== 'unknown') {
    const accountId = `bank:${result.bank}:${result.accountInfo.last4}`;
    _importedAccountId = accountId;
    const existing = State.getAccount(accountId);
    if (!existing) {
      State.addAccount({
        id: accountId,
        bank: result.bank,
        account_number_masked: result.accountInfo.account_number_masked,
        display_name: `${bankDisplayName(result.bank)} ...${result.accountInfo.last4}`,
        type: 'bank',
        current_balance: result.transactions[0]?.balance || 0
      });
    }
    // ใส่ account_id ใน transactions + route cash flows ให้ถูกทิศ
    for (const tx of result.transactions) {
      tx.account_from = tx.type !== 'income' ? accountId : null;
      tx.account_to   = tx.type === 'income' ? accountId : null;

      const desc = tx.description || '';
      if (tx.type === 'transfer') {
        if (/(?:atm|ถอน|withdraw)/i.test(desc)) {
          // ถอน ATM → เงินออกจากบัญชีธนาคาร เข้ากระเป๋าสด
          tx.account_to = 'cash:default';
        } else if (/(?:cdm|ฝากเงินสด|cash\s*deposit)/i.test(desc)) {
          // ฝากเงินสด/CDM → เงินออกจากกระเป๋าสด เข้าบัญชีธนาคาร
          tx.account_from = 'cash:default';
          tx.account_to   = accountId;
        }
      }
    }
  }

  // ลบ raw_text ก่อน save (ไม่ต้องเก็บใน storage)
  const cleanTxs = result.transactions.map(({ raw_text, ...rest }) => rest);

  // ลบข้อมูลสมมุติออกก่อน import ข้อมูลจริง (ถ้ามี)
  const hadSampleData = State.clearSampleData();
  if (hadSampleData) {
    State.markDemoComplete();
    // ลบ recurring templates ทั้งหมดที่สร้างจาก demo context
    Recurring.getTemplates().forEach(t => Recurring.deleteTemplate(t.id));
  }

  State.addTransactionsBatch(cleanTxs);
  showToast(`นำเข้า ${cleanTxs.length} รายการเรียบร้อย${hadSampleData ? ' (ลบข้อมูลตัวอย่างออกแล้ว)' : ''}`);

  // ไปหน้าบันทึกทันที — ให้เห็นรายการใหม่ที่นำเข้า
  document.querySelector('.nav-item[data-view="list"]')?.click();

  // ตรวจหา recurring patterns อัตโนมัติหลัง import
  const suggestions = Recurring.detectRecurringPatterns(State.getTransactions());
  if (suggestions.length > 0) {
    _recurSuggestions = suggestions;
    setTimeout(() => showToast(`พบ ${suggestions.length} รายการประจำที่น่าตั้งไว้ → ดูใน ตั้งค่า`), 800);
  }

  // Aha-moment screen — แสดงหลัง cash dialog ปิด (ไม่ overlap กัน)
  const triggerAhaMoment = () => {
    import('./aha-moments.js').then(({ showAhaMomentScreen, isFirstPdfForAccount }) => {
      if (isFirstPdfForAccount(_importedAccountId)) {
        showAhaMomentScreen(cleanTxs, _importedAccountId);
      }
    });
  };

  // ถ้ามี ATM → ถามยอดเงินสดก่อน แล้วค่อยแสดง aha-moment หลังปิด
  const hasAtm = cleanTxs.some(t =>
    t.type === 'transfer' && /(?:atm|ถอน|withdraw)/i.test(t.description || '')
  );
  if (hasAtm) {
    const cashAcct = State.getAccounts().find(a => a.type === 'cash' && !a.override_date);
    if (cashAcct) {
      showCashOverrideDialog(cashAcct, triggerAhaMoment);
      return;
    }
  }

  // ไม่มี ATM dialog → แสดง aha-moment โดยตรงหลัง toast
  setTimeout(triggerAhaMoment, 600);
}

function bankDisplayName(bank) {
  return ({
    kbank: 'กสิกร', ktb: 'กรุงไทย', scb: 'ไทยพาณิชย์', bbl: 'กรุงเทพ',
    bay: 'กรุงศรี', ttb: 'ทหารไทย', gsb: 'ออมสิน', baac: 'ธ.ก.ส.',
    ghb: 'ธอส.', cimb: 'CIMB', uob: 'UOB', tisco: 'TISCO', kkp: 'เกียรตินาคิน'
  })[bank] || bank;
}


/** Dialog ถามยอดเงินสดจริงในมือ — แสดงหลัง e-Statement import มี ATM / หรือกด แก้ไข ใน settings */
function showCashOverrideDialog(cashAcct, onClose = null) {
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


function renderBankCell(name, color) {
  return `
    <div class="bank-cell">
      <div class="bank-logo" style="background: ${color}">${name.slice(0, 3)}</div>
      <div class="bank-name">${name}</div>
    </div>
  `;
}


/* ===================================================================
   SETTINGS VIEW
   =================================================================== */
export function renderSettings(container) {
  const settings = State.getSettings();
  const txCount = State.getTransactions().length;
  const acctCount = State.getAccounts().length;

  // สถานะ Drive backup
  const _user = getCurrentUser();
  const _lastDriveBackup = settings.last_drive_backup;
  let driveBackupSub;
  if (!_lastDriveBackup) {
    driveBackupSub = 'ยังไม่ได้สำรอง';
  } else {
    const _dd = Math.floor((Date.now() - new Date(_lastDriveBackup).getTime()) / 86400000);
    driveBackupSub = _dd === 0 ? 'สำรองแล้ววันนี้ ✓' : `สำรองล่าสุด ${_dd} วันที่แล้ว`;
  }
  const theme       = settings.theme || 'diary';
  const darkMode    = settings.dark || false;
  const displayName = settings.display_name || '';

  const THEME_SWATCHES = [
    { val: 'diary',  color: '#e88563', name: 'Diary' },
    { val: 'ocean',  color: '#2e86c1', name: 'Ocean' },
    { val: 'forest', color: '#27ae60', name: 'Forest' },
    { val: 'rose',   color: '#e06880', name: 'Rose' },
    { val: 'citrus', color: '#d4880e', name: 'Citrus' },
    { val: 'violet', color: '#7c5cbf', name: 'Violet' },
    { val: 'carbon', color: '#1e3a72', name: 'Carbon' },
  ];
  const curThemeName = THEME_SWATCHES.find(t => t.val === theme)?.name || 'Diary';

  const progress  = State.getUserProgress();
  const levelInfo = getLevelInfo(progress.xp);
  const pctBar    = Math.round(levelInfo.progress * 100);
  const xpToNext  = levelInfo.next ? levelInfo.next.xp - progress.xp : 0;

  container.innerHTML = `
    <div class="app-bar">
      <h1 class="title">ตั้งค่า</h1>
    </div>

    <!-- Profile card -->
    <div class="profile-card">
      <div class="profile-level-name">${escapeHtml(levelInfo.current.name)}</div>
      <div class="profile-xp-row">
        <span class="profile-xp-cur">${progress.xp.toLocaleString()} XP</span>
        ${levelInfo.next
          ? `<span class="profile-xp-next">อีก ${xpToNext.toLocaleString()} XP → Level ${levelInfo.next.level}</span>`
          : `<span class="profile-xp-next">เลเวลสูงสุด 🏆</span>`}
      </div>
      <div class="profile-xp-bar">
        <div class="profile-xp-fill" style="width: ${pctBar}%"></div>
      </div>
      <div class="profile-coins-row">
        <span class="profile-coin">🥉 ${progress.coins.bronze}</span>
        <span class="profile-coin">🥈 ${progress.coins.silver}</span>
        <span class="profile-coin">🥇 ${progress.coins.gold}</span>
        ${progress.streak_days > 0
          ? `<span class="profile-streak">🔥 ทำมาแล้ว ${progress.streak_days} วัน</span>`
          : ''}
      </div>
    </div>

    <!-- Appearance -->
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">รูปแบบการแสดงผล</h2>
      </div>
      <div class="card">
        <!-- Dark mode toggle -->
        <div class="dark-toggle-row">
          <div class="setting-label">โหมดมืด</div>
          <label class="toggle-switch">
            <input type="checkbox" id="dark-toggle" ${darkMode ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>

        <!-- Theme swatches -->
        <div class="appear-block">
          <div class="appear-block-label">ธีม</div>
          <div class="theme-swatches">
            ${THEME_SWATCHES.map(t => `
              <button class="swatch ${theme === t.val ? 'active' : ''}"
                style="--sw-color: ${t.color}"
                data-action="set-theme" data-val="${t.val}"
                title="${t.name}"></button>
            `).join('')}
          </div>
          <div class="theme-cur-name">${curThemeName}</div>
        </div>

        <!-- ขนาดตัวอักษร (ย้ายมาอยู่ในกลุ่มเดียวกับธีม) -->
        <div class="appear-block">
          <div class="appear-block-label">ขนาดตัวอักษร</div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
            <div class="setting-sub" style="margin:0">Normal · ใหญ่ · ใหญ่มาก</div>
            <div class="text-size-picker" id="text-size-picker">
              <button class="size-btn" data-size="normal" style="font-size:14px">ก</button>
              <button class="size-btn" data-size="large"  style="font-size:17px">ก</button>
              <button class="size-btn" data-size="xlarge" style="font-size:20px">ก</button>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- Threshold + Notification toggles -->
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">การแจ้งเตือน</h2>
      </div>
      <div class="card">
        <div class="setting-row" data-action="edit-threshold">
          <div>
            <div class="setting-label">ยอดต่ำสุดที่เตือน</div>
            <div class="setting-sub">เตือนเมื่อยอดรวม (เงินสด + ธนาคาร) ต่ำกว่าค่านี้</div>
          </div>
          <div class="setting-value">${formatBaht(settings.threshold_satang)} ฿</div>
        </div>
        <div class="setting-divider"></div>
        <div class="setting-row">
          <div>
            <div class="setting-label">รายการประจำครบกำหนด</div>
            <div class="setting-sub">เตือนเมื่อเปิดแอปวันที่ครบกำหนด</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-setting="notify_recurring"
              ${settings.notify_recurring !== false ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <div>
            <div class="setting-label">ยอดใกล้เกณฑ์ต่ำสุด</div>
            <div class="setting-sub">เตือนเมื่อยอดบัญชีต่ำกว่าที่ตั้งไว้</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-setting="notify_low_balance"
              ${settings.notify_low_balance !== false ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <div>
            <div class="setting-label">สรุปประจำสัปดาห์</div>
            <div class="setting-sub">สรุปรายจ่ายสัปดาห์ที่แล้ว ทุกวันจันทร์</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-setting="notify_weekly"
              ${settings.notify_weekly !== false ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>

    <!-- Analytics opt-out -->
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">Privacy</h2>
      </div>
      <div class="card">
        <div class="setting-row">
          <div>
            <div class="setting-label">ส่งข้อมูลใช้งานแบบไม่ระบุตัวตน</div>
            <div class="setting-sub">ช่วยปรับปรุงแอป — ไม่เก็บยอดเงิน รายการ หรือชื่อ</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="analytics-toggle"
              ${!settings.analytics_opt_out ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>

    <!-- Recurring templates -->
    ${renderRecurringSection()}

    <!-- Custom categories -->
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">หมวดหมู่</h2>
      </div>
      <div class="card">
        <div class="setting-row" data-action="open-category-manager" style="cursor:pointer">
          <div>
            <div class="setting-label">จัดการหมวดหมู่</div>
            <div class="setting-sub">เพิ่ม แก้ไข หรือลบหมวดหมู่ที่กำหนดเอง</div>
          </div>
          ${svgIcon('chevron', { size: 18, stroke: 2 })}
        </div>
      </div>
    </div>

    <!-- Data -->
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">ข้อมูล</h2>
      </div>
      <div class="card">
        <div class="setting-row">
          <div>
            <div class="setting-label">บันทึกทั้งหมด</div>
          </div>
          <div class="setting-value">${txCount} รายการ</div>
        </div>
        <div class="setting-row">
          <div>
            <div class="setting-label">บัญชี</div>
          </div>
          <div class="setting-value">${acctCount} บัญชี</div>
        </div>

        <!-- Drive backup -->
        ${_user ? `
        <div class="setting-row" data-action="drive-backup" style="cursor:pointer">
          <div>
            <div class="setting-label">สำรองไปยัง Drive</div>
            <div class="setting-sub" id="drive-backup-sub">${driveBackupSub}</div>
          </div>
          ${svgIcon('cloud-upload', { size: 18, stroke: 2 })}
        </div>
        <div class="setting-row" data-action="drive-restore" style="cursor:pointer">
          <div>
            <div class="setting-label">กู้คืนจาก Drive</div>
            <div class="setting-sub">ดึงไฟล์สำรองจาก Google Drive</div>
          </div>
          ${svgIcon('cloud-download', { size: 18, stroke: 2 })}
        </div>
        ` : `
        <div class="setting-row" style="opacity:0.5">
          <div>
            <div class="setting-label">สำรองไปยัง Drive</div>
            <div class="setting-sub">ลงชื่อเข้าใช้ Google เพื่อใช้งาน</div>
          </div>
          ${svgIcon('cloud-upload', { size: 18, stroke: 2 })}
        </div>
        `}

        <!-- local JSON download (สำรองรอง) -->
        <div class="setting-row" data-action="export-json" style="cursor:pointer">
          <div>
            <div class="setting-label">สำรองเป็นไฟล์</div>
            <div class="setting-sub">ดาวน์โหลด JSON เก็บไว้ในเครื่อง</div>
          </div>
          ${svgIcon('download', { size: 18, stroke: 2 })}
        </div>
        <div class="setting-row" data-action="import-json" style="cursor:pointer">
          <div>
            <div class="setting-label">กู้คืนจากไฟล์</div>
            <div class="setting-sub">เลือกไฟล์ JSON ที่เคยสำรองไว้</div>
          </div>
          ${svgIcon('upload', { size: 18, stroke: 2 })}
        </div>
        <div class="setting-row" data-action="reset-all" style="color: var(--clay);">
          <div>
            <div class="setting-label" style="color: var(--clay);">ลบข้อมูลทั้งหมด</div>
            <div class="setting-sub">ทำให้ยกเลิกไม่ได้ — โปรดสำรองก่อน</div>
          </div>
          ${svgIcon('delete', { size: 18, stroke: 2 })}
        </div>
      </div>
    </div>

    <!-- บัญชีของฉัน -->
    <div id="settings-accounts">${renderAccountsSection()}</div>

    <!-- Privacy info -->
    <div class="privacy-footer" style="margin-top: 22px;">
      ${svgIcon('shield', { size: 18, stroke: 2 })}
      <div class="text">
        <strong>ข้อมูลทั้งหมดอยู่ในเครื่องนี้</strong><br>
        ไม่มีการส่งข้อมูลไปยังเซิร์ฟเวอร์ใดๆ — ลบแอปข้อมูลหายทันที
        แนะนำสำรองข้อมูลทาง Drive หรือ ดาวน์โหลดไฟล์เก็บไว้ เครื่องหายข้อมูลไม่หาย
      </div>
    </div>

    <div class="signoff" style="margin-top: 32px;">— v1.0 · diary mode —<br><span id="sw-version" style="font-size:11px;opacity:0.7"></span></div>

    <!-- Hidden file input สำหรับ import JSON -->
    <input id="json-file-input" type="file" accept="application/json" hidden>
  `;

  // === Bind events ===

  // ── Drive backup helpers (shared between upload/restore buttons) ──
  async function _getDriveModule() {
    return import('./drive.js');
  }
  async function _ensureDriveToken(drive) {
    // ถ้ามี token ใน cache แล้ว ใช้ได้เลย
    if (drive.hasDriveToken()) return true;
    // ถ้า session มี token จาก popup sign-in ในรอบนี้ → ใส่ใน drive module
    const sessionToken = getAccessToken();
    if (sessionToken) { drive.setDriveToken(sessionToken); return true; }
    // ไม่มี token (reload กลับมา) → ต้องขอ token ใหม่ผ่าน popup
    try {
      await drive.requestDriveAccess();
      return true;
    } catch (e) {
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return false;
      throw e;
    }
  }

  // Drive: สำรองตอนนี้
  container.querySelector('[data-action="drive-backup"]')?.addEventListener('click', async () => {
    const btn = container.querySelector('[data-action="drive-backup"]');
    if (btn) btn.style.opacity = '0.5';
    try {
      const drive = await _getDriveModule();
      const ok = await _ensureDriveToken(drive);
      if (!ok) { if (btn) btn.style.opacity = ''; return; }

      showToast('กำลังสำรองข้อมูลไปยัง Drive…');
      const json = State.exportJSON();
      await drive.uploadBackup(json);
      const today = new Date().toISOString().slice(0, 10);
      State.setSetting('last_drive_backup', today);
      const subEl = container.querySelector('#drive-backup-sub');
      if (subEl) subEl.textContent = 'สำรองแล้ววันนี้ ✓';
      showToast('💾 สำรองข้อมูลไปยัง Drive เรียบร้อย ✓');
    } catch (e) {
      console.error('[drive] manual backup failed', e);
      showToast('สำรองไม่สำเร็จ: ' + (e.message ?? e));
    } finally {
      if (btn) btn.style.opacity = '';
    }
  });

  // Drive: กู้คืน
  container.querySelector('[data-action="drive-restore"]')?.addEventListener('click', async () => {
    try {
      const drive = await _getDriveModule();
      const ok = await _ensureDriveToken(drive);
      if (!ok) return;

      showToast('กำลังดาวน์โหลดข้อมูลจาก Drive…');
      const jsonStr = await drive.downloadBackup();
      if (!jsonStr) { showToast('ไม่พบไฟล์สำรองใน Drive'); return; }

      // แสดง dialog ยืนยันก่อน import
      const info = await drive.getBackupInfo().catch(() => null);
      const dateStr = info?.modifiedTime
        ? new Date(info.modifiedTime).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
        : 'ไม่ทราบวันที่';
      const sizeKB = info?.size ? Math.ceil(Number(info.size) / 1024) : '?';

      const overlay = document.createElement('div');
      overlay.className = 'overlay';
      overlay.innerHTML = `
        <div class="acct-modal" style="max-width:340px">
          <div class="acct-modal-head">กู้คืนจาก Drive</div>
          <div class="acct-modal-body" style="font-size:14px;line-height:1.7;color:var(--ink)">
            <p style="margin:0 0 8px">พบไฟล์สำรองใน Google Drive</p>
            <p style="margin:0 0 4px;color:var(--ink-faint);font-size:13px">
              📅 แก้ไขล่าสุด: ${dateStr}<br>
              📦 ขนาด: ${sizeKB} KB
            </p>
            <p style="margin:12px 0 0;color:var(--clay);font-size:13px">
              ⚠️ ข้อมูลปัจจุบันในเครื่องจะถูกแทนที่ด้วยข้อมูลจาก Drive
            </p>
          </div>
          <div class="acct-modal-footer" style="gap:8px">
            <button class="cancel" id="dr-cancel">ยกเลิก</button>
            <button class="add-save" id="dr-ok" style="flex:1">กู้คืน</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      overlay.querySelector('#dr-cancel').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#dr-ok').addEventListener('click', () => {
        overlay.remove();
        if (State.importJSON(jsonStr)) {
          showToast('กู้คืนข้อมูลเรียบร้อย ✓');
        } else {
          showToast('ไม่สามารถกู้คืนได้ — ไฟล์ใน Drive อาจเสียหาย');
        }
      });
    } catch (e) {
      console.error('[drive] restore failed', e);
      showToast('กู้คืนไม่สำเร็จ: ' + (e.message ?? e));
    }
  });

  // แสดงเวอร์ชันจาก Service Worker
  const swVersionEl = container.querySelector('#sw-version');
  if (swVersionEl) {
    const sw = navigator.serviceWorker?.controller;
    if (sw) {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { swVersionEl.textContent = ''; }, 1500);
      channel.port1.onmessage = (e) => {
        clearTimeout(timer);
        if (e.data?.version) swVersionEl.textContent = e.data.version;
      };
      sw.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    }
  }

  container.querySelector('[data-action="export-json"]')?.addEventListener('click', () => {
    const json = State.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diary-finance-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    track('export_used', { format: 'json' });
    showToast('สำรองข้อมูลเรียบร้อย');
  });

  container.querySelector('[data-action="import-json"]')?.addEventListener('click', () => {
    container.querySelector('#json-file-input').click();
  });

  container.querySelector('#json-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    if (State.importJSON(text)) {
      showToast('กู้คืนข้อมูลเรียบร้อย');
    } else {
      showToast('รูปแบบไฟล์ไม่รองรับ — ใช้ไฟล์ JSON ที่สำรองไว้');
    }
  });

  container.querySelector('[data-action="reset-all"]')?.addEventListener('click', () => {
    if (confirm('ลบข้อมูลทั้งหมด ยกเลิกไม่ได้\nโปรดยืนยันอีกครั้ง')) {
      State.resetAll();
      Recurring.getTemplates().forEach(t => Recurring.deleteTemplate(t.id));
      showToast('ลบข้อมูลทั้งหมดแล้ว');
    }
  });

  container.querySelector('[data-action="open-category-manager"]')?.addEventListener('click', () => {
    openCategoryManager();
  });

  // Dark mode toggle
  container.querySelector('#dark-toggle')?.addEventListener('change', (e) => {
    const val = e.target.checked;
    State.setSetting('dark', val);
    applyDark(val);
  });

  // Analytics opt-out toggle
  container.querySelector('#analytics-toggle')?.addEventListener('change', (e) => {
    State.setSetting('analytics_opt_out', !e.target.checked);
  });

  // Notification toggles (notify_recurring, notify_low_balance, notify_weekly)
  container.querySelectorAll('[data-setting^="notify_"]').forEach(input => {
    input.addEventListener('change', (e) => {
      State.setSetting(e.target.dataset.setting, e.target.checked);
    });
  });

  // Theme toggle — State.setSetting → notify() → subscriber → renderCurrentView() อัตโนมัติ
  container.querySelectorAll('[data-action="set-theme"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      State.setSetting('theme', val);
      applyTheme(val);
    });
  });

  // Text size
  const currentSize = State.getSettings().text_size || 'normal';
  container.querySelectorAll('.size-btn[data-size]').forEach(btn => {
    if (btn.dataset.size === currentSize) btn.classList.add('active');
    btn.addEventListener('click', () => {
      container.querySelectorAll('.size-btn[data-size]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.setSetting('text_size', btn.dataset.size);
      applyTextSize(btn.dataset.size);
    });
  });

  container.querySelector('[data-action="edit-threshold"]')?.addEventListener('click', () => {
    const current = State.getSettings().threshold_satang / 100;
    const v = prompt('ยอดต่ำสุดที่เตือน (บาท):', current);
    if (v !== null && !isNaN(Number(v))) {
      State.setSetting('threshold_satang', Math.round(Number(v) * 100));
      showToast('บันทึกแล้ว');
    }
  });

  // Recurring suggestions — เพิ่ม / ข้าม
  container.querySelectorAll('.recur-suggest-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      const s = _recurSuggestions[idx];
      if (!s) return;
      // splice ก่อน addTemplate เพราะ addTemplate trigger re-render ซิงโครนัส
      _recurSuggestions.splice(idx, 1);
      Recurring.addTemplate({
        type:        s.type,
        amount:      s.amount,
        group:       s.group,
        description: s.description,
        frequency:   s.frequency,
        first_due:   s.next_due
      });
      showToast(`เพิ่ม "${s.description}" เป็นรายการประจำแล้ว ✓`);
      // addTemplate → save() → listener → renderCurrentView() (re-render อัตโนมัติ พร้อม _recurSuggestions ที่ splice แล้ว)
    });
  });

  container.querySelectorAll('.recur-suggest-skip').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      _recurSuggestions.splice(idx, 1);
      // re-render settings page โดยตรง (container ยังอยู่ใน scope)
      renderSettings(container);
    });
  });

  // Tap template row → เปิด add modal ใน edit template mode
  container.querySelectorAll('.template-row[data-tmpl-id]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="delete-template"]')) return;
      const tmpl = Recurring.getTemplate(row.dataset.tmplId);
      if (!tmpl) return;
      import('./add.js').then(({ openEditTemplateModal }) => openEditTemplateModal(tmpl));
    });
  });

  // Delete recurring templates
  container.querySelectorAll('[data-action="delete-template"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.tmplId;
      const tmpl = Recurring.getTemplate(id);
      if (!tmpl) return;
      if (confirm(`ลบ "${tmpl.description || 'รายการนี้'}"?\nรายการที่สร้างไปแล้วจะไม่ถูกลบ`)) {
        Recurring.deleteTemplate(id);
        showToast('ลบรายการประจำแล้ว');
      }
    });
  });

  // "open-add" จาก empty state ของรายการประจำ
  container.querySelector('[data-action="open-add"]')?.addEventListener('click', () => {
    document.getElementById('fab')?.click();
  });

  // Toggle share — แสดง share panel (sign in ก่อนถ้ายังไม่ได้ login)
  container.querySelectorAll('[data-action="toggle-share"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const accountId = btn.dataset.accountId;
      const sharePanel = container.querySelector(`.acct-share-panel[data-account-id="${accountId}"]`);
      if (!sharePanel) return;
      if (!getCurrentUser()) {
        try {
          await signInWithGoogle();
          renderSettings(container);
        } catch (e) {
          const code = e?.code || '';
          if (code === 'auth/popup-blocked')
            showToast('Popup ถูกบล็อก — อนุญาต popup ในเบราว์เซอร์แล้วลองใหม่');
          else if (code === 'auth/unauthorized-domain')
            showToast('Domain นี้ยังไม่ได้รับอนุญาตใน Firebase Console');
          else if (code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user')
            showToast('ยกเลิกการลงชื่อเข้าใช้');
          else
            showToast(`ลงชื่อเข้าใช้ไม่สำเร็จ: ${code || e?.message || 'unknown'}`);
          console.error('[sign-in]', e);
          return;
        }
      }
      const isHidden = sharePanel.style.display === 'none';
      sharePanel.style.display = isHidden ? 'block' : 'none';
      btn.classList.toggle('share-active', isHidden);
      if (isHidden) sharePanel.querySelector('.share-email-field')?.focus();
    });
  });

  // Add share email
  container.querySelectorAll('[data-action="add-share-email"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const accountId = btn.dataset.accountId;
      const input = container.querySelector(`.share-email-field[data-account-id="${accountId}"]`);
      const email = (input?.value || '').trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('ตรวจสอบรูปแบบอีเมลอีกครั้ง');
        return;
      }
      const account = State.getAccounts().find(a => a.id === accountId);
      if (!account) return;
      const ownerEmail = getCurrentUser()?.email;
      if (!ownerEmail) { showToast('ลงชื่อเข้าใช้เพื่อแชร์บัญชี'); return; }
      const newList = [...(account.shared_with || []), email];
      try {
        State.updateAccount(accountId, { shared_with: newList });
        if (account.storage === 'local') {
          const txs = State.getTransactions()
            .filter(t => t.account_from === accountId || t.account_to === accountId);
          await migrateAccountToCloud({ ...account, shared_with: newList, owner: ownerEmail }, txs);
          State.updateAccount(accountId, { storage: 'cloud', owner: ownerEmail });
          State.subscribeSharedAccounts();
        }
        await updateSharedWith(accountId, newList);
        showToast(`แชร์บัญชีกับ ${email} แล้ว`);
        renderSettings(container);
      } catch (e) {
        console.error('[share] add failed', e);
        showToast('แชร์ไม่สำเร็จ — ลองใหม่');
      }
    });
  });

  // Remove share email
  container.querySelectorAll('[data-action="remove-share-email"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { accountId, email } = btn.dataset;
      if (!confirm(`หยุดแชร์กับ ${email}?`)) return;
      const account = State.getAccounts().find(a => a.id === accountId);
      if (!account) return;
      const newList = (account.shared_with || []).filter(e => e !== email);
      try {
        // อัปเดต Firestore ก่อนเสมอ — ผู้รับ query array-contains จะหมดสิทธิ์ทันที
        await updateSharedWith(accountId, newList);
        if (newList.length === 0) {
          State.updateAccount(accountId, { storage: 'local', shared_with: [] });
          // ปิด Firestore listener ที่ค้างอยู่สำหรับบัญชีนี้ทันที
          State.subscribeSharedAccounts();
          showToast('หยุดแชร์แล้ว — ข้อมูลยังอยู่บน cloud');
        } else {
          State.updateAccount(accountId, { shared_with: newList });
          showToast(`ลบ ${email} ออกแล้ว`);
        }
        renderSettings(container);
      } catch (e) {
        console.error('[share] remove failed', e);
        showToast('ยกเลิกการแชร์ไม่สำเร็จ — ลองใหม่');
      }
    });
  });

  // ปฏิเสธบัญชีที่แชร์ให้ — ลบตัวเองออกจาก shared_with
  container.querySelectorAll('[data-action="reject-shared-account"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const accountId = btn.dataset.accountId;
      const account = State.getAccounts().find(a => a.id === accountId);
      if (!account) return;
      const myEmail = getCurrentUser()?.email;
      if (!myEmail) { showToast('ลงชื่อเข้าใช้เพื่อจัดการบัญชีแชร์'); return; }
      if (!confirm(`ปฏิเสธบัญชี "${account.display_name}"?\nบัญชีนี้จะไม่แสดงในแอปของคุณอีก`)) return;
      try {
        const newList = (account.shared_with || []).filter(e => e !== myEmail);
        await updateSharedWith(accountId, newList);
        State.removeAccount(accountId);
        showToast('ปฏิเสธบัญชีแล้ว');
        renderSettings(container);
      } catch (e) {
        console.error('[reject-share]', e);
        showToast('ปฏิเสธบัญชีไม่สำเร็จ — ลองใหม่');
      }
    });
  });

  // Display name — บันทึกเมื่อ blur หรือ Enter
  const displayNameInput = container.querySelector('#display-name-input');
  if (displayNameInput) {
    const saveName = () => {
      const val = displayNameInput.value.trim();
      State.setSetting('display_name', val);
    };
    displayNameInput.addEventListener('blur', saveName);
    displayNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') { saveName(); displayNameInput.blur(); } });
  }

  // Google sign-in (สำหรับผู้รับที่ต้องการดูบัญชีที่แชร์)
  container.querySelector('[data-action="google-sign-in"]')?.addEventListener('click', async () => {
    try {
      await signInWithGoogle();
      showToast('ลงชื่อเข้าใช้สำเร็จ');
      renderSettings(container);
    } catch (e) {
      const code = e?.code || '';
      if (code === 'auth/popup-blocked')
        showToast('Popup ถูกบล็อก — อนุญาต popup ในเบราว์เซอร์แล้วลองใหม่');
      else if (code === 'auth/unauthorized-domain')
        showToast('Domain นี้ยังไม่ได้รับอนุญาตใน Firebase Console');
      else if (code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user')
        showToast('ยกเลิกการลงชื่อเข้าใช้');
      else
        showToast(`ลงชื่อเข้าใช้ไม่สำเร็จ: ${code || e?.message || 'unknown'}`);
      console.error('[sign-in]', e);
    }
  });

  // Google sign-out
  container.querySelector('[data-action="google-sign-out"]')?.addEventListener('click', async () => {
    if (!confirm('ออกจากระบบ Google?\nบัญชีที่แชร์กับคุณจะไม่แสดงจนกว่าจะลงชื่อเข้าใหม่')) return;
    try {
      await firebaseSignOut();
      showToast('ออกจากระบบแล้ว');
      renderSettings(container);
    } catch (e) {
      console.error('[sign-out]', e);
      showToast('ออกจากระบบไม่ได้ — ลองใหม่');
    }
  });

  // เพิ่มบัญชีใหม่
  container.querySelector('[data-action="add-account"]')?.addEventListener('click', () => {
    showAccountModal(null, container);
  });

  // แก้ไขบัญชี
  container.querySelectorAll('[data-action="edit-account"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const acct = State.getAccount(btn.dataset.accountId);
      if (acct) showAccountModal(acct, container);
    });
  });

  // ลบบัญชี — dialog 2 ตัวเลือก
  container.querySelectorAll('[data-action="delete-account"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const acct = State.getAccount(btn.dataset.accountId);
      if (!acct) return;
      showDeleteAccountDialog(acct, container);
    });
  });

  // แก้ไขยอดเงินสดเริ่มต้น (cash override)
  container.querySelectorAll('[data-action="edit-cash-override"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const acct = State.getAccount(btn.dataset.accountId);
      if (acct) showCashOverrideDialog(acct);
    });
  });
}


/* ===================================================================
   Helpers
   =================================================================== */

/** Render section บัญชีของฉัน + share controls ใน Settings */
function renderAccountsSection() {
  const accounts = State.getAccounts();
  const currentUser = getCurrentUser();
  const myEmail = currentUser?.email ?? null;
  const displayName = State.getSettings().display_name || '';

  const TYPE_LABEL = {
    bank: 'เงินฝากธนาคาร', cash: 'เงินสด',
    credit_card: 'บัตรเครดิต', ewallet: 'กระเป๋าเงิน',
    investment: 'การลงทุน', debt: 'หนี้สิน'
  };

  // Google account card — sign in / sign out
  const googleCard = currentUser
    ? `<div id="settings-signin" class="card" style="margin-bottom:8px">
        <div class="setting-row">
          <div style="flex:1;min-width:0">
            <div class="setting-label">ลงชื่อเข้าใช้แล้ว</div>
            <div class="setting-sub">${escapeHtml(currentUser.email)}</div>
          </div>
          <button class="setting-seg-btn" data-action="google-sign-out">ออกจากระบบ</button>
        </div>
      </div>`
    : `<div id="settings-signin" class="card" style="margin-bottom:8px">
        <div class="setting-row">
          <div style="flex:1;min-width:0">
            <div class="setting-label">บัญชีที่แชร์กับฉัน</div>
            <div class="setting-sub">ลงชื่อด้วย Google เพื่อแชร์บัญชีหรือดูบัญชีที่ได้รับแชร์</div>
          </div>
          <button class="setting-seg-btn active" data-action="google-sign-in">ลงชื่อเข้าใช้</button>
        </div>
      </div>`;

  // ถ้า sign out (myEmail = null): ไม่สามารถแยก "ของฉัน" vs "ได้รับแชร์" โดยใช้ owner ได้
  // เพราะ owner = 'someone@gmail.com' และ null !== 'someone@gmail.com' = true เสมอ
  // → แสดงทุกบัญชีเป็น "ของฉัน" ทั้งหมด, ส่วน sharedAccounts ว่างเปล่า
  const myAccounts = !myEmail
    ? accounts
    : accounts.filter(a => !(a.storage === 'cloud' && a.owner && a.owner !== myEmail));
  const sharedAccounts = !myEmail
    ? []
    : accounts.filter(a => a.storage === 'cloud' && a.owner && a.owner !== myEmail);

  // แต่ละบัญชีของฉัน
  const acctCards = myAccounts.map(acct => {
    const balance = acct.type === 'cash'
      ? State.getEffectiveCashBalance(acct.id)
      : State.computeAccountBalance(acct.id);
    const typeLabel = TYPE_LABEL[acct.type] || acct.type;
    const initial = acct.bank ? acct.bank.toUpperCase().slice(0, 3) : (ACCT_INIT[acct.type] || '?');
    const isShared = (acct.shared_with || []).length > 0;
    const canShare = !!(myEmail && (acct.owner === myEmail || !acct.owner));

    const emailRows = (acct.shared_with || []).map(em => `
      <div class="acct-share-email-row">
        <span class="share-addr">${escapeHtml(em)}</span>
        <button class="setting-action-btn"
                data-action="remove-share-email"
                data-account-id="${escapeHtml(acct.id)}"
                data-email="${escapeHtml(em)}">ลบออก</button>
      </div>`).join('');

    const sharePanel = `
      <div class="acct-share-panel" data-account-id="${escapeHtml(acct.id)}" style="display:none">
        ${emailRows}
        <div class="share-email-add">
          <input type="email" class="share-email-field" data-account-id="${escapeHtml(acct.id)}"
                 placeholder="Gmail ของอีกคน">
          <button class="setting-seg-btn active"
                  data-action="add-share-email"
                  data-account-id="${escapeHtml(acct.id)}">เพิ่ม</button>
        </div>
      </div>`;

    return `
      <div class="card" style="margin-bottom:6px;overflow:hidden">
        <div class="setting-row">
          <div class="acct-icon ${acct.bank || acct.type}" style="width:36px;height:36px;font-size:10px;flex-shrink:0;margin-right:10px">${initial}</div>
          <div style="flex:1;min-width:0">
            <div class="setting-label" style="font-size:14px">
              ${escapeHtml(acct.display_name)}
              ${isShared ? '<span class="badge-shared">แชร์แล้ว</span>' : ''}
            </div>
            <div class="setting-sub">${typeLabel} · ${formatBaht(balance)} ฿</div>
            ${acct.type === 'cash' && acct.override_date ? `
            <div class="setting-sub" style="font-size:11px;margin-top:2px;display:flex;align-items:center;gap:4px">
              ยอดเริ่มต้น: ${formatBaht(acct.cash_balance_override)} ฿ (${formatShortDate(acct.override_date)})
              <button class="setting-action-btn"
                      style="font-size:11px;padding:2px 8px;margin-left:2px"
                      data-action="edit-cash-override"
                      data-account-id="${escapeHtml(acct.id)}">แก้ไข</button>
            </div>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;align-items:center">
            ${canShare ? `<button class="setting-seg-btn ${isShared ? 'active' : ''}"
                    data-action="toggle-share"
                    data-account-id="${escapeHtml(acct.id)}">แชร์บัญชีนี้</button>` : ''}
            <button class="acct-mgr-btn" data-action="edit-account" data-account-id="${escapeHtml(acct.id)}"
                    title="แก้ไข">${svgIcon('edit', { size: 15, stroke: 2 })}</button>
            <button class="acct-mgr-btn danger" data-action="delete-account" data-account-id="${escapeHtml(acct.id)}"
                    title="ลบ">${svgIcon('delete', { size: 15, stroke: 2 })}</button>
          </div>
        </div>
        ${sharePanel}
      </div>`;
  }).join('');

  // บัญชีที่รับแชร์มา — แสดงแยกด้านล่าง
  const receivedSection = sharedAccounts.length > 0 ? `
    <div style="margin-top:4px">
      <div style="padding:10px 2px 6px;font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:0.08em;font-weight:700">บัญชีที่ได้รับแชร์</div>
      ${sharedAccounts.map(acct => `
        <div class="card" style="margin-bottom:6px">
          <div class="setting-row">
            <div style="flex:1;min-width:0">
              <div class="setting-label">${escapeHtml(acct.display_name)}</div>
              <div class="setting-sub">${TYPE_LABEL[acct.type] || acct.type} · แชร์โดย ${escapeHtml(acct.owner)}</div>
            </div>
            <button class="setting-action-btn"
                    data-action="reject-shared-account"
                    data-account-id="${escapeHtml(acct.id)}">ปฏิเสธ</button>
          </div>
        </div>`).join('')}
    </div>` : '';

  // card ชื่อที่แสดงในรายการ (ย้ายมาจาก section "บัญชีแชร์")
  const displayNameCard = `
    <div class="card" style="margin-bottom:8px">
      <div class="setting-row" style="padding-bottom:6px">
        <div style="flex:1;min-width:0">
          <div class="setting-label">ชื่อที่แสดงในรายการ</div>
          <div class="setting-sub">ชื่อที่แสดงใน "เพิ่มโดย ..." ในบัญชีที่แชร์</div>
        </div>
      </div>
      <div style="padding: 0 0 10px">
        <input id="display-name-input" type="text"
          value="${escapeHtml(displayName)}"
          placeholder="ชื่อเล่น เช่น แม่, พ่อ, ปอ"
          maxlength="30"
          style="width:100%;padding:9px 12px;border:1px solid var(--rule);border-radius:8px;font-size:15px;background:var(--surface);color:var(--ink);box-sizing:border-box">
      </div>
    </div>`;

  return `
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">บัญชีของฉัน</h2>
        <button class="section-action" data-action="add-account">+ เพิ่มบัญชี</button>
      </div>
      ${googleCard}
      ${displayNameCard}
      ${acctCards || '<div class="card"><div class="setting-sub" style="text-align:center;padding:12px">ยังไม่มีบัญชี</div></div>'}
      ${receivedSection}
    </div>`;
}

/** แสดง dialog เลือกวิธีลบบัญชี */
function showDeleteAccountDialog(acct, settingsContainer) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="acct-modal">
      <div class="acct-modal-head">ลบบัญชี "${escapeHtml(acct.display_name)}"</div>
      <div class="acct-modal-body">
        <div class="setting-sub" style="margin-bottom:12px">เลือกวิธีการลบ:</div>
        <button id="del-txs-only" class="acct-type-btn" style="width:100%;text-align:left;padding:12px 14px;border-radius:10px;margin-bottom:8px;display:block">
          <div style="font-weight:600;font-size:14px">ลบเฉพาะรายการ</div>
          <div style="font-size:12px;color:var(--ink-soft);margin-top:2px">บัญชียังคงอยู่ แต่ประวัติรายการทั้งหมดจะถูกลบ</div>
        </button>
        <button id="del-acct-and-txs" class="acct-type-btn" style="width:100%;text-align:left;padding:12px 14px;border-radius:10px;display:block;border-color:var(--clay);color:var(--clay)">
          <div style="font-weight:600;font-size:14px">ลบบัญชีและรายการทั้งหมด</div>
          <div style="font-size:12px;color:var(--ink-soft);margin-top:2px">ลบบัญชีนี้ออกพร้อมรายการที่เกี่ยวข้องทั้งหมด</div>
        </button>
      </div>
      <div class="acct-modal-footer">
        <button class="cancel" id="del-cancel">ยกเลิก</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#del-txs-only').addEventListener('click', () => {
    if (!confirm(`ลบรายการทั้งหมดในบัญชี "${acct.display_name}"?\nบัญชีจะยังคงอยู่แต่ยอดจะเป็น 0`)) return;
    State.removeAccountTransactions(acct.id);
    document.body.removeChild(overlay);
    renderSettings(settingsContainer);
    showToast('ลบรายการทั้งหมดแล้ว');
  });

  overlay.querySelector('#del-acct-and-txs').addEventListener('click', () => {
    if (!confirm(`ลบบัญชี "${acct.display_name}" และรายการทั้งหมด?\nไม่สามารถกู้คืนได้`)) return;
    State.removeAccountWithTransactions(acct.id);
    document.body.removeChild(overlay);
    renderSettings(settingsContainer);
    showToast('ลบบัญชีและรายการแล้ว');
  });

  overlay.querySelector('#del-cancel').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });

  overlay.addEventListener('click', e => {
    if (e.target === overlay) document.body.removeChild(overlay);
  });
}

/** Modal เพิ่ม / แก้ไขบัญชี */
function showAccountModal(existingAcct, settingsContainer) {
  const isEdit = Boolean(existingAcct);
  const settings = State.getSettings();
  const TYPE_OPTIONS = [
    { value: 'cash',        label: 'เงินสด' },
    { value: 'bank',        label: 'เงินฝากธนาคาร' },
    { value: 'credit_card', label: 'บัตรเครดิต' },
    { value: 'ewallet',     label: 'กระเป๋าเงิน' },
    { value: 'investment',  label: 'การลงทุน' },
    { value: 'debt',        label: 'หนี้สิน' },
  ];

  const currentType = existingAcct?.type || 'bank';
  const currentBalance = existingAcct
    ? (existingAcct.current_balance / 100).toFixed(0)
    : '';
  // ประเภทที่มีเลขบัญชี (ใช้ detect inter-account transfer ใน PDF import)
  const HAS_ACCT_NUM = new Set(['bank', 'credit_card', 'ewallet']);
  const showAcctNum = HAS_ACCT_NUM.has(currentType);

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="acct-modal">
      <div class="acct-modal-head">${isEdit ? 'แก้ไขบัญชี' : 'เพิ่มบัญชีใหม่'}</div>
      <div class="acct-modal-body">
        <label class="acct-field-label">ชื่อบัญชี</label>
        <input class="acct-field-input" id="am-name" type="text"
               placeholder="เช่น บัญชีเงินเดือน"
               value="${escapeHtml(existingAcct?.display_name || '')}">

        <label class="acct-field-label">ประเภทบัญชี</label>
        <div class="acct-type-grid">
          ${TYPE_OPTIONS.map(t => `
            <button class="acct-type-btn ${currentType === t.value ? 'active' : ''}"
                    data-type="${t.value}">${t.label}</button>`).join('')}
        </div>

        <div id="am-acctnum-row" style="${showAcctNum ? '' : 'display:none'}">
          <label class="acct-field-label">เลขบัญชี <span style="font-weight:400;color:var(--ink-faint)">(ไม่บังคับ)</span></label>
          <input class="acct-field-input" id="am-acctnum" type="text"
                 inputmode="numeric" placeholder="เช่น 012-3-45678-9"
                 value="${escapeHtml(existingAcct?.account_number_user || '')}">
          <div class="acct-field-hint">ช่วยจับการโอนระหว่างบัญชีตัวเองจาก e-Statement — รองรับทุกรูปแบบ (มี/ไม่มีขีด)</div>
        </div>

        <label class="acct-field-label">ยอดเปิดบัญชี (฿)</label>
        <input class="acct-field-input" id="am-balance" type="number"
               inputmode="numeric" placeholder="0" value="${currentBalance}">
        <div class="acct-field-hint">ยอดตั้งต้นก่อนบันทึกรายการ (ถ้าไม่ใส่ = เริ่มที่ 0)</div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:14px;border-top:1px solid var(--rule)">
          <div>
            <div class="acct-field-label" style="margin-bottom:2px">ไม่นำยอดไปคำนวณสรุป</div>
            <div class="acct-field-hint" style="margin:0">รายการยังแสดงในหน้าบันทึก แต่ไม่นับใน dashboard และสถิติ</div>
          </div>
          <label class="toggle-switch" style="flex-shrink:0;margin-left:12px">
            <input type="checkbox" id="am-exclude" ${existingAcct?.exclude_from_summary ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
      <div class="acct-modal-footer">
        <button class="cancel" id="am-cancel">ยกเลิก</button>
        <button class="confirm" id="am-save">${isEdit ? 'บันทึก' : 'เพิ่มบัญชี'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  let selectedType = currentType;
  const acctNumRow = overlay.querySelector('#am-acctnum-row');
  overlay.querySelectorAll('.acct-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedType = btn.dataset.type;
      overlay.querySelectorAll('.acct-type-btn').forEach(b => b.classList.toggle('active', b === btn));
      acctNumRow.style.display = HAS_ACCT_NUM.has(selectedType) ? '' : 'none';
    });
  });

  overlay.querySelector('#am-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#am-save').addEventListener('click', () => {
    const name = overlay.querySelector('#am-name').value.trim();
    if (!name) { showToast('ใส่ชื่อบัญชีก่อน'); return; }

    const balRaw = overlay.querySelector('#am-balance').value;
    const balSatang = balRaw !== '' ? Math.round(Number(balRaw) * 100) : 0;
    const acctNumUser = (overlay.querySelector('#am-acctnum')?.value || '').trim();
    const excludeFromSummary = overlay.querySelector('#am-exclude').checked;

    if (isEdit) {
      State.updateAccount(existingAcct.id, {
        display_name: name,
        type: selectedType,
        current_balance: balSatang,
        account_number_user: acctNumUser,
        exclude_from_summary: excludeFromSummary,
        user_renamed: true
      });
      showToast('แก้ไขบัญชีแล้ว');
    } else {
      State.addAccount({
        display_name: name,
        type: selectedType,
        current_balance: balSatang,
        account_number_user: acctNumUser,
        exclude_from_summary: excludeFromSummary,
        user_renamed: true
      });
      showToast('เพิ่มบัญชีแล้ว');
    }

    overlay.remove();
    if (settingsContainer) renderSettings(settingsContainer);
  });
}


/** Render suggestion cards จาก detectRecurringPatterns */
function renderRecurringSuggestions() {
  if (_recurSuggestions.length === 0) return '';
  const freqLabel = { monthly: 'ทุกเดือน', weekly: 'ทุกสัปดาห์' };

  return `
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">ตรวจพบรายการประจำ</h2>
        <span class="section-action" style="color:var(--primary)">${_recurSuggestions.length} รายการ</span>
      </div>
      <div class="card card-padded">
        ${_recurSuggestions.map((s, i) => {
          const def = getCategory(s.group);
          const samples = s.sampleDates.map(d => formatShortDate(d)).join(', ');
          return `
            <div class="template-row" style="align-items:flex-start;gap:10px">
              <div class="entry-icon" style="background:${def.color};opacity:0.85;flex-shrink:0">
                ${svgIcon(def.icon, { size: 16, stroke: 2 })}
              </div>
              <div style="flex:1;min-width:0">
                <div class="entry-name">${escapeHtml(s.description)}</div>
                <div class="entry-cat">${freqLabel[s.frequency]} · ${formatBaht(s.amount)} ฿ · เจอ ${s.sampleDates.length}+ ครั้ง</div>
                <div class="entry-cat" style="opacity:0.6">${samples}</div>
              </div>
              <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">
                <button class="recur-suggest-add" data-idx="${i}"
                  style="font-size:12px;padding:4px 12px;border-radius:9999px;border:none;background:var(--primary);color:#fff;cursor:pointer;font-family:inherit">เพิ่ม</button>
                <button class="recur-suggest-skip" data-idx="${i}"
                  style="font-size:12px;padding:4px 12px;border-radius:9999px;border:1.5px solid var(--rule);background:transparent;color:var(--ink-faint);cursor:pointer;font-family:inherit">ข้าม</button>
              </div>
            </div>
          `;
        }).join('<hr style="margin:6px 0;border:none;border-top:1px solid var(--rule)">')}
      </div>
    </div>
  `;
}


/** Render section รายการประจำ + ผ่อน + ล่วงหน้า ใน Settings */
function renderRecurringSection() {
  const templates = Recurring.getActiveTemplates();
  const monthlyTotal = Recurring.getMonthlyRecurringTotal();

  const suggestionsHtml = renderRecurringSuggestions();

  if (templates.length === 0) {
    return `
      ${suggestionsHtml}
      <div class="section" id="recurring-section">
        <div class="section-head">
          <h2 class="section-title">รายการประจำ / ผ่อน</h2>
        </div>
        <div class="card card-padded">
          ${renderEmptyState({
            icon:     'repeat',
            title:    'ยังไม่มีรายการประจำ',
            subtitle: 'กดปุ่ม + แล้วเลือก "ทุกเดือน" หรือ "ผ่อน" เพื่อตั้งค่ารายจ่ายที่เกิดซ้ำ',
            actions:  [{ label: '+ เพิ่มรายการประจำ', style: 'btn-primary', action: 'open-add' }],
          })}
        </div>
      </div>
    `;
  }

  return `
    ${suggestionsHtml}
    <div class="section" id="recurring-section">
      <div class="section-head">
        <h2 class="section-title">รายการประจำ / ผ่อน</h2>
        <span class="section-action">${templates.length} รายการ</span>
      </div>
      <div class="card card-padded">
        ${templates.map(t => renderTemplateRow(t)).join('')}
      </div>
      ${(monthlyTotal.expense > 0 || monthlyTotal.income > 0) ? `
        <div class="card card-padded" style="margin-top: 8px; padding: 12px 18px;">
          <div class="recur-summary">
            <div>
              <div class="setting-sub">รายจ่ายประจำต่อเดือน</div>
              <div class="setting-label" style="color: var(--clay)">−${formatBaht(monthlyTotal.expense)} ฿</div>
            </div>
            ${monthlyTotal.income > 0 ? `
              <div>
                <div class="setting-sub">รายรับประจำต่อเดือน</div>
                <div class="setting-label" style="color: var(--sage)">+${formatBaht(monthlyTotal.income)} ฿</div>
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderTemplateRow(t) {
  const def = getCategory(t.group);
  const sign = t.type === 'income' ? '+' : '−';
  const amtClass = t.type === 'income' ? 'income' : '';

  // Frequency label
  const freqLabel = {
    'one-time':    'ครั้งเดียว',
    'monthly':     'ทุกเดือน',
    'weekly':      'ทุกสัปดาห์',
    'yearly':      'ทุกปี',
    'installment': `ผ่อน ${t.installment_paid}/${t.installment_total} งวด`
  }[t.frequency] || t.frequency;

  const nextLabel = t.next_due
    ? `ครั้งต่อไป ${formatShortDate(t.next_due)}`
    : '—';

  return `
    <div class="template-row" data-tmpl-id="${t.id}">
      <div class="entry-icon" style="background: ${def.color}; opacity: 0.85">
        ${svgIcon(def.icon, { size: 16, stroke: 2 })}
      </div>
      <div class="template-body">
        <div class="entry-name">${escapeHtml(t.description || def.label)}</div>
        <div class="entry-cat">${freqLabel} · ${nextLabel}</div>
      </div>
      <div>
        <div class="entry-amt ${amtClass}">${sign}${formatBaht(t.amount)} ฿</div>
        <button class="template-del" data-action="delete-template" data-tmpl-id="${t.id}" aria-label="ลบ">
          ${svgIcon('delete', { size: 14, stroke: 2 })}
        </button>
      </div>
    </div>
  `;
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

const NAMED_THEMES = ['ocean', 'forest', 'rose', 'citrus', 'violet', 'carbon', 'pro'];

/** Apply theme ลง <html> element */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = NAMED_THEMES.includes(theme) ? theme : '';
}

/** Apply text size ลง <html> element */
export function applyTextSize(size) {
  document.documentElement.dataset.textSize = (size === 'normal' || !size) ? '' : size;
}

/** Apply dark mode ลง <html> element */
export function applyDark(dark) {
  document.documentElement.dataset.dark = dark ? '1' : '';
}

/** แสดง toast — ใช้ across views */
/**
 * แสดง toast notification
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


/* ===================================================================
   Category Manager — หน้าจัดการหมวดหมู่
   =================================================================== */

const MAX_CUSTOM_CATEGORIES = 37; // 50 total - 13 built-in

/** เปิด overlay จัดการหมวดหมู่ */
export function openCategoryManager() {
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
