/* ===================================================================
   icons.js — SVG icons + category mapping
   ===================================================================
   เก็บเป็น string template เพื่อ inline ใน HTML
   - ICONS: SVG path สำหรับใช้ทั่วไป (Lucide style)
   - CATEGORIES: ข้อมูลแต่ละหมวด (label, color, icon)
   =================================================================== */


/* SVG icon paths — ใช้ใน svgIcon() ด้านล่าง */
const ICONS = {
  // อาหาร
  utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2M7 2v20M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>',
  coffee:   '<path d="M17 8h1a4 4 0 010 8h-1M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3"/>',
  // เดินทาง
  bus:      '<path d="M8 6v6M16 6v6M2 12h19.6M18 18h2v-7.7L17.7 4 13 4H6L2 5.6V18h2M16 18H8m8 0h2m-10 0H6"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  // ช้อปปิ้ง
  bag:      '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/>',
  // ค่าใช้จ่ายบ้าน (utility)
  zap:      '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  // สุขภาพ
  heart:    '<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>',
  // บันเทิง
  gamepad:  '<line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><path d="M17.32 5H6.68a4 4 0 00-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 003 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 019.828 16h4.344a2 2 0 011.414.586L17 18c.5.5 1 1 2 1a3 3 0 003-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0017.32 5z"/>',
  // เงินเดือน / รายรับ
  cash:     '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  // โอน
  transfer: '<path d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3"/>',
  // อื่นๆ
  circle:   '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',

  // System icons
  pdf:      '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M9 14h6M9 18h4M9 10h2"/>',
  camera:   '<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>',
  search:   '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  filter:   '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  plus:     '<path d="M12 5v14M5 12h14" stroke-linecap="round"/>',
  close:    '<path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/>',
  back:     '<path d="M15 18l-6-6 6-6"/>',
  chevron:  '<path d="M9 18l6-6-6-6"/>',
  check:    '<path d="M5 12l5 5L20 7"/>',
  delete:   '<path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>',
  download: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload:   '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  shield:   '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  alert:    '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  trending: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  bksp:     '<path d="M21 4H8L1 12l7 8h13a2 2 0 002-2V6a2 2 0 00-2-2zM18 9l-6 6M12 9l6 6"/>',
  mic:      '<path d="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3z"/><path d="M19 10v1a7 7 0 01-14 0v-1M12 18v4M8 22h8"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  repeat:   '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>',
  clock:    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  edit:     '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  share:    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  users:    '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
  mail:          '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  'cloud-upload': '<polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>',
  'cloud-download':'<polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>',
  'book-open':    '<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>'
};


/**
 * Render SVG icon string
 * @param {string} name — key ใน ICONS
 * @param {object} opts — { size, stroke, class }
 */
export function svgIcon(name, opts = {}) {
  const { size, stroke = 1.8, className = '' } = opts;
  const path = ICONS[name];
  if (!path) return '';
  const sizeAttr = size ? `width="${size}" height="${size}"` : '';
  return `<svg ${sizeAttr} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"${className ? ` class="${className}"` : ''}>${path}</svg>`;
}


/* ===================================================================
   CATEGORIES — definition ของแต่ละหมวด
   ===================================================================
   key ใช้เป็น tx.group ใน data
   - label: ภาษาไทยที่ user เห็น
   - color: CSS variable name
   - icon: ใช้กับ svgIcon()
   - type: หมวดนี้สำหรับรายจ่าย/รายรับ/ทั้งคู่
   =================================================================== */
export const CATEGORIES = {
  // รายจ่าย
  food:          { label: 'อาหาร',     color: 'var(--clay)',      icon: 'utensils', type: ['expense'] },
  coffee:        { label: 'กาแฟ',      color: 'var(--mocha)',     icon: 'coffee',   type: ['expense'] },
  transport:     { label: 'เดินทาง',    color: 'var(--dust-blue)', icon: 'bus',      type: ['expense'] },
  shopping:      { label: 'ช้อปปิ้ง',  color: 'var(--plum)',      icon: 'bag',      type: ['expense'] },
  utility:       { label: 'ค่าบ้าน',    color: 'var(--honey)',     icon: 'zap',      type: ['expense'] },
  health:        { label: 'สุขภาพ',     color: 'var(--sage)',      icon: 'heart',    type: ['expense'] },
  entertainment: { label: 'บันเทิง',    color: 'var(--plum)',      icon: 'gamepad',  type: ['expense'] },
  rent:          { label: 'ค่าเช่า',    color: 'var(--mocha)',     icon: 'zap',      type: ['expense'] },

  // รายรับ
  salary:        { label: 'เงินเดือน',  color: 'var(--sage)',      icon: 'cash',     type: ['income'] },
  bonus:         { label: 'โบนัส',      color: 'var(--sage)',      icon: 'cash',     type: ['income'] },
  refund:        { label: 'คืนเงิน',    color: 'var(--sage)',      icon: 'cash',     type: ['income'] },

  // โอน
  transfer:      { label: 'โอนระหว่างบัญชี', color: 'var(--dust-blue)', icon: 'transfer', type: ['transfer'] },

  // อื่นๆ
  other:         { label: 'อื่นๆ',      color: 'var(--mocha)',     icon: 'circle',   type: ['expense', 'income'] }
};

/** คืน array ของ key ที่ filter ตาม type */
export function categoriesByType(type) {
  return Object.entries(CATEGORIES)
    .filter(([_, def]) => def.type.includes(type))
    .map(([key, def]) => ({ key, ...def }));
}

/** ดึง category ปลอดภัย (fallback = other) */
export function getCategory(key) {
  return CATEGORIES[key] || CATEGORIES.other;
}
