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

## Layout Robustness Rules (Bug #31 — มิ.ย. 2026)
```css
/* flex row ที่มีปุ่ม/ control ด้านขวา — ใช้ครบ 3 ข้อเสมอ: */
.row  { display: flex; gap: 12px; }            /* 1. gap กันชนกัน */
.text { flex: 1; min-width: 0; }               /* 2. ข้อความเป็นฝ่ายหด/ตัดบรรทัด */
.btn  { flex-shrink: 0; white-space: nowrap; } /* 3. ปุ่มห้ามถูกบีบ/ห้ามล้น */

/* ทดสอบ UI ใหม่ทุกครั้งที่: text_size = xlarge + viewport 360px
   ข้อความไทยยาวกว่าอังกฤษ — ห้ามทดสอบด้วย string สั้น */
```

## Reactive Re-render (Bug #30 — มิ.ย. 2026)
```js
// ทุก state change (setSetting/addTransaction/template) → re-render ทั้งหน้า (innerHTML)
// กฎ:
// 1. ห้ามใส่ side effect ใน render functions (scroll/focus/timer) — ยิงซ้ำทุก state change
//    renderCurrentView() ใน app.js จำ window.scrollY แล้ว restore — อย่าลบออก
// 2. UI state ที่ต้องรอด re-render → module-level var (ไม่ใช่ DOM class/attribute)
//    ตัวอย่างที่ใช้แล้ว: _settingsOpenSection, _recurSuggestions ใน views.js
```

## Settings Accordion (มิ.ย. 2026)
```js
// settingsAccordion(id, title, meta, bodyHtml) ใน views.js — เปิดทีละส่วน
// state: _settingsOpenSection (module-level, รอด re-render)
// deep-link: setSettingsOpenSection(id) ก่อน switchView('settings') แล้วค่อย scroll
//   ใช้แล้ว: auth badge → 'accounts', dashboard "จัดการ" → 'recurring'
// profile/Level card อยู่นอก accordion — แสดงตลอด
// sub-settings ใต้ toggle แม่ → .setting-subgroup (เยื้อง + เส้นซ้าย, ซ่อนเมื่อ toggle ปิด)
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

## Surface tokens + theme/dark-safe variants (มิ.ย. 2026)
```css
/* บทบาท token พื้นผิว (รู้ก่อนตั้งสีพื้น): */
--paper       /* = พื้นหลังหน้าเพจ (html,body) — อย่าใช้เป็น bg ของ card/surface ใหม่
                 ไม่งั้น "กลืน" พื้นเพจ มองไม่เห็นการ์ด */
--card        /* surface สีขาว (#fff) ของการ์ดทั่วไป */
--paper-deep  /* ไม่ override ทุกธีม — เลี่ยงใน element ข้ามธีม/dark (จะ fallback เพี้ยน) */

/* ⚠️ dark mode สลับด้าน: --card (#162340) "สว่างกว่า" --paper (#0d1829)
   → อย่า hardcode สีอ่อน/เข้ม. ให้ derive จาก token ของธีมเองด้วย color-mix */

/* ต้องการ variant ของพื้นผิว (เช่น เมนูย่อยให้ต่างจาก header) ที่ปลอดภัยทุกธีม+dark: */
.sub-surface {
  background: var(--card);                                   /* fallback เบราว์เซอร์เก่า */
  background: color-mix(in srgb, var(--paper) 75%, var(--card) 25%);
}
/* color-mix derive จากสีจริงของแต่ละธีม → ถูกทิศทั้ง light/dark โดยไม่ต้องเขียน
   html[data-dark] override; ใส่ fallback บรรทัดแรกเสมอ (Chrome <111 ไม่รองรับ) */
```

## Mali font — สระล่างโดนตัด (มิ.ย. 2026)
```css
/* Mali (--font-accent, decorative) มีสระล่าง ◌ู ◌ุ ที่ยื่นต่ำกว่า baseline
   ถ้า element มี overflow:hidden (เช่นทำ ellipsis) + line-height แน่น → สระล่างขาด */
.mali-title {
  font-family: var(--font-accent);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  line-height: 1.6;        /* ให้สระล่างมีที่ก่อนถูก clip */
  padding-bottom: 2px;
}
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
