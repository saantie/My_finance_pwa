const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret }       = require('firebase-functions/params');
const { initializeApp }      = require('firebase-admin/app');
const { getFirestore }       = require('firebase-admin/firestore');

const GEMINI_KEY = defineSecret('GEMINI_API_KEY');

initializeApp();
const db = getFirestore();

const DAILY_LIMIT  = 10;
const GEMINI_MODEL = 'gemini-2.0-flash';
const ENDPOINT     = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

exports.geminiProxy = onCall(
  { region: 'asia-southeast1', secrets: [GEMINI_KEY], timeoutSeconds: 60 },

  async (request) => {
    /* 1 ── auth ─────────────────────────────────────────────────── */
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ต้องลงชื่อเข้าใช้');
    }
    const uid = request.auth.uid;

    /* 2 ── rate limit 10 ครั้ง/user/วัน ─────────────────────────── */
    const today    = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const usageRef = db.doc(`gemini_usage/${uid}`);

    const allowed = await db.runTransaction(async tx => {
      const snap  = await tx.get(usageRef);
      const data  = snap.exists ? snap.data() : {};
      const count = data.date === today ? (data.count || 0) : 0;
      if (count >= DAILY_LIMIT) return false;
      tx.set(usageRef, { date: today, count: count + 1 }, { merge: true });
      return true;
    });

    if (!allowed) {
      throw new HttpsError('resource-exhausted', `RATE_LIMIT:${DAILY_LIMIT}`);
    }

    /* 3 ── forward to Gemini ────────────────────────────────────── */
    const res = await fetch(`${ENDPOINT}?key=${GEMINI_KEY.value()}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ contents: request.data.contents }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new HttpsError('internal', err?.error?.message || `Gemini HTTP ${res.status}`);
    }

    return res.json();
  }
);
