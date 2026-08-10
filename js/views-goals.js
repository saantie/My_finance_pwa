/* ===================================================================
   views-goals.js — เป้าหมายท้าทาย: การ์ดบนหน้าแรก + modal ตั้งเป้า
   ===================================================================
   กฎ/การคำนวณอยู่ใน goals.js — ไฟล์นี้เป็น presentation ล้วน
   ใช้ร่วมกับ views-dashboard (เรียก renderGoalSection + bindGoalSection)
   =================================================================== */

import * as Goals from './goals.js';
import * as State from './state.js';
import { svgIcon, getCategory, categoriesByType } from './icons.js';
import {
  formatBaht, formatShortDate, bahtToSatang, satangToBaht,
  todayISO, offsetDateISO, parseLocalDate, daysBetweenISO, calc, haptic
} from './utils.js';
import { escapeHtml, showToast } from './views-shared.js';
import { track } from './analytics.js';


/* === Helpers ==================================================== */

/** วันสุดท้ายของเดือนที่ ISO นั้นอยู่ */
function endOfMonthISO(iso) {
  const d = parseLocalDate(iso);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

/** ไอคอน + สีของเป้า — ตามหมวดถ้าระบุ ไม่งั้นใช้สีตามประเภทเป้า */
function goalVisual(goal) {
  if (goal.group) {
    const def = getCategory(goal.group);
    return { icon: def.icon, color: def.color };
  }
  return goal.type === 'save'
    ? { icon: 'target', color: 'var(--clay)' }
    : { icon: 'trending', color: 'var(--sage)' };
}

function goalHeadline(goal) {
  // nbsp คั่นตัวเลขกับ ฿ — กัน "฿" ตกไปขึ้นบรรทัดใหม่ตัวเดียวเวลาหัวการ์ดยาว
  const amt = `${formatBaht(goal.target_amount)} ฿`;
  return goal.type === 'save'
    ? `${Goals.goalTitle(goal)} ไม่เกิน ${amt}`
    : `${Goals.goalTitle(goal)} ให้ถึง ${amt}`;
}

function daysLeftLabel(p) {
  if (p.notStarted) return 'ยังไม่เริ่ม';
  if (p.daysLeft === 0) return 'วันสุดท้าย';
  return `อีก ${p.daysLeft} วัน`;
}


/* === Dashboard section ========================================== */

/** HTML ของ section "เป้าหมายท้าทาย" บนหน้าแรก */
export function renderGoalSection() {
  const goals = Goals.getVisibleGoals();

  if (goals.length === 0) {
    return `
      <div class="section" id="goal-section">
        <button class="card goal-cta" data-action="add-goal">
          <span class="goal-cta-ic">${svgIcon('target', { size: 20, stroke: 2 })}</span>
          <span class="goal-cta-text">
            <span class="goal-cta-title">ตั้งเป้าหมายท้าทาย</span>
            <span class="goal-cta-sub">ตั้งงบประหยัด หรือเป้าหาเงินเพิ่ม — กำหนดจำนวนเงินและระยะเวลาได้เอง</span>
          </span>
          <span class="goal-cta-chev">${svgIcon('chevron', { size: 18, stroke: 2 })}</span>
        </button>
      </div>`;
  }

  return `
    <div class="section" id="goal-section">
      <div class="section-head">
        <h2 class="section-title">เป้าหมายท้าทาย</h2>
        <a class="section-action" data-action="add-goal">ตั้งเป้าใหม่</a>
      </div>
      ${goals.map(renderGoalCard).join('')}
    </div>`;
}

function renderGoalCard(goal) {
  const p   = Goals.getGoalProgress(goal);
  const vis = goalVisual(goal);
  const done = goal.status === 'done';

  // แถบความคืบหน้า: save = ใช้ไปเท่าไรของงบ, earn = หาได้เท่าไรของเป้า
  const fillPct = Math.min(Math.max(p.pct, 0), 100);
  const fillCls = done
    ? (goal.achieved ? 'good' : 'ended')
    : (goal.type === 'earn' ? 'earn' : (p.over ? 'over' : (p.onTrack ? 'good' : 'warn')));

  const metaLine = done
    ? `จบรอบ ${formatShortDate(goal.end_date)}`
    : `${daysLeftLabel(p)} · ถึง ${formatShortDate(goal.end_date)}`;

  return `
    <div class="card goal-card${done ? ' goal-card-done' : ''}">
      <div class="goal-card-head">
        <span class="goal-ic" style="background:${vis.color}">${svgIcon(vis.icon, { size: 16, stroke: 2 })}</span>
        <span class="goal-head-text">
          <span class="goal-title">${escapeHtml(goalHeadline(goal))}</span>
          <span class="goal-meta">${metaLine}</span>
        </span>
        <button class="goal-edit" data-action="edit-goal" data-id="${escapeHtml(goal.id)}"
                aria-label="แก้ไขเป้าหมาย">${svgIcon('edit', { size: 15, stroke: 2 })}</button>
      </div>

      <div class="goal-bar">
        <div class="goal-bar-fill ${fillCls}" style="width:${fillPct}%"></div>
        ${!done && p.expectedPct > 0 && p.expectedPct < 100
          ? `<div class="goal-bar-pace" style="left:${p.expectedPct}%"></div>` : ''}
      </div>

      <div class="goal-nums">
        <span class="goal-num-main">${formatBaht(p.actual)} / ${formatBaht(p.target)} ฿</span>
        <span class="goal-num-side">${p.pct}%</span>
      </div>

      <div class="goal-verdict ${verdictClass(goal, p)}">${goalVerdict(goal, p)}</div>

      ${done ? `
        <div class="goal-done-actions">
          <button class="goal-ghost-btn" data-action="archive-goal" data-id="${escapeHtml(goal.id)}">ปิดการ์ดนี้</button>
          <button class="goal-ghost-btn primary" data-action="add-goal">ตั้งเป้าใหม่</button>
        </div>` : ''}
    </div>`;
}

function verdictClass(goal, p) {
  if (goal.status === 'done') return goal.achieved ? 'good' : '';
  if (goal.type === 'save')   return p.over ? 'warn' : (p.onTrack ? 'good' : '');
  return p.onTrack ? 'good' : '';
}

/** ข้อความสรุป — บอกข้อเท็จจริง ไม่ตัดสิน (CLAUDE.md §3) */
function goalVerdict(goal, p) {
  const left    = formatBaht(Math.abs(p.remaining));
  const perDay  = formatBaht(p.perDay);
  const actual  = formatBaht(p.actual);
  const target  = formatBaht(p.target);

  if (goal.status === 'done') {
    if (goal.type === 'save') {
      return goal.achieved
        ? `ทำได้ตามเป้า — ใช้ ${actual} จากงบ ${target} ฿`
        : `จบรอบที่ ${actual} ฿ จากงบ ${target} ฿ — ตั้งเป้าใหม่ให้พอดีกับของจริงได้`;
    }
    return goal.achieved
      ? `ถึงเป้าแล้ว — หาได้ ${actual} ฿`
      : `จบรอบที่ ${actual} ฿ จากเป้า ${target} ฿`;
  }

  if (p.notStarted) return `เริ่มนับ ${formatShortDate(goal.start_date)}`;

  if (goal.type === 'save') {
    if (p.over)    return `ใช้เกินงบที่ตั้งไว้ ${left} ฿ — ปรับเป้าให้พอดีได้ทุกเมื่อ`;
    if (p.onTrack) return `อยู่ในจังหวะ — ใช้ได้อีกวันละ ${perDay} ฿ (เหลือ ${left} ฿)`;
    return `ใช้เร็วกว่าจังหวะเป้า — เหลือ ${left} ฿ สำหรับ ${p.daysUsable} วัน (วันละ ${perDay} ฿)`;
  }

  if (p.onTrack) return `อยู่ในจังหวะ — ยังขาด ${left} ฿ (วันละ ${perDay} ฿)`;
  return `ยังขาด ${left} ฿ ใน ${p.daysUsable} วัน — เฉลี่ยวันละ ${perDay} ฿`;
}

/** ผูก event ของ section — เรียกจาก renderDashboard หลังใส่ DOM */
export function bindGoalSection(container) {
  container.querySelectorAll('[data-action="add-goal"]').forEach(el => {
    el.addEventListener('click', () => openGoalModal());
  });
  container.querySelectorAll('[data-action="edit-goal"]').forEach(el => {
    el.addEventListener('click', () => {
      const goal = State.getGoal(el.dataset.id);
      if (goal) openGoalModal(goal);
    });
  });
  container.querySelectorAll('[data-action="archive-goal"]').forEach(el => {
    el.addEventListener('click', () => Goals.archiveGoal(el.dataset.id));
  });
}


/* === Modal: ตั้ง/แก้เป้าหมาย ==================================== */

const AMOUNT_PRESETS = [1000, 3000, 5000, 10000];   // บาท

/**
 * เปิด bottom-sheet ตั้งเป้าหมาย
 * @param {object|null} existing — goal ที่จะแก้ (null = สร้างใหม่)
 */
export function openGoalModal(existing = null) {
  document.querySelector('.goal-overlay')?.remove();

  const today = todayISO();
  const draft = existing
    ? {
        type: existing.type,
        amountText: String(satangToBaht(existing.target_amount)),
        group: existing.group,
        start_date: existing.start_date,
        end_date: existing.end_date
      }
    : {
        type: 'save',
        amountText: '',
        group: null,
        start_date: today,
        end_date: offsetDateISO(today, 29)   // 30 วันรวมวันนี้
      };

  const overlay = document.createElement('div');
  overlay.className = 'overlay goal-overlay';
  overlay.innerHTML = `
    <div class="acct-modal goal-modal">
      <div class="acct-modal-head">${existing ? 'แก้ไขเป้าหมาย' : 'ตั้งเป้าหมายท้าทาย'}</div>
      <div class="acct-modal-body goal-modal-body"></div>
      <div class="acct-modal-footer">
        <button class="cancel" data-goal-cancel>ยกเลิก</button>
        <button class="confirm" data-goal-save>${existing ? 'บันทึก' : 'เริ่มท้าทาย'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const body = overlay.querySelector('.goal-modal-body');

  /* --- helpers ------------------------------------------------- */

  const draftDays = () => daysBetweenISO(draft.start_date, draft.end_date) + 1;

  /** บาทที่กรอก (รองรับ expression "5000+500") → satang */
  const draftSatang = () => {
    const raw = (draft.amountText || '').trim();
    if (!raw) return 0;
    const val = calc(raw);
    return val == null ? 0 : Math.round(Math.abs(bahtToSatang(val)));
  };

  function previewText() {
    const satang = draftSatang();
    if (!satang) return 'ใส่จำนวนเงินเพื่อดูสรุปเป้าหมาย';
    const days = draftDays();
    const per  = formatBaht(Math.floor(satang / Math.max(days, 1)));
    const what = draft.type === 'save'
      ? `ประหยัด${draft.group ? getCategory(draft.group).label : 'รายจ่าย'} ไม่เกิน ${formatBaht(satang)} ฿`
      : `หาเงินเพิ่ม${draft.group ? `จาก${getCategory(draft.group).label}` : ''} ให้ถึง ${formatBaht(satang)} ฿`;
    return `${what} ภายใน ${days} วัน (ถึง ${formatShortDate(draft.end_date)}) — เฉลี่ยวันละ ${per} ฿`;
  }

  function updatePreview() {
    const el = body.querySelector('.goal-preview');
    if (el) el.textContent = previewText();
  }

  /* --- render ------------------------------------------------- */

  function render() {
    const days = draftDays();
    const cats = categoriesByType(draft.type === 'save' ? 'expense' : 'income');
    const eom  = endOfMonthISO(draft.start_date);
    const isPreset = d => days === d && draft.end_date !== eom;

    body.innerHTML = `
      <span class="acct-field-label">ประเภทเป้าหมาย</span>
      <div class="goal-type-grid">
        <button class="goal-type-btn${draft.type === 'save' ? ' active' : ''}" data-goal-type="save">
          ${svgIcon('target', { size: 17, stroke: 2 })}
          <span class="goal-type-name">ประหยัด</span>
          <span class="goal-type-desc">ใช้ไม่เกินงบที่ตั้ง</span>
        </button>
        <button class="goal-type-btn${draft.type === 'earn' ? ' active' : ''}" data-goal-type="earn">
          ${svgIcon('trending', { size: 17, stroke: 2 })}
          <span class="goal-type-name">หาเงินเพิ่ม</span>
          <span class="goal-type-desc">หารายรับให้ถึงเป้า</span>
        </button>
      </div>

      <span class="acct-field-label">จำนวนเงิน (บาท)</span>
      <input class="acct-field-input goal-amount-input" type="text" inputmode="decimal"
             placeholder="0" value="${escapeHtml(draft.amountText)}">
      <div class="goal-chip-row">
        ${AMOUNT_PRESETS.map(v => `
          <button class="goal-chip" data-goal-amount="${v}">${v.toLocaleString('en-US')}</button>
        `).join('')}
      </div>

      <span class="acct-field-label">${draft.type === 'save' ? 'ประหยัดหมวดไหน' : 'รายรับจากหมวดไหน'}</span>
      <div class="goal-chip-row goal-cat-row">
        <button class="goal-chip${draft.group === null ? ' active' : ''}" data-goal-group="">
          ${draft.type === 'save' ? 'ทุกหมวด' : 'ทุกรายรับ'}
        </button>
        ${cats.map(c => `
          <button class="goal-chip${draft.group === c.key ? ' active' : ''}" data-goal-group="${escapeHtml(c.key)}">
            <span class="goal-chip-dot" style="background:${c.color}"></span>${escapeHtml(c.label)}
          </button>
        `).join('')}
      </div>

      <span class="acct-field-label">ระยะเวลา</span>
      <div class="goal-dur-grid">
        ${Goals.GOAL_DURATIONS.map(d => `
          <button class="goal-dur-btn${isPreset(d) ? ' active' : ''}" data-goal-days="${d}">${d} วัน</button>
        `).join('')}
        <button class="goal-dur-btn${draft.end_date === eom ? ' active' : ''}" data-goal-eom>สิ้นเดือน</button>
      </div>
      <label class="goal-date-label">
        <span>ครบกำหนดวันที่</span>
        <input class="acct-field-input goal-date-input" type="date"
               value="${draft.end_date}" min="${draft.start_date}">
      </label>

      <div class="goal-preview">${previewText()}</div>

      ${existing ? `
        <button class="goal-delete-btn" data-goal-delete>ลบเป้าหมายนี้</button>` : ''}
    `;

    bindBody();
  }

  function bindBody() {
    body.querySelectorAll('[data-goal-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.goalType;
        if (next === draft.type) return;
        draft.type = next;
        draft.group = null;      // หมวดของรายจ่าย/รายรับใช้ร่วมกันไม่ได้
        render();
      });
    });

    const amountInput = body.querySelector('.goal-amount-input');
    amountInput?.addEventListener('input', () => {
      draft.amountText = amountInput.value;
      updatePreview();
    });

    body.querySelectorAll('[data-goal-amount]').forEach(btn => {
      btn.addEventListener('click', () => {
        draft.amountText = btn.dataset.goalAmount;
        if (amountInput) amountInput.value = draft.amountText;
        body.querySelectorAll('[data-goal-amount]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updatePreview();
      });
    });

    body.querySelectorAll('[data-goal-group]').forEach(btn => {
      btn.addEventListener('click', () => {
        draft.group = btn.dataset.goalGroup || null;
        body.querySelectorAll('[data-goal-group]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updatePreview();
      });
    });

    body.querySelectorAll('[data-goal-days]').forEach(btn => {
      btn.addEventListener('click', () => {
        draft.end_date = offsetDateISO(draft.start_date, Number(btn.dataset.goalDays) - 1);
        render();
      });
    });

    body.querySelector('[data-goal-eom]')?.addEventListener('click', () => {
      draft.end_date = endOfMonthISO(draft.start_date);
      render();
    });

    const dateInput = body.querySelector('.goal-date-input');
    dateInput?.addEventListener('change', () => {
      if (!dateInput.value || dateInput.value < draft.start_date) {
        dateInput.value = draft.end_date;
        showToast('วันครบกำหนดต้องไม่ก่อนวันเริ่ม');
        return;
      }
      draft.end_date = dateInput.value;
      render();
    });

    body.querySelector('[data-goal-delete]')?.addEventListener('click', () => {
      Goals.removeGoal(existing.id);
      close();
      showToast('ลบเป้าหมายแล้ว');
    });
  }

  /* --- close / save ------------------------------------------- */

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-goal-cancel]').addEventListener('click', close);

  overlay.querySelector('[data-goal-save]').addEventListener('click', () => {
    const satang = draftSatang();
    if (!satang) {
      showToast('ใส่จำนวนเงินเป้าหมายก่อนนะ');
      body.querySelector('.goal-amount-input')?.focus();
      return;
    }

    const payload = {
      type: draft.type,
      target_amount: satang,
      group: draft.group,
      start_date: draft.start_date,
      end_date: draft.end_date
    };

    const saved = existing
      ? Goals.editGoal(existing.id, payload)
      : Goals.createGoal(payload);

    if (!saved) {
      showToast('ตั้งเป้าไม่สำเร็จ — ตรวจจำนวนเงินและวันครบกำหนดอีกครั้ง');
      return;
    }

    haptic(12);
    track('feature_used', { feature: existing ? 'goal_edited' : 'goal_created' });
    close();
    showToast(existing
      ? 'อัปเดตเป้าหมายแล้ว'
      : `เริ่มท้าทายแล้ว — ${goalHeadline(saved)}`);
  });

  render();
}
