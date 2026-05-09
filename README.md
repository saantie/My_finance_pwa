# Finance App — Diary Mode

แอปบันทึกการเงินส่วนตัวภาษาไทย, PWA, local-first

## โครงสร้างไฟล์

```
finance-app-diary/
├── index.html              ← App shell + bottom nav + FAB
├── manifest.webmanifest    ← PWA manifest
├── sw.js                   ← Service worker (offline)
├── css/
│   └── styles.css          ← Diary mode design system
├── js/
│   ├── app.js              ← Entry point, routing
│   ├── state.js            ← Single source of truth + localStorage
│   ├── utils.js            ← Money/date/calc helpers
│   ├── icons.js            ← SVG icons + category mapping
│   ├── views.js            ← Render dashboard/list/import/settings
│   └── add.js              ← Add modal + keypad
└── icons/
    └── icon.svg            ← PWA icon
```

## วิธี run

ต้องเสิร์ฟผ่าน HTTP เพราะใช้ ES modules + Service Worker:

```bash
# Python
python3 -m http.server 8000

# Node
npx serve .

# หรือ
npx http-server -p 8000
```

แล้วเปิด `http://localhost:8000`

## Architecture

### Data flow
```
User action
   ↓
event handler (in views.js or add.js)
   ↓
State.addTransaction() / State.updateAccount() / ...
   ↓
notify() → save to localStorage
   ↓
subscribed listeners → re-render
   ↓
DOM updated
```

### State shape
ดูที่ `js/state.js` — `DEFAULT_STATE` constant

ทุก amount เก็บเป็น **satang (integer)** เพื่อหลีกเลี่ยง float bug
แสดงผล baht ผ่าน `formatBaht()` ใน utils.js

### Add modal flow
1. กด FAB → `openAddModal()` ใน add.js
2. User กด keypad → `handleKey()` อัปเดต `draft.expression`
3. `calc()` ประเมิน expression → `draft.amount` (satang)
4. กด "บันทึก" → `State.addTransaction(draft)`
5. State.notify() → views re-render

## Integration กับ codebase เดิม

แอปนี้คือ UI shell ใหม่ — โค้ด parsers/voice เดิมเสียบเข้าไปได้ดังนี้:

### 1. PDF parser
ใน `js/views.js`, function `renderImport()`:

```js
container.querySelector('#pdf-file-input')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // เสียบของเดิม
  const { parsePDF } = await import('./parsers.js');
  const { transactions, accounts } = await parsePDF(file);

  // เพิ่ม account ที่ detect ได้
  for (const acct of accounts) {
    State.addAccount(acct);
  }

  // เพิ่ม transactions
  State.addTransactionsBatch(transactions);
  showToast(`นำเข้า ${transactions.length} รายการ`);
});
```

### 2. Voice input
เพิ่มปุ่ม voice ใน add modal (`js/add.js`) แล้วเรียก:

```js
const { listen } = await import('./voice.js');
const intent = await listen();   // { type, amount, group, description }
draft.type = intent.type;
draft.amount = intent.amount;
draft.group = intent.group;
draft.note = intent.description;
render();
```

### 3. Slip scanner (PromptPay QR)
ใน `js/views.js`:

```js
container.querySelector('[data-action="scan-slip"]')?.addEventListener('click', async () => {
  const { scanSlip } = await import('./slip.js');
  const slip = await scanSlip();
  // slip = { amount, date, sender, receiver }
  // เปิด add modal พร้อม pre-fill หรือบันทึกตรงๆ
});
```

## Pre-launch checklist

- [ ] ลบ `seedSampleDataIfEmpty()` ใน `js/app.js` (production ไม่ควรมี demo data)
- [ ] เสียบ parsers.js ของจริง
- [ ] เสียบ slip scanner (jsQR)
- [ ] เสียบ voice (voice.js เดิม)
- [ ] เพิ่ม Sentry ใน `js/app.js`
- [ ] ทำ icon-192.png + icon-512.png (PNG เผื่อ Play Store)
- [ ] เปลี่ยน VERSION ใน sw.js ทุก deploy
- [ ] Test บน Android Chrome + iOS Safari (PWA install)

## Design tokens

ดู `:root` ใน `css/styles.css` — ทุกสีอยู่ตรงนั้น
- `--terracotta` = primary action (FAB, save button)
- `--clay` = expense
- `--sage` = income
- `--dust-blue` = transfer / scan

## Testing

ยังไม่ได้ทำ unit tests สำหรับ UI — แต่ logic core (state, utils) test ได้ด้วย:

```bash
node --check js/state.js
node --check js/utils.js
```

โค้ดเดิมมี 183 tests — ย้าย parsers/voice มาแล้ว tests เดิมยังใช้ได้
