/* ===================================================================
   onboarding.js — First-run overlay
   ===================================================================
   Flow (PDF imported):  Screen1 → Screen2 → Screen3 (aha) → Screen4 (cash)
   Flow (skipped):       Screen1 → Screen2 → skip-notice → done

   เงื่อนไขแสดง:
   - ไม่เคยผ่าน onboarding (onboarding_done ไม่มีใน localStorage)
   - ไม่มีข้อมูล transactions เดิม (fresh install)
   =================================================================== */

import { svgIcon } from './icons.js';
import { formatBaht, todayISO } from './utils.js';
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
    position: fixed; inset: 0; z-index: 9000;
    background: var(--paper, #fdfaf6);
    display: flex; flex-direction: column; overflow: hidden;
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  function finish() {
    localStorage.setItem(DONE_KEY, '1');
    document.body.style.overflow = '';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease';
    setTimeout(() => { overlay.remove(); onComplete(); }, 300);
  }

  function go(screen, ctx = {}) {
    overlay.innerHTML = '';
    // fade-in
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.18s ease';
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
    switch (screen) {
      case 1: renderScreen1(overlay, () => go(2)); break;
      case 2: renderScreen2(overlay,
                (count) => go(3, { importedCount: count }),
                () => renderSkipNotice(overlay, finish)
              ); break;
      case 3: renderScreen3(overlay, ctx.importedCount ?? 0,
                () => go(4)
              ); break;
      case 4: renderScreen4(overlay, finish); break;
    }
  }

  go(1);
}


/* === Screen 1: Privacy ========================================= */

function renderScreen1(container, onNext) {
  container.innerHTML = wrapScreen(`
    ${dots(1, 4)}

    <div style="${iconBox('135deg, #e88e3c, #f5a623')}">
      ${svgIcon('shield', { size: 44, stroke: 1.8 })}
    </div>

    <h1 style="${H1}">ข้อมูลของคุณ<br>อยู่ในเครื่องเท่านั้น</h1>
    <p style="${SUB}">ไม่มีเซิร์ฟเวอร์ ไม่มีโฆษณา<br>ไม่มีใครเห็นข้อมูลการเงินของคุณ</p>

    <div style="width:100%;max-width:320px;display:flex;flex-direction:column;gap:12px;margin-bottom:36px;">
      ${privacyRow('shield', 'อ่าน PDF ในเครื่องทั้งหมด', 'ไม่มีการส่งข้อมูลออกไปที่ไหน')}
      ${privacyRow('check',  'ไม่ต้องสมัครสมาชิก', 'เปิดใช้ได้ทันที ไม่มีเงื่อนไข')}
      ${privacyRow('close',  'ไม่มีการติดตามพฤติกรรม', 'ข้อมูลการเงินคือเรื่องส่วนตัว')}
    </div>

    <button id="ob-next-1" style="${BTN_PRIMARY}">เริ่มใช้งาน →</button>
  `);
  container.querySelector('#ob-next-1').addEventListener('click', onNext);
}

function privacyRow(icon, title, sub) {
  return `
    <div style="display:flex;align-items:center;gap:12px;text-align:left;
      background:var(--surface,#fff);border-radius:12px;padding:12px 16px;
      border:1px solid var(--rule,#efe5d4);">
      <div style="width:36px;height:36px;flex-shrink:0;border-radius:10px;
        background:var(--accent-soft,#fef3e7);display:flex;align-items:center;
        justify-content:center;color:var(--primary,#e88e3c);">
        ${svgIcon(icon, { size: 18, stroke: 2 })}
      </div>
      <div>
        <div style="font-size:14px;font-weight:600;color:var(--ink,#2d3748);">${title}</div>
        <div style="font-size:12px;color:var(--ink-faint,#718096);margin-top:1px;">${sub}</div>
      </div>
    </div>`;
}


/* === Screen 2: Import PDF ======================================= */

function renderScreen2(container, onImported, onSkip) {
  let _file    = null;
  let _parsing = false;

  // ---- Initial HTML (ไม่มี password panel — สร้าง dynamic เมื่อเกิด error) ----
  container.innerHTML = wrapScreen(`
    ${dots(2, 4)}

    <div style="${iconBox('135deg, #e88e3c, #f5a623')}">
      ${svgIcon('pdf', { size: 44, stroke: 1.5 })}
    </div>

    <h1 style="${H1}">นำเข้าสเตทเมนต์<br>จากธนาคาร</h1>
    <p style="${SUB}">ดาวน์โหลด PDF จากแอปธนาคาร<br>แล้วเลือกไฟล์ที่นี่ — ระบบอ่านและจัดหมวดหมู่ให้เลย</p>

    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:24px;">
      ${['กรุงไทย','กสิกร','ไทยพาณิชย์','กรุงเทพ','กรุงศรี'].map(b => `
        <span style="font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;
          background:var(--accent-soft,#fef3e7);color:var(--primary,#e88e3c);
          border:1px solid rgba(232,142,60,0.2);">${b}</span>
      `).join('')}
      <span style="font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;
        background:var(--surface,#fff);color:var(--ink-faint,#718096);
        border:1px solid var(--rule,#efe5d4);">+11 ธนาคาร</span>
    </div>

    <div id="ob-status" style="min-height:22px;font-size:14px;color:var(--ink-faint,#718096);
      margin-bottom:16px;text-align:center;"></div>

    <input type="file" id="ob-file-input" accept=".pdf,application/pdf" style="display:none">

    <button id="ob-upload-btn" style="${BTN_PRIMARY};margin-bottom:14px;">
      ${svgIcon('upload', { size: 18, stroke: 2 })} &nbsp; เลือกไฟล์ PDF
    </button>

    <button id="ob-skip-btn" style="background:none;border:none;
      color:var(--ink-faint,#718096);font-size:14px;font-family:inherit;
      cursor:pointer;padding:8px 16px;text-decoration:underline;text-underline-offset:3px;">
      ข้ามก่อน บันทึกด้วยตัวเอง →
    </button>
  `);

  const fileInput = container.querySelector('#ob-file-input');
  const uploadBtn = container.querySelector('#ob-upload-btn');

  uploadBtn.addEventListener('click', () => { if (!_parsing) fileInput.click(); });
  container.querySelector('#ob-skip-btn').addEventListener('click', onSkip);
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file || _parsing) return;
    _file = file;
    removePwPanel();
    doParse();
  });

  // ---- Helpers ----

  function setStatus(html, color = '') {
    const el = container.querySelector('#ob-status');
    if (el) el.innerHTML = color ? `<span style="color:${color}">${html}</span>` : html;
  }

  function setUploadEnabled(on) {
    uploadBtn.disabled = !on;
    uploadBtn.style.opacity = on ? '1' : '0.6';
  }

  function removePwPanel() {
    container.querySelector('#ob-pw-panel')?.remove();
  }

  /** สร้าง password panel — input + ปลดล็อค เท่านั้น (ไม่มีปุ่มอื่น) */
  function showPwPanel() {
    removePwPanel();

    const panel = document.createElement('div');
    panel.id = 'ob-pw-panel';
    panel.style.cssText = [
      'width:100%', 'max-width:320px',
      'background:var(--surface,#fff)',
      'border:1.5px solid var(--rule,#efe5d4)',
      'border-radius:14px', 'padding:16px', 'margin-bottom:16px',
      'text-align:left', 'box-sizing:border-box'
    ].join(';');

    panel.innerHTML = `
      <div style="font-size:14px;font-weight:600;color:var(--ink,#2d3748);margin-bottom:10px;
        display:flex;align-items:center;gap:6px;">
        ${svgIcon('alert', { size: 14, stroke: 2 })} PDF นี้มีรหัสผ่าน
      </div>
      <input id="ob-pw-input" type="password" placeholder="ใส่รหัสผ่าน PDF..."
        autocomplete="off" style="width:100%;padding:10px 14px;
        border:1.5px solid var(--rule,#efe5d4);border-radius:10px;
        font-size:15px;font-family:inherit;background:var(--paper,#fdfaf6);
        color:var(--ink,#2d3748);box-sizing:border-box;outline:none;margin-bottom:10px;">
      <button id="ob-pw-ok" style="width:100%;padding:11px;
        background:linear-gradient(135deg,#e88e3c,#f5a623);
        color:#fff;border:none;border-radius:10px;font-size:14px;
        font-weight:700;font-family:inherit;cursor:pointer;">ปลดล็อค</button>`;

    uploadBtn.parentNode.insertBefore(panel, uploadBtn);

    function tryPassword() {
      const pw = panel.querySelector('#ob-pw-input')?.value?.trim();
      if (!pw) { setStatus('กรุณาใส่รหัสผ่าน', '#d96b5e'); return; }
      setStatus('กำลังตรวจสอบ...');
      _parsing = false;
      doParse(pw);
    }

    panel.querySelector('#ob-pw-ok').addEventListener('click', tryPassword);
    panel.querySelector('#ob-pw-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tryPassword();
    });

    setTimeout(() => panel.querySelector('#ob-pw-input')?.focus(), 50);
  }

  // ---- Parse logic ----

  async function doParse(password = null) {
    if (_parsing) return;
    _parsing = true;
    setUploadEnabled(false);
    setStatus('กำลังอ่าน PDF...');

    try {
      const { parsePDF } = await import('./parsers.js');
      const result = await parsePDF(_file, password, (pct) => {
        setStatus(`กำลังอ่าน PDF... ${pct}%`);
      });

      const txs = result?.transactions ?? [];
      if (txs.length === 0) {
        setStatus('อ่านไม่พบรายการ — ลองไฟล์อื่นหรือข้ามก่อน', '#d96b5e');
        _parsing = false;
        setUploadEnabled(true);
        return;
      }

      if (result.accounts?.length > 0) {
        result.accounts.forEach(acct => {
          if (!State.getAccount(acct.id)) State.addAccount(acct);
        });
      }
      State.addTransactionsBatch(txs);
      removePwPanel();
      setStatus(`✓ นำเข้า ${txs.length} รายการแล้ว`, '#5a9d63');
      setTimeout(() => onImported(txs.length), 900);

    } catch (err) {
      _parsing = false;
      if (isPasswordError(err)) {
        if (password != null) {
          // รหัสผ่านผิด → แจ้งแล้วรีเซ็ตกลับหน้าเลือกไฟล์
          setStatus('รหัสผ่านไม่ถูกต้อง — กรุณาเลือกไฟล์และใส่รหัสใหม่', '#d96b5e');
          removePwPanel();
          _file = null;
          fileInput.value = '';
          setUploadEnabled(true);
        } else {
          // ตรวจพบรหัสผ่านครั้งแรก → แสดง panel ใส่รหัส
          setStatus('');
          setUploadEnabled(false);
          showPwPanel();
        }
      } else {
        console.error('[onboarding] parsePDF error', err);
        setStatus('อ่านไฟล์ไม่สำเร็จ — ลองไฟล์อื่นหรือข้ามก่อน', '#d96b5e');
        setUploadEnabled(true);
      }
    }
  }
}

function isPasswordError(err) {
  return (
    err?.name === 'PasswordException' ||
    err?.message?.toLowerCase().includes('password') ||
    err?.code === 'PasswordException'
  );
}


/* === Skip notice (in-screen, ไม่แสดง screen ใหม่) ============== */

function renderSkipNotice(container, onFinish) {
  container.innerHTML = wrapScreen(`
    ${dots(2, 4)}

    <div style="${iconBox('135deg, #c89368, #a07246')}">
      ${svgIcon('alert', { size: 44, stroke: 1.8 })}
    </div>

    <h1 style="${H1};font-size:22px;">ตอนนี้จะเห็น<br>ข้อมูลตัวอย่างก่อน</h1>
    <p style="${SUB}">ระบบสร้างข้อมูลสมมติให้ดูก่อน<br>เพื่อให้เห็นว่าแอปใช้งานอย่างไร</p>

    <!-- What to do next -->
    <div style="width:100%;max-width:320px;display:flex;flex-direction:column;gap:10px;margin-bottom:32px;">
      ${nextStep('pdf',    'นำเข้า PDF จากธนาคาร',   'แตะเมนู "นำเข้า" ที่แถบด้านล่าง')}
      ${nextStep('mic',    'บันทึกรายการ',             'กดปุ่ม + หรือพูดบอกด้วยเสียงได้เลย')}
      ${nextStep('upload', 'กู้คืนข้อมูลเดิม',        'ตั้งค่า → ข้อมูล → กู้คืนจากไฟล์')}
    </div>

    <button id="ob-skip-done" style="${BTN_PRIMARY}">เข้าใจแล้ว ไปเริ่มเลย →</button>
  `);
  container.querySelector('#ob-skip-done').addEventListener('click', onFinish);
}

function nextStep(icon, title, sub) {
  return `
    <div style="display:flex;align-items:center;gap:12px;text-align:left;
      background:var(--surface,#fff);border-radius:12px;padding:12px 16px;
      border:1px solid var(--rule,#efe5d4);">
      <div style="width:36px;height:36px;flex-shrink:0;border-radius:10px;
        background:var(--accent-soft,#fef3e7);display:flex;align-items:center;
        justify-content:center;color:var(--primary,#e88e3c);">
        ${svgIcon(icon, { size: 18, stroke: 2 })}
      </div>
      <div>
        <div style="font-size:14px;font-weight:600;color:var(--ink,#2d3748);">${title}</div>
        <div style="font-size:12px;color:var(--ink-faint,#718096);margin-top:1px;">${sub}</div>
      </div>
    </div>`;
}


/* === Screen 3: Aha Moment ====================================== */

function renderScreen3(container, importedCount, onNext) {
  const txs   = State.getTransactions();
  const month = new Date().toISOString().slice(0, 7);
  const sum   = State.getMonthSummary(month);

  const net      = sum.income - sum.expense;
  const netText  = net >= 0 ? `+${formatBaht(net)} ฿` : `${formatBaht(net)} ฿`;
  const netColor = net >= 0 ? '#5a9d63' : '#d96b5e';

  const catMap = {};
  txs.filter(t => t.type === 'expense' && t.date.startsWith(month)).forEach(t => {
    catMap[t.group] = (catMap[t.group] || 0) + t.amount;
  });
  const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];

  const hasData = importedCount > 0 && (sum.expense > 0 || sum.income > 0);

  container.innerHTML = wrapScreen(`
    ${dots(3, 4)}

    <div style="width:100%;max-width:320px;
      background:linear-gradient(135deg,#e88e3c22,#f5a62311);
      border:1.5px solid rgba(232,142,60,0.2);border-radius:20px;
      padding:28px 24px;margin-bottom:24px;text-align:center;">
      ${hasData ? `
        <div style="font-size:14px;color:var(--ink-faint,#718096);margin-bottom:6px;">
          เดือนนี้คุณ${net >= 0 ? 'เหลือ' : 'ขาด'}
        </div>
        <div style="font-size:40px;font-weight:800;color:${netColor};line-height:1.1;margin-bottom:4px;">
          ${netText}
        </div>
        <div style="font-size:13px;color:var(--ink-faint,#718096);">จาก ${importedCount} รายการที่นำเข้า</div>
        ${topCat ? `
          <div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(232,142,60,0.15);
            font-size:13px;color:var(--ink-faint,#718096);">
            รายจ่ายสูงสุด:
            <span style="font-weight:700;color:var(--ink,#2d3748);">${formatBaht(topCat[1])} ฿</span>
          </div>` : ''}
      ` : `
        <div style="font-size:18px;margin-bottom:8px;">🎉</div>
        <div style="font-size:17px;font-weight:700;color:var(--ink,#2d3748);margin-bottom:6px;">พร้อมแล้ว!</div>
        <div style="font-size:14px;color:var(--ink-faint,#718096);line-height:1.5;">
          กดปุ่ม + หรือพูดบอกด้วยเสียง<br>เพื่อบันทึกรายการแรก
        </div>
      `}
    </div>

    <h2 style="${H1};font-size:22px;margin-bottom:8px;">${hasData ? 'เห็นภาพรวมแล้วใช่ไหม?' : 'เริ่มต้นได้เลย'}</h2>
    <p style="${SUB};margin-bottom:32px;">${hasData
      ? 'ข้อมูลทั้งหมดอยู่ในเครื่องของคุณ<br>ปลอดภัย ใช้ได้แม้ไม่มีสัญญาณ'
      : 'บันทึกรายการแรกได้เลย<br>ไม่ต้องสมัคร ใช้ได้ทันที'
    }</p>

    <button id="ob-next-3" style="${BTN_PRIMARY}">ต่อไป →</button>
  `);

  container.querySelector('#ob-next-3').addEventListener('click', onNext);
}


/* === Screen 4: Cash on hand ==================================== */

function renderScreen4(container, onFinish) {
  container.innerHTML = wrapScreen(`
    ${dots(4, 4)}

    <div style="${iconBox('135deg, #c89368, #a07246')}">
      ${svgIcon('cash', { size: 44, stroke: 1.8 })}
    </div>

    <h1 style="${H1}">ตอนนี้มี<br>เงินสดในมือเท่าไหร่?</h1>
    <p style="${SUB}">ช่วยให้ยอดเงินสดบนหน้าหลัก<br>แสดงผลถูกต้องตั้งแต่วันนี้</p>

    <!-- Input row -->
    <div style="display:flex;align-items:center;gap:0;width:100%;max-width:320px;
      border:1.5px solid var(--rule,#efe5d4);border-radius:14px;
      background:var(--surface,#fff);overflow:hidden;margin-bottom:28px;">
      <span style="padding:0 14px;font-size:16px;color:var(--ink-faint,#718096);
        font-weight:600;line-height:1;border-right:1px solid var(--rule,#efe5d4);
        height:52px;display:flex;align-items:center;">฿</span>
      <input id="ob-cash-input" type="number" inputmode="decimal" min="0" placeholder="0"
        style="flex:1;padding:0 14px;height:52px;border:none;outline:none;
          font-size:20px;font-weight:700;color:var(--ink,#2d3748);
          background:transparent;font-family:inherit;width:100%;">
    </div>

    <button id="ob-cash-save" style="${BTN_PRIMARY};margin-bottom:12px;">บันทึกและเริ่มใช้งาน</button>
    <button id="ob-cash-skip" style="background:none;border:none;
      color:var(--ink-faint,#718096);font-size:14px;font-family:inherit;
      cursor:pointer;padding:8px 16px;text-decoration:underline;text-underline-offset:3px;">
      ข้ามก่อน ตั้งค่าทีหลัง
    </button>
  `);

  const input    = container.querySelector('#ob-cash-input');
  const saveBtn  = container.querySelector('#ob-cash-save');
  const skipBtn  = container.querySelector('#ob-cash-skip');

  // Focus input
  setTimeout(() => input?.focus(), 100);

  function saveCash() {
    const raw = parseFloat(input.value) || 0;
    if (raw > 0) {
      const satang = Math.round(raw * 100);
      State.updateAccount('cash:default', {
        cash_balance_override: satang,
        override_date: todayISO()
      });
    }
    onFinish();
  }

  saveBtn.addEventListener('click', saveCash);
  skipBtn.addEventListener('click', onFinish);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveCash();
  });
}


/* === Shared UI helpers ========================================= */

const H1 = `
  font-size:26px;font-weight:800;color:var(--ink,#2d3748);
  margin:0 0 10px;line-height:1.2;text-align:center;
`;
const SUB = `
  font-size:15px;color:var(--ink-faint,#718096);
  margin:0 0 24px;line-height:1.6;text-align:center;
`;
const BTN_PRIMARY = `
  width:100%;max-width:320px;padding:16px;
  background:linear-gradient(135deg,#e88e3c,#f5a623);
  color:#fff;border:none;border-radius:14px;
  font-size:17px;font-weight:700;font-family:inherit;
  cursor:pointer;box-shadow:0 4px 16px rgba(232,142,60,0.35);
`;

function iconBox(gradient) {
  return `
    width:88px;height:88px;border-radius:24px;
    background:linear-gradient(${gradient});
    display:flex;align-items:center;justify-content:center;
    margin:0 auto 24px;
    box-shadow:0 8px 24px rgba(0,0,0,0.12);
    color:#fff;
  `;
}

function wrapScreen(inner) {
  return `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;
      justify-content:center;padding:36px 28px;text-align:center;
      overflow-y:auto;-webkit-overflow-scrolling:touch;">
      ${inner}
    </div>`;
}

function dots(active, total) {
  const items = Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    const isActive = n === active;
    const isPast   = n < active;
    return `<div style="
      width:${isActive ? '24px' : '8px'};height:8px;border-radius:4px;
      background:${isActive ? 'var(--primary,#e88e3c)' : isPast ? 'rgba(232,142,60,0.35)' : 'var(--rule,#efe5d4)'};
      transition:width 0.3s ease,background 0.3s ease;"></div>`;
  });
  return `<div style="display:flex;gap:8px;justify-content:center;margin-bottom:28px;">
    ${items.join('')}
  </div>`;
}
