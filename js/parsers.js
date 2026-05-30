/* ===================================================================
   parsers.js — PDF e-Statement parser (universal + bank-specific hints)
   ===================================================================
   ใช้ pdfjs-dist v4.4.168 จาก local (js/lib/) — offline-ready

   Flow:
   1. parsePDF(file, password?) → ดึง text จาก PDF
   2. groupRowsByY → จัด text items เป็น row ตามตำแหน่ง Y
   3. detectBank → ดูธนาคารจากเนื้อหา
   4. detectAccountInfo → หาเลขบัญชี (mask 4 หลักท้าย)
   5. parseTransactions → ดึงรายการ (date + amount + description)
   6. autoClassify → จำแนก income/expense/transfer

   หมายเหตุ: parser นี้เป็น MVP สำหรับ format ทั่วไป
   - ทำงานดีกับ statement ที่มี format ตาราง (KBank, KTB, SCB ส่วนใหญ่)
   - บาง format ที่ซับซ้อน อาจ miss transactions → user ตรวจในหน้า review

   Production note: ของเดิมมี 16 banks worth of parsers (parsers.js เก่า)
   เอามาแทนที่ไฟล์นี้ตอน integrate
   =================================================================== */

// firebase และ state โหลด lazily เฉพาะใน parsePDF() เพื่อให้ test รันใน Node.js ได้
let _firebase = null, _state = null, _pdfjs = null;

async function getFirebase() {
  if (!_firebase) _firebase = await import('./firebase.js');
  return _firebase;
}
async function getState() {
  if (!_state) _state = await import('./state.js');
  return _state;
}


/* === Lazy-load pdf.js (local) ==================================== */
async function loadPdfJs() {
  if (_pdfjs) return _pdfjs;
  try {
    const mod = await import(new URL('./lib/pdf.min.mjs', import.meta.url).href);
    mod.GlobalWorkerOptions.workerSrc = new URL('./lib/pdf.worker.min.mjs', import.meta.url).href;
    _pdfjs = mod;
    return mod;
  } catch (e) {
    console.error('Failed to load pdf.js', e);
    throw new Error('pdfjs_load_failed');
  }
}


/* === Public: parse PDF ========================================== */

/**
 * @param {File|Blob} file
 * @param {string|null} password
 * @param {function} onProgress (step) — callback สำหรับ UI ระหว่าง parse
 * @returns {object} { bank, accountInfo, transactions, raw, errors }
 */
export async function parsePDF(file, password = null, onProgress = null) {
  const step = (msg) => onProgress && onProgress(msg);

  step('กำลังโหลด PDF...');
  const pdfjs = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();

  step('กำลังเปิดไฟล์...');
  let pdfDoc;
  try {
    pdfDoc = await pdfjs.getDocument({
      data: arrayBuffer,
      password,
      isEvalSupported: false           // ปลอดภัยขึ้น
    }).promise;
  } catch (err) {
    if (err.name === 'PasswordException') {
      const e = new Error('password_required');
      e.name = 'PasswordException';
      throw e;
    }
    throw new Error('pdf_open_failed: ' + (err.message || err));
  }

  step(`กำลังอ่าน ${pdfDoc.numPages} หน้า...`);
  const allRows = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    const pageRows = groupRowsByY(content.items);
    allRows.push(...pageRows);
    step(`อ่านหน้า ${i}/${pdfDoc.numPages}`);
  }

  // Full text สำหรับ detect bank/account
  const fullText = allRows.map(r => r.text).join('\n');

  step('ตรวจหาธนาคาร...');
  const bank = detectBank(fullText);

  step('ตรวจหาเลขบัญชี...');
  const accountInfo = detectAccountInfo(fullText, bank);

  // Auto-detect + upsert account เข้า state
  if (accountInfo.last4 && bank !== 'unknown') {
    const State   = await getState();
    const firebase = await getFirebase();
    const accountId = `bank:${bank}:${accountInfo.last4}`;
    if (!State.getAccount(accountId)) {
      State.addAccount({
        id:                    accountId,
        bank,
        account_number_masked: accountInfo.account_number_masked,
        display_name:          `${bank.toUpperCase()} ...${accountInfo.last4}`,
        type:                  'bank',
        current_balance:       null,
        owner:                 firebase.getCurrentUser()?.email || null
      });
    }
  }

  step('แยกรายการ...');
  const rawTransactions = parseTransactions(allRows, bank);

  // Auto-classify — รวมทั้ง account_number_masked (จาก PDF) และ account_number_user (user กรอก)
  const State2  = await getState();
  const ownMasks = State2.getAccounts().flatMap(a => [
    a.account_number_masked,
    a.account_number_user
  ]).filter(Boolean);
  const transactions = rawTransactions.map(tx => ({
    ...tx,
    type: autoClassifyType(tx, ownMasks),
    group: autoClassifyGroup(tx)
  }));

  step('เสร็จแล้ว');

  const verification = verifyParseResult(transactions);
  if (!verification.ok) {
    console.warn('Parse verification failed:', verification);
  }

  return {
    bank,
    accountInfo,
    transactions,
    pageCount:     pdfDoc.numPages,
    extractedText: fullText,
    verification,
    errors:        []
  };
}


/* === Group PDF text items by Y position ========================
   PDF.js คืน items แบบไม่เรียงตาม visual order — ต้อง group เอง
   ทุก item มี transform[5] = Y position ใน PDF coords (origin = bottom-left)
================================================================ */
export function groupRowsByY(items, tolerance = 2) {
  const groups = new Map();

  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const y = Math.round(item.transform[5] / tolerance) * tolerance;
    if (!groups.has(y)) groups.set(y, []);
    groups.get(y).push(item);
  }

  const result = [];
  for (const [y, rowItems] of groups) {
    // เรียงตาม X เพื่อให้ text อ่านจากซ้ายไปขวา
    rowItems.sort((a, b) => a.transform[4] - b.transform[4]);
    const text = rowItems.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
    if (text) result.push({ y, text, items: rowItems });
  }

  // PDF Y descending = top-to-bottom in visual
  result.sort((a, b) => b.y - a.y);
  return result;
}


/* === Bank detection ============================================ */
export function detectBank(text) {
  const lower = text.toLowerCase();
  if (/กสิกร|kasikorn|k-bank|k\.bank|kbank/i.test(text)) return 'kbank';
  if (/กรุงไทย|krungthai|ktb/i.test(text)) return 'ktb';
  if (/ไทยพาณิชย์|siam commercial|scb/i.test(text)) return 'scb';
  if (/กรุงเทพ|bangkok bank|bbl/i.test(text)) return 'bbl';
  if (/กรุงศรี|krungsri|ayudhya|bay/i.test(text)) return 'bay';
  if (/ทหารไทยธนชาต|tmb|ttb/i.test(text)) return 'ttb';
  if (/ออมสิน|gsb|government savings/i.test(text)) return 'gsb';
  if (/ธ\.ก\.ส|baac/i.test(text)) return 'baac';
  if (/อาคารสงเคราะห์|ghb/i.test(text)) return 'ghb';
  if (/cimb/i.test(text)) return 'cimb';
  if (/uob/i.test(text)) return 'uob';
  if (/ทิสโก้|tisco/i.test(text)) return 'tisco';
  if (/เกียรตินาคิน|kkp/i.test(text)) return 'kkp';
  return 'unknown';
}


/* === Account number detection ================================== */
export function detectAccountInfo(text, bank) {
  // Common Thai bank account formats:
  // - 10 digits: 1234567890
  // - With dashes: 123-4-56789-0, 123-456789-0
  const patterns = [
    /(\d{3}-\d-\d{5}-\d)/,           // 3-1-5-1
    /(\d{3}-\d{6}-\d)/,              // 3-6-1
    /(?:Account|บัญชี|เลขที่บัญชี).{0,20}?(\d{3}-\d-\d{5}-\d|\d{3}-\d{6}-\d|\d{10})/i,
    /(\d{10,12})/                    // raw 10-12 digits
  ];

  for (const p of patterns) {
    const match = text.match(p);
    if (match) {
      const raw = (match[1] || match[0]).replace(/[^\d]/g, '');
      if (raw.length < 8) continue;     // too short
      const last4 = raw.slice(-4);
      // Format ตาม pattern ที่เจอ; ถ้าไม่มี dash ก็ใส่เอง
      const masked = match[1] && match[1].includes('-')
        ? maskAccountNumber(match[1])
        : `xxx-x-x${last4}-x`;
      return {
        account_number_masked: masked,
        last4,
        raw: raw                       // เก็บไว้ใช้ภายใน ไม่ persist
      };
    }
  }
  return { account_number_masked: '', last4: '', raw: '' };
}

function maskAccountNumber(formatted) {
  // "123-4-56789-0" → "xxx-x-x6789-x"
  const digits = formatted.replace(/[^\d-]/g, '');
  const parts = digits.split('-');
  // Keep last 4 of largest segment, mask others
  return parts.map((p, i) => {
    if (i === parts.length - 1) return 'x';
    if (p.length >= 4) return 'x'.repeat(p.length - 4) + p.slice(-4);
    return 'x'.repeat(p.length);
  }).join('-');
}


/* === Transaction extraction ====================================
   Strategy: หา row ที่มี date pattern → parse amount + description
   ใช้ heuristics:
   - บางอันมีหลาย amount columns (debit, credit, balance)
   - หา amount ที่ใหญ่สุดน่าจะเป็น balance
   - amount อื่นๆ คือ tx amount
================================================================ */

// Date patterns: DD/MM/YY, DD/MM/YYYY, DD-MM-YY, DD MMM YY
const DATE_RX = /(\d{1,2})[\/\-\s\.](\d{1,2}|ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[\/\-\s\.](\d{2,4})/i;
const TIME_RX = /\d{1,2}:\d{2}(:\d{2})?/g;
const AMT_RX = /(-?\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})/g;
const THAI_MONTHS = {
  'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6,
  'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12
};
const EN_MONTHS = {
  'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
  'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
};

/* === Column detection (Withdrawal / Deposit / Balance) ========== */

/* หา X-position ของแต่ละ column จาก header row
   ต้องมีอย่างน้อย 2 ใน 3 keyword (withdrawal/deposit/balance) ใน row เดียวกัน
   Returns: { withdrawalX, depositX, balanceX } หรือ null ถ้าหาไม่เจอ */
export function detectColumns(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i];
    const text = row.text;

    const hasWithdrawal = /ถอน|withdrawal|debit/i.test(text);
    const hasDeposit    = /ฝาก|deposit|credit/i.test(text);
    const hasBalance    = /คงเหลือ|balance/i.test(text);

    const score = (hasWithdrawal ? 1 : 0) + (hasDeposit ? 1 : 0) + (hasBalance ? 1 : 0);
    if (score < 2) continue;

    const cols = { withdrawalX: null, depositX: null, balanceX: null };
    for (const item of (row.items || [])) {
      const x   = item.transform[4];
      const str = item.str || '';

      if (cols.withdrawalX === null && /ถอน|withdrawal|debit/i.test(str)) {
        cols.withdrawalX = x;
      } else if (cols.depositX === null && /ฝาก|deposit|credit/i.test(str)
                 && !/ถอน|withdrawal/i.test(str)) {
        cols.depositX = x;
      } else if (cols.balanceX === null && /คงเหลือ|balance/i.test(str)) {
        cols.balanceX = x;
      }
    }

    if (cols.withdrawalX !== null && cols.depositX !== null) {
      return cols;
    }
  }
  return null;
}

/* แยก amount items ตาม column โดยใช้ X-coordinate
   Returns: { withdrawal, deposit, balance } — raw number (บาท) หรือ null */
function classifyAmountByColumn(items, cols) {
  const AMT_ITEM_RX = /^-?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})$/;
  const amountItems = (items || []).filter(it => AMT_ITEM_RX.test((it.str || '').trim()));

  let withdrawal = null, deposit = null, balance = null;

  for (const item of amountItems) {
    const x     = item.transform[4];
    const value = parseFloat(item.str.replace(/,/g, ''));

    const distances = [
      { col: 'withdrawal', d: Math.abs(x - cols.withdrawalX) },
      { col: 'deposit',    d: Math.abs(x - cols.depositX) },
      { col: 'balance',    d: cols.balanceX != null ? Math.abs(x - cols.balanceX) : Infinity }
    ].sort((a, b) => a.d - b.d);

    const best = distances[0];
    if (best.d > 80) continue;  // ไกลเกิน → skip (เลขสาขา, เลขอื่นๆ)

    if (best.col === 'withdrawal' && withdrawal === null) withdrawal = value;
    else if (best.col === 'deposit'    && deposit    === null) deposit    = value;
    else if (best.col === 'balance'    && balance    === null) balance    = value;
  }

  return { withdrawal, deposit, balance };
}

/* === Skip-row detection ======================================== */

const SKIP_ROW_KEYWORDS = [
  /^B\/F$/i,
  /^C\/F$/i,
  /ยอดยกมา/,
  /ยอดยกไป/,
  /balance\s*brought\s*forward/i,
  /balance\s*carried\s*forward/i,
  /^total\b/i,
  /^รวม\b/,
  /จำนวนรายการ/,
  /total\s*(no\.|number)/i,
  /^\s*$/
];

export function isSkipRow(description) {
  const d = (description || '').trim();
  return SKIP_ROW_KEYWORDS.some(rx => rx.test(d));
}


export function parseTransactions(rows, bank) {
  const transactions = [];
  const cols = detectColumns(rows);
  const useColumnMode = cols !== null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const text = row.text;

    // Skip header rows
    if (/(?:date|วันที่|description|รายการ|amount|จำนวน|balance|คงเหลือ)/i.test(text)
        && !DATE_RX.test(text)) continue;

    const dateMatch = text.match(DATE_RX);
    if (!dateMatch) continue;

    // Parse date
    const day = parseInt(dateMatch[1], 10);
    let month;
    const monthRaw = dateMatch[2].toLowerCase();
    if (/^\d+$/.test(monthRaw)) {
      month = parseInt(monthRaw, 10);
    } else if (THAI_MONTHS[dateMatch[2]]) {
      month = THAI_MONTHS[dateMatch[2]];
    } else if (EN_MONTHS[monthRaw.slice(0, 3)]) {
      month = EN_MONTHS[monthRaw.slice(0, 3)];
    } else {
      continue;
    }

    let year = parseInt(dateMatch[3], 10);
    if (year < 100) year += (year > 43 ? 2500 : 2000); // 2-digit BE (67/68/69) vs CE (24/25/26)
    if (year > 2500) year -= 543;

    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    if (year < 2000 || year > 2100) continue;

    const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // Description = ตัด date + amounts + time ออก
    let description = text;
    description = description.replace(DATE_RX, ' ');
    description = description.replace(AMT_RX, ' ');
    description = description.replace(TIME_RX, ' ');
    description = description.replace(/\s+/g, ' ').trim();
    description = description.replace(/^[\-\.\,\s]+|[\-\.\,\s]+$/g, '');
    if (description.length < 2) description = 'รายการ';
    if (description.length > 80) description = description.slice(0, 80) + '...';

    // Skip non-transaction rows (B/F, C/F, ยอดยกมา, Total, ...)
    if (isSkipRow(description)) continue;

    // Amount + direction detection
    let amount = 0;
    let balance = null;
    let direction = null;  // 'in' | 'out' | null

    if (useColumnMode) {
      const colAmts = classifyAmountByColumn(row.items, cols);

      if (colAmts.withdrawal !== null && colAmts.withdrawal > 0) {
        amount    = colAmts.withdrawal;
        direction = 'out';
      } else if (colAmts.deposit !== null && colAmts.deposit > 0) {
        amount    = colAmts.deposit;
        direction = 'in';
      }
      balance = colAmts.balance;

      if (amount === 0) continue;  // ไม่มี amount ใน withdrawal/deposit column → skip
    } else {
      // Fallback heuristic เมื่อ detectColumns ไม่สำเร็จ
      const amountMatches = [...text.matchAll(AMT_RX)];
      if (amountMatches.length === 0) continue;
      const amounts = amountMatches.map(m => parseFloat(m[1].replace(/,/g, '')));

      if (amounts.length === 1) {
        amount = Math.abs(amounts[0]);
      } else if (amounts.length === 2) {
        const [a, b] = amounts;
        if (Math.abs(a) > Math.abs(b)) {
          balance = a; amount = Math.abs(b);
        } else {
          balance = b; amount = Math.abs(a);
        }
      } else {
        balance = amounts[amounts.length - 1];
        for (let j = 0; j < amounts.length - 1; j++) {
          if (Math.abs(amounts[j]) > 0) { amount = Math.abs(amounts[j]); break; }
        }
      }
    }

    if (amount === 0 || amount > 10000000) continue;

    transactions.push({
      date:           isoDate,
      amount:         Math.round(amount * 100),
      balance:        balance != null ? Math.round(balance * 100) : null,
      description,
      bank,
      raw_text:       text,
      direction,
      source:         'import',
      user_classified: false
    });
  }

  return transactions;
}


/* === Own-account matching ====================================== */

/** ดึงเฉพาะตัวเลขทั้งหมดออกจาก string */
function normDigits(s) { return s.replace(/\D/g, ''); }

/**
 * ตรวจว่า text มีเลขบัญชีของตัวเองปรากฏอยู่หรือไม่
 * รองรับทุกรูปแบบ: มีขีด / เว้นวรรค / ไม่มี separator
 *
 * Algorithm:
 *   1. ดึง digit-runs ≥ 4 หลักจาก text (หลีกเลี่ยงจำนวนเงินที่มี , .)
 *   2. สำหรับแต่ละบัญชี:
 *      - suffix match: บัญชีลงท้ายด้วย run นี้ (ใช้ 4+ หลักสุดท้าย)
 *      - substring match: run ≥ 6 หลักและปรากฏอยู่ใน acctDigits
 */
function matchesOwnAccount(text, ownNumbers) {
  const runs = text.match(/\d{4,}/g);
  if (!runs) return false;

  for (const raw of ownNumbers) {
    const acctDigits = normDigits(raw);
    if (acctDigits.length < 4) continue;

    for (const run of runs) {
      if (acctDigits.endsWith(run)) return true;
      if (run.length >= 6 && acctDigits.includes(run)) return true;
    }
  }
  return false;
}


/* === Auto-classification ======================================= */

export function autoClassifyType(tx, ownAccountMasks = []) {
  const t = (tx.description || '') + ' ' + (tx.raw_text || '');

  // direction จาก column detection (primary signal)
  if (tx.direction === 'in') {
    if (/(?:cash\s*deposit|ฝากเงินสด|cdm)/i.test(t)) return 'transfer';
    if (matchesOwnAccount(t, ownAccountMasks)) return 'transfer';
    return 'income';
  }

  if (tx.direction === 'out') {
    if (/(?:atm|withdraw|ถอน|cdm)/i.test(t)) return 'transfer';
    if (/(?:credit\s*card|บัตรเครดิต|ชำระบัตร|cc\s*payment)/i.test(t)) return 'transfer';
    if (/(?:transfer.*own|โอนภายใน|own\s*account|to\s*saving|ไปออม)/i.test(t)) return 'transfer';
    if (matchesOwnAccount(t, ownAccountMasks)) return 'transfer';
    return 'expense';
  }

  // Keyword fallback (direction === null — manual entry หรือ PDF ที่ detect column ไม่ได้)
  if (/(?:atm|withdraw|ถอน|cash\s*deposit|ฝากเงินสด|cdm)/i.test(t)) return 'transfer';
  if (/(?:credit\s*card|บัตรเครดิต|ชำระบัตร|cc\s*payment)/i.test(t))  return 'transfer';
  if (/(?:transfer.*own|โอนภายใน|own\s*account|to\s*saving|ไปออม)/i.test(t)) return 'transfer';
  if (matchesOwnAccount(t, ownAccountMasks)) return 'transfer';

  if (/(?:เงินเดือน|salary|payroll|bonus|deposit|รับโอน|โอนเข้า|เงินเข้า|รับเงิน|เครดิตเงิน|transfer\s*in|received|interest|ดอกเบี้ย|cashback|cash\s*back|refund|คืนเงิน|รับ\s)/i.test(t)) {
    return 'income';
  }

  return 'expense';
}

/* === Confidence scoring ======================================== */

/**
 * คะแนนความแม่นยำของ parse result (0-100)
 * ถ้า < 60 → แนะนำ Gemini fallback
 */
export function scoreParseResult(result) {
  if (result.transactions.length === 0) return 0;
  let score = 100;
  if (result.bank === 'unknown') score -= 30;
  const zeroCount = result.transactions.filter(t => t.amount === 0).length;
  if (zeroCount / result.transactions.length > 0.3) score -= 20;
  if (result.pageCount > 2 && result.transactions.length < 5) score -= 25;
  return Math.max(0, score);
}


/* === Parse result verification ================================
   เปรียบเทียบ (deposits - withdrawals) กับ (closing - opening balance)
   ถ้าไม่ตรงกัน → parser อาจอ่าน direction ผิด
   Returns: { ok, opening, closing, computed, totalIn, totalOut, diff }
================================================================ */
export function verifyParseResult(transactions) {
  const withBalance = transactions.filter(t => t.balance !== null);
  if (withBalance.length < 2) {
    return { ok: true, warning: 'insufficient_balance_data' };
  }

  const first   = withBalance[0];
  const opening = first.direction === 'in'
    ? first.balance - first.amount
    : first.balance + first.amount;
  const closing = withBalance[withBalance.length - 1].balance;

  const totalIn  = transactions.filter(t => t.direction === 'in').reduce((s, t) => s + t.amount, 0);
  const totalOut = transactions.filter(t => t.direction === 'out').reduce((s, t) => s + t.amount, 0);

  const computed = opening + totalIn - totalOut;
  const diff     = Math.abs(computed - closing);

  return { ok: diff <= 100, opening, closing, computed, totalIn, totalOut, diff };
}


export function autoClassifyGroup(tx) {
  const t = (tx.description || '') + ' ' + (tx.raw_text || '');

  if (/(?:เงินเดือน|salary|payroll)/i.test(t)) return 'salary';
  if (/(?:ดอกเบี้ย|interest)/i.test(t)) return 'bonus';
  if (/(?:atm|withdraw|ถอน|transfer|โอน|ชำระบัตร)/i.test(t)) return 'transfer';

  // Expense categories
  if (/(?:lotus|big c|tesco|tops|villa market|maxvalu|gourmet|7-eleven|7\s*eleven|seveneleven|family mart|ramen|sushi|ก๋วยเตี๋ยว|ข้าวกล่อง|อาหาร)/i.test(t)) return 'food';
  if (/(?:starbucks|amazon coffee|cafe|กาแฟ|coffee|latte|true coffee|inthanin)/i.test(t)) return 'coffee';
  if (/(?:grab|gojek|bolt|lineman|food\s*panda|foodpanda)/i.test(t)) return 'food';
  if (/(?:bts|mrt|airport rail|grab car|taxi|วิน|รถเมล์)/i.test(t)) return 'transport';
  if (/(?:ptt|esso|shell|ปตท|น้ำมัน|caltex|gulf)/i.test(t)) return 'transport';
  if (/(?:lazada|shopee|tiktok|amazon)/i.test(t)) return 'shopping';
  if (/(?:true|ais|dtac|nt|mea|กฟภ|กฟน|กปภ|metropolitan electricity|water authority|internet|wifi)/i.test(t)) return 'utility';
  if (/(?:hospital|clinic|pharmacy|โรงพยาบาล|คลินิก|ร้านยา|fascino|boots|watson)/i.test(t)) return 'health';
  if (/(?:netflix|spotify|youtube|disney|hbo|prime|viu|iqiyi|line tv)/i.test(t)) return 'entertainment';
  if (/(?:rent|ค่าเช่า|ค่าหอ|condo)/i.test(t)) return 'rent';

  return 'other';
}
