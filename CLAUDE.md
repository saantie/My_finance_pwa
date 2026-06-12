# Project Knowledge — Thai Personal Finance PWA

Single source of truth for decisions, research, design, and project state.

Version: 2.0 — June 2026 · Owner: solo developer · Stage: pre-launch polish

---

## 1. Vision & Positioning

Thai expense-tracking app that **cuts manual entry by 90%** via PDF e-Statement import from Thai banks, plus low-balance alerts before money runs out.

> Tagline: "แค่อัปโหลด PDF จากแอปธนาคาร — เห็นพฤติกรรมการเงินทันที"

**Core USPs (defendable moats):**
1. PDF e-Statement parser for 16 Thai banks — no competitor has this
2. Min-balance + days-below-threshold alerts — targets paycheck-to-paycheck users
3. Free PWA / web version — no Thai competitor offers one
4. Local-first privacy — data stays on device by default
5. Thai context: Buddhist Era dates, Thai banks, Thai voice NLP

**Anti-positioning:** not "Piggipo but better", not "Money Manager in Thai" (Wallet Story did that), not "every feature" (solo-dev trap).

**Target user:** salaried urban Thais 25–40 with multiple bank accounts, digital-first (PromptPay 80M+ accounts), can download PDF e-Statements but won't log manually. Segments: digital-first salaryperson 70%, cash-heavy freelance 20%, multi-bank power user 10%.

**Key competitor gaps we fill:** PDF import (nobody), min-balance alert (nobody), free PWA (nobody in TH), local-first (rare), BE dates + Thai banks (only Wallet Story/MAKE).

**Lessons from 4.9★ apps** (Money manager & expenses, Money+ Cute): stability = brand ("no issues" reviews sell the app); reply to every review within a day; playful colorful UI beats rigid professional in mass market; recurring transactions are a killer feature; 2-tap entry; "local storage = selling point"; built-in calculator; multi-ledger.

---

## 2. Retention Research (drives all UX decisions)

| Stat | Implication |
|---|---|
| 70% abandon finance/lifestyle apps within 100 days | retention is everything |
| 88% abandon after a glitch | stability > features |
| Finance apps retain 4.5% by day 30 | industry baseline is brutal |
| 68% abandon during onboarding | onboarding must be minimal |
| 0.1s feedback threshold | every tap needs instant response |

**Top quit reasons (ranked):** tracking fatigue → emotional discomfort/guilt → onboarding friction → privacy anxiety → trust erosion from bugs → goal achieved.

**Counter-strategies:** PDF import kills tracking fatigue (one-shot 50 entries); reframe guilt as insight (comparative framing, never "over budget!"); show value before asking for anything; privacy as first-page selling point; **NO streak mechanics** (research: streak = guilt = quit); design for cyclical users (active 2 weeks → gone a month → returns).

**KPIs:** MAU/install ratio, time-to-first-value, voluntary return rate. NOT DAU, NOT time-in-app (good tool = used briefly).

---

## 3. Product Principles

**Core (never change):** local-first · lazy entry (system works, user doesn't) · no guilt · no friction (no forced signup/setup) · reversible (user can undo any system decision) · visible (no silent decisions).

**Anti-patterns (never do):** required signup; streak counters/daily badges; sad/angry mascots; full-screen red "over budget" warnings; "you've been gone N days" notifications; silent auto-merge/delete of user data; ads in critical paths; hard paywalls; analytics SDKs that ship financial behavior.

**Tone:** state facts, don't judge. "เหลือ 5 วัน + 2,000 ฿" not "Over budget!" · "เดือนนี้ใช้มากกว่าเดือนก่อน 12% — เป็นช่วงเทศกาลรึเปล่า?" not "You spent too much" · "9 วันที่ยอดใกล้เกณฑ์" not "Days below threshold: 9".

---

## 4. Data Model

### Transaction
```typescript
{
  id: string,                    // UUID
  date: "YYYY-MM-DD",            // ISO Gregorian internally, displayed as BE
  type: "income" | "expense" | "transfer" | "investment" | "debt" | "refund",
  amount: number,                // integer satang, positive
  balance: number | null,        // satang, end-of-tx balance from statement
  category: string, group: string,
  description: string,
  account_from: string | null, account_to: string | null,
  bank: string | null,
  source: "import" | "manual" | "voice" | "sheet",
  user_classified: boolean,      // true = user edited; parser must never override
  created_by: string | null,     // Gmail of creator; null = local
  created_by_name: string | null,// display_name snapshot at save time (shared accounts)
  deleted_by: string | null,     // soft delete: Gmail of deleter; null = active
  createdAt, updatedAt: ISO timestamp
}
```

### Account
```typescript
{
  id: string,                    // "bank:ktb:7821" | "cash:default" | "bank:manual:default" ...
  bank: string | null,
  account_number_masked: string, // keep last 4 digits only
  display_name: string,
  type: "bank" | "cash" | "credit_card" | "ewallet" | "investment" | "debt",
  current_balance: number | null,
  threshold: number,             // satang, per-account alert override (default global 200000)
  user_renamed: boolean,
  owner: string | null,          // Gmail, set on sign-in + share
  storage: "local" | "cloud",   // "cloud" automatically when shared_with.length > 0
  shared_with: string[]
}
```

Default accounts (4): `cash:default`, `bank:manual:default`, `invest:default`, `debt:default`. Users can add more (any type) in Settings.

### Recurring template
`{ id, pattern: { description_match, amount_range, day_of_month, frequency }, type, category, group, account_id, confidence, last_occurrence, next_expected, user_confirmed }` — suggest only at confidence ≥ 0.8, never auto-create.

### Settings
`{ threshold_satang (default 200000), theme, language: "th", text_size: "normal"|"large"|"xlarge", display_name, notification_enabled, affiliate_disabled, last_drive_backup }`

### UserProgress (gamification, pending UI)
`{ xp, level (1-8), streak_days, last_coin_date, coins: { bronze, silver, gold } }`
Levels: 1 มือใหม่หัดจด 0 · 2 นักจดฯ ฝึกหัด 200 · 3 ผู้รู้จักตัวเองทางการเงิน 500 · 4 นักบัญชีครัวเรือน 1000 · 5 นักวางแผนชำนาญ 2000 · 6 นักออมมีวินัย 3500 · 7 นักบริหารเงินเริ่มต้น 5000 · 8 นักบริหารเงินฝีมือฉกาจ 8000.
Daily coins: bronze +10 XP (≥1 entry), silver +25 (≥1 entry + balance ok), gold +50 (≥3 entries + balance ok + income this week). Streak bonus 7d +70 / 30d +300. UX must be subtle: toasts/badges, no popups, level shown in settings not dashboard.

### Model decisions
- **Wallet auto-detect, never manual setup.** Cash wallet auto-created on first ATM withdrawal seen in PDF. If user logs few cash expenses, show gentle hint ("ถอน ATM 18,000 แต่บันทึกแค่ 2,000 — อาจลืม").
- **Transfers are not expenses.** ATM → transfer bank→cash; credit-card payment → transfer bank→cc; own-account PromptPay → transfer. Dashboard income/expense excludes transfers.
- **Duplicate detection:** review screen checks amount+date (+description similarity) against existing txs, auto-unchecks suspects and shows the matching existing tx for comparison. User decides; never auto-merge.
- **Soft delete (shared accounts):** first delete sets `deleted_by` (shown grey/strikethrough, excluded from math); second delete = hard delete from Firestore. `activeTxs()` in state.js filters `deleted_by == null` before every calculation.
- **Refund** = type `refund`; embedded fees parsed as separate fee column.

---

## 5. Features

### v1.0 — DONE
- **F1.1 PDF import:** 16-bank parser — kbank, ktb, scb, bbl, bay, ttb, gsb, baac, ghb, cimb, uob, tisco, kkp, lhbank, icbc, sc (launch focus: KTB, KBank, SCB, BBL, BAY = 80%+ coverage). Password-protected PDFs: pdf.js throws `PasswordException` → prompt user → retry; decrypted `extractedText` kept for the AI fallback. Confidence scoring → score < 60 offers AI fallback (user consents each time). Review screen with partial selection + duplicate warnings. ATM cash rule: only ATM withdrawals add to cash balance on import (incoming transfers don't).
- **F1.2 Accounts:** parser reads account number from header → auto-creates account (masked, last-4 only). Rename via popup modal (pencil icon). Manual add (choose type). Delete = 2 options: transactions only (account stays, balance 0) or account + transactions. Per-account balance computed from actual transactions by account_id, NOT statement balance. Dashboard shows only active accounts (balance ≠ 0, from PDF, or user-renamed) with empty-state CTA.
- **F1.3 Min-balance alert:** per-account, default 2,000฿ threshold, days-below count, month-over-month trend, soft visual (no scary red).
- **F1.4 Manual entry:** modal "บันทึกรายการ"; account picker (bottom-sheet) above category; amount row centered with mic; built-in calculator; 6 frequency options in 3×2 grid (วันนี้ | ย้อนหลัง backdate max=yesterday | ล่วงหน้า | ทุกเดือน | ทุกสัปดาห์ | ผ่อน); edit via pencil/swipe-left → pre-filled modal → sets `user_classified=true`.
- **F1.5 Voice input:** Web Speech API + custom Thai NLP, handles Thai number words.
- **F1.6 Dashboard:** hero insight card → today's entries → active accounts → top categories → 14-day SVG expense chart (today=terracotta, weekend=mocha, dashed avg line; data from `activeTxs()`) → recent txs → 30-day cashflow forecast (computed from real balances).
- **F1.9 Backup:** manual JSON export/import + **Google Drive backup** (`drive.file` scope — non-sensitive, no Google verification needed). Single file `diary-finance-backup.json` (create or PATCH). Auto-backup every 7 days in sessions with a token. Token expires on reload → `requestDriveAccess()` popups on demand. Email backup was removed entirely.
- **F1.10 Themes:** 7 color themes (Diary default warm-orange, Ocean, Forest, Rose, Citrus, Violet, Carbon navy) + separate dark-mode toggle (`data-dark="1"` on `<html>`) + text size 3 levels via `:root` font-size (16/18/20px rem cascade). Pinch-zoom never blocked.
- **F1.11 UX shell:** bottom nav 4 tabs + center FAB, full-screen add modal, in-app keypad. Settings = accordion menu (June 2026): ทุก section พับเก็บ เปิดได้ทีละส่วน ยกเว้น profile/Level card แสดงตลอด; `_settingsOpenSection` คงไว้ข้าม re-render; deep-links (`setSettingsOpenSection()`) เปิด section ก่อน scroll.
- **F1.12 Selective account sharing** (realtime Firestore — see §7).
- **F1.14 List view:** month selector (default current), working filter chips (all/expense/income/transfer), search within month.

### Import account confirmation (June 2026)
Review modal always shows a **"นำเข้าไปยังบัญชี" picker card**:
- Account detected from file → preset as default ("ตรวจพบจากไฟล์ — แตะปุ่มเพื่อเปลี่ยน"); confirming imports as before; user may override → imports into chosen account and does NOT create the detected one.
- No account detected → "เลือกบัญชี" button; if left unset, imports unassigned (no friction).
- Reuses `openAccountPickerModal()` from add.js. `assignTxAccounts()` helper applies account + ATM/CDM cash routing in both paths.
- Known limitation: the parser path also upserts the detected account at *parse* time (parsers.js), so an overridden detected account may exist empty (deletable in Settings).

### Pending
- F1.7 Onboarding 3-screen (privacy promise → import/skip → aha-moments)
- F1.8 Privacy story page ("0 KB sent to server today")
- F1.13 Gamification UI (model done, see §4)
- Microinteractions polish (haptics, scale animations), swipe actions on list, empty states with 2-path CTA
- F2.1 auto-detect recurring from PDF history (engine done, detection pending)
- F2.2 forecast calendar view (chart done)
- F2.3 gentle reminders — weekly digest done (toast); recurring due upgraded June 2026: เตือนล่วงหน้า 0–3 วัน (`notify_days_ahead`, default 1) + system notification เด้ง/มีเสียง (notify.js → SW `showNotification`; toast = fallback เมื่อยังไม่ grant permission) + Periodic Background Sync บน Android installed PWA (sw.js อ่าน mirror จาก IndexedDB `diary-notify` เพราะ SW อ่าน localStorage ไม่ได้; dedupe key `id|next_due|phase` เตือน 1 ครั้งตอนใกล้ครบ + 1 ครั้งวันครบ). ข้อจำกัด: iOS ได้เฉพาะตอนเปิดแอป (push ตรงเวลาแบบ Messenger ต้องมี server — ตัดสินใจไม่ทำ เพราะขัด local-first)

### Later (v1.2+)
Affiliate suggestions (client-side engine, Involve Asia/AccessTrade, "[โฆษณา]" disclosure per สคบ.); in-app PDF bug report; slip OCR (jsQR primary on-device → Gemini Vision fallback); 16-bank expansion; v2.0 full cloud sync (opt-in), investment tracking, net-worth dashboard.

---

## 6. UX & Design System

**Principles:** time-to-first-value < 5s · one thumb one tap · data as story ("ใช้น้อยกว่าเดือนก่อน 8%") · microinteraction feedback < 100ms · empty states teach · skeleton > spinner · smart defaults · color = meaning · 3× type hierarchy.

**Layout:** bottom nav = Home / นำเข้า / [FAB +] / สถิติ / ตั้งค่า.

### Design tokens — Diary (default)
```
bg #fdfaf6 · surface #fff · ink #2d3748 · ink-faint #718096 · rule #efe5d4
primary #e88e3c→#f5a623 gradient · accent-soft #fef3e7
income #5a9d63 · expense #d96b5e · transfer #5e9bd6
mocha #c89368 · plum #b378c0 · honey #e8b649 · terracotta #c0694c
radius 14px cards / 10px small / pill 9999px · font Sarabun · shadow ~12%
```

**Bank gradients — CSS `.acct-icon.{bank}` and JS `bankGradient()` in add.js MUST stay in sync:**
ktb #5fb0e0→#3787c5 · kbank #6cc16c→#45984a · scb #b378c0→#8a59a0 · bbl #4f7eb8→#2a5a94 · bay #e8b649→#c79939 · cash/other #c89368→#a07246

**Category colors (white Lucide stroke on solid bg — Apple Wallet pattern, never tinted bg):**
food #ff8a5c · transport #5e9bd6 · shopping #e879a3 · utility #f0b942 · health #5a9d63 · entertain #8b6db5 · rent #b8825e · salary #5a9d63 · creditcard #d96b5e · promptpay #5e9bd6

**Themes:** each overrides `--primary`, `.fab`, `.hero::before`, `.add-save` via `data-theme` on `<html>`; `applyTheme()`/`applyDark()` in views.js. Carbon = navy #1e3a72, cool bg #f1f4f9, Noto Sans Thai, tabular-nums, tighter radius, own dark-safe palette (#0d1829). Pro mode = navy/serif/sharp 2px radius.

**Dark-mode gotcha:** `.chip`, `.seg-item`, sign-in button need explicit contrast overrides under `html[data-dark="1"]` — white-on-white text bug pattern.

**Microinteractions:** button scale 0.97 + haptic; save = checkmark draw + green flash; delete = slide-out + undo toast; errors shake; loading = skeletons.

---

## 7. Architecture

| Layer | Tech | Notes |
|---|---|---|
| Frontend | Vanilla JS PWA | no framework |
| PDF parse | pdf.js + parsers.js | local-first, offline |
| AI fallback | Gemini API (see §8) | only when confidence < 60 + user consent |
| Voice | Web Speech API + Thai NLP | on-device |
| Charts | inline SVG (chart.js helper) | responsive via viewBox |
| Storage | localStorage (private) + Firestore (shared only) | hybrid keeps privacy USP |
| **Hosting** | **Vercel** — `my-finance-pwa-two.vercel.app`, auto-deploy on push to `main` | repo: github.com/saantie/My_finance_pwa |
| Secrets | Vercel env vars + build script (see §8) | keys never in git |
| Android | TWA wrapper (Play Store planned) | needs custom domain + assetlinks.json before submit |
| iOS | phase 2+ | |
| Crash/analytics | Sentry + PostHog planned | |

### Data flow
PDF → pdf.js (password prompt if encrypted) → groupRowsByY → detectBank → parseStatement → confidence score → (≥60 review | <60 offer AI → Gemini → merge) → review modal (select txs + **confirm destination account**) → `State.addTransactionsBatch` → localStorage → reactive render. Shared accounts additionally sync via Firestore.

### Firestore shared accounts
- Sign-in (Google only) → `subscribeSharedAccounts()` immediately (own cloud accounts) → `subscribeAccountsSharedWithMe(email)` (`array-contains` query) → `mergeSharedAccounts()` adds/updates/revokes.
- Owner: full control + share/revoke. Recipient: add txs, soft-delete, "ปฏิเสธ" (self-remove) — cannot delete account or re-share.
- Two-stage delete: 1st = soft (`deleted_by`), 2nd = `hardDeleteTransaction()`; `docChanges()` type `removed` propagates.
- Sign-out → `unsubscribeAll()` + `clearReceivedAccounts(myEmail)`.
- `created_by_name` snapshotted into tx at save (recipient can't look up owner's settings).
- Security rules: read/write only `owner` + `shared_with`.

**Critical Firestore bug patterns (do not repeat):**
1. `migrateAccountToCloud`: `await setDoc(accountRef)` FIRST, then batch transactions separately — subcollection rules `get()` the parent doc, which must be committed.
2. `remove-share-email`: always call `updateSharedWith()` even when the new list is empty, else Firestore never revokes.
3. `mergeSharedAccounts` revoke condition must be `a.owner !== myEmail` (NOT `a.owner && ...`) or `owner: null` accounts never revoke.
4. Soft-deleted-row lookups must use `State.getState().transactions` — `State.getTransactions()` filters out `deleted_by != null`, so recipients couldn't hard-delete.
5. OAuth token: use `GoogleAuthProvider.credentialFromResult(result).accessToken` (official), never `result._tokenResponse.oauthAccessToken` (internal, unstable).

### Storage format
localStorage v2 (`diary_finance_v2`): `compactTx()`/`expandTx()` (~55% smaller — keys `amt/grp/ds/af/at`, Unix-ms timestamps, derived fields dropped).

### Firebase config
`FIREBASE_CONFIG` is hardcoded in firebase.js (Firebase web config is not secret; security = Firestore rules). The empty `FIREBASE_CONFIG` in js/config.js is unused legacy.

### Service worker
Cache-first for all same-origin requests. **Every deploy that changes JS must bump `VERSION` in sw.js** (currently `diary-v6.25.x`) or browsers keep stale files — this has bitten config.js and gemini.js before. Users reload twice: 1st activates new SW, 2nd fetches fresh files.

---

## 8. Gemini AI Fallback (June 2026 — current setup)

**Purpose:** parse statements the local parser can't (confidence < 60). User consents per use. Privacy: normal PDFs sent as base64 (vision reads the real file); password-protected PDFs send decrypted `extractedText` only (Gemini can't decrypt files). The `isEncrypted` flag in views.js controls this — never send extracted text for normal PDFs (garbled text layers were causing 0-transaction results).

**Key management (keys NEVER in git — GitHub Push Protection blocks them):**
- `js/config.js` is committed with `GEMINI_API_KEY = ""`.
- Real key lives in **Vercel → Settings → Environment Variables → `GEMINI_API_KEY`**.
- `scripts/build-config.js` (run by `vercel.json` `buildCommand`) injects it into config.js at deploy. Build log shows `✓ injected` or `(empty)`.
- After changing the env var you must **Redeploy** — it's baked at build time.

**Key type gotchas (hard-won June 2026):**
- AI Studio now issues **`AQ.`-prefix keys that DO NOT work** with the `generativelanguage.googleapis.com` REST endpoint (429 `limit: 0` / 401). Also `AQ.Ab8...`-style Google **OAuth access tokens** are not API keys at all.
- Working key: **`AIzaSy...` created in Google Cloud Console** → APIs & Services → Credentials → Create API key (project `finance-diary-d9d5d`).
- Must enable **"Gemini API"** (service: `generativelanguage.googleapis.com`; formerly "Generative Language API") in the project, or the API-restriction dropdown won't list it and calls 403 "method blocked".
- Key restrictions (REQUIRED — Google rejects unrestricted standard keys after **June 19, 2026**; all standard keys face rejection ~Sept 2026, watch for auth-key migration): Website restriction `https://my-finance-pwa-two.vercel.app/*` (+ future custom domain for Play Store) + API restriction = Gemini API only.
- Note: enabling Gemini API lets every key in the project call it — keep the Firebase key API-restricted too.

**Calling convention (gemini.js):**
- Model: `gemini-3.5-flash`. History: `gemini-2.0-flash` shut down June 1 2026 (caused 429 `limit: 0`); `gemini-2.5-flash` shuts down Oct 16 2026 — skip it.
- Send key via **`x-goog-api-key` header**, never `?key=` in URL.
- Join `text` from ALL response parts, skipping `thought` parts (newer models split output).
- Errors mapped: `GEMINI_NO_KEY`, `GEMINI_BAD_KEY`, else raw message.
- Gemini result maps `account_number_last4` → `accountInfo.last4` (the field confirmImport uses) so AI-detected accounts bind like parser-detected ones.

---

## 9. Codebase

```
index.html            shell + bottom nav + FAB + modal mount
manifest.webmanifest  PWA manifest
sw.js                 service worker — BUMP VERSION EVERY DEPLOY
vercel.json           buildCommand: node scripts/build-config.js, outputDirectory "."
scripts/build-config.js  injects GEMINI_API_KEY env var into js/config.js
css/styles.css        all themes (~1700+ lines)
js/
  config.js           committed with empty GEMINI_API_KEY (injected at deploy)
  icons.js            38 inline Lucide SVGs + CATEGORIES map + svgIcon()
  utils.js            formatBaht, satang, BE↔CE, Thai numwords, todayISO, calc()
  state.js            state + activeTxs() + compactTx/expandTx + shared-account merge
  parsers.js          16-bank PDF parser; detectColumns() X-coords for in/out;
                      isSkipRow() filters B/F, C/F, ยอดยกมา, Total;
                      tx.direction ('in'/'out') primary signal for autoClassifyType;
                      verifyParseResult() cross-checks balance arithmetic
  voice.js            Web Speech + Thai NLP (read only LAST result —
                      Chrome continuous=true re-fires onresult, += duplicated text 4x)
  pdf.js              pdf.js wrapper + password support
  chart.js            dailyExpenseBars(), cashflowForecast() inline SVG
  recurring.js        template engine + scheduler + getForecast()
  notify.js           system notifications + IndexedDB mirror + periodic sync
  reminders.js        smart reminders ตอนเปิดแอป (toast/notification, once-per-day)
  firebase.js         Auth + Firestore client (hardcoded web config)
  drive.js            Drive backup: uploadBackup/downloadBackup/requestDriveAccess
  gemini.js           AI fallback (see §8)
  add.js              add/edit modal, openAccountPickerModal(), bankGradient()
  views.js            all views; review modal + account confirmation; confirmImport;
                      assignTxAccounts(); _runGeminiFallback
  app.js              entry, routing, auth lifecycle
tests/run.mjs         280 tests — all passing; runner exits 1 on failure
tests/loader.mjs      ESM loader mocking Firebase CDN imports for Node
.github/workflows/test.yml  CI: runs tests on every push/PR to main
```

Test command: `node --import ./tests/loader.mjs tests/run.mjs`
**Keep the suite green** — a perpetually red suite hides real regressions. CI enforces this on push.

---

## 10. Business Model

Free forever for all core features (PDF import, voice, manual, dashboard, alerts, forecast, local storage). No subscription (top competitor complaint; Thai users won't pay; free 4.9★ apps win). Phase 2 (month 6+): affiliate suggestions — credit cards 200–1,500฿/approval, savings accounts, loans via Involve Asia/AccessTrade; client-side suggestion engine (spending data never leaves device); "[โฆษณา]" disclosure; e-commerce registration required.

---

## 11. Roadmap & Risks

**Pre-launch:** microinteractions + swipe actions + empty states + gamification UI → onboarding + privacy page → bank fixtures + Sentry + privacy policy/TOS (Thai) + DBD registration + Play Console ($25) + TWA (custom domain + assetlinks.json) → soft launch 50 beta → Play Store.

**Post-launch:** recurring auto-detect, forecast calendar, reminders → more banks, slip OCR, bug report → affiliate → year 2: full cloud sync, net worth, bank APIs (if BoT opens), iOS.

**Top risks:** banks change PDF formats (fixtures + in-app report + CSV fallback) · Wallet Story copies PDF import (launch fast) · solo-dev burnout (narrow scope) · crash bugs tank rating (Sentry, fix < 24h) · PDPA (legal review pre-launch). **Gemini API churn is now a proven risk** — model shutdowns and key-policy changes broke the app twice in one month; pin docs, prefer stable GA models, keep parser primary.

### Tech Debt (the single place debts are recorded — add here when incurred)

| Debt | Pay when |
|---|---|
| `views.js` ~3,000 lines — all views + import flow + review modal in one file | split after launch (too risky before) |
| `prompt()`/`confirm()` still used for PDF password + AI-consent dialogs | replace with styled modals during microinteractions polish |
| Parser upserts detected account at *parse* time, before review confirm — overridden accounts linger empty | move account creation into confirmImport |
| Review-modal account-picker card uses inline styles | move to styles.css with next CSS touch |
| Unused legacy `FIREBASE_CONFIG` block in js/config.js | delete on next config.js change |
| Firebase CDN pinned 10.12.0; tests/loader.mjs mocks may drift from real SDK | review at v2.0 cloud-sync work |
| No Sentry/PostHog yet | pre-launch ops (already in roadmap) |

---

## 12. Key Decisions (condensed log)

| Decision | Why |
|---|---|
| Auto-detect wallets from PDF, no manual setup | zero friction + min-balance USP works |
| No subscription; affiliate later | Thai market, competitor complaints |
| Local-first, Firestore only for shared | PDPA + privacy USP |
| 5 banks at launch (not 16) | 80/20, solo maintenance |
| No streaks | research: streak = guilt = quit |
| TWA not native; iOS later | solo dev, PWA reuse; migrate native at MAU > 50K |
| Firebase not Sheets for sync | avoids OAuth verification (4–8 wks, $15–75K assessment) |
| Drive backup (`drive.file`) replaced email backup | non-sensitive scope, same sign-in token; dev enables Drive API once in Cloud Console |
| Gemini = fallback only, never replaces parsers.js | privacy + offline; trigger = confidence < 60 + consent |
| **Hosting moved GitHub Pages → Vercel** | env-var build injection for Gemini key; buy domain at Play Store submit |
| **Gemini key via Cloud Console (`AIza`), not AI Studio (`AQ.`)** | AQ. keys fail on generativelanguage REST endpoint |
| **`gemini-3.5-flash`** | 2.0 shut down Jun 1 2026; 2.5 dies Oct 16 2026 |
| **AI fallback sends real PDF file; text only when encrypted** | extracted text from broken layers gave 0 results |
| **Review modal confirms destination account on every import** | prevent wrong-account imports; detected = default, override skips creating detected |
| Edit → `user_classified=true` | parser never overrides user choices |
| created_by_name snapshot at save | recipients can't resolve owner settings |
| Two-stage delete in shared accounts | everyone sees deletion before it's permanent |
| Account picker = bottom-sheet, never `prompt()` | UX, stylability |
| Charts = inline SVG | responsive viewBox, no library |
| List view defaults to current month | full history scroll was unusable |
| Recipient can't delete shared account — only "ปฏิเสธ" (self-remove) | deletion is owner's right |
| Don't block pinch-zoom; in-app text size via :root rem | accessibility is a real Thai user pain |
| **No auto-seeded sample data on first run (June 2026)** — demo data is opt-in only via "ลองข้อมูลตัวอย่าง" in empty state; legacy `_sample` patch kept in app.js | fresh installs must start clean |

---

## Appendix

**Glossary:** PWA · TWA (PWA in Play Store wrapper) · PDPA (Thai data protection law) · พ.ศ. BE = CE + 543 · satang = ฿/100 · activeTxs() = non-deleted filter · soft/hard delete (§4) · bankGradient() (§6).

**Research base:** NCBI app-abandonment scoping review · UXCam finance benchmarks · NN Group · Business of Apps retention data · direct review analysis of 12+ competitor apps (Money Manager, Money Lover, Piggipo GO, Wallet Story, MAKE, Money+ Cute, Cashew, etc.) · Pantip discussions.

*End — v2.0, June 2026*
