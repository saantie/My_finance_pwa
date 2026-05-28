/* ===================================================================
   coach-mark.js — Onboarding tour หลังจบ onboarding
   ===================================================================
   แสดง 3 ขั้นตอน spotlight + tooltip ชี้ UI หลัก
   Trigger: เรียกจาก app.js หลัง showOnboarding() onComplete
   Storage: localStorage 'coach_done' — แสดงครั้งเดียว
   Dismiss: กด "ถัดไป" จนจบ หรือกด "ข้าม"
   =================================================================== */


/* ─── Steps definition ─────────────────────────────────────────── */

const STEPS = [
  {
    selector: '.fab',
    title: 'บันทึกรายการ',
    body:  'กด + เพื่อบันทึก — พิมพ์ตัวเลข พูดด้วยเสียง หรือตั้งรายการประจำได้เลย',
    shape: 'circle',   // circle | rect
  },
  {
    selector: '.nav-item[data-view="import"]',
    title: 'นำเข้า PDF',
    body:  'อัปโหลด e-Statement จากธนาคาร — ระบบอ่านทุกรายการให้อัตโนมัติ ไม่ต้องพิมพ์เอง',
    shape: 'rect',
  },
  {
    selector: '.hero-card',
    title: 'ภาพรวมเดือนนี้',
    body:  'ดูทันทีว่าเดือนนี้เหลือหรือขาด — อัปเดตทุกครั้งที่บันทึกรายการ',
    shape: 'rect',
  },
];

const DONE_KEY = 'coach_done';
const PAD = 10;   // padding รอบ spotlight (px)


/* ─── Public API ───────────────────────────────────────────────── */

export function shouldShowCoachMark() {
  return !localStorage.getItem(DONE_KEY);
}

export function showCoachMark() {
  if (!shouldShowCoachMark()) return;

  let stepIndex = 0;

  /* -- overlay container -- */
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9100;
    pointer-events:auto;
    transition:opacity 0.25s ease;
  `;
  document.body.appendChild(overlay);

  /* -- spotlight ring -- */
  const spotlight = document.createElement('div');
  spotlight.style.cssText = `
    position:fixed;
    box-shadow:0 0 0 9999px rgba(0,0,0,0.68);
    z-index:9110;pointer-events:none;
    transition:top .35s cubic-bezier(.4,0,.2,1),
               left .35s cubic-bezier(.4,0,.2,1),
               width .35s cubic-bezier(.4,0,.2,1),
               height .35s cubic-bezier(.4,0,.2,1),
               border-radius .25s ease;
  `;
  overlay.appendChild(spotlight);

  /* -- tooltip bubble -- */
  const tooltip = document.createElement('div');
  tooltip.style.cssText = `
    position:fixed;left:20px;right:20px;z-index:9120;
    background:rgba(10,18,35,0.92);
    border:1px solid rgba(255,255,255,0.13);
    border-radius:20px;padding:22px 20px;
    backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
    box-shadow:0 20px 48px rgba(0,0,0,0.45);
    transition:top .35s cubic-bezier(.4,0,.2,1), opacity .2s ease;
  `;
  overlay.appendChild(tooltip);

  /* -- skip button -- */
  const skipBtn = document.createElement('button');
  skipBtn.textContent = 'ข้าม';
  skipBtn.style.cssText = `
    position:fixed;top:16px;right:16px;z-index:9130;
    background:rgba(255,255,255,0.13);color:rgba(255,255,255,0.85);
    border:1px solid rgba(255,255,255,0.25);border-radius:20px;
    padding:6px 16px;font-size:13px;font-family:inherit;
    cursor:pointer;backdrop-filter:blur(8px);
  `;
  overlay.appendChild(skipBtn);

  /* -- close/done -- */
  function done() {
    localStorage.setItem(DONE_KEY, '1');
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 260);
  }

  skipBtn.addEventListener('click', (e) => { e.stopPropagation(); done(); });

  /* -- advance on overlay tap (outside tooltip) -- */
  overlay.addEventListener('click', (e) => {
    if (!tooltip.contains(e.target) && e.target !== skipBtn) {
      advance();
    }
  });

  function advance() {
    stepIndex++;
    if (stepIndex >= STEPS.length) { done(); return; }
    renderStep(stepIndex);
  }

  /* ── render one step ──────────────────────────────────────────── */
  function renderStep(i) {
    const s   = STEPS[i];
    const el  = document.querySelector(s.selector);
    if (!el) { stepIndex++; if (stepIndex < STEPS.length) renderStep(stepIndex); else done(); return; }

    const rect = el.getBoundingClientRect();
    const vw   = window.innerWidth;
    const vh   = window.innerHeight;

    // spotlight
    const sTop    = rect.top    - PAD;
    const sLeft   = rect.left   - PAD;
    const sWidth  = rect.width  + PAD * 2;
    const sHeight = rect.height + PAD * 2;
    const radius  = s.shape === 'circle'
      ? '50%'
      : `${Math.min(14, sHeight / 2)}px`;

    spotlight.style.top          = `${sTop}px`;
    spotlight.style.left         = `${sLeft}px`;
    spotlight.style.width        = `${sWidth}px`;
    spotlight.style.height       = `${sHeight}px`;
    spotlight.style.borderRadius = radius;

    // tooltip — บน/ล่าง spotlight ตามตำแหน่งบนหน้าจอ
    const aboveSpace = sTop - PAD - 16;
    const belowSpace = vh - (sTop + sHeight + PAD + 16);
    const placeAbove = aboveSpace > 160 || belowSpace < 160;

    const tooltipEstH = 150;  // ประมาณ tooltip สูงสุด
    const tooltipTop  = placeAbove
      ? Math.max(60, sTop - tooltipEstH - 16)
      : sTop + sHeight + 16;

    tooltip.style.top     = `${tooltipTop}px`;
    tooltip.style.opacity = '0';

    // dots
    const dotsHtml = STEPS.map((_, j) => `
      <div style="
        width:${j === i ? '20px' : '6px'};height:6px;border-radius:3px;
        background:${j === i ? '#fff' : 'rgba(255,255,255,0.28)'};
        transition:width .3s ease,background .3s ease;
      "></div>
    `).join('');

    const isLast = i === STEPS.length - 1;

    tooltip.innerHTML = `
      <div style="font-family:var(--font-accent,'Sarabun',sans-serif);
        font-size:18px;font-weight:700;color:#fff;margin-bottom:7px;line-height:1.3;">
        ${s.title}
      </div>
      <div style="font-size:14px;color:rgba(255,255,255,0.78);
        line-height:1.6;margin-bottom:18px;">
        ${s.body}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div style="display:flex;gap:5px;align-items:center;">${dotsHtml}</div>
        <button id="cm-next" style="
          background:rgba(255,255,255,0.18);color:#fff;
          border:1.5px solid rgba(255,255,255,0.35);border-radius:20px;
          padding:8px 20px;font-size:14px;font-weight:600;font-family:inherit;
          cursor:pointer;white-space:nowrap;
          backdrop-filter:blur(8px);
          transition:background .15s ease;
        ">${isLast ? 'เสร็จสิ้น ✓' : 'ถัดไป →'}</button>
      </div>
    `;

    // fade tooltip in (หน่วงนิดเพื่อให้ spotlight animate ก่อน)
    requestAnimationFrame(() => {
      setTimeout(() => { tooltip.style.opacity = '1'; }, 80);
    });

    tooltip.querySelector('#cm-next').addEventListener('click', (e) => {
      e.stopPropagation();
      advance();
    });
  }

  // เริ่ม step แรก
  renderStep(0);
}
