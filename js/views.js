/* ===================================================================
   views.js — barrel re-export ของ view clusters (Phase B split เสร็จสมบูรณ์)
   ===================================================================
   โค้ดจริงอยู่ใน views-{dashboard,list,import,settings,shared}.js
   ไฟล์นี้คงไว้เพื่อให้ app.js + add.js import จากที่เดิมได้ (ไม่ต้องแก้ผู้เรียก)
   =================================================================== */

export { renderDashboard, renderDashboardSkeleton } from './views-dashboard.js';
export { renderList } from './views-list.js';
export { renderImport } from './views-import.js';
export { renderSettings, setSettingsOpenSection } from './views-settings.js';
export {
  showToast, showCoinToast, escapeHtml, renderEmptyState,
  applyTheme, applyTextSize, applyDark,
  bindEntryActions, openCategoryManager
} from './views-shared.js';
