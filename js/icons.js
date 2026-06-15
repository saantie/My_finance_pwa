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
  'book-open':    '<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>',

  // Extended icon set (สำหรับ category picker)
  home:           '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  car:            '<path d="M19 17H5M17 17h2a2 2 0 000-4h-2l-2-5H8L6 13H4a2 2 0 000 4h1"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  plane:          '<path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/>',
  train:          '<rect x="4" y="3" width="16" height="16" rx="2"/><path d="M9 7h6M9 11h6M4 19l4-3m8 3l-4-3"/>',
  bike:           '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
  music:          '<path d="M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM21 16a3 3 0 11-6 0 3 3 0 016 0z"/>',
  film:           '<rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>',
  headphones:     '<path d="M3 18v-6a9 9 0 0118 0v6M3 18a3 3 0 006 0v-3H3v3zM21 18a3 3 0 01-6 0v-3h6v3z"/>',
  tv:             '<rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/>',
  book:           '<path d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>',
  gift:           '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>',
  tag:            '<path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  briefcase:      '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2M12 12v4M10 14h4"/>',
  laptop:         '<path d="M20 16H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v8a2 2 0 01-2 2zM1 16h22"/>',
  phone:          '<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.01 1.18 2 2 0 012 0h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.18 6.18l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/>',
  'dollar-sign':  '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
  'credit-card':  '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  star:           '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  flag:           '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
  globe:          '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>',
  'map-pin':      '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>',
  sun:            '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  moon:           '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>',
  umbrella:       '<path d="M23 12a11.05 11.05 0 00-22 0zm-5 7a3 3 0 01-6 0v-7"/>',
  bell:           '<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>',
  key:            '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  wrench:         '<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>',
  scissors:       '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
  activity:       '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  leaf:           '<path d="M2 22c1 0 2.5-.5 5-2 4-2.5 4.5-5.5 5-9 1 1 2 4 2 5.5 3.5-3.5 4-9 3-13-3 1-8.5 4.5-9 11.5C7 20.5 5.5 21.5 2 22z"/>',
  flame:          '<path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 3z"/>',
  award:          '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>',
  'shopping-cart':'<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>',
  wine:           '<path d="M8 22h8M12 11v11M20 2H4l2 7a6 6 0 0012 0l2-7z"/>',
  navigation:     '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  target:         '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  bookmark:       '<path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>',
  dumbbell:       '<path d="M6.5 6.5h11M6.5 17.5h11M3 9h2v6H3zm16 0h2v6h-2zM6 7h2v10H6zm10 0h2v10h-2z"/>',
  package:        '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  baby:           '<path d="M12 2a5 5 0 110 10A5 5 0 0112 2zM4 22a8 8 0 0116 0"/>',
  droplets:       '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0014 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 01-11.91 4.97"/>'
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
  grocery:       { label: 'ของชำ',      color: '#6cc16c',          icon: 'shopping-cart', type: ['expense'] },
  coffee:        { label: 'กาแฟ',      color: 'var(--mocha)',     icon: 'coffee',   type: ['expense'] },
  transport:     { label: 'เดินทาง',    color: 'var(--dust-blue)', icon: 'bus',      type: ['expense'] },
  shopping:      { label: 'ช้อปปิ้ง',  color: 'var(--plum)',      icon: 'bag',      type: ['expense'] },
  beauty:        { label: 'ความงาม',    color: '#e06880',          icon: 'scissors', type: ['expense'] },
  utility:       { label: 'ค่าบ้าน',    color: 'var(--honey)',     icon: 'zap',      type: ['expense'] },
  rent:          { label: 'ค่าเช่า',    color: 'var(--mocha)',     icon: 'home',     type: ['expense'] },
  health:        { label: 'สุขภาพ',     color: 'var(--sage)',      icon: 'heart',    type: ['expense'] },
  fitness:       { label: 'ออกกำลังกาย', color: '#d96b5e',         icon: 'dumbbell', type: ['expense'] },
  education:     { label: 'การศึกษา',   color: '#4f7eb8',          icon: 'book',     type: ['expense'] },
  insurance:     { label: 'ประกัน',     color: '#1e3a72',          icon: 'umbrella', type: ['expense'] },
  entertainment: { label: 'บันเทิง',    color: 'var(--plum)',      icon: 'gamepad',  type: ['expense'] },
  travel:        { label: 'ท่องเที่ยว', color: '#8b6db5',          icon: 'plane',    type: ['expense'] },
  donation:      { label: 'บริจาค',     color: '#e8b649',          icon: 'gift',     type: ['expense'] },
  fee:           { label: 'ค่าธรรมเนียม', color: '#c89368',        icon: 'credit-card', type: ['expense'] },

  // รายรับ
  salary:        { label: 'เงินเดือน',  color: 'var(--sage)',      icon: 'cash',     type: ['income'] },
  freelance:     { label: 'งานเสริม',   color: '#6cc16c',          icon: 'briefcase', type: ['income'] },
  bonus:         { label: 'โบนัส',      color: 'var(--sage)',      icon: 'cash',     type: ['income'] },
  dividend:      { label: 'ดอกเบี้ย/ปันผล', color: '#6cc16c',     icon: 'dollar-sign', type: ['income'] },
  refund:        { label: 'คืนเงิน',    color: 'var(--sage)',      icon: 'cash',     type: ['income'] },

  // โอน
  transfer:      { label: 'โอนระหว่างบัญชี', color: 'var(--dust-blue)', icon: 'transfer', type: ['transfer'] },

  // อื่นๆ
  other:         { label: 'อื่นๆ',      color: 'var(--mocha)',     icon: 'circle',   type: ['expense', 'income'] }
};

/** ไอคอน 50 ตัวสำหรับ category picker */
export const ICON_PICKER_KEYS = [
  'utensils','coffee','bag','zap','heart','gamepad','bus','camera','mic','transfer',
  'home','car','plane','train','bike','music','film','headphones','tv','book',
  'gift','tag','briefcase','laptop','phone','dollar-sign','credit-card','star','flag','globe',
  'map-pin','sun','moon','umbrella','bell','key','wrench','scissors','activity','leaf',
  'flame','award','shopping-cart','wine','navigation','target','bookmark','dumbbell','package','baby'
];

/** 12 สีสำหรับ category icon */
export const COLOR_PALETTE = [
  '#e88563','#c89368','#5a9d63','#5e9bd6','#b378c0',
  '#e8b649','#d96b5e','#4f7eb8','#8b6db5','#6cc16c',
  '#e06880','#1e3a72'
];

/* === Custom category registry (ไม่ import state.js เพื่อป้องกัน circular) === */
let _customRegistry = [];

/** เรียกจาก app.js ทุกครั้งที่ customCategories เปลี่ยน */
export function setCustomCategoryRegistry(cats) {
  _customRegistry = Array.isArray(cats) ? cats : [];
}

/** คืน array ของ key ที่ filter ตาม type (รวม custom categories) */
export function categoriesByType(type) {
  const builtin = Object.entries(CATEGORIES)
    .filter(([_, def]) => def.type.includes(type))
    .map(([key, def]) => ({ key, ...def }));
  const custom = _customRegistry
    .filter(c => Array.isArray(c.type) ? c.type.includes(type) : c.type === type)
    .map(c => ({ key: c.id, label: c.label, color: c.color, icon: c.icon, type: c.type, custom: true }));
  return [...builtin, ...custom];
}

/** ดึง category ปลอดภัย (fallback = other) — รองรับ custom category ID */
export function getCategory(key) {
  if (CATEGORIES[key]) return CATEGORIES[key];
  const custom = _customRegistry.find(c => c.id === key);
  if (custom) return { label: custom.label, color: custom.color, icon: custom.icon, type: custom.type };
  return CATEGORIES.other;
}
