/* ===================================================================
   gamification.js — XP, Levels, Daily Coins, Streaks
   =================================================================== */

import * as State from './state.js';
import { todayISO } from './utils.js';

const LEVELS = [
  { level: 1, name: 'มือใหม่หัดจด',                xp: 0 },
  { level: 2, name: 'นักจดรายรับรายจ่ายฝึกหัด',    xp: 200 },
  { level: 3, name: 'ผู้รู้จักตัวเองทางการเงิน',    xp: 500 },
  { level: 4, name: 'นักบัญชีครัวเรือน',            xp: 1000 },
  { level: 5, name: 'นักวางแผนชำนาญ',               xp: 2000 },
  { level: 6, name: 'นักออมมีวินัย',                xp: 3500 },
  { level: 7, name: 'นักบริหารเงินเริ่มต้น',        xp: 5000 },
  { level: 8, name: 'นักบริหารเงินฝีมือฉกาจ',       xp: 8000 },
];

export function getLevelInfo(xp) {
  const current = [...LEVELS].reverse().find(l => xp >= l.xp);
  const next = LEVELS.find(l => l.xp > xp);
  return {
    current,
    next,
    progress: next ? (xp - current.xp) / (next.xp - current.xp) : 1
  };
}

function weekStartISO() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday-based
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** เหรียญรายวัน — เรียกหลังบันทึกรายการสำเร็จ */
export function claimDailyCoin() {
  const today = todayISO();
  const progress = State.getUserProgress();
  if (progress.last_coin_date === today) return null;

  const allTxs = State.getTransactions();
  const txToday = allTxs.filter(t => t.date === today);
  const hasIncome = allTxs.filter(
    t => t.type === 'income' && t.date >= weekStartISO()
  ).length > 0;

  const account = State.getAccounts()[0];
  const balanceOk = !account
    || account.current_balance === null
    || account.current_balance >= (account.threshold || 0);

  let coin = null, xp = 0;
  if (txToday.length >= 3 && balanceOk && hasIncome) {
    coin = 'gold';   xp = 50;
  } else if (txToday.length >= 1 && balanceOk) {
    coin = 'silver'; xp = 25;
  } else if (txToday.length >= 1) {
    coin = 'bronze'; xp = 10;
  }
  if (!coin) return null;

  // Forgiveness window: streak ไม่ reset ถ้าพลาด ≤ 2 วัน
  const last = progress.last_streak_date;
  const daysSinceLast = last
    ? Math.floor((Date.now() - Date.parse(last)) / 86400000)
    : 999;
  let newStreak;
  if (last === today) {
    newStreak = progress.streak_days;
  } else if (daysSinceLast <= 3) {
    newStreak = progress.streak_days + 1;
  } else {
    newStreak = 1; // silent reset — no guilt toast
  }

  let bonusXP = 0;
  if (newStreak === 7)   bonusXP = 70;
  else if (newStreak === 30)  bonusXP = 300;
  else if (newStreak === 100) bonusXP = 1000;

  const totalXP = xp + bonusXP;
  const prevLevel = getLevelInfo(progress.xp).current.level;

  State.updateUserProgress({
    xp: progress.xp + totalXP,
    last_coin_date: today,
    last_streak_date: today,
    streak_days: newStreak,
    coins: { ...progress.coins, [coin]: progress.coins[coin] + 1 }
  });

  const newLevel = getLevelInfo(progress.xp + totalXP).current.level;
  return { coin, xp: totalXP, bonusXP, levelUp: newLevel > prevLevel, newLevel };
}

/** XP จากกิจกรรมพิเศษ (PDF import, share account, etc.) */
export function awardXP(activity) {
  const XP_MAP = {
    first_pdf_import:    100,
    recurring_template:  30,
    share_account:       20,
    drive_backup:        15,
    voice_entry:         5
  };
  const amount = XP_MAP[activity] || 0;
  if (!amount) return;
  const progress = State.getUserProgress();
  State.updateUserProgress({ xp: progress.xp + amount });
  return amount;
}
