/* ===================================================================
   onboarding.js — First-run 3-screen overlay
   ===================================================================
   Screen 1: Privacy promise   — ข้อมูลอยู่ในเครื่อง, ไม่มี server
   Screen 2: Import PDF         — นำเข้าข้อมูลจาก PDF หรือ ข้ามก่อน
   Screen 3: Aha moment         — insight จากข้อมูลจริง (หรือ generic ถ้าข้าม)

   วิธีใช้:
     import { shouldShowOnboarding, showOnboarding } from './onboarding.js';
     if (shouldShowOnboarding()) showOnboarding(() => { /* onComplete * / });

   เงื่อนไขแสดง:
     - ไม่เคยผ่าน onboarding (onboarding_done ไม่มีใน localStorage)
     - ไม่มีข้อมูล transactions เดิม (fresh install)
   =================================================================== */

import { svgIcon } from './icons.js';
import { formatBaht } from './utils.js';
import * as State from './state.js';

const DONE_KEY = 'onboarding_done';


/* === Public API ================================================= */

/** ควรแสดง onboarding ไหม? */
export function shouldShowOnboarding() {
  return (
    !localStorage.getItem(DONE_KEY) &&
    State.getTransactions().length === 0
  );
}

/** แสดง onboarding overlay — เรียก onComplete เมื่อเสร็จ */
export function showOnboarding(onComplete) {
  const overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 9000;
    background: var(--paper, #fdfaf6);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `;
  document.body.appendChild(overlay);

  // ป้องกัน scroll body ข้างหลัง
  document.body.style.overflow = 'hidden';

  function finish() {
    localStorage.setItem(DONE_KEY, '1');
    document.body.style.overflow = '';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
      overlay.remove();
      onComplete();
    }, 300);
  }

  function goToScreen(n, importedCount) {
    overlay.innerHTML = '';
    if (n === 1) renderScreen1(overlay, () => goToScreen(2, 0));
    else if (n === 2) renderScreen2(overlay, (count) => goToScreen(3, count), finish);
    else if (n === 3) renderScreen3(overlay, importedCount, finish);
  }

  goToScreen(1, 0);
}


/* === Screen 1: Privacy ========================================= */

function renderScreen1(container, onNext) {
  container.innerHTML = `
    <div style="
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 32px;
      text-align: center;
      gap: 0;
    ">
      <!-- Progress dots -->
      ${progressDots(1)}

      <!-- Shield icon -->
      <div style="
        width: 88px; height: 88px;
        border-radius: 24px;
        background: linear-gradient(135deg, #e88e3c, #f5a623);
        display: flex; align-items: center; justify-content: center;
        margin: 0 auto 28px;
        box-shadow: 0 8px 24px rgba(232,142,60,0.3);
      ">
        ${svgIcon('shield', { size: 44, stroke: 1.8 })}
      </div>

      <h1 style="
        font-size: 26px;
        font-weight: 800;
        color: var(--ink, #2d3748);
        margin: 0 0 12px;
        line-height: 1.2;
      ">ข้อมูลทั้งหมด<br>อยู่ในเครื่องนี้</h1>

      <p style="
        font-size: 16px;
        color: var(--ink-faint, #718096);
        margin: 0 0 32px;
        line-height: 1.6;
      ">ไม่มี server · ไม่มีโฆษณา<br>ไม่เก็บข้อมูลของคุณ</p>

      <!-- Privacy promises -->
      <div style="
        width: 100%;
        max-width: 320px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 40px;
      ">
        ${privacyRow('shield', 'PDF ประมวลผลในเครื่อง', 'ไม่ส่งข้อมูลออกนอก browser')}
        ${privacyRow('check', 'เก็บใน localStorage', 'ไม่มีบัญชี · ไม่ต้องสมัคร')}
        ${privacyRow('close', 'ไม่มี analytics ติดตาม', 'พฤติกรรมการเงินเป็นของคุณ')}
      </div>

      <!-- CTA -->
      <button id="ob-next-1" style="
        width: 100%;
        max-width: 320px;
        padding: 16px;
        background: linear-gradient(135deg, #e88e3c, #f5a623);
        color: #fff;
        border: none;
        border-radius: 14px;
        font-size: 17px;
        font-weight: 700;
        font-family: inherit;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(232,142,60,0.35);
      ">เริ่มต้นใช้งาน →</button>
    </div>
  `;

  container.querySelector('#ob-next-1').addEventListener('click', onNext);
}

function privacyRow(icon, title, sub) {
  return `
    <div style="
      display: flex;
      align-items: center;
      gap: 12px;
      text-align: left;
      background: var(--surface, #fff);
      border-radius: 12px;
      padding: 12px 16px;
      border: 1px solid var(--rule, #efe5d4);
    ">
      <div style="
        width: 36px; height: 36px; flex-shrink: 0;
        border-radius: 10px;
        background: var(--accent-soft, #fef3e7);
        display: flex; align-items: center; justify-content: center;
        color: var(--primary, #e88e3c);
      ">${svgIcon(icon, { size: 18, stroke: 2 })}</div>
      <div>
        <div style="font-size: 14px; font-weight: 600; color: var(--ink, #2d3748);">${title}</div>
        <div style="font-size: 12px; color: var(--ink-faint, #718096); margin-top: 1px;">${sub}</div>
      </div>
    </div>
  `;
}


/* === Screen 2: Import PDF ======================================= */

function renderScreen2(container, onImported, onSkip) {
  let _parsing = false;

  container.innerHTML = `
    <div style="
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 32px;
      text-align: center;
    ">
      ${progressDots(2)}

      <!-- PDF icon -->
      <div style="
        width: 88px; height: 88px;
        border-radius: 24px;
        background: linear-gradient(135deg, #e88e3c, #f5a623);
        display: flex; align-items: center; justify-content: center;
        margin: 0 auto 24px;
        box-shadow: 0 8px 24px rgba(232,142,60,0.3);
      ">
        ${svgIcon('pdf', { size: 44, stroke: 1.5 })}
      </div>

      <h1 style="
        font-size: 24px;
        font-weight: 800;
        color: var(--ink, #2d3748);
        margin: 0 0 10px;
        line-height: 1.2;
      ">นำเข้า e-Statement<br>จากธนาคาร</h1>

      <p style="
        font-size: 15px;
        color: var(--ink-faint, #718096);
        margin: 0 0 10px;
        line-height: 1.6;
      ">ดาวน์โหลด PDF จากแอปธนาคาร<br>แล้วอัปโหลดที่นี่ — ระบบจัดการให้ทุกอย่าง</p>

      <!-- Supported banks -->
      <div style="
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: center;
        margin-bottom: 28px;
      ">
        ${['กรุงไทย', 'กสิกร', 'ไทยพาณิชย์', 'กรุงเทพ', 'กรุงศรี'].map(b => `
          <span style="
            font-size: 12px;
            font-weight: 600;
            padding: 4px 10px;
            border-radius: 20px;
            background: var(--accent-soft, #fef3e7);
            color: var(--primary, #e88e3c);
            border: 1px solid rgba(232,142,60,0.2);
          ">${b}</span>
        `).join('')}
        <span style="
          font-size: 12px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 20px;
          background: var(--surface, #fff);
          color: var(--ink-faint, #718096);
          border: 1px solid var(--rule, #efe5d4);
        ">+11 ธนาคาร</span>
      </div>

      <!-- Status area -->
      <div id="ob-status" style="
        min-height: 24px;
        font-size: 14px;
        color: var(--ink-faint, #718096);
        margin-bottom: 20px;
        text-align: center;
      "></div>

      <!-- Hidden file input -->
      <input type="file" id="ob-file-input" accept=".pdf,application/pdf" style="display:none">

      <!-- Upload button -->
      <button id="ob-upload-btn" style="
        width: 100%;
        max-width: 320px;
        padding: 16px;
        background: linear-gradient(135deg, #e88e3c, #f5a623);
        color: #fff;
        border: none;
        border-radius: 14px;
        font-size: 17px;
        font-weight: 700;
        font-family: inherit;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(232,142,60,0.35);
        margin-bottom: 14px;
      ">
        ${svgIcon('upload', { size: 18, stroke: 2 })}
        &nbsp; เลือกไฟล์ PDF
      </button>

      <!-- Skip link -->
      <button id="ob-skip-btn" style="
        background: none;
        border: none;
        color: var(--ink-faint, #718096);
        font-size: 14px;
        font-family: inherit;
        cursor: pointer;
        padding: 8px 16px;
        text-decoration: underline;
        text-underline-offset: 3px;
      ">ข้ามก่อน บันทึกเอง →</button>
    </div>
  `;

  const fileInput = container.querySelector('#ob-file-input');
  const uploadBtn = container.querySelector('#ob-upload-btn');
  const skipBtn   = container.querySelector('#ob-skip-btn');
  const status    = container.querySelector('#ob-status');

  uploadBtn.addEventListener('click', () => {
    if (!_parsing) fileInput.click();
  });

  skipBtn.addEventListener('click', () => {
    onSkip();  // ข้าม → finish onboarding ไปเลย (ไม่ผ่านหน้า 3)
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file || _parsing) return;
    _parsing = true;

    uploadBtn.disabled = true;
    uploadBtn.style.opacity = '0.6';
    status.textContent = 'กำลังอ่าน PDF...';

    try {
      // Lazy import parsers (เพื่อไม่โหลดตอน boot)
      const { parsePDF } = await import('./parsers.js');

      let password = null;
      let result = null;

      // ลอง parse — ถ้า password-protected จะ throw
      try {
        result = await parsePDF(file, null, (pct) => {
          status.textContent = `กำลังอ่าน PDF... ${pct}%`;
        });
      } catch (err) {
        if (err?.name === 'PasswordException' || err?.message?.includes('password')) {
          // ถาม password
          password = window.prompt('PDF นี้มีรหัสผ่าน กรุณาใส่รหัส:');
          if (!password) {
            status.textContent = 'ยกเลิก — ลองใหม่หรือข้ามก่อน';
            _parsing = false;
            uploadBtn.disabled = false;
            uploadBtn.style.opacity = '1';
            return;
          }
          result = await parsePDF(file, password, (pct) => {
            status.textContent = `กำลังอ่าน PDF... ${pct}%`;
          });
        } else {
          throw err;
        }
      }

      const txs = result?.transactions ?? [];
      if (txs.length === 0) {
        status.innerHTML = '<span style="color:#d96b5e">อ่านไม่พบรายการ — ลองไฟล์อื่นหรือข้ามก่อน</span>';
        _parsing = false;
        uploadBtn.disabled = false;
        uploadBtn.style.opacity = '1';
        return;
      }

      // Import accounts ด้วย
      if (result.accounts?.length > 0) {
        result.accounts.forEach(acct => {
          if (!State.getAccount(acct.id)) State.addAccount(acct);
        });
      }

      // Batch import
      State.addTransactionsBatch(txs);
      status.innerHTML = `<span style="color:#5a9d63">✓ นำเข้า ${txs.length} รายการแล้ว</span>`;

      // รอให้ user เห็น status แล้วไปหน้า 3
      setTimeout(() => onImported(txs.length), 900);

    } catch (err) {
      console.error('[onboarding] parsePDF error', err);
      status.innerHTML = '<span style="color:#d96b5e">อ่านไฟล์ไม่สำเร็จ — ลองใหม่หรือข้ามก่อน</span>';
      _parsing = false;
      uploadBtn.disabled = false;
      uploadBtn.style.opacity = '1';
    }
  });
}


/* === Screen 3: Aha Moment ====================================== */

function renderScreen3(container, importedCount, onFinish) {
  // คำนวณ insights จากข้อมูลจริง
  const txs   = State.getTransactions();
  const month = new Date().toISOString().slice(0, 7);
  const sum   = State.getMonthSummary(month);

  const net     = sum.income - sum.expense;
  const netText = net >= 0
    ? `+${formatBaht(net)} ฿`
    : `${formatBaht(net)} ฿`;
  const netColor = net >= 0 ? '#5a9d63' : '#d96b5e';

  // Top category
  const catMap = {};
  txs.filter(t => t.type === 'expense' && t.date.startsWith(month)).forEach(t => {
    catMap[t.group] = (catMap[t.group] || 0) + t.amount;
  });
  const topCatEntry = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];

  const hasRealData = importedCount > 0 && sum.expense > 0;

  container.innerHTML = `
    <div style="
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 32px;
      text-align: center;
    ">
      ${progressDots(3)}

      <!-- Hero insight -->
      <div style="
        width: 100%;
        max-width: 320px;
        background: linear-gradient(135deg, #e88e3c22, #f5a62311);
        border: 1.5px solid rgba(232,142,60,0.2);
        border-radius: 20px;
        padding: 28px 24px;
        margin-bottom: 28px;
      ">
        ${hasRealData ? `
          <div style="font-size: 14px; color: var(--ink-faint, #718096); margin-bottom: 6px;">เดือนนี้คุณ${net >= 0 ? 'เหลือ' : 'ขาด'}</div>
          <div style="font-size: 40px; font-weight: 800; color: ${netColor}; line-height: 1.1; margin-bottom: 4px;">${netText}</div>
          <div style="font-size: 13px; color: var(--ink-faint, #718096);">จาก ${importedCount} รายการที่นำเข้า</div>
          ${topCatEntry ? `
            <div style="
              margin-top: 16px;
              padding-top: 16px;
              border-top: 1px solid rgba(232,142,60,0.15);
              font-size: 13px;
              color: var(--ink-faint, #718096);
            ">
              รายจ่ายสูงสุด:
              <span style="font-weight: 700; color: var(--ink, #2d3748);">${formatBaht(topCatEntry[1])} ฿</span>
            </div>
          ` : ''}
        ` : `
          <div style="font-size: 18px; margin-bottom: 8px;">🎉</div>
          <div style="font-size: 17px; font-weight: 700; color: var(--ink, #2d3748); margin-bottom: 6px;">พร้อมแล้ว!</div>
          <div style="font-size: 14px; color: var(--ink-faint, #718096); line-height: 1.5;">
            กดปุ่ม + เพื่อบันทึกรายการแรก<br>
            หรือ นำเข้า PDF จากธนาคาร<br>
            เพื่อดูภาพรวมการเงิน
          </div>
        `}
      </div>

      <h2 style="
        font-size: 22px;
        font-weight: 800;
        color: var(--ink, #2d3748);
        margin: 0 0 10px;
      ">${hasRealData ? 'เห็นแล้วใช่ไหม?' : 'เริ่มต้นได้เลย'}</h2>

      <p style="
        font-size: 15px;
        color: var(--ink-faint, #718096);
        margin: 0 0 36px;
        line-height: 1.6;
      ">${hasRealData
        ? 'ข้อมูลทั้งหมดอยู่ในเครื่องของคุณ<br>ปลอดภัย · ใช้ได้ออฟไลน์'
        : 'บันทึกรายการแรกได้เลย<br>ไม่ต้องสมัคร · ใช้ได้ทันที'
      }</p>

      <button id="ob-finish-btn" style="
        width: 100%;
        max-width: 320px;
        padding: 16px;
        background: linear-gradient(135deg, #e88e3c, #f5a623);
        color: #fff;
        border: none;
        border-radius: 14px;
        font-size: 17px;
        font-weight: 700;
        font-family: inherit;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(232,142,60,0.35);
      ">ไปหน้าหลัก →</button>
    </div>
  `;

  container.querySelector('#ob-finish-btn').addEventListener('click', onFinish);
}


/* === Helper: progress dots ====================================== */

function progressDots(active) {
  return `
    <div style="
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-bottom: 32px;
    ">
      ${[1, 2, 3].map(n => `
        <div style="
          width: ${n === active ? '24px' : '8px'};
          height: 8px;
          border-radius: 4px;
          background: ${n === active
            ? 'var(--primary, #e88e3c)'
            : 'var(--rule, #efe5d4)'};
          transition: width 0.3s ease, background 0.3s ease;
        "></div>
      `).join('')}
    </div>
  `;
}
