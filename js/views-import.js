/* ===================================================================
   views-import.js — IMPORT VIEW (e-Statement) + review modal + confirmImport
   ===================================================================
   MONEY-PATH: parse PDF → confidence → review (เลือก tx + ยืนยันบัญชี) →
   addTransactionsBatch. Gemini fallback (dynamic import) เมื่อ confidence < 60
   primitives + cash-override มาจาก views-shared; parsers/gemini/add = dynamic import
   =================================================================== */

import * as State from './state.js';
import * as Recurring from './recurring.js';
import { svgIcon, getCategory } from './icons.js';
import {
  formatBaht, formatShortDate, parseLocalDate, monthNameTH, dayNameTH, ceToBe
} from './utils.js';
import { findPotentialDuplicates } from './duplicate-detector.js';
import {
  escapeHtml, showToast, setRecurSuggestions, showCashOverrideDialog, categoryLabel
} from './views-shared.js';


/* ===================================================================
   IMPORT VIEW (e-Statement / Slip)
   =================================================================== */
export function renderImport(container) {
  container.innerHTML = `
    <div class="import-header">
      <div class="import-title">นำเข้า<span class="accent"> รายการ</span></div>
      <div class="import-sub">อัปโหลด e-Statement ครั้งเดียว — ได้รายการทั้งเดือน ไม่ต้องจดเอง</div>
    </div>

    <!-- e-Statement tile -->
    <div class="import-tile pdf" data-action="import-pdf">
      <div class="tile-icon">
        ${svgIcon('pdf', { size: 26, stroke: 1.6 })}
        <span class="badge">eS</span>
      </div>
      <div class="tile-title">e-Statement</div>
      <div class="tile-desc">ดาวน์โหลด PDF จากแอปธนาคาร แล้วเลือกไฟล์ที่นี่ — ไฟล์มีรหัสผ่านก็ใช้ได้</div>
      <button class="tile-btn">เลือกไฟล์</button>
    </div>

    <!-- Bank grid — ครบ 16 ธนาคารที่ parser รองรับ -->
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">ธนาคารที่รองรับ</h2>
        <span class="section-action">16 ธนาคาร</span>
      </div>
      <div class="bank-grid">
        ${renderBankCell('KTB',     '#0e9bdc')}
        ${renderBankCell('KBank',   '#138f3f')}
        ${renderBankCell('SCB',     '#4d2882')}
        ${renderBankCell('BBL',     '#1e4486')}
        ${renderBankCell('กรุงศรี', '#fec43b', 'BAY')}
        ${renderBankCell('ttb',     '#f5822a')}
        ${renderBankCell('ออมสิน',  '#eb1c8e', 'GSB')}
        ${renderBankCell('ธ.ก.ส.',  '#2e8b57', 'ธกส')}
        ${renderBankCell('ธอส.',    '#f5a623', 'ธอส')}
        ${renderBankCell('CIMB',    '#cc0001')}
        ${renderBankCell('UOB',     '#003087')}
        ${renderBankCell('TISCO',   '#12395d', 'TIS')}
        ${renderBankCell('KKP',     '#1a3e6b')}
        ${renderBankCell('LH Bank', '#1d5a9e', 'LH')}
        ${renderBankCell('ICBC',    '#cc1a1a', 'ICB')}
        ${renderBankCell('SC',      '#0b8a8f')}
      </div>
      <div class="setting-sub" style="padding:8px 4px 0;text-align:center">
        ธนาคารอื่นนอกจากนี้ ลองนำเข้าได้เลย — มี AI ช่วยอ่านไฟล์ให้
      </div>
    </div>

    <!-- Privacy note — ตรงกับพฤติกรรมจริง: local-first + AI fallback แบบขอความยินยอม -->
    <div class="privacy-footer">
      ${svgIcon('shield', { size: 18, stroke: 2 })}
      <div class="text">
        <strong>ไฟล์ของคุณอ่านในเครื่องนี้ ไม่ส่งขึ้นเซิร์ฟเวอร์</strong><br>
        ยกเว้นกรณีไฟล์อ่านยาก ระบบจะถามก่อนว่าให้ AI ช่วยอ่านไหม — คุณเลือกได้ทุกครั้ง
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


async function handlePdfImport(file) {
  const { parsePDF, scoreParseResult } = await import('./parsers.js');
  let result;
  let isEncrypted = false; // PDF มีรหัส → Gemini ถอดไฟล์ไม่ได้ ต้องส่ง extractedText แทน

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
    isEncrypted = true;
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
      // PDF มีรหัส → ส่ง extractedText (string) เพราะ Gemini ถอดรหัสไฟล์ไม่ได้
      // PDF ปกติ → ส่งไฟล์จริง (base64) เสมอ — Gemini อ่านด้วย vision แม่นกว่า
      // text ที่ parser สกัดได้ (ซึ่งอาจเพี้ยนจนเป็นเหตุให้ confidence ต่ำตั้งแต่แรก)
      const fileOrText = isEncrypted && result.extractedText ? result.extractedText : file;
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
async function _runGeminiFallback(fileOrText, fileName) {
  const prog = createProgressModal('AI กำลังวิเคราะห์ e-Statement');
  document.body.appendChild(prog.el);
  try {
    const { parseStatementWithGemini } = await import('./gemini.js');
    const geminiResult = await parseStatementWithGemini(fileOrText);
    prog.el.remove();

    const transactions = (geminiResult.transactions || []).map(t => ({
      date:        t.date,
      amount:      Math.abs(t.amount || 0),
      description: t.description || '',
      type:        t.type || 'expense',
      balance:     t.balance ?? null,
      source:      'pdf',
    }));
    const last4 = geminiResult.account_number_last4 || null;
    showReviewModal({
      transactions,
      bank:        geminiResult.bank_name || null,
      // last4 = field ที่ confirmImport ใช้สร้าง/ผูกบัญชี (ให้ตรงกับ parser path)
      accountInfo: {
        last4,
        account_number_last4:  last4,
        account_number_masked: last4 ? `xxx-x-x${last4}-x` : null,
      },
      extractedText: typeof fileOrText === 'string' ? fileOrText : '',
      source:      'gemini',
    }, fileName || 'gemini-import');
  } catch (err) {
    prog.el.remove();
    if (err.message === 'GEMINI_NO_KEY') {
      showToast('ยังไม่ได้ตั้งค่า Gemini API Key ใน config.js');
      return;
    }
    if (err.message === 'GEMINI_BAD_KEY') {
      showToast('Gemini API Key ไม่ถูกต้อง — ตรวจสอบ config.js');
      return;
    }
    console.error('[gemini fallback]', err);
    showToast('AI วิเคราะห์ไม่สำเร็จ: ' + (err.message || 'unknown'));
  }
}

async function handleGeminiFallback(fileOrText, fileName) {
  await _runGeminiFallback(fileOrText, fileName);
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

  // ถามบัญชีปลายทางทุกกรณีเพื่อยืนยันก่อนนำเข้า — ถ้าตรวจพบจากไฟล์ใช้เป็นค่าเริ่มต้น
  const detectedId = (result.accountInfo?.last4 && result.bank && result.bank !== 'unknown')
    ? `bank:${result.bank}:${result.accountInfo.last4}` : null;
  let targetAccountId = detectedId;
  const initialAcctLabel = detectedId
    ? (State.getAccount(detectedId)?.display_name || `${bankDisplayName(result.bank)} ...${result.accountInfo.last4}`)
    : 'เลือกบัญชี';

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

      <!-- Account picker — ยืนยันบัญชีปลายทางทุกกรณี -->
      <div class="card card-padded" style="padding: 14px 18px; margin-bottom: 12px; display: flex; align-items: center; gap: 12px;">
        <div style="flex: 1; min-width: 0;">
          <div class="setting-label">นำเข้าไปยังบัญชี</div>
          <div class="setting-sub">${detectedId
            ? 'ตรวจพบจากไฟล์ — แตะปุ่มเพื่อเปลี่ยน'
            : 'ไม่พบเลขบัญชีในไฟล์ — เลือกบัญชีปลายทางเอง'}</div>
        </div>
        <button id="review-acct-btn" style="
          padding: 8px 14px; border-radius: 10px; border: 1px solid var(--rule);
          background: var(--accent-soft, #fef3e7); color: var(--ink);
          font-family: inherit; font-size: 0.85rem; white-space: nowrap;
        ">${escapeHtml(initialAcctLabel)}</button>
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

  // Account picker (กรณี AI + ไม่มีเลขบัญชี) — reuse bottom-sheet จาก add.js
  const acctBtn = modal.querySelector('#review-acct-btn');
  if (acctBtn) {
    acctBtn.addEventListener('click', async () => {
      const { openAccountPickerModal } = await import('./add.js');
      openAccountPickerModal(targetAccountId, id => {
        targetAccountId = id;
        acctBtn.textContent = State.getAccount(id)?.display_name || 'ไม่ระบุ';
      });
    });
  }

  modal.querySelector('[data-action="cancel"]').addEventListener('click', () => modal.remove());

  modal.querySelector('[data-action="confirm"]').addEventListener('click', () => {
    const selectedTxs = result.transactions.filter((_, i) => sel.has(i));
    confirmImport({ ...result, transactions: selectedTxs, target_account_id: targetAccountId });
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
        <div class="entry-cat">${categoryLabel(tx)}${tx.balance != null
          ? ` · <span style="color:${tx.balance < 0 ? 'var(--expense,#d96b5e)' : 'inherit'}">คงเหลือ ${formatBaht(tx.balance)} ฿</span>`
          : ''}</div>
      </div>
      <div class="entry-amt ${amtClass}">${sign}${formatBaht(tx.amount)} ฿</div>
      ${compareHtml}
    </div>
  `;
}

/* ใส่ account_id ใน transactions + route cash flows ให้ถูกทิศ */
function assignTxAccounts(transactions, accountId) {
  for (const tx of transactions) {
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

function confirmImport(result) {
  // Add/update account if detected
  let _importedAccountId = null;  // เก็บไว้สำหรับ aha-moments trigger
  const detectedId = (result.accountInfo?.last4 && result.bank && result.bank !== 'unknown')
    ? `bank:${result.bank}:${result.accountInfo.last4}` : null;
  // user ยืนยัน/เปลี่ยนบัญชีปลายทางใน review modal — ถ้าเปลี่ยนเป็นบัญชีอื่น
  // ให้ใช้บัญชีที่เลือกแทน และไม่สร้างบัญชีที่ตรวจพบจากไฟล์
  const useDetected = detectedId &&
    (!result.target_account_id || result.target_account_id === detectedId);

  if (useDetected) {
    const accountId = detectedId;
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
    assignTxAccounts(result.transactions, accountId);
  } else if (result.target_account_id) {
    // ไม่ใช้บัญชีที่ตรวจพบ (ไม่พบ หรือ user เปลี่ยน) — ใช้บัญชีที่ user เลือก
    _importedAccountId = result.target_account_id;
    assignTxAccounts(result.transactions, result.target_account_id);
  }

  // ลบ raw_text ก่อน save (ไม่ต้องเก็บใน storage)
  const cleanTxs = result.transactions.map(({ raw_text, ...rest }) => rest);

  // ลบข้อมูลสมมุติออกก่อน import ข้อมูลจริง (ถ้ามี)
  const hadSampleData = State.clearSampleData();
  if (hadSampleData) {
    State.markDemoComplete();
    // ลบเฉพาะ recurring templates ตัวอย่าง (_sample) — template ที่ user
    // สร้างเองระหว่างลองแอปต้องไม่หาย
    Recurring.getTemplates().filter(t => t._sample).forEach(t => Recurring.deleteTemplate(t.id));
  }

  State.addTransactionsBatch(cleanTxs);
  showToast(`นำเข้า ${cleanTxs.length} รายการเรียบร้อย${hadSampleData ? ' (ลบข้อมูลตัวอย่างออกแล้ว)' : ''}`);

  // ไปหน้าบันทึกทันที — ให้เห็นรายการใหม่ที่นำเข้า
  document.querySelector('.nav-item[data-view="list"]')?.click();

  // ตรวจหา recurring patterns อัตโนมัติหลัง import
  const suggestions = Recurring.detectRecurringPatterns(State.getTransactions());
  if (suggestions.length > 0) {
    setRecurSuggestions(suggestions);
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




function renderBankCell(name, color, logo = null) {
  return `
    <div class="bank-cell">
      <div class="bank-logo" style="background: ${color}">${logo ?? name.slice(0, 3)}</div>
      <div class="bank-name">${name}</div>
    </div>
  `;
}
