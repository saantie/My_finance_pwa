/* ===================================================================
   app.js — Entry point, routing, navigation
   ===================================================================
   ทำหน้าที่:
   - Bootstrap แอป (load state, render initial view)
   - จัดการ navigation (bottom nav, FAB)
   - Subscribe state changes → re-render view ปัจจุบัน
   - Register service worker สำหรับ offline support

   View names: 'dashboard', 'list', 'import', 'settings'
   =================================================================== */

import * as State from './state.js';
import { renderDashboard, renderList, renderImport, renderSettings } from './views.js';
import { openAddModal, closeAddModal } from './add.js';


/* === Globals ==================================================== */
let currentView = 'dashboard';

const VIEW_RENDERERS = {
  dashboard: renderDashboard,
  list:      renderList,
  import:    renderImport,
  settings:  renderSettings
};


/* === View switching ============================================= */

function switchView(viewName) {
  if (!VIEW_RENDERERS[viewName]) return;
  currentView = viewName;

  // Update nav active state
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Render
  renderCurrentView();
  // Scroll กลับขึ้น top เมื่อเปลี่ยน view
  window.scrollTo(0, 0);
}

function renderCurrentView() {
  const container = document.getElementById('view');
  if (!container) return;
  const renderer = VIEW_RENDERERS[currentView];
  if (renderer) renderer(container);
}


/* === Setup nav ================================================== */

function setupNav() {
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // FAB → open add modal
  document.getElementById('fab')?.addEventListener('click', openAddModal);

  // Back button (Android) → ปิด modal ถ้าเปิดอยู่
  window.addEventListener('popstate', () => {
    if (!document.getElementById('add-modal').classList.contains('hidden')) {
      closeAddModal();
    }
  });

  // ESC key → ปิด modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('add-modal').classList.contains('hidden')) {
      closeAddModal();
    }
  });
}


/* === Service Worker (offline support) =========================== */

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // ใช้ window.load เพื่อไม่ block first paint
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('SW registration failed', err);
    });
  });
}


/* === Seed sample data (first run only) ========================== */

function seedSampleDataIfEmpty() {
  // Skip ถ้ามีข้อมูลแล้ว
  if (State.getTransactions().length > 0) return;

  // เพิ่ม sample account (KBank) — ให้ user เห็นภาพว่ามี multi-bank
  State.addAccount({
    id: 'bank:kbank:3344',
    bank: 'kbank',
    account_number_masked: 'xxx-x-x3344-x',
    display_name: 'กสิกร ...3344',
    type: 'bank',
    current_balance: 1545000  // 15,450 ฿
  });

  // เพิ่ม sample transactions ของวันนี้
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const samples = [
    { type: 'expense', amount: 16500, group: 'food',          description: 'ก๋วยเตี๋ยว + กาแฟ', date: today },
    { type: 'expense', amount: 8500,  group: 'transport',     description: 'BTS ไป-กลับ', date: today },
    { type: 'expense', amount: 12000, group: 'shopping',      description: 'ของขวัญ', date: yesterday },
    { type: 'income',  amount: 2500000, group: 'salary',      description: 'เงินเดือน พ.ค.', date: yesterday },
    { type: 'expense', amount: 45000, group: 'utility',       description: 'ค่าไฟ MEA', date: yesterday }
  ];

  for (const s of samples) {
    State.addTransaction({ ...s, source: 'manual' });
  }
}


/* === Init ======================================================= */

function init() {
  // 1. Seed (ถ้าจำเป็น) — เห็น demo data ทันทีเมื่อเปิดครั้งแรก
  seedSampleDataIfEmpty();

  // 2. Setup navigation handlers
  setupNav();

  // 3. Subscribe state → re-render เมื่อข้อมูลเปลี่ยน
  State.subscribe(() => renderCurrentView());

  // 4. Initial render
  switchView('dashboard');

  // 5. PWA service worker
  registerSW();

  // 6. Log สำหรับ debug
  console.log('[diary] app ready', {
    transactions: State.getTransactions().length,
    accounts: State.getAccounts().length
  });
}

// Boot เมื่อ DOM พร้อม
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
