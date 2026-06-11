/* ===================================================================
   gemini.js — AI fallback สำหรับ parse PDF/slip ที่ parsers.js อ่านไม่ได้
   ===================================================================
   Auth: GEMINI_API_KEY จาก config.js (restrict domain ใน AI Studio)
   user ไม่ต้องทำอะไร
   =================================================================== */

// Dynamic import เพื่อกัน crash เมื่อ config.js ยังไม่มี (ระหว่าง deploy)
async function _getKey() {
  try {
    const { GEMINI_API_KEY } = await import('./config.js');
    return GEMINI_API_KEY || '';
  } catch {
    return '';
  }
}

// gemini-2.0-flash ถูกปิดถาวร 1 มิ.ย. 2026 — ใช้ 3.5-flash (free tier, ไม่มีกำหนดปิด)
const GEMINI_MODEL    = 'gemini-3.5-flash';
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


/* === parse e-Statement =========================================== */

export async function parseStatementWithGemini(fileOrText) {
  const GEMINI_API_KEY = await _getKey();
  if (!GEMINI_API_KEY) throw new Error('GEMINI_NO_KEY');

  let parts;
  if (typeof fileOrText === 'string') {
    parts = [{ text: STATEMENT_PROMPT + '\n\nข้อความจาก statement:\n' + fileOrText }];
  } else {
    const base64 = await _fileToBase64(fileOrText);
    parts = [
      { inline_data: { mime_type: 'application/pdf', data: base64 } },
      { text: STATEMENT_PROMPT },
    ];
  }
  return _call(parts, GEMINI_API_KEY);
}


/* === scan slip/receipt =========================================== */

export async function scanSlipWithGemini(imageFile) {
  const GEMINI_API_KEY = await _getKey();
  if (!GEMINI_API_KEY) throw new Error('GEMINI_NO_KEY');
  const base64   = await _fileToBase64(imageFile);
  const mimeType = imageFile.type || 'image/jpeg';
  return _call([
    { inline_data: { mime_type: mimeType, data: base64 } },
    { text: SLIP_PROMPT },
  ], GEMINI_API_KEY);
}


/* === internal helpers ============================================ */

async function _call(parts, apiKey) {
  // ส่ง key ผ่าน header x-goog-api-key (วิธีทางการปัจจุบัน) แทน ?key= ใน URL
  // — key ไม่โผล่ใน URL/log + รองรับทั้ง AIza และ AQ. key format
  const res = await fetch(GEMINI_ENDPOINT, {
    method:  'POST',
    headers: {
      'Content-Type':   'application/json',
      'x-goog-api-key': apiKey,
    },
    body:    JSON.stringify({ contents: [{ parts }] }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || '';
    if (res.status === 400 && msg.toLowerCase().includes('api key')) {
      throw new Error('GEMINI_BAD_KEY');
    }
    throw new Error(msg || `Gemini HTTP ${res.status}`);
  }

  const data  = await res.json();
  const text  = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
