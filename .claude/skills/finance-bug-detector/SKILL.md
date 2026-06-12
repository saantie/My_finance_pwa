---
name: finance-bug-detector
description: >
  Use this skill whenever debugging, reviewing code, or investigating unexpected behavior
  in the Thai finance PWA. Triggers: "bug", "ผิด", "ไม่ทำงาน", "ยอดผิด", "รายการหาย",
  "crash", "undefined", "NaN", "permission denied", "ลบไม่ได้", "ซ้ำ", "import ไม่ได้",
  "สีผิด", "dark mode พัง", "Firebase error", "parse ผิด", "โอนเงินนับเป็นรายจ่าย",
  "ยอดบัญชีไม่ตรง", "voice ซ้ำ", "recipient ลบไม่ได้", "Gemini ไม่ทำงาน",
  "AI วิเคราะห์ไม่สำเร็จ", code review, หรือ audit.
  Grounded in CLAUDE.md + actual code (June 2026).
---

# Finance PWA — Bug Detector (v5 — June 2026)

## Test Command (ต้องผ่านเสมอ — 311+ tests, CI บังคับทุก push)
```bash
node --import ./tests/loader.mjs tests/run.mjs
```

---

## Category Index

| Symptom | Category |
|---|---|
| ยอดเงิน / NaN / ตัวเลขผิด | → [A] Satang Arithmetic |
| รายการหาย, ซ้ำ, import ผิด, income↔expense สลับ | → [B] Parser / Import |
| ยอดบัญชีไม่ตรง | → [C] Balance Calculation |
| รายการถูกลบแต่ยังนับอยู่ | → [D] Soft Delete |
| Firebase permission-denied, shared account พัง | → [E] Firebase / Firestore |
| shared account ไม่หาย, revoke ไม่ได้, crash หลัง sign out | → [E] Firebase / Firestore |
| recipient กดลบแล้วไม่มีผล | → [E-NEW] Recipient Delete Bug |
| UI ผิด, สีผิด, icon ผิด | → [F] UI / Rendering |
| dark mode อ่านไม่ออก | → [F] UI / Rendering |
| voice input ข้อความซ้ำ | → [G] Voice Input |
| วันที่ผิด, ปีผิด | → [H] Date / Thai Calendar |
| forecast ผิด, recurring ไม่ทำงาน | → [I] Recurring / Forecast |
| Cash wallet ยอดเกิน | → [J] Cash Balance Override |
| localStorage อ่านผิด / ข้อมูลหาย | → [K] Storage Compact v2 |
| Drive backup ไม่ทำงาน | → [L] Drive Backup |
| duplicate ตรวจไม่เจอ | → [M] Duplicate Detector |
| Gemini AI fallback พัง (429/403/0 รายการ) | → [N] Gemini Fallback |
| กดอะไรแล้วหน้าเด้ง/รีเซ็ต, accordion พับเอง, focus หาย | → [O] Reactive Re-render |

---

## [A] Satang Arithmetic

```js
// ✅ utils.js functions:
bahtToSatang(baht)  // Math.round(Number(baht) * 100)
satangToBaht(sat)   // sat / 100 — display เท่านั้น
formatBaht(satang, { sign, decimals })
calc(expr)          // คืน float → ต้องผ่าน bahtToSatang() ก่อน store

// ❌ ไม่มีฟังก์ชัน satang() ใน codebase นี้
// amount เก็บ positive เสมอ; type บอก direction ไม่ใช่ sign
```

---

## [B] Parser / Import

### B1 — Income↔Expense Swapped
```js
// Primary fix: detectColumns(rows) → X-coordinate
// tx.direction = 'in' | 'out' | null
// autoClassifyType(tx, ownMasks): direction เป็น primary signal

// Verify: verifyParseResult(transactions) — diff tolerance ≤ 100 satang
```

### B2 — Skip Rows
```js
// isSkipRow(description) หลัง extract description แล้ว
// Keywords: B/F, C/F, ยอดยกมา, ยอดยกไป, Total, รวม, จำนวนรายการ
```

### B3 — Amount Limits
```js
if (amount === 0 || amount > 10000000) continue;  // > 10M = skip
// amount = Math.round(float * 100) ก่อน push
```

### B4 — scoreParseResult vs verifyParseResult
```js
scoreParseResult(result)       // รับ result object (มี .transactions, .bank, .pageCount)
verifyParseResult(transactions) // รับ array — balance arithmetic check
// ต้องใช้ทั้งคู่ร่วมกัน
```

---

## [C] Balance Calculation

```js
// ❌ อย่าใช้ account.current_balance ตรงๆ
// ✅ เสมอ:
computeAccountBalance(accountId)     // standard accounts
getEffectiveCashBalance(accountId)   // cash accounts

// activeTxs() เป็น private internal — ใช้ผ่าน exported functions เช่น getTransactions()
// getTransactions() = active only (deleted_by == null)
// getTransactionsByDay() = รวม soft-deleted จาก cloud (แสดงสีเทา — ตั้งใจ)

// Transfer ไม่นับใน income/expense totals เลย
```

---

## [D] Soft Delete — Two-Stage (cloud accounts เท่านั้น)

```js
// local account → ลบทันที ไม่มี soft delete
// cloud account → ขั้น 1: deleted_by = email; ขั้น 2: deleteDoc()
// soft-deleted: แสดงในlist (สีเทา) ไม่นับใน calculations
```

### ⚠️ Bug #26 (แก้แล้ว): Recipient Delete ต้องใช้ getState()
```js
// ❌ Bug เดิม: getTransactions() filter soft-deleted ออก → find() undefined
State.getTransactions().find(t => t.id === id)  // คืน undefined ถ้า soft-deleted!

// ✅ Fix: ใช้ getState().transactions ซึ่งรวม soft-deleted
State.getState().transactions.find(t => t.id === id)

// กฎ: delete handler ที่ recipient กด ต้องเข้าถึง soft-deleted transactions เสมอ
```

---

## [E] Firebase / Firestore

### Firestore Path (จริง)
```js
// ✅ flat collection:
doc(_db, 'shared_accounts', accountId)
doc(_db, 'shared_accounts', accountId, 'transactions', txId)
// ❌ ไม่ใช่ users/{email}/accounts/{id}
```

### migrateAccountToCloud() Order
```js
// 1. setDoc(accountRef) ก่อน — rules ทำ get() parent
// 2. getDocs existing → delete owner's old txs (ไม่ลบของคนอื่น)
// 3. batch write transactions (≤499 per batch)
```

### updateSharedWith() — เรียกเสมอ
```js
await updateSharedWith(accountId, []);  // empty list = revoke all
// ❌ อย่า skip เมื่อ list ว่าง
```

### ⚠️ Bug #29 (แก้แล้ว): Firebase Token
```js
// ❌ internal field (อาจเปลี่ยนทุกเวลา):
result._tokenResponse?.oauthAccessToken

// ✅ official API:
GoogleAuthProvider.credentialFromResult(result).accessToken
```

### Sign-Out Sequence
```js
unsubscribeAll()
clearReceivedAccounts(myEmail)  // ล้าง UI ทันที
await signOut()
```

### pending_sync
```js
// push ไม่สำเร็จ → pending_sync: true → retryPendingSync() หลัง sign in
// ❌ อย่าลืมเรียก retryPendingSync() ใน app.js หลัง sign in
```

---

## [F] UI / Rendering

### bankGradient() ต้องตรงกับ CSS
```js
// แก้ที่ JS ต้องแก้ CSS ด้วย และกลับกัน
bankGradient(bank, type)  // ใน add.js
// .acct-icon.{bank}  // ใน styles.css
```

### Dark Mode: Element ใหม่ต้องมี override
```css
html[data-dark="1"] .new-element { color: ...; background: ...; }
// bugs แก้แล้ว: .chip, .seg-item, .signin-btn
```

### SVG ใน Playwright Mockup
```html
<!-- ต้อง inline attributes ทุกตัว: -->
fill="none" stroke="white" stroke-width="2"
stroke-linecap="round" stroke-linejoin="round"
<!-- หมายเหตุ: app จริงใช้ stroke="currentColor" + CSS color:white -->
<!-- Playwright ต้องใส่ stroke="white" โดยตรง -->
```

### Shared Badge (feature ใหม่)
```css
/* .shared-badge + .entry-cat { display: flex } */
/* ไอคอน users 11px หน้า category label — รายการในบัญชีแชร์ */
/* ถ้า badge ไม่แสดง ตรวจ CSS display + icon size */
```

### escapeHtml() — XSS
```js
// ทุก user input ใน innerHTML ต้องผ่าน escapeHtml()
```

### ⚠️ Bug #31 (แก้แล้ว): ปุ่มซ้อนทับข้อความใน flex row
```css
/* ❌ Bug เดิม: .setting-row ไม่มี gap + ปุ่มถูกบีบจนข้อความล้นทับคอลัมน์ซ้าย
   เห็นชัดเมื่อ: ข้อความไทยยาว / text_size=xlarge / จอแคบ 360px */

/* ✅ กฎ flex row ที่มีปุ่ม (ใช้แล้วใน .setting-row + .setting-seg-btn): */
.row  { display:flex; gap:12px; }            /* ระยะห่างเสมอ */
.text { flex:1; min-width:0; }               /* ข้อความเป็นฝ่ายหด/ตัดบรรทัด */
.btn  { flex-shrink:0; white-space:nowrap; } /* ปุ่มห้ามถูกบีบ */

/* กฎทดสอบ UI ใหม่: เช็คที่ text size ใหญ่สุด (xlarge) + viewport 360px
   ข้อความไทยยาวกว่าอังกฤษเสมอ — อย่าทดสอบด้วยข้อความสั้น */
```

---

## [G] Voice Input

### ⚠️ Bug #25 (แก้แล้ว): Text ซ้ำ 4 ครั้ง
```js
// ❌ Bug เดิม: finalTranscript += สะสมทุก onresult event
// Chrome continuous=true ยิง onresult หลายรอบสำหรับ segment เดียวกัน

// ✅ Fix: อ่านแค่ result ล่าสุด
const result = e.results[e.results.length - 1];
// ไม่ใช้ += สะสม

// ถ้า voice ยังซ้ำ → ตรวจว่า patch นี้ apply แล้วใน voice.js
```

---

## [H] Date / Thai Calendar

```js
// ✅ parseLocalDate(iso) = timezone-safe ไม่มี UTC shift
// ❌ new Date('2026-05-08') → UTC midnight → อาจเป็นวันที่ 7 ใน TH timezone

// Storage: CE เสมอ; Display: พ.ศ. ผ่าน formatShortDate() / formatLongDate()
// 2-digit year: > 43 → BE (+2500 → -543 = CE); ≤ 43 → CE (+2000)
```

---

## [I] Recurring / Forecast

### Duplicate Guard
```js
State.getTransactions().filter(tx =>
  tx.source === 'scheduled' &&
  tx.template_id === t.id &&
  tx.date === t.next_due
).length === 0  // ก่อนสร้าง tx ใหม่
```

### getOpeningBalance() — ห้าม store ตายตัว
```js
// คำนวณ on-the-fly: current_total − income_from_cutoff + expense_from_cutoff
// transfer ไม่นับ (net zero)
```

---

## [J] Cash Balance Override

```js
// getEffectiveCashBalance(): ถ้ามี override → นับจาก override_date เท่านั้น
// transfer เข้า/ออก นับด้วย (ไม่ใช่แค่ ATM withdraw อย่างที่คิดเดิม)
```

---

## [K] Storage Compact v2

```js
// Storage key: 'diary_finance_v2' (ไม่ใช่ v1)
// compact keys: amt, grp, ds, af, at, src, uc, cb, cn, db, ps, ca(ms), ua(ms), bal

// ❌ อย่าอ่าน localStorage ตรงๆ
// ✅ ใช้ State functions เสมอ — expandTx() จัดการ compact format
// expandTx() มี fallback รองรับ v1 field names (amount, group, etc.)
```

---

## [L] Drive Backup (แทน Email backup — email ถูกตัดออกแล้ว)

```js
// drive.js: uploadBackup() / downloadBackup() / getBackupInfo() / requestDriveAccess()
// scope: drive.file (non-sensitive) — ใช้ token เดียวกับ Google sign-in
// ไฟล์เดียว diary-finance-backup.json (create หรือ PATCH)
// settings.last_drive_backup = 'YYYY-MM-DD'; auto-backup ทุก 7 วันใน session ที่มี token

// ⚠️ token หมดอายุเมื่อ page reload (Firebase session restore ไม่คืน access token)
//    → requestDriveAccess() popup อัตโนมัติเมื่อ user กดปุ่ม — อย่า cache token ข้าม reload
// ⚠️ Email backup (mailto:/Web Share) ถูกลบหมดแล้ว — อย่าอ้างถึง
```

---

## [M] Duplicate Detector

```js
findPotentialDuplicates(newTx, existingTxs, threshold=0.7)
// ต่างกัน ≤ 100 satang AND ≤ 7 วัน AND similarity ≥ 0.7
// ⚠️ daysBetween() ใช้ new Date() (UTC) — อาจ off by 1 วัน near midnight
//    ถ้าแก้ให้ใช้ parseLocalDate() จาก utils.js แทน
```

---

## [N] Gemini Fallback (AI วิเคราะห์ PDF)

```js
// gemini.js — เรียกเมื่อ parse confidence < 60 + user consent
// Error → สาเหตุ (จากการ debug จริง มิ.ย. 2026):
// 429 "limit: 0"        → model ถูกปิด (2.0-flash ตายแล้ว) หรือ key เป็น AQ./OAuth token
// 403 "method blocked"  → API restriction บน key ไม่มี Gemini API (generativelanguage)
// GEMINI_NO_KEY         → Vercel env var ไม่ได้ตั้ง / ยังไม่ Redeploy / SW cache เก่า
// ได้ 0 รายการทั้งที่ AI ทำงาน → ส่ง extractedText ขยะแทนไฟล์ (เช็ค isEncrypted flag)

// กฎ: key ต้องเป็น AIzaSy จาก Cloud Console (ไม่ใช่ AQ. จาก AI Studio)
//     ส่งผ่าน header x-goog-api-key (ไม่ใช่ ?key=)
//     model ปัจจุบัน gemini-3.5-flash — เช็ค shutdown date ก่อนเปลี่ยน
//     อ่าน response: รวม text ทุก parts ข้าม thought parts
// รายละเอียดเต็ม: CLAUDE.md §8
```

---

## [O] Reactive Re-render Side Effects

```js
// สถาปัตยกรรม: ทุก State.setSetting / addTransaction / template change →
// notify() → State.subscribe(() => renderCurrentView()) → re-render ทั้งหน้า (innerHTML)
// ⇒ การกด toggle/ปุ่มเล็กๆ อะไรก็ตาม = ทั้งหน้าถูกวาดใหม่
```

### ⚠️ Bug #30 (แก้แล้ว): กด toggle แล้วหน้าเด้งขึ้นบนสุด
```js
// ❌ Bug เดิม: renderView() มี window.scrollTo(0,0) (ถูกต้องตอนเปลี่ยนแท็บ)
//    แต่ renderCurrentView() (reactive re-render) วิ่งผ่านเส้นทางเดียวกัน
//    → กด toggle ในหน้าตั้งค่า = scroll หายไปบนสุดทุกครั้ง

// ✅ Fix (app.js): renderCurrentView จำ scroll แล้ว restore
function renderCurrentView() {
  const y = window.scrollY;
  renderView(currentView);
  window.scrollTo(0, y);
}
```

### กฎ 2 ข้อของ render path
```js
// 1. ห้ามใส่ side effect ใหม่ใน render functions (scroll/focus/selection/timer)
//    เพราะมันจะยิงซ้ำทุกครั้งที่ state เปลี่ยน — ไม่ใช่แค่ตอนเข้าหน้า
// 2. UI state ที่ต้องรอด re-render → เก็บใน module-level var เสมอ
//    pattern ที่ใช้แล้ว: _settingsOpenSection (accordion ใน views.js),
//    _recurSuggestions — innerHTML ใหม่อ่านค่าจาก var ตอน render
//    ❌ เก็บใน DOM (class/attribute) อย่างเดียว = หายตอน re-render
```

---

## Pre-Commit Checklist

```
□ node --import ./tests/loader.mjs tests/run.mjs  → 311+ tests passing (suite ต้องเขียวเสมอ)
□ amount ทุกตัว → bahtToSatang() ก่อน store
□ ใช้ account_from / account_to ไม่ใช่ account_id (ใน Transaction)
□ ใช้ group ไม่ใช่ category สำหรับ filter/classify
□ Balance → computeAccountBalance() / getEffectiveCashBalance()
□ Date objects → parseLocalDate() ไม่ใช่ new Date(isoString)
□ Firestore path: shared_accounts/{id}
□ bankGradient() ตรงกับ CSS .acct-icon.{bank}
□ Dark mode: element ใหม่มี html[data-dark="1"] override
□ SVG inline attrs ครบ (Playwright mockup)
□ innerHTML user data ผ่าน escapeHtml()
□ transfer ไม่นับใน income/expense totals
□ retryPendingSync() เรียกหลัง sign in
□ delete handler ใช้ getState().transactions.find() ไม่ใช่ getTransactions().find()
□ Firebase token: credentialFromResult(result).accessToken
□ แก้ JS ที่ browser โหลด → bump VERSION ใน sw.js (CI มี guard บังคับแล้ว)
□ Voice onresult: e.results[e.results.length - 1] ไม่ใช่ +=
□ render functions ไม่มี side effect ใหม่ (scroll/focus) — re-render ยิงซ้ำทุก state change
□ UI state ที่ต้องรอด re-render เก็บใน module-level var (ดู [O])
□ flex row มีปุ่ม: gap + ปุ่ม flex-shrink:0 + ข้อความ min-width:0 (ดู Bug #31)
□ UI ใหม่เช็คที่ text_size=xlarge + จอ 360px
□ JS module ใหม่ → เพิ่มเข้า SHELL_FILES ใน sw.js (กัน offline cache ไม่ครบ)
```
