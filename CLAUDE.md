# Project Knowledge — แอปการเงินส่วนตัวภาษาไทย

**เอกสารฉบับเดียวที่รวมทุกการตัดสินใจ, research, design choices และ state ของ project**

Version: 1.3 — May 2026
Owner: Solo developer
Stage: Implementation phase (shared accounts + UX polish done, pre-launch polish remaining)

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
| 2 | ไม่มี cloud sync ฟรี เปลี่ยนเครื่องข้อมูลหาย | 🔥🔥🔥🔥🔥 | ✅ Email backup รายสัปดาห์ (JSON ใน body) + Firestore shared accounts |
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
  created_by_name: string | null,// ชื่อที่ user ตั้งเอง (settings.display_name) ตอน save — ใช้แสดง "เพิ่มโดย X" ใน shared account
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
  display_name: string,          // ชื่อที่ใช้แสดงใน shared account "เพิ่มโดย X" (ไม่ใช่ account name)
  privacy_mode: "local" | "sync",// future
  notification_enabled: boolean,
  affiliate_disabled: boolean
}
```

### 6.5 UserProgress (Gamification)

```typescript
{
  xp: number,                    // XP สะสมทั้งหมด
  level: number,                 // 1-8 (คำนวณจาก xp threshold)
  streak_days: number,           // วันที่บันทึกติดต่อกัน
  last_coin_date: "YYYY-MM-DD",  // ป้องกัน claim ซ้ำวันเดียวกัน
  last_streak_date: "YYYY-MM-DD",
  coins: {
    bronze: number,              // สะสมตลอดชีพ (ไม่ใช้จ่าย)
    silver: number,
    gold: number
  }
}
```

**XP thresholds per level:**
| Level | ชื่อ | XP เริ่มต้น |
|---|---|---|
| 1 | มือใหม่หัดจด | 0 |
| 2 | นักจดรายรับรายจ่ายฝึกหัด | 200 |
| 3 | ผู้รู้จักตัวเองทางการเงิน | 500 |
| 4 | นักบัญชีครัวเรือน | 1,000 |
| 5 | นักวางแผนชำนาญ | 2,000 |
| 6 | นักออมมีวินัย | 3,500 |
| 7 | นักบริหารเงินเริ่มต้น | 5,000 |
| 8 | นักบริหารเงินฝีมือฉกาจ | 8,000 |

### 6.6 Wallet model decision: Auto-detect, ไม่บังคับ user

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

### 6.7 Transfer / duplicate detection (Layer 1+2)

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

### 6.8 Edge cases ใน data model

1. **ATM withdraw** → transfer (bank→cash), ไม่ใช่ expense
2. **บัตรเครดิต payment** → transfer (bank→cc), ไม่ใช่ expense
3. **PromptPay ระหว่างบัญชีตัวเอง** → transfer
4. **บันทึกซ้ำตรงๆ** → duplicate detection popup
5. **Refund** → type='refund' (ลบล้าง expense เดิม)
6. **Split transaction** (จ่ายแทนเพื่อน) → split feature ระบุส่วนตัวเอง
7. **Fee ฝัง** (โอนต่างธนาคาร 5,000 หัก 5,025) → parser แยก fee column

### 6.9 Soft delete pattern (shared accounts)

- ทุก transaction ใน shared account ใช้ soft delete (`deleted_by = email`) แทนการลบจริง
- **Two-stage delete:** คนแรกลบ → soft delete (สีเทา, ขีดทับ, ไม่คำนวณ); คนที่สองลบ → hard delete (หายจาก Firestore, ทั้งสองฝ่ายไม่เห็น)
- `activeTxs()` helper ใน state.js กรอง `deleted_by == null` ก่อนคำนวณทุกครั้ง
- `getTransactionsByDay()` แสดง soft-deleted ด้วย (สีเทา) แต่ไม่นับใน day totals

---

## 7. Feature Specification

### 7.1 v1.0 Launch features (must-have)

#### F1.1 — PDF e-Statement Import [✅ DONE]
- Auto-detect bank, parse transactions
- **5 ธนาคารหลัก at launch:** KTB, KBank, SCB, BBL, Krungsri/BAY (ครอบคลุม 80%+)
- ธนาคารอื่น → universal parser (อาจไม่สมบูรณ์ + bug report)
- **Password-protected PDF** — flow ที่ถูกต้อง:
  1. pdf.js โหลด PDF → ถ้าเข้ารหัส → throw `PasswordException`
  2. แอปถาม user "PDF นี้มีรหัสผ่าน กรุณาใส่รหัส:"
  3. user กด Cancel → หยุด | ใส่รหัสผิด → toast แจ้ง | ถูก → parse ต่อ
  4. `parsePDF()` return `{ transactions, bank, pageCount, accountInfo, extractedText }`
     — `extractedText` คือ text ที่ decrypt แล้ว ใช้ส่ง Gemini แทนไฟล์เข้ารหัส
- Auto-classify ATM/transfer/credit-card-payment เป็น `transfer`
- **Confidence scoring** หลัง parse: score < 60 → dialog "ให้ AI ช่วยไหม?"
  - PDF มีรหัส: ส่ง `extractedText` ให้ Gemini (ไม่ส่งไฟล์เข้ารหัส)
  - PDF ไม่มีรหัส: ส่งไฟล์เป็น base64
- **Review screen ก่อน import** — เลือก/ยกเลิกการเลือกรายการแต่ละรายการได้ (partial import)
- **Duplicate detection ใน review screen:**
  - ตรวจสอบ amount + date กับ existing transactions
  - รายการที่อาจซ้ำ → ยกเลิกการเลือกอัตโนมัติ + แสดง warning
  - แสดง existing transaction ที่ match ไว้เพื่อเปรียบเทียบ (dupMap) ให้ user ตัดสินใจเอง
- **ATM cash balance fix:** เงินที่นับเข้าบัญชีเงินสดจาก import = เฉพาะ ATM withdraw เท่านั้น ไม่รวม transfer เข้า (transfer เข้าคือเงินที่อยู่ในบัญชีธนาคารอยู่แล้ว)

#### F1.2 — Account Management [✅ DONE]
- Parser อ่านเลขบัญชีจาก header → create Account record
- Mask: เก็บแค่ 4 หลักท้าย "xxx-x-x7821-x"
- User rename ได้ ("กรุงไทย ...7821" → "บัญชีเงินเดือน") — **popup modal** เมื่อกดดินสอ ไม่ใช่ inline ใน settings
- Manual entry default = "ไม่ระบุ" (ไม่บังคับ)
- **Default accounts (4 บัญชีเริ่มต้น):** เงินสด (`cash:default`), เงินฝากธนาคาร (`bank:manual:default`), การลงทุน (`invest:default`), หนี้สิน (`debt:default`)
- **เพิ่มบัญชีด้วยตนเอง:** Settings → บัญชีของฉัน → กดปุ่มเพิ่ม (เลือก type: cash/bank/investment/debt/ewallet/credit_card)
- **ลบบัญชี:** popup dialog เลือก 2 วิธี — (1) ลบเฉพาะรายการ (บัญชีคงไว้ ยอด=0) หรือ (2) ลบบัญชีและรายการทั้งหมด
- **ยอดคงเหลือต่อบัญชี:** คำนวณจากรายการจริง (income+expense+transfer) แยกตาม account_id — ไม่ใช้ `current_balance` field จาก statement โดยตรง
- **Dashboard แสดงเฉพาะบัญชีที่ active:** ยอดไม่ใช่ 0 หรือมาจาก PDF หรือ user ตั้งชื่อเอง; ถ้าไม่มีบัญชีใดแสดง → empty state "กด จัดการ เพื่อเพิ่ม" + link ไปหน้าตั้งค่า

#### F1.3 — Min Balance Alert + Days Below Threshold [✅ DONE]
- Per-account view (ไม่ใช่ยอดรวม)
- Default threshold = 2,000 ฿ (override per account)
- Trend: เปรียบเทียบเดือนก่อน
- Visual: red row + ⚠️ icon (ไม่ scary)

#### F1.4 — Manual Entry [✅ DONE]
- Quick add fields: amount + category + account + date + note
- **Modal title:** "บันทึกรายการ" (เดิมคือ "บันทึกรายจ่าย")
- **Layout ใหม่ใน add modal:**
  - Account picker ย้ายไปอยู่ **บนหมวด** (เดิมอยู่ล่าง)
  - แถวจำนวนเงิน: "ใส่จำนวน" + ตัวเลข (กลาง) + ไอคอนไมค์ — อยู่บรรทัดเดียวกัน; ตัวเลขอยู่กึ่งกลาง; ไมค์ขนาดเท่ากับ font ตัวเลข
- **Calculator built-in** (1500+200, 1500*0.93)
- Smart defaults: today, expense, recent category
- Duplicate detection (Layer 2)
- **Edit existing transaction** — pencil icon บน row หรือ swipe-left → edit
  - Edit modal = quick-add modal แต่ pre-fill ข้อมูลเดิม
  - หลัง save → `user_classified = true` → parser จะไม่ override ค่านี้อีก
- **Account picker** — bottom-sheet overlay (ไม่ใช่ `prompt()`) แสดง icon สีถูกต้องตาม bank
- **Backdate ("ย้อนหลัง")** — frequency option ใหม่ เลือก date picker ที่จำกัด max = เมื่อวาน บันทึกเป็น transaction ปกติแต่ใช้วันที่เลือก
- **Frequency options (6 ตัว):** วันนี้ | ย้อนหลัง | ล่วงหน้า | ทุกเดือน | ทุกสัปดาห์ | ผ่อน (3×2 grid)

#### F1.5 — Voice Input (Thai NLP) [✅ DONE]
- "จ่ายค่าไฟ 450 บาท" → expense, 450, ค่าสาธารณูปโภค
- รองรับ Thai number words (ห้าสิบ, สองพัน)
- Web Speech API + custom NLP

#### F1.6 — Dashboard [✅ DONE]
- **Hero insight card** "เดือนนี้คุณเหลือ +12,550 ฿"
- **บันทึกวันนี้** — แสดงหลัง hero card (เดิมอยู่ด้านบน)
- Income/Expense pair (secondary)
- **Account list** — แสดงเฉพาะบัญชีที่ active (ยอดไม่ใช่ 0 / มาจาก PDF / user ตั้งชื่อ); empty state "กด จัดการ เพื่อเพิ่ม" + navigate ไปหน้าตั้งค่า
- **ยอดคงเหลือต่อบัญชี** — คำนวณจากรายการจริงแยกตาม account_id และ type (ไม่ใช้ statement balance โดยตรง)
- Top categories (3-5)
- **14-day expense chart** — SVG inline (responsive, `width: 100%`) จาก `dailyExpenseBars()` ใน chart.js
  - สี: วันนี้ = terracotta, เสาร์-อาทิตย์ = mocha, ปกติ = rule
  - เส้น avg ประ (dashed)
  - data source ใช้ `activeTxs()` — ไม่นับ soft-deleted
- Recent transactions
- **Cashflow forecast chart** (30 วันข้างหน้า) — ใช้ยอดจริงที่คำนวณจากรายการทั้งหมด

#### F1.7 — Onboarding 3-screen [⏳ PENDING]
- Screen 1: Privacy promise (3 sec)
- Screen 2: Import PDF / skip (5 sec)
- Screen 3: Aha-moment insights (after PDF processed)

#### F1.8 — Privacy Story Page [⏳ PENDING]
- "Data ของฉันอยู่ที่ไหน" — marketing material in-app
- ✅ Transactions: localStorage
- ✅ PDF: process ใน browser
- ❌ ไม่มี analytics, ad network, server
- "0 KB sent to server today"

#### F1.9 — Backup Multi-layer [✅ DONE]
- **Layer 1:** Manual JSON export ("สำรองเป็นไฟล์") + import จากไฟล์ ("กู้คืนจากไฟล์") — ใช้งานได้แล้ว
- **Layer 2:** Google Drive backup ("สำรองไปยัง Drive") — ใช้ `drive.file` scope (non-sensitive, ไม่ต้อง Google verification)
  - อัปโหลดไฟล์เดียว `diary-finance-backup.json` (create หรือ PATCH ถ้ามีอยู่แล้ว)
  - auto-backup ทุก 7 วันหลัง sign-in ด้วย popup (เฉพาะ session ที่มี token)
  - กู้คืน: ดาวน์โหลดจาก Drive → dialog ยืนยันพร้อมวันที่ + ขนาดไฟล์ → import
  - token หมดอายุ (session restore): `requestDriveAccess()` popup อัตโนมัติเมื่อกดปุ่ม
  - เก็บวันที่สำรองล่าสุดใน `settings.last_drive_backup` (YYYY-MM-DD)
- **Email backup ถูกตัดออกแล้ว** — ลบออกจาก views.js, app.js, state.js ทั้งหมด

**Developer setup (ทำครั้งเดียว) — เปิดใช้ Google Drive API:**
1. [console.cloud.google.com](https://console.cloud.google.com) → เลือก project `finance-diary-d9d5d`
2. **APIs & Services → Library** → ค้นหา `Google Drive API` → **Enable**
3. **APIs & Services → OAuth consent screen → Data Access** → **Add or remove scopes**
   - เพิ่ม `https://www.googleapis.com/auth/drive.file`
   - ชื่อแสดง: "See, edit, create, and delete only the specific Google Drive files you use with this app"
   - `drive.file` = Non-sensitive scope → ไม่ต้องขอ Google verification
4. **Save and Continue**
> user เก่าที่ sign in ค้างอยู่อาจต้อง sign out → sign in ใหม่ครั้งหนึ่ง

#### F1.10 — Themes + Dark Mode [✅ DONE]
- **7 color themes:** Diary (default), Ocean, Forest, Rose, Citrus, Violet, Carbon — swatch picker ใน Settings
- **Pro mode** — Bloomberg/editorial, navy, dense (ยังคงมีเป็น 1 ใน 7 ตัวเลือก)
- **Dark mode:** toggle แยกต่างหากใน Settings; `data-dark="1"` บน `<html>`
- **Settings → รูปแบบการแสดงผล:** UI ปรับให้ clean ไม่ดูรก — swatch + dark toggle + text size รวมอยู่ในส่วนเดียว

#### F1.10b — Text Size / Zoom [✅ DONE]
- **Pinch-to-zoom:** ไม่ block native browser zoom — `viewport` meta ห้ามใส่ `user-scalable=no`
- **In-app text size:** Settings → รูปแบบการแสดงผล → Normal / ใหญ่ / ใหญ่มาก
  - ใช้ `font-size` บน `:root` (rem cascade ทั้งแอป)
  - Normal = 16px, Large = 18px, XLarge = 20px
  - ใช้งานได้จริง (แก้ bug ที่ไม่ apply จริงก่อนหน้านี้)

#### F1.11 — UX Overhaul [✅ DONE]
- Bottom nav 4 tabs + center FAB
- Hero insight card
- Full-screen quick-add modal + in-app keypad
- Microinteractions (haptic)
- Swipe actions on list
- Empty states

#### F1.12 — Selective Account Sharing [✅ DONE — Real-time Firestore]

**Architecture:**
- Real-time sync ผ่าน Firebase Firestore — อีกคนเห็นรายการใหม่ทันที
- Sign in ด้วย Google account เท่านั้น
- เจ้าของบัญชีกรอก Gmail ผู้รับใน Settings → toggle "แชร์บัญชีนี้"
- **Hybrid storage:** บัญชีส่วนตัว → localStorage เท่านั้น; บัญชีที่แชร์ → Firestore + localStorage cache

**Permissions:**
- เจ้าของ: เพิ่ม/แก้ไข/ลบรายการ, แชร์/ยกเลิกแชร์, ลบบัญชี
- ผู้รับแชร์: เพิ่มรายการ, soft-delete รายการ, "ปฏิเสธ" (ยกเลิก access ตัวเอง)
- ผู้รับแชร์ **ไม่มีสิทธิ์** ลบบัญชี หรือแชร์ต่อ

**Display ใน shared transactions:**
- "เพิ่มโดย X" — จาก `tx.created_by_name` (เก็บตอน save, ไม่ lookup ทีหลัง)
- "ลบโดย X" — จาก `tx.deleted_by` (Gmail)
- Soft-deleted: แสดงสีเทา + ขีดทับ `.entry--deleted` ไม่นำมาคำนวณ

**Soft delete / two-stage delete:**
- คนแรกลบ → `deleted_by = email` (soft delete) — ยังเห็นอยู่ สีเทา
- คนที่สองลบ → `hardDeleteTransaction()` — ลบออกจาก Firestore จริง, ทั้งสองฝ่ายไม่เห็น
- ใช้ `snapshot.docChanges()` ใน `subscribeSharedAccount` เพื่อจับ hard-delete (type: 'removed')

**Lifecycle / sync:**
- `subscribeSharedAccounts()` เรียกทันทีเมื่อ sign in (ไม่รอ shared-with callback)
- `subscribeAccountsSharedWithMe(email)` — Firestore query `array-contains` หา accounts ที่คนอื่น share ให้
- `mergeSharedAccounts(remoteAccounts)` — เมื่อ owner revoke → ลบบัญชี + transactions + ปิด listener ทันที
- `clearReceivedAccounts(myEmail)` เรียกเมื่อ sign out — ล้าง UI ทันที
- `current_balance` อัปเดตจาก latest Firestore transaction ที่มี `balance` field

**Critical bug patterns (อย่าทำซ้ำ):**
- `migrateAccountToCloud`: ต้อง `await setDoc(accountRef)` ก่อน แล้วค่อย batch transactions แยก — เพราะ Firestore security rules ของ subcollection ทำ `get()` บน parent doc ที่ต้อง committed แล้ว
- `remove-share-email`: ต้อง call `updateSharedWith(accountId, newList)` เสมอ แม้ `newList` จะ empty — ถ้าไม่ call Firestore จะไม่ revoke access
- `mergeSharedAccounts`: condition ต้องเป็น `a.owner !== myEmail` (ไม่ใช่ `a.owner && a.owner !== myEmail`) — มิฉะนั้น accounts ที่ `owner: null` จะไม่ถูก revoke

**Display name:**
- ตั้งได้ใน Settings → "ชื่อที่แสดงในบัญชีที่แชร์"
- เก็บใน `settings.display_name`
- ใส่ลงใน `tx.created_by_name` ตอน `addTransaction()` — ไม่ lookup ตอน render

#### F1.13 — Gamification: เหรียญรางวัล + Level System [⏳ PENDING]

**เหรียญรายวัน (claim ได้ 1 ครั้ง/วัน):**
- 🥉 ทองแดง (+10 XP): บันทึก ≥ 1 รายการวันนี้
- 🥈 เงิน (+25 XP): บันทึก ≥ 1 รายการ + ยอดไม่ต่ำกว่า threshold
- 🥇 ทอง (+50 XP): บันทึก ≥ 3 รายการ + ยอด ok + มีรายรับบันทึกสัปดาห์นี้
- Streak bonus: 7 วันติดกัน +70 XP | 30 วันติดกัน +300 XP

**UX หลักการ — subtle ไม่ intrusive:**
- แสดงผลเป็น toast เล็กๆ หรือ badge มุมหน้าจอ ห้าม popup บัง
- Level up → animation เบาๆ + haptic 1 ครั้ง ไม่มีเสียง
- เหรียญและ level แสดงใน profile/settings ไม่ใช่ dashboard หลัก

#### F1.14 — List View [✅ DONE]
- **Month selector** — ← เดือน → navigation ด้านบน, default = เดือนปัจจุบัน
- **Filter chips** — ทั้งหมด / รายจ่าย / รายรับ / โอน (ใช้งานได้จริง, filter ภายในเดือนที่เลือก)
- **Search** — ค้นหา description + category ภายในเดือนที่เลือก
- right arrow disabled เมื่ออยู่ที่เดือนปัจจุบัน

### 7.2 v1.1 Features (เดือน 2-3 หลัง launch)

#### F2.1 — Recurring Transactions [✅ INFRASTRUCTURE DONE, auto-detect pending]
- Template engine + scheduler ทำงานแล้ว
- **Auto-detect from PDF history** (USP — คนอื่นไม่ทำ) — ยังไม่ implement
- ระบบเห็น "ค่าไฟ" ทุกวันที่ 5 จาก PDF 3 เดือน → suggest template
- Confidence ≥ 0.8 ถึง suggest
- ไม่ auto-create — user confirm ทุกครั้ง

#### F2.2 — Forecast Calendar [✅ CHART DONE, calendar view pending]
- Cashflow forecast chart 30 วัน render ใน dashboard แล้ว
- Calendar view UI ยังไม่ implement

#### F2.3 — Smart reminders (gentle) [⏳ PENDING]
- Weekly digest, Recurring due alerts

### 7.3 v1.2-v2.0 Features (เดือน 3-12)

#### F3.1 — Affiliate Suggestions (Phase 2 monetization)
- Tier 1: บัตรเครดิต, บัญชีออม, สินเชื่อ (no licensing)
- ผ่าน Involve Asia / AccessTrade
- Suggestion engine ฝั่ง client (ไม่ส่ง spending pattern ออก)

#### F3.2 — Bug Report ในแอป
- User เจอ PDF parse ไม่ได้ → กด "รายงาน" → ส่ง PDF (เซ็นเซอร์เลข) ให้ dev

#### F3.3 — Receipt OCR / Slip ภาษาไทย (Gemini fallback)
- Primary: jsQR (on-device, ออฟไลน์) — สำหรับ slip มี QR PromptPay
- Fallback: Gemini Vision API — สำหรับ slip ไม่มี QR
  - ใช้ `generative-language` OAuth scope (user token — ไม่มีค่าใช้จ่าย dev)
  - ⚠️ user ต้องเคยเปิด aistudio.google.com และ Accept Terms ก่อน
  - user กด consent ทุกครั้งก่อนส่งรูป

#### F3.4 — Multi-bank parser expansion
- 5 → 16 ธนาคาร (ตาม user request)

#### F4.1+ — v2.0 features
- Full cloud sync (Firebase Firestore, opt-in, ทุก account)
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
├── [ + ] FAB center → Add modal (full-screen)
├── สถิติ (Stats / Forecast / Reports)
└── ตั้งค่า (Settings: Account, Sharing, Privacy, Theme)
```

### 8.3 Design tokens

#### Diary mode (DEFAULT — warm orange)
```
Background:  #fdfaf6  (warm cream)
Surface:     #ffffff
Ink:         #2d3748  (warm dark gray)
Ink-faint:   #718096
Rule:        #efe5d4
Mocha:       #c89368  (neutral accent, cash icon)
Plum:        #b378c0  (shopping, SCB icon)
Honey:       #e8b649  (utility, BAY icon)
Terracotta:  #c0694c  (today bar in chart, delete accent)

Primary:     #e88e3c → #f5a623 gradient (warm orange)
Accent-soft: #fef3e7  (tinted bg)
Income:      #5a9d63  (soft green)
Expense:     #d96b5e  (friendly coral)
Transfer:    #5e9bd6  (calm blue)

Account icon gradients (ต้องตรงกันทั้ง CSS และ JS bankGradient()):
  ktb:   #5fb0e0 → #3787c5  (ฟ้า)
  kbank: #6cc16c → #45984a  (เขียว)
  scb:   #b378c0 → #8a59a0  (ม่วง)
  bbl:   #4f7eb8 → #2a5a94  (น้ำเงิน)
  bay:   #e8b649 → #c79939  (ทอง)
  cash/other: #c89368 → #a07246  (น้ำตาล)

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

#### Color themes (7 สี — เลือกใน Settings)

| val | ชื่อ | Primary color |
|---|---|---|
| `diary` | Diary (default) | #e88563 (warm orange) |
| `ocean` | Ocean | #2e86c1 (blue) |
| `forest` | Forest | #27ae60 (green) |
| `rose` | Rose | #e06880 (pink) |
| `citrus` | Citrus | #d4880e (amber) |
| `violet` | Violet | #7c5cbf (purple) |
| `carbon` | Carbon | #1e3a72 (น้ำเงินกรมท่า) — cool neutral bg, Noto Sans Thai font, tabular nums, tighter radius, dark-mode-safe |

- แต่ละ theme override `--primary`, `.fab`, `.hero::before`, `.add-save`
- สลับผ่าน swatch buttons ใน Settings → `data-theme` บน `<html>` element
- `applyTheme(theme)` helper ใน views.js จัดการ

#### Dark mode
- Toggle ใน Settings → `data-dark="1"` บน `<html>`
- `applyDark(dark)` helper ใน views.js
- Dark mode override: background → #1a1a2e, surface → #16213e, ink → #e8e8f0
- **Dark mode bug patterns ที่แก้แล้ว:** `.chip` / `.seg-item` (filter chips + type selector) ต้องใส่ contrast fix ใน `html[data-dark="1"]` — สีอักษรขาวบนพื้นขาวอ่านไม่ออก

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
- **Account icons:** `bankGradient(bank, type)` helper ใน add.js — ต้องตรงกับ `.acct-icon.{bank}` CSS เสมอ
- **Pattern decision:** ห้าม tinted bg เพราะ contrast ไม่พอ — solid color always
- **ห้าม hardcode สีเดียวสำหรับทุก bank** — ต้องใช้ `bankGradient()` ที่ map ตามธนาคาร

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
| Account picker open | Bottom-sheet slide up |

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

**Compliance:**
- Disclosure "[โฆษณา]" ตาม สคบ.
- ไม่ส่ง spending data ออก (suggestion engine ฝั่ง client)
- จดทะเบียนพาณิชย์อิเล็กทรอนิกส์

---

## 10. Technical Architecture

### 10.1 Stack decisions

| Layer | Technology | Reason |
|---|---|---|
| Frontend | Vanilla JS + PWA | No framework lock-in, fast loading |
| PDF parsing | pdf.js + parsers.js (primary) | Local-first, ออฟไลน์ได้, 206 tests |
| PDF fallback | Gemini API via user OAuth token | scope: `generative-language`; user consent ก่อนส่ง PDF; เมื่อ confidence < 60 |
| Voice | Web Speech API + custom Thai NLP | Free, on-device |
| Charts | Inline SVG (chart.js helper) | ไม่ต้องโหลด library, responsive ผ่าน viewBox |
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

### 10.3 ทำไม Firebase ไม่ Sheets

- Google Sheets API = ต้องผ่าน OAuth verification (4-8 สัปดาห์, อาจต้อง security assessment $15K-75K)
- Firebase Auth = verified อยู่แล้ว, ไม่มีหน้า "unverified app"
- Email backup ใช้ `mailto:` + Web Share API = ไม่ต้อง OAuth scope ใดๆ

### 10.4 Data flow

```
PDF file → pdf.js → ถ้ามีรหัส → prompt password → ใส่ถูก → decrypt
   ↓
   text items → groupRowsByY → detectBank → parseStatement
   ↓
   { transactions[], accounts[], extractedText }
   ↓
   scoreParseResult() — confidence score 0-100
   ├─ score ≥ 60 → Review screen (user confirms/edits)
   └─ score < 60 → dialog "ให้ AI ช่วยไหม?" (user consent)
                   ├─ ปฏิเสธ → Review screen ด้วยผลเดิม
                   └─ ยอม → Gemini API
                            ├─ PDF ไม่มีรหัส → ส่ง base64 file
                            └─ PDF มีรหัส   → ส่ง extractedText (text เท่านั้น)
                            ↓
                            JSON → merge กับผล parser → Review screen
   ↓
   State.addMany() → localStorage → emit('change')
   ↓
   Dashboard.render() → analytics → charts
   ↓
   (Optional) Email backup รายสัปดาห์ — JSON ใน mailto: body หรือ Web Share API file
   (Shared accounts) → Firestore real-time sync
```

### 10.5 Firestore shared account flow

```
Sign in → subscribeSharedAccounts() [ทันที — own accounts]
        → subscribeAccountsSharedWithMe(email)
              ↓ callback
          mergeSharedAccounts(remoteAccounts)
              ├─ revoked accounts → ลบ transactions + ปิด listener
              └─ new/updated accounts → เพิ่ม/อัปเดต
          subscribeSharedAccounts() [อีกครั้ง — รวม received accounts]

Sign out → unsubscribeAll() + clearReceivedAccounts(myEmail)

Add tx → State.addTransaction() → Firestore pushTransaction() [ถ้า cloud account]
Delete tx → soft delete (deleted_by = email) → ถ้า already soft-deleted → hard delete
Revoke share → updateSharedWith(accountId, []) → Firestore → onSnapshot → mergeSharedAccounts detects → remove
```

### 10.6 Security & Privacy

**v1.0:**
- ทุกอย่างใน browser localStorage (private accounts)
- Firestore สำหรับ shared accounts เท่านั้น
- **PDF ไม่ส่งออกจาก device** (กรณีปกติ — parsers.js ทำงาน local)
- **กรณี Gemini fallback** (user กด consent เองทุกครั้ง):
  - PDF ไม่มีรหัส → ส่ง base64 ไปยัง Gemini API (Google's servers)
  - PDF มีรหัส → ส่งเฉพาะ extractedText ไม่ส่งไฟล์
- Account number masking (เก็บ 4 หลักท้าย)
- Firestore security rules: อ่าน-เขียนได้เฉพาะ `owner` + `shared_with` เท่านั้น

---

## 11. Codebase State

### 11.1 Repository structure (actual — May 2026)

```
finance-pwa/
├── index.html              ← shell + bottom nav + FAB + add-modal placeholder
├── manifest.webmanifest    ← PWA manifest
├── sw.js                   ← Service Worker
├── icons/                  ← PWA icons SVG
├── css/
│   └── styles.css          ← dual-theme stylesheet (1700+ lines)
├── js/
│   ├── config.js           ← APP_CONFIG (Google Client ID at deploy)
│   ├── icons.js            ← 38 inline Lucide SVG + CATEGORIES map + svgIcon()
│   ├── utils.js            ← formatBaht, satang, BE↔CE, Thai numwords, todayISO, calc()
│   ├── state.js            ← State management: transactions, accounts, settings
│   │                          activeTxs(), getTransactionsByDay(), getMonthSummary()
│   │                          subscribeSharedAccounts(), mergeSharedAccounts()
│   │                          clearReceivedAccounts(), removeAccount()
│   ├── parsers.js          ← 16 banks PDF parser (universal+per-bank)
│   ├── voice.js            ← Web Speech + Thai NLP intent parser
│   ├── pdf.js              ← pdf.js wrapper + password prompt support
│   ├── chart.js            ← Inline SVG charts: dailyExpenseBars(), cashflowForecast()
│   ├── recurring.js        ← Template engine + scheduler + getForecast()
│   ├── firebase.js         ← Firebase Auth + Firestore client (มี drive.file scope ใน signInWithGoogle)
│   │                          pushSharedAccount(), migrateAccountToCloud()
│   │                          softDeleteTransaction(), hardDeleteTransaction()
│   │                          subscribeSharedAccount(), subscribeAccountsSharedWithMe()
│   │                          token: GoogleAuthProvider.credentialFromResult(result).accessToken
│   ├── drive.js            ← Google Drive backup: uploadBackup(), downloadBackup(), getBackupInfo()
│   │                          requestDriveAccess() — popup ขอ token ใหม่เมื่อ session restore
│   │                          setDriveToken() — รับ token จาก signInWithGoogle ผ่าน app.js
│   ├── add.js              ← Add/Edit transaction modal
│   │                          pickAccount() bottom-sheet, bankGradient() helper
│   │                          frequency: today|past|scheduled|monthly|weekly|installment
│   ├── views.js            ← All view renderers: dashboard, list, import, settings
│   │                          renderList() with month nav + filter chips
│   │                          renderSpendingChart() using dailyExpenseBars SVG
│   │                          renderAccountsSection() with share controls + recipient UI
│   │                          email backup handler (mailto: + Web Share API)
│   │                          import-email-text handler (paste + parse BACKUP markers)
│   └── app.js              ← Entry point, routing, Firebase init, auth lifecycle
│                              weekly backup reminder check at startup
├── tests/
│   └── run.mjs             ← 206 tests passing
└── CLAUDE.md               ← เอกสารนี้
```

### 11.2 Tests status

- **206 tests passing** (utils, state/store, parsers, voice, crypto)
- Test runner: `node --import ./tests/loader.mjs tests/run.mjs` (loader mocks Firebase CDN imports สำหรับ Node.js)

### 11.3 Bug fixes — ทั้งหมดที่แก้แล้ว

**Parser / data:**
1. Node 22 crypto read-only getter
2. พร้อมเพย์ vs จ่ายบิล split into separate groups
3. Time strings (10:30) polluting numbers → `maskNonAmounts()`
4. Phone numbers regex fix `0\d{1,2}[\s-]\d{3}[\s-]\d{4}`
5. Invalid amount=0 transactions → `_isValid()` rejects
6. Bad date format polluting monthlyStats → regex validation
7. `extractAmount` truncated 30000→300 (greedy regex) → split patterns

**Firebase / Firestore:**
8. `migrateAccountToCloud` permission-denied: batch write account+transactions failed เพราะ tx security rules ทำ `get()` บน parent — แก้: `await setDoc(accountRef)` ก่อน แล้ว batch transactions แยก
9. Shared account not revoked: `remove-share-email` handler ไม่เรียก `updateSharedWith()` เมื่อ list empty — แก้: เรียก Firestore เสมอก่อน update local state
10. `mergeSharedAccounts` missed `owner: null` accounts: condition `a.owner &&` ทำให้ accounts ที่ไม่มี owner ไม่ถูก revoke — แก้: เปลี่ยนเป็น `a.owner !== myEmail`

**State / calculations:**
11. Soft-deleted transactions ถูกนับในการคำนวณ — แก้: เพิ่ม `activeTxs()` helper, ใช้ใน `getMonthSummary`, `getTopCategories`, `getTodayTransactions`, `getDailyExpenses`, `getMonthComparison`
12. Received accounts ค้างหลัง sign out — แก้: `clearReceivedAccounts(myEmail)` ใน `onAuthStateChanged(null)`

**UI:**
13. Account icon สีผิด (hardcode สีเขียว KBank ให้ทุก bank) — แก้: `bankGradient(bank, type)` helper
14. Bar chart ไม่ responsive (CSS div) — แก้: ใช้ SVG จาก `dailyExpenseBars()` + `width: 100%`
15. Filter chips ใน list view ไม่ทำงาน — แก้: `makeFilterFn` + event binding ครบ
16. Account picker ใช้ `prompt()` — แก้: bottom-sheet overlay UI
17. ยอดคงเหลือบัญชีบน dashboard ไม่ตรง — แก้: คำนวณจาก transactions จริงแยก account_id + type ไม่ใช้ statement balance
18. Text size ใน Settings ไม่ apply จริง — แก้: bind event ถูก selector + apply `:root font-size`
19. Dark mode: ปุ่มเลือกประเภทรายการ (type selector / filter chips) อักษรขาวบนพื้นขาว — แก้: `html[data-dark="1"] .chip`, `.seg-item` contrast fix
20. Dark mode: ปุ่มลงชื่อเข้าใช้อ่านไม่ออก — แก้: เพิ่ม dark override rule
21. ATM cash balance นับรวม transfer เข้าด้วย — แก้: เฉพาะ ATM withdraw เท่านั้นที่เพิ่ม cash balance ตอน import
22. Dashboard แสดงบัญชี inactive (ยอด 0) — แก้: filter เฉพาะบัญชีที่ active ก่อนแสดง
23. Forecast chart ยอดไม่ตรง — แก้: ใช้ยอดคำนวณจากรายการจริงแทนการอ่าน field ตรง
24. Edit account popup — เดิมแสดง inline ใน settings ดูรก — แก้: เปลี่ยนเป็น popup modal เมื่อกดดินสอ

**Voice / UX:**
25. Voice input ข้อความซ้ำ 4 ครั้ง — Chrome `continuous=true` ยิง `onresult` หลายรอบสำหรับ segment เดียวกัน; เดิมใช้ `finalTranscript +=` สะสม — แก้: อ่านแค่ `e.results[e.results.length - 1]` (result ล่าสุดเสมอ)
26. ฝ่ายที่ 2 (recipient) กดลบแล้วไม่มีผล — `State.getTransactions()` filter `deleted_by != null` ออก → `find()` คืน undefined → handler return ก่อนทำอะไร — แก้: ใช้ `State.getState().transactions.find()` ซึ่งรวม soft-deleted

**Storage / Settings:**
27. localStorage compact format (v2) — `compactTx()` / `expandTx()` ลดขนาด ~55% (key mapping: `amount→amt`, `group→grp`, `description→ds`, `account_from→af`, `account_to→at`, เวลาเก็บเป็น Unix ms); storage key เปลี่ยนจาก `diary_finance_v1` → `diary_finance_v2`
28. `settings.last_email_backup` (YYYY-MM-DD) — เพิ่มใหม่ เก็บวันที่สำรอง email ล่าสุด

**Firebase token:**
29. `result._tokenResponse?.oauthAccessToken` เป็น internal field ที่อาจเปลี่ยนได้ตลอด — แก้: ใช้ `GoogleAuthProvider.credentialFromResult(result).accessToken` (official API) ทั้งใน firebase.js และ drive.js

### 11.4 Banks supported (parsers)

KTB, KBank, SCB, BBL, BAY/Krungsri, TTB, GSB, BAAC, GHB, TISCO, KKP, CIMB, UOB, LHB, ICBC, Citi (16 banks total)

**Launch with 5:** KTB, KBank, SCB, BBL, Krungsri (covers 80%+)

**Account icon colors (CSS `.acct-icon.{bank}` + JS `bankGradient()` ต้องตรงกัน):**
- ktb → #5fb0e0→#3787c5, kbank → #6cc16c→#45984a, scb → #b378c0→#8a59a0
- bbl → #4f7eb8→#2a5a94, bay → #e8b649→#c79939, cash/other → #c89368→#a07246

### 11.5 What's done vs pending

✅ **Done:**
- 16 banks PDF parser + confidence scoring
- Voice NLP Thai
- Min balance + days-below alert
- Daily/monthly stats + month comparison
- **7 color themes + dark mode** (Diary default) + text size 3 ระดับ (ใช้งานได้จริง)
- Lucide icons inline
- Bottom nav + FAB + full-screen add modal + in-app keypad
- Recurring template engine + scheduler + forecast
- Dashboard: hero card + บันทึกวันนี้ (หลัง hero) + accounts (active only) + categories + 14-day SVG chart + cashflow forecast (ยอดจริง)
- List view: month selector + filter chips + search
- **Add modal:** account picker (bottom-sheet) + backdate option + 6 frequency options; layout ใหม่ (account picker บนหมวด, แถวจำนวนเงิน centered)
- **Account management:** 4 default accounts + เพิ่มด้วยตนเอง + edit popup + ลบ 2 วิธี (เฉพาะรายการ / ทั้งบัญชี+รายการ)
- **PDF import:** partial select + duplicate detection พร้อมแสดง existing tx เปรียบเทียบ + ATM cash fix
- **Account balance:** คำนวณจาก transactions จริงแยก account_id
- Selective account sharing (F1.12) — real-time Firestore complete
- Sign-in/out UI + display name for shared accounts
- Soft delete / two-stage delete for shared transactions
- Two-way revoke detection (owner revoke → recipient UI clears)
- Settings: shared account UI อยู่ติดกับแชร์บัญชี; text size อยู่ในส่วนธีม; display name อยู่ในส่วนบัญชี
- **Shared badge** บน transaction rows (ไอคอน users เล็กๆ หน้า category label) สำหรับรายการในบัญชีแชร์
- **Drive backup (F1.9 DONE):** สำรองไปยัง Google Drive (`drive.file` scope) + กู้คืนจาก Drive + auto-backup ทุก 7 วัน
- **localStorage compact (v2):** `compactTx()` / `expandTx()` ลด ~55%, key v1→v2
- 232 tests (229 passed)

⏳ **Pending implementation:**
- Onboarding 3-screen (F1.7)
- Privacy Story Page (F1.8)
- Gamification: coins + level UI (F1.13)
- Microinteractions polish (haptic, scale animations)
- Swipe actions on list rows
- Empty states with 2-path CTA
- Auto-detect recurring from PDF history (F2.1)
- Calendar view for forecast (F2.2)

⏳ **Pre-launch ops (user's responsibility):**
- DBD พาณิชย์อิเล็กทรอนิกส์ registration
- Privacy Policy + Terms of Service (Thai)
- Google Play Console account ($25)
- Sentry + PostHog setup
- Beta tester list (~50)
- Marketing channels (Pantip, FB groups, TikTok?)

---

## 12. Roadmap

### Pre-launch (remaining)

**สัปดาห์ 1:** Polish ที่ค้างอยู่
- Microinteractions (haptic, scale, tally)
- Swipe actions on list rows
- Empty states (2-path CTA)
- Gamification: coins + level UI

**สัปดาห์ 2:** Onboarding + Privacy
- Onboarding 3-screen
- Privacy Story Page
- ~~Backup/restore JSON~~ ✅ Done
- ~~Google Drive backup~~ ❌ ตัดออก → Email backup ✅ Done

**สัปดาห์ 3:** Stability + Pre-launch ops
- Test fixtures 5 ธนาคาร
- Edge case testing
- Sentry integration
- Privacy Policy + Terms (Thai)
- จดทะเบียนพาณิชย์อิเล็กทรอนิกส์
- Google Play Console + TWA wrapper

**สัปดาห์ 4:** Launch
- Soft launch → 50 beta users
- Fix critical bugs
- Official Play Store launch

### Post-launch (เดือน 2-12)

**เดือน 2-3:** Iterate
- Auto-detect recurring from PDF history
- Forecast calendar view
- Smart reminders (gentle)
- Bug fixes

**เดือน 4-5:** Scale
- 5 → 10+ banks
- Receipt OCR / Slip
- Bug report in-app
- Comeback / catch-up mode

**เดือน 6:** Monetization Phase 2
- Affiliate (1 placement)
- A/B test, disclosure compliance

**เดือน 7-12:** Expand
- 16 banks complete
- Investment tracking (early)
- Family sharing

### Year 2

- Cloud sync v2.0 (Firebase, ทุก account ไม่ใช่แค่ shared)
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
- Microinteractions level — full (haptic+animation+sound) vs subtle — TBD
- Gamification: แสดง level ที่ไหน — Settings เท่านั้น หรือ mini badge ที่ dashboard?

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
| 2026-05 | Cloud sync: v2.0 (not v1.1) | Privacy story + scope; Drive backup ทดแทนในระหว่างนี้ |
| 2026-05 | Use Firebase (not Sheets) for v2 sync | Avoid OAuth verification complexity |
| 2026-05 | Backup: JSON + Drive (drive.file scope) | Email backup ตัดออก — Drive ใช้ scope เดียวกับ sign-in ไม่ต้องตั้งค่าเพิ่ม (developer enable API ครั้งเดียวใน Cloud Console) |
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
| 2026-05 | Gemini OAuth: user ต้องเปิด AI Studio ก่อน | chat gemini.google.com ไม่นับ; ถ้า 403 → แนะนำเปิด aistudio.google.com |
| 2026-05 | PDF มีรหัส + Gemini fallback → ส่ง extractedText ไม่ส่งไฟล์ | Gemini ถอดรหัส PDF ไม่ได้; pdf.js decrypt ก่อนแล้วส่ง text |
| 2026-05 | Gamification: 8 levels + เหรียญรายวัน (ทองแดง/เงิน/ทอง) | habit formation; subtle UX; level ชื่อไทย เน้นการบริหารเงิน |
| 2026-05 | Level 7-8 ชื่อ "นักบริหารเงิน" ไม่ใช่ "นักลงทุน" | "นักลงทุน" แคบเกิน ไม่ครอบคลุม user ที่ไม่ได้ลงทุน |
| 2026-05 | GitHub Secrets + Actions สร้าง config.js ตอน deploy | API keys ไม่เคย commit ใน repo |
| 2026-05 | Firebase: Web app, Auth Google + Firestore เท่านั้น, region asia-southeast1 | ไม่ต้องการ Storage/Functions/Hosting |
| 2026-05 | Play Store: GitHub Pages ฟรีก่อน → ซื้อ domain ตอน submit | ยังไม่เคย submit = เปลี่ยน domain ก่อน submit ไม่มีผลเสีย |
| 2026-05 | migrateAccountToCloud: เขียน account ด้วย setDoc ก่อน แล้ว batch transactions แยก | Firestore tx security rules ทำ get() บน parent doc — ต้อง commit ก่อน batch จะสำเร็จ |
| 2026-05 | remove-share-email ต้อง call updateSharedWith() เสมอแม้ list empty | root bug ของ "shared account not revoked" — Firestore ไม่รู้เว้นแต่จะ write |
| 2026-05 | activeTxs() pattern: soft-deleted ออกจากการคำนวณทั้งหมด แต่ยังแสดงใน list สีเทา | trust + UX: เห็นว่าถูกลบ แต่ไม่กระทบตัวเลข |
| 2026-05 | created_by_name เก็บตอน save (snapshot) ไม่ lookup ตอน render | recipient ไม่รู้จัก settings ของ owner — ต้องฝัง name ใน transaction |
| 2026-05 | Two-stage delete: soft → hard เมื่อคนที่สองลบ | ให้ทุกคนในบัญชีเห็นว่ามีการลบ ก่อนหายจริง |
| 2026-05 | subscribeSharedAccounts() เรียกทันทีเมื่อ sign in ไม่รอ shared-with callback | เจ้าของบัญชีต้อง subscribe own cloud accounts ทันที |
| 2026-05 | clearReceivedAccounts(myEmail) เรียกตอน sign out | ล้าง received accounts จาก UI ทันที ไม่รอ Firestore |
| 2026-05 | bankGradient() JS helper ต้องตรงกับ CSS .acct-icon.{bank} เสมอ | ถ้าแก้สีที่ CSS ต้องแก้ JS ด้วย และกลับกัน |
| 2026-05 | Account picker: bottom-sheet overlay แทน prompt() | prompt() บล็อก thread, ไม่ stylable, UX แย่ |
| 2026-05 | Bar chart: ใช้ SVG จาก dailyExpenseBars() แทน CSS div | responsive ผ่าน viewBox, accurate data จาก activeTxs() |
| 2026-05 | List view: default แสดงเดือนปัจจุบัน (month selector) แทนแสดงทั้งหมด | แสดงทุกรายการพร้อมกันทำให้ scroll ยาวเกิน + filter ทำงานแปลก |
| 2026-05 | Backdate option ("ย้อนหลัง") ใน add modal: frequency='past' + date picker max=yesterday | user ลืมบันทึก ต้องย้อนหลังได้ — บันทึกเป็น tx ปกติแต่ใช้วันที่เลือก |
| 2026-05 | Freq grid: 3×2 layout (3 คอลัมน์) สำหรับ 6 ตัวเลือก | จาก 5×1 เดิม เพิ่ม "ย้อนหลัง" ทำให้ต้องปรับ grid |
| 2026-05 | ผู้รับแชร์ไม่มีสิทธิ์ลบบัญชี — มีแค่ปุ่ม "ปฏิเสธ" เพื่อยกเลิก access ตัวเอง | การลบบัญชีเป็นสิทธิ์ของ owner เท่านั้น |
| 2026-05 | Theme system: Friendly → Diary เป็น default; เพิ่ม 6 color themes (Ocean/Forest/Rose/Slate/Citrus/Violet); Dark mode toggle แยก | ขยายตัวเลือกเพื่อ personalization; dark mode เป็น accessibility need |
| 2026-05 | Edit account: เปลี่ยนจาก inline settings → popup modal เมื่อกดดินสอ | inline ทำให้หน้า settings ดูรกเกินไป; popup สะอาดกว่า |
| 2026-05 | Default accounts 4 ตัว (เงินสด/เงินฝากธนาคาร/การลงทุน/หนี้สิน) + เพิ่มเองได้ | user ต้องการ account type ที่ไม่ใช่แค่ bank จาก PDF |
| 2026-05 | ลบบัญชี: 2 วิธี — ลบเฉพาะรายการ (บัญชีคงไว้) หรือ ลบทั้งบัญชีและรายการ | use case ต่างกัน: อยากเคลียร์ข้อมูล vs อยากลบบัญชีทิ้งจริงๆ |
| 2026-05 | ATM cash balance: นับเฉพาะ ATM withdraw ไม่นับ transfer เข้า | transfer เข้าคือเงินที่อยู่ในธนาคารอยู่แล้ว ไม่ใช่เงินสดใหม่ |
| 2026-05 | parser: ใช้ X-coordinate detectColumns() แยก withdrawal/deposit column แทน keyword-only | แก้ Bug income↔expense สลับใน KTB+BBL เมื่อ description ไม่มี keyword ชัดเจน |
| 2026-05 | parser: isSkipRow() กรอง B/F, C/F, ยอดยกมา, Total ออกก่อน parse | แก้ Bug BBL B/F row ถูกอ่านเป็น expense |
| 2026-05 | parser: tx.direction ('in'/'out') แทน column_hint; autoClassifyType() ใช้ direction เป็น primary signal | direction จาก column position แม่นกว่า keyword เพราะรู้ว่าอยู่ column ไหน |
| 2026-05 | parser: verifyParseResult() cross-check balance arithmetic; ผล verification ส่งออกใน parsePDF() return | ใช้แทน/เสริม confidence score เดิม — detect income/expense swap ได้จาก balance inconsistency |
| 2026-05 | tests/loader.mjs + loader-hooks.mjs: ESM loader mock Firebase CDN URLs สำหรับ Node.js test | firebase.js ใช้ https:// CDN ที่ Node.js ESM loader ไม่รองรับ; loader intercept และ return stub |
| 2026-05 | Dashboard: แสดงเฉพาะบัญชีที่ active (ยอด≠0 / มาจาก PDF / user ตั้งชื่อ) | ป้องกัน default accounts ที่ไม่ได้ใช้ทำให้ dashboard รก |
| 2026-05 | Account balance: คำนวณจาก transactions จริง (income+expense+transfer แยก account_id) | ยอดจาก statement อาจไม่ up-to-date และไม่รวม manual entries |
| 2026-05 | PDF import: เลือกรายการแต่ละรายการได้ (partial import) + แสดง existing tx เปรียบเทียบตอนซ้ำ | ให้ user ตัดสินใจเองว่ารายการไหนซ้ำจริง แทนที่ระบบจะ auto-skip |
| 2026-05 | Add modal: title เปลี่ยนเป็น "บันทึกรายการ" (ไม่ใช่ "บันทึกรายจ่าย") | รองรับ income, transfer ด้วย ไม่ใช่แค่รายจ่าย |
| 2026-05 | Add modal: account picker ย้ายไปบนหมวด; แถวจำนวนเงิน ใส่จำนวน+ตัวเลข+ไมค์ อยู่บรรทัดเดียว | ลำดับสมเหตุสมผลกว่า: เลือกบัญชีก่อนหมวด; ตัวเลขอยู่กลางง่ายอ่าน |
| 2026-05 | Dashboard: บันทึกวันนี้ย้ายมาอยู่หลัง hero card | ให้ hero card (ภาพรวม) เป็นสิ่งแรกที่เห็น แล้วค่อยตามด้วยรายการวันนี้ |
| 2026-05 | Drive backup (drive.file scope) แทน Email backup | drive.file = non-sensitive scope ไม่ต้อง Google verification; developer enable Drive API ใน Cloud Console ครั้งเดียว; ใช้ token เดียวกับ Firestore sign-in |
| 2026-05 | Drive backup: ไฟล์เดียว (create/PATCH) ไม่เก็บหลาย version | UX เรียบง่าย; user กู้คืนจาก version ล่าสุดเสมอ; file ชื่อ `diary-finance-backup.json` |
| 2026-05 | Drive token หมดอายุเมื่อ page reload → requestDriveAccess() popup ใหม่ | Firebase session restore ไม่ return access token; drive.js จัดการ popup อัตโนมัติเมื่อ user กดปุ่ม |
| 2026-05 | Drive API setup: developer enable ใน Cloud Console, ไม่ใช่ user | ความเข้าใจผิดเดิมว่า user ต้องทำ — จริงแล้วเป็นงาน developer ทำครั้งเดียว (APIs & Services → Library → Google Drive API → Enable + เพิ่ม drive.file scope ใน OAuth consent screen → Data Access) |
| 2026-05 | localStorage v2: compactTx()/expandTx() ลด ~55% | key สั้น (amt/grp/ds/af/at), timestamp เป็น Unix ms, ตัด fields ที่ derive ได้; storage key v1→v2 |
| 2026-05 | Voice onresult: อ่านแค่ result ล่าสุด ไม่สะสม | Chrome continuous=true ยิง onresult ซ้ำหลายรอบ; `finalTranscript +=` ทำให้ข้อความซ้ำ 4x |
| 2026-05 | soft-delete lookup ใน delete handler ต้องใช้ `State.getState().transactions` ไม่ใช่ `State.getTransactions()` | getTransactions() filter deleted_by!=null ออก → recipient กดลบ soft-deleted row ไม่ได้ |
| 2026-05 | shared badge บน transaction rows: ไอคอน users (11px) หน้า category label | แสดงว่ารายการมาจากบัญชีแชร์โดยไม่รก; `.shared-badge` + `.entry-cat { display:flex }` |
| 2026-05 | firebase.js: ใช้ GoogleAuthProvider.credentialFromResult(result).accessToken | result._tokenResponse?.oauthAccessToken เป็น internal undocumented field — อาจเปลี่ยนได้ทุก Firebase release |
| 2026-05 | Carbon theme: น้ำเงิน #1d4ed8, พื้นหลังเย็น #f1f4f9, หมึกเข้ม #0f172a, radius 10px, tabular-nums, hairline border บน card | ธีมสำหรับ "smart man" รู้สึก precision/professional โดยไม่เปลี่ยน layout |
| 2026-05 | Carbon: เปลี่ยน primary → #1e3a72 (น้ำเงินกรมท่า), ฟอนท์ Noto Sans Thai แทน Mali, เพิ่ม dark-mode-safe palette (#0d1829 bg, lighter navy accent #2a4e8c) | Slate theme ถูกลบออก |

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
- **activeTxs()** — helper ใน state.js ที่ filter `deleted_by == null` ก่อน return transactions ใช้ในทุก calculation
- **soft delete** — ตั้ง `deleted_by = email` แทนลบจริง ยังเห็นในหน้า list แต่สีเทา ไม่นับในตัวเลข
- **hard delete** — `deleteDoc()` จาก Firestore จริง เกิดเมื่อคนที่สองกดลบ (two-stage delete)
- **bankGradient(bank, type)** — JS helper ใน add.js คืน CSS gradient string ตามธนาคาร ต้องตรงกับ `.acct-icon.{bank}` ใน styles.css

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

*End of Project Knowledge — Version 1.2, May 2026*
