// js/ui.js — Modals + toasts.
(function (root) {
  'use strict';
  if (typeof window === 'undefined') return;

  function toast(msg, kind = 'info', ms = 3500) {
    let host = document.getElementById('toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-host';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, ms);
  }

  /** Generic modal. Returns a promise; resolves with the value passed to close(). */
  function modal({ title, body, actions, dismissable = true }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      const m = document.createElement('div');
      m.className = 'modal';
      m.innerHTML = `
        <header><h3></h3>${dismissable ? '<button class="close" aria-label="Close">×</button>' : ''}</header>
        <div class="body"></div>
        <footer></footer>
      `;
      m.querySelector('h3').textContent = title || '';
      const bodyEl = m.querySelector('.body');
      if (typeof body === 'string') bodyEl.innerHTML = body;
      else if (body instanceof Node) bodyEl.appendChild(body);

      const footer = m.querySelector('footer');
      const close = (val) => {
        overlay.remove();
        resolve(val);
      };
      (actions || [{ label: 'ตกลง', value: true, primary: true }]).forEach(a => {
        const b = document.createElement('button');
        b.className = a.primary ? 'btn primary' : 'btn';
        b.textContent = a.label;
        b.onclick = () => close(a.value);
        footer.appendChild(b);
      });
      if (dismissable) {
        m.querySelector('.close').onclick = () => close(null);
        overlay.onclick = (e) => { if (e.target === overlay) close(null); };
      }
      overlay.appendChild(m);
      document.body.appendChild(overlay);
      // Focus first input if present
      setTimeout(() => {
        const inp = m.querySelector('input,textarea,select');
        if (inp) inp.focus();
      }, 50);
    });
  }

  /** Prompt for PDF password. */
  function promptPassword(reason) {
    const wrong = reason === 2;
    const body = document.createElement('div');
    body.innerHTML = `
      <p>${wrong ? 'รหัสผ่านไม่ถูกต้อง — ลองใหม่' : 'ไฟล์ PDF นี้มีการป้องกัน — กรุณากรอกรหัสผ่าน'}</p>
      <input type="password" id="pdf-pw-input" autocomplete="off" placeholder="รหัสผ่าน" />
    `;
    return modal({
      title: 'รหัสผ่าน PDF',
      body,
      actions: [
        { label: 'ยกเลิก', value: null },
        { label: 'ปลดล็อก', value: '__pw__', primary: true }
      ]
    }).then(v => {
      if (v === '__pw__') return body.querySelector('#pdf-pw-input').value || null;
      return null;
    });
  }

  /** Open a confirm dialog. */
  function confirm(message, title = 'ยืนยัน') {
    return modal({
      title, body: `<p>${message}</p>`,
      actions: [
        { label: 'ยกเลิก', value: false },
        { label: 'ยืนยัน', value: true, primary: true }
      ]
    });
  }

  root.UI = { toast, modal, promptPassword, confirm };
})(typeof window !== 'undefined' ? window : globalThis);
