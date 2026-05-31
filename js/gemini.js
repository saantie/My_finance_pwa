/* ===================================================================
   gemini.js — AI fallback สำหรับ parse PDF/slip ที่ parsers.js อ่านไม่ได้
   ===================================================================
   ใช้ OAuth access token ของ user เอง (generative-language scope)
   — ไม่มี API key ใน repo
   — user ต้อง accept terms ที่ aistudio.google.com ก่อนครั้งแรก
   =================================================================== */

const GEMINI_MODEL    = 'gemini-2.0-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const STATEMENT_PROMPT = `
คุณเป็น expert accountant ที่อ่าน bank statement ภาษาไทย
ดึงข้อมูลทุกรายการธุรกรรมและคืนค่าเป็น JSON เท่านั้น ไม่มีข้อความอื่น รูปแบบ:
{
  "account_number_last4": "7821",
  "bank_name": "ktb",
  "transactions": [
    { "date": "YYYY-MM-DD", "amount": 150000, "description": "...", "type": "income|expense|transfer", "balance": 500000 }
  ]
}
amount และ balance เป็น satang (คูณ 100) ไม่ต้องใส่ทศนิยม
`.trim();

const SLIP_PROMPT = `
อ่านข้อมูลจาก slip/receipt นี้ คืนค่า JSON เท่านั้น:
{ "amount": 150000, "date": "YYYY-MM-DD", "ref": "...", "bank": "..." }
amount เป็น satang ถ้าไม่มีข้อมูลให้ใส่ null
`.trim();


/* === Terms check ================================================= */

async function checkAiStudioTerms(accessToken) {
  try {
    const res = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] }),
    });
    if (res.status === 403 || res.status === 400) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || '';
      if (msg.includes('terms') || msg.includes('SERVICE_DISABLED')) return false;
    }
    return true;
  } catch {
    return true; // network error → ลองต่อไป แจ้งเมื่อ request จริงล้มเหลว
  }
}

function showAiStudioPrompt() {
  const ok = confirm(
    'ต้องเปิดใช้ Google AI ก่อนครั้งแรก\n\n' +
    '1. กด OK → เปิด Google AI Studio ในแท็บใหม่\n' +
    '2. กด "Accept Terms"\n' +
    '3. กลับมาที่แอปแล้วลองใหม่'
  );
  if (ok) window.open('https://aistudio.google.com', '_blank');
}


/* === parse e-Statement =========================================== */

/**
 * @param {File|string} fileOrText
 *   File   = PDF ไม่มีรหัสผ่าน → ส่งเป็น base64
 *   string = extractedText จาก PDF ที่ decrypt แล้ว → ส่งเป็น text
 * @param {string} accessToken
 * @returns {{ account_number_last4, bank_name, transactions[] }}
 * @throws 'AI_STUDIO_TERMS_NOT_ACCEPTED' | Error
 */
export async function parseStatementWithGemini(fileOrText, accessToken) {
  const ready = await checkAiStudioTerms(accessToken);
  if (!ready) {
    showAiStudioPrompt();
    throw new Error('AI_STUDIO_TERMS_NOT_ACCEPTED');
  }

  let parts;
  if (typeof fileOrText === 'string') {
    // PDF มีรหัสผ่าน: pdf.js decrypt แล้ว ส่ง text ตรงๆ
    parts = [{ text: STATEMENT_PROMPT + '\n\nข้อความจาก statement:\n' + fileOrText }];
  } else {
    // PDF ปกติ: ส่งไฟล์เป็น base64
    const base64 = await _fileToBase64(fileOrText);
    parts = [
      { inline_data: { mime_type: 'application/pdf', data: base64 } },
      { text: STATEMENT_PROMPT },
    ];
  }

  const json = await _call(parts, accessToken);
  return json;
}


/* === scan slip/receipt =========================================== */

/**
 * @param {File} imageFile  — image/jpeg หรือ image/png
 * @param {string} accessToken
 * @returns {{ amount, date, ref, bank }}
 */
export async function scanSlipWithGemini(imageFile, accessToken) {
  const ready = await checkAiStudioTerms(accessToken);
  if (!ready) {
    showAiStudioPrompt();
    throw new Error('AI_STUDIO_TERMS_NOT_ACCEPTED');
  }

  const base64   = await _fileToBase64(imageFile);
  const mimeType = imageFile.type || 'image/jpeg';

  const json = await _call([
    { inline_data: { mime_type: mimeType, data: base64 } },
    { text: SLIP_PROMPT },
  ], accessToken);

  return json;
}


/* === internal helpers ============================================ */

async function _call(parts, accessToken) {
  const res = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ contents: [{ parts }] }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini HTTP ${res.status}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const clean = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error('Gemini คืนค่าที่ไม่ใช่ JSON: ' + clean.slice(0, 200));
  }
}

async function _fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
