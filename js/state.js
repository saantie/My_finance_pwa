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
  subscribeSharedAccount, getCurrentUser
} from './firebase.js';

const STORAGE_KEY = 'diary_finance_v1';

/* === Default state ============================================== */
const DEFAULT_STATE = {
  transactions: [],
  accounts: [
    // Cash account สร้างให้ default — user ใช้ทันที
    {
      id: 'cash:default',
      bank: null,
      account_number_masked: '',
      display_name: 'เงินสด',
      type: 'cash',
      current_balance: 0,
      threshold: 0,
      detected_at: new Date().toISOString(),
      user_renamed: false,
      owner: null,
      storage: 'local',
      shared_with: []
    }
  ],
  settings: {
    threshold_satang: 200000,    // alert ถ้ายอดบัญชีต่ำกว่า 2,000 ฿
    theme: 'diary',
    text_size: 'normal',         // 'normal' | 'large' | 'xlarge'
    language: 'th'
  }
};


/* === Internal state ============================================= */
let _state = loadFromStorage();
const _listeners      = new Set();
const _sharedListeners = new Map();


/* === Persistence ================================================ */

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    // Merge กับ default — เผื่อ schema เพิ่ม field ใหม่ในเวอร์ชันถัดไป
    return {
      transactions: parsed.transactions || [],
      accounts: parsed.accounts && parsed.accounts.length ? parsed.accounts : DEFAULT_STATE.accounts,
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) }
    };
  } catch (e) {
    console.warn('Failed to load state, using default', e);
    return structuredClone(DEFAULT_STATE);
  }
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
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
    deleted_by: null,
    createdAt: now,
    updatedAt: now
  };
  _state.transactions.push(newTx);
  notify();
  const acctId = tx.account_from || tx.account_to;
  const acct = acctId ? getAccount(acctId) : null;
  if (acct?.storage === 'cloud') {
    pushTransaction(acct.id, newTx).catch(console.error);
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
  return _state.transactions[idx];
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

/** ลบรายการ — cloud accounts ใช้ soft delete, local accounts ลบออก array */
export function deleteTransaction(id) {
  const tx = _state.transactions.find(t => t.id === id);
  if (!tx) return;
  const acctId = tx.account_from || tx.account_to;
  const acct = acctId ? getAccount(acctId) : null;
  if (acct?.storage === 'cloud') {
    const email = getCurrentUser()?.email || null;
    softDeleteTransaction(id, email);
    fbSoftDelete(acct.id, id, email).catch(console.error);
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
    shared_with: account.shared_with || []
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


/* === Mutations: Settings ======================================== */

export function setSetting(key, value) {
  _state.settings[key] = value;
  notify();
}


/* === Computed / derived ========================================= */

/** รายการที่ยังไม่ถูกลบ — base filter สำหรับ computed functions ทั้งหมด */
function activeTxs() {
  return _state.transactions.filter(t => t.deleted_by == null);
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
  let txs = activeTxs();
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
        if (t.type === 'income') income += t.amount;
        else if (t.type === 'expense') expense += t.amount;
      }
      // เรียงในวันเดียวกัน — ใหม่ขึ้นก่อน
      transactions.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return { date, transactions, dayTotalIncome: income, dayTotalExpense: expense };
    })
    .sort((a, b) => b.date.localeCompare(a.date));     // วันใหม่ก่อน
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

/** Export ข้อมูลทั้งหมดเป็น JSON string — สำหรับ backup */
export function exportJSON() {
  return JSON.stringify(_state, null, 2);
}

/** Import ข้อมูลจาก JSON string — restore from backup */
export function importJSON(json) {
  try {
    const parsed = JSON.parse(json);
    if (!parsed.transactions || !parsed.accounts) throw new Error('Invalid format');
    _state = {
      transactions: parsed.transactions,
      accounts: parsed.accounts,
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) }
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
  const remoteIds = new Set(remoteAccounts.map(a => a.id));
  let changed = false;

  // ลบบัญชีที่คนอื่นเคยแชร์ให้เรา แต่ถูกยกเลิกการแชร์แล้ว
  _state.accounts = _state.accounts.filter(a => {
    if (a.storage === 'cloud' && a.owner && a.owner !== myEmail && !remoteIds.has(a.id)) {
      changed = true;
      return false;
    }
    return true;
  });

  for (const ra of remoteAccounts) {
    const idx = _state.accounts.findIndex(a => a.id === ra.id);
    if (idx === -1) {
      _state.accounts.push({ ...ra, storage: 'cloud' });
      changed = true;
    } else {
      _state.accounts[idx] = { ..._state.accounts[idx], ...ra, storage: 'cloud' };
      changed = true;
    }
  }
  if (changed) notify();
}

export function subscribeSharedAccounts() {
  // ปิด listeners เก่าก่อน แล้วเปิดใหม่ทุก cloud account
  _sharedListeners.forEach(unsub => unsub());
  _sharedListeners.clear();

  for (const acct of _state.accounts) {
    if (acct.storage !== 'cloud') continue;
    const accountId = acct.id;
    const unsub = subscribeSharedAccount(accountId, remoteTxs => {
      // Merge transactions
      remoteTxs.forEach(rtx => {
        const idx = _state.transactions.findIndex(t => t.id === rtx.id);
        if (idx === -1) _state.transactions.push(rtx);
        else _state.transactions[idx] = rtx;
      });

      // อัปเดต current_balance จาก transaction ล่าสุดที่มี balance field
      const acctIdx = _state.accounts.findIndex(a => a.id === accountId);
      if (acctIdx !== -1) {
        const latest = remoteTxs
          .filter(t => t.deleted_by == null && t.balance != null)
          .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
        if (latest) {
          _state.accounts[acctIdx].current_balance = latest.balance;
        }
      }

      notify();
    });
    _sharedListeners.set(accountId, unsub);
  }
}

/** ปิด realtime listeners ทั้งหมด — เรียกตอน sign out หรือ unmount */
export function unsubscribeAll() {
  _sharedListeners.forEach(unsub => unsub());
  _sharedListeners.clear();
}
