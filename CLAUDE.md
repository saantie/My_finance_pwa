# Project Knowledge — แอปการเงินส่วนตัวภาษาไทย

**เอกสารฉบับเดียวที่รวมทุกการตัดสินใจ, research, design choices และ state ของ project**

Version: **2.0** — May 2026 (revised direction after diary-mode build)
Owner: Solo developer
Stage: Pre-launch (working prototype, design system locked, integration phase)

> **Note on v2.0 direction change:** เอกสาร v1.0 (Mar 2026) ตัดสินใจไป local-first + no-signup + vanilla parsers. หลังจาก build prototype จริง (May 2026) ตัดสินใจปรับทิศทางใหญ่ 3 เรื่อง: (1) ใช้ **Firebase Auth + Firestore** แทน localStorage ตั้งแต่แรก, (2) ใช้ **Gemini API** ผ่าน user's Google OAuth สำหรับ parse PDF/slip แทน vanilla parser, (3) เพิ่ม **shared account** (บัญชีครอบครัว). เหตุผลใน Decision Log ข้อ 2026-05a ถึง 2026-05e

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
แอปบันทึกรายรับ-รายจ่ายภาษาไทยที่ **ลดงานบันทึกของผู้ใช้ 90%** ผ่าน AI parsing (Gemini) สำหรับ PDF e-Statement และ slip โอน พร้อม **บัญชีแชร์ครอบครัว** และเตือนยอดต่ำสุดล่วงหน้า

### Tagline
> **"แค่ login Google — แอปอ่าน statement, สลิป, จัดหมวดให้ ทำงานข้ามอุปกรณ์"**

### Core USPs (v2.0)

1. **AI parsing ผ่าน user's Google account** — Gemini API อ่าน PDF e-Statement และ slip ใบเสร็จ; ใช้ quota ฟรีของ user เอง (Google sign-in ครั้งเดียวได้ทั้ง Firebase + Gemini)
2. **Shared accounts (บัญชีครอบครัว)** — กำหนดบัญชีให้สามี/ภรรยา/ลูก/สมาชิกบ้านบันทึกร่วมกัน; ระบบ generate Account ID เพื่อ share
3. **Min balance + days-below-threshold alert** — feature ที่ไม่มีในแอปไทยตัวไหน
4. **Cashflow forecast 30 วัน + daily budget remaining** — ก่อนสิ้นเดือนเหลือใช้ได้วันละเท่าไหร่
5. **PWA + cloud sync** — เปิดบน PC, Android, iOS, sync ผ่าน Firebase
6. **Diary mode UI** — น่ารัก, อ่านง่าย, Mali font, อารมณ์สมุดบันทึก
7. **Voice input ภาษาไทย** — กดไมค์ใหญ่ พูด "ค่ากาแฟ 65 บาท" → บันทึกอัตโนมัติ
8. **Multi-bank ในที่เดียว** — รวมยอดทุกบัญชี รวมทั้งบัตรเครดิต, e-wallet

### Anti-positioning (สิ่งที่จะไม่เป็น)
- ❌ "เหมือน Piggipo แต่ดีกว่า" — brand เขาแกร่ง, ขายไม่ออก
- ❌ "เหมือน Money Manager แต่ภาษาไทย" — Wallet Story ทำไปแล้ว
- ❌ "ครบทุก feature" — เป็น trap ของ solo dev
- ❌ "Anonymous, no login" — เปลี่ยนทิศทางแล้ว (เหตุผลใน Decision Log)

### What changed from v1.0
| v1.0 (Mar 2026) | v2.0 (May 2026) |
|---|---|
| Local-first, no signup | Firebase + Google login required |
| Vanilla JS PDF parsers (16 banks) | Gemini API parsing (any bank, any format) |
| No PC version → PWA later | PWA cloud sync from day 1 |
| Single user | + Shared accounts (family) |
| Charmonman font | Mali font (น่ารัก, อ่านง่ายกว่า) |
| Basic forecast | Daily budget remaining + behavior-based projection |

---

## 2. Target Market & User

### Primary persona
**คนเงินเดือน 25-40 ปี ในเขตเมือง** ที่:
- มีบัญชีหลายธนาคาร (เงินเดือน + ออม + บัตรเครดิต)
- ใช้ digital banking เป็นหลัก (PromptPay, แอปธนาคาร, บัตรเครดิต)
- ดาวน์โหลด PDF e-Statement จากแอปธนาคารได้ แต่ไม่อยากบันทึกเอง
- มี Google account ใช้งานประจำ (Gmail, Drive, Maps)
- ต้องการเห็นภาพการเงินรวมของตัวเอง

### Secondary persona (new in v2.0)
**ครอบครัวคู่สมรส 28-45 ปี** ที่:
- มีบัญชีร่วมในธนาคาร หรือใช้ "เงินกลาง" ที่ทั้งคู่เติม
- ทั้งคู่อยากเห็นยอดและบันทึกรายการได้
- ต้องการความโปร่งใส (ใครใช้อะไร, เมื่อไหร่)

### Market sizing
- PromptPay มี **80M+ บัญชี** (BoT 2024-2025)
- กลุ่ม digital-first ในไทย ~70-80% ของกลุ่มเป้าหมาย
- Cash-heavy กลุ่ม freelance/ครอบครัว/ตลาด ~20-30%
- มี Google account ในไทย ~50M+ (ผ่าน Android adoption)

### User segments (priority)
| Segment | % ของ target | ใช้แอปอย่างไร |
|---|---|---|
| Digital-first salaryperson | 60% | Gemini PDF + auto-classify + voice = 95% accuracy |
| ครอบครัวมีบัญชีร่วม | 20% | Shared account + ทั้งคู่บันทึก + see-all |
| Cash-heavy freelance | 15% | Wallet manual + slip scan + voice |
| Multi-bank power user | 5% | Multiple PDF import + min balance per account |

---

## 3. Competitor Analysis Summary

### 3.1 Top competitors (เหมือน v1.0)

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

### 3.2 Market gaps ที่แอปนี้จะ fill (updated v2.0)

| Gap | คู่แข่งทำได้ไหม? | ของเรา |
|---|---|---|
| AI-powered PDF parsing (Gemini) | ❌ ไม่มีตัวไหน | ✅ NEW v2.0 |
| Slip OCR ผ่าน AI (Gemini) | ❌ ไม่มี | ✅ NEW v2.0 |
| Shared family account | ❌ ไม่มีตัวไหนในไทย | ✅ NEW v2.0 |
| Min balance + days-below alert | ❌ ไม่มี | ✅ |
| Forecast + daily budget remaining | Expense Manager เท่านั้น (พื้นฐาน) | ✅ enhanced |
| PWA / Web version ฟรี | ❌ ไม่มี free option ในไทย | ✅ |
| เข้าใจ พ.ศ. + ธนาคารไทย | Wallet Story, MAKE | ✅ |
| Voice input ภาษาไทย NLP ดี | MeTang (ทำไม่ดี) | ✅ |
| Donut chart per account + รวม | Money Manager (rigid UI) | ✅ enhanced |
| 30+ หมวดหมู่ที่หลากหลาย | Money manager (Orange Dog) | ✅ ขยายตาม |

### 3.3 Lessons จากแอป 4.8-4.9★ (สำหรับ category design)

จาก Money manager & expenses (Orange Dog, 4.9★) และ Money+ Cute (4.8★):
- หมวดหมู่ default ครอบคลุม **30+ หมวด** (ไม่ใช่ 10)
- จัดกลุ่มเป็น **parent → sub** (เช่น อาหาร → กลางวัน/เย็น/ของหวาน)
- ไอคอน **น่ารัก + สีจัด** (ไม่ใช่ minimalist gray)
- User เพิ่ม custom category ได้
- แสดง icon ใหญ่ในหน้า list (ไม่ใช่แค่ text)

จาก Money manager (Orange Dog) 4.9★:
- **Stability + zero bugs = brand** — review ที่ขายแอปนี้คือ "no issues"
- **Developer engagement** — ตอบทุก review ภายใน 1 วัน → trust building
- **Playful + colorful UI** ชนะ rigid + professional ใน mass market
- **Recurring transactions** = killer feature
- **2-tap entry** ลด friction

จาก Money+ Cute (4.8-4.9★):
- **"Cute" คือ product strategy** ไม่ใช่ adjective
- ~~"Local storage = selling point"~~ — v2.0 เปลี่ยนเป็น "user-owned Firebase" instead
- **Built-in calculator** ในหน้า input — ✅ มีแล้ว
- **Multi-ledger** สำหรับแยก context — ใกล้เคียง shared account

---

## 4. Behavioral / Retention Research

(เหมือน v1.0 — research ไม่เปลี่ยน)

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

### 4.2 6 เหตุผลที่ user เลิกใช้

1. **Tracking fatigue** 🔥🔥🔥🔥🔥 — *"didn't like being so aware of how little money I had"*
2. **Emotional discomfort** 🔥🔥🔥🔥 — เห็นรายจ่าย = รู้สึกผิด → หลบแอป
3. **Friction/onboarding** 🔥🔥🔥🔥 — ขอข้อมูลเยอะเกินก่อนเห็น value
4. **Privacy anxiety** 🔥🔥🔥 — กลัวข้อมูลการเงินรั่ว
5. **Trust erosion จาก bug** 🔥🔥🔥 — *"transactions duplicate, go missing → stop trusting"*
6. **Goal achieved/lost** 🔥🔥 — happy abandonment

### 4.3 ความท้าทายเฉพาะของแอปการเงิน

- **Reward ไม่ทันที** — บันทึก 1 ครั้ง → ผลเห็นหลัง 30 วัน
- **Reward เป็น negative** — เห็นรายจ่ายเยอะ = guilt
- **User รู้อยู่แล้ว** — *"I know I spent too much on coffee"* → ไม่ต้องเปิดแอปก็ได้

### 4.4 กลยุทธ์ป้องกันการเลิกใช้

1. **ลด tracking fatigue** — Gemini PDF/slip parsing (one-shot 50 รายการ)
2. **เปลี่ยน guilt → insight** — comparative framing, daily budget remaining
3. **Lazy entry onboarding** — Google sign-in 1 tap → เห็น value ก่อนขอ PDF
4. **Privacy transparency** — บอกชัดว่าข้อมูลอยู่ใน Firebase ของ user เอง
5. **NO streak mechanic** — research บอก: streak = guilt = quit
6. **Aha moment** ตั้งแต่ครั้งแรก (sign in → PDF → 50 รายการ + insight)
7. **ออกแบบสำหรับ user ที่ใช้เป็น cycle** (เปิด 2 อาทิตย์ → หาย 1 เดือน → กลับมา)

### 4.5 KPIs ที่ต้องวัด

✅ **MAU/Install ratio** — % ของ user ที่ยังกลับมา
✅ **Time-to-first-value** — กี่วินาทีถึงเห็น insight แรก (target: < 30s รวม Google sign-in)
✅ **Voluntary return rate** — เปิดจาก home screen
❌ **NOT** DAU — สำหรับ social media
❌ **NOT** Time-in-app สูง — แอป tool ที่ดี = ใช้น้อย ไม่ใช่ติดตา

---

## 5. Product Principles

### 5.1 Core principles (v2.0 revised)

1. **User-owned cloud** — ข้อมูลอยู่ใน Firebase ของ user (ไม่ใช่ server กลางของเรา); user export/delete ได้
2. **AI-augmented, not AI-required** — Gemini ช่วย parse แต่ user แก้/ลบทุกอย่างได้; ไม่บังคับใช้ AI
3. **Lazy entry** — ระบบทำงาน user ไม่ทำงาน
4. **No guilt** — แสดงข้อมูล ไม่ตัดสินผู้ใช้
5. **Low friction** — Google sign-in 1 tap → ใช้งานได้ทันที (ไม่กรอกข้อมูลก่อน)
6. **Reversible** — ทุกการตัดสินใจของ system ผู้ใช้แก้ได้ (รวม auto-categorize)
7. **Visible** — ระบบไม่ตัดสินใจอะไรลับๆ; แสดงเสมอว่า "ระบบจัดเป็น X" + ปุ่มแก้

### 5.2 What changed from v1.0

| v1.0 Principle | v2.0 |
|---|---|
| Local-first (data ใน device) | User-owned cloud (Firebase ของ user) |
| No signup | Google sign-in (1 tap, ไม่กรอกเอง) |
| Privacy = data ไม่ออก device | Privacy = data ไม่ออก user's Google scope |

### 5.3 Anti-patterns (ห้ามทำ)

❌ Streak counter, daily badge
❌ Mascot ที่ "เสียใจ/โกรธ" เมื่อใช้เงินเยอะ
❌ "Over budget!" warning สีแดงเต็มจอ
❌ Push notification "คุณหายไป N วัน"
❌ Auto-merge / auto-delete ข้อมูล user โดยไม่บอก
❌ Banner ad ในจุดสำคัญ
❌ Hard paywall เพื่อใช้ feature พื้นฐาน
❌ Email tracking, analytics SDK ที่ส่งพฤติกรรมการเงิน
❌ AI categorize **โดยไม่บอก user ว่ามาจาก AI** + ไม่ให้แก้
❌ Force shared account access — ต้องเชิญ + confirm

### 5.4 Tone of voice

| ❌ ห้าม | ✅ ใช้ |
|---|---|
| "Over budget!" | "เหลือ 5 วัน + 2,000 ฿" |
| "Failed savings goal" | "ยังไปต่อได้ — เริ่มใหม่ทุกเดือน" |
| "30-day streak!" | "บันทึกครบ 23/30 วัน" |
| "You spent too much" | "เดือนนี้ใช้มากกว่าเดือนก่อน 12% — เป็นช่วงเทศกาลรึเปล่า?" |
| "Days below threshold: 9" | "9 วันที่ยอดใกล้เกณฑ์" |
| "AI categorized as 'อาหาร'" | "เราเดาว่าเป็น 'อาหาร' — แก้ได้" |

---
## 6. Data Model

### 6.1 Top-level collections (Firestore)

```
/users/{uid}
  ├── profile (doc): { display_name, email, photo_url, created_at, locale }
  ├── settings (doc): { threshold_satang, theme, language, notification_enabled }
  ├── accounts/{accountId}  (subcollection)
  ├── transactions/{txId}    (subcollection)
  ├── templates/{templateId} (subcollection — recurring)
  └── memberships/{accountId} (subcollection — index of shared accounts user joined)

/shared_accounts/{accountId}
  ├── meta (doc): { owner_uid, display_name, member_count, created_at, type }
  ├── members/{uid} (subcollection): { uid, role, joined_at, display_name }
  └── transactions/{txId} (subcollection)
```

### 6.2 User profile

```typescript
{
  uid: string,                       // Firebase Auth UID
  display_name: string,
  email: string,
  photo_url: string | null,
  created_at: ISO timestamp,
  locale: 'th',
  // Gemini access
  has_gemini_scope: boolean,         // granted Gemini API scope during OAuth
  gemini_scope_granted_at: ISO timestamp | null
}
```

### 6.3 Transaction (core entity, updated v2.0)

```typescript
{
  id: string,                        // Firestore-generated
  date: "YYYY-MM-DD",                // ISO Gregorian (internal), แสดง พ.ศ.
  type: "income" | "expense" | "transfer" | "investment" | "debt" | "refund",
  amount: number,                    // Integer satang (positive)
  balance: number | null,            // Integer satang, end-of-tx balance
  category: string,                  // "เงินเดือน", "อาหาร"
  group: string,                     // "salary", "food" (key ใน CATEGORIES)
  description: string,
  account_id: string,                // *NEW v2.0* — เก็บ account id เดียว
  bank: string | null,               // "ktb", "kbank", ...
  source: "import" | "manual" | "voice" | "slip" | "scheduled" | "gemini",
  user_classified: boolean,          // true = user แก้แล้ว (อย่า override)
  // *NEW v2.0*
  owner_uid: string,                 // who created (especially in shared account)
  shared_account_id: string | null,  // null = personal, else = shared
  template_id: string | null,        // ถ้ามาจาก scheduled
  parsed_by: "gemini" | "regex" | null, // ถ้ามาจาก import
  // Timestamps
  created_at: ISO timestamp,
  updated_at: ISO timestamp
}
```

### 6.4 Account (v2.0 expanded)

```typescript
{
  id: string,                        // Auto-generated: "acc-3xkn7d2" (8 char base32)
  bank: string | null,               // "ktb", "kbank", or null
  account_number_masked: string,     // "xxx-x-x7821-x"
  display_name: string,              // user-editable
  type: "bank" | "cash" | "credit_card" | "ewallet" | "investment",
  // Balance & alert
  current_balance: number,           // satang
  threshold: number,                 // satang, custom per account
  // *NEW v2.0*: sharing
  is_shared: boolean,                // true = synced to /shared_accounts/{id}
  shared_id: string | null,          // ID ของ shared account ที่ link กับ (ถ้า is_shared)
  // Detection
  detected_at: ISO timestamp,
  user_renamed: boolean,
  // Color (for UI consistency — donut chart)
  color: string                      // hex color, generated from bank or user-pick
}
```

### 6.5 Shared account (NEW v2.0)

```typescript
{
  id: string,                        // "fam-3xkn7d2" (3 char prefix + 8 char id)
  display_name: string,              // "บัญชีครอบครัวลีโอ"
  description: string,
  owner_uid: string,                 // creator (admin role)
  type: "family" | "couple" | "roommate" | "business" | "other",
  current_balance: number,
  threshold: number,
  created_at: ISO timestamp,
  member_count: number,              // denormalized for query
  color: string
}

// Sub: /shared_accounts/{id}/members/{uid}
{
  uid: string,
  display_name: string,               // snapshot from /users/{uid}/profile
  email: string,
  role: "owner" | "member" | "viewer",
  joined_at: ISO timestamp,
  invited_by: string                  // uid
}
```

**Join flow:**
1. User A สร้าง shared account → ระบบ generate ID "fam-3xkn7d2"
2. User A แชร์ ID ให้คนในบ้าน (ส่ง Line, copy-paste)
3. User B เข้าเมนู "นำเข้าบัญชีแชร์" → ใส่ ID
4. ระบบเพิ่ม uid ของ B ลง /shared_accounts/{id}/members
5. B เห็น account ในรายการของตัวเอง, บันทึก/อ่านได้

**ID format:** prefix (3 chars) + dash + 8 chars random (lowercase base32)
- `fam-3xkn7d2p` = family
- `cpl-9mvr4t8e` = couple
- `acc-2hxq8wb5` = generic

### 6.6 Recurring template (v2.0 expanded)

```typescript
{
  id: string,
  type: "income" | "expense" | "transfer",
  amount: number,                    // satang per occurrence
  group: string,
  description: string,
  account_id: string,
  shared_account_id: string | null,
  // Schedule
  frequency: "one-time" | "monthly" | "weekly" | "yearly" | "installment",
  first_due: "YYYY-MM-DD",
  next_due: "YYYY-MM-DD" | null,
  last_executed: "YYYY-MM-DD" | null,
  // Installment-specific
  installment_total: number | null,
  installment_paid: number,
  // Status
  active: boolean,
  owner_uid: string,
  created_at: ISO timestamp
}
```

### 6.7 Settings

```typescript
{
  threshold_satang: number,          // Default 200000 (2,000 ฿)
  theme: "diary",                    // (Future: "pro")
  language: "th",
  notification_enabled: boolean,
  // Gemini usage tracking (display-only)
  gemini_quota_warning: boolean,     // warn user if rate-limited
  // Sharing
  default_shared_account: string | null
}
```

### 6.8 Expanded categories (NEW v2.0 — 30+ categories)

จาก review competitor 4.8-4.9★ apps (Money manager Orange Dog, Money+ Cute, Cashew):

#### รายจ่าย (parent → sub)
```typescript
const CATEGORIES = {
  // อาหาร & เครื่องดื่ม
  food:          { label: 'อาหารทั่วไป',     parent: 'food_group', color: '#ed7d5e', icon: 'utensils' },
  food_lunch:    { label: 'อาหารกลางวัน',   parent: 'food_group', color: '#ed7d5e', icon: 'utensils' },
  food_dinner:   { label: 'อาหารเย็น',       parent: 'food_group', color: '#ed7d5e', icon: 'utensils' },
  food_snack:    { label: 'ของว่าง/ขนม',     parent: 'food_group', color: '#f0b942', icon: 'cake' },
  coffee:        { label: 'กาแฟ/ชา',         parent: 'food_group', color: '#c89368', icon: 'coffee' },
  drink:         { label: 'น้ำดื่ม',          parent: 'food_group', color: '#5fa3d1', icon: 'cup' },
  groceries:     { label: 'ของกินใช้ในบ้าน',  parent: 'food_group', color: '#6fb267', icon: 'cart' },

  // เดินทาง
  transport:     { label: 'เดินทางทั่วไป',    parent: 'transport_group', color: '#5fa3d1', icon: 'bus' },
  fuel:          { label: 'น้ำมัน',           parent: 'transport_group', color: '#5fa3d1', icon: 'fuel' },
  taxi:          { label: 'แท็กซี่/Grab',     parent: 'transport_group', color: '#5fa3d1', icon: 'taxi' },
  publictransit: { label: 'BTS/MRT/รถเมล์',  parent: 'transport_group', color: '#5fa3d1', icon: 'train' },
  carmaintain:   { label: 'ดูแลรถ',           parent: 'transport_group', color: '#7a6a5c', icon: 'wrench' },

  // ที่อยู่อาศัย
  rent:          { label: 'ค่าเช่า/ค่าบ้าน', parent: 'home_group', color: '#b8825e', icon: 'home' },
  utility:       { label: 'ค่าไฟ',            parent: 'home_group', color: '#e8b649', icon: 'zap' },
  water:         { label: 'ค่าน้ำ',           parent: 'home_group', color: '#5fa3d1', icon: 'droplet' },
  internet:      { label: 'อินเทอร์เน็ต',     parent: 'home_group', color: '#8b6db5', icon: 'wifi' },
  phone:         { label: 'ค่ามือถือ',        parent: 'home_group', color: '#8b6db5', icon: 'phone' },
  homemaintain:  { label: 'ของใช้บ้าน',       parent: 'home_group', color: '#b8825e', icon: 'tool' },

  // ช้อปปิ้ง & สิ่งของ
  shopping:      { label: 'ช้อปปิ้งทั่วไป',  parent: 'shopping_group', color: '#e879a3', icon: 'bag' },
  clothing:      { label: 'เสื้อผ้า',         parent: 'shopping_group', color: '#e879a3', icon: 'shirt' },
  electronics:   { label: 'เครื่องใช้ไฟฟ้า',  parent: 'shopping_group', color: '#5fa3d1', icon: 'cpu' },
  cosmetics:     { label: 'เครื่องสำอาง',    parent: 'shopping_group', color: '#e879a3', icon: 'sparkles' },

  // สุขภาพ
  health:        { label: 'สุขภาพ',            parent: 'health_group', color: '#6fb267', icon: 'heart' },
  pharmacy:      { label: 'ยา/ร้านยา',         parent: 'health_group', color: '#6fb267', icon: 'pill' },
  fitness:       { label: 'ออกกำลังกาย',       parent: 'health_group', color: '#6fb267', icon: 'dumbbell' },

  // บันเทิง
  entertainment: { label: 'บันเทิง',           parent: 'entertain_group', color: '#b378c0', icon: 'gamepad' },
  subscription:  { label: 'Subscription',      parent: 'entertain_group', color: '#b378c0', icon: 'tv' },
  travel:        { label: 'ท่องเที่ยว',         parent: 'entertain_group', color: '#5fa3d1', icon: 'plane' },
  hobby:         { label: 'งานอดิเรก',         parent: 'entertain_group', color: '#b378c0', icon: 'palette' },

  // ครอบครัว & สังคม
  family:        { label: 'ครอบครัว',          parent: 'social_group', color: '#ed7d5e', icon: 'users' },
  gift:          { label: 'ของขวัญ',           parent: 'social_group', color: '#e879a3', icon: 'gift' },
  donation:      { label: 'บริจาค/ทำบุญ',     parent: 'social_group', color: '#f0b942', icon: 'heart' },
  pets:          { label: 'สัตว์เลี้ยง',       parent: 'social_group', color: '#c89368', icon: 'paw' },

  // การศึกษา/การลงทุน
  education:     { label: 'การศึกษา',          parent: 'edu_group', color: '#5fa3d1', icon: 'book' },
  course:        { label: 'คอร์ส/อบรม',        parent: 'edu_group', color: '#5fa3d1', icon: 'graduation' },

  // การเงิน
  fee:           { label: 'ค่าธรรมเนียม',     parent: 'finance_group', color: '#7a6a5c', icon: 'percent' },
  tax:           { label: 'ภาษี',              parent: 'finance_group', color: '#7a6a5c', icon: 'document' },
  insurance:     { label: 'ประกัน',            parent: 'finance_group', color: '#7a6a5c', icon: 'shield' },
  loan_payment:  { label: 'ผ่อน/หนี้',         parent: 'finance_group', color: '#d96b5e', icon: 'creditcard' },

  // รายรับ
  salary:        { label: 'เงินเดือน',          parent: 'income_group', color: '#6fb267', icon: 'cash' },
  bonus:         { label: 'โบนัส',              parent: 'income_group', color: '#6fb267', icon: 'gift' },
  freelance:     { label: 'งานอิสระ',          parent: 'income_group', color: '#6fb267', icon: 'briefcase' },
  refund:        { label: 'คืนเงิน',            parent: 'income_group', color: '#6fb267', icon: 'rotate' },
  interest:      { label: 'ดอกเบี้ย/ปันผล',    parent: 'income_group', color: '#6fb267', icon: 'trending' },
  investment_gain: { label: 'กำไรการลงทุน',   parent: 'income_group', color: '#6fb267', icon: 'chart' },
  other_income:  { label: 'รายรับอื่น',        parent: 'income_group', color: '#6fb267', icon: 'plus' },

  // โอน (ไม่นับ income/expense)
  transfer:      { label: 'โอนระหว่างบัญชี',  parent: 'transfer_group', color: '#5fa3d1', icon: 'transfer' },

  // อื่นๆ
  other:         { label: 'อื่นๆ',              parent: 'misc_group', color: '#c89368', icon: 'circle' }
};
```

รวม **~40 หมวด** — มาก ต้องจัดกลุ่ม UI ให้ scroll-friendly + recently-used at top

### 6.9 Auto-classification rules (v2.0 improved)

```typescript
// Hierarchy: keyword match → AI fallback → user_classified=true after manual edit
const AUTO_CLASSIFY_RULES = [
  // Order matters — เฉพาะเจาะจงก่อน

  // Food
  { match: /สตาร์บัค|amazon coffee|inthanin|true coffee|cafe|กาแฟ|coffee|latte|americano/i, group: 'coffee' },
  { match: /lotus|big c|tesco|tops|villa|maxvalu|gourmet/i, group: 'groceries' },
  { match: /7-?eleven|family mart|seven|7\/11/i, group: 'groceries' },
  { match: /grab\s*food|gojek\s*food|lineman|food\s*panda|foodpanda|wongnai/i, group: 'food' },
  { match: /ก๋วยเตี๋ยว|ข้าวกล่อง|ผัด|ของหวาน|มื้อ|ราเมง|ซูชิ|พิซซ่า/i, group: 'food' },

  // Transport
  { match: /ptt|esso|shell|ปตท|caltex|gulf|bangchak|บางจาก/i, group: 'fuel' },
  { match: /bts|mrt|airport rail|รถไฟฟ้า/i, group: 'publictransit' },
  { match: /grab\s*car|grab\s*bike|bolt\s*ride|taxi|วิน|มอเตอร์ไซค์|tuk\s*tuk/i, group: 'taxi' },
  { match: /รถเมล์|รถบัส|รถไฟ/i, group: 'publictransit' },

  // Home & Utility
  { match: /MEA|กฟภ|กฟน|metropolitan electricity|provincial electricity/i, group: 'utility' },
  { match: /กปภ|water authority|water\s*supply/i, group: 'water' },
  { match: /true|ais|dtac|nt|internet|fiber|wifi/i, group: 'internet' },
  { match: /โทรศัพท์|mobile|prepaid|รายเดือน/i, group: 'phone' },
  { match: /ค่าเช่า|ค่าหอ|condo|rent|landlord/i, group: 'rent' },

  // Shopping
  { match: /lazada|shopee|tiktok\s*shop|amazon\s*th/i, group: 'shopping' },
  { match: /uniqlo|h&m|zara|gu\s|cps|jaspal|adidas|nike/i, group: 'clothing' },
  { match: /apple\s*store|jaymart|samsung|jib|advice|banana\s*it/i, group: 'electronics' },
  { match: /watson|boots|sephora|กิ่กิ้|sasa|eveandboy/i, group: 'cosmetics' },

  // Health
  { match: /hospital|โรงพยาบาล|clinic|คลินิก|bangkok\s*hospital|bumrungrad|samitivej/i, group: 'health' },
  { match: /ร้านยา|fascino|p&f|pharmacy|drug\s*store/i, group: 'pharmacy' },
  { match: /fitness|gym|virgin\s*active|true\s*fitness|tonsai/i, group: 'fitness' },

  // Entertainment
  { match: /netflix|spotify|youtube\s*premium|disney|hbo|prime|viu|iqiyi|line\s*tv/i, group: 'subscription' },
  { match: /major|sf\s*cinema|imax|emquartier|cinema|โรงหนัง/i, group: 'entertainment' },
  { match: /agoda|booking|expedia|airasia|nok\s*air|airline|airport/i, group: 'travel' },

  // Income (overrides type → income)
  { match: /เงินเดือน|salary|payroll/i, group: 'salary', forceType: 'income' },
  { match: /ดอกเบี้ย|interest/i, group: 'interest', forceType: 'income' },
  { match: /โบนัส|bonus/i, group: 'bonus', forceType: 'income' },
  { match: /freelance|งานอิสระ|รับงาน/i, group: 'freelance', forceType: 'income' },

  // Transfer (overrides type → transfer)
  { match: /atm|withdraw|ถอน|cdm|ฝากเงินสด/i, group: 'transfer', forceType: 'transfer' },
  { match: /credit\s*card|บัตรเครดิต|ชำระบัตร|cc\s*payment/i, group: 'transfer', forceType: 'transfer' }
];
```

**Confidence threshold:**
- Keyword match → confidence 0.9 → set user_classified=false (อย่า skip review)
- AI (Gemini) classify → confidence variable → show "เราเดาว่า..." UI
- User manual → confidence 1.0 → ห้าม override

### 6.10 Edge cases

1. **ATM withdraw** → transfer (bank→cash), ไม่ใช่ expense
2. **บัตรเครดิต payment** → transfer (bank→cc), ไม่ใช่ expense
3. **PromptPay ระหว่างบัญชีตัวเอง** → transfer
4. **บันทึกซ้ำ** → duplicate detection popup
5. **Refund** → type='refund' (ลบล้าง expense เดิม)
6. **Split transaction** → split feature ระบุส่วนตัวเอง
7. **Shared transaction by other user** → แสดง avatar + name ของคนที่บันทึก
8. **Fee ฝัง** → parser แยก fee
9. **Gemini parse fail** → fallback regex parser → user แก้ทีละรายการ

---

## 7. Feature Specification

### 7.1 v1.0 Launch features (must-have)

#### F1.0 — Google sign-in (NEW v2.0, **blocking entry**)
- Firebase Auth provider: Google
- Scopes: `openid email profile` + `https://www.googleapis.com/auth/generative-language.retrieve` (for Gemini)
- 1-tap sign-in screen — ไม่ต้องกรอกอะไร
- หลัง sign-in → seed default cash account → ไปหน้า Dashboard
- Sign-out ใน Settings (data ยังอยู่ใน Firebase)

#### F1.1 — Voice input with auto-save (NEW v2.0, **major UX change**)
- **ปุ่มไมค์ใหญ่** (60-80px) ใน Add modal + ใน Dashboard hero card
- กดค้าง = อัด (haptic feedback)
- เห็น waveform animation ตอนพูด
- **เมื่อจบเสียงพูด → บันทึกทันที** (ไม่ต้องกดบันทึกอีก)
- แสดง summary inline ใต้ amount field:
  - **ขนาดอักษร 14px**
  - **ข้อความ:** *"✓ เพิ่ม 'ค่ากาแฟ' 65 บาท เข้า 'อาหาร' แล้ว"*
  - **ปุ่ม "ยกเลิก"** ท้ายบรรทัด (15px, underline) — กดแล้ว undo + ลบ tx
  - หายไปอัตโนมัติใน 8 วินาที
- Thai NLP improvements:
  - รองรับเลข Thai words ("ห้าสิบบาท", "สองพันห้าร้อย")
  - Auto-detect type (income/expense/transfer)
  - Auto-classify category (40 หมวด)
  - ถ้า amount ไม่ได้ → fallback เปิด modal ให้กรอก

#### F1.2 — PDF e-Statement Import via Gemini (NEW v2.0, **replaces vanilla parser**)
- User กดเมนู "นำเข้า" → tile "e-Statement"
- เลือก PDF (รองรับ password)
- **Gemini API parse** ผ่าน user's OAuth access_token:
  - ส่ง PDF + system prompt ที่ define schema
  - รับ JSON: `{ bank, account, transactions[] }`
  - แต่ละ tx: `{ date, amount, description, type, group }`
- หน้า review ก่อน confirm (เหมือน v1.0)
- กด "นำเข้าทั้งหมด" → batch write ไป Firestore

**Gemini system prompt:**
```
You are an expert Thai accountant. Extract transactions from this bank statement.
Return JSON with this exact schema:
{
  "bank": "kbank" | "ktb" | "scb" | "bbl" | "bay" | "ttb" | "gsb" | "baac" | "ghb" | "other",
  "account_number_masked": string (last 4 digits visible),
  "transactions": [{
    "date": "YYYY-MM-DD",
    "amount": number (positive, in baht),
    "description": string,
    "type": "income" | "expense" | "transfer",
    "group": <one of 40 categories>,
    "balance": number | null
  }]
}
- Convert Buddhist Era dates (พ.ศ.) to Gregorian (CE)
- ATM withdrawals = transfer type
- Credit card payments = transfer type
- Salary/payroll = income, group: salary
- Return only valid JSON, no markdown
```

#### F1.3 — Slip ใบเสร็จ Scan via Gemini (NEW v2.0)
- User กดเมนู "นำเข้า" → tile "Slip / ใบเสร็จ"
- เปิดกล้อง หรือเลือกรูปจาก gallery
- **Gemini multimodal** ผ่าน OAuth:
  - ส่งรูปภาพ + prompt ขอข้อมูล
  - รับ JSON: `{ amount, date, merchant, type }`
- เปิด Add modal pre-fill → user confirm
- รองรับทั้ง PromptPay QR slip + ใบเสร็จกระดาษ

**Gemini system prompt:**
```
You are reading a Thai payment slip or receipt.
Return JSON:
{
  "amount": number (in baht),
  "date": "YYYY-MM-DD" or null,
  "merchant": string or null,
  "type": "expense" | "income" | "transfer",
  "group": <category>,
  "ref": string or null
}
- For PromptPay transfer slip = type: transfer
- For shop receipt = type: expense
- Read both Thai and English text
```

#### F1.4 — Manual Entry [HAVE — refined]
- Quick add fields: amount + category + account + date + note
- **Calculator built-in** (1500+200, 1500*0.93)
- Smart defaults: today, expense, recent category
- Duplicate detection (Layer 2)
- 40 categories accessible via category strip (recent + all)

#### F1.5 — Recurring / Scheduled / Installment [HAVE in v2.0]
- ใน Add modal มี section "เกิดเมื่อไหร่":
  - วันนี้ (default)
  - ล่วงหน้า (one-time future, date picker)
  - ทุกเดือน (date picker for start)
  - ทุกสัปดาห์
  - ผ่อน (installment count + first due)
- Scheduler รัน on every app open
- เห็น upcoming list ที่ Dashboard

#### F1.6 — Account Management (NEW v2.0)
- หน้า Settings → "บัญชี"
- **เพิ่ม:** ระบุ display_name, type, bank (optional), starting_balance
- **ลบ:** confirm dialog — รายการที่ link จะถูก orphaned (account_id=null) แต่ไม่ลบ
- **แก้ชื่อ:** inline
- **กำหนดเป็นแชร์:** toggle → ระบบสร้าง shared_account record + generate ID
- **นำเข้าบัญชีแชร์:** เมนูแยก → กรอก ID → join

#### F1.7 — Shared Account / Family Account (NEW v2.0)
- กำหนดบัญชีให้แชร์ → ระบบ generate ID (เช่น `fam-3xkn7d2p`)
- เจ้าของแชร์ ID ให้สมาชิก (copy link, QR code, Line share)
- สมาชิกใช้เมนู "นำเข้าบัญชีแชร์" → กรอก ID → join (อาจ require approval)
- รายการในบัญชีแชร์ทุกคนเห็น + บันทึกได้
- แสดง avatar ของคนบันทึกในแต่ละ tx
- Roles:
  - **owner:** จัดการสมาชิก, ลบบัญชี
  - **member:** บันทึก, อ่าน, แก้รายการของตัวเอง
  - **viewer:** อ่านอย่างเดียว (สำหรับเด็ก/ผู้สูงอายุ)
- Firestore security rules ตาม role

#### F1.8 — Min Balance Alert + Days Below Threshold [HAVE]
- Per-account view (ไม่ใช่ยอดรวม)
- Default threshold = 2,000 ฿ (override per account)
- Trend: เปรียบเทียบเดือนก่อน
- Visual: red row + ⚠️ icon (ไม่ scary)

#### F1.9 — Dashboard (REVISED v2.0)
- **Hero insight card** "เดือนนี้คุณเหลือ +12,550 ฿"
- **ปุ่มไมค์ใหญ่** อยู่ใต้ hero (quick voice entry)
- **Daily budget remaining** (NEW): "เหลือใช้ได้วันละ 850 ฿ ถึงสิ้นเดือน" — คำนวณจาก (balance - upcoming recurring) / days_remaining
- **Donut chart: รวมทุกบัญชี** (NEW) — สัดส่วนรายจ่ายแต่ละหมวด
- **Donut chart: แต่ละบัญชี** (NEW) — เปลี่ยน chart โดยเลือก account chip
- **Forecast chart** — line 30 วันข้างหน้า (เหมือนเดิม)
- **คาดการณ์รายจ่ายเดือนนี้** (NEW): ใช้ avg from past 3 months + recurring; footnote "* รวมรายจ่ายประจำที่ตั้งไว้ใน avg แล้ว"
- **Daily expense bar chart** — 14 วันล่าสุด
- **Account list** with min-balance warning
- **Top categories** (3-5)
- **Today entries**
- **Upcoming recurring** section

#### F1.10 — Monthly transactions view (NEW v2.0)
- ใน List view มี date filter chips: "เดือนนี้" (default), "เดือนก่อน", "All time", "Custom range"
- "เดือนนี้" = แสดงรายการที่ date อยู่ในเดือนปัจจุบัน
- Header แสดง total income/expense ของเดือนนี้
- รายการแยกตามวัน

#### F1.11 — Donut Charts (NEW v2.0)
- **Donut "ภาพรวม"** — รวมรายจ่ายทุกบัญชีของเดือนนี้
- **Donut "เฉพาะบัญชี"** — เลือก account → ดูสัดส่วนรายจ่าย
- Interactive: tap segment → expand แสดง list ของหมวดนั้น
- Center: ตัวเลขรวม + label "รายจ่ายเดือนนี้"
- Legend: top 5 categories + "อื่นๆ"

#### F1.12 — Monthly Spending Forecast (NEW v2.0)
- ใน Dashboard มี card "คาดการณ์รายจ่ายเดือนนี้"
- Logic:
  - คำนวณ avg daily expense จาก 3 เดือนล่าสุด
  - Multiply by (วันในเดือนนี้) → projected total
  - บวก recurring ที่ครบกำหนดในเดือนนี้
- แสดง:
  - "คาดว่าเดือนนี้จะใช้ ~25,000 ฿"
  - Progress bar (used / projected)
  - **Footnote:** *"* คำนวณจากพฤติกรรมการใช้จ่ายเฉลี่ย 3 เดือนล่าสุด (อาจรวมรายจ่ายประจำในนั้นแล้ว) + รายการล่วงหน้าที่บันทึกไว้: ค่าเน็ต 590 ฿ (วันที่ 15), ผ่อน iPhone 2,500 ฿ (วันที่ 20)"*

#### F1.13 — Daily Budget Remaining (NEW v2.0)
- ใน Dashboard hero (ใต้ "เดือนนี้เหลือ...")
- Logic:
  - daily_budget = (สมมุติงบ - ที่ใช้ไปแล้ว - upcoming recurring) / วันที่เหลือ
  - งบ = user-set monthly budget หรือ avg income (default)
- แสดง:
  - "เหลือใช้ได้วันละ 850 ฿"
  - "ถึงสิ้นเดือน (15 วัน)"
  - สีตาม trajectory: เขียว (ดี), เหลือง (พอดี), แดง (ตึง)

#### F1.14 — Improved Auto-Categorization (REVISED v2.0)
- Stage 1: Regex rules (instant, offline)
- Stage 2: Gemini fallback (ถ้า regex confidence < 0.7)
- Stage 3: Learning from user edits (track changes per merchant → next time auto-apply)
- Confidence indicator (subtle) — *"เราเดาว่าเป็น 'อาหาร'"* + ปุ่มแก้ inline

#### F1.15 — Backup & Export
- Firebase Firestore = automatic backup (cloud-side)
- **Export JSON** ใน Settings → download
- **Export CSV** → spreadsheet-friendly (NEW v2.0)
- **Import JSON** → merge with current

#### F1.16 — Diary Mode UI [DONE in prototype]
- Mali font (heading)
- Cormorant Garamond italic (caption)
- Sarabun (body, numbers)
- Hand-drawn squiggle dividers
- Washi tape decoration on hero
- Date-as-diary-page header
- Soft cream paper background (#fdf9f0)
- Bright but not gaudy palette: terracotta, sage, dust-blue, mocha, plum, honey

### 7.2 v1.1 Features (เดือน 2-3 หลัง launch)

- Auto-detect recurring จาก historical PDF (Gemini analyze pattern)
- Smart reminders (gentle) — weekly digest
- Better PWA install promo
- Apple sign-in (parallel to Google) for iOS users

### 7.3 v1.2-v2.0 Features (เดือน 3-12)

- Affiliate suggestions (Phase 2 monetization)
- Bug report in-app
- Multi-currency (TH baht + USD for traveler)
- Goal-based saving
- Investment tracking (กองทุน, หุ้น via SET API ถ้าเปิด)
- Family financial overview (รวม shared accounts ของหลาย unit)
- Receipt OCR via Gemini batch (mass scan ของรอบสัปดาห์)

### 7.4 Cut from v2.0 launch (เลื่อนไป v1.x)
- เลื่อน: Notification daily (กลัวรบกวน, ตัดสินใจหลัง user feedback)
- เลื่อน: Investment tracking (เพิ่ม complexity, focus on core)
- ตัดทิ้ง: ~~Streak counter~~ (research บอกพัง retention)
- ตัดทิ้ง: ~~Achievement badge~~ (gamification ไม่เข้ากับ financial)
---

## 8. UX & Design System

### 8.1 5 หลักการสำคัญ (เก็บจาก v1.0)

1. **Time-to-first-value < 30 วินาที** — Google sign-in 1 tap → PDF import → 50 รายการ + insight
2. **One thumb, one tap** — ทุก action หลักทำด้วยมือเดียว
3. **Data = เรื่องราว** — แทน "expense: 22,450" ด้วย "เดือนนี้ใช้น้อยกว่าเดือนก่อน 8%"
4. **Microinteractions ทุก tap** — feedback < 100ms (haptic + animation)
5. **Empty state = โอกาสสอน** — ไม่ใช่ความล้มเหลว

### 8.2 Layout architecture

```
Bottom nav (4 tabs + FAB):
├── Home (Dashboard)
├── สถิติ (Stats — donut, charts, monthly view)
├── [ + ] FAB center → Add modal (with voice mic prominent)
├── นำเข้า (Import: PDF via Gemini + Slip via Gemini)
└── ตั้งค่า (Settings: Accounts, Shared, Privacy, Theme, Backup)
```

**Change from v1.0:**
- Replaced "บันทึก" tab with "สถิติ" (list still accessible from Home → "ดูทั้งหมด")
- Stats tab = donut charts + monthly view + forecast

### 8.3 Design tokens (Mali-driven, diary mode)

#### Diary mode (DEFAULT)
```
Background:  #fdf9f0  (warm paper)
Surface:     #ffffff
Ink:         #3d342c
Ink-soft:    #7a6a5c
Ink-faint:   #b3a596
Rule:        #ebe1cd
Rule-soft:   #f3ead8

Primary:        #e88563 (terracotta)
Primary-soft:   #fbe2d4
Income:         #6fb267 (sage)
Income-soft:    #d8ecd5
Expense:        #ed7d5e (clay)
Expense-soft:   #fbe0d6
Transfer:       #5fa3d1 (dust-blue)
Transfer-soft:  #d4e8f4
Mocha:          #c89368
Plum:           #b378c0
Honey:          #e8b649

Radius:      16px (cards), 12px (small), 9999px (pill)
Shadow:      0 8px 24px -16px rgba(80,60,30,0.15) (soft)

Fonts:
  Heading:  Mali (300-700) — น่ารัก, อ่านง่าย
  Body:     Sarabun (300-700)
  Caption:  Cormorant Garamond italic
```

### 8.4 Voice UI (key feature — NEW v2.0)

#### Mic icon — 2 sizes

**Compact (24-32px)** — ใน Add modal next to amount label
- Background: terracotta-soft circle
- Color: terracotta
- Tap = open voice listening overlay

**Large (80-100px)** — ใน Dashboard hero card + standalone "quick voice" button
- Background: gradient terracotta → darker
- Color: white
- Subtle pulse animation idle (1.2s breathe)
- Tap = open voice overlay + start listening immediately

#### Listening overlay (full-screen)
- Backdrop blur on app
- Large mic icon center with pulse ring animation
- Transcript text below mic (real-time, updates as user speaks)
- Hint text: *ลอง: "ค่ากาแฟ 65 บาท" · "เงินเดือน สองหมื่น"*
- Cancel button bottom

#### Post-voice summary inline (NEW v2.0)
หลัง voice บันทึกเสร็จ:
```
[ใต้ตัวเลขจำนวนเงิน, ก่อน category strip]
✓ เพิ่ม 'ค่ากาแฟ' 65 บาท เข้า 'อาหาร' แล้ว    [ยกเลิก]
```
- ขนาดอักษร: **14px**
- Color: sage (success)
- ปุ่ม "ยกเลิก": 13px, terracotta, underline; กดแล้ว undo + delete tx จาก Firestore
- หายไปอัตโนมัติใน 8 วินาที
- Slide-in animation จากบน

### 8.5 Donut charts (NEW v2.0)

**Style:**
- Inline SVG (ไม่ใช้ Chart.js)
- Outer ring 8px stroke
- Inner ring (donut hole) 100px radius — แสดงตัวเลขรวมตรงกลาง
- Segments เรียงตามขนาด, ใหญ่สุดเริ่มที่ 12 นาฬิกา
- สีตาม category color (จาก CATEGORIES.color)
- Top 5 segments แสดง label, ส่วนเหลือรวมเป็น "อื่นๆ"
- Animation: เริ่มจาก 0 องศา ขยายเป็น full ring (0.6s ease-out) เมื่อ first render

**Interactive:**
- Tap segment → expand แสดงรายการในหมวดนั้น (modal หรือ scroll-to)
- Tap center → toggle between "amount" และ "%"

**3 versions:**
- Overview donut — ทุกบัญชี
- Per-account donut — เลือก account chip → re-render
- Income donut — แยก income breakdown

### 8.6 Charts hierarchy

จาก simplest → complex:
1. **Daily bar chart** (14 วันล่าสุด) — เห็น pattern
2. **Donut: overall** — สัดส่วนรายจ่าย
3. **Donut: per account** — เลือก account
4. **Cashflow forecast** (line, 30 วันข้างหน้า) — เห็นอนาคต
5. **Monthly projection** (text + progress bar)
6. **Daily budget remaining** (text + sparkline)

### 8.7 Account management UI (NEW v2.0)

ใน Settings → "บัญชี":
```
[ + เพิ่มบัญชีใหม่ ]    [ ⇄ นำเข้าบัญชีแชร์ ]

🏛 กสิกร ...3344                            15,450 ฿  →
   บัญชีเงินเดือน · เกณฑ์ 2,000 ฿

💵 เงินสด                                       450 ฿  →
   กระเป๋า · ไม่มีเกณฑ์

👨‍👩‍👧 บัญชีครอบครัวลีโอ  [แชร์]                12,000 ฿  →
   3 สมาชิก · ID: fam-3xkn7d2p
```

แต่ละ row tap → modal edit ที่:
- เปลี่ยน display_name
- เปลี่ยน threshold
- กำหนดเป็นแชร์ (toggle) → generate ID + แสดง QR
- ลบบัญชี (confirm)

### 8.8 Onboarding (v2.0 revised)

3-screen flow:
1. **Welcome** — Logo + tagline + "Sign in with Google" button (1 tap)
2. **Permission explainer** — *"แอปใช้ Gemini อ่าน PDF/slip ของคุณ — ใช้ quota Google ของคุณเอง ฟรี"* + ปุ่ม "อนุญาต"
3. **First import** — *"นำเข้า PDF e-Statement ครั้งแรก เพื่อเห็นภาพการเงินของคุณ"* + ปุ่ม "เลือกไฟล์" / "ข้าม"

Skip ได้ทุกหน้า → ไปหน้า Dashboard with empty state

### 8.9 Microinteractions checklist

| Action | Feedback |
|---|---|
| กดปุ่ม | Scale 0.97 + haptic light |
| Save tx (voice) | Checkmark slide-in + sage flash + haptic success |
| Save tx (manual) | Same as above |
| Delete | Slide-out + undo toast |
| Pull-to-refresh | Spinner ลื่น |
| Long-press | Bounce + haptic |
| Form error | Shake + red highlight |
| Number change | Roll-up animation |
| Loading | Skeleton shapes |
| Donut segment tap | Pulse + expand |
| Voice listening | Pulse ring + waveform |

### 8.10 Mockups status

**Approved (May 2026):**
- mockup-dashboard.png — hero, accounts, categories, bottom nav
- mockup-add.png — full-screen modal + amount + keypad + cat strip
- mockup-list.png — search + chips + day-grouped + swipe
- screens-v0.3.html — diary mode + 2-tile import

**TODO before launch:**
- voice-listening-overlay mockup
- donut-charts mockup (overview + per-account)
- account-management mockup (with shared accounts UI)
- shared-account-join mockup
- gemini-import-progress mockup

---

## 9. Business Model

### 9.1 Pricing strategy (unchanged)

| Tier | Cost | What you get |
|---|---|---|
| **Free** | ฟรีตลอด | ทุก core feature: PDF/slip via Gemini, voice, manual, shared accounts, charts, forecast |
| **Phase 2: Affiliate** | ฟรี + revenue from clicks | Insight-driven suggestions (opt-out ได้) |

**Note:** Gemini API ใช้ quota ของ user เอง (free tier) — เราไม่ต้องจ่าย AI cost

### 9.2 ทำไมไม่มี subscription
- Money Manager subscription = top user complaint
- กลุ่มเป้าหมายไทยไม่นิยมจ่าย subscription
- Money+ Cute, Orange Dog ฟรี + ads → 4.7-4.9★

### 9.3 Affiliate (Phase 2, เดือน 6+)
- Partners: Involve Asia, AccessTrade
- Verticals: บัตรเครดิต, บัญชีออม, สินเชื่อ, ประกัน
- Revenue projection: MAU 10K = ~50,000 ฿/เดือน; MAU 50K = ~250,000 ฿/เดือน
- Compliance: "[โฆษณา]" disclosure ตาม สคบ., suggestion engine ฝั่ง client

### 9.4 Firebase cost (NEW concern v2.0)
- Free tier: 50K reads, 20K writes, 1GB storage/วัน
- 10K users × ~100 reads + 30 writes/วัน = 1M reads + 300K writes → **เกิน free tier**
- Spark plan (free) → Blaze plan (pay-as-you-go) ตอน MAU > 5K
- Estimated: MAU 10K = ~$50-100/เดือน, MAU 100K = ~$500-1000/เดือน
- Mitigation: aggressive caching, client-side dedup, batch writes

---

## 10. Technical Architecture

### 10.1 Stack decisions (v2.0 revised)

| Layer | Technology | Reason |
|---|---|---|
| Frontend | Vanilla JS + PWA (ES modules) | No framework lock-in, fast loading |
| Auth | **Firebase Auth (Google provider)** | Built-in OAuth, secure, supports Gemini scope |
| Storage | **Firestore** | Realtime sync, security rules, free tier ดี |
| PDF parsing | **Gemini 1.5 Flash** (via user's OAuth) | High accuracy, no per-bank tuning |
| Slip OCR | **Gemini 1.5 Flash multimodal** | Reads QR + receipt images |
| Voice | Web Speech API (browser, free) | On-device, no API cost |
| Charts | Inline SVG | Lightweight, themed |
| Hosting | Firebase Hosting (free tier) | Cloud Functions ready ถ้าต้องการ |
| Android | TWA (PWA wrapper) | Solo dev maintainability |
| iOS | Phase 2+ (รอรายได้) | Apple Dev fee 99 USD/ปี |
| Crash report | Sentry (free 5k events/mo) | |

### 10.2 Auth flow (Google OAuth via Firebase)

```js
// js/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const app = initializeApp({/* config */});
export const auth = getAuth(app);
export const db = getFirestore(app);

const provider = new GoogleAuthProvider();
// Request Gemini API scope alongside basic profile
provider.addScope('https://www.googleapis.com/auth/generative-language.retrieve');
provider.setCustomParameters({ prompt: 'select_account' });

export async function signIn() {
  const result = await signInWithPopup(auth, provider);
  // Get Google access_token for Gemini API
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const geminiToken = credential.accessToken;
  // Store in memory only (never localStorage)
  sessionStorage.setItem('gemini_token', geminiToken);
  sessionStorage.setItem('gemini_token_expires', Date.now() + 3600000);
  return result.user;
}
```

### 10.3 Gemini API call pattern

```js
// js/gemini.js
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export async function parseStatementWithGemini(pdfBase64, userToken) {
  const response = await fetch(`${GEMINI_ENDPOINT}?key=&access_token=${userToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: SYSTEM_PROMPT },
          { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } }
        ]
      }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });
  const data = await response.json();
  return JSON.parse(data.candidates[0].content.parts[0].text);
}
```

**Important:**
- access_token หมดอายุใน 1 ชม. — ต้อง refresh ผ่าน Firebase Auth
- ถ้า refresh fail → ต้อง sign in ใหม่ + ขอ scope อีก
- Rate limit Gemini free tier: 15 RPM, 1500 RPD (Flash 1.5)
- ถ้า user เกิน → แสดง error ที่เป็นมิตร + suggest "ลองอีก 1 ชม."

### 10.4 Firestore security rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Personal data — only owner can read/write
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth.uid == uid;
    }

    // Shared accounts — members can read/write
    match /shared_accounts/{accountId} {
      allow read: if isMember(accountId);
      allow create: if request.auth != null;
      allow update: if isOwner(accountId);
      allow delete: if isOwner(accountId);

      match /transactions/{txId} {
        allow read, create: if isMember(accountId);
        // Only original creator can edit/delete own tx
        allow update, delete: if isMember(accountId) &&
          resource.data.owner_uid == request.auth.uid;
      }

      match /members/{memberUid} {
        allow read: if isMember(accountId);
        // Self-join: any authed user can add themself
        allow create: if request.auth.uid == memberUid;
        // Owner can remove anyone
        allow update, delete: if isOwner(accountId);
      }
    }

    function isMember(accountId) {
      return request.auth != null &&
        exists(/databases/$(database)/documents/shared_accounts/$(accountId)/members/$(request.auth.uid));
    }

    function isOwner(accountId) {
      return request.auth != null &&
        get(/databases/$(database)/documents/shared_accounts/$(accountId)).data.owner_uid == request.auth.uid;
    }
  }
}
```

### 10.5 Data flow

#### Personal tx (user)
```
User action (manual/voice)
  → State.addTransaction()
  → Firestore write /users/{uid}/transactions/{txId}
  → onSnapshot subscriber re-renders view
```

#### PDF import via Gemini
```
User upload PDF
  → Read as base64
  → Get user's Gemini access_token (Firebase Auth credential)
  → Gemini API request with PDF + system prompt
  → JSON response { bank, account, transactions[] }
  → Show review modal
  → User confirms
  → Batch write to Firestore /users/{uid}/transactions/
  → Subscribe re-renders
```

#### Shared account write
```
User in family account adds tx
  → State.addTransaction({ ..., shared_account_id: 'fam-...' })
  → Firestore write /shared_accounts/{id}/transactions/{txId}
  → onSnapshot ของ user A + user B (members) re-renders
  → ทั้งสองเห็นรายการใหม่ทันที (realtime)
```

### 10.6 Privacy story (v2.0 revised)

**v1.0 was:** "ข้อมูลอยู่ใน device — ไม่ส่งออก"
**v2.0 is:** "ข้อมูลอยู่ใน Firebase ของคุณ — เราไม่อ่าน"

In-app messaging:
- "ข้อมูลถูกเก็บใน Firestore project ที่ระบุ scope ให้คุณคนเดียว"
- "PDF ที่นำเข้า → ส่งไปที่ Gemini ของ Google ผ่าน OAuth ของคุณเอง ไม่ผ่านเรา"
- "ลบบัญชี Google → ข้อมูลใน Firestore + Gemini หายตามกฎ Google"

**Compliance:**
- PDPA: เก็บ consent ตอน sign-in (Privacy Policy)
- ระบุชัดในหน้า Settings: "ลบบัญชี" → invoke Firebase admin SDK to delete all user data
- ไม่มี analytics (Google Analytics, Mixpanel) ในแอปการเงิน
- Sentry strip PII (replace email, account numbers ด้วย placeholder)

### 10.7 Offline strategy

- PWA service worker cache shell + last-fetched data
- Firestore offline persistence enabled — ข้อมูลล่าสุดอ่านได้ offline
- Voice input ใช้ Web Speech (ต้อง online)
- Gemini PDF/slip parsing ต้อง online (warn user ถ้า offline)
- บันทึก manual ทำได้ offline — sync เมื่อ online กลับมา

### 10.8 Migration จาก v1.0 (local-first prototype)

User ที่ใช้ prototype เก่า (localStorage data):
- On first sign-in → ตรวจ localStorage
- ถาม "พบข้อมูลใน device — ต้องการอัปโหลดเข้าบัญชี Google ของคุณไหม?"
- ถ้า Yes → batch upload all transactions to Firestore
- ลบ localStorage หลัง upload สำเร็จ

---

## 11. Codebase State

### 11.1 Repository structure (current, May 2026)

```
finance-app-diary/  (working prototype)
├── index.html              ← App shell + bottom nav + FAB
├── manifest.webmanifest    ← PWA manifest
├── sw.js                   ← Service worker (v1.2)
├── css/
│   └── styles.css          ← Diary mode design system (1800+ lines)
├── js/
│   ├── app.js              ← Entry point, scheduler boot
│   ├── state.js            ← Local state + localStorage (TO MIGRATE → Firestore)
│   ├── recurring.js        ← Recurring templates + scheduler
│   ├── utils.js            ← Money/date/calc helpers
│   ├── icons.js            ← SVG icons + CATEGORIES (need expansion to 40)
│   ├── views.js            ← Render dashboard/list/import/settings
│   ├── add.js              ← Add modal + keypad + voice + recurring picker
│   ├── voice.js            ← Web Speech + Thai NLP
│   ├── slip.js             ← jsQR camera (TO REPLACE WITH GEMINI)
│   ├── chart.js            ← Inline SVG forecast (NEED donut additions)
│   └── parsers.js          ← Vanilla PDF parser (TO REPLACE WITH GEMINI)
└── icons/icon.svg
```

### 11.2 What works (v1.2 prototype)

✅ Diary mode UI (Mali font, washi tape, squiggle)
✅ Bottom nav 4 tabs + FAB
✅ Add modal with keypad calculator
✅ Voice input (Web Speech + Thai NLP intent parser)
✅ Recurring/scheduled/installment data model + scheduler
✅ Cashflow forecast 30 days (line chart)
✅ Min-balance alerts per account
✅ JSON export/import
✅ PWA installable + offline
✅ Sample data seeded on first run

### 11.3 What's pending (v2.0 changes)

⏳ **Auth migration**
- Firebase project setup
- Google sign-in button + flow
- Add Gemini scope to OAuth
- Token refresh handling

⏳ **Storage migration**
- localStorage → Firestore
- onSnapshot listeners
- Offline persistence
- Migration helper for v1.0 users

⏳ **AI parsing migration**
- `parsers.js` → call Gemini API instead of pdf.js
- `slip.js` → use Gemini multimodal instead of jsQR
- Token-aware retry on 401

⏳ **Voice UX redesign**
- Large mic icon ใน Dashboard + Add modal
- Auto-save on voice end
- Summary inline ใต้ amount (14px + ยกเลิก button)
- Animation polish

⏳ **Shared accounts**
- `js/shared.js` — new module
- Generate account ID
- Join via ID
- Roles + Firestore security rules

⏳ **Charts expansion**
- `chart.js` — add donut chart helper
- Per-account donut
- Overall donut
- Income donut

⏳ **Monthly view**
- List view filter chips: "เดือนนี้" / "เดือนก่อน" / "All"
- Stats tab with month picker

⏳ **Categories expansion**
- 11 → 40 categories
- Parent → sub grouping
- Recently-used at top

⏳ **Dashboard enhancements**
- Daily budget remaining (text + sparkline)
- Monthly projection card with footnote
- Donut charts integration

⏳ **Tests**
- Existing 183 tests (v1.0) need migration
- New tests for Gemini parsing + shared accounts

### 11.4 Tests status

- 183 tests passing (utils, store, parsers, voice, crypto)
- Test runner: `node tests/run.mjs`
- TODO: add Gemini mock tests, Firestore emulator tests

### 11.5 Bug fixes preserved across sessions

1. Node 22 crypto read-only getter
2. พร้อมเพย์ vs จ่ายบิล split into separate groups
3. Time strings polluting numbers → maskNonAmounts()
4. Phone numbers regex fix
5. Invalid amount=0 transactions → _isValid() rejects
6. Bad date format polluting monthlyStats
7. extractAmount truncated 30000→300 → split patterns

---

## 12. Roadmap

### Pre-launch (8-10 สัปดาห์ — extended from v1.0's 4-6 เนื่องจาก scope ใหญ่ขึ้น)

**สัปดาห์ 1-2:** Firebase + Auth
- Setup Firebase project
- Google sign-in flow + Gemini scope
- Firestore schema + security rules
- Migration helper for v1.0 prototype data

**สัปดาห์ 3-4:** Gemini integration
- `parsers.js` rewrite → Gemini PDF
- `slip.js` rewrite → Gemini multimodal
- Token management + refresh
- Error handling + rate limit UX

**สัปดาห์ 5:** Voice UX redesign
- Large mic icons
- Auto-save on voice end
- Summary inline with undo
- Animation polish

**สัปดาห์ 6:** Shared accounts
- Data model + Firestore rules
- Account management UI
- Share via ID flow
- Member list + roles

**สัปดาห์ 7:** Charts + Dashboard enhancements
- Donut charts (overall + per account)
- Monthly projection card
- Daily budget remaining
- Monthly transactions filter

**สัปดาห์ 8:** Categories expansion + Polish
- 11 → 40 categories
- Auto-classify rules update
- Confidence UI
- Stats tab rebuild

**สัปดาห์ 9:** Pre-launch ops
- Sentry integration
- Privacy Policy + Terms (Thai) — updated for Firebase/Gemini
- Google Play Console + TWA wrapper
- OAuth consent screen verification (Google process: 4-8 weeks if sensitive scope!)
- DBD พาณิชย์อิเล็กทรอนิกส์

**สัปดาห์ 10:** Beta + Launch
- Soft launch → 50 beta users
- Fix critical bugs
- Public launch

### Post-launch (เดือน 2-12)

**เดือน 2-3:** Iterate
- Bug fixes from real users
- Auto-detect recurring from history (Gemini analyze)
- Apple sign-in (iOS users)
- Better PWA install promo

**เดือน 4-5:** Scale
- Multi-currency
- Receipt OCR batch (mass scan)
- Bug report in-app
- Comeback / catch-up mode

**เดือน 6:** Monetization Phase 2
- Affiliate (1 placement)
- A/B test
- Disclosure compliance

**เดือน 7-12:** Expand
- Goal-based saving
- Investment tracking
- Family financial overview (multi-shared)
- Cloud Functions for backend logic (notifications, smart reminders)

### Year 2
- iOS native app (rewrite ถ้า MAU > 50K)
- Net worth dashboard
- Direct bank API (ถ้า BoT เปิด open banking)
- Business expense mode (สำหรับ freelance/SME)

---

## 13. Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| **Google OAuth verification ช้า** (sensitive scope) | สูง | สูง | Apply early (สัปดาห์ 5-6), prepare security questionnaire |
| **Gemini API rate limit เร็ว** | กลาง | สูง | Cache PDF parses, batch requests, fallback to vanilla parser |
| **Firebase cost พุ่งตอน scale** | กลาง | สูง | Caching, dedup, monitor + Cloud Functions optimization |
| **User ไม่ยอม sign in Google** | กลาง | สูง | Demo mode (no sign-in, local only) แล้วค่อยชวน sign-in |
| **Shared account abuse** (เอา ID ไปให้ใคร) | กลาง | กลาง | Approval flow, role limits, audit log |
| **Gemini ระเบียง parse ผิด** | กลาง | กลาง | Confidence UI, easy edit, learning from corrections |
| ธนาคารเปลี่ยน PDF format | กลาง | ต่ำ | Gemini ปรับตัวได้เอง (vs vanilla parsers ที่ต้อง patch) |
| **PDPA compliance** | ต่ำ | สูง | Legal review, transparent privacy story |
| Solo dev burnout | สูง | สูง | Scope แคบ phase-by-phase, automate, FAQ ละเอียด |
| User ไม่เข้าใจ shared account | กลาง | กลาง | Onboarding modal + tutorial |
| Crash bug ทำให้ rating ตก | กลาง | สูง | Sentry, beta test, fix ภายใน 24 ชม. |
| **iOS Safari ไม่รองรับ Web Speech (Thai)** | สูง | กลาง | Fallback to keyboard, "voice บน Android เท่านั้น" disclaimer |

---

## 14. Open Questions

### Pre-launch (v2.0)
- Google OAuth consent screen — sensitive scope verification timeline?
- Gemini API free tier per-user — confirmed 15 RPM, 1500 RPD?
- Firebase Spark → Blaze transition trigger (MAU? cost?)
- Beta tester recruitment (~50)
- Marketing channels (Pantip, FB group, Twitter, TikTok?)
- Privacy Policy / TOS — เขียนเองหรือใช้ generator with Firebase/Gemini language?
- Shared account approval — auto-join vs invite-only at launch?

### Implementation details
- Firestore offline persistence — multi-tab sync?
- Gemini PDF base64 size limit — chunking strategy?
- Voice on iOS — เลื่อนหรือมี fallback?
- Donut chart segments < 5% — group as "อื่นๆ" หรือแสดง?

### Future
- Native rewrite trigger (MAU > 50K?)
- Investment tracking (Wallet Story competitive?)
- Direct bank API readiness (BoT open banking)

---

## 15. Decision Log

### v2.0 decisions (May 2026, **direction change**)

| Date | Decision | Rationale |
|---|---|---|
| 2026-05a | **Reverse local-first → Firebase + Google login** | Cloud sync เป็น top user pain (rank 2); PWA + multi-device จาก day 1 ดีกว่า; security ของ Firebase > localStorage |
| 2026-05b | **Use Gemini API for PDF/slip parsing** (not vanilla) | Higher accuracy across all banks; no per-bank tuning; ใช้ quota Google ของ user เอง → no AI cost |
| 2026-05c | **OAuth Gemini scope alongside Firebase Auth** | One sign-in for both; access_token from Firebase credential; sessionStorage only |
| 2026-05d | **Add shared accounts (family) feature** | Secondary persona (couples/families) demand; differentiator from all Thai competitors; ใช้ Firestore subcollection + security rules |
| 2026-05e | **Expand categories 11 → 40 (parent → sub)** | Mass-market apps 4.8★+ ทำแบบนี้; ให้ user เห็น granular spending |
| 2026-05f | **Voice auto-save + inline summary with undo** | Reduce friction (no extra confirm tap); "ยกเลิก" 8s gives safety net; inspired by Gmail send |
| 2026-05g | **Mali font replace Charmonman** | Mali น่ารัก แต่อ่านง่ายกว่า; gender-neutral; แต่ยังคงอารมณ์ diary |
| 2026-05h | **Daily budget remaining + monthly projection** | Behavioral research: forward-looking insight > backward-looking expense |
| 2026-05i | **Donut chart per account + รวม** | Visualize cleanly across multiple accounts; tap segment → drill down |
| 2026-05j | **Monthly transactions filter as default in List** | User intent: "ดูเดือนนี้ก่อน"; reduce noise |
| 2026-05k | **Account management as Settings sub-screen** | Centralize add/edit/delete; clear UI for shared toggle |
| 2026-05l | **Add improved auto-categorize (regex + Gemini fallback)** | Stage 1 instant, stage 2 accurate; learning from edits |
| 2026-05m | **Diary mode UI direction (Mali, washi, squiggle)** | Differentiator vs Pro/minimal apps; warmer than corporate finance |

### v1.0 decisions (Mar-Apr 2026, **some superseded**)

| Date | Decision | Status |
|---|---|---|
| 2026-04 | Skip wallet manual setup, use auto-detect from PDF | ✅ Still valid |
| 2026-04 | No subscription model | ✅ Still valid |
| 2026-04 | Affiliate over banner ads | ✅ Still valid (Phase 2) |
| 2026-04 | ~~Local-first by default~~ | ❌ **Superseded by 2026-05a** |
| 2026-04 | 5 banks at launch (not 16) | ⚠ Moot — Gemini handles all banks |
| 2026-04 | No streak mechanic | ✅ Still valid |
| 2026-04 | Android: TWA (not native) | ✅ Still valid |
| 2026-04 | iOS: Phase 2 | ✅ Still valid |
| 2026-04 | ~~Cloud sync v2.0~~ → backed by Firebase | ❌ Now in v1.0 launch |
| 2026-04 | ~~Use Firebase (not Sheets) for sync~~ | ✅ Confirmed, now expanded scope |
| 2026-04 | ~~Backup: JSON + Drive (drive.file scope)~~ | ❌ Replaced by Firestore auto-sync; JSON export still available |
| 2026-04 | Default theme: Friendly (Pro toggle) | ⚠ Updated → Diary mode (Mali) |
| 2026-04 | Theme toggle in Settings | ✅ Still valid |
| 2026-04 | Add `transfer` type to data model | ✅ Still valid |
| 2026-04 | Duplicate detection Layer 1+2 | ✅ Still valid (Layer 2 needs Firestore-aware) |
| 2026-04 | UX overhaul: bottom nav + FAB + hero card | ✅ Done in prototype |
| 2026-04 | Icons: solid color bg + white stroke | ✅ Still valid |
| 2026-04 | Category icons via Lucide inline | ✅ Still valid |
| 2026-04 | Mockup direction approved | ✅ Done |

### v1.2 prototype decisions (May 2026)

| Date | Decision | Rationale |
|---|---|---|
| 2026-05 | Diary mode evolved from Friendly (warm cream + washi + squiggle) | User feedback after mockups |
| 2026-05 | 2-tile import (PDF + Slip equal weight) | Equal frequency: PDF monthly + Slip daily |
| 2026-05 | Mali font for headings (replace Charmonman) | Better Thai readability + still น่ารัก |
| 2026-05 | Recurring/installment in same Add modal (frequency picker) | Reduces feature scattering |
| 2026-05 | Lazy-load pdf.js + jsQR from CDN | Avoid 530KB shell bloat |
| 2026-05 | Scheduler runs on app open (not background) | PWA limitation; acceptable trade-off |

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
- **NLP** — Natural Language Processing
- **OAuth** — Open Authorization (2.0 standard)
- **RPM/RPD** — Requests Per Minute / Day (rate limits)

---

## Appendix B — References

### Academic / behavioral research
- "When and Why Adults Abandon Lifestyle Behavior and Mental Health Mobile Apps" (NCBI, 2024)
- "Beyond Abandonment to Next Steps" (NCBI)
- "How Streaks and Daily Rewards Engineer Habit Loops" (Bootcamp, 2026)

### Industry research
- Decta Wallet Fatigue 2025
- UXCam mobile finance benchmarks
- NN Group finance app principles
- Onething Design "Budget App Design"
- Future Market Insights Expense Tracker Apps Market

### Technical references (NEW v2.0)
- Firebase Auth + Google Provider: https://firebase.google.com/docs/auth/web/google-signin
- Firestore security rules: https://firebase.google.com/docs/firestore/security/get-started
- Gemini API docs: https://ai.google.dev/docs
- Gemini OAuth 2.0 scope: https://developers.google.com/identity/protocols/oauth2/scopes#generativelanguage
- Web Speech API (browser support): https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API
- pdf.js: https://mozilla.github.io/pdf.js/

### Competitor analysis
- 10+ แอป reviewed: Cash Book, Money Tracker, Money manager & expenses (Orange Dog), Money+ Cute, Cashew, Money Manager (Realbyte), Money Lover, Piggipo GO, Wallet Story, MeTang, MAKE by KBank, SET Happy Money

---

## Appendix C — Files Status

### Prototype (working, May 2026)
- `finance-app-diary.zip` — diary mode prototype (v1.2)
- 17 files, 6,057 lines, 260KB unpacked

### Document files
- `PROJECT_KNOWLEDGE.md` — เอกสารนี้ (v2.0)
- `PRODUCT_SPEC.md` — original spec (v1.0, 898 lines)
- `UX_RESEARCH.md` — UX deep-dive (502 lines)

### Mockups
- mockup-dashboard.png, mockup-add.png, mockup-list.png
- screens-v0.3.html — diary mode 3-screen mockup
- preview-friendly.png, preview-pro.png (v1.0 themes — deprecated)

### Pending
- voice-listening-overlay mockup
- donut-charts mockup (overview + per-account)
- account-management mockup
- shared-account-join mockup
- gemini-import-progress mockup

---

*End of Project Knowledge v2.0*
