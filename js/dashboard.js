// js/dashboard.js — render dashboard views.
// Browser-only. Reads from store, draws Chart.js charts, builds tables.
// All amounts in store are integer satang; we convert to baht for display only.

(function (root) {
  'use strict';
  if (typeof window === 'undefined') return;

  const U = root.U;
  const S = root.S;

  let monthlyChart = null;
  let balanceChart = null;

  /** Render the entire dashboard given the current store. */
  function render(store) {
    const stats = store.monthlyStats();
    const months = Object.keys(stats).sort();
    const minBal = store.minBalanceByMonth();
    const dbt = store.daysBelowThreshold(store.settings.threshold);

    renderSummary(store, months, stats);
    renderMonthlyChart(months, stats);
    renderBalanceChart(store);
    renderGroupBreakdown(months, stats);
    renderMinBalanceTable(months, minBal, dbt, store.settings.threshold);
    renderRecentList(store);
  }

  function renderSummary(store, months, stats) {
    const el = document.getElementById('summary-cards');
    if (!el) return;
    if (!months.length) {
      el.innerHTML = '<div class="card empty">ยังไม่มีข้อมูล — นำเข้า PDF e-Statement หรือเพิ่มรายการเพื่อเริ่มต้น</div>';
      return;
    }
    let totalIncome = 0, totalExpense = 0, totalInvest = 0, totalDebt = 0;
    for (const k of months) {
      totalIncome  += stats[k].income || 0;
      totalExpense += stats[k].expense || 0;
      totalInvest  += stats[k].investment || 0;
      totalDebt    += stats[k].debt || 0;
    }
    const net = totalIncome - totalExpense;
    el.innerHTML = `
      <div class="card income"><h4>รายรับรวม</h4><div class="value">${U.formatTHB(totalIncome)}</div></div>
      <div class="card expense"><h4>รายจ่ายรวม</h4><div class="value">${U.formatTHB(totalExpense)}</div></div>
      <div class="card net ${net >= 0 ? 'positive' : 'negative'}">
        <h4>คงเหลือสุทธิ</h4>
        <div class="value">${U.formatTHB(net)}</div>
      </div>
      <div class="card invest"><h4>ลงทุน</h4><div class="value">${U.formatTHB(totalInvest)}</div></div>
      <div class="card debt"><h4>หนี้สิน/ผ่อน</h4><div class="value">${U.formatTHB(totalDebt)}</div></div>
    `;
  }

  function renderMonthlyChart(months, stats) {
    const canvas = document.getElementById('chart-monthly');
    if (!canvas || !window.Chart) return;
    const labels   = months.map(U.formatThaiMonth);
    const incomes  = months.map(k => U.satangToBaht(stats[k].income));
    const expenses = months.map(k => U.satangToBaht(stats[k].expense));
    if (monthlyChart) monthlyChart.destroy();
    monthlyChart = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'รายรับ', data: incomes, backgroundColor: '#5b8c5a' },
          { label: 'รายจ่าย', data: expenses, backgroundColor: '#c44536' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString() } } }
      }
    });
  }

  function renderBalanceChart(store) {
    const canvas = document.getElementById('chart-balance');
    if (!canvas || !window.Chart) return;
    const series = store.dailyBalanceSeries();
    if (!series.length) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    if (balanceChart) balanceChart.destroy();
    const threshold = U.satangToBaht(store.settings.threshold);
    balanceChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: series.map(p => U.formatThaiDate(p.date)),
        datasets: [
          {
            label: 'ยอดคงเหลือ',
            data: series.map(p => U.satangToBaht(p.balance)),
            borderColor: '#1a3a5c',
            backgroundColor: 'rgba(26,58,92,0.08)',
            fill: true,
            tension: 0.2,
            pointRadius: 0,
            borderWidth: 2
          },
          {
            label: `เกณฑ์ ${threshold.toLocaleString()} ฿`,
            data: series.map(() => threshold),
            borderColor: '#c44536',
            borderDash: [4, 4],
            pointRadius: 0,
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { ticks: { maxTicksLimit: 10 } },
          y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString() } }
        }
      }
    });
  }

  function renderGroupBreakdown(months, stats) {
    const el = document.getElementById('group-breakdown');
    if (!el) return;
    if (!months.length) { el.innerHTML = ''; return; }
    let html = '';
    for (const k of months) {
      const m = stats[k];
      const groups = Object.values(m.byGroup).sort((a, b) => b.amount - a.amount);
      const incomes  = groups.filter(g => g.type === 'income');
      const expenses = groups.filter(g => g.type === 'expense');
      const others   = groups.filter(g => g.type !== 'income' && g.type !== 'expense');
      html += `<section class="month-section">
        <h3>${U.formatThaiMonth(k)}</h3>
        <div class="month-cols">
          ${groupColumn('รายรับ', incomes, 'income')}
          ${groupColumn('รายจ่าย', expenses, 'expense')}
          ${others.length ? groupColumn('อื่นๆ (ลงทุน/หนี้สิน)', others, 'other') : ''}
        </div>
      </section>`;
    }
    el.innerHTML = html;
  }

  function groupColumn(title, groups, kind) {
    if (!groups.length) {
      return `<div class="group-col ${kind}"><h4>${title}</h4><div class="empty">—</div></div>`;
    }
    const total = groups.reduce((s, g) => s + g.amount, 0);
    const rows = groups.map(g => `
      <tr>
        <td class="cat">${escapeHtml(g.category)}</td>
        <td class="cnt">${g.count}</td>
        <td class="amt">${U.formatTHB(g.amount, { suffix: false })}</td>
      </tr>
    `).join('');
    return `<div class="group-col ${kind}">
      <h4>${title} <span class="total">${U.formatTHB(total, { suffix: false })}</span></h4>
      <table><thead><tr><th>หมวด</th><th>จำนวน</th><th>ยอด</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function renderMinBalanceTable(months, minBal, dbt, threshold) {
    const el = document.getElementById('min-balance-table');
    if (!el) return;
    if (!months.length) { el.innerHTML = ''; return; }
    const t = U.satangToBaht(threshold);
    const rows = months.map(k => {
      const mb = minBal[k]   || { balance: null, date: null };
      const db = dbt[k]      || { days: 0 };
      const lowClass = (mb.balance != null && mb.balance < threshold) ? 'low' : '';
      return `<tr class="${lowClass}">
        <td>${U.formatThaiMonth(k)}</td>
        <td>${mb.balance == null ? '—' : U.formatTHB(mb.balance, { suffix: false })}</td>
        <td>${mb.date ? U.formatThaiDate(mb.date) : '—'}</td>
        <td>${db.days} วัน</td>
      </tr>`;
    }).join('');
    el.innerHTML = `
      <h3>ยอดต่ำสุดรายเดือน <span class="hint">เกณฑ์เตือน: ${t.toLocaleString()} ฿</span></h3>
      <table>
        <thead><tr><th>เดือน</th><th>ยอดต่ำสุด</th><th>วันที่</th><th>วันที่ยอด &lt; เกณฑ์</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function renderRecentList(store) {
    const el = document.getElementById('recent-list');
    if (!el) return;
    const recent = store.list().slice(-30).reverse();
    if (!recent.length) { el.innerHTML = '<div class="empty">ยังไม่มีรายการ</div>'; return; }
    el.innerHTML = `<table>
      <thead><tr><th>วันที่</th><th>หมวด</th><th>รายละเอียด</th><th class="amt">ยอด</th></tr></thead>
      <tbody>${recent.map(t => `
        <tr class="${t.type}">
          <td>${U.formatThaiDate(t.date)}</td>
          <td>${escapeHtml(t.category)}</td>
          <td class="desc">${escapeHtml(t.description || '')}</td>
          <td class="amt">${t.type === 'income' ? '+' : '−'} ${U.formatTHB(t.amount, { suffix: false })}</td>
        </tr>`).join('')}
      </tbody></table>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  root.D = { render };
})(typeof window !== 'undefined' ? window : globalThis);
