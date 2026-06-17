/* ===================================================================
   views-dashboard.js — DASHBOARD (หน้าแรก) — Phase B cluster
   ===================================================================
   hero card + area chart, spending chart, forecast 30 วัน, upcoming,
   donut "ใช้ไปกับอะไร". chart state (Chart.js) อยู่ในไฟล์นี้
   entry-row/empty-state มาจาก views-shared; setSettingsOpenSection จาก views-settings
   =================================================================== */

import * as State from './state.js';
import * as Recurring from './recurring.js';
import { svgIcon, getCategory } from './icons.js';
import {
  formatBaht, formatLongDate, formatShortDate, todayISO, parseLocalDate,
  dayNameTH, monthNameTH, ceToBe, offsetDateISO
} from './utils.js';
import { dailyExpenseBars } from './chart.js';
import { track } from './analytics.js';
import { checkCatchupOpportunity, dismissCatchup } from './catchup.js';
import { getDemoTransactions, getDemoRecurringTemplates } from './demo-data.js';
import {
  renderEmptyState, escapeHtml, renderEntryRow, bindEntryActions
} from './views-shared.js';
import { setSettingsOpenSection } from './views-settings.js';


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

      <!-- 4. Date labels — มีคำว่า "วันที่" + "สิ้นเดือน" กำกับหัวท้าย
           ให้อ่านรู้ทันทีว่าเป็นวันของเดือน ไม่ใช่เลขลอยๆ -->
      <div class="hero-date-labels">
        <span>วันที่ 1</span><span>7</span><span>14</span><span>21</span><span>สิ้นเดือน</span>
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
          callbacks: {
            title: items => `วันที่ ${items[0]?.label ?? ''}`,
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y ?? '—'}%`,
          },
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
      getDemoRecurringTemplates().forEach(t => Recurring.addTemplate(t));
      showToast('ใส่ข้อมูลตัวอย่างแล้ว — ลองสำรวจแอปได้เลย');
    });
    return;
  }

  const today = todayISO();
  const todayDate = parseLocalDate(today);
  const monthSummary = State.getMonthSummary();
  // ใช้ all-time ตัดสินว่ามี section donut ไหม — ช่วงเวลาที่แสดงจริงเลือกผ่าน chips
  const topCats = State.getTopCategories('');
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

    <!-- Top categories (donut + เลือกช่วงเวลา) -->
    ${topCats.length > 0 ? `
    <div class="section" id="donut-section">
      ${renderDonutSection()}
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
        ${svgIcon('download', { size: 15, stroke: 2 })}ดาวน์โหลด .xlsx
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
      Recurring.getTemplates().filter(t => t._sample).forEach(t => Recurring.deleteTemplate(t.id));
      State.markDemoComplete();
      showToast('พร้อมแล้ว — เริ่มบันทึกข้อมูลจริงได้เลย');
    }
  });

  // "จัดการ" ในส่วนรายการล่วงหน้า → navigate ไปหน้า Settings ส่วนรายการประจำ
  container.querySelector('[data-action="view-recurring"]')?.addEventListener('click', () => {
    setSettingsOpenSection('recurring');   // เปิด accordion ก่อน render
    document.querySelector('.nav-item[data-view="settings"]')?.click();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.querySelector('.settings-acc[data-acc="recurring"]')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  });

  // Donut "ใช้ไปกับอะไร" — chips เลือกช่วงเวลา
  bindDonutChips(container);

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
          <span class="fl-item"><span class="fl-line primary"></span>เงินที่คาดว่าจะเหลือ</span>
        </div>

        <div class="forecast-chart-wrap">
          <canvas id="forecastChart30"
            aria-label="กราฟยอดเงินคาดการณ์ 30 วัน เริ่มต้น ${formatBaht(days[0]?.balance ?? 0)} บาท ต่ำสุด ${formatBaht(minBalance)} บาท">
          </canvas>
        </div>

        ${dangerDays.length > 0 ? `
        <div class="forecast-warning">
          ⚠️ คาดว่ายอดจะต่ำกว่าเกณฑ์ที่ตั้งไว้ ${dangerDays.length} วัน
          (เริ่มวันที่ ${dangerDays[0].date.slice(8, 10)}/${dangerDays[0].date.slice(5, 7)})
        </div>` : ''}

        <div class="forecast-note">
          <div class="forecast-note-text">
            คาดการณ์จากการใช้เงินจริงของคุณช่วง <b>${dataSource === 'year' ? daysElapsed : 30} วัน</b>ที่ผ่านมา —
            ${varDailyIncome > 0 ? `มีเงินเข้าเฉลี่ยวันละ <b>${formatBaht(varDailyIncome)} ฿</b> ` : ''}ปกติใช้จ่ายทั่วไปเฉลี่ยวันละ <b>${formatBaht(avgDailyExpense)} ฿</b> และรายการจ่ายประจำของคุณ (เช่น ค่าเช่า ผ่อน) ตามวันครบกำหนด
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

  const { days } = _forecastChartPayload;

  const balanceData    = days.map(d => Math.round(d.balance / 100));       // → บาท

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
          label: 'เงินที่คาดว่าจะเหลือ',
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
            label: ctx => `เงินที่คาดว่าจะเหลือ: ${ctx.parsed.y.toLocaleString()} ฿`,
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

  // ตรวจว่าเป็น template ตัวอย่าง หรือผูกกับ sample account
  const isDemo = u._sample === true || (u.account_id
    ? State.getAccount(u.account_id)?._sample === true
    : false);
  const demoTag = isDemo ? ' <span class="demo-tag">Demo</span>' : '';

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





/* === Helper: category donut chart ================================ */

/* ── ช่วงเวลาของ donut "ใช้ไปกับอะไร" (module-level — รอด re-render) ── */
let _donutPeriod = 'month';
const DONUT_PERIODS = [
  ['today', 'วันนี้'], ['month', 'เดือนนี้'], ['year', 'ปีนี้'], ['all', 'ทั้งหมด']
];

/** prefix สำหรับ getTopCategories — filter ใช้ date.startsWith(prefix) */
function donutPrefix(period) {
  const t = todayISO();
  if (period === 'today') return t;             // YYYY-MM-DD
  if (period === 'month') return t.slice(0, 7); // YYYY-MM
  if (period === 'year')  return t.slice(0, 4); // YYYY
  return '';                                    // all — ทุกรายการ
}

function renderDonutSection() {
  const breakdown = State.getExpenseBreakdown(donutPrefix(_donutPeriod));
  const periodLabel = DONUT_PERIODS.find(p => p[0] === _donutPeriod)?.[1] ?? '';
  return `
    <div class="section-head">
      <h2 class="section-title">ใช้ไปกับอะไร</h2>
    </div>
    <div class="donut-chips">
      ${DONUT_PERIODS.map(([val, label]) => `
        <button class="chip ${_donutPeriod === val ? 'active' : ''}" data-donut-period="${val}">
          <span class="chip-label">${label}</span>
        </button>
      `).join('')}
    </div>
    <div class="card donut-card">
      ${breakdown.grandTotal > 0
        ? renderDonutChart(breakdown)
        : `<div class="empty" style="padding:18px;text-align:center">
             <div class="desc">— ยังไม่มีรายจ่าย${_donutPeriod === 'all' ? '' : periodLabel} —</div>
           </div>`}
    </div>`;
}

function bindDonutChips(container) {
  container.querySelectorAll('[data-donut-period]').forEach(chip => {
    chip.addEventListener('click', () => {
      _donutPeriod = chip.dataset.donutPeriod;
      const mount = container.querySelector('#donut-section');
      if (!mount) return;
      mount.innerHTML = renderDonutSection();   // อัปเดตเฉพาะ section นี้ ไม่ re-render ทั้งหน้า
      bindDonutChips(container);
    });
  });
}

function renderDonutChart(breakdown) {
  const r = 38, cx = 50, cy = 50;
  const totalCirc = 2 * Math.PI * r;
  const grandTotal = breakdown.grandTotal || 0;

  // หมวดมีชื่อ + ก้อน "อื่นๆ" (รวม uncategorized + หางที่ตัด) → วงรวมเป็น 100% เสมอ
  const slices = [...breakdown.cats];
  if (breakdown.otherTotal > 0) {
    slices.push({
      group: 'other',
      total: breakdown.otherTotal,
      percent: grandTotal > 0 ? Math.round((breakdown.otherTotal / grandTotal) * 100) : 0,
    });
  }

  let cumLen = 0;
  const segs = slices.map(c => {
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
