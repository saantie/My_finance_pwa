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
import { renderDashboard, renderList, renderImport, renderSettings, renderDashboardSkeleton, showToast, applyTheme, applyTextSize, applyDark, setSettingsOpenSection } from './views.js';
import { openAddModal, openAddModalWithVoice, closeAddModal } from './add.js';
import { initFirebase, onAuthStateChanged, fetchAccountsSharedWithMe, fetchAccountsOwnedByMe, subscribeAccountsSharedWithMe, getAccessToken } from './firebase.js';
import { shouldShowOnboarding, showOnboarding } from './onboarding.js';
import { checkReminders } from './reminders.js';
import { syncNotifyData, registerPeriodicSync } from './notify.js';
import { checkCatchupOpportunity } from './catchup.js';
import { shouldShowCoachMark, showCoachMark } from './coach-mark.js';
import { setCustomCategoryRegistry } from './icons.js';
import { setCustomCategoryParserRegistry } from './parsers.js';
import { initAnalytics, trackFirstOpenIfNeeded, markSessionAction, track } from './analytics.js';


/* === Globals ==================================================== */
let currentView = 'dashboard';
let _backPressedOnce = false;
let _backTimer = null;


/* === Auth badge — สถานะลงชื่อ มุมขวาบน ========================= */

function updateAuthBadge(user) {
  const badge = document.getElementById('auth-badge');
  if (!badge) return;

  if (user) {
    // ใช้ชื่อจาก displayName หรือ email เป็น initials
    const name = user.displayName || user.email || '?';
    const initials = name.split(/[\s@]/).filter(Boolean)
      .map(w => w[0]).join('').slice(0, 2).toUpperCase();
    badge.className = 'auth-badge signed-in';
    badge.textContent = initials;
    badge.title = `ลงชื่อเข้าใช้: ${user.email}`;
  } else {
    badge.className = 'auth-badge signed-out';
    badge.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0112 0v2"/></svg>`;
    badge.title = 'ไม่ได้ลงชื่อเข้าใช้ — กดเพื่อไปตั้งค่า';
  }
}

function setupAuthBadge() {
  const badge = document.getElementById('auth-badge');
  if (!badge) return;
  badge.addEventListener('click', () => {
    setSettingsOpenSection('accounts');   // เปิด accordion บัญชีของฉันก่อน render
    switchView('settings');
    // รอ renderSettings วาด DOM เสร็จ แล้ว scroll ไปส่วนลงชื่อเข้าใช้
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById('settings-signin')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  });
}

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
  // Reactive re-render (state เปลี่ยน เช่น กด toggle/เปลี่ยนธีม) —
  // คงตำแหน่ง scroll เดิม ไม่เด้งขึ้นบนเหมือนตอนเปลี่ยนหน้า
  const y = window.scrollY;
  renderView(currentView);
  window.scrollTo(0, y);
}


/* === View switching (History API) =============================== */

function switchView(viewName) {
  if (!VIEW_RENDERERS[viewName]) return;
  markSessionAction();
  track('feature_used', { feature: viewName });

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

  // FAB → push history + open add modal with auto-voice
  document.getElementById('fab')?.addEventListener('click', () => {
    history.pushState({ view: 'modal', modal: 'add' }, '', '#add');
    openAddModalWithVoice();
  });

  // Export dialog
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-action="open-export"]')) {
      e.preventDefault();
      const { openExportDialog } = await import('./export.js');
      openExportDialog();
    }
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
  window.addEventListener('load', async () => {
    try {
      // updateViaCache: 'none' — บังคับเบราว์เซอร์ดึง sw.js สดทุกครั้ง (ไม่ใช้ HTTP cache)
      // เพื่อให้ตรวจเจอ SW เวอร์ชันใหม่ทันที
      const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      reg.update();  // บังคับเช็คอัปเดตทันทีตอนเปิดแอป

      // ถ้ามี SW ควบคุมอยู่แล้ว (เป็นการอัปเดต ไม่ใช่ติดตั้งครั้งแรก)
      // เมื่อ SW ใหม่เข้าควบคุม → reload หนึ่งครั้งเพื่อใช้โค้ดใหม่ทันที
      if (navigator.serviceWorker.controller) {
        let reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloaded) return;
          reloaded = true;
          window.location.reload();
        });
      }
    } catch (err) {
      console.warn('SW registration failed', err);
    }
  });
}


/* === Legacy sample-data migration ================================ */
// แอปเคย seed ข้อมูลตัวอย่างอัตโนมัติตอน first run (เลิกแล้ว — ข้อมูลตัวอย่าง
// มีเฉพาะแบบ opt-in ผ่านปุ่ม "ลองข้อมูลตัวอย่าง" ใน empty state)
// เหลือไว้เฉพาะ patch สำหรับเครื่องที่เคยถูก seed แล้ว account ขาด _sample
// เพื่อให้ clearSampleData() ยังลบออกได้

function patchLegacySampleAccount() {
  const demoAcct = State.getAccount('bank:kbank:3344');
  if (demoAcct && !demoAcct._sample) {
    State.updateAccount('bank:kbank:3344', { _sample: true });
  }
}


/* === Init ======================================================= */

function init() {
  // 0. Firebase — ต้องเรียกก่อน feature ที่ต้องการ auth/Firestore
  try {
    initFirebase();
    let _sharedWithMeUnsub = null;
    let _lastEmail = null;
    onAuthStateChanged(async user => {
      if (_sharedWithMeUnsub) { _sharedWithMeUnsub(); _sharedWithMeUnsub = null; }
      updateAuthBadge(user);   // อัปเดต badge มุมขวาบนทันที
      if (user) {
        _lastEmail = user.email;
        // ปิด listeners เก่า + ล้าง received accounts ออกจาก memory และ localStorage
        State.unsubscribeAll();
        State.clearReceivedAccounts(user.email);
        // เปิด listeners สำหรับ cloud accounts ของตัวเองทันที
        State.subscribeSharedAccounts();
        // Retry transactions ที่ push ไม่สำเร็จขณะ sign out
        State.retryPendingSync().then(count => {
          if (count > 0) showToast(`sync ${count} รายการที่ค้างไว้สำเร็จ`);
        }).catch(console.error);
        // Fetch สถานะการแชร์จาก server โดยตรง (ไม่ใช้ cache)
        // - sharedWithMe: ล้างบัญชีที่ถูกยกเลิกแชร์ทันที
        // - ownedByMe: กู้คืนบัญชีที่เราแชร์ไว้ กรณี restore backup ทำให้สถานะแชร์หาย
        try {
          const [sharedWithMe, ownedByMe] = await Promise.all([
            fetchAccountsSharedWithMe(user.email),
            fetchAccountsOwnedByMe(user.email)
          ]);
          State.mergeSharedAccounts(sharedWithMe);
          State.restoreOwnedAccounts(ownedByMe);
          State.subscribeSharedAccounts();
        } catch (e) {
          console.warn('[auth] initial sharing fetch failed', e);
        }
        // Real-time listener สำหรับการเปลี่ยนแปลงหลังจากนี้
        _sharedWithMeUnsub = subscribeAccountsSharedWithMe(user.email, accounts => {
          State.mergeSharedAccounts(accounts);
          State.subscribeSharedAccounts();
        });

        // Drive auto-backup (ทุก 7 วัน, เฉพาะ session ที่มี token จาก popup sign-in)
        const driveToken = getAccessToken();
        if (driveToken && State.getTransactions().length > 0) {
          const lastDriveBackup = State.getSettings().last_drive_backup;
          const daysSince = lastDriveBackup
            ? Math.floor((Date.now() - new Date(lastDriveBackup).getTime()) / 86400000)
            : Infinity;
          if (daysSince >= 7) {
            import('./drive.js').then(({ setDriveToken, uploadBackup }) => {
              setDriveToken(driveToken);
              const json = State.exportJSON();
              return uploadBackup(json);
            }).then(() => {
              State.setSetting('last_drive_backup', new Date().toISOString().slice(0, 10));
              setTimeout(() => showToast('💾 สำรองข้อมูลไปยัง Drive แล้ว ✓'), 3500);
            }).catch(e => console.warn('[drive] auto-backup failed', e));
          } else {
            // มี token — อัปเดต drive.js token cache เพื่อให้ manual backup ใช้ได้ทันที
            import('./drive.js').then(({ setDriveToken }) => setDriveToken(driveToken));
          }
        }
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

  // 2. Onboarding (first-run) — ไม่ seed ข้อมูลตัวอย่างอัตโนมัติ
  // (user เลือกเองได้จากปุ่ม "ลองข้อมูลตัวอย่าง" ใน empty state)
  patchLegacySampleAccount();
  if (shouldShowOnboarding()) {
    showOnboarding(() => {
      renderCurrentView();
      // Coach mark: หน่วง 600ms ให้ DOM render ก่อน spotlight จะวัด getBoundingClientRect ได้ถูก
      if (shouldShowCoachMark()) setTimeout(showCoachMark, 600);
    });
  }

  // 3. Run scheduler — สร้าง transaction จาก template ที่ครบกำหนดแล้ว
  const sched = Recurring.runScheduler();
  if (sched.executed > 0) {
    const catchup = sched.executed > sched.templateCount;
    const msg = catchup
      ? `สร้างรายการประจำ ${sched.executed} งวด (จาก ${sched.templateCount} รายการ)`
      : `สร้างรายการประจำ ${sched.templateCount} รายการ`;
    setTimeout(() => showToast(msg), 800);
  }

  // 4. Setup navigation handlers + auth badge
  setupNav();
  setupAuthBadge();

  // 5. Subscribe state changes → re-render เมื่อข้อมูลเปลี่ยน
  State.subscribe(() => renderCurrentView());
  Recurring.subscribe(() => renderCurrentView());

  // 5-track. Transaction-added analytics subscriber
  let _prevTxCount = State.getTransactions().length;
  State.subscribe(() => {
    const txs = State.getTransactions();
    if (txs.length > _prevTxCount) {
      const latest = txs[0]; // sorted newest first
      if (latest) track('transaction_added', { source: latest.source });
      markSessionAction();
    }
    _prevTxCount = txs.length;
  });

  // 5a. Init analytics — pass state module so opt-out check works synchronously
  initAnalytics(State);
  trackFirstOpenIfNeeded();

  // 5b. Init + subscribe custom category registries (icons.js + parsers.js)
  function syncCategoryRegistries() {
    const cats = State.getCustomCategories();
    setCustomCategoryRegistry(cats);
    setCustomCategoryParserRegistry(cats);
  }
  syncCategoryRegistries();
  State.subscribe(syncCategoryRegistries);

  // 6. Initial render — แสดง skeleton ก่อน 1 frame แล้วค่อย render จริง
  history.replaceState({ view: 'dashboard' }, '', '#');
  const _viewEl = document.getElementById('view');
  if (_viewEl) _viewEl.innerHTML = renderDashboardSkeleton();
  requestAnimationFrame(() => switchView('dashboard'));

  // 7. PWA service worker
  registerSW();

  // 8. Smart reminders — mutual exclusion กับ catchup banner
  //    ถ้า catchup แสดงอยู่ → งด reminders วันนั้น (ไม่ซ้อน interruption)
  setTimeout(() => {
    const hasCatchup = !!checkCatchupOpportunity();
    checkReminders(showToast, hasCatchup);
  }, 1500);

  // 9. Notification mirror — sw.js อ่าน localStorage ไม่ได้
  //    → mirror recurring templates + config ลง IndexedDB (debounced)
  //    และลงทะเบียน periodic background sync (Android installed PWA)
  syncNotifyData();
  let _notifySyncTimer = null;
  const debouncedNotifySync = () => {
    clearTimeout(_notifySyncTimer);
    _notifySyncTimer = setTimeout(syncNotifyData, 2000);
  };
  Recurring.subscribe(debouncedNotifySync);
  State.subscribe(debouncedNotifySync);   // settings (daysAhead/toggle) เปลี่ยน
  registerPeriodicSync();

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
