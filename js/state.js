/* ===================================================================
   state.js — Single source of truth สำหรับข้อมูลทั้งแอป
   ===================================================================
   หลักการ:
   - State ทุกอย่างอยู่ที่นี่ที่เดียว (ไม่กระจาย)
   - localStorage = persistence layer
   - subscribe() = ทุก view re-render เมื่อ state เปลี่ยน
   - ทุก mutation ผ่าน function เพื่อให้ track ได้

   Schema:
   - transactions: รายการ (เห็น utils.js เพื่อรู้ว่า amount เก็บเป็น satang)
   - accounts: บัญชี (auto-detect จาก PDF + cash default)
   - settings: per-user config
   =================================================================== */

import { uuid, todayISO } from './utils.js';
import {
  pushTransaction, softDeleteTransaction as fbSoftDelete,
  hardDeleteTransaction as fbHardDelete,
  subscribeSharedAccount, getCurrentUser
} from './firebase.js';

const STORAGE_KEY = 'diary_finance_v2';

/* === Default state ============================================== */
const DEFAULT_ACCOUNTS = [
  { id: 'cash:default',        type: 'cash',       display_name: 'เงินสด' },
  { id: 'bank:manual:default', type: 'bank',        display_name: 'เงินฝากธนาคาร' },
  { id: 'invest:default',      type: 'investment',  display_name: 'การลงทุน' },
  { id: 'debt:default',        type: 'debt',        display_name: 'หนี้สิน' },
];

function makeDefaultAccount(def) {
  return {
    id: def.id,
    bank: null,
    account_number_masked: '',
    display_name: def.display_name,
    type: def.type,
    current_balance: 0,
    threshold: 0,
    detected_at: new Date().toISOString(),
    user_renamed: false,
    owner: null,
    storage: 'local',
    shared_with: [],
    cash_balance_override: null,
    override_date: null
  };
}

const DEFAULT_USER_PROGRESS = {
  xp: 0, level: 1, streak_days: 0,
  last_coin_date: null, last_streak_date: null,
  coins: { bronze: 0, silver: 0, gold: 0 }
};

const DEFAULT_STATE = {
  transactions: [],
  accounts: DEFAULT_ACCOUNTS.map(makeDefaultAccount),
  settings: {
    threshold_satang: 200000,    // alert ถ้ายอดบัญชีต่ำกว่า 2,000 ฿
    theme: 'diary',
    dark: false,                 // dark mode
    text_size: 'normal',         // 'normal' | 'large' | 'xlarge'
    language: 'th',
    display_name: '',            // ชื่อที่แสดงในบัญชีแชร์ (ไม่ใช่ชื่อ account)
    last_email_backup: null      // YYYY-MM-DD วันที่สำรอง email ล่าสุด
  },
  userProgress: { ...DEFAULT_USER_PROGRESS }
};

// XP thresholds only — avoids circular import with gamification.js
const _LEVEL_XP = [0, 200, 500, 1000, 2000, 3500, 5000, 8000];
function _xpToLevel(xp) {
  let l = 1;
  for (let i = 1; i < _LEVEL_XP.length; i++) {
    if (xp >= _LEVEL_XP[i]) l = i + 1;
  }
  return l;
}


/* === Internal state ============================================= */
let _state = loadFromStorage();
const _listeners      = new Set();
const _sharedListeners = new Map();


/* === Persistence ================================================ */

/**
 * Compact transaction ก่อน save — ลดขนาด ~50%
 * หลักการ: เก็บเฉพาะ field ที่ไม่ใช่ค่า default / null / empty
 * In-memory object ยังเหมือนเดิมทุกอย่าง — compact เฉพาะที่ storage boundary
 */
function compactTx(tx) {
  const c = {
    id:   tx.id,
    date: tx.date,
    type: tx.type,           // เก็บเสมอ (เป็น required field)
    amt:  tx.amount,         // ย่อชื่อ key (ประหยัด 4 bytes)
  };
  // Timestamps: ISO string → Unix ms (24 bytes → 13 bytes × 2 = ประหยัด 22 bytes)
  c.ca = tx.createdAt ? new Date(tx.createdAt).getTime() : Date.now();
  c.ua = tx.updatedAt ? new Date(tx.updatedAt).getTime() : Date.now();

  // Optional fields — ใส่เฉพาะที่ไม่ใช่ค่า default หรือ null/empty
  if (tx.balance   != null)          c.bal  = tx.balance;
  if (tx.group && tx.group !== 'other') c.grp = tx.group;
  else                               c.grp  = 'other';   // always keep group
  if (tx.description)                c.ds   = tx.description;
  if (tx.account_from)               c.af   = tx.account_from;
  if (tx.account_to)                 c.at   = tx.account_to;
  if (tx.source && tx.source !== 'manual') c.src = tx.source;
  if (tx.user_classified === false)  c.uc   = false;  // default=true เก็บเฉพาะ false
  if (tx.created_by)                 c.cb   = tx.created_by;
  if (tx.created_by_name)            c.cn   = tx.created_by_name;
  if (tx.deleted_by)                 c.db   = tx.deleted_by;
  if (tx.pending_sync)               c.ps   = true;
  // ไม่เก็บ: category (คำนวณจาก group ผ่าน CATEGORIES ได้)
  //          bank     (ไม่ถูกใช้ในการแสดงผล icon ใดๆ — ใช้ account.bank แทน)
  return c;
}

/**
 * Expand compacted transaction กลับเป็น full object สำหรับใช้งานใน memory
 */
function expandTx(c) {
  return {
    id:               c.id,
    date:             c.date,
    type:             c.type  || 'expense',
    amount:           c.amt   ?? c.amount ?? 0,   // รองรับ field เก่า (amount) ด้วย
    balance:          c.bal   ?? c.balance ?? null,
    category:         '',                          // derive จาก group ตอนแสดงผล
    group:            c.grp   || c.group   || 'other',
    description:      c.ds    || c.description || '',
    account_from:     c.af    || c.account_from  || null,
    account_to:       c.at    || c.account_to    || null,
    bank:             c.bank  || null,             // รองรับ field เก่า
    source:           c.src   || c.source  || 'manual',
    user_classified:  c.uc    ?? c.user_classified ?? true,
    created_by:       c.cb    || c.created_by       || null,
    created_by_name:  c.cn    || c.created_by_name  || null,
    deleted_by:       c.db    || c.deleted_by        || null,
    ...(c.ps || c.pending_sync ? { pending_sync: true } : {}),
    // Timestamps: Unix ms → ISO string
    createdAt: c.ca
      ? new Date(c.ca).toISOString()
      : (c.createdAt || new Date().toISOString()),
    updatedAt: c.ua
      ? new Date(c.ua).toISOString()
      : (c.updatedAt || new Date().toISOString()),
  };
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    const accounts = parsed.accounts && parsed.accounts.length
      ? parsed.accounts
      : DEFAULT_STATE.accounts;
    // Migration: เพิ่ม default accounts ที่ยังไม่มี
    for (const def of DEFAULT_ACCOUNTS) {
      if (!accounts.find(a => a.id === def.id)) {
        accounts.push(makeDefaultAccount(def));
      }
    }
    return {
      transactions: (parsed.transactions || []).map(expandTx),
      accounts,
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
      userProgress: {
        ...DEFAULT_USER_PROGRESS,
        ...(parsed.userProgress || {}),
        coins: { ...DEFAULT_USER_PROGRESS.coins, ...(parsed.userProgress?.coins || {}) }
      }
    };
  } catch (e) {
    console.warn('Failed to load state, using default', e);
    return structuredClone(DEFAULT_STATE);
  }
}

function saveToStorage() {
  try {
    const myEmail = getCurrentUser()?.email;
    // ห้าม persist บัญชีที่รับแชร์มา — dual condition เพื่อป้องกัน edge case:
    // 1. _received: true  — path ปกติ
    // 2. storage='cloud' + owner ≠ myEmail — defense-in-depth กรณี _received ไม่ถูกตั้ง
    const excludedIds = new Set(
      _state.accounts.filter(a =>
        a._received === true ||
        (myEmail && a.storage === 'cloud' && a.owner !== myEmail)
      ).map(a => a.id)
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      accounts: _state.accounts.filter(a => !excludedIds.has(a.id)),
      transactions: _state.transactions
        .filter(t => !excludedIds.has(t.account_from) && !excludedIds.has(t.account_to))
        .map(compactTx),
      settings: _state.settings,
      userProgress: _state.userProgress
    }));
  } catch (e) {
    console.error('Failed to save state', e);
  }
}


/* === Subscriptions ============================================== */

/**
 * Subscribe ให้ callback ถูกเรียกทุกครั้งที่ state เปลี่ยน
 * @param {function} fn รับ state เป็น argument
 * @returns {function} unsubscribe function
 */
export function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function notify() {
  saveToStorage();
  _listeners.forEach(fn => {
    try { fn(_state); } catch (e) { console.error(e); }
  });
}

/** ทำเครื่องหมาย transaction ว่ายังไม่ได้ sync ขึ้น Firestore */
function _markPendingSync(txId) {
  const idx = _state.transactions.findIndex(t => t.id === txId);
  if (idx !== -1 && !_state.transactions[idx].pending_sync) {
    _state.transactions[idx] = { ..._state.transactions[idx], pending_sync: true };
    saveToStorage();
  }
}


/* === Read API =================================================== */

/** Get current state (read-only — อย่า mutate ตรงๆ) */
export function getState() {
  return _state;
}

/** Get all transactions (เรียงจากใหม่ → เก่า, ซ่อน soft-deleted) */
export function getTransactions() {
  return [..._state.transactions]
    .filter(t => t.deleted_by == null)
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
}

/** Get all accounts */
export function getAccounts() {
  return _state.accounts;
}

/** Get account by id */
export function getAccount(id) {
  return _state.accounts.find(a => a.id === id);
}

/** Get settings */
export function getSettings() {
  return _state.settings;
}


/* === Mutations: Transactions ==================================== */

/**
 * เพิ่มรายการใหม่
 * @param {object} tx ข้อมูล transaction (ต้องมี amount เป็น satang)
 * @returns {object} transaction ที่เพิ่มแล้ว (มี id, timestamps)
 */
export function addTransaction(tx) {
  const now = new Date().toISOString();
  const newTx = {
    id: uuid(),
    date: tx.date || todayISO(),
    type: tx.type || 'expense',           // expense | income | transfer
    amount: Math.abs(tx.amount || 0),     // เก็บ positive เสมอ; type บอก sign
    balance: tx.balance ?? null,
    category: tx.category || '',
    group: tx.group || 'other',
    description: tx.description || '',
    account_from: tx.account_from || null,
    account_to: tx.account_to || null,
    bank: tx.bank || null,
    source: tx.source || 'manual',
    user_classified: tx.user_classified ?? true,
    created_by: getCurrentUser()?.email || tx.created_by || null,
    created_by_name: _state.settings.display_name || getCurrentUser()?.displayName || getCurrentUser()?.email || tx.created_by_name || null,
    deleted_by: null,
    createdAt: now,
    updatedAt: now
  };
  _state.transactions.push(newTx);
  notify();
  const acctId = tx.account_from || tx.account_to;
  const acct = acctId ? getAccount(acctId) : null;
  if (acct?.storage === 'cloud') {
    pushTransaction(acct.id, newTx).catch(() => _markPendingSync(newTx.id));
  }
  return newTx;
}

/** เพิ่มหลายรายการพร้อมกัน (batch จาก PDF import) */
export function addTransactionsBatch(txs) {
  const now = new Date().toISOString();
  const added = txs.map(tx => ({
    id: uuid(),
    createdAt: now,
    updatedAt: now,
    user_classified: false,
    source: 'import',
    ...tx,
    amount: Math.abs(tx.amount || 0),
    created_by: tx.created_by || null,
    deleted_by: null
  }));
  _state.transactions.push(...added);
  notify();
  return added;
}

/** อัปเดตรายการ */
export function updateTransaction(id, patch) {
  const idx = _state.transactions.findIndex(t => t.id === id);
  if (idx === -1) return null;
  _state.transactions[idx] = {
    ..._state.transactions[idx],
    ...patch,
    updatedAt: new Date().toISOString()
  };
  notify();
  const updated = _state.transactions[idx];
  const acctId = updated.account_from || updated.account_to;
  const acct = acctId ? getAccount(acctId) : null;
  if (acct?.storage === 'cloud') {
    pushTransaction(acct.id, updated).catch(() => _markPendingSync(updated.id));
  }
  return updated;
}

/** Soft delete — ตั้ง deleted_by แทนการลบจริง (ใช้กับ shared accounts) */
export function softDeleteTransaction(id, deletedByEmail) {
  const tx = _state.transactions.find(t => t.id === id);
  if (!tx) return null;
  tx.deleted_by = deletedByEmail;
  tx.updatedAt = new Date().toISOString();
  notify();
  return tx;
}

/** ลบรายการ — cloud: 2 ขั้น (soft → hard), local: ลบทันที */
export function deleteTransaction(id) {
  const tx = _state.transactions.find(t => t.id === id);
  if (!tx) return;
  const acctId = tx.account_from || tx.account_to;
  const acct = acctId ? getAccount(acctId) : null;
  if (acct?.storage === 'cloud') {
    const email = getCurrentUser()?.email || null;
    if (tx.deleted_by != null) {
      // ขั้น 2: คนที่ 2 กดลบ → ลบถาวรจาก Firestore + local
      _state.transactions = _state.transactions.filter(t => t.id !== id);
      notify();
      fbHardDelete(acct.id, id).catch(console.error);
    } else {
      // ขั้น 1: soft delete — แสดงสีเทา ไม่นับในการคำนวณ
      softDeleteTransaction(id, email);
      fbSoftDelete(acct.id, id, email).catch(console.error);
    }
  } else {
    _state.transactions = _state.transactions.filter(t => t.id !== id);
    notify();
  }
}


/* === Mutations: Accounts ======================================== */

export function addAccount(account) {
  const newAcct = {
    id: account.id || uuid(),
    bank: account.bank || null,
    account_number_masked: account.account_number_masked || '',
    display_name: account.display_name || 'บัญชีใหม่',
    type: account.type || 'bank',
    current_balance: account.current_balance ?? 0,
    threshold: account.threshold ?? _state.settings.threshold_satang,
    detected_at: new Date().toISOString(),
    user_renamed: false,
    owner: account.owner || null,
    storage: account.storage || 'local',
    shared_with: account.shared_with || [],
    cash_balance_override: account.cash_balance_override ?? null,
    override_date: account.override_date ?? null
  };
  _state.accounts.push(newAcct);
  notify();
  return newAcct;
}

export function updateAccount(id, patch) {
  const idx = _state.accounts.findIndex(a => a.id === id);
  if (idx === -1) return null;
  _state.accounts[idx] = { ..._state.accounts[idx], ...patch };
  notify();
  return _state.accounts[idx];
}

export function removeAccount(id) {
  const idx = _state.accounts.findIndex(a => a.id === id);
  if (idx === -1) return;
  _state.accounts.splice(idx, 1);
  notify();
}

/** ลบรายการทั้งหมดของบัญชี แต่คงบัญชีไว้ */
export function removeAccountTransactions(accountId) {
  _state.transactions = _state.transactions.filter(
    t => t.account_from !== accountId && t.account_to !== accountId
  );
  notify();
}

/** ลบบัญชีพร้อมรายการทั้งหมดที่เกี่ยวข้อง */
export function removeAccountWithTransactions(id) {
  _state.transactions = _state.transactions.filter(
    t => t.account_from !== id && t.account_to !== id
  );
  const idx = _state.accounts.findIndex(a => a.id === id);
  if (idx !== -1) _state.accounts.splice(idx, 1);
  notify();
}


/* === Mutations: Settings ======================================== */

export function setSetting(key, value) {
  _state.settings[key] = value;
  notify();
}


/* === Gamification: User Progress ================================ */

export function getUserProgress() {
  return { ..._state.userProgress };
}

export function updateUserProgress(patch) {
  _state.userProgress = {
    ..._state.userProgress,
    ...patch,
    coins: { ..._state.userProgress.coins, ...(patch.coins || {}) }
  };
  _state.userProgress.level = _xpToLevel(_state.userProgress.xp);
  saveToStorage();
}


/* === Computed / derived ========================================= */

/** รายการที่ยังไม่ถูกลบ — base filter สำหรับ computed functions ทั้งหมด */
function activeTxs() {
  return _state.transactions.filter(t => t.deleted_by == null);
}

/**
 * คำนวณยอดคงเหลือของบัญชีจากรายการที่บันทึกไว้
 *
 * กฎ:
 * 1. balance field จาก PDF statement เชื่อถือได้เฉพาะ account_from (ต้นทาง)
 *    — ห้ามใช้ balance จาก tx ที่บัญชีนี้เป็น account_to เพราะเป็นยอดของบัญชีอื่น
 * 2. หลังยึดยอดจาก tx ล่าสุดที่มี balance field แล้ว
 *    ให้บวก/ลบ tx ที่เกิดหลังจากนั้นและไม่มี balance field (manual entries)
 * 3. ถ้าไม่มี balance field เลย → คำนวณจาก opening balance + sum ทุกรายการ
 */
export function computeAccountBalance(accountId) {
  const txs = activeTxs().filter(t =>
    t.account_from === accountId || t.account_to === accountId
  );
  if (!txs.length) return getAccount(accountId)?.current_balance ?? 0;

  // ใช้ balance field เฉพาะ tx ที่บัญชีนี้เป็น account_from (ต้นทาง)
  const withBal = txs
    .filter(t => t.balance != null && t.account_from === accountId)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));

  if (withBal.length) {
    const anchor = withBal[0];
    // บวก/ลบ tx ที่เกิดหลัง anchor และไม่มี balance field (manual entries หลัง import)
    const laterTxs = txs.filter(t =>
      t.balance == null &&
      (t.date > anchor.date ||
        (t.date === anchor.date && (t.createdAt || '') > (anchor.createdAt || '')))
    );
    return laterTxs.reduce((sum, t) => {
      if (t.account_to   === accountId) return sum + t.amount;
      if (t.account_from === accountId) return sum - t.amount;
      return sum;
    }, anchor.balance);
  }

  // ไม่มี balance field เลย — คำนวณจาก opening balance + sum ทุกรายการ
  const openingBal = getAccount(accountId)?.current_balance ?? 0;
  return txs.reduce((sum, t) => {
    if (t.account_to   === accountId) return sum + t.amount;
    if (t.account_from === accountId) return sum - t.amount;
    return sum;
  }, openingBal);
}

/**
 * ยอดคงเหลือของ cash account โดยคำนึงถึง override ที่ user ตั้งไว้
 * ถ้ามี override → นับจาก override_date เป็นต้นไป + ยอดเปลี่ยนแปลงหลัง override
 * ถ้าไม่มี override → ใช้ computeAccountBalance เดิม
 */
export function getEffectiveCashBalance(accountId) {
  const acct = getAccount(accountId);
  if (!acct || acct.type !== 'cash') return 0;
  if (acct.cash_balance_override !== null && acct.override_date) {
    const afterOverride = activeTxs()
      .filter(t =>
        t.date >= acct.override_date &&
        (t.account_from === accountId || t.account_to === accountId)
      )
      .reduce((sum, t) => {
        if (t.type === 'income'   && t.account_to   === accountId) return sum + t.amount;
        if (t.type === 'expense'  && t.account_from === accountId) return sum - t.amount;
        if (t.type === 'transfer' && t.account_to   === accountId) return sum + t.amount;
        if (t.type === 'transfer' && t.account_from === accountId) return sum - t.amount;
        return sum;
      }, 0);
    return acct.cash_balance_override + afterOverride;
  }
  return computeAccountBalance(accountId);
}

/** ตั้ง override ยอดเงินสดจริง ณ วันที่ระบุ (หน่วย satang) */
export function setCashOverride(accountId, amount, date) {
  updateAccount(accountId, {
    cash_balance_override: amount,
    override_date: date
  });
}

/**
 * สรุปยอดเดือนที่ระบุ
 * @param {string} yearMonth "YYYY-MM"; default = เดือนปัจจุบัน
 */
export function getMonthSummary(yearMonth = todayISO().slice(0, 7)) {
  const txs = activeTxs().filter(t => t.date.startsWith(yearMonth));
  let income = 0, expense = 0;
  for (const t of txs) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
    // transfer ไม่นับใน income/expense
  }
  return {
    income,
    expense,
    net: income - expense,
    count: txs.length
  };
}

/**
 * ยอดรวมทุกบัญชีก่อนต้นเดือน yearMonth (opening balance)
 *
 * คำนวณโดย: เอา current balance ทุกบัญชี แล้วลบ income/expense
 * ที่เกิดตั้งแต่ต้น yearMonth เป็นต้นไป (ย้อนกลับ)
 * — วิธีนี้รับประกันว่า closing(M) === opening(M+1) เสมอ
 *   และใช้ current_balance / balance anchor เดียวกับ computeAccountBalance
 *
 * @param {string} yearMonth "YYYY-MM"
 */
export function getOpeningBalance(yearMonth) {
  const cutoff = yearMonth + '-01';

  // ถ้าไม่มีรายการก่อนเดือนนี้เลย → เดือนแรกสุด → ยกมา 0
  const hasHistory = activeTxs().some(t => t.date < cutoff);
  if (!hasHistory) return 0;

  // ยอดรวมปัจจุบันของทุกบัญชี (ใช้ logic เดียวกับ dashboard)
  const totalCurrent = getAccounts().reduce((s, acct) => {
    const bal = acct.type === 'cash'
      ? getEffectiveCashBalance(acct.id)
      : computeAccountBalance(acct.id);
    return s + bal;
  }, 0);

  // หัก income / บวกคืน expense ที่เกิดตั้งแต่ cutoff เป็นต้นไป
  // (transfers ไม่นับ — เท่ากันทั้งสองบัญชีจึงตัดกันเองที่ portfolio level)
  let futureIncome = 0, futureExpense = 0;
  for (const t of activeTxs()) {
    if (t.date < cutoff) continue;
    if (t.type === 'income')  futureIncome  += t.amount;
    else if (t.type === 'expense') futureExpense += t.amount;
  }

  return totalCurrent - futureIncome + futureExpense;
}

/**
 * สรุปยอดเดือน พร้อม opening/closing carry
 * @returns { opening, income, expense, closing }
 */
export function getMonthSummaryWithCarry(yearMonth) {
  const opening = getOpeningBalance(yearMonth);
  const { income, expense } = getMonthSummary(yearMonth);
  return { opening, income, expense, closing: opening + income - expense };
}

/**
 * Top categories ในเดือนที่ระบุ (เฉพาะรายจ่าย)
 * @returns array ของ { group, total, count, percent }
 */
export function getTopCategories(yearMonth = todayISO().slice(0, 7), limit = 5) {
  const txs = activeTxs().filter(t =>
    t.date.startsWith(yearMonth) && t.type === 'expense'
  );
  const totals = {};
  for (const t of txs) {
    totals[t.group] = (totals[t.group] || 0) + t.amount;
  }
  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0) || 1;
  return Object.entries(totals)
    .map(([group, total]) => ({
      group,
      total,
      percent: Math.round((total / grandTotal) * 100)
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

/**
 * รายการของวันนี้ — สำหรับ dashboard
 */
export function getTodayTransactions() {
  const today = todayISO();
  return activeTxs()
    .filter(t => t.date === today)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

/**
 * Group transactions by day — สำหรับ list view
 * @returns array ของ { date, transactions, dayTotalIncome, dayTotalExpense }
 */
export function getTransactionsByDay(filterFn = null) {
  // รวม soft-deleted จาก cloud accounts (แสดงสีเทา) แต่ไม่รวมที่ hard-deleted
  let txs = _state.transactions.filter(t => {
    if (t.deleted_by != null) {
      const acct = getAccount(t.account_from || t.account_to);
      return acct?.storage === 'cloud';
    }
    return true;
  });
  if (filterFn) txs = txs.filter(filterFn);

  const groups = {};
  for (const t of txs) {
    if (!groups[t.date]) groups[t.date] = [];
    groups[t.date].push(t);
  }

  return Object.entries(groups)
    .map(([date, transactions]) => {
      let income = 0, expense = 0;
      for (const t of transactions) {
        if (t.deleted_by != null) continue; // soft-deleted ไม่นับในยอดวัน
        if (t.type === 'income') income += t.amount;
        else if (t.type === 'expense') expense += t.amount;
      }
      transactions.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return { date, transactions, dayTotalIncome: income, dayTotalExpense: expense };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}


/**
 * รายจ่ายรายวันย้อนหลัง N วัน — สำหรับ bar chart
 * @param {number} days จำนวนวัน (default 14)
 * @returns array ของ { date, total } เรียงเก่า → ใหม่
 */
export function getDailyExpenses(days = 14) {
  const result = [];
  const today = new Date();
  const active = activeTxs();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const total = active
      .filter(t => t.date === iso && t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);
    result.push({ date: iso, total });
  }
  return result;
}


/**
 * เปรียบเทียบรายจ่ายเดือนนี้ vs เดือนก่อน (เฉพาะวันที่ผ่านมาเท่ากัน)
 * @returns { thisMonth, lastMonth, dayCount, percentChange }
 */
export function getMonthComparison() {
  const today = new Date();
  const dayOfMonth = today.getDate();
  const active = activeTxs();

  // เดือนนี้: วันที่ 1 ถึงวันนี้
  const thisYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const thisMonth = active
    .filter(t => t.date.startsWith(thisYM) && t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);

  // เดือนก่อน: วันที่ 1 ถึงวันที่เดียวกัน เพื่อ apple-to-apple
  const lastDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastYM = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = active
    .filter(t => {
      if (!t.date.startsWith(lastYM) || t.type !== 'expense') return false;
      const dom = parseInt(t.date.slice(8, 10), 10);
      return dom <= dayOfMonth;
    })
    .reduce((s, t) => s + t.amount, 0);

  const percentChange = lastMonth > 0
    ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100)
    : null;

  return { thisMonth, lastMonth, dayCount: dayOfMonth, percentChange };
}


/* === Reset / debug ============================================== */

/** ลบข้อมูลทั้งหมด — ใช้ใน Settings */
export function resetAll() {
  _state = structuredClone(DEFAULT_STATE);
  notify();
}

/** Export ข้อมูลทั้งหมดเป็น JSON string — สำหรับ backup (cloud accounts ไม่รวม) */
export function exportJSON() {
  const cloudIds = new Set(
    _state.accounts.filter(a => a.storage === 'cloud').map(a => a.id)
  );
  return JSON.stringify({
    accounts: _state.accounts.filter(a => !cloudIds.has(a.id)),
    transactions: _state.transactions.filter(t =>
      !cloudIds.has(t.account_from) && !cloudIds.has(t.account_to)
    ),
    settings: _state.settings
  }, null, 2);
}

/** Import ข้อมูลจาก JSON string — restore from backup */
export function importJSON(json) {
  try {
    const parsed = JSON.parse(json);
    if (!parsed.transactions || !parsed.accounts) throw new Error('Invalid format');
    // เก็บ cloud accounts (บัญชีแชร์) ปัจจุบันไว้ — backup ไม่มี cloud accounts (exportJSON กรองออก)
    // ถ้าไม่เก็บ การ restore จะลบสถานะแชร์ออกจาก local ขณะที่ Firestore ยังมีอยู่ = orphan
    const cloudAccounts = _state.accounts.filter(a => a.storage === 'cloud');
    const cloudIds = new Set(cloudAccounts.map(a => a.id));
    const cloudTxs = _state.transactions.filter(t =>
      cloudIds.has(t.account_from) || cloudIds.has(t.account_to)
    );
    _state = {
      transactions: [
        ...parsed.transactions.filter(t =>
          !cloudIds.has(t.account_from) && !cloudIds.has(t.account_to)
        ),
        ...cloudTxs
      ],
      accounts: [
        ...parsed.accounts.filter(a => !cloudIds.has(a.id)),
        ...cloudAccounts
      ],
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
      userProgress: {
        ...DEFAULT_USER_PROGRESS,
        ...(parsed.userProgress || {}),
        coins: { ...DEFAULT_USER_PROGRESS.coins, ...(parsed.userProgress?.coins || {}) }
      }
    };
    notify();
    return true;
  } catch (e) {
    console.error('Import failed', e);
    return false;
  }
}


/* === Hybrid cloud sync ========================================== */

/**
 * เปิด realtime listeners สำหรับทุก account ที่ storage === 'cloud'
 * remote transactions จะ merge เข้า _state.transactions อัตโนมัติ
 */
/**
 * Merge บัญชีที่คนอื่นแชร์มาให้เรา เข้า _state.accounts
 * เรียกหลังได้รับผลจาก subscribeAccountsSharedWithMe
 */
export function mergeSharedAccounts(remoteAccounts) {
  const myEmail = getCurrentUser()?.email;
  if (!myEmail) return; // ยังไม่ sign in — ไม่สามารถแยก "ของฉัน" vs "ของคนอื่น" ได้
  const remoteIds = new Set(remoteAccounts.map(a => a.id));
  let changed = false;

  // ลบบัญชีที่ไม่ใช่ของเราและไม่อยู่ใน remote list อีกต่อไป (แชร์ถูกยกเลิก)
  // เงื่อนไข: cloud + owner ไม่ใช่เรา (รวมกรณี owner = null ซึ่งเป็น orphan)
  const revokedIds = new Set();
  _state.accounts = _state.accounts.filter(a => {
    if (a.storage === 'cloud' && a.owner !== myEmail && !remoteIds.has(a.id)) {
      revokedIds.add(a.id);
      changed = true;
      return false;
    }
    return true;
  });

  // ลบ transactions + ปิด listener ของบัญชีที่ถูกยกเลิกการแชร์
  if (revokedIds.size > 0) {
    _state.transactions = _state.transactions.filter(t =>
      !revokedIds.has(t.account_from) && !revokedIds.has(t.account_to)
    );
    revokedIds.forEach(id => {
      const unsub = _sharedListeners.get(id);
      if (unsub) { unsub(); _sharedListeners.delete(id); }
    });
  }

  for (const ra of remoteAccounts) {
    const idx = _state.accounts.findIndex(a => a.id === ra.id);
    if (idx === -1) {
      _state.accounts.push({ ...ra, storage: 'cloud', _received: true });
      changed = true;
    } else {
      _state.accounts[idx] = { ..._state.accounts[idx], ...ra, storage: 'cloud', _received: true };
      changed = true;
    }
  }
  if (changed) {
    notify(); // re-render + saveToStorage
  } else {
    // ไม่มีอะไรเปลี่ยนใน memory แต่ยังต้องล้าง localStorage
    // กรณีที่บัญชีรับแชร์ค้างอยู่ใน localStorage จาก bug เก่า
    saveToStorage();
  }
}

/**
 * กู้คืนบัญชีที่เราเป็นเจ้าของและแชร์ไว้ จาก Firestore กลับเข้า local state
 * แก้กรณี restore backup (ที่ไม่มี cloud accounts) ทำให้สถานะแชร์หายจาก local
 * ขณะที่ Firestore ยังมีอยู่ → owner มองไม่เห็น/revoke ไม่ได้ + recipient เห็นค้าง
 */
export function restoreOwnedAccounts(remoteAccounts) {
  const myEmail = getCurrentUser()?.email;
  if (!myEmail) return;
  let changed = false;
  for (const ra of remoteAccounts) {
    if (ra.owner !== myEmail) continue;
    const idx = _state.accounts.findIndex(a => a.id === ra.id);
    if (idx === -1) {
      // บัญชีหายจาก local (เช่นหลัง restore backup) → เพิ่มกลับเป็น cloud account
      _state.accounts.push({
        id: ra.id,
        bank: ra.bank ?? null,
        account_number_masked: ra.account_number_masked ?? '',
        display_name: ra.display_name || 'บัญชีที่แชร์',
        type: ra.type || 'bank',
        current_balance: 0,
        threshold: ra.threshold ?? 0,
        detected_at: new Date().toISOString(),
        user_renamed: false,
        owner: myEmail,
        storage: 'cloud',
        shared_with: ra.shared_with || [],
        cash_balance_override: null,
        override_date: null
      });
      changed = true;
    } else {
      // มีอยู่แล้ว → sync สถานะแชร์ให้ตรงกับ Firestore
      const a = _state.accounts[idx];
      const needUpdate = a.storage !== 'cloud' || a.owner !== myEmail ||
        JSON.stringify(a.shared_with || []) !== JSON.stringify(ra.shared_with || []);
      if (needUpdate) {
        _state.accounts[idx] = { ...a, storage: 'cloud', owner: myEmail, shared_with: ra.shared_with || [] };
        changed = true;
      }
    }
  }
  if (changed) notify();
}

export function subscribeSharedAccounts() {
  const cloudIds = new Set(
    _state.accounts.filter(a => a.storage === 'cloud').map(a => a.id)
  );

  // ปิด listeners สำหรับบัญชีที่ไม่ได้อยู่ใน state แล้ว
  for (const [id, unsub] of _sharedListeners) {
    if (!cloudIds.has(id)) { unsub(); _sharedListeners.delete(id); }
  }

  // เปิด listener เฉพาะบัญชีที่ยังไม่มี — ไม่รีสตาร์ทบัญชีที่ subscribe อยู่แล้ว
  for (const acct of _state.accounts) {
    if (acct.storage !== 'cloud') continue;
    if (_sharedListeners.has(acct.id)) continue;
    const accountId = acct.id;
    const unsub = subscribeSharedAccount(accountId, (upserted, removedIds, allIds) => {
      // Merge/update transactions (รวม soft-deleted)
      upserted.forEach(rtx => {
        const idx = _state.transactions.findIndex(t => t.id === rtx.id);
        if (idx === -1) _state.transactions.push(rtx);
        else _state.transactions[idx] = rtx;
      });

      // ลบ hard-deleted transactions ออกจาก local
      if (removedIds.length > 0) {
        _state.transactions = _state.transactions.filter(t => !removedIds.includes(t.id));
      }

      // Reconcile: ลบ tx ของบัญชีนี้ที่ไม่มีใน Firestore แล้ว (hard-deleted ตอน offline)
      // ยกเว้น pending_sync ที่ยัง push ขึ้น Firestore ไม่สำเร็จ
      if (Array.isArray(allIds)) {
        const liveIds = new Set(allIds);
        _state.transactions = _state.transactions.filter(t => {
          const belongsToAccount = t.account_from === accountId || t.account_to === accountId;
          if (belongsToAccount && !liveIds.has(t.id) && !t.pending_sync) return false;
          return true;
        });
      }

      // อัปเดต current_balance จาก transaction ล่าสุดที่มี balance field
      const acctIdx = _state.accounts.findIndex(a => a.id === accountId);
      if (acctIdx !== -1) {
        const latest = upserted
          .filter(t => t.deleted_by == null && t.balance != null)
          .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
        if (latest) {
          _state.accounts[acctIdx].current_balance = latest.balance;
        }
      }

      notify();
    }, e => {
      // permission-denied = บัญชีนี้ถูกยกเลิกการแชร์แล้ว ลบออกจาก local state
      if (e?.code === 'permission-denied') {
        _state.accounts = _state.accounts.filter(a => a.id !== accountId);
        _state.transactions = _state.transactions.filter(t =>
          t.account_from !== accountId && t.account_to !== accountId
        );
        const u = _sharedListeners.get(accountId);
        if (u) { u(); _sharedListeners.delete(accountId); }
        notify();
      }
    });
    _sharedListeners.set(accountId, unsub);
  }
}

/** ปิด realtime listeners ทั้งหมด — เรียกตอน sign out หรือ unmount */
export function unsubscribeAll() {
  _sharedListeners.forEach(unsub => unsub());
  _sharedListeners.clear();
}

/**
 * ลบบัญชีที่คนอื่นแชร์ให้เรา + transactions ออกจาก local state
 * เรียกตอน sign out เพื่อล้าง UI ทันที
 */
export function clearReceivedAccounts(myEmail) {
  if (!myEmail) return;
  const removedIds = new Set();
  _state.accounts = _state.accounts.filter(a => {
    if (a.storage === 'cloud' && a.owner !== myEmail) {
      removedIds.add(a.id);
      return false;
    }
    return true;
  });
  if (removedIds.size > 0) {
    _state.transactions = _state.transactions.filter(t =>
      !removedIds.has(t.account_from) && !removedIds.has(t.account_to)
    );
    notify();
  } else {
    // ไม่มีอะไรลบจาก memory แต่ยังต้อง clean localStorage
    // กรณีข้อมูลค้างอยู่ใน localStorage จาก session เก่าหรือ bug
    saveToStorage();
  }
}

/**
 * Retry push transactions ที่ push ไม่สำเร็จขณะ sign out
 * เรียกหลัง sign in — คืนจำนวนรายการที่ sync สำเร็จ
 */
export async function retryPendingSync() {
  const pending = _state.transactions.filter(t => t.pending_sync === true);
  if (pending.length === 0) return 0;

  let synced = 0;
  for (const tx of pending) {
    const acctId = tx.account_from || tx.account_to;
    const acct = acctId ? getAccount(acctId) : null;
    if (acct?.storage !== 'cloud') continue;
    try {
      const { pending_sync, ...txData } = tx;
      await pushTransaction(acct.id, txData);
      const idx = _state.transactions.findIndex(t => t.id === tx.id);
      if (idx !== -1) delete _state.transactions[idx].pending_sync;
      synced++;
    } catch (e) {
      console.error('[sync] retry failed', tx.id, e);
    }
  }
  if (synced > 0) saveToStorage();
  return synced;
}
