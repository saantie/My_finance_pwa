/* ===================================================================
   analytics.js — Privacy-preserving event tracking
   ===================================================================
   หลักการ:
   ✗ ไม่ส่ง transaction content (amounts, descriptions, categories)
   ✗ ไม่ส่ง PII (email, name, account numbers)
   ✓ ส่งเฉพาะ event types + counts + timing
   ✓ User opt-out ได้ใน Settings (default opt-in)
   ✓ Send via PostHog (window.posthog) เท่านั้น

   See docs/PRIVACY_ANALYTICS.md สำหรับ full event list + payload docs
   =================================================================== */

// state โหลด lazily เพื่อป้องกัน circular import ในกรณีที่ state ยังไม่พร้อม
let _state = null;
async function _getState() {
  if (!_state) _state = await import('./state.js');
  return _state;
}
function _getSettingsSync() {
  try {
    // ถ้า state โหลดแล้ว ใช้ sync path; ถ้าไม่มีให้ถือว่า opt-in (ส่งปกติ)
    return _state?.getSettings?.() ?? null;
  } catch {
    return null;
  }
}

/* === Event whitelist + payload schema ============================ */

/**
 * Schema type tokens:
 *   'boolean'    — coerce to Boolean
 *   'number'     — reject non-finite / non-number; return undefined if invalid
 *   'string'     — accept string, truncate to 100 chars
 *   string[]     — enum: reject values not in the allowed list
 */
const ALLOWED_EVENTS = {
  // H1: Onboarding
  'app_first_open':        {},
  'onboarding_completed':  { skipped: 'boolean' },
  'first_pdf_imported':    { bank: 'string', tx_count: 'number' },

  // H2: Habit formation
  'transaction_added':     { source: ['manual', 'voice', 'pdf', 'scheduled'] },
  'session_length_sec':    { value: 'number' },
  'feature_used':          { feature: 'string' },

  // H3: Retention
  'lapse_detected':        { days_since_last_tx: 'number' },
  'catchup_offered':       {},
  'catchup_accepted':      { method: ['pdf', 'manual', 'dismissed'] },

  // H4: Long-term
  'annual_review_opened':  { year: 'number' },
  'export_used':           { format: ['json', 'csv'] },

  // Abandonment signals
  'session_with_no_action': {},
  'rage_tap_detected':      { feature: 'string' },
};

/* === Core track function ========================================= */

/**
 * ส่ง event ถ้า user opt-in + event ใน whitelist + payload ผ่าน filter
 * @param {string} eventName
 * @param {object} [payload]
 */
export function track(eventName, payload = {}) {
  // 1. Opt-out check (sync — ถ้า state ยังไม่โหลดให้ผ่าน)
  const settings = _getSettingsSync();
  if (settings?.analytics_opt_out) return;

  // 2. Whitelist check
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_EVENTS, eventName)) {
    console.warn('[analytics] event not in whitelist:', eventName);
    return;
  }

  // 3. Filter + sanitize payload — เฉพาะ keys ที่ประกาศในใน schema
  const schema = ALLOWED_EVENTS[eventName];
  const filtered = {};
  for (const key of Object.keys(schema)) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      const sanitized = sanitize(payload[key], schema[key]);
      if (sanitized !== undefined) filtered[key] = sanitized;
    }
  }
  // Unknown keys ใน payload ไม่เคยถูก iterate → ไม่เคยถูกส่ง

  // 4. Send
  _send(eventName, filtered);
}

/* === Sanitize ==================================================== */

/**
 * Validate + coerce a single value against its schema type.
 * Returns undefined if invalid (caller drops the field).
 *
 * @param {*}              value
 * @param {string|string[]} type  — 'boolean' | 'number' | 'string' | enum[]
 * @returns {*|undefined}
 */
export function sanitize(value, type) {
  if (Array.isArray(type)) {
    // Enum: value ต้องอยู่ใน allowed list เท่านั้น
    return type.includes(value) ? value : undefined;
  }
  switch (type) {
    case 'boolean':
      return Boolean(value);
    case 'number':
      // Reject string, NaN, Infinity เพื่อป้องกัน PII ผ่าน toString()
      return (typeof value === 'number' && isFinite(value)) ? value : undefined;
    case 'string':
      if (typeof value !== 'string') return undefined;
      // Truncate to 100 chars — ป้องกัน description/label ยาวลอดผ่านมาโดยบังเอิญ
      return value.slice(0, 100);
    default:
      return undefined;
  }
}

/* === Send ======================================================== */

function _send(eventName, props) {
  if (typeof window !== 'undefined' && window.posthog) {
    try {
      window.posthog.capture(eventName, props);
    } catch (e) {
      console.warn('[analytics] posthog.capture failed:', e);
    }
  }
}

/* === Session tracking ============================================ */

let _sessionStart = Date.now();
let _sessionHadAction = false;

/**
 * เรียกเมื่อ user ทำ action ที่มีความหมาย (เพิ่ม tx, นำเข้า PDF, เปลี่ยน view)
 * ทำให้ session ถูก classify ว่า "มี action" ไม่ใช่ bounce
 */
export function markSessionAction() {
  _sessionHadAction = true;
}

function _flushSession() {
  const durationSec = Math.round((Date.now() - _sessionStart) / 1000);
  if (durationSec < 2) return; // filter out accidental re-loads

  if (!_sessionHadAction) {
    track('session_with_no_action');
  }
  track('session_length_sec', { value: durationSec });
}

function _resetSession() {
  _sessionStart = Date.now();
  _sessionHadAction = false;
}

// Flush เมื่อ user ซ่อน tab หรือ close browser
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      _flushSession();
    } else if (document.visibilityState === 'visible') {
      _resetSession();
    }
  });
}

/* === First-open tracking ========================================= */

const FIRST_OPEN_KEY = 'diary_analytics_first_open_v1';

/**
 * เรียกครั้งเดียวใน initApp() — track เฉพาะ install ครั้งแรกจริงๆ
 */
export function trackFirstOpenIfNeeded() {
  try {
    if (typeof localStorage !== 'undefined' && !localStorage.getItem(FIRST_OPEN_KEY)) {
      localStorage.setItem(FIRST_OPEN_KEY, '1');
      track('app_first_open');
    }
  } catch {
    // localStorage ไม่พร้อม (private browsing บาง browser)
  }
}

/* === Rage-tap detection ========================================== */

/**
 * Wrap a click handler ด้วย rage-tap detection
 * ถ้ากด 3+ ครั้งภายใน 1.5 วินาที → track('rage_tap_detected', { feature })
 *
 * @param {string}   featureName    — ชื่อ feature (e.g. 'account_picker')
 * @param {Function} [originalHandler] — handler เดิม (optional)
 * @returns {Function} wrapped handler
 *
 * @example
 * btn.addEventListener('click', withRageTap('save_button', () => saveData()));
 */
export function withRageTap(featureName, originalHandler) {
  let tapHistory = [];
  return function rageTapWrapper(e) {
    const now = Date.now();
    tapHistory.push(now);
    // เก็บเฉพาะ taps ใน 1.5 sec window
    tapHistory = tapHistory.filter(t => now - t < 1500);
    if (tapHistory.length >= 3) {
      track('rage_tap_detected', { feature: featureName });
      tapHistory = []; // reset หลัง trigger
    }
    return originalHandler?.call(this, e);
  };
}

/* === Init: state ready =========================================== */

/**
 * เรียกจาก app.js หลัง state.js โหลดเสร็จ — ทำให้ opt-out check ทำงานถูก
 */
export function initAnalytics(stateModule) {
  _state = stateModule;
}

/* === Getters (สำหรับ tests + documentation) ====================== */

/** คืน copy ของ ALLOWED_EVENTS — สำหรับ tests และ docs generator */
export function getAllowedEvents() {
  return { ...ALLOWED_EVENTS };
}
