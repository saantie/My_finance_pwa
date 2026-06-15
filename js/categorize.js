/* ===================================================================
   categorize.js — classifier หมวดหมู่กลาง (ใช้ร่วม PDF / voice / manual)
   ===================================================================
   เดิมมี classifier แยกกัน 3 จุด (parsers.autoClassifyGroup, voice.detectCategory,
   manual ไม่มีเลย) keyword ไม่ตรงกัน → รวมเป็นตัวเดียวที่นี่ (finance-code-reuse)

   classifyCategory(text, type?) → group key
   - custom-category keywords ก่อน (user ตั้งเอง — ลำดับสูงสุด)
   - built-in keyword map เรียง specific → general (coffee ก่อน food, grocery ก่อน shopping)
   - type sanity: income-only / transfer-only group จะคืน 'other' ถ้า type ไม่ตรง
   - ไม่ import state/firebase → ปลอดภัยกับ test loader; parsers/voice/add import ได้
   =================================================================== */

/* custom category registry — set จาก app.js (State.getCustomCategories) */
let _customRegistry = [];
export function setClassifierCategories(cats) {
  _customRegistry = Array.isArray(cats) ? cats : [];
}

/* กลุ่มที่จำกัด type — กันจับผิดข้ามประเภท */
const INCOME_ONLY   = new Set(['salary', 'bonus', 'dividend', 'freelance', 'refund']);
const TRANSFER_ONLY = new Set(['transfer']);

/* Built-in keyword map — เรียงจากเฉพาะเจาะจง → ทั่วไป (ลำดับสำคัญ)
   key = group, value = regex (i flag). เพิ่ม keyword ที่นี่ที่เดียวพอ */
export const KEYWORD_GROUPS = [
  // กาแฟ — ก่อน food/shopping (café amazon ไม่ใช่ amazon shopping)
  ['coffee', /กาแฟ|coffee|latte|espresso|americano|cappuccino|มอคค่า|คาปูชิโน|สตาร์บัค|starbucks|caf[eé]\s*amazon|amazon\s*coffee|คาเฟ่\s*อเมซอน|อเมซอน|inthanin|อินทนิล|true\s*coffee|พันธุ์ไทย|punthai|kamu|คามุ|cafe|คาเฟ่/i],
  // ของชำ/ซุปเปอร์/ร้านสะดวกซื้อ — ก่อน food/shopping
  ['grocery', /lotus|โลตัส|tesco|big\s*c|บิ๊กซี|makro|แม็?คโคร|แม็กโคร|tops|ท็อปส์|villa\s*market|gourmet\s*market|maxvalu|แม็กซ์แวลู|foodland|ของสด|ซุปเปอร์|supermarket|hypermarket|7-?eleven|7\s*11|เซเว่น|เซเวน|family\s*mart|แฟมิลี่|cj\s*express|ซีเจ|lawson|มินิมาร์ท|ตลาดสด/i],
  // อาหาร/เดลิเวอรี/ร้านอาหาร
  ['food', /กิน|ข้าว|อาหาร|ก๋วยเตี๋ยว|ก๋วยจั๊บ|ส้มตำ|ผัด|มื้อ|ราเมง|ramen|ซูชิ|sushi|พิซซ่า|pizza|เบอร์เกอร์|burger|kfc|mcdonald|แมคโดนัล|แมค|mk\b|สุกี้|ชาบู|shabu|หมูกระทะ|บุฟเฟ่?ต์|buffet|ข้าวมันไก่|ก๋?วยเตี๋?ยว|grab\s*food|lineman|line\s*man|foodpanda|food\s*panda|robinhood|เดลิเวอรี|ร้านอาหาร|ภัตตาคาร|ของหวาน|ขนม|เบเกอรี่|bakery|dairy\s*queen|swensen|สเวนเซ่นส์/i],
  // ความงาม — ก่อน shopping/health
  ['beauty', /เครื่องสำอาง|cosmetic|watson|วัตสัน|boots|บู๊?ทส์|eve\s*and\s*boy|sephora|ทำผม|ร้านเสริมสวย|salon|ซาลอน|ทำเล็บ|ร้านเล็บ|\bnail|สปา|\bspa\b|นวด|massage|ครีม|สกินแคร์|skincare|แต่งหน้า|เสริมสวย/i],
  // เดินทาง/น้ำมัน/ทางด่วน
  ['transport', /แท็กซี่|taxi|\bวิน\b|มอเตอร์ไซค์|วินมอเตอร์ไซค์|\bbts\b|\bmrt\b|\barl\b|airport\s*rail|รถไฟฟ้า|รถเมล์|ขสมก|เรือด่วน|รถไฟ|\bsrt\b|tuk\s*tuk|ตุ๊กตุ๊ก|น้ำมัน|เติมน้ำมัน|ปตท|\bptt\b|esso|shell|caltex|bangchak|บางจาก|susco|\bpt\b|ทางด่วน|ทางพิเศษ|easy\s*pass|m-?flow|\bbem\b|ค่าทาง|ที่จอดรถ|parking|grab\s*(car|bike)|\bgrab\b|\bbolt\b|gojek|แกร็บ/i],
  // ช้อปปิ้ง
  ['shopping', /ช้อป|\bshop\b|ซื้อของ|เสื้อผ้า|กางเกง|รองเท้า|กระเป๋า|lazada|ลาซาด้า|shopee|ช้อปปี้|tiktok\s*shop|central|เซ็นทรัล|robinson|โรบินสัน|uniqlo|h&m|zara|ikea|อิเกีย|power\s*buy|พาวเวอร์บาย|\bjib\b|banana|advice|ของใช้|เครื่องใช้ไฟฟ้า|มือถือเครื่องใหม่/i],
  // ออกกำลังกาย — ก่อน health
  ['fitness', /ฟิตเนส|fitness|\bgym\b|ยิม|virgin\s*active|fitness\s*first|โยคะ|yoga|วิ่ง|ว่ายน้ำ|สนามกีฬา|คลาสออกกำลัง|เวท|ออกกำลังกาย/i],
  // สุขภาพ
  ['health', /หมอ|โรงพยาบาล|\bรพ\b|hospital|คลินิก|clinic|\bยา\b|ค่ายา|pharmacy|ร้านยา|fascino|ฟาสซิโน|วิตามิน|ตรวจสุขภาพ|\bฟัน\b|ทันตกรรม|dental|แพทย์|bumrungrad|บำรุงราษฎร์|samitivej|สมิติเวช|เภสัช/i],
  // การศึกษา
  ['education', /ค่าเทอม|ค่าเรียน|โรงเรียน|\bschool\b|มหาวิทยาลัย|university|คอร์ส|\bcourse\b|ติว|เรียนพิเศษ|udemy|coursera|skooldio|\bหนังสือ\b|ร้านหนังสือ|ซีเอ็ด|se-?ed|kinokuniya|\bb2s\b|นายอินทร์/i],
  // ประกัน
  ['insurance', /ประกัน|insurance|เบี้ยประกัน|\baia\b|เอไอเอ|prudential|allianz|เมืองไทยประกัน|ไทยประกัน|\bfwd\b|\baxa\b|ประกันรถ|ประกันสุขภาพ|ประกันชีวิต|กรุงเทพประกัน/i],
  // ค่าบ้าน/สาธารณูปโภค
  ['utility', /ค่าไฟ|ค่าน้ำ|ค่าเน็ต|wifi|อินเทอร์เน็ต|ค่าโทร|ค่ามือถือ|ค่าโทรศัพท์|\btrue\b|\bais\b|dtac|ทรู|\bnt\b|3bb|\bmea\b|\bpea\b|\bmwa\b|กฟภ|กฟน|กปภ|การไฟฟ้า|การประปา|ค่าส่วนกลาง|นิติบุคคล/i],
  // ค่าเช่า
  ['rent', /ค่าเช่า|ค่าหอ|\brent\b|\bcondo\b|คอนโด|หอพัก|อพาร์ทเมนท์|apartment/i],
  // ท่องเที่ยว
  ['travel', /โรงแรม|hotel|รีสอร์ท|resort|agoda|อโกด้า|booking\.com|airbnb|traveloka|ตั๋วเครื่องบิน|สายการบิน|airasia|แอร์เอเชีย|nok\s*air|นกแอร์|bangkok\s*airways|thai\s*airways|การบินไทย|\bทัวร์\b|เที่ยว|vacation|expedia|วีซ่า|passport|พาสปอร์ต/i],
  // บันเทิง/สตรีมมิ่ง
  ['entertainment', /\bหนัง\b|movie|โรงหนัง|major|sf\s*cinema|netflix|เน็ตฟลิกซ์|youtube|spotify|\bเกม\b|\bgame\b|steam|playstation|\bxbox\b|disney|ดิสนีย์|\bhbo\b|prime\s*video|\bviu\b|iqiyi|wetv|line\s*tv|apple\s*music|\bjoox\b|คอนเสิร์ต|concert|การ์ตูน/i],
  // บริจาค/ทำบุญ
  ['donation', /บริจาค|donate|donation|ทำบุญ|\bวัด\b|มูลนิธิ|foundation|สภากาชาด|ผ้าป่า|กฐิน|ตักบาตร|ถวาย/i],
  // ค่าธรรมเนียม
  ['fee', /ค่าธรรมเนียม|\bfee\b|ค่าปรับ|penalty|ดอกเบี้ยจ่าย|ค่าบริการ|service\s*charge|ค่าอากร/i],
  // === รายรับ ===
  ['salary', /เงินเดือน|salary|payroll|ค่าจ้างประจำ/i],
  ['dividend', /ปันผล|dividend|ดอกเบี้ยรับ|\binterest\b|ผลตอบแทน|กำไรหุ้น|capital\s*gain/i],
  ['bonus', /โบนัส|bonus|incentive|คอมมิชชั่น|commission/i],
  ['freelance', /ฟรีแลนซ์|freelance|งานเสริม|รับงาน|ค่าจ้างพิเศษ|side\s*income|งานพิเศษ/i],
  ['refund', /คืนเงิน|refund|reimburse|เงินคืน|cashback|cash\s*back|แคชแบ็ก/i],
  // === โอน ===
  ['transfer', /โอนเงิน|โอนไป|โอนเข้า|\btransfer\b|\batm\b|ถอนเงิน|withdraw|ชำระบัตร|ฝากเงิน|\bcdm\b|พร้อมเพย์|promptpay/i],
];

/**
 * จำแนกหมวดจากข้อความ
 * @param {string} text  — description / raw text / note
 * @param {string} [type] — 'expense'|'income'|'transfer' (ถ้ามี ใช้ตรวจ sanity)
 * @returns {string} group key (fallback 'other')
 */
export function classifyCategory(text, type) {
  const t = (text || '').toString();
  if (!t.trim()) return 'other';

  // 1. custom categories ก่อน (user-defined keywords)
  for (const cat of _customRegistry) {
    if (!cat.keywords || cat.keywords.length === 0) continue;
    for (const kw of cat.keywords) {
      const k = (kw || '').trim();
      if (k && safeTest(k, t)) return cat.id;
    }
  }

  // 2. built-in keyword map (specific → general)
  for (const [group, rx] of KEYWORD_GROUPS) {
    if (!rx.test(t)) continue;
    // 3. type sanity
    if (type) {
      if (INCOME_ONLY.has(group)   && type !== 'income')   continue;
      if (TRANSFER_ONLY.has(group) && type !== 'transfer') continue;
    }
    return group;
  }
  return 'other';
}

/** custom keyword อาจเป็น regex ที่ผู้ใช้พิมพ์ — กัน throw จาก pattern ผิด */
function safeTest(pattern, text) {
  try {
    return new RegExp(pattern, 'i').test(text);
  } catch {
    return text.toLowerCase().includes(pattern.toLowerCase());
  }
}
