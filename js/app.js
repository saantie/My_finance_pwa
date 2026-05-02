// js/app.js — Main application glue.
//
// Wires: Store ↔ Dashboard ↔ PDF importer ↔ Google sync ↔ Voice ↔ Settings.
// Hash-based routing: #/dashboard, #/import, #/add, #/settings.

(function () {
  'use strict';

  const store = new S.Store();
  store.load();

  // ---------- Routing ----------

  const VIEWS = ['dashboard', 'import', 'add', 'settings'];
  function showView(name) {
    if (!VIEWS.includes(name)) name = 'dashboard';
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.view === name));
    document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.view === name));
    if (name === 'dashboard') D.render(store);
  }
  window.addEventListener('hashchange', () => {
    const v = (location.hash || '#/dashboard').slice(2);
    showView(v);
  });

  // ---------- PDF Import ----------

  document.getElementById('pdf-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const status = document.getElementById('import-status');
    status.textContent = 'กำลังอ่าน PDF…';
    try {
      const { pages, fullText } = await PDF.loadFile(file, {
        onPasswordNeeded: (reason) => UI.promptPassword(reason)
      });
      const result = P.parsePdfPages(pages, fullText);
      status.textContent = `ตรวจพบธนาคาร: ${result.bank.name} • พบ ${result.transactions.length} รายการ`;

      const preview = document.getElementById('import-preview');
      preview.innerHTML = result.transactions.slice(0, 10).map(t => `
        <tr class="${t.type}">
          <td>${U.formatThaiDate(t.date)}</td>
          <td class="desc">${escapeHtml(t.description.slice(0, 60))}</td>
          <td class="amt">${t.type === 'income' ? '+' : '−'} ${U.formatTHB(t.amount, { suffix: false })}</td>
        </tr>
      `).join('') + (result.transactions.length > 10
        ? `<tr><td colspan="3" class="hint">… และอีก ${result.transactions.length - 10} รายการ</td></tr>` : '');

      document.getElementById('import-confirm').style.display = '';
      document.getElementById('import-confirm').onclick = async () => {
        const r = store.addMany(result.transactions);
        UI.toast(`นำเข้าสำเร็จ ${r.added} รายการ (ข้ามซ้ำ ${r.skipped})`, 'success');
        document.getElementById('import-confirm').style.display = 'none';
        document.getElementById('pdf-input').value = '';
        preview.innerHTML = '';
        status.textContent = '';
        // Try push to Sheets if connected
        if (G.isSignedIn() && store.settings.sheetId) {
          const pushed = await G.pushTransactions(store.settings.sheetId, result.transactions);
          if (pushed.pushed) UI.toast(`Sync ขึ้น Google Sheets: ${pushed.pushed} แถว`, 'success');
        }
        location.hash = '#/dashboard';
      };
    } catch (err) {
      console.error(err);
      status.textContent = 'อ่าน PDF ไม่สำเร็จ: ' + err.message;
      UI.toast('อ่าน PDF ไม่สำเร็จ', 'error');
    }
  });

  // ---------- Manual entry ----------

  document.getElementById('manual-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const dateStr = f.date.value;
    const iso = U.parseThaiDate(dateStr) || dateStr; // accept ISO directly
    const amount = U.toSatang(f.amount.value);
    if (!iso || !amount) {
      UI.toast('กรอกวันที่/ยอดให้ถูกต้อง', 'error'); return;
    }
    const tx = store.add({
      date: iso,
      type: f.type.value,
      amount,
      description: f.description.value || (f.category.value || ''),
      source: 'manual'
    });
    if (tx) {
      UI.toast('บันทึกแล้ว', 'success');
      f.reset();
      // Try push
      if (G.isSignedIn() && store.settings.sheetId) {
        G.pushTransactions(store.settings.sheetId, [tx]);
      }
      location.hash = '#/dashboard';
    } else {
      UI.toast('บันทึกไม่สำเร็จ', 'error');
    }
  });

  // ---------- Voice ----------

  const voiceBtn = document.getElementById('voice-btn');
  const voiceStatus = document.getElementById('voice-status');
  voiceBtn.addEventListener('click', () => {
    voiceStatus.textContent = 'กำลังฟัง…';
    voiceBtn.disabled = true;
    V.startRecognition({
      lang: 'th-TH',
      onResult: (text) => {
        voiceStatus.textContent = 'ได้ยิน: "' + text + '"';
        const draft = V.parseVoiceText(text);
        if (!draft) {
          UI.toast('ไม่เข้าใจคำสั่ง — ลองพูด เช่น "จ่ายค่าไฟ 450 บาท"', 'warn'); return;
        }
        const today = new Date().toISOString().slice(0, 10);
        const tx = store.add({ ...draft, date: today });
        if (tx) {
          UI.toast(`บันทึกแล้ว: ${draft.category} ${U.formatTHB(draft.amount)}`, 'success');
          if (G.isSignedIn() && store.settings.sheetId) G.pushTransactions(store.settings.sheetId, [tx]);
        }
      },
      onError: (e) => {
        voiceStatus.textContent = 'ผิดพลาด: ' + (e.message || e);
        UI.toast('Voice error', 'error');
      },
      onEnd: () => { voiceBtn.disabled = false; }
    });
  });

  // ---------- Settings ----------

  function refreshSettings() {
    const f = document.getElementById('settings-form');
    f.threshold.value = (store.settings.threshold / 100).toFixed(0);
    f.sheetId.value   = store.settings.sheetId || '';

    // Client ID: if config provides one, leave the field empty + collapsed.
    // If user has set their own override, show it.
    const fromConfig = G.isClientIdFromConfig();
    f.clientId.value = fromConfig ? '' : G.getClientId();
    const adv = document.getElementById('advanced-settings');
    if (adv) adv.open = !fromConfig && !!G.getClientId();

    const ready = !!G.getClientId();
    const signedIn = G.isSignedIn();
    document.getElementById('signin-status').textContent =
      !ready    ? '⚠ ยังไม่มี Google Client ID — ติดต่อผู้ดูแลแอป (หรือตั้งใน "ขั้นสูง")' :
      signedIn  ? '✓ ลงชื่อเข้าใช้แล้ว' :
                  '— ยังไม่ได้ลงชื่อเข้าใช้';
    document.getElementById('queue-status').textContent =
      `คิว offline: ${G.getQueue().length} รายการ`;
  }

  document.getElementById('settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const threshold = Number(f.threshold.value) || 2000;
    const sheetId = G.parseSheetId(f.sheetId.value) || (f.sheetId.value.trim() || null);
    const clientId = f.clientId.value.trim();
    // Only write Client ID to localStorage if user explicitly typed one.
    // Empty field = use config default.
    if (clientId) G.setClientId(clientId);
    else G.clearClientIdOverride();
    store.setSettings({ threshold: threshold * 100, sheetId });
    UI.toast('บันทึกการตั้งค่าแล้ว', 'success');
    refreshSettings();
  });

  document.getElementById('create-sheet-btn').addEventListener('click', async () => {
    if (!G.isSignedIn()) {
      UI.toast('กรุณาลงชื่อเข้าใช้ก่อน', 'warn'); return;
    }
    const btn = document.getElementById('create-sheet-btn');
    btn.disabled = true;
    btn.textContent = 'กำลังสร้าง…';
    try {
      const { id, url } = await G.createSheet();
      store.setSettings({ sheetId: id });
      await G.ensureSchema(id);
      // Push everything that's already in the local store, if any
      if (store.list().length) {
        await G.pushTransactions(id, store.list());
      }
      UI.toast('สร้าง Sheet เรียบร้อย', 'success');
      refreshSettings();
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      UI.toast('สร้างไม่สำเร็จ: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'สร้าง Sheet ใหม่ให้เลย';
    }
  });

  document.getElementById('signin-btn').addEventListener('click', async () => {
    try { await G.signIn(); }
    catch (e) { UI.toast(e.message, 'error'); }
  });

  document.getElementById('signout-btn').addEventListener('click', () => {
    G.signOut();
    refreshSettings();
    UI.toast('ออกจากระบบแล้ว', 'info');
  });

  document.getElementById('sync-pull-btn').addEventListener('click', async () => {
    if (!G.isSignedIn() || !store.settings.sheetId) {
      UI.toast('กรุณาลงชื่อเข้าใช้ + ตั้งค่า Sheet ก่อน', 'warn'); return;
    }
    try {
      await G.ensureSchema(store.settings.sheetId);
      const txs = await G.fetchTransactions(store.settings.sheetId);
      const r = store.addMany(txs.map(t => ({ ...t, source: 'sheet' })));
      UI.toast(`ดึงจาก Sheets: เพิ่ม ${r.added}, ข้ามซ้ำ ${r.skipped}`, 'success');
      D.render(store);
    } catch (e) {
      UI.toast('ดึงข้อมูลไม่สำเร็จ: ' + e.message, 'error');
    }
  });

  document.getElementById('sync-push-btn').addEventListener('click', async () => {
    if (!G.isSignedIn() || !store.settings.sheetId) {
      UI.toast('กรุณาลงชื่อเข้าใช้ + ตั้งค่า Sheet ก่อน', 'warn'); return;
    }
    try {
      await G.ensureSchema(store.settings.sheetId);
      const r = await G.pushTransactions(store.settings.sheetId, store.list());
      UI.toast(`ส่งขึ้น Sheets: ${r.pushed} แถว`, 'success');
      refreshSettings();
    } catch (e) {
      UI.toast('ส่งข้อมูลไม่สำเร็จ: ' + e.message, 'error');
    }
  });

  document.getElementById('clear-data-btn').addEventListener('click', async () => {
    const ok = await UI.confirm('ลบข้อมูลทั้งหมดในเครื่องนี้? (Google Sheets ไม่ถูกแตะต้อง)');
    if (ok) { store.clear(); refreshSettings(); D.render(store); UI.toast('ลบข้อมูลในเครื่องแล้ว', 'info'); }
  });

  // ---------- Online / Offline ----------

  window.addEventListener('online', async () => {
    UI.toast('กลับมาออนไลน์ — กำลังซิงค์…', 'info');
    if (store.settings.sheetId) {
      const r = await G.flushQueue(store.settings.sheetId);
      if (r.flushed) UI.toast(`ซิงค์ออฟไลน์เสร็จ: ${r.flushed} แถว`, 'success');
    }
    refreshSettings();
  });
  window.addEventListener('offline', () => UI.toast('ออฟไลน์ — รายการใหม่จะถูกคิวไว้', 'warn'));

  // ---------- Boot ----------

  (async () => {
    // Handle Google OAuth redirect
    try {
      const handled = await G.handleRedirect();
      if (handled) UI.toast('ลงชื่อเข้าใช้สำเร็จ', 'success');
    } catch (e) { UI.toast('OAuth error: ' + e.message, 'error'); }

    // Listen to store changes
    store.onChange(() => {
      if ((location.hash || '#/dashboard').slice(2) === 'dashboard') D.render(store);
    });

    // Initial render
    refreshSettings();
    showView((location.hash || '#/dashboard').slice(2));

    // Service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW register failed', err));
    }
  })();

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
})();
