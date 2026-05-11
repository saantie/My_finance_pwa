/* ===================================================================
   parsers.js — PDF e-Statement parser (universal + bank-specific hints)
   ===================================================================
   ใช้ pdfjs-dist จาก CDN (lazy-load, ~500KB gzipped)

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

let _pdfjs = null;


/* === Lazy-load pdf.js =========================================== */
async function loadPdfJs() {
  if (_pdfjs) return _pdfjs;
  try {
    // pdfjs-dist v3.11.x = ESM + reliable
    const VERSION = '3.11.174';
    const mod = await import(`https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSION}/build/pdf.min.mjs`);
    mod.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSION}/build/pdf.worker.min.mjs`;
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
      throw new Error('password_required');
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

  step('แยกรายการ...');
  const rawTransactions = parseTransactions(allRows, bank);

  // Auto-classify
  const transactions = rawTransactions.map(tx => ({
    ...tx,
    type: autoClassifyType(tx),
    group: autoClassifyGroup(tx)
  }));

  step('เสร็จแล้ว');

  return {
    bank,
    accountInfo,
    transactions,
    pageCount: pdfDoc.numPages,
    errors: []
  };
}


/* === Group PDF text items by Y position ========================
   PDF.js คืน items แบบไม่เรียงตาม visual order — ต้อง group เอง
   ทุก item มี transform[5] = Y position ใน PDF coords (origin = bottom-left)
================================================================ */
function groupRowsByY(items, tolerance = 2) {
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
function detectBank(text) {
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
function detectAccountInfo(text, bank) {
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

function parseTransactions(rows, bank) {
  const transactions = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const text = row.text;

    // Skip rows ที่ดูเป็น header
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
    if (year < 100) year += 2000;
    if (year > 2500) year -= 543;          // Buddhist Era → CE

    // Sanity check
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    if (year < 2000 || year > 2100) continue;

    const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // Extract amounts (must have commas or decimals — เลขโทร/ที่อยู่จะถูก reject)
    const amountMatches = [...text.matchAll(AMT_RX)];
    if (amountMatches.length === 0) continue;

    const amounts = amountMatches.map(m => parseFloat(m[1].replace(/,/g, '')));

    // Description = ตัด date + amounts + time ออก
    let description = text;
    description = description.replace(DATE_RX, ' ');
    description = description.replace(AMT_RX, ' ');
    description = description.replace(TIME_RX, ' ');
    description = description.replace(/\s+/g, ' ').trim();

    // ตัดข้อความที่ไม่มีความหมาย
    description = description.replace(/^[\-\.\,\s]+|[\-\.\,\s]+$/g, '');
    if (description.length < 2) description = 'รายการ';
    if (description.length > 80) description = description.slice(0, 80) + '...';

    // Determine amount + balance
    let amount = 0;
    let balance = null;

    if (amounts.length === 1) {
      amount = Math.abs(amounts[0]);
    } else if (amounts.length === 2) {
      // ตัวที่ใหญ่กว่ามักเป็น balance
      const [a, b] = amounts;
      if (Math.abs(a) > Math.abs(b)) {
        balance = a;
        amount = Math.abs(b);
      } else {
        balance = b;
        amount = Math.abs(a);
      }
    } else {
      // 3+ amounts: ตัวสุดท้ายมัก balance, ตัวที่มีค่ามาก่อน = amount
      balance = amounts[amounts.length - 1];
      for (let j = 0; j < amounts.length - 1; j++) {
        if (Math.abs(amounts[j]) > 0) {
          amount = Math.abs(amounts[j]);
          break;
        }
      }
    }

    // Skip ถ้า amount = 0 (น่าจะเป็น header row หรือ summary)
    if (amount === 0 || amount > 10000000) continue;     // sanity cap 10M

    transactions.push({
      date: isoDate,
      amount: Math.round(amount * 100),                 // satang
      balance: balance != null ? Math.round(balance * 100) : null,
      description,
      bank,
      raw_text: text,
      source: 'import',
      user_classified: false
    });
  }

  return transactions;
}


/* === Auto-classification ======================================= */

function autoClassifyType(tx) {
  const t = (tx.description || '') + ' ' + (tx.raw_text || '');

  // Income signals
  if (/(?:เงินเดือน|salary|payroll|deposit|รับโอน|interest|ดอกเบี้ย|cashback|refund|คืนเงิน|รับ\s)/i.test(t)) {
    return 'income';
  }

  // Transfer signals: ATM, จ่ายบัตรเครดิต, โอนระหว่างบัญชีตัวเอง
  if (/(?:atm|withdraw|ถอน|cash\s*deposit|ฝากเงินสด|cdm)/i.test(t)) {
    return 'transfer';
  }
  if (/(?:credit\s*card|บัตรเครดิต|ชำระบัตร|cc\s*payment)/i.test(t)) {
    return 'transfer';
  }
  if (/(?:transfer.*own|โอนภายใน|own\s*account|to\s*saving|ไปออม)/i.test(t)) {
    return 'transfer';
  }

  return 'expense';
}

function autoClassifyGroup(tx) {
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
