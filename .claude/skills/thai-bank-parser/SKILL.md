---
name: thai-bank-parser
description: >
  Use this skill whenever working on PDF e-statement parsing, debugging parsers.js,
  adding a new bank, interpreting confidence scores, or fixing income/expense classification.
  Triggers: parsers.js, PDF import, detectBank, confidence, verifyParseResult, scoreParseResult,
  KBank/SCB/BBL/KTB/BAY parsing, "รายการผิด / ธนาคารใหม่ / import ไม่ได้ / direction ผิด".
  Grounded in CLAUDE.md + actual code (June 2026).
---

# Thai Bank PDF Parser (June 2026)

> Parser ที่อ่านไม่ได้ (confidence < 60) → Gemini AI fallback — ดู CLAUDE.md §8
> (ส่งไฟล์จริงเสมอ; extractedText เฉพาะ PDF มีรหัส; review modal ยืนยันบัญชีปลายทางทุก import)

## Flow จริง (parsePDF → return)
```
File → pdf.js → decrypt if password
  ↓ groupRowsByY(items, tolerance=2)
  ↓ detectBank(fullText) → bank string
  ↓ detectAccountInfo(fullText, bank) → { account_number_masked, last4 }
  ↓ State.addAccount() auto-detect ถ้า last4 && bank !== 'unknown'
  ↓ parseTransactions(allRows, bank) → rawTransactions[]
  ↓ .map(tx => ({ ...tx, type: autoClassifyType(tx, ownMasks), group: autoClassifyGroup(tx) }))
  ↓ verifyParseResult(transactions)
  → return { bank, accountInfo, transactions, pageCount, extractedText, verification, errors:[] }
```

## detectBank() — 16 banks
```js
'kbank'|'ktb'|'scb'|'bbl'|'bay'|'ttb'|'gsb'|'baac'|'ghb'|'cimb'|'uob'|'tisco'|'kkp'|'lhbank'|'icbc'|'sc'
// lhbank = Land and Houses Bank, icbc = ICBC Thailand, sc = Standard Chartered Thailand
// คืน 'unknown' ถ้าหาไม่เจอ
// Launch focus: kbank, ktb, scb, bbl, bay (80%+ coverage)
```

## detectColumns() — X-coordinate Based
```js
// หาใน 30 rows แรก; ต้องมี ≥ 2/3 keywords (withdrawal/deposit/balance)
// → { withdrawalX, depositX, balanceX } หรือ null
// null → fallback heuristic (amount pattern matching, direction=null)
```

## isSkipRow(description)
```js
// เรียกหลัง extract description (หลังตัด date+amount+time)
// B/F, C/F, ยอดยกมา, ยอดยกไป, Total, รวม, จำนวนรายการ
```

## autoClassifyType(tx, ownMasks)
```js
// direction === 'in':
//   cash deposit/ฝากเงินสด/cdm → 'transfer'; own mask match → 'transfer'; else → 'income'
// direction === 'out':
//   atm/ถอน/cdm → 'transfer'; credit card payment → 'transfer'; own mask → 'transfer'; else → 'expense'
// direction === null (fallback):
//   เงินเดือน/salary/payroll/ดอกเบี้ย/cashback/refund/รับโอน → 'income'; else → 'expense'
```

## scoreParseResult vs verifyParseResult
```js
scoreParseResult(result)        // รับ result object (.transactions, .bank, .pageCount)
                                // คืน 0-100; < 60 → แนะนำ Gemini
verifyParseResult(transactions) // รับ array; balance arithmetic; diff ≤ 100 satang
                                // { ok, opening, closing, computed, totalIn, totalOut, diff }
// ต้องใช้ทั้งคู่ร่วมกัน — score ต่ำ ≠ balance ผิด
```

## Transaction จาก parseTransactions()
```js
{
  date: 'YYYY-MM-DD',          // CE แล้ว (แปลงจาก พ.ศ. ระหว่าง parse)
  amount: Math.round(x*100),   // satang
  balance: Math.round(x*100)|null,
  description,                 // max 80 chars หลังตัด date+amount+time
  bank, raw_text, direction,
  source: 'import',
  user_classified: false
  // type + group เพิ่มโดย autoClassify หลัง parse
}
```

## Amount Limits
```js
amount === 0 || amount > 10000000 → skip
// Fallback (ไม่มี column detection):
// 1 amount → tx amount
// 2 amounts → ใหญ่=balance, เล็ก=tx
// 3+ amounts → ตัวสุดท้าย=balance, ตัวแรก>0=tx
```

## Year 2-digit Detection
```js
year > 43 → year + 2500 (BE) → -543 = CE
year ≤ 43 → year + 2000 (CE)
valid range: 2000 ≤ CE ≤ 2100 — นอกนี้ skip
```

## Gemini Fallback
```
Trigger: scoreParseResult < 60 + user consent
PDF password-protected → ส่ง extractedText (plain text) ไม่ส่งไฟล์
PDF ไม่มีรหัส → ส่ง base64
403 → แสดง "กรุณาเปิด aistudio.google.com ก่อนใช้งาน"
Privacy: consent dialog ทุกครั้งก่อนส่ง
```

## Adding a New Bank
```
1. เพิ่ม regex ใน detectBank()
2. เพิ่ม column layout ใน detectColumns() ถ้าต่างจาก standard
3. เพิ่มสีใน bankGradient() (add.js) + CSS .acct-icon.{bank} (styles.css) — ต้องตรงกัน
4. เพิ่ม test cases ใน tests/run.mjs
5. node --import ./tests/loader.mjs tests/run.mjs
```

## Test Runner
```bash
node --import ./tests/loader.mjs tests/run.mjs
# loader.mjs mocks Firebase CDN URLs สำหรับ Node.js ESM
# 280 tests — ต้องเขียวทั้งหมด (CI บังคับทุก push)
```
