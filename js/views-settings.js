/* ===================================================================
   views-settings.js — SETTINGS VIEW + accounts + recurring — Phase B cluster
   ===================================================================
   accordion เมนูตั้งค่า, แชร์บัญชี (Firebase), รายการประจำ, แจ้งเตือน
   primitives + category manager + cash-override dialog มาจาก views-shared.js
   =================================================================== */

import * as State from './state.js';
import * as Recurring from './recurring.js';
import { svgIcon, getCategory } from './icons.js';
import { formatBaht, formatShortDate, haptic, todayISO } from './utils.js';
import { getLevelInfo } from './gamification.js';
import { track } from './analytics.js';
import {
  signInWithGoogle, signOut as firebaseSignOut, getCurrentUser, getAccessToken,
  updateSharedWith, migrateAccountToCloud
} from './firebase.js';
import {
  ensurePermission, getPermissionState, testNotification,
  registerPeriodicSync, syncNotifyData
} from './notify.js';
import {
  escapeHtml, renderEmptyState, showToast, applyTheme, applyTextSize, applyDark,
  getRecurSuggestions, setRecurSuggestions, openCategoryManager, showCashOverrideDialog
} from './views-shared.js';

const ACCT_INIT = { cash: '฿', bank: 'BNK', investment: 'INV', debt: 'DEBT', credit_card: 'CC', ewallet: 'EW' };


/* ===================================================================
   SETTINGS VIEW
   =================================================================== */
/* ── Settings accordion ──────────────────────────────────────────
   เมนูตั้งค่าพับเก็บได้ — เปิดได้ทีละส่วน (เปิดส่วนใหม่ = พับส่วนเดิม)
   _settingsOpenSection คงไว้ข้าม re-render (เปลี่ยนธีม/toggle ไม่ทำให้พับ)
   setSettingsOpenSection() ใช้โดย deep-link (auth badge → accounts ฯลฯ) */
let _settingsOpenSection = null;
export function setSettingsOpenSection(id) { _settingsOpenSection = id; }

function _recurMeta() {
  const n = Recurring.getActiveTemplates().length;
  const s = getRecurSuggestions().length;
  if (s > 0) return n > 0 ? `${n} รายการ · ใหม่ ${s}` : `ตรวจพบ ${s} ใหม่`;
  return n > 0 ? `${n} รายการ` : '';
}

function settingsAccordion(id, title, meta, bodyHtml) {
  const open = _settingsOpenSection === id;
  return `
    <div class="settings-acc ${open ? 'open' : ''}" data-acc="${id}">
      <button class="settings-acc-head" data-acc-toggle="${id}" aria-expanded="${open}">
        <span class="settings-acc-title">${title}</span>
        ${meta ? `<span class="settings-acc-meta">${meta}</span>` : ''}
        <span class="settings-acc-chevron">${svgIcon('chevron', { size: 18, stroke: 2 })}</span>
      </button>
      <div class="settings-acc-body"><div class="settings-acc-inner">${bodyHtml}</div></div>
    </div>`;
}

export function renderSettings(container) {
  const settings = State.getSettings();
  const txCount = State.getTransactions().length;
  const acctCount = State.getAccounts().length;

  // สถานะ Drive backup
  const _user = getCurrentUser();
  const _lastDriveBackup = settings.last_drive_backup;
  let driveBackupSub;
  if (!_lastDriveBackup) {
    driveBackupSub = 'ยังไม่ได้สำรอง';
  } else {
    const _dd = Math.floor((Date.now() - new Date(_lastDriveBackup).getTime()) / 86400000);
    driveBackupSub = _dd === 0 ? 'สำรองแล้ววันนี้ ✓' : `สำรองล่าสุด ${_dd} วันที่แล้ว`;
  }
  const theme       = settings.theme || 'diary';
  const darkMode    = settings.dark || false;
  const displayName = settings.display_name || '';

  const THEME_SWATCHES = [
    { val: 'diary',  color: '#e88563', name: 'Diary' },
    { val: 'ocean',  color: '#2e86c1', name: 'Ocean' },
    { val: 'forest', color: '#27ae60', name: 'Forest' },
    { val: 'rose',   color: '#e06880', name: 'Rose' },
    { val: 'citrus', color: '#d4880e', name: 'Citrus' },
    { val: 'violet', color: '#7c5cbf', name: 'Violet' },
    { val: 'carbon', color: '#1e3a72', name: 'Carbon' },
  ];
  const curThemeName = THEME_SWATCHES.find(t => t.val === theme)?.name || 'Diary';

  const progress  = State.getUserProgress();
  const levelInfo = getLevelInfo(progress.xp);
  const pctBar    = Math.round(levelInfo.progress * 100);
  const xpToNext  = levelInfo.next ? levelInfo.next.xp - progress.xp : 0;

  container.innerHTML = `
    <div class="app-bar">
      <h1 class="title">ตั้งค่า</h1>
    </div>

    <!-- Profile card -->
    <div class="profile-card">
      <div class="profile-level-name">${escapeHtml(levelInfo.current.name)}</div>
      <div class="profile-xp-row">
        <span class="profile-xp-cur">${progress.xp.toLocaleString()} XP</span>
        ${levelInfo.next
          ? `<span class="profile-xp-next">อีก ${xpToNext.toLocaleString()} XP → Level ${levelInfo.next.level}</span>`
          : `<span class="profile-xp-next">เลเวลสูงสุด 🏆</span>`}
      </div>
      <div class="profile-xp-bar">
        <div class="profile-xp-fill" style="width: ${pctBar}%"></div>
      </div>
      <div class="profile-coins-row">
        <span class="profile-coin">🥉 ${progress.coins.bronze}</span>
        <span class="profile-coin">🥈 ${progress.coins.silver}</span>
        <span class="profile-coin">🥇 ${progress.coins.gold}</span>
        ${progress.streak_days > 0
          ? `<span class="profile-streak">🔥 ทำมาแล้ว ${progress.streak_days} วัน</span>`
          : ''}
      </div>
    </div>

    <!-- เมนูตั้งค่า (accordion — เปิดทีละส่วน) -->
    ${settingsAccordion('appearance', 'รูปแบบการแสดงผล', curThemeName, `
      <div class="card">
        <!-- Dark mode toggle -->
        <div class="dark-toggle-row">
          <div class="setting-label">โหมดมืด</div>
          <label class="toggle-switch">
            <input type="checkbox" id="dark-toggle" ${darkMode ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>

        <!-- Theme swatches -->
        <div class="appear-block">
          <div class="appear-block-label">ธีม</div>
          <div class="theme-swatches">
            ${THEME_SWATCHES.map(t => `
              <button class="swatch ${theme === t.val ? 'active' : ''}"
                style="--sw-color: ${t.color}"
                data-action="set-theme" data-val="${t.val}"
                title="${t.name}"></button>
            `).join('')}
          </div>
          <div class="theme-cur-name">${curThemeName}</div>
        </div>

        <!-- ขนาดตัวอักษร (ย้ายมาอยู่ในกลุ่มเดียวกับธีม) -->
        <div class="appear-block">
          <div class="appear-block-label">ขนาดตัวอักษร</div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
            <div class="setting-sub" style="margin:0">Normal · ใหญ่ · ใหญ่มาก</div>
            <div class="text-size-picker" id="text-size-picker">
              <button class="size-btn" data-size="normal" style="font-size:14px">ก</button>
              <button class="size-btn" data-size="large"  style="font-size:17px">ก</button>
              <button class="size-btn" data-size="xlarge" style="font-size:20px">ก</button>
            </div>
          </div>
        </div>

      </div>
    `)}

    ${settingsAccordion('notify', 'การแจ้งเตือน', '', `
      <div class="card">
        <div class="setting-row" data-action="edit-threshold">
          <div>
            <div class="setting-label">ยอดต่ำสุดที่เตือน</div>
            <div class="setting-sub">เตือนเมื่อยอดรวม (เงินสด + ธนาคาร) ต่ำกว่าค่านี้</div>
          </div>
          <div class="setting-value">${formatBaht(settings.threshold_satang)} ฿</div>
        </div>
        <div class="setting-divider"></div>
        <div class="setting-row">
          <div>
            <div class="setting-label">รายการประจำครบกำหนด</div>
            <div class="setting-sub">เตือนเมื่อใกล้ครบกำหนด/ครบกำหนด</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-setting="notify_recurring"
              ${settings.notify_recurring !== false ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        ${settings.notify_recurring !== false ? `
        <div class="setting-subgroup">
          <div class="setting-row setting-stack">
            <div>
              <div class="setting-label">เตือนล่วงหน้า</div>
              <div class="setting-sub">เริ่มเตือนก่อนวันครบกำหนด</div>
            </div>
            <div class="days-ahead-picker">
              ${[[0, 'วันครบ'], [1, '1 วัน'], [2, '2 วัน'], [3, '3 วัน']].map(([d, label]) => `
                <button class="setting-seg-btn ${(settings.notify_days_ahead ?? 1) === d ? 'active' : ''}"
                  data-days-ahead="${d}">${label}</button>
              `).join('')}
            </div>
          </div>
          <div class="setting-row">
            <div style="flex:1;min-width:0">
              <div class="setting-label">เด้งแจ้งเตือนพร้อมเสียง</div>
              <div class="setting-sub">${{
                unsupported: 'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน',
                granted:     'เปิดแล้ว ✓ บน Android ที่ติดตั้งแอป เด้งได้แม้ปิดแอป',
                denied:      'ถูกปิดในเบราว์เซอร์ — เปิดได้ที่ตั้งค่าเว็บไซต์ของเบราว์เซอร์',
                default:     'เด้งบนหน้าจอพร้อมเสียงเหมือนแอปแชท'
              }[getPermissionState()]}</div>
            </div>
            ${getPermissionState() === 'default'
              ? '<button class="setting-seg-btn active" data-action="enable-push-notify">เปิดใช้</button>'
              : getPermissionState() === 'granted'
                ? '<button class="setting-seg-btn" data-action="test-notify">ทดสอบ</button>'
                : ''}
          </div>
        </div>
        ` : ''}
        <div class="setting-row">
          <div>
            <div class="setting-label">ยอดใกล้เกณฑ์ต่ำสุด</div>
            <div class="setting-sub">เตือนเมื่อยอดบัญชีต่ำกว่าที่ตั้งไว้</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-setting="notify_low_balance"
              ${settings.notify_low_balance !== false ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <div>
            <div class="setting-label">สรุปประจำสัปดาห์</div>
            <div class="setting-sub">สรุปรายจ่ายสัปดาห์ที่แล้ว ทุกวันจันทร์</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-setting="notify_weekly"
              ${settings.notify_weekly !== false ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    `)}

    ${settingsAccordion('privacy', 'Privacy', '', `
      <div class="card">
        <div class="setting-row">
          <div>
            <div class="setting-label">ส่งข้อมูลใช้งานแบบไม่ระบุตัวตน</div>
            <div class="setting-sub">ช่วยปรับปรุงแอป — ไม่เก็บยอดเงิน รายการ หรือชื่อ</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="analytics-toggle"
              ${!settings.analytics_opt_out ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    `)}

    ${settingsAccordion('recurring', 'รายการประจำ / ผ่อน', _recurMeta(), renderRecurringSection())}

    ${settingsAccordion('category', 'หมวดหมู่', '', `
      <div class="card">
        <div class="setting-row" data-action="open-category-manager" style="cursor:pointer">
          <div>
            <div class="setting-label">จัดการหมวดหมู่</div>
            <div class="setting-sub">เพิ่ม แก้ไข หรือลบหมวดหมู่ที่กำหนดเอง</div>
          </div>
          ${svgIcon('chevron', { size: 18, stroke: 2 })}
        </div>
      </div>
    `)}

    ${settingsAccordion('data', 'ข้อมูล', `${txCount} รายการ`, `
      <div class="card">
        <div class="setting-row">
          <div>
            <div class="setting-label">บันทึกทั้งหมด</div>
          </div>
          <div class="setting-value">${txCount} รายการ</div>
        </div>
        <div class="setting-row">
          <div>
            <div class="setting-label">บัญชี</div>
          </div>
          <div class="setting-value">${acctCount} บัญชี</div>
        </div>

        <!-- Drive backup -->
        ${_user ? `
        <div class="setting-row" data-action="drive-backup" style="cursor:pointer">
          <div>
            <div class="setting-label">สำรองไปยัง Drive</div>
            <div class="setting-sub" id="drive-backup-sub">${driveBackupSub}</div>
          </div>
          ${svgIcon('cloud-upload', { size: 18, stroke: 2 })}
        </div>
        <div class="setting-row" data-action="drive-restore" style="cursor:pointer">
          <div>
            <div class="setting-label">กู้คืนจาก Drive</div>
            <div class="setting-sub">ดึงไฟล์สำรองจาก Google Drive</div>
          </div>
          ${svgIcon('cloud-download', { size: 18, stroke: 2 })}
        </div>
        ` : `
        <div class="setting-row" style="opacity:0.5">
          <div>
            <div class="setting-label">สำรองไปยัง Drive</div>
            <div class="setting-sub">ลงชื่อเข้าใช้ Google เพื่อใช้งาน</div>
          </div>
          ${svgIcon('cloud-upload', { size: 18, stroke: 2 })}
        </div>
        `}

        <!-- local JSON download (สำรองรอง) -->
        <div class="setting-row" data-action="export-json" style="cursor:pointer">
          <div>
            <div class="setting-label">สำรองเป็นไฟล์</div>
            <div class="setting-sub">ดาวน์โหลด JSON เก็บไว้ในเครื่อง</div>
          </div>
          ${svgIcon('download', { size: 18, stroke: 2 })}
        </div>
        <div class="setting-row" data-action="import-json" style="cursor:pointer">
          <div>
            <div class="setting-label">กู้คืนจากไฟล์</div>
            <div class="setting-sub">เลือกไฟล์ JSON ที่เคยสำรองไว้</div>
          </div>
          ${svgIcon('upload', { size: 18, stroke: 2 })}
        </div>
        <div class="setting-row" data-action="reset-all" style="color: var(--clay);">
          <div>
            <div class="setting-label" style="color: var(--clay);">ลบข้อมูลทั้งหมด</div>
            <div class="setting-sub">ทำให้ยกเลิกไม่ได้ — โปรดสำรองก่อน</div>
          </div>
          ${svgIcon('delete', { size: 18, stroke: 2 })}
        </div>
      </div>
    `)}

    ${settingsAccordion('accounts', 'บัญชีของฉัน', `${acctCount} บัญชี`, renderAccountsSection())}

    <!-- Privacy info -->
    <div class="privacy-footer" style="margin-top: 22px;">
      ${svgIcon('shield', { size: 18, stroke: 2 })}
      <div class="text">
        <strong>ข้อมูลทั้งหมดอยู่ในเครื่องนี้</strong><br>
        ไม่มีการส่งข้อมูลไปยังเซิร์ฟเวอร์ใดๆ — ลบแอปข้อมูลหายทันที
        แนะนำสำรองข้อมูลทาง Drive หรือ ดาวน์โหลดไฟล์เก็บไว้ เครื่องหายข้อมูลไม่หาย
      </div>
    </div>

    <div class="signoff" style="margin-top: 32px;">— v1.0 · diary mode —<br><span id="sw-version" style="font-size:11px;opacity:0.7"></span></div>

    <!-- Hidden file input สำหรับ import JSON -->
    <input id="json-file-input" type="file" accept="application/json" hidden>
  `;

  // === Bind events ===

  // Accordion: เปิดได้ทีละส่วน — กดส่วนที่เปิดอยู่ = พับเก็บ
  container.querySelectorAll('[data-acc-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.accToggle;
      _settingsOpenSection = (_settingsOpenSection === id) ? null : id;
      container.querySelectorAll('.settings-acc').forEach(acc => {
        const isOpen = acc.dataset.acc === _settingsOpenSection;
        acc.classList.toggle('open', isOpen);
        acc.querySelector('.settings-acc-head')?.setAttribute('aria-expanded', isOpen);
      });
    });
  });

  // ── Drive backup helpers (shared between upload/restore buttons) ──
  async function _getDriveModule() {
    return import('./drive.js');
  }
  async function _ensureDriveToken(drive) {
    // ถ้ามี token ใน cache แล้ว ใช้ได้เลย
    if (drive.hasDriveToken()) return true;
    // ถ้า session มี token จาก popup sign-in ในรอบนี้ → ใส่ใน drive module
    const sessionToken = getAccessToken();
    if (sessionToken) { drive.setDriveToken(sessionToken); return true; }
    // ไม่มี token (reload กลับมา) → ต้องขอ token ใหม่ผ่าน popup
    try {
      await drive.requestDriveAccess();
      return true;
    } catch (e) {
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return false;
      throw e;
    }
  }

  // Drive: สำรองตอนนี้
  container.querySelector('[data-action="drive-backup"]')?.addEventListener('click', async () => {
    const btn = container.querySelector('[data-action="drive-backup"]');
    if (btn) btn.style.opacity = '0.5';
    try {
      const drive = await _getDriveModule();
      const ok = await _ensureDriveToken(drive);
      if (!ok) { if (btn) btn.style.opacity = ''; return; }

      showToast('กำลังสำรองข้อมูลไปยัง Drive…');
      const json = State.exportJSON();
      await drive.uploadBackup(json);
      const today = new Date().toISOString().slice(0, 10);
      State.setSetting('last_drive_backup', today);
      const subEl = container.querySelector('#drive-backup-sub');
      if (subEl) subEl.textContent = 'สำรองแล้ววันนี้ ✓';
      showToast('💾 สำรองข้อมูลไปยัง Drive เรียบร้อย ✓');
    } catch (e) {
      console.error('[drive] manual backup failed', e);
      showToast('สำรองไม่สำเร็จ: ' + (e.message ?? e));
    } finally {
      if (btn) btn.style.opacity = '';
    }
  });

  // Drive: กู้คืน
  container.querySelector('[data-action="drive-restore"]')?.addEventListener('click', async () => {
    try {
      const drive = await _getDriveModule();
      const ok = await _ensureDriveToken(drive);
      if (!ok) return;

      showToast('กำลังดาวน์โหลดข้อมูลจาก Drive…');
      const jsonStr = await drive.downloadBackup();
      if (!jsonStr) { showToast('ไม่พบไฟล์สำรองใน Drive'); return; }

      // แสดง dialog ยืนยันก่อน import
      const info = await drive.getBackupInfo().catch(() => null);
      const dateStr = info?.modifiedTime
        ? new Date(info.modifiedTime).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
        : 'ไม่ทราบวันที่';
      const sizeKB = info?.size ? Math.ceil(Number(info.size) / 1024) : '?';

      const overlay = document.createElement('div');
      overlay.className = 'overlay';
      overlay.innerHTML = `
        <div class="acct-modal" style="max-width:340px">
          <div class="acct-modal-head">กู้คืนจาก Drive</div>
          <div class="acct-modal-body" style="font-size:14px;line-height:1.7;color:var(--ink)">
            <p style="margin:0 0 8px">พบไฟล์สำรองใน Google Drive</p>
            <p style="margin:0 0 4px;color:var(--ink-faint);font-size:13px">
              📅 แก้ไขล่าสุด: ${dateStr}<br>
              📦 ขนาด: ${sizeKB} KB
            </p>
            <p style="margin:12px 0 0;color:var(--clay);font-size:13px">
              ⚠️ ข้อมูลปัจจุบันในเครื่องจะถูกแทนที่ด้วยข้อมูลจาก Drive
            </p>
          </div>
          <div class="acct-modal-footer" style="gap:8px">
            <button class="cancel" id="dr-cancel">ยกเลิก</button>
            <button class="add-save" id="dr-ok" style="flex:1">กู้คืน</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      overlay.querySelector('#dr-cancel').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#dr-ok').addEventListener('click', () => {
        overlay.remove();
        if (State.importJSON(jsonStr)) {
          showToast('กู้คืนข้อมูลเรียบร้อย ✓');
        } else {
          showToast('ไม่สามารถกู้คืนได้ — ไฟล์ใน Drive อาจเสียหาย');
        }
      });
    } catch (e) {
      console.error('[drive] restore failed', e);
      showToast('กู้คืนไม่สำเร็จ: ' + (e.message ?? e));
    }
  });

  // แสดงเวอร์ชันจาก Service Worker
  const swVersionEl = container.querySelector('#sw-version');
  if (swVersionEl) {
    const sw = navigator.serviceWorker?.controller;
    if (sw) {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { swVersionEl.textContent = ''; }, 1500);
      channel.port1.onmessage = (e) => {
        clearTimeout(timer);
        if (e.data?.version) swVersionEl.textContent = e.data.version;
      };
      sw.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    }
  }

  container.querySelector('[data-action="export-json"]')?.addEventListener('click', () => {
    const json = State.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diary-finance-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    track('export_used', { format: 'json' });
    showToast('สำรองข้อมูลเรียบร้อย');
  });

  container.querySelector('[data-action="import-json"]')?.addEventListener('click', () => {
    container.querySelector('#json-file-input').click();
  });

  container.querySelector('#json-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    if (State.importJSON(text)) {
      showToast('กู้คืนข้อมูลเรียบร้อย');
    } else {
      showToast('รูปแบบไฟล์ไม่รองรับ — ใช้ไฟล์ JSON ที่สำรองไว้');
    }
  });

  container.querySelector('[data-action="reset-all"]')?.addEventListener('click', () => {
    if (confirm('ลบข้อมูลทั้งหมด ยกเลิกไม่ได้\nโปรดยืนยันอีกครั้ง')) {
      State.resetAll();
      Recurring.getTemplates().forEach(t => Recurring.deleteTemplate(t.id));
      showToast('ลบข้อมูลทั้งหมดแล้ว');
    }
  });

  container.querySelector('[data-action="open-category-manager"]')?.addEventListener('click', () => {
    openCategoryManager();
  });

  // Dark mode toggle
  container.querySelector('#dark-toggle')?.addEventListener('change', (e) => {
    const val = e.target.checked;
    State.setSetting('dark', val);
    applyDark(val);
  });

  // Analytics opt-out toggle
  container.querySelector('#analytics-toggle')?.addEventListener('change', (e) => {
    State.setSetting('analytics_opt_out', !e.target.checked);
  });

  // Notification toggles (notify_recurring, notify_low_balance, notify_weekly)
  container.querySelectorAll('[data-setting^="notify_"]').forEach(input => {
    input.addEventListener('change', (e) => {
      State.setSetting(e.target.dataset.setting, e.target.checked);
    });
  });

  // เตือนล่วงหน้า N วัน — setSetting → re-render → active class อัปเดตเอง
  container.querySelectorAll('[data-days-ahead]').forEach(btn => {
    btn.addEventListener('click', () => {
      State.setSetting('notify_days_ahead', Number(btn.dataset.daysAhead));
    });
  });

  // เปิด system notification — ต้องเรียกจาก user gesture เท่านั้น
  // ⚠️ ไม่เด้ง notification อัตโนมัติทันทีหลัง grant — เป็น signal ที่
  //    Chrome ใช้ flag ว่าเว็บส่งสแปม ให้ user กดปุ่ม "ทดสอบ" เองแทน
  container.querySelector('[data-action="enable-push-notify"]')?.addEventListener('click', async () => {
    const ok = await ensurePermission();
    if (ok) {
      await syncNotifyData();
      registerPeriodicSync();
      showToast('เปิดการแจ้งเตือนแล้ว ✓ — กดปุ่ม "ทดสอบ" เพื่อลองเด้งดู');
    } else if (getPermissionState() === 'denied') {
      showToast('ถูกปิดในเบราว์เซอร์ — เปิดได้ที่ตั้งค่าเว็บไซต์ของเบราว์เซอร์');
    }
    renderSettings(container);
  });

  // ทดสอบการแจ้งเตือน — มี feedback บนปุ่ม: กำลังส่ง… → เด้งแล้ว ✓
  const testBtn = container.querySelector('[data-action="test-notify"]');
  testBtn?.addEventListener('click', async () => {
    if (testBtn.disabled) return;
    haptic();
    testBtn.disabled = true;
    const orig = testBtn.textContent;
    testBtn.textContent = 'กำลังส่ง…';
    const ok = await testNotification();
    testBtn.textContent = ok ? 'เด้งแล้ว ✓' : orig;
    if (!ok) showToast('เด้งไม่สำเร็จ — ตรวจการอนุญาตแจ้งเตือนในเบราว์เซอร์');
    setTimeout(() => {
      testBtn.textContent = orig;
      testBtn.disabled = false;
    }, 2200);
  });

  // Theme toggle — State.setSetting → notify() → subscriber → renderCurrentView() อัตโนมัติ
  container.querySelectorAll('[data-action="set-theme"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      State.setSetting('theme', val);
      applyTheme(val);
    });
  });

  // Text size
  const currentSize = State.getSettings().text_size || 'normal';
  container.querySelectorAll('.size-btn[data-size]').forEach(btn => {
    if (btn.dataset.size === currentSize) btn.classList.add('active');
    btn.addEventListener('click', () => {
      container.querySelectorAll('.size-btn[data-size]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.setSetting('text_size', btn.dataset.size);
      applyTextSize(btn.dataset.size);
    });
  });

  container.querySelector('[data-action="edit-threshold"]')?.addEventListener('click', () => {
    const current = State.getSettings().threshold_satang / 100;
    const v = prompt('ยอดต่ำสุดที่เตือน (บาท):', current);
    if (v !== null && !isNaN(Number(v))) {
      State.setSetting('threshold_satang', Math.round(Number(v) * 100));
      showToast('บันทึกแล้ว');
    }
  });

  // Recurring suggestions — เพิ่ม / ข้าม
  container.querySelectorAll('.recur-suggest-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      const s = getRecurSuggestions()[idx];
      if (!s) return;
      // splice ก่อน addTemplate เพราะ addTemplate trigger re-render ซิงโครนัส
      getRecurSuggestions().splice(idx, 1);
      Recurring.addTemplate({
        type:        s.type,
        amount:      s.amount,
        group:       s.group,
        description: s.description,
        frequency:   s.frequency,
        first_due:   s.next_due
      });
      showToast(`เพิ่ม "${s.description}" เป็นรายการประจำแล้ว ✓`);
      // addTemplate → save() → listener → renderCurrentView() (re-render อัตโนมัติ พร้อม getRecurSuggestions() ที่ splice แล้ว)
    });
  });

  container.querySelectorAll('.recur-suggest-skip').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      getRecurSuggestions().splice(idx, 1);
      // re-render settings page โดยตรง (container ยังอยู่ใน scope)
      renderSettings(container);
    });
  });

  // Tap template row → เปิด add modal ใน edit template mode
  container.querySelectorAll('.template-row[data-tmpl-id]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="delete-template"]')) return;
      const tmpl = Recurring.getTemplate(row.dataset.tmplId);
      if (!tmpl) return;
      import('./add.js').then(({ openEditTemplateModal }) => openEditTemplateModal(tmpl));
    });
  });

  // Delete recurring templates
  container.querySelectorAll('[data-action="delete-template"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.tmplId;
      const tmpl = Recurring.getTemplate(id);
      if (!tmpl) return;
      if (confirm(`ลบ "${tmpl.description || 'รายการนี้'}"?\nรายการที่สร้างไปแล้วจะไม่ถูกลบ`)) {
        Recurring.deleteTemplate(id);
        showToast('ลบรายการประจำแล้ว');
      }
    });
  });

  // "open-add" จาก empty state ของรายการประจำ
  container.querySelector('[data-action="open-add"]')?.addEventListener('click', () => {
    document.getElementById('fab')?.click();
  });

  // Toggle share — แสดง share panel (sign in ก่อนถ้ายังไม่ได้ login)
  container.querySelectorAll('[data-action="toggle-share"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const accountId = btn.dataset.accountId;
      const sharePanel = container.querySelector(`.acct-share-panel[data-account-id="${accountId}"]`);
      if (!sharePanel) return;
      if (!getCurrentUser()) {
        try {
          await signInWithGoogle();
          renderSettings(container);
        } catch (e) {
          const code = e?.code || '';
          if (code === 'auth/popup-blocked')
            showToast('Popup ถูกบล็อก — อนุญาต popup ในเบราว์เซอร์แล้วลองใหม่');
          else if (code === 'auth/unauthorized-domain')
            showToast('Domain นี้ยังไม่ได้รับอนุญาตใน Firebase Console');
          else if (code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user')
            showToast('ยกเลิกการลงชื่อเข้าใช้');
          else
            showToast(`ลงชื่อเข้าใช้ไม่สำเร็จ: ${code || e?.message || 'unknown'}`);
          console.error('[sign-in]', e);
          return;
        }
      }
      const isHidden = sharePanel.style.display === 'none';
      sharePanel.style.display = isHidden ? 'block' : 'none';
      btn.classList.toggle('share-active', isHidden);
      if (isHidden) sharePanel.querySelector('.share-email-field')?.focus();
    });
  });

  // Add share email
  container.querySelectorAll('[data-action="add-share-email"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const accountId = btn.dataset.accountId;
      const input = container.querySelector(`.share-email-field[data-account-id="${accountId}"]`);
      const email = (input?.value || '').trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('ตรวจสอบรูปแบบอีเมลอีกครั้ง');
        return;
      }
      const account = State.getAccounts().find(a => a.id === accountId);
      if (!account) return;
      const ownerEmail = getCurrentUser()?.email;
      if (!ownerEmail) { showToast('ลงชื่อเข้าใช้เพื่อแชร์บัญชี'); return; }
      const newList = [...(account.shared_with || []), email];
      try {
        State.updateAccount(accountId, { shared_with: newList });
        if (account.storage === 'local') {
          const txs = State.getTransactions()
            .filter(t => t.account_from === accountId || t.account_to === accountId);
          await migrateAccountToCloud({ ...account, shared_with: newList, owner: ownerEmail }, txs);
          State.updateAccount(accountId, { storage: 'cloud', owner: ownerEmail });
          State.subscribeSharedAccounts();
        }
        await updateSharedWith(accountId, newList);
        showToast(`แชร์บัญชีกับ ${email} แล้ว`);
        renderSettings(container);
      } catch (e) {
        console.error('[share] add failed', e);
        showToast('แชร์ไม่สำเร็จ — ลองใหม่');
      }
    });
  });

  // Remove share email
  container.querySelectorAll('[data-action="remove-share-email"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { accountId, email } = btn.dataset;
      if (!confirm(`หยุดแชร์กับ ${email}?`)) return;
      const account = State.getAccounts().find(a => a.id === accountId);
      if (!account) return;
      const newList = (account.shared_with || []).filter(e => e !== email);
      try {
        // อัปเดต Firestore ก่อนเสมอ — ผู้รับ query array-contains จะหมดสิทธิ์ทันที
        await updateSharedWith(accountId, newList);
        if (newList.length === 0) {
          State.updateAccount(accountId, { storage: 'local', shared_with: [] });
          // ปิด Firestore listener ที่ค้างอยู่สำหรับบัญชีนี้ทันที
          State.subscribeSharedAccounts();
          showToast('หยุดแชร์แล้ว — ข้อมูลยังอยู่บน cloud');
        } else {
          State.updateAccount(accountId, { shared_with: newList });
          showToast(`ลบ ${email} ออกแล้ว`);
        }
        renderSettings(container);
      } catch (e) {
        console.error('[share] remove failed', e);
        showToast('ยกเลิกการแชร์ไม่สำเร็จ — ลองใหม่');
      }
    });
  });

  // ปฏิเสธบัญชีที่แชร์ให้ — ลบตัวเองออกจาก shared_with
  container.querySelectorAll('[data-action="reject-shared-account"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const accountId = btn.dataset.accountId;
      const account = State.getAccounts().find(a => a.id === accountId);
      if (!account) return;
      const myEmail = getCurrentUser()?.email;
      if (!myEmail) { showToast('ลงชื่อเข้าใช้เพื่อจัดการบัญชีแชร์'); return; }
      if (!confirm(`ปฏิเสธบัญชี "${account.display_name}"?\nบัญชีนี้จะไม่แสดงในแอปของคุณอีก`)) return;
      try {
        const newList = (account.shared_with || []).filter(e => e !== myEmail);
        await updateSharedWith(accountId, newList);
        State.removeAccount(accountId);
        showToast('ปฏิเสธบัญชีแล้ว');
        renderSettings(container);
      } catch (e) {
        console.error('[reject-share]', e);
        showToast('ปฏิเสธบัญชีไม่สำเร็จ — ลองใหม่');
      }
    });
  });

  // Display name — บันทึกเมื่อ blur หรือ Enter
  const displayNameInput = container.querySelector('#display-name-input');
  if (displayNameInput) {
    const saveName = () => {
      const val = displayNameInput.value.trim();
      State.setSetting('display_name', val);
    };
    displayNameInput.addEventListener('blur', saveName);
    displayNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') { saveName(); displayNameInput.blur(); } });
  }

  // Google sign-in (สำหรับผู้รับที่ต้องการดูบัญชีที่แชร์)
  container.querySelector('[data-action="google-sign-in"]')?.addEventListener('click', async () => {
    try {
      await signInWithGoogle();
      showToast('ลงชื่อเข้าใช้สำเร็จ');
      renderSettings(container);
    } catch (e) {
      const code = e?.code || '';
      if (code === 'auth/popup-blocked')
        showToast('Popup ถูกบล็อก — อนุญาต popup ในเบราว์เซอร์แล้วลองใหม่');
      else if (code === 'auth/unauthorized-domain')
        showToast('Domain นี้ยังไม่ได้รับอนุญาตใน Firebase Console');
      else if (code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user')
        showToast('ยกเลิกการลงชื่อเข้าใช้');
      else
        showToast(`ลงชื่อเข้าใช้ไม่สำเร็จ: ${code || e?.message || 'unknown'}`);
      console.error('[sign-in]', e);
    }
  });

  // Google sign-out
  container.querySelector('[data-action="google-sign-out"]')?.addEventListener('click', async () => {
    if (!confirm('ออกจากระบบ Google?\nบัญชีที่แชร์กับคุณจะไม่แสดงจนกว่าจะลงชื่อเข้าใหม่')) return;
    try {
      await firebaseSignOut();
      showToast('ออกจากระบบแล้ว');
      renderSettings(container);
    } catch (e) {
      console.error('[sign-out]', e);
      showToast('ออกจากระบบไม่ได้ — ลองใหม่');
    }
  });

  // เพิ่มบัญชีใหม่
  container.querySelector('[data-action="add-account"]')?.addEventListener('click', () => {
    showAccountModal(null, container);
  });

  // แก้ไขบัญชี
  container.querySelectorAll('[data-action="edit-account"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const acct = State.getAccount(btn.dataset.accountId);
      if (acct) showAccountModal(acct, container);
    });
  });

  // ลบบัญชี — dialog 2 ตัวเลือก
  container.querySelectorAll('[data-action="delete-account"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const acct = State.getAccount(btn.dataset.accountId);
      if (!acct) return;
      showDeleteAccountDialog(acct, container);
    });
  });

  // แก้ไขยอดเงินสดเริ่มต้น (cash override)
  container.querySelectorAll('[data-action="edit-cash-override"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const acct = State.getAccount(btn.dataset.accountId);
      if (acct) showCashOverrideDialog(acct);
    });
  });
}


/* ===================================================================
   Helpers
   =================================================================== */

/** Render section บัญชีของฉัน + share controls ใน Settings */
function renderAccountsSection() {
  const accounts = State.getAccounts();
  const currentUser = getCurrentUser();
  const myEmail = currentUser?.email ?? null;
  const displayName = State.getSettings().display_name || '';

  const TYPE_LABEL = {
    bank: 'เงินฝากธนาคาร', cash: 'เงินสด',
    credit_card: 'บัตรเครดิต', ewallet: 'กระเป๋าเงิน',
    investment: 'การลงทุน', debt: 'หนี้สิน'
  };

  // Google account card — sign in / sign out
  const googleCard = currentUser
    ? `<div id="settings-signin" class="card" style="margin-bottom:8px">
        <div class="setting-row">
          <div style="flex:1;min-width:0">
            <div class="setting-label">ลงชื่อเข้าใช้แล้ว</div>
            <div class="setting-sub">${escapeHtml(currentUser.email)}</div>
          </div>
          <button class="setting-seg-btn" data-action="google-sign-out">ออกจากระบบ</button>
        </div>
      </div>`
    : `<div id="settings-signin" class="card" style="margin-bottom:8px">
        <div class="setting-row">
          <div style="flex:1;min-width:0">
            <div class="setting-label">บัญชีที่แชร์กับฉัน</div>
            <div class="setting-sub">ลงชื่อด้วย Google เพื่อแชร์บัญชีหรือดูบัญชีที่ได้รับแชร์</div>
          </div>
          <button class="setting-seg-btn active" data-action="google-sign-in">ลงชื่อเข้าใช้</button>
        </div>
      </div>`;

  // ถ้า sign out (myEmail = null): ไม่สามารถแยก "ของฉัน" vs "ได้รับแชร์" โดยใช้ owner ได้
  // เพราะ owner = 'someone@gmail.com' และ null !== 'someone@gmail.com' = true เสมอ
  // → แสดงทุกบัญชีเป็น "ของฉัน" ทั้งหมด, ส่วน sharedAccounts ว่างเปล่า
  const myAccounts = !myEmail
    ? accounts
    : accounts.filter(a => !(a.storage === 'cloud' && a.owner && a.owner !== myEmail));
  const sharedAccounts = !myEmail
    ? []
    : accounts.filter(a => a.storage === 'cloud' && a.owner && a.owner !== myEmail);

  // แต่ละบัญชีของฉัน
  const acctCards = myAccounts.map(acct => {
    const balance = acct.type === 'cash'
      ? State.getEffectiveCashBalance(acct.id)
      : State.computeAccountBalance(acct.id);
    const typeLabel = TYPE_LABEL[acct.type] || acct.type;
    const initial = acct.bank ? acct.bank.toUpperCase().slice(0, 3) : (ACCT_INIT[acct.type] || '?');
    const isShared = (acct.shared_with || []).length > 0;
    const canShare = !!(myEmail && (acct.owner === myEmail || !acct.owner));

    const emailRows = (acct.shared_with || []).map(em => `
      <div class="acct-share-email-row">
        <span class="share-addr">${escapeHtml(em)}</span>
        <button class="setting-action-btn"
                data-action="remove-share-email"
                data-account-id="${escapeHtml(acct.id)}"
                data-email="${escapeHtml(em)}">ลบออก</button>
      </div>`).join('');

    const sharePanel = `
      <div class="acct-share-panel" data-account-id="${escapeHtml(acct.id)}" style="display:none">
        ${emailRows}
        <div class="share-email-add">
          <input type="email" class="share-email-field" data-account-id="${escapeHtml(acct.id)}"
                 placeholder="Gmail ของอีกคน">
          <button class="setting-seg-btn active"
                  data-action="add-share-email"
                  data-account-id="${escapeHtml(acct.id)}">เพิ่ม</button>
        </div>
      </div>`;

    return `
      <div class="card" style="margin-bottom:6px;overflow:hidden">
        <div class="setting-row">
          <div class="acct-icon ${acct.bank || acct.type}" style="width:36px;height:36px;font-size:10px;flex-shrink:0;margin-right:10px">${initial}</div>
          <div style="flex:1;min-width:0">
            <div class="setting-label" style="font-size:14px">
              ${escapeHtml(acct.display_name)}
              ${isShared ? '<span class="badge-shared">แชร์แล้ว</span>' : ''}
            </div>
            <div class="setting-sub">${typeLabel} · ${formatBaht(balance)} ฿</div>
            ${acct.type === 'cash' && acct.override_date ? `
            <div class="setting-sub" style="font-size:11px;margin-top:2px;display:flex;align-items:center;gap:4px">
              ยอดเริ่มต้น: ${formatBaht(acct.cash_balance_override)} ฿ (${formatShortDate(acct.override_date)})
              <button class="setting-action-btn"
                      style="font-size:11px;padding:2px 8px;margin-left:2px"
                      data-action="edit-cash-override"
                      data-account-id="${escapeHtml(acct.id)}">แก้ไข</button>
            </div>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;align-items:center">
            ${canShare ? `<button class="setting-seg-btn ${isShared ? 'active' : ''}"
                    data-action="toggle-share"
                    data-account-id="${escapeHtml(acct.id)}">แชร์บัญชีนี้</button>` : ''}
            <button class="acct-mgr-btn" data-action="edit-account" data-account-id="${escapeHtml(acct.id)}"
                    title="แก้ไข">${svgIcon('edit', { size: 15, stroke: 2 })}</button>
            <button class="acct-mgr-btn danger" data-action="delete-account" data-account-id="${escapeHtml(acct.id)}"
                    title="ลบ">${svgIcon('delete', { size: 15, stroke: 2 })}</button>
          </div>
        </div>
        ${sharePanel}
      </div>`;
  }).join('');

  // บัญชีที่รับแชร์มา — แสดงแยกด้านล่าง
  const receivedSection = sharedAccounts.length > 0 ? `
    <div style="margin-top:4px">
      <div style="padding:10px 2px 6px;font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:0.08em;font-weight:700">บัญชีที่ได้รับแชร์</div>
      ${sharedAccounts.map(acct => `
        <div class="card" style="margin-bottom:6px">
          <div class="setting-row">
            <div style="flex:1;min-width:0">
              <div class="setting-label">${escapeHtml(acct.display_name)}</div>
              <div class="setting-sub">${TYPE_LABEL[acct.type] || acct.type} · แชร์โดย ${escapeHtml(acct.owner)}</div>
            </div>
            <button class="setting-action-btn"
                    data-action="reject-shared-account"
                    data-account-id="${escapeHtml(acct.id)}">ปฏิเสธ</button>
          </div>
        </div>`).join('')}
    </div>` : '';

  // card ชื่อที่แสดงในรายการ (ย้ายมาจาก section "บัญชีแชร์")
  const displayNameCard = `
    <div class="card" style="margin-bottom:8px">
      <div class="setting-row" style="padding-bottom:6px">
        <div style="flex:1;min-width:0">
          <div class="setting-label">ชื่อที่แสดงในรายการ</div>
          <div class="setting-sub">ชื่อที่แสดงใน "เพิ่มโดย ..." ในบัญชีที่แชร์</div>
        </div>
      </div>
      <div style="padding: 0 0 10px">
        <input id="display-name-input" type="text"
          value="${escapeHtml(displayName)}"
          placeholder="ชื่อเล่น เช่น แม่, พ่อ, ปอ"
          maxlength="30"
          style="width:100%;padding:9px 12px;border:1px solid var(--rule);border-radius:8px;font-size:15px;background:var(--surface);color:var(--ink);box-sizing:border-box">
      </div>
    </div>`;

  return `
    <div class="settings-sub-row">
      <button class="section-action" data-action="add-account">+ เพิ่มบัญชี</button>
    </div>
    ${googleCard}
    ${displayNameCard}
    ${acctCards || '<div class="card"><div class="setting-sub" style="text-align:center;padding:12px">ยังไม่มีบัญชี</div></div>'}
    ${receivedSection}`;
}

/** แสดง dialog เลือกวิธีลบบัญชี */
function showDeleteAccountDialog(acct, settingsContainer) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="acct-modal">
      <div class="acct-modal-head">ลบบัญชี "${escapeHtml(acct.display_name)}"</div>
      <div class="acct-modal-body">
        <div class="setting-sub" style="margin-bottom:12px">เลือกวิธีการลบ:</div>
        <button id="del-txs-only" class="acct-type-btn" style="width:100%;text-align:left;padding:12px 14px;border-radius:10px;margin-bottom:8px;display:block">
          <div style="font-weight:600;font-size:14px">ลบเฉพาะรายการ</div>
          <div style="font-size:12px;color:var(--ink-soft);margin-top:2px">บัญชียังคงอยู่ แต่ประวัติรายการทั้งหมดจะถูกลบ</div>
        </button>
        <button id="del-acct-and-txs" class="acct-type-btn" style="width:100%;text-align:left;padding:12px 14px;border-radius:10px;display:block;border-color:var(--clay);color:var(--clay)">
          <div style="font-weight:600;font-size:14px">ลบบัญชีและรายการทั้งหมด</div>
          <div style="font-size:12px;color:var(--ink-soft);margin-top:2px">ลบบัญชีนี้ออกพร้อมรายการที่เกี่ยวข้องทั้งหมด</div>
        </button>
      </div>
      <div class="acct-modal-footer">
        <button class="cancel" id="del-cancel">ยกเลิก</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#del-txs-only').addEventListener('click', () => {
    if (!confirm(`ลบรายการทั้งหมดในบัญชี "${acct.display_name}"?\nบัญชีจะยังคงอยู่แต่ยอดจะเป็น 0`)) return;
    State.removeAccountTransactions(acct.id);
    document.body.removeChild(overlay);
    renderSettings(settingsContainer);
    showToast('ลบรายการทั้งหมดแล้ว');
  });

  overlay.querySelector('#del-acct-and-txs').addEventListener('click', () => {
    if (!confirm(`ลบบัญชี "${acct.display_name}" และรายการทั้งหมด?\nไม่สามารถกู้คืนได้`)) return;
    State.removeAccountWithTransactions(acct.id);
    document.body.removeChild(overlay);
    renderSettings(settingsContainer);
    showToast('ลบบัญชีและรายการแล้ว');
  });

  overlay.querySelector('#del-cancel').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });

  overlay.addEventListener('click', e => {
    if (e.target === overlay) document.body.removeChild(overlay);
  });
}

/** Modal เพิ่ม / แก้ไขบัญชี */
function showAccountModal(existingAcct, settingsContainer) {
  const isEdit = Boolean(existingAcct);
  const settings = State.getSettings();
  const TYPE_OPTIONS = [
    { value: 'cash',        label: 'เงินสด' },
    { value: 'bank',        label: 'เงินฝากธนาคาร' },
    { value: 'credit_card', label: 'บัตรเครดิต' },
    { value: 'ewallet',     label: 'กระเป๋าเงิน' },
    { value: 'investment',  label: 'การลงทุน' },
    { value: 'debt',        label: 'หนี้สิน' },
  ];

  const currentType = existingAcct?.type || 'bank';
  const currentBalance = existingAcct
    ? (existingAcct.current_balance / 100).toFixed(0)
    : '';
  // ประเภทที่มีเลขบัญชี (ใช้ detect inter-account transfer ใน PDF import)
  const HAS_ACCT_NUM = new Set(['bank', 'credit_card', 'ewallet']);
  const showAcctNum = HAS_ACCT_NUM.has(currentType);

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="acct-modal">
      <div class="acct-modal-head">${isEdit ? 'แก้ไขบัญชี' : 'เพิ่มบัญชีใหม่'}</div>
      <div class="acct-modal-body">
        <label class="acct-field-label">ชื่อบัญชี</label>
        <input class="acct-field-input" id="am-name" type="text"
               placeholder="เช่น บัญชีเงินเดือน"
               value="${escapeHtml(existingAcct?.display_name || '')}">

        <label class="acct-field-label">ประเภทบัญชี</label>
        <div class="acct-type-grid">
          ${TYPE_OPTIONS.map(t => `
            <button class="acct-type-btn ${currentType === t.value ? 'active' : ''}"
                    data-type="${t.value}">${t.label}</button>`).join('')}
        </div>

        <div id="am-acctnum-row" style="${showAcctNum ? '' : 'display:none'}">
          <label class="acct-field-label">เลขบัญชี <span style="font-weight:400;color:var(--ink-faint)">(ไม่บังคับ)</span></label>
          <input class="acct-field-input" id="am-acctnum" type="text"
                 inputmode="numeric" placeholder="เช่น 012-3-45678-9"
                 value="${escapeHtml(existingAcct?.account_number_user || '')}">
          <div class="acct-field-hint">ช่วยจับการโอนระหว่างบัญชีตัวเองจาก e-Statement — รองรับทุกรูปแบบ (มี/ไม่มีขีด)</div>
        </div>

        <label class="acct-field-label">ยอดเปิดบัญชี (฿)</label>
        <input class="acct-field-input" id="am-balance" type="number"
               inputmode="numeric" placeholder="0" value="${currentBalance}">
        <div class="acct-field-hint">ยอดตั้งต้นก่อนบันทึกรายการ (ถ้าไม่ใส่ = เริ่มที่ 0)</div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:14px;border-top:1px solid var(--rule)">
          <div>
            <div class="acct-field-label" style="margin-bottom:2px">ไม่นำยอดไปคำนวณสรุป</div>
            <div class="acct-field-hint" style="margin:0">รายการยังแสดงในหน้าบันทึก แต่ไม่นับใน dashboard และสถิติ</div>
          </div>
          <label class="toggle-switch" style="flex-shrink:0;margin-left:12px">
            <input type="checkbox" id="am-exclude" ${existingAcct?.exclude_from_summary ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
      <div class="acct-modal-footer">
        <button class="cancel" id="am-cancel">ยกเลิก</button>
        <button class="confirm" id="am-save">${isEdit ? 'บันทึก' : 'เพิ่มบัญชี'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  let selectedType = currentType;
  const acctNumRow = overlay.querySelector('#am-acctnum-row');
  overlay.querySelectorAll('.acct-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedType = btn.dataset.type;
      overlay.querySelectorAll('.acct-type-btn').forEach(b => b.classList.toggle('active', b === btn));
      acctNumRow.style.display = HAS_ACCT_NUM.has(selectedType) ? '' : 'none';
    });
  });

  overlay.querySelector('#am-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#am-save').addEventListener('click', () => {
    const name = overlay.querySelector('#am-name').value.trim();
    if (!name) { showToast('ใส่ชื่อบัญชีก่อน'); return; }

    const balRaw = overlay.querySelector('#am-balance').value;
    const balSatang = balRaw !== '' ? Math.round(Number(balRaw) * 100) : 0;
    const acctNumUser = (overlay.querySelector('#am-acctnum')?.value || '').trim();
    const excludeFromSummary = overlay.querySelector('#am-exclude').checked;

    if (isEdit) {
      State.updateAccount(existingAcct.id, {
        display_name: name,
        type: selectedType,
        current_balance: balSatang,
        account_number_user: acctNumUser,
        exclude_from_summary: excludeFromSummary,
        user_renamed: true
      });
      showToast('แก้ไขบัญชีแล้ว');
    } else {
      State.addAccount({
        display_name: name,
        type: selectedType,
        current_balance: balSatang,
        account_number_user: acctNumUser,
        exclude_from_summary: excludeFromSummary,
        user_renamed: true
      });
      showToast('เพิ่มบัญชีแล้ว');
    }

    overlay.remove();
    if (settingsContainer) renderSettings(settingsContainer);
  });
}


/** Render suggestion cards จาก detectRecurringPatterns */
function renderRecurringSuggestions() {
  if (getRecurSuggestions().length === 0) return '';
  const freqLabel = { monthly: 'ทุกเดือน', weekly: 'ทุกสัปดาห์' };

  return `
    <div class="settings-sub-label">ตรวจพบรายการประจำ · ${getRecurSuggestions().length} รายการ</div>
    <div class="card card-padded">
        ${getRecurSuggestions().map((s, i) => {
          const def = getCategory(s.group);
          const samples = s.sampleDates.map(d => formatShortDate(d)).join(', ');
          return `
            <div class="template-row" style="align-items:flex-start;gap:10px">
              <div class="entry-icon" style="background:${def.color};opacity:0.85;flex-shrink:0">
                ${svgIcon(def.icon, { size: 16, stroke: 2 })}
              </div>
              <div style="flex:1;min-width:0">
                <div class="entry-name">${escapeHtml(s.description)}</div>
                <div class="entry-cat">${freqLabel[s.frequency]} · ${formatBaht(s.amount)} ฿ · เจอ ${s.sampleDates.length}+ ครั้ง</div>
                <div class="entry-cat" style="opacity:0.6">${samples}</div>
              </div>
              <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">
                <button class="recur-suggest-add" data-idx="${i}"
                  style="font-size:12px;padding:4px 12px;border-radius:9999px;border:none;background:var(--primary);color:#fff;cursor:pointer;font-family:inherit">เพิ่ม</button>
                <button class="recur-suggest-skip" data-idx="${i}"
                  style="font-size:12px;padding:4px 12px;border-radius:9999px;border:1.5px solid var(--rule);background:transparent;color:var(--ink-faint);cursor:pointer;font-family:inherit">ข้าม</button>
              </div>
            </div>
          `;
        }).join('<hr style="margin:6px 0;border:none;border-top:1px solid var(--rule)">')}
      </div>
    </div>
  `;
}


/** Render section รายการประจำ + ผ่อน + ล่วงหน้า ใน Settings */
function renderRecurringSection() {
  const templates = Recurring.getActiveTemplates();
  const monthlyTotal = Recurring.getMonthlyRecurringTotal();

  const suggestionsHtml = renderRecurringSuggestions();

  if (templates.length === 0) {
    return `
      ${suggestionsHtml}
      <div class="card card-padded">
        ${renderEmptyState({
          icon:     'repeat',
          title:    'ยังไม่มีรายการประจำ',
          subtitle: 'กดปุ่ม + แล้วเลือก "ทุกเดือน" หรือ "ผ่อน" เพื่อตั้งค่ารายจ่ายที่เกิดซ้ำ',
          actions:  [{ label: '+ เพิ่มรายการประจำ', style: 'btn-primary', action: 'open-add' }],
        })}
      </div>
    `;
  }

  return `
    ${suggestionsHtml}
    <div class="card card-padded">
      ${templates.map(t => renderTemplateRow(t)).join('')}
    </div>
    ${(monthlyTotal.expense > 0 || monthlyTotal.income > 0) ? `
      <div class="card card-padded" style="margin-top: 8px; padding: 12px 18px;">
        <div class="recur-summary">
          <div>
            <div class="setting-sub">รายจ่ายประจำต่อเดือน</div>
            <div class="setting-label" style="color: var(--clay)">−${formatBaht(monthlyTotal.expense)} ฿</div>
          </div>
          ${monthlyTotal.income > 0 ? `
            <div>
              <div class="setting-sub">รายรับประจำต่อเดือน</div>
              <div class="setting-label" style="color: var(--sage)">+${formatBaht(monthlyTotal.income)} ฿</div>
            </div>
          ` : ''}
        </div>
      </div>
    ` : ''}
  `;
}

function renderTemplateRow(t) {
  const def = getCategory(t.group);
  const sign = t.type === 'income' ? '+' : '−';
  const amtClass = t.type === 'income' ? 'income' : '';

  // Frequency label
  const freqLabel = {
    'one-time':    'ครั้งเดียว',
    'monthly':     'ทุกเดือน',
    'weekly':      'ทุกสัปดาห์',
    'yearly':      'ทุกปี',
    'installment': `ผ่อน ${t.installment_paid}/${t.installment_total} งวด`
  }[t.frequency] || t.frequency;

  const nextLabel = t.next_due
    ? `ครั้งต่อไป ${formatShortDate(t.next_due)}`
    : '—';

  return `
    <div class="template-row" data-tmpl-id="${t.id}">
      <div class="entry-icon" style="background: ${def.color}; opacity: 0.85">
        ${svgIcon(def.icon, { size: 16, stroke: 2 })}
      </div>
      <div class="template-body">
        <div class="entry-name">${escapeHtml(t.description || def.label)}${t._sample ? ' <span class="demo-tag">Demo</span>' : ''}</div>
        <div class="entry-cat">${freqLabel} · ${nextLabel}</div>
      </div>
      <div>
        <div class="entry-amt ${amtClass}">${sign}${formatBaht(t.amount)} ฿</div>
        <button class="template-del" data-action="delete-template" data-tmpl-id="${t.id}" aria-label="ลบ">
          ${svgIcon('delete', { size: 14, stroke: 2 })}
        </button>
      </div>
    </div>
  `;
}
