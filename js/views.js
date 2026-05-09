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
import { svgIcon, CATEGORIES, getCategory } from './icons.js';
import {
  formatBaht, formatLongDate, formatShortDate, formatTime,
  todayISO, parseLocalDate, dayNameTH, monthNameTH, ceToBe, debounce
} from './utils.js';


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

    <!-- Accounts -->
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">บัญชีของฉัน</h2>
        <a class="section-action" data-action="manage-accounts">จัดการ</a>
      </div>
      <div class="card card-padded">
        ${accounts.map(a => renderAccountRow(a, threshold)).join('')}
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

    <!-- Today entries -->
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

    <div class="signoff">— จบหน้าวันนี้ —</div>
  `;
}


/* === Helper: account row ======================================== */
function renderAccountRow(acct, globalThreshold) {
  const threshold = acct.threshold || globalThreshold;
  const isWarn = acct.current_balance < threshold && acct.type !== 'cash';
  const initial = acct.bank ? acct.bank.toUpperCase().slice(0, 3) : (acct.type === 'cash' ? '$' : '?');

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
        <div class="acct-balance">${formatBaht(acct.current_balance)} ฿</div>
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
function renderEntryRow(tx) {
  const def = getCategory(tx.group);
  const time = formatTime(tx.createdAt || tx.date);
  const isIncome = tx.type === 'income';
  const isTransfer = tx.type === 'transfer';
  const sign = isIncome ? '+' : (isTransfer ? '↔' : '−');
  const amtClass = isIncome ? 'income' : (isTransfer ? 'transfer' : '');

  return `
    <div class="entry" data-tx-id="${tx.id}">
      <span class="entry-time">${time}</span>
      <div class="entry-icon" style="background: ${def.color}">
        ${svgIcon(def.icon, { size: 16, stroke: 2 })}
      </div>
      <div>
        <div class="entry-name">${escapeHtml(tx.description || def.label)}</div>
        <div class="entry-cat">${def.label}</div>
      </div>
      <div class="entry-amt ${amtClass}">${sign}${formatBaht(tx.amount)} ฿</div>
    </div>
  `;
}


/* ===================================================================
   LIST VIEW (บันทึก)
   =================================================================== */
let listState = { search: '', filter: 'all' };

export function renderList(container) {
  const filterFn = makeFilterFn(listState);
  const groups = State.getTransactionsByDay(filterFn);

  container.innerHTML = `
    <div class="app-bar">
      <h1 class="title">บันทึกทั้งหมด</h1>
      <button class="icon-btn" data-action="open-filter">
        ${svgIcon('filter', { size: 20 })}
      </button>
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
           <div class="title">ยังไม่มีบันทึก</div>
           <div class="desc">— หน้ากระดาษยังว่างอยู่ —</div>
         </div>`
      : groups.map(g => renderDayGroup(g)).join('')}
  `;

  // === Bind events ===
  const searchInput = container.querySelector('#search-input');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(e => {
      listState.search = e.target.value;
      renderList(container);
      // Refocus หลัง re-render
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
}


function makeFilterFn(state) {
  return (tx) => {
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
        <div class="tile-desc">สแกน PromptPay slip — หรือใบเสร็จกระดาษ</div>
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

    <!-- Hidden file input — trigger จากปุ่ม PDF tile -->
    <input id="pdf-file-input" type="file" accept="application/pdf" hidden>
  `;

  // === Bind events ===
  container.querySelector('[data-action="import-pdf"]')?.addEventListener('click', () => {
    container.querySelector('#pdf-file-input').click();
  });

  container.querySelector('#pdf-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // TODO: เสียบ parsers.js ของ project เดิม
    // import { parsePDF } from './parsers.js';
    // const transactions = await parsePDF(file);
    // State.addTransactionsBatch(transactions);
    showToast('กำลังพัฒนา PDF parser — นำเข้า ' + file.name);
  });

  container.querySelector('[data-action="scan-slip"]')?.addEventListener('click', () => {
    // TODO: เสียบ slip scanner (jsQR สำหรับ PromptPay QR)
    showToast('กำลังพัฒนา slip scanner');
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

  container.innerHTML = `
    <div class="app-bar">
      <h1 class="title">ตั้งค่า</h1>
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

  container.querySelector('[data-action="edit-threshold"]')?.addEventListener('click', () => {
    const current = State.getSettings().threshold_satang / 100;
    const v = prompt('ยอดต่ำสุดที่เตือน (บาท):', current);
    if (v !== null && !isNaN(Number(v))) {
      State.setSetting('threshold_satang', Math.round(Number(v) * 100));
      showToast('บันทึกแล้ว');
    }
  });
}


/* ===================================================================
   Helpers
   =================================================================== */

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
