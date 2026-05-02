# การเงินส่วนตัว — Personal Finance PWA

PWA จัดการการเงินส่วนตัวภาษาไทย — **ฝั่ง client-side ทั้งหมด ไม่มี backend**
- รองรับ e-Statement PDF จากธนาคารไทย 16 ธนาคาร (auto-detect)
- เพิ่มรายการด้วยมือ + ด้วยเสียง (Web Speech API + Thai NLP)
- ซิงค์กับ Google Sheets ของผู้ใช้เอง (OAuth 2.0 PKCE flow)
- ทำงาน offline ได้ (Service Worker)
- ติดตั้งเป็นแอปได้บนมือถือ (PWA)

## รองรับธนาคาร

ระบบใช้ universal parser — auto-detect ธนาคารจากข้อความใน PDF แล้ว
ดึง transactions โดยใช้ balance-delta inference (robust กับ layout ที่ต่างกัน):

| ID | ธนาคาร |
|----|--------|
| ktb | กรุงไทย |
| kbank | กสิกรไทย |
| scb | ไทยพาณิชย์ |
| bbl | กรุงเทพ |
| bay | กรุงศรีอยุธยา |
| ttb | ทหารไทยธนชาต |
| gsb | ออมสิน |
| baac | ธ.ก.ส. |
| ghb | ธอส. (อาคารสงเคราะห์) |
| tisco | ทิสโก้ |
| kkp | เกียรตินาคินภัทร |
| cimb | ซีไอเอ็มบี ไทย |
| uob | ยูโอบี |
| lhb | LH Bank |
| icbc | ไอซีบีซี (ไทย) |
| citi | ซิตี้แบงก์ |

ถึงแม้ธนาคารใหม่ที่ไม่ได้ list ไว้ ระบบยังพยายาม parse ได้ (fallback universal)
แต่ข้อมูล `bank` field จะเป็น `unknown`

## โครงสร้าง

```
finance-pwa/
├── index.html             # Shell + 4 views (dashboard / import / add / settings)
├── manifest.webmanifest   # PWA manifest
├── sw.js                  # Service Worker (offline cache)
├── css/styles.css         # Single stylesheet (refined editorial aesthetic)
├── icons/                 # SVG app icons
├── js/
│   ├── utils.js           # Money math (satang integers), Thai dates BE↔CE,
│   │                       # Thai number-word parser
│   ├── store.js           # Transaction store + analytics
│   ├── parsers.js         # 16-bank detect + universal PDF row parser
│   ├── voice.js           # Web Speech wrapper + Thai NLP
│   ├── pdf.js             # pdf.js loader with password support
│   ├── dashboard.js       # Chart.js + tables
│   ├── google.js          # OAuth 2.0 PKCE + Sheets API v4 + offline queue
│   ├── ui.js              # Modals + toasts
│   └── app.js             # Glue
└── tests/run.mjs          # Node test harness (160 tests)
```

## รัน local

```bash
# เสิร์ฟ static files (ใช้ตัวไหนก็ได้)
python3 -m http.server 8000
# หรือ
npx http-server .
```

แล้วเปิด http://localhost:8000

## รัน tests

```bash
node tests/run.mjs
```

ควรเห็น `160 passed, 0 failed`

## Deploy ขึ้น GitHub Pages (สำหรับผู้ดูแลแอป)

ขั้นตอนทำครั้งเดียว — หลังจากนี้ end user ไม่ต้องตั้งค่า Google Cloud เอง

### 1. ตั้ง Google OAuth Client ID (ครั้งเดียว)

1. เปิด [Google Cloud Console](https://console.cloud.google.com/) → New Project
2. APIs & Services → Library → ค้นหา **"Google Sheets API"** → Enable
3. APIs & Services → OAuth consent screen
   - User type: **External** → Create
   - App name, support email — กรอกตามจริง
   - Scopes — ไม่ต้องเพิ่มที่นี่ (จะขอตอน sign-in)
   - Test users — เพิ่มอีเมลของคนที่จะใช้แอป (ระยะ Testing รับได้ ≤100 user
     โดยไม่ต้อง verify; ถ้าเกินต้องส่งให้ Google ตรวจสอบ)
4. APIs & Services → Credentials → Create Credentials → **OAuth Client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins: URL ของ deploy เช่น `https://you.github.io`
   - Authorized redirect URIs: URL เต็มของหน้าแอป เช่น
     `https://you.github.io/finance-pwa/`
5. คัดลอก Client ID (รูปแบบ `xxxxxxxxx.apps.googleusercontent.com`)

### 2. ใส่ Client ID ในแอป

แก้ไฟล์ `js/config.js` บรรทัดเดียว:

```js
window.APP_CONFIG = {
  GOOGLE_CLIENT_ID: 'xxxxxxxxx.apps.googleusercontent.com',  // ← วางตรงนี้
  DEFAULT_SHEET_NAME: 'การเงินส่วนตัว'
};
```

### 3. Deploy

```bash
git init && git add . && git commit -m "init"
git branch -M main
git remote add origin git@github.com:USERNAME/REPO.git
git push -u origin main
```

GitHub repository → Settings → Pages → Branch: `main` / `/ (root)`

ทุก path ในโปรเจกต์เป็น relative (`./...`) — ใช้ subpath
(`https://you.github.io/finance-pwa/`) ได้เลยไม่ต้องแก้

### 4. ส่งลิงก์แอปให้ผู้ใช้

แค่นั้น ส่ง URL ของแอปให้ใครก็ใช้ได้ — ไม่ต้องสอน Google Cloud

---

## วิธีใช้ (สำหรับ end user)

1. เปิดลิงก์แอป
2. เข้าเมนู **ตั้งค่า** → กด **"ลงชื่อเข้าใช้ด้วย Google"** → อนุญาตสิทธิ์
3. กด **"สร้าง Sheet ใหม่ให้เลย"** → แอปสร้าง Google Sheet ในบัญชีคุณให้อัตโนมัติ
   - หรือถ้ามี sheet อยู่แล้ว วาง URL ลงในช่อง "Google Sheets URL"
4. เริ่มใช้งาน — นำเข้า PDF e-Statement / เพิ่มรายการ / sync ขึ้น Sheet

> **ความเป็นส่วนตัว:** ไม่จำเป็นต้องแชร์ sheet เป็น public เลย — แอปเข้าถึง
> sheet ของคุณผ่าน OAuth token ที่เก็บในเครื่องเท่านั้น Sheet จะอยู่ใน
> Google Drive ส่วนตัวของคุณตามปกติ

---

## ทางเลือก: ไม่อยากให้ user ต้อง sign in?

ถ้าไม่ต้องการ Google OAuth flow เลย ทางเลือกคือ **Google Apps Script Web App
proxy** — แต่ละ user ต้อง:

1. สร้าง Google Sheet
2. เปิด Extensions → Apps Script
3. paste สคริปต์ที่รับ POST แล้ว `SpreadsheetApp.getActiveSpreadsheet().appendRow(...)`
4. Deploy as Web App → "Execute as: me, Who has access: Anyone"
5. paste URL ของ Web App ลงในแอป

แอปจะ POST JSON ไปที่ URL นั้น ไม่ต้องผ่าน OAuth ของ user เลย แต่ขั้นตอน
setup ต่อ user **เยอะกว่า** flow ที่ใช้ Client ID กลาง — ผมจึงไม่ implement
ไว้ใน build นี้ (สามารถเพิ่มเองได้ — เขียนใน `js/google.js` ฟังก์ชันใหม่)

---

## Schema ของ Google Sheets

แอปจะสร้าง 4 sheets ให้อัตโนมัติเมื่อกด "ดึง" หรือ "ส่ง" ครั้งแรก:

- **Transactions** — `id, date, type, amount_satang, category, group, description, bank, account, source, createdAt`
- **Investments** — (สำรองไว้สำหรับการลงทุน)
- **Debts** — (สำรองไว้สำหรับหนี้สิน)
- **Config** — (สำรองไว้สำหรับการตั้งค่า)

> หมายเหตุ: amount เก็บเป็น integer **สตางค์** (1 บาท = 100 สตางค์)
> ป้องกัน float-precision bug

## สถาปัตยกรรมที่สำคัญ

### 1. Money เป็น integer satang เสมอ
JavaScript number ไม่สามารถเก็บ `0.1 + 0.2 = 0.3` ได้ตรงเป๊ะ — ทุกที่ในโค้ด
เก็บเงินเป็น integer สตางค์ (e.g. ฿1,234.56 = 123456 satang) แปลงกลับเป็น
baht เฉพาะเวลาแสดงผล

### 2. Universal PDF parser
แทนที่จะเขียน parser แยกต่อธนาคาร เราใช้ pattern เดียว:
- หา date ใน row
- หา numbers ทั้งหมด (mask account number, phone, time string ก่อน)
- ถ้ามี 3 numbers → [debit, credit, balance]
- ถ้ามี 2 numbers → ใช้ balance-delta จาก previous row บอกทิศทาง
- ถ้ามี 1 number → ใช้ keyword (ฝาก/ถอน/โอนออก) บอกทิศทาง

แต่ละธนาคารแค่มี keyword set สำหรับ auto-detect ชื่อธนาคารเท่านั้น

### 3. Thai BE↔CE ปลอดภัย
- 4-digit ≥2400 → BE (ลบ 543)
- 4-digit ≤2200 → CE (ใช้เลย)
- 2-digit → ใช้ window ±25 ปีจาก BE ปัจจุบัน เลือกที่ใกล้ที่สุด
  - "69" + ref 2026 → BE 2569 → CE 2026 ✓
  - "26" + ref 2026 → CE 2026 (BE 2526 ห่างไป) ✓

### 4. Service Worker
- HTML: network-first → fallback to cache
- Static: cache-first
- CDN (Chart.js, pdf.js): cache-first
- Google APIs: **never cache** (always live)

## Bug log จาก build session

ระหว่างพัฒนา test runner เจอ + แก้ bugs จริง 7 ตัว:

1. **Test setup**: Node 22 มี `globalThis.crypto` เป็น read-only getter — แก้ด้วย `Object.defineProperty` + check ถ้ามีอยู่แล้ว
2. **Classifier merge**: "พร้อมเพย์" กับ "จ่ายบิล" ถูกรวมเป็นกลุ่มเดียว แต่ spec แยกชัดเจน (5 vs 2 รายการ ใน ม.ค.) — แยกเป็น `promptpay` / `bill`
3. **Time string pollution**: `10:30` ถูก extract เป็นตัวเลข `10` กับ `30` ปะปนกับ amount — เพิ่ม `maskNonAmounts()` mask `\b\d{1,2}:\d{2}\b` ก่อนหา number
4. **Phone number pollution**: `081-234-5678` ก็เช่นกัน — regex แรก mask `0\d` (2 digits) แต่เบอร์ไทยเป็น `0XX` (3 digits) แก้เป็น `\b0\d{1,2}[\s-]\d{3}[\s-]\d{4}\b`
5. **Invalid amount stored**: tx ที่ amount parse ไม่ได้ → กลายเป็น 0 และยังถูกเก็บ — เพิ่ม `_isValid()` reject `amount<=0`
6. **Bad date in stats**: tx ที่ date format ผิด ทำให้ `monthKey('bogus-date')` = `'bogus-d'` เข้า monthlyStats — `_isValid()` ตรวจ regex `^\d{4}-\d{2}-\d{2}$`
7. **extractAmount truncates digits**: regex `\d{1,3}(?:,\d{3})*` greedy match แค่ 3 หลักแรก — "30000" ออกมาเป็น 300 — แยกเป็น 2 patterns: comma-grouped first, then bare-digit fallback

160 tests ผ่านทั้งหมด — รวมถึง regression test เทียบกับสเป็คจริง (ม.ค. 2569: รับเข้า 53,511.20 / จ่ายออก 52,697.23 / พร้อมเพย์ 5 ครั้ง / จ่ายบิล 2 ครั้ง)

## Licence

MIT
