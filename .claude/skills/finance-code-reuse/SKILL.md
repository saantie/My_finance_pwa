---
name: finance-code-reuse
description: >
  Use BEFORE writing new code in this Thai finance PWA — pick the concise, reuse-first
  path instead of rewriting helpers that already exist. Triggers: เพิ่มฟีเจอร์, เขียน
  ฟังก์ชัน/helper ใหม่, format เงิน/วันที่/พ.ศ., คำนวณยอดบัญชี, render การ์ด/ไอคอน/แถว/
  empty state, เปิด modal/picker, toast, "เขียนซ้ำ", DRY, ทำให้กระชับ. Complements the
  built-in /simplify and /code-review (those run AFTER writing; this guides BEFORE).
  Grounded in actual exports (June 2026).
---

# Finance PWA — Code Reuse Map (เขียนกระชับ + ใช้ของเดิม)

เป้าหมาย: ก่อนเขียน helper ใหม่ ให้รู้ว่า "มีของแบบนี้อยู่แล้วไหม" — เรปนี้มี utility
ครบพอสมควร การเขียนซ้ำคือ bug รอเกิด (เช่น คูณ 100 เองพลาด, `new Date(iso)` โดน UTC shift)

> built-in `/simplify` + `/code-review` = pass หลังเขียน (generic).
> skill นี้ = แผนที่ของที่มีอยู่ ใช้ตอนกำลังจะเขียน (เฉพาะเรปนี้)

## Reuse-first checklist (30 วินาทีก่อนเขียน helper ใหม่)

```
□ จะ format/คำนวณ เงิน วันที่ ยอด ไหม → เปิด js/utils.js + js/state.js ก่อน
□ จะ render UI ซ้ำ (การ์ด/แถว/ไอคอน/empty/toast) ไหม → เช็ค helper ใน views.js
□ grep ชื่อที่เดาว่าน่าจะมี: format, balance, parse, render, escape
□ ถ้ายังไม่มีจริง → เขียนใหม่ แล้ววางใน utils.js/state.js (ไม่ใช่ inline ในไฟล์เดียว)
```

## Reuse Map — "กำลังจะทำ X → ใช้ Y ที่มีแล้ว"

### เงิน (เก็บเป็น satang integer เสมอ) — `js/utils.js`
| จะทำ | ใช้ | อย่า |
|---|---|---|
| บาท → satang | `bahtToSatang(baht)` | `baht * 100` (ลืม Math.round → ทศนิยมลอย) |
| satang → บาท (แสดงผล) | `satangToBaht(s)` | `s / 100` กระจายทั่วโค้ด |
| แสดงจำนวนเงิน | `formatBaht(satang, {sign,decimals})` | `toLocaleString` เองทุกที่ |
| คำนวณจาก input string | `calc(expr)` | eval / parser มือ |

### วันที่ / พ.ศ. — `js/utils.js` (กัน timezone bug)
| จะทำ | ใช้ | อย่า |
|---|---|---|
| วันนี้ ISO | `todayISO()` | `new Date().toISOString()` (UTC, เพี้ยนข้ามวัน) |
| ISO → Date object | `parseLocalDate(iso)` | `new Date('2026-06-13')` (UTC midnight shift) |
| บวก/ลบวัน | `offsetDateISO(iso, n)` | คำนวณ ms เอง |
| ค.ศ. → พ.ศ. | `ceToBe(year)` | `year + 543` กระจาย |
| แสดงวันที่ไทย | `formatShortDate` `formatLongDate` `dayNameTH` `monthNameTH` | format มือ |
| เทียบวันเดียวกัน | `isSameDay(a,b)` | เทียบ Date object |

### ยอดบัญชี / รายการ — `js/state.js` (กฎสำคัญ ดู CLAUDE.md §4)
| จะทำ | ใช้ | อย่า |
|---|---|---|
| ยอดบัญชีปกติ | `computeAccountBalance(id)` | อ่าน `account.current_balance` ตรงๆ |
| ยอดเงินสด | `getEffectiveCashBalance(id)` | computeAccountBalance กับ cash |
| รายการ active | `getTransactions()` (กรอง deleted_by แล้ว) | อ่าน `_state` ตรง |
| ต้องเห็น soft-deleted (เช่น recipient hard-delete) | `getState().transactions` | `getTransactions().find()` → undefined |
| สรุปเดือน / top หมวด | `getMonthSummary` `getTopCategories` `getMonthComparison` | groupBy เอง |
| id ใหม่ | `uuid()` | `Date.now()` / random string |

### หมวดหมู่ / ไอคอน — `js/icons.js`
| จะทำ | ใช้ |
|---|---|
| ไอคอน SVG | `svgIcon(name, {size, stroke})` — 38 Lucide |
| ข้อมูลหมวด (label/icon/color) | `getCategory(key)` |
| หมวดตาม type | `categoriesByType(type)` |
| map หมวดทั้งหมด | `CATEGORIES` |

### UI ซ้ำๆ — `js/views.js` / `js/add.js`
| จะทำ | ใช้ |
|---|---|
| empty state + ปุ่ม CTA | `renderEmptyState({icon,title,subtitle,actions})` |
| แถวรายการ tx | `renderEntryRow(tx, decimals)` |
| แถว template ประจำ | `renderTemplateRow(t)` |
| toast | `showToast(msg, duration)` |
| escape user input ใน innerHTML | `escapeHtml(s)` — **ทุก user data เสมอ** (XSS) |
| เลือกบัญชี (bottom-sheet) | `openAccountPickerModal(curId, onSelect)` จาก add.js |
| haptic / debounce | `haptic(pattern)` `debounce(fn, ms)` จาก utils.js |

## Project Patterns ที่ reuse ได้ (กระชับกว่าเขียนใหม่)

```js
// 1. UI state ที่ต้องรอด re-render → module-level var (ไม่ใช่ DOM class/attribute)
//    ทุก State.setSetting → re-render ทั้งหน้า; ค่าใน DOM หาย, ค่าใน var อยู่
let _settingsOpenSection = ...   // accordion เปิดส่วนไหน (views.js)
let _donutPeriod = 'month'       // ช่วงเวลา donut (views.js)

// 2. อัปเดตเฉพาะ section ไม่วาดทั้งหน้า — เร็วกว่า + ไม่กระพริบ
//    pattern: renderDonutSection() → mount.innerHTML = ... → re-bind เฉพาะส่วนนั้น

// 3. accordion เมนูพับ: settingsAccordion(id, title, meta, bodyHtml)
//    deep-link เปิดส่วน: setSettingsOpenSection(id) ก่อน switchView('settings')
```

## DRY = ความรู้ ไม่ใช่ตัวอักษร

รวมโค้ดเมื่อมัน**สื่อแนวคิดธุรกิจเดียวกัน**และ "จะเปลี่ยนพร้อมกันเมื่อ requirement เปลี่ยน"
แยกไว้ถ้าหน้าตาเหมือนแต่จะ**วิวัฒน์คนละทาง** (โค้ดบังเอิญคล้าย ≠ ควรรวม)

```
✅ ควรรวม: format เงิน 5 ที่เขียนเหมือนกัน → formatBaht ตัวเดียว (เปลี่ยนที่เดียว)
❌ อย่ารวม: ฟังก์ชัน validate 2 ตัวบังเอิญ 3 บรรทัดเหมือนกัน แต่คนละ domain
   → รวมแล้วผูกกันมั่ว เปลี่ยนฝั่งหนึ่งพังอีกฝั่ง
```

**DRY violation จริงในเรปนี้:** `escapeHtml` ถูกนิยามซ้ำใน
[add.js:953](js/add.js#L953) + [views.js:3691](js/views.js#L3691) — แนวคิดเดียวกันเป๊ะ
ควรมีที่เดียว (add.js import จาก views.js ได้ — มันก็ import `showToast` จากที่นั่นอยู่แล้ว)

## ข้อยกเว้น: duplication ที่จงใจ (อย่าพยายาม "รวม")

`sw.js` (service worker) **import ES module ไม่ได้** → ต้อง mirror logic ฝั่งแอป:
- `dueLabel` (notify.js) ↔ `swDueLabel` (sw.js)
- `formatBaht` (utils.js) ↔ `swBaht` (sw.js)
- `todayISO`/`offsetDateISO` ↔ `swTodayISO`/`swDaysUntil`

นี่คือ duplication ที่ถูกต้องตามข้อจำกัด platform — ถ้าแก้ logic ฝั่งหนึ่ง **ต้องแก้คู่มันด้วย**
(ดู CLAUDE.md §7 service worker)

## เมื่อไหร่เขียนใหม่ดีกว่า reuse

- **เลี่ยง over-abstraction**: อย่าสร้าง helper ที่มีผู้ใช้คนเดียว / parameter บวมเพื่อรองรับ
  เคสที่ยังไม่มีจริง (speculative) — เขียนตรงๆ อ่านง่ายกว่า
- ถ้า helper เดิมต้องเพิ่ม flag/param เยอะเพื่อรองรับเคสใหม่จนเสียความชัด → แยกฟังก์ชันใหม่ดีกว่า
- หลังเขียนเสร็จ ให้รัน built-in **`/simplify`** (reuse/กระชับ) และ **`/code-review`** (บั๊ก)
  เป็น pass ปิดท้าย — สองตัวนี้ครอบ generic ไว้แล้ว skill นี้ไม่ทำซ้ำ

## หลังเพิ่ม helper ใหม่
```
□ วางใน utils.js (pure) / state.js (แตะ state) / icons.js (ไอคอน) — ไม่ inline ลอย
□ ถ้า browser โหลดไฟล์ที่แก้ → bump VERSION ใน sw.js (CI มี guard)
□ helper ที่ test ได้ (pure) → เพิ่ม test ใน tests/run.mjs
□ ถ้าเป็น JS module ใหม่ → เพิ่มเข้า SHELL_FILES ใน sw.js
```
