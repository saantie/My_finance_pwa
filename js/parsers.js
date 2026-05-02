// js/parsers.js — Multi-bank PDF statement parser.
//
// Architecture:
//   1. detectBank(fullText) → bank id by keyword match (highest score wins).
//   2. groupRowsByY(textItems) → rows of {x, str} (one PDF text-line each).
//   3. parseStatement(rows, opts) → transactions[].
//
// The parser is UNIVERSAL: per-row it finds a date, all numbers, then uses the
// running BALANCE column (monotonic, largest magnitude) to determine direction
// (debit vs credit) by delta. This handles every Thai bank layout we've seen
// (KTB / KBank / SCB / BBL / Krungsri / TTB / GSB / BAAC / GHB / TISCO / KKP /
// CIMB / UOB / LH Bank / ICBC / Citi). Banks that publish a single "amount"
// column with a sign indicator are also supported (parenthesized negatives,
// Cr/Dr suffixes — handled by U.toSatang).

(function (root) {
  'use strict';

  const U = (typeof require === 'function') ? require('./utils.js') : root.U;

  // ---------- Bank detection ----------

  /** Each entry has id, displayName, keywords[]. Keywords are case-insensitive. */
  const BANKS = [
    { id: 'ktb',    name: 'ธนาคารกรุงไทย',           keywords: ['ธนาคารกรุงไทย', 'krung thai', 'krungthai', 'ktb statement', '\\bKTB\\b'] },
    { id: 'kbank',  name: 'ธนาคารกสิกรไทย',          keywords: ['กสิกรไทย', 'kasikorn', 'k-?bank', 'k\\+', 'kbank'] },
    { id: 'scb',    name: 'ธนาคารไทยพาณิชย์',        keywords: ['ไทยพาณิชย์', 'siam commercial', '\\bSCB\\b'] },
    { id: 'bbl',    name: 'ธนาคารกรุงเทพ',           keywords: ['ธนาคารกรุงเทพ', 'bangkok bank', '\\bBBL\\b'] },
    { id: 'bay',    name: 'ธนาคารกรุงศรีอยุธยา',     keywords: ['กรุงศรีอยุธยา', 'krungsri', 'ayudhya', '\\bBAY\\b'] },
    { id: 'ttb',    name: 'ธนาคารทหารไทยธนชาต',      keywords: ['ทหารไทยธนชาต', 'tmbthanachart', '\\bttb\\b', 'thanachart'] },
    { id: 'gsb',    name: 'ธนาคารออมสิน',            keywords: ['ออมสิน', 'government savings', '\\bGSB\\b'] },
    { id: 'baac',   name: 'ธ.ก.ส.',                  keywords: ['เพื่อการเกษตรและสหกรณ์', 'ธ\\.ก\\.ส\\.', '\\bBAAC\\b'] },
    { id: 'ghb',    name: 'ธนาคารอาคารสงเคราะห์',    keywords: ['อาคารสงเคราะห์', 'ธอส', '\\bGHB\\b', 'government housing'] },
    { id: 'tisco',  name: 'ธนาคารทิสโก้',            keywords: ['ทิสโก้', 'tisco'] },
    { id: 'kkp',    name: 'ธนาคารเกียรตินาคินภัทร',  keywords: ['เกียรตินาคิน', 'kiatnakin', '\\bKKP\\b'] },
    { id: 'cimb',   name: 'ธนาคารซีไอเอ็มบี ไทย',    keywords: ['ซีไอเอ็มบี', '\\bCIMB\\b'] },
    { id: 'uob',    name: 'ธนาคารยูโอบี',            keywords: ['ยูโอบี', '\\bUOB\\b', 'united overseas'] },
    { id: 'lhb',    name: 'ธนาคารแลนด์ แอนด์ เฮ้าส์', keywords: ['แลนด์ แอนด์ เฮ้าส์', 'land and houses', 'lh bank', '\\bLHB\\b'] },
    { id: 'icbc',   name: 'ธนาคารไอซีบีซี (ไทย)',    keywords: ['ไอซีบีซี', '\\bICBC\\b'] },
    { id: 'citi',   name: 'ซิตี้แบงก์',              keywords: ['citibank', 'ซิตี้แบงก์', 'citi\\b'] }
  ];

  function detectBank(fullText) {
    if (!fullText) return { id: 'unknown', name: 'ไม่ทราบธนาคาร', score: 0 };
    const text = fullText.toLowerCase();
    let best = { id: 'unknown', name: 'ไม่ทราบธนาคาร', score: 0 };
    for (const b of BANKS) {
      let score = 0;
      for (const kw of b.keywords) {
        const re = new RegExp(kw, 'i');
        const matches = text.match(new RegExp(kw, 'gi'));
        if (matches) score += matches.length;
      }
      if (score > best.score) {
        best = { id: b.id, name: b.name, score };
      }
    }
    return best;
  }

  // ---------- Row grouping (from pdf.js textContent.items) ----------

  /** Group PDF text items by Y coordinate.
   *  items: [{ str, transform: [a,b,c,d,e,f] }]  where f = y position.
   *  Returns: [[{x, str}, ...], ...]  rows sorted top-down, items sorted left-right.
   *  tol: max Y delta to treat as same row (default 3). */
  function groupRowsByY(items, tol = 3) {
    if (!items || !items.length) return [];
    const buckets = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform ? it.transform[4] : (it.x || 0);
      const y = it.transform ? it.transform[5] : (it.y || 0);
      let placed = false;
      for (const b of buckets) {
        if (Math.abs(b.y - y) <= tol) {
          b.items.push({ x, str: it.str });
          b.y = (b.y * b.items.length + y) / (b.items.length + 1); // running avg
          placed = true;
          break;
        }
      }
      if (!placed) buckets.push({ y, items: [{ x, str: it.str }] });
    }
    // Sort buckets top-down (PDF coords have y increasing upwards, so DESCENDING y = top).
    buckets.sort((a, b) => b.y - a.y);
    // Within each row sort items left to right.
    return buckets.map(b => {
      b.items.sort((a, b) => a.x - b.x);
      return b.items;
    });
  }

  /** Render a row as a single string (concat with single space). */
  function rowText(row) {
    return row.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
  }

  // ---------- Number / date extraction ----------

  // Matches typical Thai bank amounts: 1,234.56  -1,234.56  (1,234.56)  1234  1234.5
  const NUM_RE = /\(?\s*-?\s*\d{1,3}(?:,\d{3})+(?:\.\d+)?\s*\)?|\(?\s*-?\s*\d+(?:\.\d+)?\s*\)?/g;
  // Matches Thai dates: DD/MM/YY, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD MMM YY
  const DATE_RES = [
    /\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/,
    /\b(\d{1,2}\s+(?:ม\.?ค\.?|ก\.?พ\.?|มี\.?ค\.?|เม\.?ย\.?|พ\.?ค\.?|มิ\.?ย\.?|ก\.?ค\.?|ส\.?ค\.?|ก\.?ย\.?|ต\.?ค\.?|พ\.?ย\.?|ธ\.?ค\.?)\.?\s*\d{2,4})\b/,
    /\b(\d{1,2}[\/\-](?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[\/\-]\d{2,4})\b/i,
    /\b(\d{4}-\d{2}-\d{2})\b/
  ];

  /** Find first date string in text. Returns the matched string or null. */
  function findDateInText(text) {
    for (const re of DATE_RES) {
      const m = text.match(re);
      if (m) return m[1];
    }
    return null;
  }

  /** Find ALL number strings in text, in left-to-right order. */
  function findNumbersInText(text) {
    return (text.match(NUM_RE) || []).map(s => s.trim()).filter(s => s);
  }

  /** Mask out things that LOOK like numbers but aren't transaction amounts:
   *  account numbers (XXX-X-XXXXX-X), phone numbers (0XX-XXX-XXXX or 10-digit),
   *  times (HH:MM), and reference IDs of 12+ digits.
   *  Run this AFTER stripping the date string. */
  function maskNonAmounts(text) {
    if (!text) return text;
    let s = text;
    // Account-number patterns (4-part with dashes) — covers KBank/SCB/BBL/KTB styles
    s = s.replace(/\b\d{1,4}-\d{1,2}-\d{1,7}-\d{1,2}\b/g, ' [ACCT] ');
    // Account-number patterns (3-part with dashes) — e.g. 123-456789-0
    s = s.replace(/\b\d{3}-\d{6}-\d\b/g, ' [ACCT] ');
    // Phone patterns: 0XX-XXX-XXXX or 0XX XXX XXXX (with required separators)
    s = s.replace(/\b0\d{1,2}[\s-]\d{3}[\s-]\d{4}\b/g, ' [PHONE] ');
    // 10-digit numbers without separators that start with 0 (Thai phone) or are very long
    s = s.replace(/\b0\d{9}\b/g, ' [PHONE] ');
    s = s.replace(/\b\d{12,}\b/g, ' [REF] ');
    // Time HH:MM(:SS)
    s = s.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' [TIME] ');
    return s;
  }

  // ---------- Universal parser ----------

  /** Parse a flat array of rows (strings) into transactions.
   *  opts:
   *    bank: id (informational; passed through to each tx)
   *    refDate: Date for BE/CE year inference
   *    startBalance: optional starting balance (satang) — if not provided, inferred
   *                  from a "Brought forward" row or from the row before the first
   *                  transaction.
   */
  function parseStatement(rowsOrText, opts = {}) {
    // Accept either array of rows (strings or arrays) OR a full text blob.
    let rows;
    if (typeof rowsOrText === 'string') {
      rows = rowsOrText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    } else if (Array.isArray(rowsOrText)) {
      rows = rowsOrText.map(r => Array.isArray(r) ? rowText(r) : String(r));
    } else {
      return [];
    }

    const bank = opts.bank || 'unknown';
    const refDate = opts.refDate || new Date();
    const tx = [];

    // 1) Find brought-forward / opening balance if present.
    let prevBalance = null;
    for (const r of rows) {
      if (/brought ?forward|ยอดยกมา|opening balance|ยอดต้นงวด/i.test(r)) {
        const nums = findNumbersInText(r);
        if (nums.length) {
          prevBalance = U.toSatang(nums[nums.length - 1]);
          break;
        }
      }
    }
    if (prevBalance == null && opts.startBalance != null) prevBalance = opts.startBalance;

    // 2) Parse each row.
    for (let i = 0; i < rows.length; i++) {
      const text = rows[i];
      if (!text) continue;
      // Skip obvious header/footer rows.
      if (/page \d+|หน้า \d+|วันที่|date.*description|ยอดยกมา|brought ?forward|รวม|^total\b|statement of account|รายการเดินบัญชี/i.test(text)
          && !findDateInText(text)) {
        continue;
      }

      const dateStr = findDateInText(text);
      if (!dateStr) continue;
      const iso = U.parseThaiDate(dateStr, refDate);
      if (!iso) continue;

      // If the row text contains TWO dates (effective + value), we want the first one.
      // Already handled because findDateInText returns first match.

      // Strip the date string from the row so we don't pick it up as a number.
      let rest = text.replace(dateStr, ' ');
      // Strip a possible second date too.
      const dateStr2 = findDateInText(rest);
      if (dateStr2) rest = rest.replace(dateStr2, ' ');
      // Mask account numbers, phone numbers, time strings — these LOOK numeric
      // but should not enter the amount/balance pool.
      rest = maskNonAmounts(rest);

      const numStrs = findNumbersInText(rest);
      if (!numStrs.length) continue;

      const nums = numStrs.map(s => U.toSatang(s)).filter(n => n != null);
      if (!nums.length) continue;

      // Description = rest with all numbers stripped, normalized.
      let desc = rest;
      for (const ns of numStrs) desc = desc.replace(ns, ' ');
      desc = desc.replace(/\s+/g, ' ').trim();

      // Determine which number is the balance and which is the amount.
      // Heuristics, in priority order:
      //   A) If exactly 3 numbers: [debit, credit, balance] — last is balance,
      //      and exactly one of first two is non-zero.
      //   B) If exactly 2 numbers: [amount, balance] — verify by checking
      //      whether (prevBalance ± amount ≈ balance) for some sign.
      //   C) If 1 number: just amount, no balance — direction unknown unless
      //      we have prevBalance hint via running sum (skipped — left as expense).

      let amountSatang = null, balance = null, direction = null;

      if (nums.length >= 3) {
        // Take last as balance, find the one nonzero in [0..len-2]
        balance = nums[nums.length - 1];
        const debit = nums[nums.length - 3];
        const credit = nums[nums.length - 2];
        if (Math.abs(debit) > 0 && Math.abs(credit) === 0) {
          amountSatang = Math.abs(debit); direction = 'debit';
        } else if (Math.abs(credit) > 0 && Math.abs(debit) === 0) {
          amountSatang = Math.abs(credit); direction = 'credit';
        } else if (Math.abs(debit) > 0 && Math.abs(credit) > 0) {
          // Both — unusual; pick the one that matches balance delta.
          if (prevBalance != null) {
            const dDeb = balance - (prevBalance - Math.abs(debit));
            const dCre = balance - (prevBalance + Math.abs(credit));
            if (Math.abs(dDeb) < Math.abs(dCre)) {
              amountSatang = Math.abs(debit); direction = 'debit';
            } else {
              amountSatang = Math.abs(credit); direction = 'credit';
            }
          } else {
            amountSatang = Math.abs(debit); direction = 'debit';
          }
        } else {
          // Both zero — some statements use "0.00" placeholders
          amountSatang = 0; direction = null;
        }
      } else if (nums.length === 2) {
        const a = nums[0], b = nums[1];
        // Assume b is balance, a is amount; verify with prevBalance.
        if (prevBalance != null) {
          const expectIn  = prevBalance + Math.abs(a);
          const expectOut = prevBalance - Math.abs(a);
          // Allow tiny rounding drift (1 satang)
          if (Math.abs(b - expectIn) <= 1) { amountSatang = Math.abs(a); balance = b; direction = 'credit'; }
          else if (Math.abs(b - expectOut) <= 1) { amountSatang = Math.abs(a); balance = b; direction = 'debit'; }
          else {
            // Maybe order is [balance, amount] (rare); try swap
            const expectIn2  = prevBalance + Math.abs(b);
            const expectOut2 = prevBalance - Math.abs(b);
            if (Math.abs(a - expectIn2) <= 1) { amountSatang = Math.abs(b); balance = a; direction = 'credit'; }
            else if (Math.abs(a - expectOut2) <= 1) { amountSatang = Math.abs(b); balance = a; direction = 'debit'; }
            else {
              // Couldn't reconcile. Default: smaller is amount, larger is balance.
              if (Math.abs(a) < Math.abs(b)) { amountSatang = Math.abs(a); balance = b; }
              else { amountSatang = Math.abs(b); balance = a; }
              direction = inferDirectionByKeywords(desc);
            }
          }
        } else {
          // No prev balance: assume [amount, balance].
          amountSatang = Math.abs(a); balance = b;
          direction = inferDirectionByKeywords(desc);
        }
      } else {
        amountSatang = Math.abs(nums[0]);
        direction = inferDirectionByKeywords(desc);
      }

      if (amountSatang == null) continue;
      if (amountSatang === 0 && balance == null) continue; // pure noise row

      // Final type fallback if direction still unknown
      if (!direction) direction = inferDirectionByKeywords(desc) || 'debit';
      const txType = direction === 'credit' ? 'income' : 'expense';

      tx.push({
        date: iso,
        type: txType,
        amount: amountSatang,
        balance: balance,
        description: desc,
        bank,
        source: 'import'
      });

      if (balance != null) prevBalance = balance;
    }

    return tx;
  }

  function inferDirectionByKeywords(desc) {
    if (!desc) return null;
    if (/รับโอน|โอนเข้า|เงินเดือน|ดอกเบี้ย|deposit|credit|incoming|refund|salary|BSD02|NBSDT|TRSF.*IN/i.test(desc)) return 'credit';
    if (/โอนออก|ถอน|จ่าย|พร้อมเพย์|ATM|withdrawal|debit|outgoing|fee|ค่าธรรมเนียม|KTC|DDSWT|TRSF.*OUT/i.test(desc)) return 'debit';
    return null;
  }

  // ---------- High-level API ----------

  /** Parse from raw pdf.js page text items.
   *  pages: [{ items: [...] }]
   *  fullText: optional; if not provided we'll concat row text. */
  function parsePdfPages(pages, fullText) {
    const allRows = [];
    for (const p of pages) {
      const pageRows = groupRowsByY(p.items || p);
      for (const r of pageRows) allRows.push(rowText(r));
    }
    const text = fullText || allRows.join('\n');
    const bank = detectBank(text);
    const transactions = parseStatement(allRows, { bank: bank.id });
    return { bank, transactions, rows: allRows };
  }

  const API = {
    BANKS, detectBank, groupRowsByY, rowText,
    findDateInText, findNumbersInText, maskNonAmounts,
    parseStatement, parsePdfPages
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof root !== 'undefined') root.P = API;
})(typeof window !== 'undefined' ? window : globalThis);
