/* ===================================================================
   export.js — Excel multi-sheet report
   ===================================================================
   - openExportDialog()      : เปิด period picker modal
   - exportToExcel(opts)     : สร้าง + download .xlsx
   - resolvePeriod(id, el)   : แปลง preset → { from, to }
   - generateFilename(f, t)  : ชื่อไฟล์ภาษาไทย
   - enumerateMonths(f, t)   : array 'YYYY-MM' ระหว่าง 2 วันที่
   - normalizeMerchant(desc) : ตัด branch/number suffix
   =================================================================== */

import * as State from './state.js';
import * as Recurring from './recurring.js';
import { todayISO, formatBaht, ceToBe, monthNameTH, parseLocalDate } from './utils.js';
import { svgIcon } from './icons.js';


/* === 1. Lazy-load xlsx-js-style ================================== */

let _xlsx = null;

async function loadXlsx() {
  if (_xlsx) return _xlsx;
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/+esm');
    _xlsx = mod.default || mod;
    _xlsx._hasStyling = true;
  } catch {
    // fallback ไม่มี styling
    const mod = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
    _xlsx = mod.default || mod;
    _xlsx._hasStyling = false;
  }
  return _xlsx;
}


/* === 2. Period Picker Dialog ====================================== */

const PRESET_PERIODS = [
  { id: 'this-month',   label: 'เดือนนี้' },
  { id: 'last-month',   label: 'เดือนที่แล้ว' },
  { id: 'this-quarter', label: 'ไตรมาสนี้' },
  { id: 'this-year',    label: 'ปีนี้' },
  { id: 'last-year',    label: 'ปีที่แล้ว' },
  { id: 'all',          label: 'ทั้งหมด' },
  { id: 'custom',       label: 'กำหนดเอง' },
];

export function openExportDialog() {
  const accounts = State.getAccounts().filter(a => !a.archived);
  const today    = todayISO();
  const txs      = State.getTransactions();
  const earliest = txs.length > 0 ? [...txs].map(t => t.date).sort()[0] : today;

  const el = document.createElement('div');
  el.className = 'export-modal-wrap';
  el.innerHTML = `
    <div class="export-modal-overlay" data-action="close-export"></div>
    <div class="export-modal-sheet">
      <div class="export-modal-head">
        <div class="export-modal-title">ส่งออก Excel</div>
        <button class="export-modal-close" data-action="close-export" aria-label="ปิด">
          ${svgIcon('close', { size: 18, stroke: 2 })}
        </button>
      </div>
      <div class="export-modal-body">

        <div class="export-section">
          <div class="export-section-label">ช่วงข้อมูล</div>
          <div class="export-period-chips">
            ${PRESET_PERIODS.map(p => `
              <button class="export-period-chip ${p.id === 'this-year' ? 'active' : ''}"
                      data-preset="${p.id}">${p.label}</button>
            `).join('')}
          </div>
          <div class="export-custom-range" id="export-custom-range" style="display:none">
            <label class="export-date-label">
              <span>เริ่ม / From</span>
              <input type="date" id="export-from" value="${earliest}" min="${earliest}" max="${today}">
            </label>
            <label class="export-date-label">
              <span>สิ้นสุด / To</span>
              <input type="date" id="export-to"   value="${today}"   min="${earliest}" max="${today}">
            </label>
          </div>
        </div>

        <div class="export-section">
          <div class="export-section-label">บัญชีที่จะรวม</div>
          <div class="export-account-list">
            ${accounts.length
              ? accounts.map(a => `
                  <label class="export-acct-check">
                    <input type="checkbox" value="${a.id}" checked>
                    <span>${a.display_name}</span>
                  </label>`).join('')
              : '<div class="export-empty-note">ยังไม่มีบัญชี</div>'}
          </div>
        </div>

        <div class="export-info-box">
          <div class="export-info-row">
            <span>รายการ:</span>
            <span id="export-info-count">—</span>
          </div>
          <div class="export-info-row">
            <span>ขนาดไฟล์ประมาณ:</span>
            <span id="export-info-size">—</span>
          </div>
          <div class="export-info-row export-warn-row" id="export-warn-row" style="display:none">
            <span>⚠️ ไฟล์อาจใหญ่มาก (> 5 ปี)</span>
          </div>
        </div>

      </div>
      <div class="export-modal-foot">
        <button class="btn-ghost" data-action="close-export">ยกเลิก</button>
        <button class="btn-primary" id="export-submit-btn" data-action="do-export">
          ${svgIcon('download', { size: 16, stroke: 2 })}
          ส่งออก
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  let currentPreset = 'this-year';

  function getSelectedAccounts() {
    return [...el.querySelectorAll('.export-acct-check input:checked')].map(cb => cb.value);
  }

  function updateInfo() {
    const period     = resolvePeriod(currentPreset, el);
    const accountIds = getSelectedAccounts();
    const filtered   = State.getTransactions().filter(t => {
      if (t.date < period.from || t.date > period.to) return false;
      // รวม tx ที่ไม่มีบัญชี (unattributed) เสมอ; tx มีบัญชี → ตรวจว่าอยู่ใน selection
      const noAccount = !t.account_from && !t.account_to;
      return noAccount || accountIds.includes(t.account_from) || accountIds.includes(t.account_to);
    });
    const count  = filtered.length;
    const sizeKB = Math.round(count * 0.12 + 20);
    el.querySelector('#export-info-count').textContent = `${count} รายการ`;
    el.querySelector('#export-info-size').textContent  = `~${sizeKB} KB`;

    // disable export ถ้าไม่มีรายการหรือไม่มีบัญชี
    const btn = el.querySelector('#export-submit-btn');
    btn.disabled = count === 0 || accountIds.length === 0;

    // warn ถ้า period > 5 ปี
    const fromDate = new Date(period.from);
    const toDate   = new Date(period.to);
    const years    = (toDate - fromDate) / (365.25 * 24 * 3600 * 1000);
    el.querySelector('#export-warn-row').style.display = years > 5 ? '' : 'none';
  }

  // Period chip selection
  el.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPreset = btn.dataset.preset;
      el.querySelector('#export-custom-range').style.display =
        currentPreset === 'custom' ? '' : 'none';
      updateInfo();
    });
  });

  el.querySelector('#export-from')?.addEventListener('change', updateInfo);
  el.querySelector('#export-to')?.addEventListener('change',   updateInfo);
  el.querySelectorAll('.export-acct-check input').forEach(cb => {
    cb.addEventListener('change', updateInfo);
  });

  // Close
  el.querySelectorAll('[data-action="close-export"]').forEach(btn => {
    btn.addEventListener('click', () => el.remove());
  });

  // Export
  el.querySelector('[data-action="do-export"]').addEventListener('click', async () => {
    const period     = resolvePeriod(currentPreset, el);
    if (period.from > period.to) { alert('วันที่เริ่มต้องน้อยกว่าวันที่สิ้นสุด'); return; }
    const accountIds = getSelectedAccounts();
    if (accountIds.length === 0) { alert('เลือกอย่างน้อย 1 บัญชี'); return; }

    const btn = el.querySelector('#export-submit-btn');
    btn.disabled = true;
    btn.innerHTML = 'กำลังสร้างไฟล์...';

    try {
      await exportToExcel({ from: period.from, to: period.to, accountIds });
      el.remove();
    } catch (err) {
      console.error('[export]', err);
      alert('ส่งออกไม่สำเร็จ: ' + (err.message || err));
      btn.disabled = false;
      btn.innerHTML = `${svgIcon('download', { size: 16, stroke: 2 })} ส่งออก`;
    }
  });

  updateInfo();
}


/* === 3. Period helpers =========================================== */

export function resolvePeriod(presetId, el) {
  const today = todayISO();
  const now   = new Date();
  const y     = now.getFullYear();
  const m     = now.getMonth() + 1;

  switch (presetId) {
    case 'this-month':
      return { from: `${y}-${String(m).padStart(2, '0')}-01`, to: today };

    case 'last-month': {
      const ly = m === 1 ? y - 1 : y;
      const lm = m === 1 ? 12    : m - 1;
      const lastDay = new Date(ly, lm, 0).getDate();
      return {
        from: `${ly}-${String(lm).padStart(2, '0')}-01`,
        to:   `${ly}-${String(lm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      };
    }

    case 'this-quarter': {
      const qStart = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: `${y}-${String(qStart).padStart(2, '0')}-01`, to: today };
    }

    case 'this-year':
      return { from: `${y}-01-01`, to: today };

    case 'last-year':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };

    case 'all':
      return { from: '2000-01-01', to: today };

    case 'custom': {
      const fromVal = el?.querySelector('#export-from')?.value || today;
      const toVal   = el?.querySelector('#export-to')?.value   || today;
      return { from: fromVal, to: toVal };
    }

    default:
      return { from: `${y}-01-01`, to: today };
  }
}

export function generateFilename(from, to) {
  const fromBe = ceToBe(parseInt(from.slice(0, 4)));
  // full-year range (Jan 1 → Dec 31 of same year)
  if (from.slice(0, 4) === to.slice(0, 4) && from.slice(5, 7) === '01' && to.slice(5, 7) === '12') {
    return `รายงานการเงิน_${fromBe}.xlsx`;
  }
  return `รายงานการเงิน_${from}_ถึง_${to}.xlsx`;
}

export function enumerateMonths(from, to) {
  const result = [];
  let [fy, fm] = from.slice(0, 7).split('-').map(Number);
  const [ty, tm] = to.slice(0, 7).split('-').map(Number);
  while (fy < ty || (fy === ty && fm <= tm)) {
    result.push(`${fy}-${String(fm).padStart(2, '0')}`);
    fm++;
    if (fm > 12) { fm = 1; fy++; }
  }
  return result;
}

export function normalizeMerchant(desc) {
  return (desc || '')
    .replace(/\s+สาขา.*$/i, '')
    .replace(/\s+\d{3,}.*$/, '')
    .replace(/\s+#\w+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}


/* === 4. Main export entry ======================================== */

export async function exportToExcel({ from, to, accountIds }) {
  const XLSX = await loadXlsx();

  const allTxs = State.getTransactions();
  const txs = allTxs
    .filter(t => t.date >= from && t.date <= to)
    .filter(t => {
      const noAccount = !t.account_from && !t.account_to;
      return noAccount || accountIds.includes(t.account_from) || accountIds.includes(t.account_to);
    })
    .sort((a, b) =>
      a.date.localeCompare(b.date) ||
      (a.createdAt || '').localeCompare(b.createdAt || '')
    );

  if (txs.length === 0) throw new Error('ไม่มีรายการในช่วงที่เลือก');

  const accounts  = State.getAccounts().filter(a => accountIds.includes(a.id));
  const recurring = Recurring.getTemplates();

  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title:       `รายงานการเงิน ${from} ถึง ${to}`,
    Author:      'บันทึกการเงิน',
    CreatedDate: new Date(),
  };

  XLSX.utils.book_append_sheet(wb, buildSheet1(XLSX, { txs, accounts, from, to }),              'ภาพรวม');
  XLSX.utils.book_append_sheet(wb, buildSheet2(XLSX, { txs, accounts }),                        'รายการ');
  XLSX.utils.book_append_sheet(wb, buildSheet3(XLSX, { txs, from, to }),                        'รายเดือน');
  XLSX.utils.book_append_sheet(wb, buildSheet4(XLSX, { txs }),                                  'หมวดหมู่');
  XLSX.utils.book_append_sheet(wb, buildSheet5(XLSX, { txs, accounts }),                        'บัญชี');
  XLSX.utils.book_append_sheet(wb, buildSheet6Recurring(XLSX, { recurring, accounts }),         'รายการประจำ');
  XLSX.utils.book_append_sheet(wb, buildSheet7Merchants(XLSX, { txs }),                         'ร้านค้า');

  const cmpSheet = buildSheet8Comparison(XLSX, { allTxs, from, to });
  if (cmpSheet) XLSX.utils.book_append_sheet(wb, cmpSheet, 'เปรียบเทียบ');

  XLSX.writeFile(wb, generateFilename(from, to), { bookType: 'xlsx', compression: true });
}


/* === 5. Sheet 1 — ภาพรวม / Overview ============================= */

function buildSheet1(XLSX, { txs, accounts, from, to }) {
  const income  = _sumByType(txs, 'income');
  const expense = _sumByType(txs, 'expense');
  const net     = income - expense;
  const savPct  = income > 0 ? +((net / income) * 100).toFixed(1) : 0;

  const acctRows = accounts.map(a => {
    const bal = a.type === 'cash'
      ? State.getEffectiveCashBalance(a.id)
      : State.computeAccountBalance(a.id);
    return [a.display_name, bal / 100];
  });

  const topCats = Object.entries(
    _groupBySum(txs.filter(t => t.type === 'expense'), 'group')
  )
    .map(([g, v]) => ({ group: g, total: v / 100 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const aoa = [
    ['รายงานการเงิน / Financial Report'],
    [`รอบรายงาน: ${from}  ถึง  ${to}`],
    [`สร้างเมื่อ: ${_fmtDateThai(todayISO())} ${new Date().toLocaleTimeString('th-TH')}`],
    [],
    ['ภาพรวม / Overview', ''],
    ['รายการ / Item', 'ยอด (฿)'],
    ['รายรับรวม / Total Income',  income  / 100],
    ['รายจ่ายรวม / Total Expense', expense / 100],
    ['สุทธิ / Net',               net     / 100],
    ['อัตราการออม / Savings Rate', savPct],
    [],
    ['ยอดบัญชี ณ ปัจจุบัน / Account Balances', ''],
    ['บัญชี / Account', 'ยอด (฿)'],
    ...acctRows,
    [],
    ['5 หมวดสูงสุด / Top 5 Categories', '', ''],
    ['#', 'หมวด / Category', 'ยอด (฿)'],
    ...topCats.map((c, i) => [i + 1, c.group, c.total]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 35 }, { wch: 18 }, { wch: 14 }];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 2 } },
    { s: { r: 11, c: 0 }, e: { r: 11, c: 2 } },
    { s: { r: 14 + acctRows.length, c: 0 }, e: { r: 14 + acctRows.length, c: 2 } },
  ];

  if (XLSX._hasStyling) {
    _styleTitle(ws, 'A1');
    _styleSub(ws, 'A2'); _styleSub(ws, 'A3');
    _styleSecHead(ws, 'A5');
    _styleHeaders(ws, ['A6', 'B6']);
    _styleSecHead(ws, 'A12');
    _styleHeaders(ws, ['A13', 'B13']);
    _styleSecHead(ws, _addr(14 + acctRows.length, 0));
    const catHeaderRow = 15 + acctRows.length;
    _styleHeaders(ws, [_addr(catHeaderRow, 0), _addr(catHeaderRow, 1), _addr(catHeaderRow, 2)]);
    _fmtNum(XLSX, ws, `B7:B10`);
    _fmtNum(XLSX, ws, `B14:B${13 + acctRows.length}`);
    _fmtNum(XLSX, ws, `C${catHeaderRow + 1}:C${catHeaderRow + topCats.length}`);
  }
  return ws;
}


/* === 6. Sheet 2 — รายการ / Transactions ========================= */

function buildSheet2(XLSX, { txs, accounts }) {
  const acctMap = new Map(accounts.map(a => [a.id, a]));
  const DAYS    = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const TYPE_LBL  = { income: 'รายรับ', expense: 'รายจ่าย', transfer: 'โอน' };
  const SRC_LBL   = { import: 'PDF', manual: 'บันทึกเอง', voice: 'เสียง', sheet: 'Sheet' };

  const headers = [
    '#', 'วันที่ / Date', 'วัน', 'ประเภท / Type', 'จำนวน / Amount (฿)',
    'หมวด / Category', 'หมวดย่อย / Group', 'รายละเอียด / Description',
    'บัญชีต้นทาง / From', 'บัญชีปลายทาง / To', 'ธนาคาร / Bank', 'หมายเหตุ', 'ที่มา',
  ];

  const rows = txs.map((t, i) => {
    const fromA = acctMap.get(t.account_from);
    const toA   = acctMap.get(t.account_to);
    const d = parseLocalDate(t.date);
    return [
      i + 1, t.date, DAYS[d.getDay()], TYPE_LBL[t.type] || t.type,
      t.amount / 100,
      t.category || '', t.group || '', t.description || '',
      fromA?.display_name || '', toA?.display_name || '',
      fromA?.bank || toA?.bank || '',
      t.note || '', SRC_LBL[t.source] || t.source || '',
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 5 }, { wch: 12 }, { wch: 5 }, { wch: 10 }, { wch: 14 },
    { wch: 18 }, { wch: 14 }, { wch: 38 },
    { wch: 22 }, { wch: 22 }, { wch: 10 }, { wch: 22 }, { wch: 12 },
  ];
  ws['!freeze']     = { xSplit: 0, ySplit: 1 };
  ws['!autofilter'] = { ref: `A1:M${rows.length + 1}` };

  if (XLSX._hasStyling) {
    _styleHeaders(ws, headers.map((_, c) => _addr(0, c)));
    _fmtNum(XLSX, ws, `E2:E${rows.length + 1}`);
    // row colors by type
    const COLORS = { รายรับ: 'E8F5E9', รายจ่าย: 'FFEBEE', โอน: 'E3F2FD' };
    for (let r = 1; r <= rows.length; r++) {
      const typeCell = ws[_addr(r, 3)];
      const rgb = COLORS[typeCell?.v];
      if (!rgb) continue;
      for (let c = 0; c < headers.length; c++) {
        const a = _addr(r, c);
        if (!ws[a]) continue;
        ws[a].s = { ...(ws[a].s || {}), fill: { fgColor: { rgb } } };
      }
    }
  }
  return ws;
}


/* === 7. Sheet 3 — รายเดือน / Monthly ============================ */

function buildSheet3(XLSX, { txs, from, to }) {
  const months = enumerateMonths(from, to);
  let running  = 0;

  const rows = months.map(ym => {
    const mTxs   = txs.filter(t => t.date.startsWith(ym));
    const inc    = _sumByType(mTxs, 'income')  / 100;
    const exp    = _sumByType(mTxs, 'expense') / 100;
    const net    = inc - exp;
    running     += net;
    const [y, m] = ym.split('-').map(Number);
    const label  = `${monthNameTH(new Date(y, m - 1, 1))} ${ceToBe(y)}`;
    return [label, ym, inc, exp, net, +running.toFixed(2), mTxs.length];
  });

  const totInc = rows.reduce((s, r) => s + r[2], 0);
  const totExp = rows.reduce((s, r) => s + r[3], 0);
  const totCnt = rows.reduce((s, r) => s + r[6], 0);

  const headers = [
    'เดือน / Month', 'YYYY-MM',
    'รายรับ / Income (฿)', 'รายจ่าย / Expense (฿)',
    'สุทธิ / Net (฿)', 'สะสม / Running (฿)', 'จำนวน / Count',
  ];

  const ws = XLSX.utils.aoa_to_sheet([
    headers, ...rows,
    ['รวม / Total', '', totInc, totExp, totInc - totExp, '', totCnt],
  ]);
  ws['!cols']   = [{ wch: 22 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 }];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  if (XLSX._hasStyling) {
    _styleHeaders(ws, headers.map((_, c) => _addr(0, c)));
    _styleTotalRow(ws, rows.length + 1, headers.length);
    _fmtNum(XLSX, ws, `C2:F${rows.length + 2}`);
  }
  return ws;
}


/* === 8. Sheet 4 — หมวดหมู่ / Categories ========================= */

function buildSheet4(XLSX, { txs }) {
  const expTxs  = txs.filter(t => t.type === 'expense');
  const totExp  = expTxs.reduce((s, t) => s + t.amount, 0);
  const grouped = _groupBy(expTxs, t => t.group || 'other');

  const rows = Object.entries(grouped)
    .map(([group, items]) => {
      const tot = items.reduce((s, t) => s + t.amount, 0);
      const avg = items.length ? tot / items.length : 0;
      const pct = totExp > 0 ? +(tot / totExp * 100).toFixed(2) : 0;
      return [group, items.length, tot / 100, avg / 100, pct];
    })
    .sort((a, b) => b[2] - a[2]);

  const headers = [
    'หมวด / Group', 'จำนวน / Count',
    'ยอดรวม / Total (฿)', 'เฉลี่ย / Avg (฿)', '% รายจ่าย',
  ];
  const ws = XLSX.utils.aoa_to_sheet([
    headers, ...rows,
    ['รวม / Total', rows.reduce((s, r) => s + r[1], 0), totExp / 100, '', 100.0],
  ]);
  ws['!cols']   = [{ wch: 20 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 12 }];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  if (XLSX._hasStyling) {
    _styleHeaders(ws, headers.map((_, c) => _addr(0, c)));
    _styleTotalRow(ws, rows.length + 1, headers.length);
    _fmtNum(XLSX, ws, `C2:D${rows.length + 2}`);
  }
  return ws;
}


/* === 9. Sheet 5 — บัญชี / Accounts ============================== */

function buildSheet5(XLSX, { txs, accounts }) {
  const TYPE_LBL = {
    bank: 'ออมทรัพย์', cash: 'เงินสด',
    credit_card: 'บัตรเครดิต', ewallet: 'eWallet',
    investment: 'ลงทุน', debt: 'หนี้สิน',
  };
  const rows = accounts.map(a => {
    const acctTxs = txs.filter(t => t.account_from === a.id || t.account_to === a.id);
    const inflow  = acctTxs.filter(t => t.account_to   === a.id).reduce((s, t) => s + t.amount, 0);
    const outflow = acctTxs.filter(t => t.account_from === a.id).reduce((s, t) => s + t.amount, 0);
    const closing = a.type === 'cash' ? State.getEffectiveCashBalance(a.id) : State.computeAccountBalance(a.id);
    const opening = closing - inflow + outflow;
    return [
      a.display_name, a.account_number_masked || '-',
      (a.bank || '').toUpperCase() || '-', TYPE_LBL[a.type] || a.type,
      opening / 100, closing / 100, inflow / 100, outflow / 100, acctTxs.length,
    ];
  });

  const headers = [
    'บัญชี / Account', 'เลขที่ / Number', 'ธนาคาร / Bank', 'ประเภท / Type',
    'ยอดต้นช่วง (฿)', 'ยอดสิ้นช่วง (฿)', 'เงินเข้า (฿)', 'เงินออก (฿)', 'จำนวน',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols']   = [
    { wch: 25 }, { wch: 16 }, { wch: 10 }, { wch: 14 },
    { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 8 },
  ];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  if (XLSX._hasStyling) {
    _styleHeaders(ws, headers.map((_, c) => _addr(0, c)));
    _fmtNum(XLSX, ws, `E2:H${rows.length + 1}`);
  }
  return ws;
}


/* === 10. Sheet 6 — รายการประจำ / Recurring ====================== */

function buildSheet6Recurring(XLSX, { recurring, accounts }) {
  if (!recurring || recurring.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([
      ['รายการประจำ / Recurring Subscriptions'], [''],
      ['ยังไม่มีรายการประจำ — ตั้งค่าได้ในแอป'],
    ]);
    ws['!cols'] = [{ wch: 50 }];
    return ws;
  }

  const acctMap = new Map(accounts.map(a => [a.id, a]));
  const FREQ_LBL = { monthly: 'รายเดือน', weekly: 'รายสัปดาห์', yearly: 'รายปี', installment: 'ผ่อน' };
  const FREQ_MUL = { monthly: 12, weekly: 52, yearly: 1, installment: 12 };

  const rows = recurring.map(t => {
    const acct   = acctMap.get(t.account_id);
    const annual = (t.amount / 100) * (FREQ_MUL[t.frequency] || 12);
    return [
      t.description || t.category || '-',
      FREQ_LBL[t.frequency] || t.frequency,
      t.amount / 100, annual,
      acct?.display_name || '-',
      t.next_due || '-',
      t.active !== false ? 'ทำงาน' : 'หยุด',
    ];
  });

  const totAnnual = rows.reduce((s, r) => s + r[3], 0);
  const headers   = [
    'รายการ / Item', 'ความถี่ / Freq', 'จำนวน (฿)', 'ต่อปี (฿)',
    'บัญชี / Account', 'ครั้งถัดไป', 'สถานะ',
  ];
  const ws = XLSX.utils.aoa_to_sheet([
    headers, ...rows,
    ['รวมต่อปี / Total Annual', '', '', totAnnual, '', '', ''],
  ]);
  ws['!cols']   = [{ wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 10 }];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  if (XLSX._hasStyling) {
    _styleHeaders(ws, headers.map((_, c) => _addr(0, c)));
    _styleTotalRow(ws, rows.length + 1, headers.length);
    _fmtNum(XLSX, ws, `C2:D${rows.length + 2}`);
  }
  return ws;
}


/* === 11. Sheet 7 — ร้านค้า / Merchants ========================== */

function buildSheet7Merchants(XLSX, { txs }) {
  const map = new Map();
  txs.filter(t => t.type === 'expense').forEach(t => {
    const key = normalizeMerchant(t.description);
    if (!map.has(key)) map.set(key, { name: key, count: 0, total: 0, first: t.date, last: t.date });
    const m = map.get(key);
    m.count++;
    m.total += t.amount;
    if (t.date < m.first) m.first = t.date;
    if (t.date > m.last)  m.last  = t.date;
  });

  const rows = [...map.values()]
    .filter(m => m.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 50)
    .map(m => [m.name, m.count, m.total / 100, (m.total / m.count) / 100, m.first, m.last]);

  const headers = [
    'ร้านค้า / Merchant', 'จำนวนครั้ง', 'ยอดรวม (฿)', 'เฉลี่ย/ครั้ง (฿)',
    'ครั้งแรก', 'ล่าสุด',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols']   = [{ wch: 35 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  if (XLSX._hasStyling) {
    _styleHeaders(ws, headers.map((_, c) => _addr(0, c)));
    _fmtNum(XLSX, ws, `C2:D${rows.length + 1}`);
  }
  return ws;
}


/* === 12. Sheet 8 — เปรียบเทียบ / Comparison ==================== */

function buildSheet8Comparison(XLSX, { allTxs, from, to }) {
  const fromDate   = new Date(from);
  const toDate     = new Date(to);
  const periodMs   = toDate - fromDate + 86400000;
  const prevToDate = new Date(fromDate - 86400000);
  const prevFrDate = new Date(prevToDate - periodMs + 86400000);
  const prevFrom   = prevFrDate.toISOString().slice(0, 10);
  const prevTo     = prevToDate.toISOString().slice(0, 10);

  const prevTxs = allTxs.filter(t => t.date >= prevFrom && t.date <= prevTo);
  if (prevTxs.length < 5) return null;  // ข้อมูลไม่พอ

  const currTxs = allTxs.filter(t => t.date >= from && t.date <= to);

  const cInc = _sumByType(currTxs, 'income')  / 100;
  const cExp = _sumByType(currTxs, 'expense') / 100;
  const pInc = _sumByType(prevTxs, 'income')  / 100;
  const pExp = _sumByType(prevTxs, 'expense') / 100;

  function diff(c, p) {
    const d = c - p;
    return [+d.toFixed(2), p > 0 ? +((d / p) * 100).toFixed(2) : 0];
  }

  const currByCat = _groupBySum(currTxs.filter(t => t.type === 'expense'), 'group');
  const prevByCat = _groupBySum(prevTxs.filter(t => t.type === 'expense'), 'group');
  const allGroups = new Set([...Object.keys(currByCat), ...Object.keys(prevByCat)]);
  const catRows   = [...allGroups]
    .map(g => {
      const c = (currByCat[g] || 0) / 100;
      const p = (prevByCat[g] || 0) / 100;
      const [d, pct] = diff(c, p);
      return [g, p, c, d, pct];
    })
    .sort((a, b) => b[2] - a[2]);

  const aoa = [
    ['เปรียบเทียบช่วงเวลา / Period-over-Period'],
    [`ช่วงปัจจุบัน: ${from} ถึง ${to}`],
    [`ช่วงก่อนหน้า: ${prevFrom} ถึง ${prevTo}`],
    [],
    ['สรุปภาพรวม / Overview', '', '', '', ''],
    ['รายการ', 'ช่วงก่อน (฿)', 'ช่วงนี้ (฿)', 'เปลี่ยน (฿)', '% เปลี่ยน'],
    ['รายรับ / Income',  pInc, cInc, ...diff(cInc, pInc)],
    ['รายจ่าย / Expense', pExp, cExp, ...diff(cExp, pExp)],
    ['สุทธิ / Net', pInc - pExp, cInc - cExp, ...diff(cInc - cExp, pInc - pExp)],
    [],
    ['เปรียบเทียบหมวด / Category Comparison', '', '', '', ''],
    ['หมวด / Group', 'ช่วงก่อน (฿)', 'ช่วงนี้ (฿)', 'เปลี่ยน (฿)', '% เปลี่ยน'],
    ...catRows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 14 }];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 4 } },
    { s: { r: 10, c: 0 }, e: { r: 10, c: 4 } },
  ];

  if (XLSX._hasStyling) {
    _styleTitle(ws, 'A1');
    _styleSub(ws, 'A2'); _styleSub(ws, 'A3');
    _styleSecHead(ws, 'A5');
    _styleHeaders(ws, ['A6', 'B6', 'C6', 'D6', 'E6']);
    _styleSecHead(ws, 'A11');
    _styleHeaders(ws, ['A12', 'B12', 'C12', 'D12', 'E12']);
    _fmtNum(XLSX, ws, 'B7:D9');
    _fmtNum(XLSX, ws, `B13:D${12 + catRows.length}`);
  }
  return ws;
}


/* === 13. Style helpers ========================================== */

function _styleTitle(ws, addr) {
  if (!ws[addr]) ws[addr] = { v: '', t: 's' };
  ws[addr].s = {
    font: { name: 'Sarabun', sz: 16, bold: true },
    fill: { fgColor: { rgb: 'FDF9F0' } },
    alignment: { horizontal: 'left', vertical: 'center' },
  };
}
function _styleSub(ws, addr) {
  if (!ws[addr]) ws[addr] = { v: '', t: 's' };
  ws[addr].s = {
    font: { name: 'Sarabun', sz: 11, italic: true, color: { rgb: '6B6B6B' } },
  };
}
function _styleSecHead(ws, addr) {
  if (!ws[addr]) ws[addr] = { v: '', t: 's' };
  ws[addr].s = {
    font: { name: 'Sarabun', sz: 12, bold: true },
    fill: { fgColor: { rgb: 'F0E6D2' } },
  };
}
function _styleHeaders(ws, addrs) {
  for (const addr of addrs) {
    if (!ws[addr]) continue;
    ws[addr].s = {
      font: { name: 'Sarabun', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: 'E88E3C' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top:    { style: 'thin', color: { rgb: 'C97A2E' } },
        bottom: { style: 'thin', color: { rgb: 'C97A2E' } },
        left:   { style: 'thin', color: { rgb: 'C97A2E' } },
        right:  { style: 'thin', color: { rgb: 'C97A2E' } },
      },
    };
  }
}
function _styleTotalRow(ws, rowIdx, colCount) {
  for (let c = 0; c < colCount; c++) {
    const a = _addr(rowIdx, c);
    if (!ws[a]) ws[a] = { v: '', t: 's' };
    ws[a].s = {
      font: { bold: true, name: 'Sarabun' },
      fill: { fgColor: { rgb: 'FFF4E0' } },
      border: { top: { style: 'medium', color: { rgb: 'E88E3C' } } },
    };
  }
}
function _fmtNum(XLSX, ws, rangeStr) {
  const range = XLSX.utils.decode_range(rangeStr);
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const a = _addr(r, c);
      if (!ws[a] || typeof ws[a].v !== 'number') continue;
      ws[a].t = 'n';
      ws[a].z = '#,##0.00';
    }
  }
}

// encode_cell shorthand (XLSX not available at module level so pass via closure)
function _addr(r, c) {
  const col = String.fromCharCode(65 + c);  // A-Z only (works for ≤26 cols)
  return `${col}${r + 1}`;
}


/* === 14. Data helpers =========================================== */

function _sumByType(txs, type) {
  return txs.filter(t => t.type === type).reduce((s, t) => s + t.amount, 0);
}
function _groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}
function _groupBySum(txs, field) {
  return txs.reduce((acc, t) => {
    const k = t[field] || 'other';
    acc[k] = (acc[k] || 0) + t.amount;
    return acc;
  }, {});
}
function _fmtDateThai(iso) {
  const d = parseLocalDate(iso);
  return `${d.getDate()} ${monthNameTH(d)} ${ceToBe(d.getFullYear())}`;
}
