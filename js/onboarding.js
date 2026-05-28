/* ===================================================================
   onboarding.js — First-run single-page intro
   ===================================================================
   แสดงครั้งเดียวเมื่อ fresh install (ไม่มี transaction + ยังไม่ผ่าน onboarding)
   แสดง feature list ที่แก้ pain point หลัก แล้วกด "เริ่มเลย" → เข้าแอปทันที
   =================================================================== */

import { svgIcon } from './icons.js';
import * as State from './state.js';

const DONE_KEY = 'onboarding_done';


/* === Public API ================================================= */

export function shouldShowOnboarding() {
  return (
    !localStorage.getItem(DONE_KEY) &&
    State.getTransactions().length === 0
  );
}

export function showOnboarding(onComplete) {
  const overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9000;
    background:var(--paper,#fdfaf6);
    display:flex;flex-direction:column;
    overflow-y:auto;-webkit-overflow-scrolling:touch;
    opacity:0;transition:opacity 0.22s ease;
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  overlay.innerHTML = `
    <div style="
      flex:1;display:flex;flex-direction:column;align-items:center;
      padding:52px 26px calc(env(safe-area-inset-bottom, 0px) + 64px);
      width:100%;max-width:480px;margin:0 auto;box-sizing:border-box;
    ">

      <!-- App icon -->
      <img src="./icons/icon.svg" alt="บันทึกการเงิน"
        style="width:80px;height:80px;border-radius:22px;margin-bottom:22px;
          box-shadow:0 8px 28px rgba(80,60,30,.18);">

      <!-- Heading -->
      <h1 style="
        font-size:26px;font-weight:800;
        color:var(--ink,#2d3748);
        margin:0 0 8px;line-height:1.25;text-align:center;
      ">บันทึกการเงิน<br>ที่เข้าใจคนไทย</h1>

      <p style="
        font-size:14px;color:var(--ink-faint,#718096);
        margin:0 0 30px;line-height:1.6;text-align:center;
      ">ช่วยให้การจดรายรับรายจ่ายเป็นเรื่องง่าย</p>

      <!-- Feature rows -->
      <div style="width:100%;display:flex;flex-direction:column;gap:9px;margin-bottom:32px;">

        ${row('pdf',
          'นำเข้า e-Statement จากธนาคารได้เลย',
          'อ่านทุกรายการทั้งเดือนอัตโนมัติ — ไม่ต้องพิมพ์เอง',
          '#e88e3c')}

        ${row('mic',
          'พูดบันทึกด้วยเสียงภาษาไทย',
          '"ค่าข้าว 50 บาท" — แอปเข้าใจและบันทึกให้ทันที',
          '#5e9bd6')}

        ${row('shield',
          'ข้อมูลอยู่ในอุปกรณ์ของคุณ',
          'ข้อมูลไม่ขึ้นเซิร์ฟเวอร์ หากไม่เลือกแชร์บัญชีกับครอบครัว',
          '#5a9d63')}

        ${row('users',
          'แชร์บัญชีกับครอบครัวหรือหวานใจ',
          'เลือกแชร์บัญชีออมหรือบัญชีไหนก็ได้กับผู้ใช้คนอื่น',
          '#8b6db5')}

        ${row('upload',
          'สำรองและกู้คืนข้อมูลได้เอง',
          'จะเลือกบันทึกในอุปกรณ์หรือ Google Drive ก็ได้',
          '#c89368')}

      </div>

      <!-- CTA -->
      <button id="ob-start" style="
        width:100%;padding:16px;
        background:linear-gradient(135deg,#e88e3c,#f5a623);
        color:#fff;border:none;border-radius:14px;
        font-size:17px;font-weight:700;font-family:inherit;
        cursor:pointer;
        box-shadow:0 4px 18px rgba(232,142,60,0.38);
        letter-spacing:0.2px;
      ">เริ่มใช้งานเลย →</button>

    </div>
  `;

  overlay.querySelector('#ob-start').addEventListener('click', () => {
    localStorage.setItem(DONE_KEY, '1');
    document.body.style.overflow = '';
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.remove(); onComplete(); }, 280);
  });

  /* Fade in */
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });
}


/* === Shared helper ============================================== */

function row(icon, title, sub, accent = '#e88e3c') {
  return `
    <div style="
      display:flex;align-items:center;gap:13px;
      background:var(--surface,#fff);
      border:1px solid var(--rule,#efe5d4);
      border-radius:13px;padding:13px 15px;
      text-align:left;
    ">
      <div style="
        width:40px;height:40px;flex-shrink:0;
        border-radius:11px;
        background:${accent}1a;
        display:flex;align-items:center;justify-content:center;
        color:${accent};
      ">
        ${svgIcon(icon, { size: 19, stroke: 2 })}
      </div>
      <div style="min-width:0;">
        <div style="font-size:14px;font-weight:700;color:var(--ink,#2d3748);
          margin-bottom:2px;">${title}</div>
        <div style="font-size:12px;color:var(--ink-faint,#718096);
          line-height:1.45;">${sub}</div>
      </div>
    </div>`;
}
