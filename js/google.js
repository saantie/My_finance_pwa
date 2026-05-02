// js/google.js — Google OAuth 2.0 PKCE + Sheets API v4.
//
// Privacy: client-side only. Sheet ID lives in localStorage. We never call
// any developer-controlled server. The user provides their own OAuth Client ID
// (from their own Google Cloud project, configured to allow this origin).
//
// Flow:
//   1. user pastes Sheet URL/ID → store in localStorage
//   2. user pastes Client ID    → store in localStorage
//   3. signIn() runs PKCE OAuth: opens accounts.google.com, returns to redirect_uri
//      with auth code, we exchange for token via fetch (no client_secret).
//   4. token stored in localStorage with expiry; refreshed on demand.
//   5. push/pull via Sheets API v4, with a write-queue retried when online.

(function (root) {
  'use strict';
  if (typeof window === 'undefined') return;

  const TOKEN_KEY     = 'fpwa.google.token';
  const QUEUE_KEY     = 'fpwa.google.queue';
  const VERIFIER_KEY  = 'fpwa.google.pkce_verifier';
  const STATE_KEY     = 'fpwa.google.state';
  const CLIENT_ID_KEY = 'fpwa.google.client_id';
  const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

  // ---------- PKCE helpers ----------

  function b64url(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function randomVerifier(len = 64) {
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    return b64url(arr).slice(0, 128);
  }

  async function challenge(verifier) {
    const enc = new TextEncoder().encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', enc);
    return b64url(hash);
  }

  // ---------- Sheet ID parsing ----------

  /** Accept either a raw ID or a full Google Sheets URL. */
  function parseSheetId(input) {
    if (!input) return null;
    const s = String(input).trim();
    const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
    return null;
  }

  // ---------- Auth ----------

  function getClientId() {
    // Priority: localStorage (per-user override) > APP_CONFIG (deployment default)
    const ls = localStorage.getItem(CLIENT_ID_KEY);
    if (ls && ls.trim()) return ls.trim();
    const cfg = (window.APP_CONFIG && window.APP_CONFIG.GOOGLE_CLIENT_ID) || '';
    return cfg.trim();
  }
  function isClientIdFromConfig() {
    const ls = localStorage.getItem(CLIENT_ID_KEY);
    if (ls && ls.trim()) return false;
    return !!(window.APP_CONFIG && window.APP_CONFIG.GOOGLE_CLIENT_ID);
  }
  function setClientId(s) { localStorage.setItem(CLIENT_ID_KEY, s); }
  function clearClientIdOverride() { localStorage.removeItem(CLIENT_ID_KEY); }

  function getToken() {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      if (!raw) return null;
      const t = JSON.parse(raw);
      if (t.expiresAt && Date.now() > t.expiresAt - 60000) return null; // 1-min buffer
      return t;
    } catch { return null; }
  }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, JSON.stringify(t)); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  /** Begin sign-in. Redirects to Google. */
  async function signIn() {
    const clientId = getClientId();
    if (!clientId) throw new Error('กรุณาตั้งค่า Google OAuth Client ID ก่อน');
    const verifier = randomVerifier();
    const state    = randomVerifier(16);
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);
    const ch = await challenge(verifier);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: location.origin + location.pathname,
      response_type: 'code',
      scope: SCOPE,
      code_challenge: ch,
      code_challenge_method: 'S256',
      state,
      access_type: 'online',
      prompt: 'consent'
    });
    location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
  }

  /** Call on page load to detect ?code=... return from Google. */
  async function handleRedirect() {
    const url = new URL(location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code) return false;
    const expectState = sessionStorage.getItem(STATE_KEY);
    if (state !== expectState) {
      console.warn('OAuth state mismatch — ignoring');
      return false;
    }
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
    const clientId = getClientId();

    // Clean URL
    history.replaceState({}, document.title, location.origin + location.pathname);

    const body = new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: location.origin + location.pathname
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!res.ok) throw new Error('OAuth token exchange failed: ' + res.status);
    const data = await res.json();
    setToken({
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
      scope: data.scope
    });
    return true;
  }

  function signOut() {
    clearToken();
  }

  function isSignedIn() {
    return !!getToken();
  }

  // ---------- Sheets API v4 ----------

  async function sheetsRequest(path, opts = {}) {
    const t = getToken();
    if (!t) throw new Error('not signed in');
    const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + path, {
      ...opts,
      headers: {
        'Authorization': 'Bearer ' + t.accessToken,
        'Content-Type': 'application/json',
        ...(opts.headers || {})
      }
    });
    if (!res.ok) {
      if (res.status === 401) clearToken();
      throw new Error('Sheets API ' + res.status + ': ' + await res.text());
    }
    return res.json();
  }

  /** Create a brand new spreadsheet in the user's Drive and return id+url. */
  async function createSheet(title) {
    const t = getToken();
    if (!t) throw new Error('not signed in');
    const name = title || (window.APP_CONFIG && window.APP_CONFIG.DEFAULT_SHEET_NAME) || 'การเงินส่วนตัว';
    const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + t.accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties: { title: name } })
    });
    if (!res.ok) {
      if (res.status === 401) clearToken();
      throw new Error('Create sheet failed: ' + res.status);
    }
    const data = await res.json();
    return { id: data.spreadsheetId, url: data.spreadsheetUrl };
  }

  /** Ensure the four sheets exist: Transactions, Investments, Debts, Config. */
  async function ensureSchema(sheetId) {
    const meta = await sheetsRequest(sheetId);
    const have = new Set(meta.sheets.map(s => s.properties.title));
    const want = ['Transactions', 'Investments', 'Debts', 'Config'];
    const requests = [];
    for (const w of want) {
      if (!have.has(w)) requests.push({ addSheet: { properties: { title: w } } });
    }
    if (requests.length) {
      await sheetsRequest(sheetId + ':batchUpdate', {
        method: 'POST', body: JSON.stringify({ requests })
      });
    }
    // Header row check on Transactions sheet
    const headerRange = 'Transactions!A1:K1';
    const cur = await sheetsRequest(sheetId + '/values/' + encodeURIComponent(headerRange));
    if (!cur.values || !cur.values.length) {
      const headers = [['id','date','type','amount_satang','category','group','description','bank','account','source','createdAt']];
      await sheetsRequest(sheetId + '/values/' + encodeURIComponent(headerRange) + '?valueInputOption=RAW', {
        method: 'PUT', body: JSON.stringify({ values: headers })
      });
    }
  }

  /** Append transactions to the Transactions sheet. */
  async function appendTransactions(sheetId, txs) {
    if (!txs.length) return { added: 0 };
    const rows = txs.map(t => [
      t.id, t.date, t.type, t.amount, t.category, t.group,
      t.description, t.bank || '', t.account || '', t.source || 'manual', t.createdAt || new Date().toISOString()
    ]);
    await sheetsRequest(
      sheetId + '/values/Transactions!A:K:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
      { method: 'POST', body: JSON.stringify({ values: rows }) }
    );
    return { added: rows.length };
  }

  /** Read all transactions from the sheet. */
  async function fetchTransactions(sheetId) {
    const data = await sheetsRequest(sheetId + '/values/Transactions!A2:K');
    if (!data.values) return [];
    return data.values.map(r => ({
      id: r[0], date: r[1], type: r[2], amount: Number(r[3]),
      category: r[4], group: r[5], description: r[6],
      bank: r[7] || null, account: r[8] || null, source: r[9] || 'sheet',
      createdAt: r[10]
    }));
  }

  // ---------- Offline queue ----------

  function getQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
  }
  function setQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
  function enqueue(op) {
    const q = getQueue(); q.push(op); setQueue(q);
  }

  /** Try to flush queued ops. Safe to call on every online event. */
  async function flushQueue(sheetId) {
    if (!isSignedIn() || !sheetId) return { flushed: 0, queued: getQueue().length };
    const q = getQueue();
    if (!q.length) return { flushed: 0, queued: 0 };
    let flushed = 0;
    const remain = [];
    for (const op of q) {
      try {
        if (op.kind === 'append') {
          await appendTransactions(sheetId, op.txs);
          flushed += op.txs.length;
        }
      } catch (e) {
        remain.push(op);
      }
    }
    setQueue(remain);
    return { flushed, queued: remain.length };
  }

  /** Public push: try direct, queue on failure. */
  async function pushTransactions(sheetId, txs) {
    if (!txs.length) return { pushed: 0, queued: 0 };
    if (!isSignedIn() || !navigator.onLine) {
      enqueue({ kind: 'append', txs });
      return { pushed: 0, queued: txs.length };
    }
    try {
      const r = await appendTransactions(sheetId, txs);
      return { pushed: r.added, queued: 0 };
    } catch (e) {
      enqueue({ kind: 'append', txs });
      return { pushed: 0, queued: txs.length, error: e.message };
    }
  }

  root.G = {
    parseSheetId, getClientId, setClientId, clearClientIdOverride, isClientIdFromConfig,
    signIn, signOut, isSignedIn, handleRedirect,
    createSheet, ensureSchema, fetchTransactions, pushTransactions, flushQueue,
    getQueue
  };
})(typeof window !== 'undefined' ? window : globalThis);
