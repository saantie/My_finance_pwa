/* ===================================================================
   coach-mark.js — Onboarding tour หลังจบ onboarding
   ===================================================================
   Flow:
   1. Prompt ถามก่อน — "ต้องการดูคำแนะนำไหม?"
   2. Tour 8 steps ใน 3 หน้า (Dashboard → บันทึก → ตั้งค่า)
   3. Navigate อัตโนมัติระหว่างหน้า + scroll element กลางหน้าจอก่อน spotlight

   Trigger: app.js เรียก showCoachMark() หลัง onboarding onComplete
   Storage: localStorage 'coach_done' — แสดงครั้งเดียวตลอดชีพ
   Dismiss: กด "ข้าม" ทุกจุด หรือแตะนอก tooltip
   =================================================================== */

const DONE_KEY = 'coach_done';
const PAD      = 10;   // padding รอบ spotlight (px)

/* ─── Page names ────────────────────────────────────────────────── */
const PAGE_NAMES = {
  dashboard: '🏠 หน้าหลัก',
  list:      '📋 ที่จดไว้',
  settings:  '⚙️ หน้าตั้งค่า',
};

/* ─── Steps definition (8 steps, 3 pages) ───────────────────────── */
const STEPS = [
  // ── Dashboard ─────────────────────────────────────────────────
  {
    selector: '.hero-card',
    title: 'ภาพรวมเดือนนี้',
    body: 'ตัวเลขใหญ่คือยอดสุทธิ — รายรับลบรายจ่ายของเดือนนี้ อัปเดตทุกครั้งที่บันทึก',
    shape: 'rect',
  },
  {
    selector: '.fab',
    title: 'บันทึกรายการ',
    body: 'กด + เพื่อบันทึก — พิมพ์ตัวเลข พูดด้วยเสียง หรือตั้งรายการประจำได้เลย',
    shape: 'circle',
  },
  // ── List (บันทึก) — navigate ก่อน ───────────────────────────
  {
    navigate: 'list',
    selector: '.month-nav',
    title: 'ดูรายการย้อนหลัง',
    body: 'กดลูกศรซ้าย-ขวาเพื่อดูรายการเดือนก่อนหน้า — ไม่ต้องเลื่อนหาเอง',
    shape: 'rect',
  },
  {
    selector: '.filter-chips',
    title: 'กรองและค้นหา',
    body: 'แตะ รายจ่าย / รายรับ / โอน เพื่อกรอง หรือพิมพ์ในช่องค้นหาด้านบนได้ทันที',
    shape: 'rect',
  },

  // ── Settings (ตั้งค่า) — navigate ก่อน ──────────────────────
  {
    navigate: 'settings',
    selector: '.theme-swatches',
    title: 'เปลี่ยนธีมสี',
    body: 'มี 7 ธีมให้เลือก — แตะสักสีที่ชอบ แอปเปลี่ยนทันที ไม่ต้องรีสตาร์ท',
    shape: 'rect',
  },
  {
    selector: '.setting-row[data-action="export-json"]',
    title: 'สำรองข้อมูล',
    body: 'ดาวน์โหลดไฟล์สำรองเก็บไว้ในเครื่องได้ตลอดเวลา — ข้อมูลไม่หายแม้ถอนการติดตั้งแอป',
    shape: 'rect',
  },
  {
    selector: '[data-action="add-account"]',
    title: 'เพิ่มและจัดการบัญชี',
    body: 'เพิ่มบัญชีธนาคาร กระเป๋าเงิน หรือบัตรเครดิตด้วยตนเอง — หรือให้ระบบสร้างอัตโนมัติเมื่อนำเข้า e-Statement',
    shape: 'rect',
  },

  // ── Dashboard (กลับมา) ───────────────────────────────────────
  {
    navigate: 'dashboard',
    selector: '#dash-accounts-sect',
    title: 'บัญชีของฉัน',
    body: 'ดูยอดคงเหลือแต่ละบัญชีได้ที่นี่ — กด "จัดการ" เพื่อเพิ่ม แก้ไข หรือตั้งชื่อบัญชีได้เลย',
    shape: 'rect',
  },

  // ── Import (จบ tour ที่หน้านี้) ──────────────────────────────
  {
    navigate: 'import',
    selector: '.import-tile.pdf',
    title: 'นำเข้า e-Statement',
    body: 'กด เลือกไฟล์ แล้วเลือก e-Statement จากแอปธนาคาร — ระบบอ่านรายการและบันทึกให้อัตโนมัติ ไม่ต้องพิมพ์เอง',
    shape: 'rect',
  },
];


/* ─── Public API ────────────────────────────────────────────────── */

export function shouldShowCoachMark() {
  return !localStorage.getItem(DONE_KEY);
}

export function showCoachMark() {
  if (!shouldShowCoachMark()) return;
  _showPrompt();
}


/* ─── Step 0: ถามก่อน ─────────────────────────────────────────── */

function _showPrompt() {
  const wrap = document.createElement('div');
  wrap.style.cssText = `
    position:fixed;inset:0;z-index:9100;
    display:flex;align-items:flex-end;
    background:rgba(0,0,0,0.45);
    backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
    opacity:0;transition:opacity .2s ease;
  `;

  const sheet = document.createElement('div');
  sheet.style.cssText = `
    width:100%;
    background:rgba(10,18,35,0.96);
    border-radius:24px 24px 0 0;
    padding:28px 22px 40px;
    border-top:1px solid rgba(255,255,255,0.12);
    box-shadow:0 -20px 48px rgba(0,0,0,0.45);
    transform:translateY(100%);
    transition:transform .35s cubic-bezier(.4,0,.2,1);
    font-family:var(--font-accent,'Sarabun',sans-serif);
  `;

  sheet.innerHTML = `
    <div style="
      width:40px;height:4px;background:rgba(255,255,255,0.22);
      border-radius:2px;margin:0 auto 24px;
    "></div>
    <div style="font-size:22px;font-weight:700;color:#fff;margin-bottom:10px;text-align:center;">
      👋 แนะนำส่วนต่างๆ ของแอป
    </div>
    <div style="font-size:14px;color:rgba(255,255,255,0.72);line-height:1.7;text-align:center;margin-bottom:28px;padding:0 8px;">
      ใช้เวลาประมาณ 1 นาที — ชี้ให้เห็นทุก feature หลักที่ควรรู้
      <br>ข้ามได้ตลอดเวลาถ้าพร้อมใช้งานเลย
    </div>
    <button id="cm-start" style="
      display:block;width:100%;padding:15px;
      background:var(--primary,#e88e3c);color:#fff;
      border:none;border-radius:14px;font-size:16px;font-weight:700;
      font-family:inherit;cursor:pointer;margin-bottom:10px;
    ">ดูเลย 👀</button>
    <button id="cm-skip-all" style="
      display:block;width:100%;padding:12px;
      background:transparent;color:rgba(255,255,255,0.5);
      border:1px solid rgba(255,255,255,0.15);
      border-radius:14px;font-size:14px;font-family:inherit;cursor:pointer;
    ">ข้ามไปก่อน</button>
  `;

  wrap.appendChild(sheet);
  document.body.appendChild(wrap);

  /* Animate in */
  requestAnimationFrame(() => {
    wrap.style.opacity = '1';
    setTimeout(() => { sheet.style.transform = 'translateY(0)'; }, 20);
  });

  function closePrompt(startTour) {
    wrap.style.opacity = '0';
    sheet.style.transform = 'translateY(100%)';
    setTimeout(() => {
      wrap.remove();
      if (startTour) _startTour();
      else localStorage.setItem(DONE_KEY, '1');
    }, 320);
  }

  sheet.querySelector('#cm-start').addEventListener('click', () => closePrompt(true));
  sheet.querySelector('#cm-skip-all').addEventListener('click', () => closePrompt(false));
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closePrompt(false); });
}


/* ─── Tour ────────────────────────────────────────────────────── */

function _startTour() {
  let stepIndex  = 0;
  let curView    = 'dashboard';  // track current page ระหว่าง tour

  /* -- overlay container -- */
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9100;
    pointer-events:auto;
    transition:opacity 0.25s ease;
  `;
  document.body.appendChild(overlay);

  /* -- spotlight ring (dark mask with a "hole") -- */
  const spotlight = document.createElement('div');
  spotlight.style.cssText = `
    position:fixed;
    box-shadow:0 0 0 9999px rgba(0,0,0,0.68);
    z-index:9110;pointer-events:none;
    transition:
      top    .35s cubic-bezier(.4,0,.2,1),
      left   .35s cubic-bezier(.4,0,.2,1),
      width  .35s cubic-bezier(.4,0,.2,1),
      height .35s cubic-bezier(.4,0,.2,1),
      border-radius .25s ease;
  `;
  overlay.appendChild(spotlight);

  /* -- tooltip bubble -- */
  const tooltip = document.createElement('div');
  tooltip.style.cssText = `
    position:fixed;left:20px;right:20px;z-index:9120;
    background:rgba(10,18,35,0.93);
    border:1px solid rgba(255,255,255,0.13);
    border-radius:20px;padding:22px 20px;
    backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
    box-shadow:0 20px 48px rgba(0,0,0,0.45);
    transition:top .35s cubic-bezier(.4,0,.2,1), opacity .2s ease;
    font-family:var(--font-accent,'Sarabun',sans-serif);
  `;
  overlay.appendChild(tooltip);

  /* -- page label (top-center) -- */
  const pagePill = document.createElement('div');
  pagePill.style.cssText = `
    position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9130;
    background:rgba(255,255,255,0.13);color:rgba(255,255,255,0.88);
    border:1px solid rgba(255,255,255,0.2);border-radius:20px;
    padding:5px 14px;font-size:12px;
    font-family:var(--font-accent,'Sarabun',sans-serif);
    backdrop-filter:blur(8px);
    transition:opacity .2s ease;
    white-space:nowrap;pointer-events:none;
  `;
  overlay.appendChild(pagePill);

  /* -- skip button (top-right) -- */
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

  /* -- done & teardown -- */
  function done() {
    localStorage.setItem(DONE_KEY, '1');
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.remove(); }, 260);
    // ไม่ navigate กลับ — จบที่หน้าใดก็อยู่ที่นั่น (step สุดท้ายคือหน้า import)
  }

  skipBtn.addEventListener('click', (e) => { e.stopPropagation(); done(); });

  /* tap นอก tooltip → advance */
  overlay.addEventListener('click', (e) => {
    if (!tooltip.contains(e.target) && e.target !== skipBtn) advance();
  });

  /* -- advance to next step -- */
  function advance() {
    stepIndex++;
    if (stepIndex >= STEPS.length) { done(); return; }

    const nextStep = STEPS[stepIndex];

    if (nextStep.navigate && nextStep.navigate !== curView) {
      /* Navigate to another view → wait for render → show step */
      tooltip.style.opacity = '0';
      pagePill.style.opacity = '0';
      curView = nextStep.navigate;
      document.querySelector(`.nav-item[data-view="${curView}"]`)?.click();
      setTimeout(() => {
        pagePill.style.opacity = '1';
        renderStep(stepIndex);
      }, 400);
    } else {
      renderStep(stepIndex);
    }
  }

  /* ── render one step ────────────────────────────────────────── */
  function renderStep(i) {
    const s  = STEPS[i];
    const el = document.querySelector(s.selector);

    /* ถ้าหา element ไม่เจอ → ข้าม step นี้ */
    if (!el) {
      stepIndex++;
      if (stepIndex < STEPS.length) {
        const nx = STEPS[stepIndex];
        if (nx.navigate && nx.navigate !== curView) {
          advance();
        } else {
          renderStep(stepIndex);
        }
      } else {
        done();
      }
      return;
    }

    const rect   = el.getBoundingClientRect();
    const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;

    if (inView) {
      /* อยู่ใน viewport แล้ว (fixed / บนสุดของหน้า) — rAF เพื่อให้ browser commit layout ก่อนวัด */
      requestAnimationFrame(() => _doSpotlight(i, el));
    } else {
      /* อยู่นอก viewport — instant scroll (ไม่มี animation → deterministic)
         double-rAF รอ browser commit layout 2 รอบก่อนวัด */
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      requestAnimationFrame(() => requestAnimationFrame(() => _doSpotlight(i, el)));
    }
  }

  function _doSpotlight(i, el) {
    const s    = STEPS[i];
    const rect = el.getBoundingClientRect();
    const navH   = document.querySelector('.bottom-nav')?.offsetHeight ?? 68;
    /* visualViewport.height = ความสูงที่มองเห็นจริง หักแล้วทั้ง browser toolbar iOS/Android
       window.innerHeight อาจใหญ่กว่าจริงบน iOS Safari ทำให้ tooltip ถูก toolbar บัง */
    const vpH    = window.visualViewport?.height ?? window.innerHeight;
    const safeVH = vpH - navH;

    /* spotlight position */
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

    /* page pill label */
    pagePill.textContent = PAGE_NAMES[curView] || '';

    /* progress dots */
    const dotsHtml = STEPS.map((_, j) => `
      <div style="
        width:${j === i ? '20px' : '6px'};height:6px;border-radius:3px;
        background:${j === i ? '#fff' : 'rgba(255,255,255,0.28)'};
        transition:width .3s ease,background .3s ease;
      "></div>
    `).join('');

    const isLast = i === STEPS.length - 1;

    /* render tooltip นอกหน้าจอก่อน เพื่อวัดความสูงจริง */
    tooltip.style.opacity = '0';
    tooltip.style.top     = '-9999px';
    tooltip.innerHTML = `
      <div style="
        font-size:18px;font-weight:700;color:#fff;
        margin-bottom:7px;line-height:1.3;">
        ${s.title}
      </div>
      <div style="
        font-size:14px;color:rgba(255,255,255,0.78);
        line-height:1.65;margin-bottom:18px;">
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

    /* วัดความสูง tooltip จริง แล้ววางตำแหน่งที่ไม่บัง spotlight */
    requestAnimationFrame(() => {
      const th         = tooltip.offsetHeight;
      const gap        = 16;
      const spaceBelow = safeVH - (sTop + sHeight + PAD) - gap;
      const spaceAbove = sTop - PAD - gap;

      let top;
      if (spaceBelow >= th) {
        /* พื้นที่ใต้ spotlight พอ → วางใต้ */
        top = sTop + sHeight + gap;
      } else if (spaceAbove >= th) {
        /* ไม่พอใต้ แต่พอเหนือ → วางเหนือ */
        top = sTop - th - gap;
      } else {
        /* พื้นที่แคบทั้งสองฝั่ง (เช่น hero-card ใหญ่บน screen เล็ก)
           วางใต้ แต่ไม่ scroll page — clamp ด้านล่างจะดึงขึ้นมาให้ */
        top = sTop + sHeight + gap;
      }

      /* Hard clamp ทุก path: ห้าม button "ถัดไป" ล้นเกิน safeVH
         (กันกรณี hero-card+tooltip ใหญ่กว่าพื้นที่ว่างบน screen เล็ก) */
      top = Math.min(top, safeVH - th - 8);
      top = Math.max(56, top);   // ห้ามขึ้นบัง status bar

      tooltip.style.top     = `${top}px`;
      tooltip.style.opacity = '1';
    });

    tooltip.querySelector('#cm-next').addEventListener('click', (e) => {
      e.stopPropagation();
      advance();
    });
  }

  /* เริ่ม step แรก (dashboard — ไม่ต้อง navigate) */
  pagePill.textContent = PAGE_NAMES['dashboard'];
  renderStep(0);
}
