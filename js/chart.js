/* ===================================================================
   chart.js — Inline SVG chart helpers
   ===================================================================
   ทำไม inline SVG: ไม่ต้องโหลด library, ปรับสีตาม theme ได้ง่าย,
   responsive ผ่าน viewBox + preserveAspectRatio

   Charts:
   - dailyExpenseBars: bar chart 14 วัน (รายจ่ายต่อวัน)
   - cashflowForecast: line chart รวม past balance + forecast
   =================================================================== */

import { todayISO, parseLocalDate, formatBaht } from './utils.js';


/* === Daily expense bars (14 วัน) ================================
   แสดง pattern การใช้จ่าย — เห็น "วันไหนใช้เยอะ"
=============================================================== */
export function dailyExpenseBars(transactions, days = 14, incomeAvgPerDay = 0) {
  // 1. Build daily totals
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - days + 1);

  const dailyTotals = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dayTxs = transactions.filter(t => t.date === iso && t.type === 'expense');
    const total = dayTxs.reduce((s, t) => s + t.amount, 0);
    dailyTotals.push({ date: iso, total, dayOfMonth: d.getDate(), dayOfWeek: d.getDay() });
  }

  // 2. Calculate scale — ใช้ max ของ expense bars เป็นหลัก
  //    income line จะถูก clamp ที่ขอบบน ถ้ารายรับ >> รายจ่าย
  const max = Math.max(...dailyTotals.map(d => d.total), 1);
  const avg = dailyTotals.reduce((s, d) => s + d.total, 0) / days;
  const todayISOStr = todayISO();

  // 3. SVG dimensions
  const W = 320, H = 90;
  const PAD_X = 4, PAD_TOP = 6, PAD_BOTTOM = 14;
  const chartH = H - PAD_TOP - PAD_BOTTOM;
  const barW = (W - PAD_X * 2) / days - 2;

  // 4. Render bars + hit areas
  const slotW = barW + 2; // ความกว้างแต่ละช่อง (bar + gap)
  const bars = dailyTotals.map((d, i) => {
    const h = d.total > 0 ? Math.max((d.total / max) * chartH, 2) : 0;
    const x = PAD_X + i * slotW;
    const y = PAD_TOP + chartH - h;
    const isToday = d.date === todayISOStr;
    const isWeekend = d.dayOfWeek === 0 || d.dayOfWeek === 6;

    const color = isToday
      ? 'var(--terracotta)'
      : (isWeekend ? 'var(--mocha)' : 'var(--rule)');
    const opacity = isToday ? 1 : (isWeekend ? 0.6 : 0.9);

    // visual bar
    const bar = h > 0
      ? `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}"
           fill="${color}" fill-opacity="${opacity}" rx="2" data-bar-idx="${i}"/>`
      : '';

    // hit area — full-height, transparent, tappable
    const cx    = (x + barW / 2).toFixed(1);
    const barY  = y.toFixed(1);
    const hit   = `<rect class="bar-hit"
      x="${x.toFixed(1)}" y="0" width="${slotW.toFixed(1)}" height="${H}"
      fill="transparent" style="cursor:pointer"
      data-date="${d.date}" data-total="${d.total}"
      data-cx="${cx}" data-bary="${barY}"/>`;

    return bar + hit;
  }).join('');

  // 5a. Expense average line (dashed, clay)
  const avgY = PAD_TOP + chartH - (avg / max) * chartH;
  const avgLine = avg > 0
    ? `<line x1="${PAD_X}" y1="${avgY.toFixed(1)}" x2="${W - PAD_X - 28}" y2="${avgY.toFixed(1)}"
        stroke="var(--clay)" stroke-dasharray="3 3" stroke-width="1" opacity="0.5"/>
       <text x="${W - PAD_X - 26}" y="${(avgY + 3).toFixed(1)}"
        font-size="8" fill="var(--clay)" opacity="0.7">รจ่าย</text>`
    : '';

  // 5b. Income average line (30 วัน, solid, income green)
  //     clamp ที่ PAD_TOP เมื่อ incomeAvg > max expense — ยังสื่อว่า "รายรับสูงกว่า"
  const incomeY = incomeAvgPerDay > 0
    ? Math.max(PAD_TOP, PAD_TOP + chartH - (incomeAvgPerDay / max) * chartH)
    : null;
  const incomeLine = incomeY != null
    ? `<line x1="${PAD_X}" y1="${incomeY.toFixed(1)}" x2="${W - PAD_X - 28}" y2="${incomeY.toFixed(1)}"
        stroke="var(--income,#5a9d63)" stroke-width="1.5" opacity="0.7"/>
       <text x="${W - PAD_X - 26}" y="${(incomeY + 3).toFixed(1)}"
        font-size="8" fill="var(--income,#5a9d63)" opacity="0.85">รับ</text>`
    : '';

  // 6. Day labels (1, 8, 15, today)
  const labels = dailyTotals.map((d, i) => {
    if (i === days - 1 || i === 0 || i === Math.floor(days / 2)) {
      const x = PAD_X + i * (barW + 2) + barW / 2;
      const isToday = d.date === todayISOStr;
      return `<text x="${x.toFixed(1)}" y="${H - 2}" text-anchor="middle"
        font-size="9" fill="${isToday ? 'var(--terracotta)' : 'var(--ink-faint)'}"
        font-weight="${isToday ? '600' : '400'}">${isToday ? 'วันนี้' : d.dayOfMonth}</text>`;
    }
    return '';
  }).join('');

  return {
    svg: `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      ${avgLine}
      ${incomeLine}
      ${bars}
      ${labels}
      <g id="chart-bar-tip" visibility="hidden"/>
    </svg>`,
    avg,
    incomeAvgPerDay,
    todayTotal: dailyTotals[days - 1].total,
    weekTotal: dailyTotals.slice(-7).reduce((s, d) => s + d.total, 0),
    prevWeekTotal: dailyTotals.slice(0, 7).reduce((s, d) => s + d.total, 0)
  };
}


/* === Cashflow forecast line chart ==============================
   เริ่มจาก current balance ล่าสุด → ค่อยๆ ลดตาม recurring ล่วงหน้า
   เห็น "เงินจะเหลือเท่าไหร่ในอีก 30 วัน"
=============================================================== */
export function cashflowForecast(currentBalance, forecast, threshold, days = 30) {
  // currentBalance = ยอดปัจจุบันรวม (satang)
  // forecast = array จาก recurring.getForecast()
  // threshold = ยอดต่ำสุดที่จะ alert (satang)

  // 1. Build daily projection
  const points = [{ day: 0, balance: currentBalance }];
  let running = currentBalance;
  const today = new Date();

  for (let day = 1; day <= days; day++) {
    const d = new Date(today);
    d.setDate(today.getDate() + day);
    const iso = d.toISOString().slice(0, 10);

    // Apply forecast events ของวันนั้น
    const events = forecast.filter(f => f.date === iso);
    for (const ev of events) {
      if (ev.type === 'expense') running -= ev.amount;
      else if (ev.type === 'income') running += ev.amount;
      // transfer ไม่กระทบ total
    }
    points.push({ day, balance: running, hasEvent: events.length > 0 });
  }

  // 2. Find min/max for scale
  const balances = points.map(p => p.balance);
  const minB = Math.min(...balances, threshold);
  const maxB = Math.max(...balances, currentBalance);
  const range = maxB - minB || 1;

  // 3. Find when balance crosses threshold (if ever)
  const crossPoint = points.find(p => p.balance < threshold);
  const willHitThreshold = !!crossPoint;

  // 4. SVG
  const W = 320, H = 110;
  const PAD_X = 8, PAD_TOP = 12, PAD_BOTTOM = 18;
  const chartH = H - PAD_TOP - PAD_BOTTOM;
  const stepX = (W - PAD_X * 2) / days;

  const toY = (b) => PAD_TOP + chartH - ((b - minB) / range) * chartH;

  // Build path
  const pathD = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${(PAD_X + p.day * stepX).toFixed(1)} ${toY(p.balance).toFixed(1)}`
  ).join(' ');

  // Area fill (อ่อนลง)
  const areaD = pathD +
    ` L ${(PAD_X + days * stepX).toFixed(1)} ${(PAD_TOP + chartH).toFixed(1)}` +
    ` L ${PAD_X.toFixed(1)} ${(PAD_TOP + chartH).toFixed(1)} Z`;

  // Threshold line
  const thresholdY = toY(threshold);
  const thresholdLine = `<line x1="${PAD_X}" y1="${thresholdY.toFixed(1)}" x2="${W - PAD_X}" y2="${thresholdY.toFixed(1)}"
    stroke="var(--clay)" stroke-dasharray="4 4" stroke-width="1" opacity="0.6"/>
    <text x="${W - PAD_X - 2}" y="${(thresholdY - 3).toFixed(1)}" text-anchor="end"
      font-size="9" fill="var(--clay)" opacity="0.8">เกณฑ์ต่ำสุด</text>`;

  // Event dots
  const dots = points.filter(p => p.hasEvent).map(p =>
    `<circle cx="${(PAD_X + p.day * stepX).toFixed(1)}" cy="${toY(p.balance).toFixed(1)}" r="2.5"
      fill="var(--card)" stroke="var(--mocha)" stroke-width="1.5"/>`
  ).join('');

  // X-axis labels (Today, +15, +30)
  const xLabels = `
    <text x="${PAD_X}" y="${H - 4}" font-size="9" fill="var(--ink-faint)" font-weight="500">วันนี้</text>
    <text x="${(PAD_X + 15 * stepX).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="9" fill="var(--ink-faint)">+15 วัน</text>
    <text x="${W - PAD_X}" y="${H - 4}" text-anchor="end" font-size="9" fill="var(--ink-faint)">+${days} วัน</text>
  `;

  return {
    svg: `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="cashflow-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="var(--terracotta)" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="var(--terracotta)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${thresholdLine}
      <path d="${areaD}" fill="url(#cashflow-grad)"/>
      <path d="${pathD}" fill="none" stroke="var(--terracotta)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
      ${xLabels}
    </svg>`,
    finalBalance: running,
    willHitThreshold,
    daysUntilThreshold: crossPoint ? crossPoint.day : null
  };
}
