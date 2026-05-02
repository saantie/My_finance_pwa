// js/voice.js — Web Speech API wrapper + Thai NLP parser.
//
// parseVoiceText(text) → { type, amount, category, group, description } | null
// Examples that should parse:
//   "จ่ายค่าไฟ 450 บาท"       → expense, 450, ค่าสาธารณูปโภค
//   "ใช้กาแฟร้อยห้าสิบ"        → expense, 150, อาหาร/เครื่องดื่ม
//   "ได้รับเงินเดือน 30000"   → income, 30000, เงินเดือน
//   "โอนเงินให้แม่ 5000 บาท"  → expense, 5000, โอนออก

(function (root) {
  'use strict';

  const U = (typeof require === 'function') ? require('./utils.js') : root.U;

  // Lexicon. Order matters — most specific first.
  const INTENT = {
    expense: [
      /จ่าย/, /ใช้/, /ซื้อ/, /เสียเงิน/, /โอนให้/, /โอนเงินให้/, /โอนออก/,
      /ถอน/, /ชำระ/, /pay\b/i, /spent?\b/i
    ],
    income: [
      /ได้รับ/, /รับเงิน/, /รับโอน/, /โอนเข้า/, /ฝาก/, /เงินเดือน/, /เงินคืน/,
      /ดอกเบี้ย/, /received?\b/i, /salary/i, /refund/i, /deposit/i
    ],
    investment: [
      /ลงทุน/, /ซื้อกองทุน/, /ซื้อหุ้น/, /invest/i, /buy stock|fund/i
    ],
    debt: [
      /ผ่อน/, /กู้/, /สินเชื่อ/, /loan/i, /installment/i
    ]
  };

  // Category keywords → group/category.
  // These map natural-language terms to the same groups used in store.js.
  const CATEGORIES = [
    { keywords: [/ค่าไฟ|ไฟฟ้า|ค่าน้ำ|ประปา|ค่าโทรศัพท์|มือถือ|internet|อินเตอร์เน็ต|netflix|spotify|youtube/i],
      group: 'utility', category: 'ค่าสาธารณูปโภค' },
    { keywords: [/อาหาร|กาแฟ|ข้าว|ของกิน|ร้านอาหาร|food|coffee|starbucks|mcdonald|kfc|grab\s*food|line\s*man/i],
      group: 'food', category: 'อาหาร/เครื่องดื่ม' },
    { keywords: [/ค่ารถ|แท็กซี่|grab|bts|mrt|น้ำมัน|gas|fuel|bolt|uber|รถไฟ|airport ?link/i],
      group: 'transport', category: 'เดินทาง' },
    { keywords: [/ค่าเช่า|rent|หอพัก|ค่าหอ|condo/i],
      group: 'rent', category: 'ค่าเช่า/ที่อยู่' },
    { keywords: [/หมอ|โรงพยาบาล|hospital|ยา|drug|clinic|medic/i],
      group: 'health', category: 'สุขภาพ' },
    { keywords: [/shopee|lazada|amazon|tops|big ?c|lotus|7-?eleven|ห้าง|mall|shopping|ซื้อของ/i],
      group: 'shopping', category: 'ช้อปปิ้ง' },
    { keywords: [/บัตรเครดิต|credit ?card|KTC|VISA|MASTER/i],
      group: 'creditcard', category: 'บัตรเครดิต' },
    { keywords: [/พร้อมเพย์|promptpay/i],
      group: 'promptpay', category: 'พร้อมเพย์' },
    { keywords: [/โอนให้|โอนเงินให้|โอนออก/i],
      group: 'transfer_out', category: 'โอนออก' },
    { keywords: [/รับโอน|โอนเข้า/i],
      group: 'transfer_in', category: 'รับโอน' },
    { keywords: [/เงินเดือน|salary|payroll/i],
      group: 'salary', category: 'เงินเดือน' },
    { keywords: [/ดอกเบี้ย|interest/i],
      group: 'interest', category: 'ดอกเบี้ย' },
    { keywords: [/กองทุน|fund|stock|หุ้น/i],
      group: 'investment', category: 'ลงทุน' },
    { keywords: [/ผ่อน|loan|สินเชื่อ/i],
      group: 'debt', category: 'หนี้สิน/ผ่อน' }
  ];

  function detectIntent(text) {
    for (const type of ['investment', 'debt', 'income', 'expense']) {
      for (const re of INTENT[type]) {
        if (re.test(text)) return type;
      }
    }
    return null;
  }

  function detectCategory(text, intent) {
    for (const c of CATEGORIES) {
      for (const re of c.keywords) {
        if (re.test(text)) return c;
      }
    }
    // Fallback by intent
    if (intent === 'income') return { group: 'transfer_in', category: 'รับเข้าอื่นๆ' };
    if (intent === 'investment') return { group: 'investment', category: 'ลงทุน' };
    if (intent === 'debt') return { group: 'debt', category: 'หนี้สิน/ผ่อน' };
    return { group: 'other', category: 'จ่ายออกอื่นๆ' };
  }

  /** Parse free-form Thai text into a transaction draft. Returns null if no
   *  recognizable amount or intent. */
  function parseVoiceText(text) {
    if (!text) return null;
    const s = String(text).trim();
    if (!s) return null;

    const amountBaht = U.extractAmount(s);
    if (amountBaht == null || !(amountBaht > 0)) return null;
    const amountSatang = Math.round(amountBaht * 100);

    let intent = detectIntent(s);
    if (!intent) intent = 'expense'; // default for ambiguous "ค่ากาแฟ 50"

    const cat = detectCategory(s, intent);
    return {
      type: intent,
      amount: amountSatang,
      group: cat.group,
      category: cat.category,
      description: s,
      source: 'voice'
    };
  }

  // ---------- Browser-side: Web Speech wrapper ----------
  // Only used in browser. Safe to require in Node (no-op).

  function startRecognition({ lang = 'th-TH', onResult, onError, onEnd } = {}) {
    if (typeof window === 'undefined') return null;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      onError && onError(new Error('Web Speech API not supported in this browser'));
      return null;
    }
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = (ev) => {
      const text = ev.results[0][0].transcript;
      onResult && onResult(text);
    };
    rec.onerror = (ev) => onError && onError(ev.error || ev);
    rec.onend = () => onEnd && onEnd();
    try { rec.start(); } catch (e) { onError && onError(e); }
    return rec;
  }

  const API = { parseVoiceText, detectIntent, detectCategory, startRecognition };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof root !== 'undefined') root.V = API;
})(typeof window !== 'undefined' ? window : globalThis);
