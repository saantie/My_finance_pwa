/* ===================================================================
   voice.js — Voice input + Thai NLP intent parser
   ===================================================================
   ใช้ Web Speech API (built-in browser) — ไม่ต้องติดตั้ง library
   - VoiceRecorder: wrapper สำหรับ SpeechRecognition
   - parseIntent: แปลงข้อความ → { type, amount, group, description }

   ตัวอย่าง:
   "จ่ายค่าไฟ 450 บาท"     → expense, 450, utility
   "ค่ากาแฟ 65"             → expense, 65, coffee
   "ได้เงินเดือน 25000"      → income, 25000, salary
   "โอนไปกสิกร 500"         → transfer, 500
   "กินข้าว 120 บาท"        → expense, 120, food
   =================================================================== */


/* === VoiceRecorder ============================================== */

export class VoiceRecorder {
  constructor() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = !!Recognition;
    if (!this.supported) return;

    this.recognition = new Recognition();
    this.recognition.lang = 'th-TH';        // ภาษาไทย
    this.recognition.interimResults = true;  // ได้ partial results ระหว่างพูด
    this.recognition.continuous = true;   // ไม่ตัดเองตอนเว้นจังหวะ — add.js คุมการหยุดด้วย silence timer
    this.recognition.maxAlternatives = 1;

    this._listening = false;
  }

  /**
   * เริ่มอัด
   * @param {function} onUpdate รับ ({ transcript, isFinal })
   * @param {function} onError รับ error string
   * @param {function} onEnd เรียกเมื่ออัดจบ
   */
  start(onUpdate, onError, onEnd) {
    if (!this.supported) {
      onError && onError('browser_not_supported');
      return;
    }
    if (this._listening) return;

    // continuous=true: ต้องสะสม final segment แยก และอ่านเฉพาะ result ใหม่จาก resultIndex
    // มิฉะนั้นการ re-read ทั้ง array ทุก event จะทำให้ข้อความซ้ำ (Chrome ยิง final ซ้ำตอน stop)
    let finalTranscript = '';
    this.recognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const seg = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTranscript += seg;
        else interim += seg;
      }
      const transcript = (finalTranscript + interim).trim();
      onUpdate && onUpdate({ transcript, isFinal: interim === '' && finalTranscript !== '' });
    };

    this.recognition.onerror = (e) => {
      this._listening = false;
      // common errors: 'not-allowed' (permission), 'no-speech', 'network'
      onError && onError(e.error);
    };

    this.recognition.onend = () => {
      this._listening = false;
      onEnd && onEnd();
    };

    try {
      this.recognition.start();
      this._listening = true;
    } catch (e) {
      onError && onError(e.message || 'start_failed');
    }
  }

  stop() {
    if (this._listening) {
      try { this.recognition.stop(); } catch {}
    }
  }

  get isListening() {
    return this._listening;
  }
}


/* === Thai NLP intent parser ===================================== */

/**
 * Parse ข้อความภาษาไทย → intent
 * @param {string} text
 * @returns {{ type: string, amount: number|null, group: string, description: string, confidence: number }}
 */
export function parseIntent(text) {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  // === 1. Detect type (expense/income/transfer) ===
  let type = 'expense';     // default
  let confidence = 0.5;

  // Income signals
  if (/(?:ได้เงิน|รับเงิน|เงินเข้า|เงินเดือน|โบนัส|ค่าจ้าง|salary|รายรับ|คืนเงิน|refund|ดอกเบี้ย|กำไร|รับโอน)/i.test(text)) {
    type = 'income';
    confidence += 0.3;
  }
  // Transfer signals
  else if (/(?:โอนเงิน|โอนไป|ย้ายเงิน|transfer|ฝากเงิน)/i.test(text)) {
    type = 'transfer';
    confidence += 0.3;
  }
  // Expense signals (default หมวดมาก)
  else if (/(?:จ่าย|ซื้อ|กิน|ค่า|expense|ออกเงิน|เสียเงิน)/i.test(text)) {
    type = 'expense';
    confidence += 0.3;
  }

  // === 2. Extract amount ===
  const amount = extractAmount(text);
  if (amount != null) confidence += 0.2;

  // === 3. Detect category ===
  const group = detectCategory(text, type);
  if (group !== 'other') confidence += 0.2;

  // === 4. Build description ===
  // ลบ amount + คำสั่ง action ออก เหลือแต่ context
  let description = text
    .replace(/\d+(?:[.,]\d+)?\s*บาท?/g, '')                 // ลบตัวเลข + บาท
    .replace(/(?:จ่าย|ซื้อ|ได้|รับ|โอน|ค่า)/g, '')             // ลบคำสั่ง
    .replace(/\s+/g, ' ')
    .trim();

  // ถ้า description ว่าง ใช้ค่า default จาก category
  if (!description) {
    description = getDefaultDescription(group, type);
  }

  return { type, amount, group, description, confidence };
}


/* === Extract amount (digits + Thai number words) =============== */

function extractAmount(text) {
  // 1. Arabic digits — หาที่ใหญ่สุด
  const matches = [...text.matchAll(/(\d+(?:[.,]\d+)?)/g)];
  if (matches.length > 0) {
    // ถ้ามีหลายตัวเลข เลือกตัวที่ใหญ่สุด (อาจเป็น amount)
    const numbers = matches.map(m => parseFloat(m[1].replace(',', '')));
    return Math.max(...numbers);
  }

  // 2. Thai number words (basic)
  const thaiAmount = parseThaiNumber(text);
  if (thaiAmount != null) return thaiAmount;

  return null;
}

/** Parse Thai number words แบบพื้นฐาน */
function parseThaiNumber(text) {
  const units = {
    'ศูนย์': 0, 'หนึ่ง': 1, 'สอง': 2, 'สาม': 3, 'สี่': 4,
    'ห้า': 5, 'หก': 6, 'เจ็ด': 7, 'แปด': 8, 'เก้า': 9,
    'เอ็ด': 1
  };
  const tens = {
    'สิบ': 10, 'ยี่สิบ': 20, 'สามสิบ': 30, 'สี่สิบ': 40, 'ห้าสิบ': 50,
    'หกสิบ': 60, 'เจ็ดสิบ': 70, 'แปดสิบ': 80, 'เก้าสิบ': 90
  };
  const multipliers = {
    'ร้อย': 100,
    'พัน': 1000,
    'หมื่น': 10000,
    'แสน': 100000,
    'ล้าน': 1000000
  };

  // หา multiplier ก่อน เช่น "สองพัน" "ห้าร้อย"
  let total = 0;
  let foundAny = false;

  // Pattern: <unit><multiplier> เช่น สองพันห้าร้อย
  const multiPattern = /(หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า)?(ร้อย|พัน|หมื่น|แสน|ล้าน)/g;
  let match;
  while ((match = multiPattern.exec(text)) !== null) {
    const unit = match[1] ? units[match[1]] : 1;
    const mult = multipliers[match[2]];
    total += unit * mult;
    foundAny = true;
  }

  // หา tens — เรียงยาวก่อน เพื่อไม่ให้ 'สิบ' match ก่อน 'ห้าสิบ'
  for (const [word, val] of Object.entries(tens).sort(([a], [b]) => b.length - a.length)) {
    if (text.includes(word)) {
      total += val;
      foundAny = true;
      break;
    }
  }

  // เพิ่ม units ตอนท้าย (ห้าสิบเอ็ด → 51)
  // ทำง่ายๆ: ถ้าไม่มี tens แต่มี unit เดี่ยว
  if (!Object.keys(tens).some(k => text.includes(k))) {
    for (const [word, val] of Object.entries(units)) {
      if (text.endsWith(word) || text.includes(word + 'บาท')) {
        total += val;
        foundAny = true;
        break;
      }
    }
  }

  return foundAny ? total : null;
}


/* === Detect category =========================================== */

const CATEGORY_PATTERNS = {
  // Order matters — เฉพาะเจาะจงก่อน
  coffee:        /กาแฟ|coffee|latte|espresso|americano|คาปูชิโน่|มอคค่า|สตาร์บัค|amazon|cafe|คาเฟ่/i,
  food:          /กิน|ข้าว|อาหาร|ก๋วยเตี๋ยว|ส้มตำ|ผัด|ก๋วย|ส้ม|มื้อ|ข้าวเที่ยง|ข้าวเช้า|ข้าวเย็น|ราเมง|ซูชิ|พิซซ่า|เบอร์เกอร์|ของหวาน|ขนม/,
  transport:     /รถ|แท็กซี่|วิน|มอเตอร์ไซค์|bts|mrt|grab|bolt|lineman|เดินทาง|น้ำมัน|รถเมล์|เรือ|รถไฟ|tuk|tuktuk|เติมน้ำมัน|ค่าทาง/i,
  shopping:      /ช้อป|ซื้อของ|เสื้อ|กางเกง|รองเท้า|กระเป๋า|เครื่องสำอาง|lazada|shopee|amazon|tiktok shop|ของใช้|ขวดน้ำหอม/i,
  utility:       /ค่าไฟ|ค่าน้ำ|ค่าเน็ต|wifi|อินเทอร์เน็ต|ค่าโทร|ค่ามือถือ|true|ais|dtac|nt|mea|กฟภ|กฟน|กปภ|ค่าเช่า|ค่าบ้าน|ค่าหอ/i,
  rent:          /ค่าเช่า|ค่าหอ|ค่าบ้าน|rent/i,
  health:        /หมอ|โรงพยาบาล|ยา|คลินิก|วิตามิน|ตรวจสุขภาพ|รพ|ฟัน|พบแพทย์/,
  entertainment: /หนัง|movie|netflix|youtube|spotify|เกม|game|ดิสนีย์|disney|prime|wechat|line tv|viu|iqiyi/i,
  salary:        /เงินเดือน|salary|payroll/i,
  bonus:         /โบนัส|bonus|incentive/i,
  refund:        /คืนเงิน|refund|reimburse/i,
  transfer:      /โอน|transfer/i
};

function detectCategory(text, type) {
  // Filter patterns ที่เกี่ยวกับ type ปัจจุบัน
  for (const [group, pattern] of Object.entries(CATEGORY_PATTERNS)) {
    if (pattern.test(text)) {
      // ถ้า type=income แต่ detect ว่า food/coffee → ผู้ใช้อาจหมายถึง expense
      // sanity check: salary/bonus/refund = income only; transfer = transfer only
      if (group === 'salary' || group === 'bonus' || group === 'refund') {
        return type === 'income' ? group : 'other';
      }
      if (group === 'transfer') {
        return type === 'transfer' ? group : 'other';
      }
      // เป็น expense category — return ตรงๆ
      return group;
    }
  }
  return 'other';
}


/* === Default descriptions ======================================= */
const DEFAULT_DESC = {
  food: 'อาหาร',
  coffee: 'กาแฟ',
  transport: 'เดินทาง',
  shopping: 'ของซื้อ',
  utility: 'ค่าใช้จ่ายบ้าน',
  rent: 'ค่าเช่า',
  health: 'สุขภาพ',
  entertainment: 'บันเทิง',
  salary: 'เงินเดือน',
  bonus: 'โบนัส',
  refund: 'คืนเงิน',
  transfer: 'โอน',
  other: ''
};

function getDefaultDescription(group, type) {
  return DEFAULT_DESC[group] || (type === 'income' ? 'รายรับ' : 'รายจ่าย');
}
