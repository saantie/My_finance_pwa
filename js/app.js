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
import * as Recurring from './recurring.js';
import { renderDashboard, renderList, renderImport, renderSettings, showToast, applyTheme, applyTextSize, applyDark } from './views.js';
import { openAddModal, closeAddModal } from './add.js';
import { initFirebase, onAuthStateChanged, subscribeAccountsSharedWithMe } from './firebase.js';


/* === Globals ==================================================== */
let currentView = 'dashboard';
let _backPressedOnce = false;
let _backTimer = null;

const VIEW_RENDERERS = {
  dashboard: renderDashboard,
  list:      renderList,
  import:    renderImport,
  settings:  renderSettings
};


/* === Rendering ================================================== */

function renderView(viewName, params = {}) {
  if (!VIEW_RENDERERS[viewName]) return;
  currentView = viewName;

  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  const container = document.getElementById('view');
  if (container) VIEW_RENDERERS[viewName](container, params);
  window.scrollTo(0, 0);
}

function renderCurrentView() {
  renderView(currentView);
}


/* === View switching (History API) =============================== */

function switchView(viewName) {
  if (!VIEW_RENDERERS[viewName]) return;

  if (viewName !== 'dashboard') {
    history.pushState({ view: viewName }, '', `#${viewName}`);
  } else {
    history.replaceState({ view: 'dashboard' }, '', '#');
  }

  renderView(viewName);
}


/* === Back button handler (Android / History API) ================ */

function setupBackHandler() {
  window.addEventListener('popstate', (e) => {
    const targetView = e.state?.view ?? 'dashboard';

    // Modal เปิดอยู่ → back ปิด modal ทันที (ไม่ต้อง navigate)
    const addModal = document.getElementById('add-modal');
    if (addModal && !addModal.classList.contains('hidden')) {
      closeAddModal();
      return;
    }

    if (targetView === 'modal') {
      // กรณีที่ไม่ได้จับ modal ด้านบน (edge case)
      closeAddModal();
      return;
    }

    if (targetView === 'dashboard') {
      // re-push ทันทีเพื่อป้องกัน browser ออกจากแอป
      history.pushState({ view: 'dashboard' }, '', '#');

      if (_backPressedOnce) {
        clearTimeout(_backTimer);
        _backPressedOnce = false;
        history.go(-history.length);  // exit PWA
        return;
      }

      _backPressedOnce = true;
      showToast('กดย้อนกลับอีกครั้งเพื่อออกจากแอป');
      _backTimer = setTimeout(() => { _backPressedOnce = false; }, 2000);

    } else {
      // กลับไป view ก่อนหน้าในแอป
      _backPressedOnce = false;
      clearTimeout(_backTimer);
      renderView(targetView, e.state?.params ?? {});
    }
  });
}


/* === Setup nav ================================================== */

function setupNav() {
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // FAB → push history + open add modal
  document.getElementById('fab')?.addEventListener('click', () => {
    history.pushState({ view: 'modal', modal: 'add' }, '', '#add');
    openAddModal();
  });

  // ESC key → ปิด modal ผ่าน history.back (popstate จัดการ)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const addModal = document.getElementById('add-modal');
      if (addModal && !addModal.classList.contains('hidden')) {
        history.back();
      }
    }
  });

  setupBackHandler();
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

  // เพิ่ม sample recurring templates (skip ถ้ามีอยู่แล้ว)
  if (Recurring.getTemplates().length === 0) {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 5);
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(15);

    // ค่าเน็ตรายเดือน
    Recurring.addTemplate({
      type: 'expense',
      amount: 59000,                     // 590 ฿
      group: 'utility',
      description: 'ค่าอินเทอร์เน็ต True',
      account_id: 'bank:kbank:3344',
      frequency: 'monthly',
      first_due: nextMonth.toISOString().slice(0, 10)
    });

    // ผ่อน iPhone 12 งวด
    Recurring.addTemplate({
      type: 'expense',
      amount: 250000,                    // 2,500 ฿/งวด
      group: 'shopping',
      description: 'ผ่อน iPhone',
      account_id: 'bank:kbank:3344',
      frequency: 'installment',
      installment_total: 12,
      first_due: nextWeek.toISOString().slice(0, 10)
    });
  }
}


/* === Init ======================================================= */

function init() {
  // 0. Firebase — ต้องเรียกก่อน feature ที่ต้องการ auth/Firestore
  try {
    initFirebase();
    let _sharedWithMeUnsub = null;
    let _lastEmail = null;
    onAuthStateChanged(user => {
      if (_sharedWithMeUnsub) { _sharedWithMeUnsub(); _sharedWithMeUnsub = null; }
      if (user) {
        _lastEmail = user.email;
        // Migration: ล้าง received accounts จาก localStorage format เก่า (ก่อนมี _received flag)
        State.clearReceivedAccounts(user.email);
        // เปิด listeners สำหรับ cloud accounts ของตัวเองทันที
        State.subscribeSharedAccounts();
        // Subscribe บัญชีที่คนอื่นแชร์ให้เรา — เมื่อ Firestore ตอบกลับ merge + re-subscribe
        _sharedWithMeUnsub = subscribeAccountsSharedWithMe(user.email, accounts => {
          State.mergeSharedAccounts(accounts);
          State.subscribeSharedAccounts();
        });
      } else {
        // Sign out — ปิด listeners แล้วล้างบัญชีที่รับแชร์ออกจาก UI ทันที
        State.unsubscribeAll();
        State.clearReceivedAccounts(_lastEmail);
        _lastEmail = null;
      }
    });
  } catch (e) { console.warn('[firebase] init failed', e); }

  // 1. Apply saved appearance settings (ก่อน render ใดๆ)
  const settings = State.getSettings();
  applyTheme(settings.theme || 'diary');
  applyTextSize(settings.text_size || 'normal');
  applyDark(settings.dark || false);

  // 2. Seed (ถ้าจำเป็น) — เห็น demo data ทันทีเมื่อเปิดครั้งแรก
  seedSampleDataIfEmpty();

  // 3. Run scheduler — สร้าง transaction จาก template ที่ครบกำหนดแล้ว
  const sched = Recurring.runScheduler();
  if (sched.executed > 0) {
    setTimeout(() => showToast(`สร้างรายการประจำ ${sched.executed} รายการ`), 800);
  }

  // 4. Setup navigation handlers
  setupNav();

  // 5. Subscribe state changes → re-render เมื่อข้อมูลเปลี่ยน
  State.subscribe(() => renderCurrentView());
  Recurring.subscribe(() => renderCurrentView());

  // 6. Initial render — ตั้ง history state เริ่มต้นก่อน
  history.replaceState({ view: 'dashboard' }, '', '#');
  switchView('dashboard');

  // 7. PWA service worker
  registerSW();

  console.log('[diary] app ready', {
    transactions: State.getTransactions().length,
    accounts: State.getAccounts().length,
    templates: Recurring.getTemplates().length
  });
}

// Boot เมื่อ DOM พร้อม
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
