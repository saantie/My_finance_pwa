---
name: finance-pwa-ui
description: >
  Use this skill whenever working on UI, UX, mockups, components, or styling.
  Triggers: designing screens, Playwright mockups, CSS themes, bottom nav, FAB, modals,
  cards, category icons, shared badge, review modal, dark mode, or any visual change.
  Grounded in CLAUDE.md + actual code (June 2026).
---

# Finance PWA — UI & Design System (June 2026)

## Theme System
```js
// 7 themes (data-theme on <html>): diary(default)/ocean/forest/rose/citrus/violet/carbon
// applyTheme(theme) ใน views.js
// applyDark(dark) → data-dark="1" on <html>
// applyTextSize(size) → :root font-size 16/18/20px (rem cascade)
```

## Diary Mode Design Tokens (styles.css จริง)
```css
--clay: #ff8a5c    /* food */
--mocha: #c89368   /* coffee, rent, cash */
--dust-blue: #5e9bd6  /* transport, transfer */
--plum: #b378c0    /* shopping, entertainment, SCB */
--honey: #e8b649   /* utility, BAY */
--sage: #5a9d63    /* income, health */
--terracotta: #c0694c  /* today bar, delete */

/* Account gradients (CSS + JS bankGradient() ต้องตรงกันเสมอ) */
ktb: #5fb0e0→#3787c5  kbank: #6cc16c→#45984a  scb: #b378c0→#8a59a0
bbl: #4f7eb8→#2a5a94  bay: #e8b649→#c79939   cash: #c89368→#a07246

/* Radius: 14px(cards) 10px(small) 9999px(pill) */
/* Font: Sarabun (primary), Mali (decorative) */
```

## Category Icons (icons.js จริง)
```js
// key = tx.group, color = CSS variable (ไม่ใช่ hex)
food: utensils/var(--clay)   coffee: coffee/var(--mocha)
transport: bus/var(--dust-blue)   shopping: bag/var(--plum)
utility: zap/var(--honey)   health: heart/var(--sage)
entertainment: gamepad/var(--plum)   rent: zap/var(--mocha)
salary/bonus/refund: cash/var(--sage)   transfer: transfer/var(--dust-blue)
other: circle/var(--mocha)

// svgIcon(name, { size, stroke=1.8 }) → stroke="currentColor"
// currentColor = white จาก CSS parent
// solid bg + currentColor (ไม่ใช่ stroke="white" ใน app จริง)
```

## Layout
```
Bottom nav: [🏠 dashboard] [📋 list] [➕ FAB] [📥 import] [⚙️ settings]
FAB → full-screen add modal
Navigation: History API (switchView → history.pushState)
Back button: popstate → ปิด modal ก่อน → navigate
```

## Add Modal
```
Title: "บันทึกรายการ" | "แก้ไขรายการ" | "โอนระหว่างบัญชี"
Account picker: bottom-sheet overlay (ไม่ใช่ prompt())
Frequency grid: 6 ตัวเลือก (วันนี้/ย้อนหลัง/ล่วงหน้า/ทุกเดือน/ทุกสัปดาห์/ผ่อน)
In-app keypad: ป้องกัน keyboard layout shift
Category strip: horizontal scroll, pill chips
```

## Shared Badge (feature ใหม่ Phase 2)
```css
/* รายการในบัญชีแชร์มีไอคอน users 11px หน้า category label */
.shared-badge { /* icon users เล็กๆ */ }
.entry-cat { display: flex; align-items: center; gap: 4px; }
/* ถ้าไม่แสดง ตรวจ CSS display + _received flag บน account */
```

## Review Modal — Account Confirmation (June 2026)
```js
// views.js showReviewModal: card "นำเข้าไปยังบัญชี" แสดงทุก import
// - ตรวจพบบัญชีจากไฟล์ → ปุ่ม preset ชื่อบัญชี "ตรวจพบจากไฟล์ — แตะปุ่มเพื่อเปลี่ยน"
// - ไม่พบ → ปุ่ม "เลือกบัญชี" (ไม่บังคับ — ปล่อยว่าง = import ไม่ผูกบัญชี)
// - กดปุ่ม → openAccountPickerModal() จาก add.js (bottom-sheet ตัวเดียวกับ add modal)
// ⚠️ tech debt: card นี้ใช้ inline styles — ย้ายเข้า styles.css เมื่อแตะ CSS ครั้งถัดไป
```

## Playwright Mockup
```python
viewport={"width": 410, "height": 1200}, device_scale_factor=2.5
await page.wait_for_timeout(1500)  # รอ font
# Phone frame ≥ 1180px (ป้องกัน bottom nav overlap)
```

### Quirks (ต้องทำทุกข้อ)
```html
<!-- SVG ใน Playwright: inline attributes ทุกตัว -->
fill="none" stroke="white" stroke-width="2"
stroke-linecap="round" stroke-linejoin="round"
<!-- หมายเหตุ: app จริง stroke="currentColor" + CSS color:white -->
<!-- Playwright mockup ใส่ stroke="white" โดยตรง -->

<!-- bg colors: solid #RRGGBB ไม่ใช่ rgba -->
<!-- ไม่มี external assets — inline ทุกอย่าง -->
```

## Dark Mode
```css
/* element ใหม่ที่มีสีเข้ม ต้องเพิ่ม: */
html[data-dark="1"] .new-element { color: ...; background: ...; }
/* bugs แก้แล้ว: .chip, .seg-item, .signin-btn */
```

## XSS Prevention
```js
// ทุก user input ใน innerHTML → escapeHtml(str) ก่อนเสมอ
```

## Microinteractions
```
กดปุ่ม: scale 0.97 + haptic   Save: checkmark + green flash
Delete: slide-out + undo toast   Swipe-left: reveal edit button
Account picker: bottom-sheet slide up
Loading: skeleton shapes (ไม่ใช่ spinner)
```

## ⏳ Pending (ยังไม่ implement)
```
Gamification coins + level UI (F1.13)
Microinteractions polish (haptic, scale animations — CSS framework done, JS hooks pending)
Swipe actions on list rows
Empty states with 2-path CTA
Onboarding 3-screen
Privacy Story Page
```
