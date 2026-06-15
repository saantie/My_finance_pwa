/* ===================================================================
   views-list.js — LIST VIEW (บันทึก) — Phase B cluster
   ===================================================================
   เดือน selector + filter chips + search + รายการจัดกลุ่มตามวัน
   entry-row (renderEntryRow/bindEntryActions) มาจาก views-shared.js
   =================================================================== */

import * as State from './state.js';
import { svgIcon, getCategory } from './icons.js';
import {
  formatBaht, todayISO, parseLocalDate, ceToBe, monthNameTH, dayNameTH, debounce
} from './utils.js';
import { renderEmptyState, renderEntryRow, bindEntryActions, escapeHtml } from './views-shared.js';

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
