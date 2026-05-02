// js/store.js — Transaction store + analytics.
// All amounts are integer satang. All dates are ISO "YYYY-MM-DD" CE.
//
// Transaction shape:
//   {
//     id: string,
//     date: "2026-01-15",
//     type: "income" | "expense" | "investment" | "debt",
//     amount: number (satang, always positive),
//     balance: number|null (satang, end-of-transaction running balance from statement),
//     category: string,            // user-friendly bucket e.g. "เงินเดือน", "บัตรเครดิต"
//     group: string,               // raw bucket key e.g. "salary", "creditcard"
//     description: string,
//     bank: string|null,           // "ktb", "kbank", ...
//     account: string|null,
//     source: "import" | "manual" | "voice" | "sheet",
//     createdAt: ISO timestamp
//   }

(function (root) {
  'use strict';

  const U = (typeof require === 'function') ? require('./utils.js') : root.U;
  const STORAGE_KEY = 'fpwa.tx.v2';
  const SETTINGS_KEY = 'fpwa.settings.v2';

  // Group classification rules. Each rule: {match: regex|fn, group, category, type}.
  // Order matters — first match wins.
  const RULES = [
    // Income
    { match: /BSD02|เงินเดือน|salary|payroll/i, group: 'salary', category: 'เงินเดือน', type: 'income' },
    { match: /NBSDT|TRSF.*IN|FT.*IN|รับโอน|โอนเข้า|incoming/i, group: 'transfer_in', category: 'รับโอน', type: 'income' },
    { match: /ดอกเบี้ย|interest/i, group: 'interest', category: 'ดอกเบี้ย', type: 'income' },
    { match: /refund|คืนเงิน/i, group: 'refund', category: 'เงินคืน', type: 'income' },

    // Expense — be careful: "ATM" can appear in many strings, so put broader rules later
    { match: /KTC|บัตรเครดิต|credit card|VISA|MASTER/i, group: 'creditcard', category: 'บัตรเครดิต', type: 'expense' },
    { match: /DDSWT|direct ?debit|หักอัตโนมัติ|หักบัญชี/i, group: 'autodebit', category: 'หักอัตโนมัติ', type: 'expense' },
    { match: /พร้อมเพย์|promptpay/i, group: 'promptpay', category: 'พร้อมเพย์', type: 'expense' },
    { match: /bill ?payment|จ่ายบิล|ชำระค่า/i, group: 'bill', category: 'จ่ายบิล', type: 'expense' },
    { match: /ATM\b|ถอนเงินสด|cash ?withdrawal/i, group: 'atm', category: 'ถอน ATM', type: 'expense' },
    { match: /โอนออก|transfer ?out|TRSF.*OUT|FT.*OUT|outgoing/i, group: 'transfer_out', category: 'โอนออก', type: 'expense' },
    { match: /ค่าธรรมเนียม|fee|service charge/i, group: 'fee', category: 'ค่าธรรมเนียม', type: 'expense' },

    // Investment
    { match: /กองทุน|fund|stock|หุ้น|securities|SET\b|TFEX/i, group: 'investment', category: 'ลงทุน', type: 'investment' },

    // Debt
    { match: /loan|สินเชื่อ|ผ่อน|installment/i, group: 'debt', category: 'หนี้สิน/ผ่อน', type: 'debt' }
  ];

  function classify(description, hintType) {
    if (!description) {
      return { type: hintType || 'expense', group: 'other', category: 'อื่นๆ' };
    }
    for (const r of RULES) {
      if (r.match.test(description)) return { type: r.type, group: r.group, category: r.category };
    }
    // Fallback: if hint says income, bucket as transfer_in else other expense
    if (hintType === 'income') return { type: 'income', group: 'other', category: 'รับเข้าอื่นๆ' };
    return { type: 'expense', group: 'other', category: 'จ่ายออกอื่นๆ' };
  }

  // ---------- Store ----------

  class Store {
    constructor() {
      this.tx = [];
      this.settings = { threshold: 200000, /* satang = 2000 baht */ sheetId: null };
      this.listeners = new Set();
    }

    load() {
      try {
        const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(STORAGE_KEY) : null;
        this.tx = raw ? JSON.parse(raw) : [];
      } catch (e) { this.tx = []; }
      try {
        const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(SETTINGS_KEY) : null;
        if (raw) Object.assign(this.settings, JSON.parse(raw));
      } catch (e) { /* ignore */ }
    }

    save() {
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tx));
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
      } catch (e) {
        // Quota exceeded — bubble up so UI can warn
        this._emit('error', { kind: 'quota', error: e });
      }
    }

    onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    _emit(evt, payload) { this.listeners.forEach(fn => { try { fn(evt, payload); } catch (e) {} }); }

    setSettings(patch) {
      Object.assign(this.settings, patch);
      this.save();
      this._emit('settings', this.settings);
    }

    add(t) {
      const tx = this._normalize(t);
      if (!this._isValid(tx)) return null;
      this.tx.push(tx);
      this._sort();
      this.save();
      this._emit('change');
      return tx;
    }

    addMany(arr) {
      const normalized = arr.map(t => this._normalize(t)).filter(t => this._isValid(t));
      // Dedup vs existing by (date, amount, description) — naive but useful
      const sig = t => `${t.date}|${t.amount}|${(t.description || '').trim()}`;
      const existing = new Set(this.tx.map(sig));
      const fresh = normalized.filter(t => !existing.has(sig(t)));
      this.tx.push(...fresh);
      this._sort();
      this.save();
      this._emit('change');
      return { added: fresh.length, skipped: arr.length - fresh.length };
    }

    _isValid(tx) {
      if (!tx) return false;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tx.date || '')) return false;
      if (!Number.isFinite(tx.amount) || tx.amount <= 0) return false;
      if (!['income', 'expense', 'investment', 'debt'].includes(tx.type)) return false;
      return true;
    }

    remove(id) {
      const i = this.tx.findIndex(t => t.id === id);
      if (i >= 0) {
        this.tx.splice(i, 1);
        this.save();
        this._emit('change');
        return true;
      }
      return false;
    }

    clear() { this.tx = []; this.save(); this._emit('change'); }

    list() { return this.tx.slice(); }

    _normalize(t) {
      const desc = t.description || '';
      const cls = (t.type && t.group && t.category)
        ? { type: t.type, group: t.group, category: t.category }
        : classify(desc, t.type);
      const amount = (typeof t.amount === 'number')
        ? Math.abs(Math.round(t.amount))
        : Math.abs(U.toSatang(t.amount) || 0);
      return {
        id: t.id || U.uuid(),
        date: t.date,
        type: cls.type,
        amount,
        balance: (t.balance === undefined || t.balance === null) ? null : Math.round(t.balance),
        category: cls.category,
        group: cls.group,
        description: desc,
        bank: t.bank || null,
        account: t.account || null,
        source: t.source || 'manual',
        createdAt: t.createdAt || new Date().toISOString()
      };
    }

    _sort() {
      // Sort by date asc, then by createdAt asc to preserve intra-day order from statement.
      // Important: stable sort — V8 since 2018 is stable, but we make the comparator total.
      this.tx.sort((a, b) => {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        if (a.createdAt < b.createdAt) return -1;
        if (a.createdAt > b.createdAt) return 1;
        return 0;
      });
    }

    // ---------- Analytics ----------

    /** Returns map: { "2026-01": {income, expense, investment, debt, count, byGroup} } */
    monthlyStats(filter) {
      const out = {};
      for (const t of this.tx) {
        if (filter && !filter(t)) continue;
        const k = U.monthKey(t.date);
        if (!k) continue;
        if (!out[k]) {
          out[k] = {
            month: k, income: 0, expense: 0, investment: 0, debt: 0,
            count: 0, byGroup: {}
          };
        }
        const m = out[k];
        m.count++;
        m[t.type] = (m[t.type] || 0) + t.amount;
        if (!m.byGroup[t.group]) {
          m.byGroup[t.group] = { group: t.group, category: t.category, type: t.type, amount: 0, count: 0 };
        }
        m.byGroup[t.group].amount += t.amount;
        m.byGroup[t.group].count++;
      }
      return out;
    }

    /** Compute end-of-day balance series across the full date range covered.
     *  Uses statement-provided `balance` when available (preferred), else computes
     *  cumulatively from a starting balance (defaults to 0).
     *  Returns: [{date, balance}] sorted asc, one entry per calendar day in range. */
    dailyBalanceSeries(opts = {}) {
      const startBalance = opts.startBalance != null ? opts.startBalance : 0;
      if (!this.tx.length) return [];

      // Group transactions by date, track last `balance` of the day if any.
      const byDate = new Map();
      for (const t of this.tx) {
        if (!byDate.has(t.date)) byDate.set(t.date, []);
        byDate.get(t.date).push(t);
      }
      const dates = [...byDate.keys()].sort();
      if (!dates.length) return [];

      // Fill every calendar day from min to max
      const series = [];
      let running = startBalance;
      const cursor = new Date(dates[0] + 'T00:00:00Z');
      const end = new Date(dates[dates.length - 1] + 'T00:00:00Z');
      while (cursor <= end) {
        const iso = cursor.toISOString().slice(0, 10);
        const dayTx = byDate.get(iso);
        if (dayTx) {
          // If statement balance is provided on the LAST transaction of the day, use it.
          const lastWithBalance = [...dayTx].reverse().find(t => t.balance != null);
          if (lastWithBalance) {
            running = lastWithBalance.balance;
          } else {
            for (const t of dayTx) {
              const sign = (t.type === 'income') ? 1 : -1;
              running += sign * t.amount;
            }
          }
        }
        series.push({ date: iso, balance: running });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      return series;
    }

    /** For each month, compute the lowest end-of-day balance and which day it occurred. */
    minBalanceByMonth(opts = {}) {
      const series = this.dailyBalanceSeries(opts);
      const byMonth = {};
      for (const pt of series) {
        const k = U.monthKey(pt.date);
        if (!byMonth[k] || pt.balance < byMonth[k].balance) {
          byMonth[k] = { month: k, balance: pt.balance, date: pt.date };
        }
      }
      return byMonth;
    }

    /** For each month, count days where end-of-day balance < threshold (in satang). */
    daysBelowThreshold(thresholdSatang, opts = {}) {
      const t = (thresholdSatang == null) ? this.settings.threshold : thresholdSatang;
      const series = this.dailyBalanceSeries(opts);
      const byMonth = {};
      let runStart = null, runDays = 0;
      const ranges = {};
      for (const pt of series) {
        const k = U.monthKey(pt.date);
        if (!byMonth[k]) byMonth[k] = { month: k, days: 0, ranges: [] };
        if (pt.balance < t) {
          byMonth[k].days++;
          if (!runStart) runStart = pt.date;
          runDays++;
          ranges[k] = ranges[k] || [];
        } else if (runStart) {
          // close out a run — we don't currently track per-month boundaries cleanly,
          // but we can record it under the month of the last day in the run.
          runStart = null; runDays = 0;
        }
      }
      return byMonth;
    }
  }

  const API = { Store, classify, RULES };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof root !== 'undefined') root.S = API;
})(typeof window !== 'undefined' ? window : globalThis);
