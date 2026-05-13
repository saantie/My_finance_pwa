# Project Knowledge — แอปการเงินส่วนตัวภาษาไทย

**เอกสารฉบับเดียวที่รวมทุกการตัดสินใจ, research, design choices และ state ของ project**

Version: 1.0 — May 2026
Owner: Solo developer
Stage: Pre-launch (mockup approval phase)

---

## Table of Contents

1. [Vision & Positioning](#1-vision--positioning)
2. [Target Market & User](#2-target-market--user)
3. [Competitor Analysis Summary](#3-competitor-analysis-summary)
4. [Behavioral / Retention Research](#4-behavioral--retention-research)
5. [Product Principles](#5-product-principles)
6. [Data Model](#6-data-model)
7. [Feature Specification](#7-feature-specification)
8. [UX & Design System](#8-ux--design-system)
9. [Business Model](#9-business-model)
10. [Technical Architecture](#10-technical-architecture)
11. [Codebase State](#11-codebase-state)
12. [Roadmap](#12-roadmap)
13. [Risk Register](#13-risk-register)
14. [Open Questions](#14-open-questions)
15. [Decision Log](#15-decision-log)

---

## 1. Vision & Positioning

### Vision
แอปบันทึกรายรับ-รายจ่ายภาษาไทยที่ **ลดงานบันทึกของผู้ใช้ 90%** ด้วยการนำเข้า PDF e-Statement จากธนาคารไทย พร้อมเตือนยอดต่ำสุดล่วงหน้าก่อนเงินจะขาด

### Tagline
> **"แค่อัปโหลด PDF จากแอปธนาคาร — เห็นพฤติกรรมการเงินทันที"**

### Core USPs (defendable moats)
1. **PDF e-Statement parser 16 ธนาคารไทย** — ไม่มีแอปไหนในตลาดทำได้, ใช้เวลาทำเป็นปี
2. **Min balance + days-below-threshold alert** — feature เฉพาะที่ตอบ pain ของคนใกล้ paycheck-to-paycheck
3. **PWA / Web version ฟรี** — แก้ pain "ไม่มี PC version"
4. **Local-first privacy** — แตกต่างจากทุกแอปที่บังคับ cloud
5. **เข้าใจบริบทไทย** — พ.ศ., ธนาคารไทย, voice NLP ภาษาไทย

### Anti-positioning (สิ่งที่จะไม่เป็น)
- ❌ "เหมือน Piggipo แต่ดีกว่า" — brand เขาแกร่ง, ขายไม่ออก
- ❌ "เหมือน Money Manager แต่ภาษาไทย" — Wallet Story ทำไปแล้ว
- ❌ "ครบทุก feature" — เป็น trap ของ solo dev

---

## 2. Target Market & User

### Primary persona
**คนเงินเดือน 25-40 ปี ในเขตเมือง** ที่:
- มีบัญชีหลายธนาคาร (เงินเดือน + ออม + บัตรเครดิต)
- ใช้ digital banking เป็นหลัก (PromptPay, แอปธนาคาร, บัตรเครดิต)
- ดาวน์โหลด PDF e-Statement จากแอปธนาคารได้ แต่ไม่อยากบันทึกเอง
- ต้องการเห็นภาพการเงินรวมของตัวเอง โดยไม่ยอมแลกกับ privacy

### Market sizing
- PromptPay มี **80M+ บัญชี** (BoT 2024-2025)
- กลุ่ม digital-first ในไทย ~70-80% ของกลุ่มเป้าหมาย
- Cash-heavy กลุ่ม freelance/ครอบครัว/ตลาด ~20-30%

### User segments (priority)
| Segment | % ของ target | ใช้แอปอย่างไร |
|---|---|---|
| Digital-first salaryperson | 70% | PDF import + auto-detect บัญชี = สมบูรณ์เกือบ 100% |
| Cash-heavy freelance | 20% | ต้องการ wallet manual + cash tracking ละเอียด |
| Multi-bank power user | 10% | นำเข้า PDF หลายไฟล์ + min balance per account |

---

## 3. Competitor Analysis Summary

### 3.1 Top competitors

| App | Rating | Downloads | Strengths | Weaknesses |
|---|---|---|---|---|
| Money manager & expenses (Orange Dog, สโลวีเนีย) | 4.9★ | 10M+ | Playful UI, stable, dev engagement | Privacy concerns, no PDF import |
| Money Tracker (Horoscope365, จีน) | 4.9★ | 5M+ | Recurring, multi-currency, double-entry | Privacy concerns, no PDF |
| Money+ Cute (จีน) | 4.8-4.9★ | 5M+ | Cute UI, local storage, calculator | No bank import |
| Cashew (solo dev) | 4.8★ | 1M+ | Beautiful UI, Google Sheet import | No multi-bank, no PDF |
| Cash Book (อินเดีย, solo) | 4.7★ | 1M+ | Quick entry, business focus | Restore bug, no charts |
| Money Manager (Realbyte) | 4.5★ | 100M+ | Most features, PC web | Sync paywall, complex |
| Money Lover (เวียดนาม) | 4.3★ | 10M+ | Auto-categorize, Krungsri sync | Crashes, expensive premium |
| Piggipo GO (ไทย) | 4.5★ | 500K+ | Credit card focus | Hard paywall, single card free |
| Wallet Story (ไทย) | 4.7★ | 500K+ | Buddhist Era, investment | No PC, no sync, no PDF |
| MAKE by KBank | 4.5★ | 5M+ | Free, real-time KBank sync | KBank only |

### 3.2 Market gaps ที่แอปนี้จะ fill

| Gap | คู่แข่งทำได้ไหม? | ของเรา |
|---|---|---|
| PDF e-Statement import (ธนาคารไทย) | ❌ ไม่มีตัวไหน | ✅ |
| Min balance + days-below alert | ❌ ไม่มีตัวไหน | ✅ |
| Forecast calendar (ยอดในอนาคต) | Expense Manager (PFinance) เท่านั้น | ✅ planned v1.1 |
| PWA / Web version ฟรี | ❌ ไม่มี free option ในไทย | ✅ |
| Local-first privacy | Money+ Cute, Cash Book บางส่วน | ✅ |
| เข้าใจ พ.ศ. + ธนาคารไทย | Wallet Story, MAKE | ✅ |
| Voice input ภาษาไทย NLP ดี | MeTang (ทำไม่ดี) | ✅ |

### 3.3 Top user pain points (ranked by frequency)

| # | Pain | ความถี่ | แอปนี้แก้ไหม |
|---|---|---|---|
| 1 | บันทึกเองทีละรายการ ขี้เกียจ ลืมจด | 🔥🔥🔥🔥🔥 | ✅ PDF import |
| 2 | ไม่มี cloud sync ฟรี เปลี่ยนเครื่องข้อมูลหาย | 🔥🔥🔥🔥🔥 | ⚠️ Drive backup v1.0, Firestore v2.0 |
| 3 | ไม่มี PC version ใช้ลำบาก | 🔥🔥🔥🔥 | ✅ PWA |
| 4 | App crash บ่อย | 🔥🔥🔥🔥 | ⚠️ test ดี + Sentry |
| 5 | การโอนข้ามบัญชีนับเป็นรายจ่าย (model ผิด) | 🔥🔥🔥 | ✅ transfer type |
| 6 | Ads รบกวน | 🔥🔥🔥 | ✅ ไม่มี |
| 7 | Premium แพง / paywall hard | 🔥🔥🔥 | ✅ ฟรีตลอด core |
| 8 | Voice รับรู้ผิด ไม่เข้าใจไทย | 🔥🔥 | ✅ Thai NLP layer |
| 9 | ไม่ realtime หลังบันทึก | 🔥🔥 | ✅ reactive |
| 10 | ไม่เข้าใจ พ.ศ. | 🔥🔥 | ✅ BE↔CE auto |

### 3.4 Lessons จากแอป 4.9★

จาก Money manager & expenses (Orange Dog) ที่ได้ 4.9★ + 10M downloads:
- **Stability + zero bugs = brand** — review ที่ขายแอปนี้คือ "no issues"
- **Developer engagement** — ตอบทุก review ภายใน 1 วัน → trust building
- **Playful + colorful UI** ชนะ rigid + professional ใน mass market
- **Recurring transactions** = killer feature
- **2-tap entry** ลด friction

จาก Money+ Cute (4.8-4.9★):
- **"Cute" คือ product strategy** ไม่ใช่ adjective
- **Local storage = selling point** *"NO ADS and DATA NOT COLLECTED!!! Wow!"*
- **Built-in calculator** ในหน้า input
- **Multi-ledger** สำหรับแยก context

---

## 4. Behavioral / Retention Research

### 4.1 ตัวเลขที่ต้องรู้

| Stat | Source | Implication |
|---|---|---|
| 70% เลิกใช้แอป lifestyle/finance ภายใน 100 วัน | NCBI scoping review | Retention คือทุกอย่าง |
| 88% abandon หลังเจอ glitch | UXCam | Stability > feature |
| Finance apps retain 4.5% by day 30 | Business of Apps | Industry baseline ต่ำมาก |
| 73% switch banks เพื่อ UX ดีกว่า | Forrester | UX = competitive moat |
| 68% abandon onboarding | Industry data | Onboarding ต้องสั้นที่สุด |
| 0.05 sec = first impression | UX research | First screen สมบูรณ์แบบ |
| 0.1 sec = feedback ทันใจ | Nielsen Norman | ทุก tap ต้อง response |

### 4.2 6 เหตุผลที่ user เลิกใช้ (ranked)

1. **Tracking fatigue** 🔥🔥🔥🔥🔥 — *"didn't like being so aware of how little money I had"*
2. **Emotional discomfort** 🔥🔥🔥🔥 — เห็นรายจ่าย = รู้สึกผิด → หลบแอป
3. **Friction/onboarding** 🔥🔥🔥🔥 — ขอข้อมูลเยอะเกินก่อนเห็น value
4. **Privacy anxiety** 🔥🔥🔥 — กลัวข้อมูลการเงินรั่ว
5. **Trust erosion จาก bug** 🔥🔥🔥 — *"transactions duplicate, go missing → stop trusting"*
6. **Goal achieved/lost** 🔥🔥 — happy abandonment

### 4.3 ความท้าทายเฉพาะของแอปการเงิน

- **Reward ไม่ทันที** — บันทึก 1 ครั้ง → ผลเห็นหลัง 30 วัน (Duolingo: ทันที)
- **Reward เป็น negative** — เห็นรายจ่ายเยอะ = guilt (Fitness: ดี)
- **User รู้อยู่แล้ว** — *"I know I spent too much on coffee"* → ไม่ต้องเปิดแอปก็ได้

### 4.4 กลยุทธ์ป้องกันการเลิกใช้

1. **ลด tracking fatigue** — PDF import (one-shot 50 รายการ)
2. **เปลี่ยน guilt → insight** — comparative framing, ไม่ใช่ "over budget!"
3. **Lazy entry onboarding** — เห็น value ก่อนขอข้อมูล
4. **Privacy = first-page selling point**
5. **NO streak mechanic** — research บอก: streak = guilt = quit
6. **Aha moment** ตั้งแต่ครั้งแรก
7. **ออกแบบสำหรับ user ที่ใช้เป็น cycle** (เปิด 2 อาทิตย์ → หาย 1 เดือน → กลับมา)

### 4.5 KPIs ที่ต้องวัด (ปรับตาม research)

✅ **MAU/Install ratio** — % ของ user ที่ยังกลับมา
✅ **Time-to-first-value** — กี่วินาทีถึงเห็น insight แรก
✅ **Voluntary return rate** — เปิดจาก home screen (ไม่ใช่ notification)
❌ **NOT** DAU — สำหรับ social media
❌ **NOT** Time-in-app สูง — แอป tool ที่ดี = ใช้น้อย ไม่ใช่ติดตา

---

## 5. Product Principles

### 5.1 Core principles (ห้ามเปลี่ยน)

1. **Local-first** — ข้อมูลอยู่ใน device โดย default
2. **Lazy entry** — ระบบทำงาน user ไม่ทำงาน
3. **No guilt** — แสดงข้อมูล ไม่ตัดสินผู้ใช้
4. **No friction** — ไม่บังคับ signup, setup, configure
5. **Reversible** — ทุกการตัดสินใจของ system ผู้ใช้แก้ได้
6. **Visible** — ระบบไม่ตัดสินใจอะไรลับๆ

### 5.2 Anti-patterns (ห้ามทำ)

❌ Required signup ก่อนใช้
❌ Streak counter, daily badge
❌ Mascot ที่ "เสียใจ/โกรธ" เมื่อใช้เงินเยอะ
❌ "Over budget!" warning สีแดงเต็มจอ
❌ Push notification "คุณหายไป N วัน"
❌ Auto-merge / auto-delete ข้อมูล user โดยไม่บอก
❌ Banner ad ในจุดสำคัญ
❌ Hard paywall เพื่อใช้ feature พื้นฐาน
❌ Email tracking, analytics SDK ที่ส่งพฤติกรรมการเงิน

### 5.3 Tone of voice

| ❌ ห้าม | ✅ ใช้ |
|---|---|
| "Over budget!" | "เหลือ 5 วัน + 2,000 ฿" |
| "Failed savings goal" | "ยังไปต่อได้ — เริ่มใหม่ทุกเดือน" |
| "30-day streak!" | "บันทึกครบ 23/30 วัน" |
| "You spent too much" | "เดือนนี้ใช้มากกว่าเดือนก่อน 12% — เป็นช่วงเทศกาลรึเปล่า?" |
| "Days below threshold: 9" | "9 วันที่ยอดใกล้เกณฑ์" |

---

## 6. Data Model

### 6.1 Transaction (core entity)

```typescript
{
  id: string,                    // UUID
  date: "YYYY-MM-DD",            // ISO Gregorian (ภายใน), แสดง พ.ศ.
  type: "income" | "expense" | "transfer" | "investment" | "debt" | "refund",
  amount: number,                // Integer satang (positive)
  balance: number | null,        // Integer satang, end-of-tx balance from statement
  category: string,              // "เงินเดือน", "อาหาร"
  group: string,                 // "salary", "food"
  description: string,
  account_from: string | null,   // Auto-detected from PDF
  account_to: string | null,     // Used for transfer type
  bank: string | null,           // "ktb", "kbank", ...
  source: "import" | "manual" | "voice" | "sheet",
  user_classified: boolean,      // true = user แก้แล้ว (อย่า override)
  created_by: string | null,     // Gmail ผู้บันทึก; null = local (ไม่ได้ sign in)
  deleted_by: string | null,     // Soft delete — Gmail ผู้ลบ; null = ยังไม่ถูกลบ
  createdAt: ISO timestamp,
  updatedAt: ISO timestamp
}
```

### 6.2 Account (auto-detected from PDF, NO manual setup required)

```typescript
{
  id: string,                    // "bank:ktb:xxx7821" or "cash:default"
  bank: string,                  // "ktb", "kbank", or null for cash
  account_number_masked: string, // "xxx-x-x7821-x" (เก็บแค่ 4 หลักท้าย)
  display_name: string,          // "กรุงไทย ...7821" (auto-generated)
  type: "bank" | "cash" | "credit_card" | "ewallet",
  current_balance: number | null,
  threshold: number,             // satang, สำหรับ alert (default = global)
  detected_at: ISO timestamp,
  user_renamed: boolean,
  owner: string | null,          // Gmail เจ้าของ (ตั้งตอน sign in + share)
  storage: "local" | "cloud",   // "cloud" อัตโนมัติเมื่อ shared_with.length > 0
  shared_with: string[]          // [] = private, ["email@..."] = selective share (v1.0)
}
```

### 6.3 Recurring template (auto-detected from PDF history)

```typescript
{
  id: string,
  pattern: {
    description_match: string,   // "ค่าไฟ MEA"
    amount_range: [min, max],
    day_of_month: number,
    frequency: "monthly" | "weekly" | "yearly"
  },
  type: "income" | "expense",
  category: string,
  group: string,
  account_id: string,
  confidence: number,            // 0-1
  last_occurrence: "YYYY-MM-DD",
  next_expected: "YYYY-MM-DD",
  user_confirmed: boolean
}
```

### 6.4 Settings

```typescript
{
  threshold_satang: number,      // Default 200000 (2,000 ฿)
  default_bank_for_cash: string,
  theme: "friendly" | "pro",     // Default = friendly
  language: "th",
  text_size: "normal" | "large" | "xlarge", // Default = normal, ปรับ font-size root
  privacy_mode: "local" | "sync",// future
  notification_enabled: boolean,
  affiliate_disabled: boolean
}
```

### 6.5 Wallet model decision: Auto-detect, ไม่บังคับ user

**ตัดสินใจ:** ไม่ให้ user ตั้ง wallet เอง — ระบบรู้จาก PDF อัตโนมัติ

**เหตุผล:**
- ไม่บังคับ wallet เลย → digital user accuracy 95%, แต่ USP min balance พัง
- บังคับ wallet manual → setup friction สูง, retention ตก (Money Manager พลาด)
- Auto-detect → digital 95% + cash 80% + USP ใช้งานได้ + zero friction

**Cash wallet:**
- Auto-create เมื่อ parser เจอ ATM ครั้งแรก
- ATM 5,000 ฿ → cash wallet +5,000
- User บันทึก expense จาก cash → ลด
- ถ้า user ไม่บันทึก cash expenses → ระบบเห็น *"ถอน ATM 18,000 แต่บันทึกแค่ 2,000 — อาจลืม"*

### 6.6 Transfer / duplicate detection (Layer 1+2)

**Layer 1 (v1.0):** Smart classify
- ATM → transfer (bank → cash)
- จ่ายบัตรเครดิต → transfer (bank → cc)
- โอนระหว่างบัญชีตัวเอง → transfer
- Dashboard income/expense ไม่นับ transfer

**Layer 2 (v1.1):** Duplicate detection
- ตอน user บันทึก manual หลัง import PDF
- Fuzzy match: amount ±1 บาท, วันที่ ≤ 7 วัน, description similarity > 0.7
- Popup *"คล้ายรายการก่อนหน้า — เป็นเดียวกันไหม?"*
- User เลือก keep/merge/skip — ไม่ auto-merge

### 6.7 Edge cases ใน data model

1. **ATM withdraw** → transfer (bank→cash), ไม่ใช่ expense
2. **บัตรเครดิต payment** → transfer (bank→cc), ไม่ใช่ expense
3. **PromptPay ระหว่างบัญชีตัวเอง** → transfer
4. **บันทึกซ้ำตรงๆ** → duplicate detection popup
5. **Refund** → type='refund' (ลบล้าง expense เดิม)
6. **Split transaction** (จ่ายแทนเพื่อน) → split feature ระบุส่วนตัวเอง
7. **Fee ฝัง** (โอนต่างธนาคาร 5,000 หัก 5,025) → parser แยก fee column

---

## 7. Feature Specification

### 7.1 v1.0 Launch features (must-have)

#### F1.1 — PDF e-Statement Import [HAVE]
- Auto-detect bank, parse transactions
- **5 ธนาคารหลัก at launch:** KTB, KBank, SCB, BBL, Krungsri/BAY (ครอบคลุม 80%+)
- ธนาคารอื่น → universal parser (อาจไม่สมบูรณ์ + bug report)
- Password-protected PDF support
- Auto-classify ATM/transfer/credit-card-payment เป็น `transfer`
- Review screen ก่อน import เสร็จ

#### F1.2 — Auto-Detect Account [NEW]
- Parser อ่านเลขบัญชีจาก header → create Account record
- Mask: เก็บแค่ 4 หลักท้าย "xxx-x-x7821-x"
- User rename ได้ ("กรุงไทย ...7821" → "บัญชีเงินเดือน")
- Manual entry default = "ไม่ระบุ" (ไม่บังคับ)

#### F1.3 — Min Balance Alert + Days Below Threshold [HAVE]
- Per-account view (ไม่ใช่ยอดรวม)
- Default threshold = 2,000 ฿ (override per account)
- Trend: เปรียบเทียบเดือนก่อน
- Visual: red row + ⚠️ icon (ไม่ scary)

#### F1.4 — Manual Entry [HAVE — needs polish]
- Quick add fields: amount + category + account + date + note
- **Calculator built-in** (1500+200, 1500*0.93)
- Smart defaults: today, expense, recent category
- Duplicate detection (Layer 2)
- **Edit existing transaction** — pencil icon บน row หรือ swipe-left → edit
  - Edit modal = quick-add modal แต่ pre-fill ข้อมูลเดิม
  - หลัง save → `user_classified = true` → parser จะไม่ override ค่านี้อีก

#### F1.5 — Voice Input (Thai NLP) [HAVE]
- "จ่ายค่าไฟ 450 บาท" → expense, 450, ค่าสาธารณูปโภค
- รองรับ Thai number words (ห้าสิบ, สองพัน)
- Web Speech API + custom NLP

#### F1.6 — Dashboard [HAVE — needs UX overhaul]
- **Hero insight card** "เดือนนี้คุณเหลือ +12,550 ฿" (จาก mockup)
- Income/Expense pair (secondary)
- Account list (auto-detect, with min-balance warning)
- Top categories (3-5)
- Daily balance line chart (with threshold)
- Recent transactions

#### F1.7 — Onboarding 3-screen [NEW]
- Screen 1: Privacy promise (3 sec)
- Screen 2: Import PDF / skip (5 sec)
- Screen 3: Aha-moment insights (after PDF processed)

#### F1.8 — Privacy Story Page [NEW]
- "Data ของฉันอยู่ที่ไหน" — marketing material in-app
- ✅ Transactions: localStorage
- ✅ PDF: process ใน browser
- ❌ ไม่มี analytics, ad network, server
- "0 KB sent to server today"

#### F1.9 — Backup Multi-layer [NEW]
- **Layer 1:** Manual JSON export/import (resilient parser)
- **Layer 2:** Auto Google Drive backup (`drive.file` scope, no OAuth verification needed)
- Sign in Google ครั้งเดียว → upload .json daily
- New device: sign in → auto-restore

#### F1.10 — 2 Themes [DONE in code]
- **Friendly mode (default)** — warm orange, cream, rounded, soft shadows
- **Pro mode** — Bloomberg/editorial, navy, dense
- Toggle ใน Settings (ไม่ใช่ topbar)

#### F1.10b — Text Size / Zoom [NEW]
- **Pinch-to-zoom:** ไม่ block native browser zoom — `viewport` meta ห้ามใส่ `user-scalable=no`
- **In-app text size:** Settings → ขนาดตัวอักษร → Normal / ใหญ่ / ใหญ่มาก
  - ใช้ `font-size` บน `:root` (rem cascade ทั้งแอป)
  - Normal = 16px, Large = 18px, XLarge = 20px
- เหตุผล: กลุ่มเป้าหมาย 25-40 ปี บางคนตาไม่ดี, ใช้บน mobile หน้าจอเล็ก

#### F1.11 — UX Overhaul [PLANNED — mockups approved]
- Bottom nav 4 tabs + center FAB
- Hero insight card
- Full-screen quick-add modal + in-app keypad
- Microinteractions (haptic, scale, tally)
- Swipe actions on list
- Skeleton loading + empty states with 2-path

#### F1.12 — Selective Account Sharing [v1.0 — Real-time]
- **Real-time sync ผ่าน Firebase Firestore** — อีกคนเห็นรายการใหม่ทันที
- Sign in ด้วย Google account เท่านั้น (ไม่มี setup ยุ่งยาก)
- เจ้าของบัญชีกรอก Gmail ผู้รับใน Settings → toggle "แชร์บัญชีนี้"
- แต่ละรายการแสดง "เพิ่มโดย X" / "ลบโดย X" (created_by / deleted_by)
- **Hybrid storage:**
  - บัญชีส่วนตัว (ไม่แชร์) → localStorage เท่านั้น (privacy USP ยังสมบูรณ์)
  - บัญชีที่แชร์ → Firestore + localStorage เป็น cache (offline queue)
- Migration: เมื่อ toggle share → push transactions เดิมขึ้น Firestore ครั้งเดียว
- Soft delete: shared account ไม่ลบจริง → ตั้ง `deleted_by` แทน
- Firestore security rules: อ่าน-เขียนได้เฉพาะ owner + shared_with เท่านั้น

### 7.2 v1.1 Features (เดือน 2-3 หลัง launch)

#### F2.1 — Recurring Transactions
- **Auto-detect from PDF history** (USP — คนอื่นไม่ทำ)
- ระบบเห็น "ค่าไฟ" ทุกวันที่ 5 จาก PDF 3 เดือน → suggest template
- User confirm → next month แสดง "ค่าไฟคาดว่า 1,200 ฿ ในอีก 8 วัน"
- Confidence ≥ 0.8 ถึง suggest
- ไม่ auto-create — user confirm ทุกครั้ง

#### F2.2 — Forecast Calendar
- USP ที่ไม่มีในแอปไทยตัวไหน
- Calendar view 30 วันข้างหน้า
- ใช้ recurring + scheduled bills
- Highlight วันที่ยอดจะต่ำกว่า threshold
- ระบุชัดว่าเป็น "คาดการณ์"

#### F2.3 — Smart reminders (gentle)
- Weekly digest: "สัปดาห์ที่ผ่านมาคุณบันทึก 12 รายการ"
- Recurring due: "ค่าไฟครบกำหนดวันนี้"
- ❌ ไม่ใช่: "คุณไม่ได้บันทึกมา 5 วัน!"

### 7.3 v1.2-v2.0 Features (เดือน 3-12)

#### F3.1 — Affiliate Suggestions (Phase 2 monetization)
- Tier 1: บัตรเครดิต, บัญชีออม, สินเชื่อ (no licensing)
- Tier 2: ประกัน, กองทุน (via licensed broker)
- ผ่าน Involve Asia / AccessTrade
- Insight card ใน dashboard
- ระบุ "[โฆษณา]" ตาม สคบ.
- Suggestion engine ฝั่ง client (ไม่ส่ง spending pattern ออก)

#### F3.2 — Bug Report ในแอป
- User เจอ PDF parse ไม่ได้ → กด "รายงาน" → ส่ง PDF (เซ็นเซอร์เลข) ให้ dev

#### F3.3 — Receipt OCR (Slip ภาษาไทย)
- Google ML Kit (on-device, ฟรี)
- Slip โอนพร้อมเพย์ → auto-fill amount, date

#### F3.4 — Multi-bank parser expansion
- 5 → 16 ธนาคาร (ตาม user request)

#### F4.1+ — v2.0 features
- Full cloud sync (Firebase Firestore, opt-in, ทุก account ไม่ใช่แค่ shared)
- Investment / กองทุนรวม tracking
- Net worth dashboard
- Goal-based saving

---

## 8. UX & Design System

### 8.1 5 หลักการสำคัญ

1. **Time-to-first-value < 5 วินาที** — เปิดแอปแล้วเห็น insight ก่อน setup
2. **One thumb, one tap** — ทุก action หลักทำด้วยมือเดียว
3. **Data = เรื่องราว** — แทน "expense: 22,450" ด้วย "เดือนนี้ใช้น้อยกว่าเดือนก่อน 8%"
4. **Microinteractions ทุก tap** — feedback < 100ms (haptic + animation)
5. **Empty state = โอกาสสอน** — ไม่ใช่ความล้มเหลว

### 8.2 Layout architecture

```
Bottom nav (4 tabs + FAB):
├── Home (Dashboard)
├── นำเข้า (Import)
├── [ + ] FAB center → Add modal
├── สถิติ (Stats / Forecast / Reports)
└── ตั้งค่า (Settings: Account, Privacy, Theme)
```

### 8.3 Design tokens

#### Friendly mode (DEFAULT)
```
Background:  #fdfaf6  (warm cream)
Surface:     #ffffff
Ink:         #2d3748  (warm dark gray)
Ink-faint:   #718096
Rule:        #efe5d4

Primary:     #e88e3c → #f5a623 gradient (warm orange)
Accent-soft: #fef3e7  (tinted bg)
Income:      #5a9d63  (soft green)
Expense:     #d96b5e  (friendly coral)
Transfer:    #5e9bd6  (calm blue)
Investment:  #8b6db5
Debt:        #b8825e

Category palette (icons ขาวบน solid bg):
  food:       #ff8a5c
  transport:  #5e9bd6
  shopping:   #e879a3
  utility:    #f0b942
  health:     #5a9d63
  entertain:  #8b6db5
  rent:       #b8825e
  salary:     #5a9d63
  creditcard: #d96b5e
  promptpay:  #5e9bd6

Radius:      14px (cards), 10px (small), 9999px (pill)
Shadow:      soft drop shadow ~12% opacity
Font:        Sarabun (no serif)
Font-size:   :root 16px (normal) / 18px (large) / 20px (xlarge) — rem cascade
```

#### Pro mode (toggle)
```
Background:  #f6f3ec  (cream paper)
Ink:         #0e1a26  (deep navy)
Accent:      #1a3a5c  (navy)
Income:      #4a7c4f
Expense:     #b03a2e
Radius:      2px (sharp)
Shadow:      flat / hairline border
Font:        IBM Plex Serif headings + Sans Thai body
```

### 8.4 Iconography

- **System icons:** Lucide (38 inline SVG, ~3KB)
- **Category icons:** white stroke on solid color bg (Apple Wallet pattern)
- **Account icons:** white on linear-gradient bg
- **Pattern decision:** ห้าม tinted bg เพราะ contrast ไม่พอ — solid color always

### 8.5 Microinteractions checklist

| Action | Feedback |
|---|---|
| กดปุ่ม | Scale 0.97 + haptic light |
| Save tx | Checkmark draw + green flash + haptic success |
| Delete | Slide-out + undo toast |
| Pull-to-refresh | Spinner ที่ลื่น |
| Long-press | Bounce + haptic |
| Form error | Shake + red highlight |
| Number change | Roll-up animation |
| Loading | Skeleton shapes (ไม่ใช่ spinner) |
| Edit transaction | Pre-fill modal open + pencil icon scale |
| Swipe-left (edit) | Slide reveal → edit button สี primary |

### 8.6 12 หลักการ UX (full list)

1. One-glance comprehension (1 hero number)
2. Progressive disclosure (ขอ field ทีละน้อย)
3. Bottom navigation (thumb-friendly)
4. FAB for primary action
5. Microinteractions everywhere
6. Skeleton > spinner
7. Swipe actions on lists
8. Empty states = teaching moments
9. Smart defaults
10. Color = meaning (ไม่ใช่ decoration)
11. Typographic hierarchy (3x scale)
12. Status feedback ตลอดเวลา
13. **Accessible text size** — rem-based layout + pinch-to-zoom ไม่ถูก block

### 8.7 Mockup approved (May 2026)

**3 หน้าหลัก mockup เสร็จและ approved direction:**
- `mockup-dashboard.png` — hero card + accounts + categories + bottom nav
- `mockup-add.png` — full-screen modal + amount + keypad + cat strip
- `mockup-list.png` — search + chips + day-grouped + swipe demo

---

## 9. Business Model

### 9.1 Pricing strategy

| Tier | Cost | What you get |
|---|---|---|
| **Free** | ฟรีตลอด | ทุก core feature: PDF import, voice, manual, dashboard, min balance, forecast (v1.1), local storage |
| **Phase 2: Affiliate** | ฟรี + revenue from clicks | Insight-driven suggestions (opt-out ได้) |

### 9.2 ทำไมไม่มี subscription

- Money Manager subscription = top user complaint
- Piggipo paywall hard → user ลอง 1 อาทิตย์ → เลิก
- กลุ่มเป้าหมายไทยไม่นิยมจ่าย subscription
- Money+ Cute, Money manager (Orange Dog) ฟรี + ads → 4.7-4.9★

### 9.3 Affiliate (Phase 2, เดือน 6+)

**Partners:**
1. Involve Asia + AccessTrade (aggregator) — สมัครก่อน
2. Direct กับธนาคารหลัง MAU > 5,000

**Verticals:**
- บัตรเครดิต (commission 200-1,500 ฿/อนุมัติ)
- บัญชีออมดอกสูง (100-500 ฿/บัญชี)
- สินเชื่อ (500-3,000 ฿/อนุมัติ)

**Revenue projection:**
- MAU 10,000: ~50,000 ฿/เดือน
- MAU 50,000: ~250,000 ฿/เดือน

**Compliance:**
- Disclosure "[โฆษณา]" ตาม สคบ.
- ไม่ส่ง spending data ออก (suggestion engine ฝั่ง client)
- จดทะเบียนพาณิชย์อิเล็กทรอนิกส์

### 9.4 ทำไมไม่ใช้ banner ads

- AdMob CPM ในไทย: 5-15 ฿ → MAU 10,000 = ~15,000 ฿/เดือน (vs affiliate 50,000)
- Banner ในแอปการเงิน = trust พัง = retention ตก
- AdMob restriction กับ financial apps

---

## 10. Technical Architecture

### 10.1 Stack decisions

| Layer | Technology | Reason |
|---|---|---|
| Frontend | Vanilla JS + PWA | No framework lock-in, fast loading |
| PDF parsing | pdf.js + parsers.js (primary) | Local-first, ออฟไลน์ได้, 183 tests |
| PDF fallback | Gemini API (opt-in, user consent) | เมื่อ confidence score < 60 — user กด consent ก่อนส่ง PDF |
| Voice | Web Speech API + custom Thai NLP | Free, on-device |
| Charts | Chart.js | Mature, fast |
| Storage v1.0 | localStorage (private) + Firestore (shared accounts) | Hybrid: privacy USP ยังสมบูรณ์สำหรับ non-shared |
| Storage v2.0 | Firebase Firestore full sync (opt-in) | Free tier, no OAuth verification needed |
| Hosting | GitHub Pages | Free, fast CDN |
| Secrets management | GitHub Secrets + GitHub Actions | API keys ไม่เคยอยู่ใน repo; Actions สร้าง config.js ตอน deploy |
| Crash report | Sentry (free 5k events/mo) | |
| Analytics | PostHog (free 1M events/mo) | Privacy-friendly |
| Android packaging | **TWA (Trusted Web Activity)** | Reuse PWA, less maintenance |
| iOS | **Phase 2+** (รอรายได้) | Apple Dev fee 99 USD/ปี |

### 10.2 ทำไม TWA ไม่ Native

- Solo dev — ลด maintenance 50% (แก้ web ครั้งเดียว, app อัปเดตอัตโนมัติ)
- PWA พร้อมแล้ว 90% ไม่ต้องเริ่มใหม่
- PDF parsing + Voice ทำงานบน web อยู่แล้ว
- Trade-off ที่ยอม: ไม่มี home screen widget, share-to-app จำกัด
- Migrate native ตอน MAU > 50,000 + revenue stable

### 10.3 ทำไม Firebase ไม่ Sheets (สำหรับ cloud sync v2.0)

- Google Sheets API = ต้องผ่าน OAuth verification (4-8 สัปดาห์, อาจต้อง security assessment $15K-75K)
- Firebase Auth = verified อยู่แล้ว, ไม่มีหน้า "unverified app"
- Drive backup ใช้ scope `drive.file` = non-sensitive scope = ไม่ต้อง verify

### 10.4 Data flow

```
PDF file → pdf.js → text items → groupRowsByY → universal parser
   ↓
   detectBank → parseStatement → transactions[] + auto-detected accounts[]
   ↓
   Review screen (user confirms/edits transfers)
   ↓
   Store.addMany() → localStorage → emit('change')
   ↓
   Dashboard.render() → analytics → charts
   ↓
   (Optional) Drive backup auto-upload daily
```

### 10.5 Security & Privacy

**v1.0:**
- ทุกอย่างใน browser localStorage
- ไม่มี server call
- PDF ไม่ส่งออกจาก device
- Account number masking (เก็บ 4 หลักท้าย)

**v1.0 Drive backup:**
- Scope: `drive.file` (non-sensitive)
- เห็นเฉพาะไฟล์ที่แอปสร้าง
- HTTPS encryption in transit

**v2.0 Cloud sync:**
- Firebase Firestore ของ user
- Opt-in, default ยัง local
- User control deletion

---

## 11. Codebase State

### 11.1 Repository structure

```
finance-pwa/
├── index.html              ← shell + 4 views + theme bootstrap
├── manifest.webmanifest    ← PWA manifest
├── sw.js                   ← Service Worker (v5)
├── icons/                  ← PWA icons SVG
├── css/
│   └── styles.css          ← dual-theme stylesheet (333+ lines)
├── js/
│   ├── config.js           ← APP_CONFIG (Google Client ID at deploy)
│   ├── theme.js            ← ✅ NEW — theme switcher
│   ├── icons.js            ← ✅ NEW — 38 inline Lucide SVG + group→icon map
│   ├── utils.js            ← Money/satang, BE↔CE, Thai numwords
│   ├── store.js            ← Transaction store, classification rules
│   ├── parsers.js          ← 16 banks PDF parser (universal+per-bank)
│   ├── voice.js            ← Web Speech + Thai NLP intent
│   ├── pdf.js              ← pdf.js wrapper + password support
│   ├── dashboard.js        ← Chart.js rendering
│   ├── google.js           ← OAuth PKCE + Sheets (deprecated, use Firebase)
│   ├── crypto.js           ← E2E encryption (added during compact)
│   ├── firebase.js         ← Firestore client (added during compact)
│   ├── ui.js               ← modals/toasts
│   └── app.js              ← glue + view routing
├── tests/
│   └── run.mjs             ← 183 tests passing
├── PRODUCT_SPEC.md         ← initial spec (898 lines)
└── UX_RESEARCH.md          ← UX research (502 lines)
```

### 11.2 Tests status

- **183 tests passing** (utils, store, parsers, voice, crypto)
- Test runner: `node tests/run.mjs`

### 11.3 Bug fixes preserved across sessions

1. Node 22 crypto read-only getter
2. พร้อมเพย์ vs จ่ายบิล split into separate groups
3. Time strings (10:30) polluting numbers → maskNonAmounts()
4. Phone numbers regex fix `0\d{1,2}[\s-]\d{3}[\s-]\d{4}`
5. Invalid amount=0 transactions → _isValid() rejects
6. Bad date format polluting monthlyStats → regex validation
7. extractAmount truncated 30000→300 (greedy regex) → split patterns

### 11.4 Banks supported (parsers)

KTB, KBank, SCB, BBL, BAY/Krungsri, TTB, GSB, BAAC, GHB, TISCO, KKP, CIMB, UOB, LHB, ICBC, Citi (16 banks total)

**Launch with 5:** KTB, KBank, SCB, BBL, Krungsri (covers 80%+)

### 11.5 What's done vs pending

✅ **Done:**
- 16 banks PDF parser
- Voice NLP Thai
- Min balance + days-below alert
- Daily/monthly stats
- 2 themes (Friendly default + Pro toggle)
- Lucide icons inline
- Theme switcher in Settings
- 183 tests
- 3 mockup approved (Dashboard, Add, List)

⏳ **Pending implementation:**
- Layout overhaul (bottom nav, FAB, hero card) — Phase 1 (3-4 วัน)
- Quick-add full-screen modal + in-app keypad — Phase 2 (2 วัน)
- Microinteractions — Phase 3 (1 วัน)
- Swipe actions — Phase 4 (1 วัน)
- Empty states + onboarding — Phase 5 (1 วัน)
- Auto-detect account + transfer type
- JSON backup Layer 1
- Drive backup Layer 2
- Recurring transactions
- Forecast calendar

⏳ **Pre-launch ops (user's responsibility):**
- DBD พาณิชย์อิเล็กทรอนิกส์ registration
- Privacy Policy + Terms of Service (Thai)
- Google Play Console account ($25)
- Sentry + PostHog setup
- Beta tester list (~50)
- Marketing channels (Pantip, FB groups, TikTok?)

---

## 12. Roadmap

### Pre-launch (4-6 สัปดาห์)

**สัปดาห์ 1-2:** Critical UX overhaul (Phase 1-2)
- Bottom nav + FAB + hero insight card
- Full-screen quick-add modal + in-app keypad
- Auto-detect account + transfer type
- Calculator in entry

**สัปดาห์ 3:** Polish (Phase 3-5)
- Microinteractions (haptic, scale, tally)
- Swipe actions on lists
- Empty states (2-path)
- Onboarding 3-screen
- Privacy story page
- Aha-moment insights

**สัปดาห์ 4:** Stability + backup
- Backup/restore JSON (Layer 1)
- Google Drive backup (Layer 2)
- Test fixtures 5 ธนาคาร
- Edge case testing
- Performance optimization

**สัปดาห์ 5:** Pre-launch ops
- Sentry integration
- Privacy Policy + Terms (Thai)
- จดทะเบียนพาณิชย์อิเล็กทรอนิกส์
- Google Play Console
- TWA wrapper

**สัปดาห์ 6:** Launch
- Soft launch → 50 beta users
- Fix critical bugs
- Official Play Store launch

### Post-launch (เดือน 2-12)

**เดือน 2-3:** Iterate
- Recurring transactions (auto-detect from PDF)
- Forecast calendar
- Smart reminders (gentle)
- Bug fixes

**เดือน 4-5:** Scale
- 5 → 10+ banks
- Receipt OCR
- Bug report in-app
- Comeback / catch-up mode

**เดือน 6:** Monetization Phase 2
- Affiliate (1 placement)
- A/B test
- Disclosure compliance

**เดือน 7-12:** Expand
- 16 banks complete
- Investment tracking (early)
- Family sharing

### Year 2

- Cloud sync v2.0 (Firebase)
- Net worth dashboard
- Direct bank API (ถ้า BoT เปิด open banking)
- iOS app

---

## 13. Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| ธนาคารเปลี่ยน PDF format | สูง | สูง | Test fixtures, fallback CSV import, in-app bug report |
| Wallet Story เพิ่ม PDF import | กลาง | สูง | Launch เร็ว, สร้าง brand recognition |
| Google Play ban (financial data policy) | ต่ำ | สูง | Privacy policy ชัด, ข้อมูลไม่ออก device |
| Solo dev burnout | สูง | สูง | Scope แคบ, automate, FAQ ละเอียด |
| User ไม่เข้าใจ value | กลาง | กลาง | Onboarding 30s, Aha-moment insights |
| Affiliate program ปฏิเสธ | กลาง | ต่ำ | Aggregator เป็นหลัก |
| PDPA compliance issue | ต่ำ | สูง | Legal review ก่อน launch, audit ทุก 6 เดือน |
| Privacy concern จาก user | ต่ำ | กลาง | Local-first โดดเด่น, transparency page |
| Crash bug ทำให้ rating ตก | กลาง | สูง | Sentry, beta test, fix ภายใน 24 ชม. |
| ธนาคารทำ feature เอง (KBank MAKE) | กลาง | กลาง | Multi-bank ในที่เดียว = USP ที่ธนาคารเดียวทำไม่ได้ |

---

## 14. Open Questions

### Pre-launch
- Beta tester recruitment plan (~50 users)
- Marketing channels (Pantip, FB group, Twitter, TikTok?)
- Privacy Policy / TOS template (เขียนเองหรือใช้ generator)
- Demo data mode สำหรับ first-run (ลองข้อมูลตัวอย่าง)?

### Implementation details
- FAB position — confirm center bottom nav vs bottom-right
- In-app keypad — custom (control 100%) vs system (less work) — confirmed custom from mockup
- Microinteractions level — full (haptic+animation+sound) vs subtle — TBD

### Future
- Native rewrite trigger point (MAU > 50K?)
- Investment tracking competitive viability (Wallet Story has it)
- Direct bank API readiness (BoT open banking timeline)

---

## 15. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05 | Skip wallet manual setup, use auto-detect from PDF | Friction ต่ำ + USP min balance ทำงาน |
| 2026-05 | No subscription model | Competitor research, ไทยไม่นิยมจ่าย |
| 2026-05 | Affiliate over banner ads | CPM ในไทยต่ำ, banner = trust พัง |
| 2026-05 | Local-first by default | PDPA + competitive advantage |
| 2026-05 | 5 banks at launch (not 16) | Solo dev maintenance, 80/20 |
| 2026-05 | No streak mechanic | Behavioral research: streak = guilt = quit |
| 2026-05 | Android: TWA (not native) | Solo dev maintenance, PWA reuse |
| 2026-05 | iOS: Phase 2 | รอรายได้ก่อน |
| 2026-05 | Cloud sync: v2.0 (not v1.1) | Privacy story + scope; Drive backup ทดแทน |
| 2026-05 | Use Firebase (not Sheets) for v2 sync | Avoid OAuth verification complexity |
| 2026-05 | Backup: JSON + Drive (drive.file scope) | Multi-layer, no verification needed |
| 2026-05 | Default theme: Friendly (Pro toggle) | Mass market ชอบ playful (4.9★ apps research) |
| 2026-05 | Theme toggle in Settings (hidden) | Reduce noise on topbar |
| 2026-05 | Add `transfer` type to data model | Fix accounting bug ที่ MeTang ถูกบ่น |
| 2026-05 | Duplicate detection Layer 1+2 | Trust erosion = pain #5 |
| 2026-05 | UX overhaul: bottom nav + FAB + hero card | Match 4.9★ app patterns |
| 2026-05 | Icons: solid color bg + white stroke | Apple Wallet pattern, high contrast |
| 2026-05 | Category icons via Lucide inline (~3KB) | No CDN dependency, offline-first |
| 2026-05 | Mockup direction approved | Dashboard, Add modal, Transactions list |
| 2026-05 | Edit transaction: pencil icon / swipe-left → pre-fill modal | user_classified=true หลัง edit → parser ไม่ override |
| 2026-05 | Selective account sharing ระดับ account (ไม่ใช่ category) | ย้ายจาก v2.0 → v1.0; real-time via Firestore; hybrid storage รักษา privacy USP |
| 2026-05 | ไม่ใส่ user-scalable=no ใน viewport + เพิ่ม in-app text size 3 ระดับ | ตาไม่ดี/หน้าจอเล็ก = real user pain, rem cascade ทำได้ง่าย |
| 2026-05 | Gemini เป็น fallback เท่านั้น (ไม่แทน parsers.js) | รักษา privacy USP + ออฟไลน์; trigger เมื่อ confidence < 60 + user consent |
| 2026-05 | GitHub Secrets + Actions สร้าง config.js ตอน deploy | API keys ไม่เคย commit ใน repo; ทดสอบเหมือน production ได้ |
| 2026-05 | Firebase: Web app, Auth Google + Firestore เท่านั้น, region asia-southeast1 | ไม่ต้องการ Storage/Functions/Hosting; Drive backup ใช้ drive.file scope แยก |
| 2026-05 | Play Store: GitHub Pages ฟรีก่อน → ซื้อ domain ตอน submit | ยังไม่เคย submit = เปลี่ยน domain ก่อน submit ไม่มีผลเสีย |

---

## Appendix A — Glossary

- **PWA** — Progressive Web App
- **TWA** — Trusted Web Activity (PWA in Play Store wrapper)
- **PDPA** — Personal Data Protection Act (พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล)
- **MAU/DAU** — Monthly/Daily Active Users
- **CPM** — Cost Per Mille (per 1,000 impressions)
- **CPL** — Cost Per Lead
- **พ.ศ.** — Buddhist Era (BE = CE + 543)
- **FAB** — Floating Action Button
- **USP** — Unique Selling Proposition
- **OCR** — Optical Character Recognition

---

## Appendix B — References

### Academic / behavioral research
- "When and Why Adults Abandon Lifestyle Behavior and Mental Health Mobile Apps: Scoping Review" (NCBI, 2024)
- "Beyond Abandonment to Next Steps: Understanding and Designing for Life after Personal Informatics Tool Use" (NCBI)
- "How Streaks and Daily Rewards Engineer Habit Loops and User Obligation" (Bootcamp, 2026)

### Industry research
- Decta Wallet Fatigue 2025
- UXCam mobile finance benchmarks
- NN Group finance app principles
- Onething Design "Budget App Design"
- Future Market Insights Expense Tracker Apps Market

### Competitor analysis
- Direct review analysis ของ 10+ แอป (Cash Book, Money Tracker, Money manager & expenses, Money+ Cute, Cashew, Money Manager, Money Lover, Piggipo GO, Wallet Story, MeTang, MAKE by KBank, SET Happy Money)
- Play Store data, App Store data
- Pantip discussions

---

## Appendix C — Files in /mnt/user-data/outputs/

ไฟล์ที่ user มี/ควรเก็บไว้:
- `finance-pwa.zip` — ทั้งโค้ด (90KB)
- `PRODUCT_SPEC.md` — original spec (898 lines)
- `UX_RESEARCH.md` — UX deep-dive (502 lines)
- `preview-friendly.png` — theme demo
- `preview-pro.png` — theme demo
- `mockup-dashboard.png` — approved direction
- `mockup-add.png` — approved direction
- `mockup-list.png` — approved direction
- `PROJECT_KNOWLEDGE.md` — เอกสารนี้
- `TASK_LIST.md` — ordered prompts สำหรับ Claude Code พร้อม priority และสถานะ

---

*End of Project Knowledge*
