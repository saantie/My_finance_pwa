# Finance App — Diary Mode (v1.2)

แอปบันทึกการเงินส่วนตัวภาษาไทย — PWA, local-first, no server, no signup

## Features ที่ทำงานจริง

| Feature | Status |
|---|---|
| บันทึกธรรมดา + calculator keypad | ✅ |
| Voice input (Web Speech API + Thai NLP) | ✅ |
| รายจ่ายล่วงหน้า / ประจำ / ผ่อน | ✅ |
| Scheduler — สร้าง tx อัตโนมัติเมื่อครบกำหนด | ✅ |
| PDF e-Statement import (universal parser) | ✅ |
| Slip QR scanner (PromptPay) | ✅ |
| Daily expense chart 14 วัน | ✅ |
| Cashflow forecast 30 วัน | ✅ |
| Min-balance alert per บัญชี | ✅ |
| Diary mode UI (Mali font, washi tape, squiggle) | ✅ |
| Local-first (localStorage) | ✅ |
| Backup JSON export/import | ✅ |
| PWA installable + offline | ✅ |

## โครงสร้างไฟล์

```
finance-app-diary/
├── index.html              ← App shell + bottom nav + FAB
├── manifest.webmanifest    ← PWA manifest
├── sw.js                   ← Service worker (cache shell + fonts)
├── css/styles.css          ← Diary mode design system (~1800 lines)
├── js/
│   ├── app.js              ← Entry point + scheduler boot
│   ├── state.js            ← Transactions + accounts + computed
│   ├── recurring.js        ← Recurring templates + scheduler
│   ├── utils.js            ← Money/date/calc helpers
│   ├── icons.js            ← SVG icons + CATEGORIES
│   ├── views.js            ← Render 4 views + chart insights
│   ├── add.js              ← Add modal + keypad + voice + recurring picker
│   ├── voice.js            ← Web Speech API + Thai NLP intent
│   ├── slip.js             ← Camera + jsQR (lazy CDN)
│   ├── chart.js            ← Inline SVG forecast chart
│   └── parsers.js          ← PDF parser (lazy pdf.js)
└── icons/icon.svg
```

## วิธี run

```bash
cd finance-app-diary
python3 -m http.server 8000
# เปิด http://localhost:8000
```

ครั้งแรก: seed sample data (1 KBank account + 5 transactions + 2 recurring: ค่าเน็ต, ผ่อน iPhone)

## วิธีใช้แต่ละ feature

### บันทึกด้วยเสียง
ใน Add modal กดไอคอน **ไมค์** ข้างคำว่า "ใส่จำนวน" — พูดเป็นไทย:
- *"ค่ากาแฟ 65 บาท"* → expense, 65, coffee
- *"จ่ายค่าไฟ 450"* → expense, 450, utility
- *"ได้เงินเดือน 25000"* → income, 25000, salary
- *"โอนไปกสิกร 500"* → transfer, 500

รองรับเลข Thai words: *"ห้าสิบ"*, *"สองพัน"*

ต้องใช้ Chrome/Edge — iOS Safari ยังไม่รองรับภาษาไทย

### รายจ่ายล่วงหน้า / ประจำ / ผ่อน
ใน Add modal ที่หัวข้อ **เกิดเมื่อไหร่** เลือก:
| Option | ความหมาย |
|---|---|
| วันนี้ | บันทึกทันที (default) |
| ล่วงหน้า | one-time future — เลือกวันที่ |
| ทุกเดือน | สร้าง tx อัตโนมัติทุกเดือน |
| ทุกสัปดาห์ | สร้าง tx อัตโนมัติทุกสัปดาห์ |
| ผ่อน | ใส่จำนวนงวด → หาร amount → สร้างทุกเดือน |

ดูจัดการที่ Settings → "รายการประจำ / ผ่อน"

Scheduler ทำงานทุกครั้งเปิดแอป — สร้าง tx ที่ครบกำหนด, advance `next_due`, ป้องกัน duplicate

### PDF e-Statement import
1. Tab **นำเข้า** → tile "e-Statement"
2. เลือกไฟล์ PDF
3. ระบบ:
   - อ่าน PDF (รองรับรหัสผ่าน)
   - ตรวจหาธนาคารอัตโนมัติ (KBank/KTB/SCB/BBL/BAY/TTB/...)
   - หาเลขบัญชี (mask)
   - แยกรายการ + จำแนก income/expense/transfer
4. แสดงหน้า review → กด "นำเข้าทั้งหมด"

หมายเหตุ: universal parser ทำงานดีกับ format ทั่วไป
สำหรับ production ใช้ parsers.js เดิม (16 ธนาคาร, mature) ของ project แทน — เก็บ signature:
```js
export async function parsePDF(file, password, onProgress) {
  return { bank, accountInfo, transactions, pageCount, errors };
}
```

### Slip QR scan
1. Tab **นำเข้า** → tile "Slip / ใบเสร็จ"
2. เลือกรูป slip (mobile = เปิดกล้อง, desktop = ไฟล์)
3. Parse PromptPay QR → เปิด Add modal pre-fill amount + ref

### Forecast Chart (Dashboard)
"เงินใน 30 วันข้างหน้า" — line chart ที่แสดง:
- ยอดบัญชีปัจจุบัน (start)
- คาดการณ์โดย:
  - ลบ recurring/scheduled ที่จะเกิด
  - ลบรายจ่ายเฉลี่ย 14 วัน (projected)
- Threshold line (เกณฑ์ต่ำสุด) ประ
- Insight: "เงินจะใกล้เกณฑ์ในอีก N วัน" หรือ "คาดว่าจะเหลือ N ฿"

## Architecture

### Money = satang (integer)
ทุก amount เก็บ integer satang เพื่อหลีกเลี่ยง float bug
- `1500.50 ฿` → `150050` (storage)
- `formatBaht(150050)` → `"1,500.50"` (display)

### Lazy-loaded libraries (ไม่ load ตอน start)
| Library | ขนาด | โหลดเมื่อ |
|---|---|---|
| pdf.js | ~500KB | import PDF ครั้งแรก |
| jsQR | ~30KB | scan slip ครั้งแรก |

หลังโหลดแล้ว SW cache → offline ใช้ได้

### State management
- `state.js` = transactions + accounts + settings (single source of truth)
- `recurring.js` = templates (แยก concern)
- `State.subscribe(fn)` → callback ทุกครั้งข้อมูลเปลี่ยน
- View re-render อัตโนมัติ

### Scheduler (Recurring.runScheduler)
- เรียกทุกครั้งเปิดแอป
- หา templates ที่ `active && next_due <= today`
- สร้าง real tx + advance `next_due`
- ป้องกัน duplicate ผ่าน `template_id + date` check

## Production checklist

- [ ] ลบ `seedSampleDataIfEmpty()` ใน `js/app.js`
- [ ] แทน `js/parsers.js` ด้วยของเดิม (16 ธนาคาร) ของ project
- [ ] เพิ่ม Sentry / PostHog
- [ ] ทำ PNG icons (192/512) สำหรับ Play Store
- [ ] เปลี่ยน VERSION ใน `sw.js` ทุก deploy
- [ ] ทดสอบ Voice บน Android Chrome (Thai)
- [ ] ทดสอบ Slip parse กับ slip จริงจากหลายธนาคาร
- [ ] Test PDF parse กับ statement ตัวอย่างจากแต่ละธนาคาร
- [ ] Lock screen / biometric (PhonePay-style)

## Privacy

- ทุกข้อมูลอยู่ใน device — ไม่มี server call
- PDF + Slip ประมวลผลใน browser ไม่ส่งออก
- ไม่มี analytics, ad, tracking
- pdf.js + jsQR โหลดจาก jsDeliver CDN ครั้งเดียว (cache)
- ลบแอป → ข้อมูลหายทันที — แนะนำ backup JSON

## Versioning

| Version | What changed |
|---|---|
| v1.0 | Initial: bottom nav, hero card, basic add modal, list, settings |
| v1.1 | Mali font, slip scanner (jsQR file), forecast section |
| v1.2 | Voice input, recurring/installment, working PDF import, forecast chart |
