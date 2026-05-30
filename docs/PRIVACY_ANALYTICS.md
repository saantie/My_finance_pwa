# Privacy-Preserving Analytics

เอกสารนี้แสดงรายการ **ทุก event และทุก field** ที่แอปส่งออกผ่าน PostHog
เพื่อให้คุณ verify ได้ว่าแอปไม่ส่งข้อมูลการเงิน ข้อมูลส่วนตัว หรือเนื้อหารายการใดๆ

---

## หลักการ

| ✗ ไม่ส่ง | ✓ ส่ง |
|---|---|
| ยอดเงิน (amounts) | ประเภท event และจำนวนนับ |
| รายละเอียดรายการ (descriptions) | ช่วงเวลาการใช้งาน |
| หมวดหมู่และเนื้อหา | ชื่อ feature ที่กดใช้ |
| ชื่อ email เลขบัญชี (PII) | สถานะ onboarding |
| ไฟล์ PDF หรือข้อความจาก PDF | จำนวน transactions (ไม่ใช่เนื้อหา) |

**Opt-out:** ปิดได้ใน Settings → Privacy → "ส่งข้อมูลใช้งานแบบไม่ระบุตัวตน"
ค่า default คือ **เปิด (opt-in)**

---

## Event List

### H1 — Onboarding

#### `app_first_open`
ส่งครั้งเดียวในชีวิตของ install ครั้งแรก (ตรวจจาก `localStorage` key `diary_analytics_first_open_v1`)

| Field | ไม่มี payload |
|---|---|

---

#### `onboarding_completed`
ผู้ใช้ผ่านหน้า onboarding จนครบ

| Field | Type | Description |
|---|---|---|
| `skipped` | boolean | `true` = กดข้าม, `false` = ดูครบ |

---

#### `first_pdf_imported`
การนำเข้า PDF ครั้งแรก (ครั้งแรกเท่านั้น)

| Field | Type | Description |
|---|---|---|
| `bank` | string (max 100 chars) | ชื่อธนาคาร เช่น `"ktb"`, `"kbank"` |
| `tx_count` | number | จำนวนรายการที่นำเข้า (integer) |

> **Note:** `bank` คือ code ธนาคาร ไม่ใช่ชื่อบัญชีหรือเลขบัญชี

---

### H2 — Habit Formation

#### `transaction_added`
ทุกครั้งที่มีรายการใหม่ถูกบันทึก

| Field | Type | Allowed Values |
|---|---|---|
| `source` | enum | `"manual"`, `"voice"`, `"pdf"`, `"scheduled"` |

> **Note:** ไม่มีข้อมูลยอดเงิน หมวดหมู่ หรือรายละเอียด

---

#### `session_length_sec`
ความยาวของ session (วินาที) — ส่งเมื่อ tab ถูกซ่อน / ปิด

| Field | Type | Description |
|---|---|---|
| `value` | number | ความยาว session เป็นวินาที (integer) |

> Sessions สั้นกว่า 2 วินาทีถูก filter ออก (accidental reload)

---

#### `feature_used`
ทุกครั้งที่ผู้ใช้เปลี่ยน view หลัก

| Field | Type | Description |
|---|---|---|
| `feature` | string (max 100 chars) | ชื่อ view เช่น `"home"`, `"list"`, `"import"`, `"settings"` |

---

### H3 — Retention

#### `lapse_detected`
ตรวจพบว่าผู้ใช้ไม่ได้บันทึกมาหลายวัน

| Field | Type | Description |
|---|---|---|
| `days_since_last_tx` | number | จำนวนวันที่ไม่มีรายการ |

---

#### `catchup_offered`
แอปแสดง UI ชวนผู้ใช้ catch up รายการที่หาย

| Field | ไม่มี payload |
|---|---|

---

#### `catchup_accepted`
ผู้ใช้ตอบสนองต่อ catch-up prompt

| Field | Type | Allowed Values |
|---|---|---|
| `method` | enum | `"pdf"`, `"manual"`, `"dismissed"` |

---

### H4 — Long-term

#### `annual_review_opened`
ผู้ใช้เปิดหน้าสรุปรายปี

| Field | Type | Description |
|---|---|---|
| `year` | number | ปี ค.ศ. (CE) เช่น `2026` |

---

#### `export_used`
ผู้ใช้ export ข้อมูล

| Field | Type | Allowed Values |
|---|---|---|
| `format` | enum | `"json"`, `"csv"` |

> **Note:** event นี้ส่งเฉพาะ *ว่า* export ครั้ง ไม่ได้ส่งเนื้อหาข้อมูล

---

### Abandonment Signals

#### `session_with_no_action`
Session ที่ผู้ใช้เปิดแอปแต่ไม่ได้ทำอะไรเลย

| Field | ไม่มี payload |
|---|---|

---

#### `rage_tap_detected`
กด 3+ ครั้งภายใน 1.5 วินาทีบน element เดียวกัน (สัญญาณ UX ติดขัด)

| Field | Type | Description |
|---|---|---|
| `feature` | string (max 100 chars) | ชื่อ UI element เช่น `"save_button"`, `"account_picker"` |

---

## Payload Sanitization Rules

ทุก field ผ่าน `sanitize()` ก่อนส่ง:

| Type | Rule |
|---|---|
| `boolean` | `Boolean(value)` — coerce เสมอ |
| `number` | ต้องเป็น `typeof 'number'` และ `isFinite()` เท่านั้น — string/NaN/Infinity ถูก drop |
| `string` | ต้องเป็น string — ตัดที่ 100 chars เพื่อป้องกัน description ยาวรั่ว |
| `enum (string[])` | ต้องอยู่ใน allowed list เท่านั้น — value อื่นถูก drop |

**Unknown fields** ใน payload (ที่ไม่ได้ประกาศใน schema) **ไม่ถูกส่ง** เด็ดขาด — code วน loop บน schema keys เท่านั้น

---

## Source Code

- Event tracking: [`js/analytics.js`](../js/analytics.js)
- Opt-out setting: [`js/state.js`](../js/state.js) → `settings.analytics_opt_out`
- Settings UI: [`js/views.js`](../js/views.js) → Privacy section ใน `renderSettings()`
- Tests: [`tests/run.mjs`](../tests/run.mjs) → section `analytics.js`

---

## ตรวจสอบด้วยตนเอง

1. เปิด DevTools → Network tab → filter `posthog.i.posthog.com`
2. ดู Request payload ของแต่ละ event
3. Verify ว่าไม่มี field นอกจากที่ระบุในเอกสารนี้

หรือ inspect `js/analytics.js`:
- `ALLOWED_EVENTS` object คือ whitelist และ schema ทั้งหมด
- ไม่มี code path อื่นที่เรียก `posthog.capture()` นอกจาก `_send()`

---

*Last updated: 2026-05-30*
