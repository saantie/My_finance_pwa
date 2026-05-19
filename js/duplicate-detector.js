/* ===================================================================
   duplicate-detector.js — ตรวจหารายการที่อาจซ้ำกัน
   ===================================================================
   ใช้ใน:
   - add.js: ก่อน addTransaction() ในโหมด manual
   - views.js: review screen ก่อน import PDF

   Amounts ใน satang (integer), dates ใน ISO "YYYY-MM-DD"
   =================================================================== */


/**
 * คำนวณ similarity ระหว่าง 2 string (0-1)
 * ไม่ใช้ Levenshtein เต็ม — ใช้ substring + token overlap แทนเพื่อความเร็ว
 * @param {string} a
 * @param {string} b
 * @returns {number} 0-1
 */
export function similarity(a, b) {
  const norm = s => (s || '').toLowerCase().replace(/\s+/g, '');
  const aN = norm(a);
  const bN = norm(b);
  if (!aN && !bN) return 1;
  if (!aN || !bN) return 0;
  if (aN === bN) return 1;
  if (aN.includes(bN) || bN.includes(aN)) return 0.9;

  const tokenize = s => new Set(s.split(/[\s.,;:\-/()]+/).filter(Boolean));
  const ta = tokenize(aN);
  const tb = tokenize(bN);
  if (ta.size === 0 && tb.size === 0) return 0;
  const intersect = [...ta].filter(t => tb.has(t)).length;
  return intersect / Math.max(ta.size, tb.size, 1);
}


/**
 * จำนวนวันระหว่าง 2 ISO dates (ค่าบวกเสมอ)
 * @param {string} a "YYYY-MM-DD"
 * @param {string} b "YYYY-MM-DD"
 * @returns {number}
 */
export function daysBetween(a, b) {
  return Math.abs(
    (new Date(a).getTime() - new Date(b).getTime()) / 86400000
  );
}


/**
 * หารายการที่อาจซ้ำกับ newTx จาก existingTxs
 *
 * เงื่อนไข:
 *   - ต่างกัน ≤ 100 satang (~1 บาท)
 *   - ต่างกัน ≤ 7 วัน
 *   - ไม่ถูก soft-delete
 *   - description similarity ≥ threshold
 *
 * @param {{ amount: number, date: string, description?: string }} newTx
 * @param {Array} existingTxs
 * @param {number} threshold 0-1 (default 0.7)
 * @returns {Array<{ tx: object, score: number }>} top 3 เรียงตาม score ลดลง
 */
export function findPotentialDuplicates(newTx, existingTxs, threshold = 0.7) {
  const desc = newTx.description || '';
  const candidates = existingTxs
    .filter(t => Math.abs(t.amount - newTx.amount) <= 100)
    .filter(t => daysBetween(t.date, newTx.date) <= 7)
    .filter(t => t.deleted_by == null)
    .map(t => ({
      tx: t,
      score: similarity(t.description || '', desc)
    }))
    .filter(c => c.score >= threshold)
    .sort((a, b) => b.score - a.score);
  return candidates.slice(0, 3);
}
