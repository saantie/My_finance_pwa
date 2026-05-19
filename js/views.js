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
import { svgIcon, CATEGORIES, getCategory } from './icons.js';
import {
  formatBaht, formatLongDate, formatShortDate, formatTime,
  todayISO, parseLocalDate, dayNameTH, monthNameTH, ceToBe, debounce
} from './utils.js';
import { cashflowForecast, dailyExpenseBars } from './chart.js';
import { findPotentialDuplicates } from './duplicate-detector.js';
import {
  signInWithGoogle, signOut as firebaseSignOut, getCurrentUser,
  updateSharedWith, migrateAccountToCloud
} from './firebase.js';


/* === Squiggle SVG (decorative divider) ========================== */
const SQUIGGLE = `<svg class="squiggle" viewBox="0 0 200 12" preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
  <path d="M0 6 Q 10 0, 20 6 T 40 6 T 60 6 T 80 6 T 100 6 T 120 6 T 140 6 T 160 6 T 180 6 T 200 6"/>
</svg>`;


/* ===================================================================
   DASHBOARD VIEW
   =================================================================== */
export function renderDashboard(container) {
  const today = todayISO();
  const todayDate = parseLocalDate(today);
  const monthSummary = State.getMonthSummary();
  const topCats = State.getTopCategories();
  const todayTxs = State.getTodayTransactions();
  const accounts = State.getAccounts();
  const threshold = State.getSettings().threshold_satang;

  // === Hero card ===
  const netSign = monthSummary.net >= 0 ? '+' : '−';
  const netColor = monthSummary.net >= 0 ? 'sage' : 'clay';
  const monthLabel = monthNameTH(todayDate);

  container.innerHTML = `
    <!-- Page header (date as diary opening) -->
    <div class="page-header">
      <div class="page-meta">${monthNameTH(todayDate, true).toUpperCase()} · ${ceToBe(todayDate.getFullYear())}</div>
      <h1 class="page-date">วัน${dayNameTH(todayDate)} <span class="accent">ที่ ${todayDate.getDate()}</span></h1>
      <div class="page-sub">— สมุดบันทึกของฉัน —</div>
    </div>

    ${SQUIGGLE}

    <!-- Hero: month net -->
    <div class="hero">
      <div class="hero-label">เดือน${monthLabel}นี้ฉัน...</div>
      <div class="hero-amount" style="color: var(--${netColor === 'sage' ? 'sage' : 'clay'})">
        <span class="sign">${netSign}</span>
        <span class="num">${formatBaht(Math.abs(monthSummary.net))}</span>
        <span class="unit">฿</span>
      </div>
      <svg class="hero-underline" viewBox="0 0 300 6" preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <path d="M5 3 Q 75 0, 150 3 T 295 3"/>
      </svg>
      <div class="hero-trend">
        ${monthSummary.net >= 0
          ? `เก็บได้แล้ว <strong>${formatBaht(monthSummary.net)} ฿</strong> — ดีกว่าเดือนก่อนเล็กน้อย`
          : `ใช้เกินรายรับ <strong style="color:var(--clay)">${formatBaht(Math.abs(monthSummary.net))} ฿</strong>`}
      </div>

      <!-- Mini stats -->
      <div class="mini-stats">
        <div class="mini-stat">
          <span class="lbl">รายรับ</span>
          <span class="val income">+${formatBaht(monthSummary.income)} ฿</span>
        </div>
        <div class="mini-divider"></div>
        <div class="mini-stat">
          <span class="lbl">รายจ่าย</span>
          <span class="val expense">−${formatBaht(monthSummary.expense)} ฿</span>
        </div>
      </div>
    </div>

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

    <!-- Cashflow forecast: 30 วันข้างหน้า -->
    ${renderForecastChart()}

    <!-- Upcoming recurring/scheduled -->
    ${renderUpcomingSection()}

    <!-- Accounts — แสดงเฉพาะที่มียอดไม่ใช่ศูนย์ หรือมาจาก PDF (มี bank) หรือ user rename แล้ว -->
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">บัญชีของฉัน</h2>
        <a class="section-action" data-action="manage-accounts">จัดการ</a>
      </div>
      <div class="card card-padded">
        ${(() => {
          const visible = accounts.filter(a => {
            const bal = State.computeAccountBalance(a.id);
            return bal !== 0 || a.bank || a.user_renamed;
          });
          if (!visible.length) return `<div class="empty" style="padding:20px 12px;"><div class="desc">— ยังไม่มีบัญชี กด <strong>จัดการ</strong> เพื่อเพิ่ม —</div></div>`;
          return visible.map(a => renderAccountRow(a, threshold)).join('');
        })()}
      </div>
    </div>

    <!-- Top categories -->
    ${topCats.length > 0 ? `
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">ใช้ไปกับอะไร</h2>
      </div>
      <div class="card cats">
        ${topCats.map(c => renderCategoryRow(c)).join('')}
      </div>
    </div>
    ` : ''}

    <div class="signoff">— จบหน้าวันนี้ —</div>
  `;

  bindEntryActions(container);

  // "จัดการ" → navigate ไปหน้า Settings
  container.querySelector('[data-action="manage-accounts"]')?.addEventListener('click', () => {
    document.querySelector('.nav-item[data-view="settings"]')?.click();
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
  const { svg, avg, todayTotal } = dailyExpenseBars(activeTxs, days);

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
    insightHtml = `
      <div class="insight-banner">
        <div class="ic">${svgIcon('trending', { size: 14, stroke: 2.5 })}</div>
        <div class="text">
          ใช้เฉลี่ยวันละ <strong>${formatBaht(avg)} ฿</strong>
          ในช่วง ${days} วันที่ผ่านมา
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


/* === Helper: cashflow forecast chart (30 วันข้างหน้า) =========
   เป้าหมาย: เห็นว่าเงินจะเหลือเท่าไหร่ในอีก 30 วัน
   - เริ่มจาก current balance รวม
   - ลบ recurring/scheduled ที่จะเกิดขึ้น
   - เส้นเฉลี่ยจากรายจ่ายเฉลี่ย 14 วันล่าสุด (เผื่อใช้จ่ายต่อ)
================================================================ */
function renderForecastChart() {
  const accounts = State.getAccounts();
  const totalBalance = accounts.reduce((s, a) => s + State.computeAccountBalance(a.id), 0);
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
        <div>เงินจะใกล้เกณฑ์ในอีก <strong>${result.daysUntilThreshold} วัน</strong> —
          ลองลดรายจ่ายหรือเพิ่มรายรับ</div>
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

  return `
    <div class="entry upcoming">
      <span class="entry-time">${dateLabel}</span>
      <div class="entry-icon" style="background: ${def.color}; opacity: 0.7">
        ${svgIcon(def.icon, { size: 16, stroke: 2 })}
      </div>
      <div>
        <div class="entry-name">${escapeHtml(u.description || def.label)} ${installmentLabel}</div>
        <div class="entry-cat">${def.label} · ประจำ</div>
      </div>
      <div class="entry-amt ${amtClass}">${sign}${formatBaht(u.amount)} ฿</div>
    </div>
  `;
}


/* === Helper: account row ======================================== */
const ACCT_INIT = { cash: '฿', bank: 'BNK', investment: 'INV', debt: 'DEBT', credit_card: 'CC', ewallet: 'EW' };

function renderAccountRow(acct, globalThreshold) {
  const threshold = acct.threshold || globalThreshold;
  const balance = State.computeAccountBalance(acct.id);
  const isWarn = balance < threshold
    && acct.type !== 'cash'
    && acct.type !== 'debt'
    && acct.type !== 'investment'
    && acct.type !== 'credit_card';
  const initial = acct.bank ? acct.bank.toUpperCase().slice(0, 3) : (ACCT_INIT[acct.type] || '?');

  return `
    <div class="acct ${isWarn ? 'warn' : ''}">
      <div class="acct-icon ${acct.bank || acct.type}">${initial}</div>
      <div class="acct-body">
        <div class="acct-name">${escapeHtml(acct.display_name)}</div>
        ${acct.account_number_masked
          ? `<div class="acct-num">${escapeHtml(acct.account_number_masked)}</div>`
          : ''}
      </div>
      <div>
        <div class="acct-balance">${formatBaht(balance)} ฿</div>
        ${isWarn ? `<div class="acct-warn-tag">⚠ ใกล้เกณฑ์</div>` : ''}
      </div>
    </div>
  `;
}


/* === Helper: category breakdown row ============================= */
function renderCategoryRow(c) {
  const def = getCategory(c.group);
  return `
    <div class="cat-row">
      <span class="cat-bullet" style="background: ${def.color}"></span>
      <span class="cat-name">${def.label}</span>
      <span class="cat-amt">${formatBaht(c.total)} ฿ · ${c.percent}%</span>
      <div class="cat-bar-wrap">
        <div class="cat-bar"><div class="cat-bar-fill" style="width: ${c.percent}%; background: ${def.color}"></div></div>
      </div>
    </div>
  `;
}


/* === Helper: entry row (transaction) ============================ */
function shortName(email) {
  if (!email) return null;
  return email.split('@')[0];
}

function renderEntryRow(tx) {
  const def = getCategory(tx.group);
  const time = formatTime(tx.createdAt || tx.date);
  const isIncome = tx.type === 'income';
  const isTransfer = tx.type === 'transfer';
  const sign = isIncome ? '+' : (isTransfer ? '↔' : '−');
  const amtClass = isIncome ? 'income' : (isTransfer ? 'transfer' : '');
  const isDeleted = tx.deleted_by != null;

  const authorNote = isDeleted
    ? `<div class="entry-author">ลบโดย ${escapeHtml(shortName(tx.deleted_by))}</div>`
    : (tx.created_by
        ? `<div class="entry-author">เพิ่มโดย ${escapeHtml(shortName(tx.created_by))}</div>`
        : '');

  return `
    <div class="entry${isDeleted ? ' entry-deleted' : ''}" data-tx-id="${tx.id}">
      <span class="entry-time">${time}</span>
      <div class="entry-icon" style="background: ${def.color}">
        ${svgIcon(def.icon, { size: 16, stroke: 2 })}
      </div>
      <div class="entry-body">
        <div class="entry-name">${escapeHtml(tx.description || def.label)}</div>
        <div class="entry-cat">${def.label}</div>
        ${authorNote}
      </div>
      <div class="entry-right">
        <div class="entry-amt ${amtClass}">${sign}${formatBaht(tx.amount)} ฿</div>
        <div class="entry-actions">
          ${isDeleted ? '' : `<button class="entry-action-btn" data-action="edit-tx" data-tx-id="${tx.id}" aria-label="แก้ไข">${svgIcon('edit', { size: 13, stroke: 2 })}</button>`}
          <button class="entry-action-btn del" data-action="delete-tx" data-tx-id="${tx.id}" aria-label="${isDeleted ? 'ลบถาวร' : 'ลบ'}" title="${isDeleted ? 'ลบถาวร' : 'ลบ'}">${svgIcon('delete', { size: 13, stroke: 2 })}</button>
        </div>
      </div>
    </div>
  `;
}

/** Bind edit/delete actions บน container ที่มี entry rows */
export function bindEntryActions(container) {
  container.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-action="edit-tx"]');
    const delBtn  = e.target.closest('[data-action="delete-tx"]');

    if (editBtn) {
      const id = editBtn.dataset.txId;
      const tx = State.getTransactions().find(t => t.id === id);
      if (!tx) return;
      const { openEditModal } = await import('./add.js');
      openEditModal(tx);
    }

    if (delBtn) {
      const id = delBtn.dataset.txId;
      const tx = State.getTransactions().find(t => t.id === id);
      if (!tx) return;
      const desc = tx.description || getCategory(tx.group).label;
      if (!confirm(`ลบ "${desc}"?`)) return;
      State.deleteTransaction(id);
      showToast('ลบรายการแล้ว');
    }
  });
}


/* ===================================================================
   LIST VIEW (บันทึก)
   =================================================================== */
let listState = { search: '', filter: 'all', month: todayISO().slice(0, 7) };

export function renderList(container) {
  const filterFn = makeFilterFn(listState);
  const groups = State.getTransactionsByDay(filterFn);

  // Month label: "พฤษภาคม 2568"
  const [mYear, mMonth] = listState.month.split('-').map(Number);
  const mDate = new Date(mYear, mMonth - 1, 1);
  const monthLabel = `${monthNameTH(mDate)} ${ceToBe(mDate.getFullYear())}`;
  const isCurrentMonth = listState.month === todayISO().slice(0, 7);

  container.innerHTML = `
    <div class="app-bar">
      <h1 class="title">บันทึกทั้งหมด</h1>
    </div>

    <div class="month-nav">
      <button class="month-nav-btn" data-action="prev-month"><span class="flip-h">${svgIcon('chevron', { size: 16, stroke: 2.5 })}</span></button>
      <span class="month-nav-label">${monthLabel}</span>
      <button class="month-nav-btn${isCurrentMonth ? ' disabled' : ''}" data-action="next-month"${isCurrentMonth ? ' disabled' : ''}>${svgIcon('chevron', { size: 16, stroke: 2.5 })}</button>
    </div>

    <div class="search-bar">
      ${svgIcon('search', { size: 16, stroke: 2 })}
      <input id="search-input" type="text" placeholder="ค้นหาบันทึก..." value="${escapeHtml(listState.search)}">
    </div>

    <div class="filter-chips">
      <button class="chip ${listState.filter === 'all' ? 'active' : ''}" data-filter="all">ทั้งหมด</button>
      <button class="chip ${listState.filter === 'expense' ? 'active' : ''}" data-filter="expense">รายจ่าย</button>
      <button class="chip ${listState.filter === 'income' ? 'active' : ''}" data-filter="income">รายรับ</button>
      <button class="chip ${listState.filter === 'transfer' ? 'active' : ''}" data-filter="transfer">โอน</button>
    </div>

    ${groups.length === 0
      ? `<div class="empty">
           <div class="icon">📖</div>
           <div class="title">ไม่มีรายการในเดือนนี้</div>
           <div class="desc">— ลองเลื่อนไปเดือนอื่น หรือเพิ่มรายการใหม่ —</div>
         </div>`
      : groups.map(g => renderDayGroup(g)).join('')}
  `;

  // === Bind events ===
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
        ${g.transactions.map(t => renderEntryRow(t)).join('')}
      </div>
    </div>
  `;
}


/* ===================================================================
   IMPORT VIEW (PDF / Slip)
   =================================================================== */
export function renderImport(container) {
  container.innerHTML = `
    <div class="import-header">
      <div class="import-title">นำเข้า<span class="accent"> รายการ</span></div>
      <div class="import-sub">เลือกวิธีที่สะดวก — รวบยอดเดือน หรือสแกนทีละรายการ</div>
    </div>

    <!-- 2-tile selector: PDF / Slip -->
    <div class="tile-grid">
      <div class="import-tile pdf" data-action="import-pdf">
        <div class="tile-icon">
          ${svgIcon('pdf', { size: 26, stroke: 1.6 })}
          <span class="badge">PDF</span>
        </div>
        <div class="tile-title">e-Statement</div>
        <div class="tile-desc">ลาก PDF จากแอปธนาคาร — รวบทั้งเดือน</div>
        <button class="tile-btn">เลือกไฟล์</button>
      </div>

      <div class="import-tile slip" data-action="scan-slip">
        <div class="tile-icon">
          ${svgIcon('camera', { size: 26, stroke: 1.6 })}
          <span class="badge">SCAN</span>
        </div>
        <div class="tile-title">Slip / ใบเสร็จ</div>
        <div class="tile-desc">สแกน QR บน slip โอน — หรือเลือกรูปจากเครื่อง</div>
        <button class="tile-btn">เปิดกล้อง</button>
      </div>
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
        PDF, slip และรายการทั้งหมดประมวลผลในเครื่อง — ไม่ส่งออกไปไหน
      </div>
    </div>

    <!-- Hidden file inputs -->
    <input id="pdf-file-input" type="file" accept="application/pdf" hidden>
    <!-- capture="environment" → mobile เปิดกล้องหลังตรงๆ; desktop ใช้ file picker -->
    <input id="slip-file-input" type="file" accept="image/*" capture="environment" hidden>
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

  container.querySelector('[data-action="scan-slip"]')?.addEventListener('click', () => {
    container.querySelector('#slip-file-input').click();
  });

  container.querySelector('#slip-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';   // reset
    await handleSlipScan(file);
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


/* === PDF import handler ========================================
   Flow: parse (handle password) → confidence check → review / AI
================================================================ */
async function handlePdfImport(file) {
  const { parsePDF, scoreParseResult } = await import('./parsers.js');
  let result;

  // ── first attempt ──────────────────────────────────────────────
  const prog1 = createProgressModal('กำลังประมวลผล PDF');
  document.body.appendChild(prog1.el);
  try {
    result = await parsePDF(file, null, step => prog1.update(step));
    prog1.el.remove();
  } catch (err) {
    prog1.el.remove();
    if (err.name !== 'PasswordException') {
      console.error('PDF parse failed', err);
      showToast('อ่าน PDF ไม่สำเร็จ: ' + (err.message || 'unknown'));
      return;
    }

    // ── password prompt ──────────────────────────────────────────
    const password = prompt('PDF นี้มีรหัสผ่าน กรุณาใส่รหัส:');
    if (!password) return;

    // ── retry with password ──────────────────────────────────────
    const prog2 = createProgressModal('กำลังประมวลผล PDF');
    document.body.appendChild(prog2.el);
    try {
      result = await parsePDF(file, password, step => prog2.update(step));
      prog2.el.remove();
    } catch (err2) {
      prog2.el.remove();
      if (err2.name === 'PasswordException') {
        showToast('รหัสผ่านไม่ถูกต้อง ลองใหม่อีกครั้ง');
      } else {
        console.error('PDF parse failed', err2);
        showToast('อ่าน PDF ไม่สำเร็จ: ' + (err2.message || 'unknown'));
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
      `(ข้อความจาก PDF จะถูกส่งไปยัง Google AI)`
    );
    if (useAI) {
      await handleGeminiFallback(result.extractedText);
      return;
    }
  }

  showReviewModal(result, file.name);
}


/* === Gemini AI fallback =========================================
   ส่ง extractedText (plain text จาก PDF) แทนไฟล์ PDF โดยตรง
   เพราะ PDF เข้ารหัสส่ง Gemini ไม่ได้
================================================================ */
async function handleGeminiFallback(extractedText) {
  showToast('Gemini AI fallback — จะพัฒนาในเวอร์ชันต่อไป');
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
        <div class="entry-cat">${def.label}${tx.balance != null ? ` · คงเหลือ ${formatBaht(tx.balance)} ฿` : ''}</div>
      </div>
      <div class="entry-amt ${amtClass}">${sign}${formatBaht(tx.amount)} ฿</div>
      ${compareHtml}
    </div>
  `;
}

function confirmImport(result) {
  // Add/update account if detected
  if (result.accountInfo?.last4 && result.bank !== 'unknown') {
    const accountId = `bank:${result.bank}:${result.accountInfo.last4}`;
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

  State.addTransactionsBatch(cleanTxs);
  showToast(`นำเข้า ${cleanTxs.length} รายการเรียบร้อย`);
}

function bankDisplayName(bank) {
  return ({
    kbank: 'กสิกร', ktb: 'กรุงไทย', scb: 'ไทยพาณิชย์', bbl: 'กรุงเทพ',
    bay: 'กรุงศรี', ttb: 'ทหารไทย', gsb: 'ออมสิน', baac: 'ธ.ก.ส.',
    ghb: 'ธอส.', cimb: 'CIMB', uob: 'UOB', tisco: 'TISCO', kkp: 'เกียรตินาคิน'
  })[bank] || bank;
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
  const theme       = settings.theme || 'diary';
  const textSize    = settings.text_size || 'normal';
  const darkMode    = settings.dark || false;
  const displayName = settings.display_name || '';

  const THEME_SWATCHES = [
    { val: 'diary',  color: '#e88563', name: 'Diary' },
    { val: 'ocean',  color: '#2e86c1', name: 'Ocean' },
    { val: 'forest', color: '#27ae60', name: 'Forest' },
    { val: 'rose',   color: '#e06880', name: 'Rose' },
    { val: 'slate',  color: '#5a7fb5', name: 'Slate' },
    { val: 'citrus', color: '#d4880e', name: 'Citrus' },
    { val: 'violet', color: '#7c5cbf', name: 'Violet' },
  ];
  const curThemeName = THEME_SWATCHES.find(t => t.val === theme)?.name || 'Diary';

  container.innerHTML = `
    <div class="app-bar">
      <h1 class="title">ตั้งค่า</h1>
    </div>

    <!-- ชื่อที่แสดงในบัญชีแชร์ -->
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">บัญชีแชร์</h2>
      </div>
      <div class="card">
        <div class="setting-row">
          <div style="flex:1;min-width:0">
            <div class="setting-label">ชื่อที่แสดงในรายการ</div>
            <div class="setting-sub">แสดงใต้รายการในบัญชีที่แชร์ว่า "เพิ่มโดย ..."</div>
          </div>
        </div>
        <div style="padding: 0 0 10px">
          <input id="display-name-input" type="text"
            value="${escapeHtml(displayName)}"
            placeholder="ชื่อเล่น เช่น แม่, พ่อ, ปอ"
            maxlength="30"
            style="width:100%;padding:9px 12px;border:1px solid var(--rule);border-radius:8px;font-size:15px;background:var(--surface);color:var(--ink);box-sizing:border-box">
        </div>
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

        <!-- Text size -->
        <div class="appear-block">
          <div class="appear-block-label">ขนาดตัวอักษร</div>
          <div class="text-size-btns">
            <button class="size-btn ${textSize === 'normal'  ? 'active' : ''}" data-action="set-text-size" data-val="normal">
              <span class="size-ก" style="font-size: 16px">ก</span>
              <span class="size-lbl">ปกติ</span>
            </button>
            <button class="size-btn ${textSize === 'large'   ? 'active' : ''}" data-action="set-text-size" data-val="large">
              <span class="size-ก" style="font-size: 20px">ก</span>
              <span class="size-lbl">ใหญ่</span>
            </button>
            <button class="size-btn ${textSize === 'xlarge'  ? 'active' : ''}" data-action="set-text-size" data-val="xlarge">
              <span class="size-ก" style="font-size: 24px">ก</span>
              <span class="size-lbl">ใหญ่มาก</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Threshold -->
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">การแจ้งเตือน</h2>
      </div>
      <div class="card">
        <div class="setting-row" data-action="edit-threshold">
          <div>
            <div class="setting-label">ยอดต่ำสุดที่เตือน</div>
            <div class="setting-sub">เตือนเมื่อบัญชีต่ำกว่าค่านี้</div>
          </div>
          <div class="setting-value">${formatBaht(settings.threshold_satang)} ฿</div>
        </div>
      </div>
    </div>

    <!-- Recurring templates -->
    ${renderRecurringSection()}

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
        <div class="setting-row" data-action="export-json">
          <div>
            <div class="setting-label">สำรองข้อมูล (JSON)</div>
            <div class="setting-sub">ดาวน์โหลดไฟล์เก็บไว้</div>
          </div>
          ${svgIcon('download', { size: 18, stroke: 2 })}
        </div>
        <div class="setting-row" data-action="import-json">
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
    ${renderAccountsSection()}

    <!-- Privacy info -->
    <div class="privacy-footer" style="margin-top: 22px;">
      ${svgIcon('shield', { size: 18, stroke: 2 })}
      <div class="text">
        <strong>ข้อมูลทั้งหมดอยู่ในเครื่องนี้</strong><br>
        ไม่มีการส่งข้อมูลไปยังเซิร์ฟเวอร์ใดๆ — ลบแอปข้อมูลหายทันที
        แนะนำให้สำรองเป็นไฟล์ JSON เก็บไว้
      </div>
    </div>

    <div class="signoff" style="margin-top: 32px;">— v1.0 · diary mode —</div>

    <!-- Hidden file input สำหรับ import JSON -->
    <input id="json-file-input" type="file" accept="application/json" hidden>
  `;

  // === Bind events ===
  container.querySelector('[data-action="export-json"]')?.addEventListener('click', () => {
    const json = State.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diary-finance-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
      showToast('ไฟล์ไม่ถูกต้อง');
    }
  });

  container.querySelector('[data-action="reset-all"]')?.addEventListener('click', () => {
    if (confirm('ลบข้อมูลทั้งหมด ยกเลิกไม่ได้\nโปรดยืนยันอีกครั้ง')) {
      State.resetAll();
      showToast('ลบข้อมูลทั้งหมดแล้ว');
    }
  });

  // Dark mode toggle
  container.querySelector('#dark-toggle')?.addEventListener('change', (e) => {
    const val = e.target.checked;
    State.setSetting('dark', val);
    applyDark(val);
  });

  // Theme toggle — State.setSetting → notify() → subscriber → renderCurrentView() อัตโนมัติ
  container.querySelectorAll('[data-action="set-theme"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      State.setSetting('theme', val);
      applyTheme(val);
    });
  });

  // Text size — เช่นเดียวกัน ไม่ต้อง renderSettings ซ้ำ
  container.querySelectorAll('[data-action="set-text-size"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      State.setSetting('text_size', val);
      applyTextSize(val);
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
        // Recurring.deleteTemplate → notify() → Recurring.subscribe → renderCurrentView()
      }
    });
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
        showToast('รูปแบบอีเมลไม่ถูกต้อง');
        return;
      }
      const account = State.getAccounts().find(a => a.id === accountId);
      if (!account) return;
      const ownerEmail = getCurrentUser()?.email;
      if (!ownerEmail) { showToast('ต้องลงชื่อเข้าใช้ก่อน'); return; }
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
        showToast(`เกิดข้อผิดพลาด: ${e?.code || e?.message || 'unknown'}`);
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
          showToast('หยุดแชร์แล้ว — ข้อมูลยังอยู่บน cloud');
        } else {
          State.updateAccount(accountId, { shared_with: newList });
          showToast(`ลบ ${email} ออกแล้ว`);
        }
        renderSettings(container);
      } catch (e) {
        console.error('[share] remove failed', e);
        showToast('เกิดข้อผิดพลาด — ลองใหม่อีกครั้ง');
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
      if (!myEmail) { showToast('ต้องลงชื่อเข้าใช้ก่อน'); return; }
      if (!confirm(`ปฏิเสธบัญชี "${account.display_name}"?\nบัญชีนี้จะไม่แสดงในแอปของคุณอีก`)) return;
      try {
        const newList = (account.shared_with || []).filter(e => e !== myEmail);
        await updateSharedWith(accountId, newList);
        State.removeAccount(accountId);
        showToast('ปฏิเสธบัญชีแล้ว');
        renderSettings(container);
      } catch (e) {
        console.error('[reject-share]', e);
        showToast(`เกิดข้อผิดพลาด: ${e?.code || e?.message || 'unknown'}`);
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
      showToast('ออกจากระบบไม่สำเร็จ');
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
}


/* ===================================================================
   Helpers
   =================================================================== */

/** Render section บัญชีของฉัน + share controls ใน Settings */
function renderAccountsSection() {
  const accounts = State.getAccounts();
  const currentUser = getCurrentUser();
  const myEmail = currentUser?.email ?? null;

  const TYPE_LABEL = {
    bank: 'เงินฝากธนาคาร', cash: 'เงินสด',
    credit_card: 'บัตรเครดิต', ewallet: 'กระเป๋าเงิน',
    investment: 'การลงทุน', debt: 'หนี้สิน'
  };

  // Google account card — sign in / sign out
  const googleCard = currentUser
    ? `<div class="card" style="margin-bottom:8px">
        <div class="setting-row">
          <div style="flex:1;min-width:0">
            <div class="setting-label">ลงชื่อเข้าใช้แล้ว</div>
            <div class="setting-sub">${escapeHtml(currentUser.email)}</div>
          </div>
          <button class="setting-seg-btn" data-action="google-sign-out">ออกจากระบบ</button>
        </div>
      </div>`
    : `<div class="card" style="margin-bottom:8px">
        <div class="setting-row">
          <div style="flex:1;min-width:0">
            <div class="setting-label">บัญชีที่แชร์กับฉัน</div>
            <div class="setting-sub">ลงชื่อด้วย Google เพื่อแชร์บัญชีหรือดูบัญชีที่ได้รับแชร์</div>
          </div>
          <button class="setting-seg-btn active" data-action="google-sign-in">ลงชื่อเข้าใช้</button>
        </div>
      </div>`;

  const myAccounts = accounts.filter(a => !(a.storage === 'cloud' && a.owner && a.owner !== myEmail));
  const sharedAccounts = accounts.filter(a => a.storage === 'cloud' && a.owner && a.owner !== myEmail);

  // แต่ละบัญชีของฉัน
  const acctCards = myAccounts.map(acct => {
    const balance = State.computeAccountBalance(acct.id);
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

  return `
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">บัญชีของฉัน</h2>
        <button class="section-action" data-action="add-account">+ เพิ่มบัญชี</button>
      </div>
      ${googleCard}
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
  const currentThreshold = existingAcct?.threshold
    ? (existingAcct.threshold / 100).toFixed(0)
    : '';

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

        <label class="acct-field-label">ยอดเปิดบัญชี (฿)</label>
        <input class="acct-field-input" id="am-balance" type="number"
               inputmode="numeric" placeholder="0" value="${currentBalance}">
        <div class="acct-field-hint">ยอดตั้งต้นก่อนบันทึกรายการ (ถ้าไม่ใส่ = เริ่มที่ 0)</div>

        <label class="acct-field-label">เกณฑ์แจ้งเตือน (฿)</label>
        <input class="acct-field-input" id="am-threshold" type="number"
               inputmode="numeric"
               placeholder="${(settings.threshold_satang / 100).toFixed(0)}"
               value="${currentThreshold}">
        <div class="acct-field-hint">เตือนเมื่อยอดต่ำกว่าค่านี้ (เว้นว่าง = ใช้ค่า global ${formatBaht(settings.threshold_satang)} ฿)</div>
      </div>
      <div class="acct-modal-footer">
        <button class="cancel" id="am-cancel">ยกเลิก</button>
        <button class="confirm" id="am-save">${isEdit ? 'บันทึก' : 'เพิ่มบัญชี'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  let selectedType = currentType;
  overlay.querySelectorAll('.acct-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedType = btn.dataset.type;
      overlay.querySelectorAll('.acct-type-btn').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  overlay.querySelector('#am-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#am-save').addEventListener('click', () => {
    const name = overlay.querySelector('#am-name').value.trim();
    if (!name) { showToast('ใส่ชื่อบัญชีก่อน'); return; }

    const balRaw = overlay.querySelector('#am-balance').value;
    const balSatang = balRaw !== '' ? Math.round(Number(balRaw) * 100) : 0;
    const thrRaw = overlay.querySelector('#am-threshold').value;
    const thrSatang = thrRaw !== '' ? Math.round(Number(thrRaw) * 100) : settings.threshold_satang;

    if (isEdit) {
      State.updateAccount(existingAcct.id, {
        display_name: name,
        type: selectedType,
        current_balance: balSatang,
        threshold: thrSatang,
        user_renamed: true
      });
      showToast('แก้ไขบัญชีแล้ว');
    } else {
      State.addAccount({
        display_name: name,
        type: selectedType,
        current_balance: balSatang,
        threshold: thrSatang,
        user_renamed: true
      });
      showToast('เพิ่มบัญชีแล้ว');
    }

    overlay.remove();
    if (settingsContainer) renderSettings(settingsContainer);
  });
}


/** Render section รายการประจำ + ผ่อน + ล่วงหน้า ใน Settings */
function renderRecurringSection() {
  const templates = Recurring.getActiveTemplates();
  const monthlyTotal = Recurring.getMonthlyRecurringTotal();

  if (templates.length === 0) {
    return `
      <div class="section">
        <div class="section-head">
          <h2 class="section-title">รายการประจำ / ผ่อน</h2>
        </div>
        <div class="card card-padded">
          <div class="empty" style="padding: 18px;">
            <div class="desc">— ยังไม่มีรายการประจำ —</div>
            <div class="setting-sub" style="margin-top: 6px;">
              กดปุ่ม + แล้วเลือก "ทุกเดือน" หรือ "ผ่อน"
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="section">
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

const NAMED_THEMES = ['ocean', 'forest', 'rose', 'slate', 'citrus', 'violet', 'pro'];

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
export function showToast(message) {
  const container = document.getElementById('toast');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
