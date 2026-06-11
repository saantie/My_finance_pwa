// ─── Mock browser globals before any import ──────────────────────────
global.localStorage = (() => {
  let data = {};
  return {
    getItem:    k      => data[k] ?? null,
    setItem:    (k, v) => { data[k] = v; },
    removeItem: k      => { delete data[k]; },
    clear:      ()     => { data = {}; }
  };
})();
try { Object.defineProperty(global, 'navigator', { value: {}, writable: true, configurable: true }); } catch {}


// ─── Test framework ───────────────────────────────────────────────────
let passed = 0, failed = 0;
const errors = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write('.');
  } catch (e) {
    failed++;
    errors.push(`  ✗ ${name}\n    ${e.message}`);
    process.stdout.write('F');
  }
}

function assert(cond, msg)  { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg)      { if (a !== b) throw new Error(msg || `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function near(a, b, eps = 0.01) { if (Math.abs(a - b) > eps) throw new Error(`expected ~${b}, got ${a}`); }

// ─── Imports ──────────────────────────────────────────────────────────
const {
  bahtToSatang, satangToBaht, formatBaht,
  todayISO, parseLocalDate, ceToBe, dayNameTH, monthNameTH,
  formatShortDate, isSameDay, formatTime, calc, uuid
} = await import('../js/utils.js');

const {
  addTransaction, addTransactionsBatch, updateTransaction,
  deleteTransaction, softDeleteTransaction,
  getTransactions, getAccounts, getAccount,
  addAccount, updateAccount,
  getMonthSummary, getTopCategories,
  getTransactionsByDay, getDailyExpenses,
  setSetting, getSettings, resetAll, exportJSON, importJSON,
  getState,
  isDemoMode, markAsDemoMode, markDemoComplete, clearSampleData
} = await import('../js/state.js');

const { getDemoTransactions } = await import('../js/demo-data.js');

const {
  track, sanitize, withRageTap, getAllowedEvents, initAnalytics
} = await import('../js/analytics.js');

const { parseIntent } = await import('../js/voice.js');

const {
  detectBank, detectAccountInfo,
  autoClassifyType, autoClassifyGroup,
  groupRowsByY, parseTransactions: parseTxRows,
  detectColumns, isSkipRow, verifyParseResult
} = await import('../js/parsers.js');


// ═══════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════
console.log('\nutils.js');

// bahtToSatang
test('bahtToSatang(0) = 0',          () => eq(bahtToSatang(0), 0));
test('bahtToSatang(10) = 1000',       () => eq(bahtToSatang(10), 1000));
test('bahtToSatang(10.5) = 1050',     () => eq(bahtToSatang(10.5), 1050));
test('bahtToSatang(100) = 10000',     () => eq(bahtToSatang(100), 10000));
test('bahtToSatang(0.01) = 1',        () => eq(bahtToSatang(0.01), 1));

// satangToBaht
test('satangToBaht(0) = 0',           () => eq(satangToBaht(0), 0));
test('satangToBaht(1000) = 10',       () => eq(satangToBaht(1000), 10));
test('satangToBaht(1050) = 10.5',     () => eq(satangToBaht(1050), 10.5));
test('satangToBaht(150000) = 1500',   () => eq(satangToBaht(150000), 1500));

// formatBaht
test('formatBaht positive',           () => eq(formatBaht(100000), '1,000'));
test('formatBaht zero',               () => eq(formatBaht(0), '0'));
test('formatBaht 9900 = 99',          () => eq(formatBaht(9900), '99'));
test('formatBaht sign+ positive',     () => assert(formatBaht(100000, { sign: true }).startsWith('+')));
test('formatBaht negative prefix',    () => assert(formatBaht(-100000).startsWith('−')));
test('formatBaht sign+ negative',     () => assert(formatBaht(-100000, { sign: true }).startsWith('−')));
test('formatBaht decimals=2',         () => eq(formatBaht(150050, { decimals: 2 }), '1,500.50'));

// todayISO
test('todayISO length 10',            () => eq(todayISO().length, 10));
test('todayISO format',               () => assert(/^\d{4}-\d{2}-\d{2}$/.test(todayISO())));

// parseLocalDate
test('parseLocalDate year',           () => eq(parseLocalDate('2026-05-01').getFullYear(), 2026));
test('parseLocalDate month',          () => eq(parseLocalDate('2026-01-01').getMonth(), 0));
test('parseLocalDate date',           () => eq(parseLocalDate('2026-12-31').getDate(), 31));

// ceToBe
test('ceToBe 2026 = 2569',           () => eq(ceToBe(2026), 2569));
test('ceToBe 2000 = 2543',           () => eq(ceToBe(2000), 2543));

// dayNameTH — 2026-05-10 = Sunday, 2026-05-11 = Monday
test('dayNameTH Sunday',              () => eq(dayNameTH(new Date(2026, 4, 10)), 'อาทิตย์'));
test('dayNameTH Monday',              () => eq(dayNameTH(new Date(2026, 4, 11)), 'จันทร์'));

// monthNameTH
test('monthNameTH Jan full',          () => eq(monthNameTH(new Date(2026, 0, 1)), 'มกราคม'));
test('monthNameTH May full',          () => eq(monthNameTH(new Date(2026, 4, 1)), 'พฤษภาคม'));
test('monthNameTH Jan short',         () => eq(monthNameTH(new Date(2026, 0, 1), true), 'ม.ค.'));
test('monthNameTH May short',         () => eq(monthNameTH(new Date(2026, 4, 1), true), 'พ.ค.'));

// formatShortDate
test('formatShortDate has พ.ค.',      () => assert(formatShortDate('2026-05-01').includes('พ.ค.')));
test('formatShortDate has 2569',      () => assert(formatShortDate('2026-05-01').includes('2569')));

// isSameDay
test('isSameDay same = true',         () => eq(isSameDay('2026-05-01', '2026-05-01'), true));
test('isSameDay diff = false',        () => eq(isSameDay('2026-05-01', '2026-05-02'), false));

// formatTime
test('formatTime HH:MM',              () => eq(formatTime(new Date(2026, 0, 1, 10, 30)), '10:30'));
test('formatTime zero-pad',           () => eq(formatTime(new Date(2026, 0, 1, 9, 5)), '09:05'));
test('formatTime invalid = ""',       () => eq(formatTime('invalid'), ''));

// calc
test("calc '1+1' = 2",               () => eq(calc('1+1'), 2));
test("calc '1500+200' = 1700",        () => eq(calc('1500+200'), 1700));
test("calc '10*5' = 50",             () => eq(calc('10*5'), 50));
test("calc '100/4' = 25",            () => eq(calc('100/4'), 25));
test("calc '1500*0.93'",             () => near(calc('1500*0.93'), 1395));
test("calc 'abc' = null",            () => eq(calc('abc'), null));
test("calc '' = null",               () => eq(calc(''), null));

// uuid
test('uuid length 36',               () => eq(uuid().length, 36));
test('uuid v4 format',               () => assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid())));
test('uuid unique',                  () => assert(uuid() !== uuid()));


// ═══════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════
console.log('\nstate.js');
resetAll();

// addTransaction
test('addTransaction has id',         () => assert(!!addTransaction({ amount: 100 }).id));
test('addTransaction uuid format',    () => assert(/^[0-9a-f-]{36}$/.test(addTransaction({ amount: 100 }).id)));
test('addTransaction type default',   () => eq(addTransaction({ amount: 100 }).type, 'expense'));
test('addTransaction amount abs',     () => eq(addTransaction({ amount: -500 }).amount, 500));
test('addTransaction balance null',   () => eq(addTransaction({ amount: 100 }).balance, null));
test('addTransaction created_by',     () => eq(addTransaction({ amount: 100, created_by: 'a@b.com' }).created_by, 'a@b.com'));
test('addTransaction created_by null',() => eq(addTransaction({ amount: 100 }).created_by, null));
test('addTransaction deleted_by null',() => eq(addTransaction({ amount: 100 }).deleted_by, null));

resetAll();

// addTransactionsBatch
const batch = addTransactionsBatch([
  { amount: 200, date: '2026-01-01', created_by: 'x@y.com' },
  { amount: -300, date: '2026-01-02' }
]);
test('batch returns 2 items',         () => eq(batch.length, 2));
test('batch has id',                  () => assert(!!batch[0].id));
test('batch amount abs',              () => eq(batch[1].amount, 300));
test('batch created_by preserved',    () => eq(batch[0].created_by, 'x@y.com'));
test('batch deleted_by null',         () => eq(batch[0].deleted_by, null));
test('batch deleted_by null #2',      () => eq(batch[1].deleted_by, null));

resetAll();

// updateTransaction
const txU = addTransaction({ amount: 500, description: 'ก่อน' });
const updated = updateTransaction(txU.id, { description: 'หลัง' });
test('updateTransaction changes field', () => eq(updated.description, 'หลัง'));
test('updateTransaction returns null',  () => eq(updateTransaction('no-id', {}), null));
test('updateTransaction updatedAt',     () => assert(updated.updatedAt >= txU.updatedAt));

resetAll();

// deleteTransaction
const txD = addTransaction({ amount: 100 });
deleteTransaction(txD.id);
test('deleteTransaction removes',       () => eq(getTransactions().find(t => t.id === txD.id), undefined));
test('deleteTransaction silent miss',   () => { deleteTransaction('no-id'); assert(true); });

resetAll();

// softDeleteTransaction
const txS = addTransaction({ amount: 100 });
const softResult = softDeleteTransaction(txS.id, 'del@test.com');
test('softDelete returns tx',           () => assert(!!softResult));
test('softDelete sets deleted_by',      () => eq(softResult.deleted_by, 'del@test.com'));
test('softDelete still in raw state',   () => assert(!!getState().transactions.find(t => t.id === txS.id)));
test('softDelete null for missing',     () => eq(softDeleteTransaction('no-id', 'x@x.com'), null));

resetAll();

// getTransactions — sorting + soft-delete filter
addTransaction({ amount: 100, date: '2026-01-01' });
const txNew = addTransaction({ amount: 200, date: '2026-02-01' });
const txDel = addTransaction({ amount: 300, date: '2026-03-01' });
softDeleteTransaction(txDel.id, 'x@x.com');
const visible = getTransactions();
test('getTransactions newest first',    () => assert(visible[0].date >= visible[1].date));
test('getTransactions hides soft-del', () => eq(visible.find(t => t.id === txDel.id), undefined));
test('getTransactions shows others',    () => eq(visible.length, 2));

resetAll();

// addAccount
const acct = addAccount({ display_name: 'ทดสอบ', owner: 'o@test.com', storage: 'cloud', shared_with: ['a@b.com'] });
test('addAccount has id',               () => assert(!!acct.id));
test('addAccount owner',                () => eq(acct.owner, 'o@test.com'));
test('addAccount storage cloud',        () => eq(acct.storage, 'cloud'));
test('addAccount shared_with',          () => eq(acct.shared_with[0], 'a@b.com'));
const acct2 = addAccount({ display_name: 'ค่าเริ่มต้น' });
test('addAccount owner default null',   () => eq(acct2.owner, null));
test('addAccount storage default',      () => eq(acct2.storage, 'local'));
test('addAccount shared_with default',  () => eq(acct2.shared_with.length, 0));

// updateAccount
const acctU = addAccount({ display_name: 'เก่า' });
const updAcct = updateAccount(acctU.id, { display_name: 'ใหม่' });
test('updateAccount patches field',     () => eq(updAcct.display_name, 'ใหม่'));
test('updateAccount null for missing',  () => eq(updateAccount('no-id', {}), null));

resetAll();

// getMonthSummary
const YM = '2026-05';
addTransaction({ amount: 500000, type: 'income',   date: `${YM}-01` });
addTransaction({ amount: 200000, type: 'expense',  date: `${YM}-02` });
addTransaction({ amount: 100000, type: 'expense',  date: `${YM}-03` });
addTransaction({ amount: 300000, type: 'transfer', date: `${YM}-04` });
const summary = getMonthSummary(YM);
test('getMonthSummary income',          () => eq(summary.income, 500000));
test('getMonthSummary expense',         () => eq(summary.expense, 300000));
test('getMonthSummary net',             () => eq(summary.net, 200000));
test('getMonthSummary transfer skip',   () => eq(summary.count, 4));

// getTopCategories
const cats = getTopCategories(YM, 3);
test('getTopCategories sorted',         () => assert(cats.length <= 3));
test('getTopCategories has percent',    () => assert(cats.every(c => 'percent' in c)));

resetAll();

// setSetting / getSettings
setSetting('theme', 'pro');
test('setSetting updates',              () => eq(getSettings().theme, 'pro'));
setSetting('text_size', 'large');
test('setSetting text_size',            () => eq(getSettings().text_size, 'large'));

resetAll();

// resetAll
addTransaction({ amount: 999 });
resetAll();
test('resetAll clears transactions',    () => eq(getState().transactions.length, 0));
test('resetAll has cash account',       () => assert(!!getAccounts().find(a => a.id === 'cash:default')));

// exportJSON / importJSON
addTransaction({ amount: 100, description: 'ทดสอบ export' });
const json = exportJSON();
test('exportJSON is valid JSON',        () => { JSON.parse(json); assert(true); });
resetAll();
const ok = importJSON(json);
test('importJSON returns true',         () => eq(ok, true));
test('importJSON restores tx',          () => assert(getState().transactions.length > 0));
test('importJSON invalid = false',      () => eq(importJSON('not json'), false));
test('importJSON missing keys = false', () => eq(importJSON('{}'), false));

resetAll();

// getTransactionsByDay
addTransaction({ amount: 100, type: 'income',  date: '2026-05-01' });
addTransaction({ amount: 200, type: 'expense', date: '2026-05-01' });
addTransaction({ amount: 300, type: 'expense', date: '2026-05-02' });
const byDay = getTransactionsByDay();
test('getTransactionsByDay groups',     () => assert(byDay.length >= 2));
test('getTransactionsByDay totals',     () => {
  const day1 = byDay.find(d => d.date === '2026-05-01');
  assert(day1 && day1.dayTotalExpense === 200);
});

// getDailyExpenses
const daily = getDailyExpenses(7);
test('getDailyExpenses 7 days',         () => eq(daily.length, 7));
test('getDailyExpenses has date+total', () => assert(daily.every(d => 'date' in d && 'total' in d)));

resetAll();

// _received accounts must NOT be persisted to localStorage
// — verifies the revocation-stale-data bug fix (_received: true flag strategy)
test('saveToStorage excludes _received accounts', () => {
  resetAll();
  addAccount({ id: 'local-1',   display_name: 'บัญชีส่วนตัว', storage: 'local' });
  addAccount({ id: 'cloud-own', display_name: 'บัญชีคลาวด์ของฉัน', storage: 'cloud' });
  addAccount({ id: 'cloud-rcv', display_name: 'บัญชีรับแชร์', storage: 'cloud' });
  // mergeSharedAccounts sets _received: true — simulate that here
  updateAccount('cloud-rcv', { _received: true });
  const saved = JSON.parse(localStorage.getItem('diary_finance_v2'));
  assert(!saved.accounts.some(a => a.id === 'cloud-rcv'), '_received account must not be in localStorage');
  assert(saved.accounts.some(a => a.id === 'cloud-own'),  'own cloud account must be saved');
  assert(saved.accounts.some(a => a.id === 'local-1'),    'local account must be saved');
});

test('saveToStorage excludes _received account transactions', () => {
  resetAll();
  addAccount({ id: 'cloud-rcv', display_name: 'แชร์', storage: 'cloud' });
  updateAccount('cloud-rcv', { _received: true });
  addTransaction({ amount: 100000, account_from: 'cloud-rcv',   account_to: null });
  addTransaction({ amount: 50000,  account_from: 'cash:default', account_to: null });
  // v2 เก็บ transactions แบบ compact — amount ย่อเป็น amt
  const saved = JSON.parse(localStorage.getItem('diary_finance_v2'));
  const savedAmounts = saved.transactions.map(t => t.amt);
  assert(!savedAmounts.includes(100000), '_received cloud tx must not be in localStorage');
  assert(savedAmounts.includes(50000),   'local tx must be saved');
});

// importJSON with cloud accounts → no _received flag = treated as own → saved normally
test('importJSON preserves own cloud accounts in localStorage', () => {
  resetAll();
  importJSON(JSON.stringify({
    accounts: [
      { id: 'cash:default', storage: 'local', display_name: 'เงินสด',  shared_with: [] },
      { id: 'cloud-own',    storage: 'cloud', display_name: 'คลาวด์',  owner: 'me@x.com', shared_with: [] },
    ],
    transactions: [
      { id: 'tc1', amount: 99, account_from: 'cloud-own',    account_to: null, deleted_by: null },
      { id: 'tc2', amount: 77, account_from: 'cash:default', account_to: null, deleted_by: null },
    ],
    settings: {}
  }));
  const saved = JSON.parse(localStorage.getItem('diary_finance_v2'));
  // cloud accounts from import have no _received flag → treated as own → saved
  assert(saved.accounts.some(a => a.id === 'cloud-own'),
    'own cloud account from import must be saved to localStorage');
  assert(saved.transactions.some(t => t.id === 'tc1'),
    'own cloud account transaction must be saved');
  assert(saved.transactions.some(t => t.id === 'tc2'),
    'local transaction must remain in localStorage');
});

resetAll();


// ═══════════════════════════════════════════════════════════════════════
// PARSERS
// ═══════════════════════════════════════════════════════════════════════
console.log('\nparsers.js');

// detectBank
test('detectBank กสิกร',               () => eq(detectBank('ธนาคารกสิกรไทย'), 'kbank'));
test('detectBank kasikorn',            () => eq(detectBank('KASIKORN BANK'), 'kbank'));
test('detectBank kbank',               () => eq(detectBank('kbank statement'), 'kbank'));
test('detectBank กรุงไทย',             () => eq(detectBank('ธนาคารกรุงไทย'), 'ktb'));
test('detectBank ktb',                 () => eq(detectBank('KTB'), 'ktb'));
test('detectBank ไทยพาณิชย์',          () => eq(detectBank('ธนาคารไทยพาณิชย์'), 'scb'));
test('detectBank scb',                 () => eq(detectBank('SCB'), 'scb'));
test('detectBank กรุงเทพ',             () => eq(detectBank('ธนาคารกรุงเทพ'), 'bbl'));
test('detectBank กรุงศรี',             () => eq(detectBank('ธนาคารกรุงศรีอยุธยา'), 'bay'));
test('detectBank krungsri',            () => eq(detectBank('KRUNGSRI'), 'bay'));
test('detectBank ออมสิน',              () => eq(detectBank('ธนาคารออมสิน'), 'gsb'));
test('detectBank cimb',                () => eq(detectBank('CIMB THAI'), 'cimb'));
test('detectBank tisco',               () => eq(detectBank('TISCO BANK'), 'tisco'));
test('detectBank unknown',             () => eq(detectBank('ไม่รู้จัก'), 'unknown'));

// detectAccountInfo
test('detectAccountInfo 3-1-5-1',     () => {
  const r = detectAccountInfo('บัญชีเลขที่ 123-4-56789-0');
  assert(r.account_number_masked.includes('x'));
});
test('detectAccountInfo last4',        () => {
  const r = detectAccountInfo('Account 1234567890');
  eq(r.last4, '7890');
});
test('detectAccountInfo raw digits',   () => {
  const r = detectAccountInfo('1234567890');
  assert(r.last4 === '7890');
});
test('detectAccountInfo empty text',   () => {
  const r = detectAccountInfo('no account here');
  eq(r.account_number_masked, '');
});
test('detectAccountInfo masks all but last4', () => {
  const r = detectAccountInfo('123-4-56789-0');
  assert(!r.account_number_masked.includes('123'));
});

// autoClassifyType
test('autoClassify เงินเดือน = income', () => eq(autoClassifyType({ description: 'เงินเดือน' }), 'income'));
test('autoClassify salary = income',    () => eq(autoClassifyType({ description: 'salary deposit' }), 'income'));
test('autoClassify ดอกเบี้ย = income',  () => eq(autoClassifyType({ description: 'ดอกเบี้ย' }), 'income'));
test('autoClassify refund = income',    () => eq(autoClassifyType({ description: 'refund คืนเงิน' }), 'income'));
test('autoClassify ATM = transfer',     () => eq(autoClassifyType({ description: 'ATM withdraw' }), 'transfer'));
test('autoClassify ถอน = transfer',     () => eq(autoClassifyType({ description: 'ถอนเงิน' }), 'transfer'));
test('autoClassify credit card = transfer', () => eq(autoClassifyType({ description: 'ชำระบัตรเครดิต' }), 'transfer'));
test('autoClassify general = expense',  () => eq(autoClassifyType({ description: 'ร้านอาหาร' }), 'expense'));

// ownAccountMasks — โอนระหว่างบัญชีตัวเอง
test('autoClassify own account mask → transfer', () => {
  // mask ลงท้ายด้วย "7821" → description มี "7821" → transfer
  eq(autoClassifyType({ description: 'โอนไปบัญชี xxx-x-x7821-x' }, ['xxx-x-x7821-x']), 'transfer');
});
test('autoClassify other account → no match', () => {
  // mask ไม่ match → ยัง expense
  eq(autoClassifyType({ description: 'โอนไปบัญชี xxx-x-x9999-x' }, ['xxx-x-x7821-x']), 'expense');
});
test('autoClassify empty masks → no transfer', () => {
  // ไม่ส่ง masks → default = [] → ไม่ match
  eq(autoClassifyType({ description: 'โอน 7821 บาท' }), 'expense');
});
test('autoClassify multiple masks, one matches', () => {
  eq(autoClassifyType(
    { description: 'to account 5678' },
    ['xxx-x-x1234-x', 'xxx-x-x5678-x']
  ), 'transfer');
});

// autoClassifyGroup
test('autoClassifyGroup salary',        () => eq(autoClassifyGroup({ description: 'เงินเดือน salary' }), 'salary'));
test('autoClassifyGroup ATM = transfer',() => eq(autoClassifyGroup({ description: 'ATM ถอน' }), 'transfer'));
test('autoClassifyGroup starbucks',     () => eq(autoClassifyGroup({ description: 'STARBUCKS' }), 'coffee'));
test('autoClassifyGroup big c = food',  () => eq(autoClassifyGroup({ description: 'BIG C LOTUS' }), 'food'));
test('autoClassifyGroup grab = food',   () => eq(autoClassifyGroup({ description: 'GRAB FOOD' }), 'food'));
test('autoClassifyGroup bts = transport',()=> eq(autoClassifyGroup({ description: 'BTS MRT' }), 'transport'));
test('autoClassifyGroup ptt = transport',()=> eq(autoClassifyGroup({ description: 'PTT น้ำมัน' }), 'transport'));
test('autoClassifyGroup lazada = shopping',()=> eq(autoClassifyGroup({ description: 'LAZADA' }), 'shopping'));
test('autoClassifyGroup TRUE = utility',()=> eq(autoClassifyGroup({ description: 'TRUE internet' }), 'utility'));
test('autoClassifyGroup hospital',      () => eq(autoClassifyGroup({ description: 'โรงพยาบาล hospital' }), 'health'));
test('autoClassifyGroup netflix',       () => eq(autoClassifyGroup({ description: 'NETFLIX' }), 'entertainment'));
test('autoClassifyGroup rent',          () => eq(autoClassifyGroup({ description: 'ค่าเช่า condo' }), 'rent'));
test('autoClassifyGroup other',         () => eq(autoClassifyGroup({ description: 'ไม่รู้จัก' }), 'other'));

// groupRowsByY
test('groupRowsByY groups same Y',      () => {
  const items = [
    { str: 'A', transform: [0,0,0,0, 10, 100] },
    { str: 'B', transform: [0,0,0,0, 20, 100] },
    { str: 'C', transform: [0,0,0,0, 10, 50] }
  ];
  const rows = groupRowsByY(items);
  eq(rows.length, 2);
});
test('groupRowsByY sorts by X',         () => {
  const items = [
    { str: 'B', transform: [0,0,0,0, 20, 100] },
    { str: 'A', transform: [0,0,0,0, 10, 100] }
  ];
  const rows = groupRowsByY(items);
  eq(rows[0].text, 'A B');
});
test('groupRowsByY descending Y order', () => {
  const items = [
    { str: 'LOW',  transform: [0,0,0,0, 0, 10] },
    { str: 'HIGH', transform: [0,0,0,0, 0, 100] }
  ];
  const rows = groupRowsByY(items);
  eq(rows[0].text, 'HIGH');
});
test('groupRowsByY skips empty str',    () => {
  const items = [
    { str: '',  transform: [0,0,0,0, 0, 100] },
    { str: 'X', transform: [0,0,0,0, 0, 50] }
  ];
  const rows = groupRowsByY(items);
  eq(rows.length, 1);
});

// parseTransactions
function mockRow(text, y = 100) {
  return { y, text, items: [] };
}
test('parseTx extracts date',           () => {
  const rows = [mockRow('01/05/26 ซื้อของ 1,500.00')];
  const txs = parseTxRows(rows, 'kbank');
  assert(txs.length > 0 && txs[0].date === '2026-05-01');
});
test('parseTx amount in satang',        () => {
  const rows = [mockRow('01/05/26 ซื้อของ 1,500.00')];
  const txs = parseTxRows(rows, 'kbank');
  eq(txs[0].amount, 150000);
});
test('parseTx skips header row',        () => {
  const rows = [mockRow('วันที่ รายการ จำนวนเงิน คงเหลือ')];
  eq(parseTxRows(rows, 'kbank').length, 0);
});
test('parseTx skips no-date row',       () => {
  const rows = [mockRow('ไม่มีวันที่ใดเลย')];
  eq(parseTxRows(rows, 'kbank').length, 0);
});
test('parseTx Buddhist year',           () => {
  const rows = [mockRow('01/05/2569 ค่าอาหาร 250.00')];
  const txs = parseTxRows(rows, 'kbank');
  assert(txs.length > 0 && txs[0].date.startsWith('2026'));
});
test('parseTx 2 amounts → balance',     () => {
  const rows = [mockRow('01/05/26 โอนเงิน 5,000.00 50,000.00')];
  const txs = parseTxRows(rows, 'kbank');
  assert(txs.length > 0 && txs[0].balance !== null);
});
test('parseTx skips zero-amount row',   () => {
  const rows = [mockRow('01/05/26 header row 0.00')];
  eq(parseTxRows(rows, 'kbank').length, 0);
});


// ═══════════════════════════════════════════════════════════════════════
// VOICE
// ═══════════════════════════════════════════════════════════════════════
console.log('\nvoice.js');

// parseIntent basics
test('parseIntent null = null',         () => eq(parseIntent(null), null));
test('parseIntent returns object',      () => {
  const r = parseIntent('ซื้อกาแฟ 65 บาท');
  assert(r && 'type' in r && 'amount' in r && 'group' in r && 'confidence' in r);
});
test('parseIntent confidence >= 0',      () => {
  const r = parseIntent('ซื้อกาแฟ 65 บาท');
  assert(r.confidence >= 0);
});

// Type detection
test('voice ได้เงินเดือน = income',      () => eq(parseIntent('ได้เงินเดือน 25000').type, 'income'));
test('voice รับเงิน = income',          () => eq(parseIntent('รับเงิน 500 บาท').type, 'income'));
test('voice เงินเข้า = income',         () => eq(parseIntent('เงินเข้า 5000').type, 'income'));
test('voice คืนเงิน = income',          () => eq(parseIntent('คืนเงิน 100').type, 'income'));
test('voice โอนเงินไป = transfer',      () => eq(parseIntent('โอนเงินไปกสิกร 1000').type, 'transfer'));
test('voice โอนไป = transfer',          () => eq(parseIntent('โอนไปบัญชีออม 500').type, 'transfer'));
test('voice จ่ายค่าไฟ = expense',       () => eq(parseIntent('จ่ายค่าไฟ 450 บาท').type, 'expense'));
test('voice ซื้อกาแฟ = expense',        () => eq(parseIntent('ซื้อกาแฟ 65 บาท').type, 'expense'));

// Amount extraction
test('voice amount 450 บาท',            () => eq(parseIntent('จ่าย 450 บาท').amount, 450));
test('voice amount 1,500',              () => eq(parseIntent('จ่าย 1,500 บาท').amount, 1500));
test('voice amount 25000',              () => eq(parseIntent('ได้เงินเดือน 25000').amount, 25000));
test('voice Thai ห้าร้อย',              () => eq(parseIntent('ห้าร้อยบาท').amount, 500));
test('voice Thai สองพัน',               () => eq(parseIntent('สองพันบาท').amount, 2000));
test('voice Thai ห้าสิบ',               () => eq(parseIntent('ห้าสิบบาท').amount, 50));
test('voice multiple → largest',        () => {
  const r = parseIntent('จ่าย 100 เพิ่ม 3000 บาท');
  eq(r.amount, 3000);
});
test('voice no number = null',          () => eq(parseIntent('ซื้อของ').amount, null));

// Category detection
test('voice กาแฟ = coffee',             () => eq(parseIntent('กาแฟ 65').group, 'coffee'));
test('voice สตาร์บัค = coffee',          () => eq(parseIntent('สตาร์บัค 150').group, 'coffee'));
test('voice กินข้าว = food',             () => eq(parseIntent('กินข้าว 80').group, 'food'));
test('voice แท็กซี่ = transport',        () => eq(parseIntent('แท็กซี่ 100').group, 'transport'));
test('voice bts = transport',           () => eq(parseIntent('bts 50').group, 'transport'));
test('voice shopee = shopping',         () => eq(parseIntent('ซื้อของ shopee 399').group, 'shopping'));
test('voice ค่าไฟ = utility',           () => eq(parseIntent('จ่ายค่าไฟ 450').group, 'utility'));
test('voice โรงพยาบาล = health',        () => eq(parseIntent('ไปโรงพยาบาล 500').group, 'health'));
test('voice netflix = entertainment',   () => eq(parseIntent('จ่าย netflix 299').group, 'entertainment'));
test('voice ค่าเช่า → utility (nt match)', () => eq(parseIntent('ค่าเช่า 5000').group, 'utility'));
test('voice เงินเดือน income = salary', () => eq(parseIntent('ได้เงินเดือน 25000').group, 'salary'));
test('voice โบนัส income = bonus',      () => eq(parseIntent('ได้รับโบนัส 50000').group, 'bonus'));
test('voice unknown = other',           () => eq(parseIntent('ทำบางอย่าง 100').group, 'other'));

// Confidence
test('voice income keyword → conf>0.5', () => assert(parseIntent('ได้เงินเดือน 25000').confidence > 0.5));
test('voice expense keyword → conf>0.5',() => assert(parseIntent('จ่ายค่าไฟ 450').confidence > 0.5));
test('voice with amount → higher conf', () => {
  const withAmt  = parseIntent('ซื้อของ 100');
  const withoutAmt = parseIntent('ซื้อของ');
  assert(withAmt.confidence >= withoutAmt.confidence);
});
test('voice with category → higher conf', () => {
  const withCat    = parseIntent('กาแฟ 65');
  const withoutCat = parseIntent('ทำบางอย่าง 65');
  assert(withCat.confidence >= withoutCat.confidence);
});

// Description
test('voice removes amount+บาท',        () => {
  const r = parseIntent('จ่ายค่าน้ำ 450 บาท');
  assert(!r.description.includes('450'));
});
test('voice description not empty',     () => {
  const r = parseIntent('กาแฟ 65');
  assert(r.description.length > 0);
});
test('voice removes action word จ่าย',  () => {
  const r = parseIntent('จ่ายค่าไฟ 450');
  assert(!r.description.startsWith('จ่าย'));
});


// ═══════════════════════════════════════════════════════════════════════
// REAL PDF FIXTURES — KTB + BBL column detection tests
// (snapshot ของ X-coord จาก pdf.js — simulate parser logic)
// ═══════════════════════════════════════════════════════════════════════

const KTB_HEADER_ITEMS = [
  { str: 'วันที่/เวลา',              transform: [0,0,0,0,  80, 700] },
  { str: 'รายการ',                   transform: [0,0,0,0, 165, 700] },
  { str: 'รายละเอียด/หมายเลขเช็ค',   transform: [0,0,0,0, 300, 700] },
  { str: 'รายการถอน',                transform: [0,0,0,0, 480, 700] },
  { str: 'รายการฝาก',                transform: [0,0,0,0, 565, 700] },
  { str: 'ยอดเงินคงเหลือ',            transform: [0,0,0,0, 660, 700] },
  { str: 'สาขา',                     transform: [0,0,0,0, 760, 700] }
];
const KTB_INCOME_ITEMS = [
  { str: '01/03/69',            transform: [0,0,0,0,  80, 600] },
  { str: '22:32',               transform: [0,0,0,0,  80, 590] },
  { str: 'เงินโอนเข้า (NBSDT)', transform: [0,0,0,0, 165, 600] },
  { str: 'TR fr 4750263206',    transform: [0,0,0,0, 300, 600] },
  { str: '2,000.00',            transform: [0,0,0,0, 595, 600] },  // ใกล้ depositX=565
  { str: '13,979.50',           transform: [0,0,0,0, 690, 600] },  // ใกล้ balanceX=660
  { str: '475',                 transform: [0,0,0,0, 770, 600] }
];
const KTB_EXPENSE_ITEMS = [
  { str: '01/03/69',              transform: [0,0,0,0,  80, 580] },
  { str: '05:40',                 transform: [0,0,0,0,  80, 570] },
  { str: 'โอนเงินออก (IORSWT)',   transform: [0,0,0,0, 165, 580] },
  { str: '034-012332860799',      transform: [0,0,0,0, 300, 580] },
  { str: '100.00',                transform: [0,0,0,0, 510, 580] },  // ใกล้ withdrawalX=480
  { str: '11,979.50',             transform: [0,0,0,0, 690, 580] },
  { str: '433',                   transform: [0,0,0,0, 770, 580] }
];

const BBL_HEADER_ITEMS = [
  { str: 'วันที่',       transform: [0,0,0,0,  60, 700] },
  { str: 'Date',         transform: [0,0,0,0,  60, 690] },
  { str: 'รายการ',       transform: [0,0,0,0, 130, 700] },
  { str: 'Particulars',  transform: [0,0,0,0, 130, 690] },
  { str: 'เลขที่เช็ค',   transform: [0,0,0,0, 290, 700] },
  { str: 'Chq.No.',      transform: [0,0,0,0, 290, 690] },
  { str: 'ถอน',          transform: [0,0,0,0, 410, 700] },
  { str: 'Withdrawal',   transform: [0,0,0,0, 410, 690] },
  { str: 'ฝาก',          transform: [0,0,0,0, 490, 700] },
  { str: 'Deposit',      transform: [0,0,0,0, 490, 690] },
  { str: 'คงเหลือ',      transform: [0,0,0,0, 580, 700] },
  { str: 'Balance',      transform: [0,0,0,0, 580, 690] },
  { str: 'ผ่านทาง',      transform: [0,0,0,0, 680, 700] }
];
const BBL_BF_ITEMS = [
  { str: '01/06/25', transform: [0,0,0,0,  60, 670] },
  { str: 'B/F',      transform: [0,0,0,0, 130, 670] },
  { str: '22.52',    transform: [0,0,0,0, 600, 670] }   // ใกล้ balanceX=580
];
const BBL_INTEREST_ITEMS = [
  { str: '25/06/25',      transform: [0,0,0,0,  60, 650] },
  { str: 'INTEREST PAID', transform: [0,0,0,0, 130, 650] },
  { str: '3.65',          transform: [0,0,0,0, 510, 650] },  // ใกล้ depositX=490
  { str: '26.17',         transform: [0,0,0,0, 600, 650] },  // ใกล้ balanceX=580
  { str: 'Auto',          transform: [0,0,0,0, 690, 650] }
];
const BBL_TRF_IN_ITEMS = [
  { str: '22/08/25',       transform: [0,0,0,0,  60, 630] },
  { str: 'TRF FR OTH BK', transform: [0,0,0,0, 130, 630] },
  { str: '2,583.00',       transform: [0,0,0,0, 510, 630] },  // deposit
  { str: '2,609.17',       transform: [0,0,0,0, 600, 630] },
  { str: 'mPhone',         transform: [0,0,0,0, 690, 630] }
];
const BBL_PMT_ITEMS = [
  { str: '29/08/25',      transform: [0,0,0,0,  60, 610] },
  { str: 'PMT FOR GOODS', transform: [0,0,0,0, 130, 610] },
  { str: '5,600.00',      transform: [0,0,0,0, 430, 610] },  // ใกล้ withdrawalX=410
  { str: '9.17',          transform: [0,0,0,0, 600, 610] }   // balance
];

// ─── Column detection ────────────────────────────────────────────────

test('detectColumns finds KTB column positions', () => {
  const rows = groupRowsByY(KTB_HEADER_ITEMS);
  const cols = detectColumns(rows);
  assert(cols !== null, 'should detect columns');
  assert(cols.withdrawalX === 480, `withdrawalX expected 480 got ${cols.withdrawalX}`);
  assert(cols.depositX   === 565, `depositX expected 565 got ${cols.depositX}`);
  assert(cols.balanceX   === 660, `balanceX expected 660 got ${cols.balanceX}`);
});

test('detectColumns finds BBL column positions', () => {
  const rows = groupRowsByY(BBL_HEADER_ITEMS);
  const cols = detectColumns(rows);
  assert(cols !== null, 'should detect columns');
  assert(cols.withdrawalX === 410, `withdrawalX expected 410 got ${cols.withdrawalX}`);
  assert(cols.depositX   === 490, `depositX expected 490 got ${cols.depositX}`);
  assert(cols.balanceX   === 580, `balanceX expected 580 got ${cols.balanceX}`);
});

test('detectColumns returns null when no header', () => {
  const rows = [{ y: 0, text: 'random text', items: [{ str: 'foo', transform: [0,0,0,0,0,0] }] }];
  eq(detectColumns(rows), null);
});

// ─── KTB income/expense classification (Bug 1) ───────────────────────

test('KTB income row: เงินโอนเข้า → direction=in, type=income', () => {
  const rows = groupRowsByY([...KTB_HEADER_ITEMS, ...KTB_INCOME_ITEMS]);
  const txs  = parseTxRows(rows, 'ktb');
  assert(txs.length === 1, `expected 1 tx, got ${txs.length}`);
  eq(txs[0].amount, 200000);
  eq(txs[0].direction, 'in');
  eq(autoClassifyType(txs[0]), 'income');
});

test('KTB expense row: โอนเงินออก → direction=out, type=expense', () => {
  const rows = groupRowsByY([...KTB_HEADER_ITEMS, ...KTB_EXPENSE_ITEMS]);
  const txs  = parseTxRows(rows, 'ktb');
  assert(txs.length === 1, `expected 1 tx, got ${txs.length}`);
  eq(txs[0].amount, 10000);
  eq(txs[0].direction, 'out');
  eq(autoClassifyType(txs[0]), 'expense');
});

// ─── BBL income/expense classification (Bug 1) ───────────────────────

test('BBL INTEREST PAID → direction=in, type=income', () => {
  const rows = groupRowsByY([...BBL_HEADER_ITEMS, ...BBL_INTEREST_ITEMS]);
  const txs  = parseTxRows(rows, 'bbl');
  assert(txs.length === 1, `expected 1 tx, got ${txs.length}`);
  eq(txs[0].direction, 'in');
  eq(autoClassifyType(txs[0]), 'income');
});

test('BBL TRF FR OTH BK → direction=in, type=income', () => {
  const rows = groupRowsByY([...BBL_HEADER_ITEMS, ...BBL_TRF_IN_ITEMS]);
  const txs  = parseTxRows(rows, 'bbl');
  assert(txs.length === 1, `expected 1 tx, got ${txs.length}`);
  eq(txs[0].direction, 'in');
  eq(autoClassifyType(txs[0]), 'income');
});

test('BBL PMT FOR GOODS → direction=out, type=expense', () => {
  const rows = groupRowsByY([...BBL_HEADER_ITEMS, ...BBL_PMT_ITEMS]);
  const txs  = parseTxRows(rows, 'bbl');
  assert(txs.length === 1, `expected 1 tx, got ${txs.length}`);
  eq(txs[0].direction, 'out');
  eq(autoClassifyType(txs[0]), 'expense');
});

// ─── BBL B/F row must NOT become a transaction (Bug 2) ───────────────

test('BBL B/F row is NOT extracted as transaction', () => {
  const rows = groupRowsByY([...BBL_HEADER_ITEMS, ...BBL_BF_ITEMS]);
  const txs  = parseTxRows(rows, 'bbl');
  eq(txs.length, 0);
});

test('isSkipRow matches B/F and variations', () => {
  assert(isSkipRow('B/F'));
  assert(isSkipRow('C/F'));
  assert(isSkipRow('ยอดยกมา'));
  assert(isSkipRow('Balance Brought Forward'));
  assert(isSkipRow('Total'));
  assert(isSkipRow('จำนวนรายการ 31'));
  assert(!isSkipRow('เงินโอนเข้า'));
  assert(!isSkipRow('Starbucks coffee'));
});

// ─── verifyParseResult ────────────────────────────────────────────────

test('verifyParseResult: matched balance change → ok', () => {
  // opening 1,000 + income 500 - expense 200 = closing 1,300
  const txs = [
    { direction: 'in',  amount: 50000,  balance: 150000 },
    { direction: 'out', amount: 20000,  balance: 130000 }
  ];
  const v = verifyParseResult(txs);
  assert(v.ok, `expected ok, got diff=${v.diff}`);
});

test('verifyParseResult: swapped direction → not ok', () => {
  const txs = [
    { direction: 'out', amount: 50000,  balance: 150000 },
    { direction: 'in',  amount: 20000,  balance: 130000 }
  ];
  const v = verifyParseResult(txs);
  assert(!v.ok, `expected fail, got diff=${v.diff}`);
  assert(v.diff >= 40000, `expected diff>=40000, got ${v.diff}`);
});

// ═══════════════════════════════════════════════════════════════════════
// DUPLICATE DETECTOR
// ═══════════════════════════════════════════════════════════════════════
console.log('\nduplicate-detector.js');

const { similarity, daysBetween, findPotentialDuplicates } =
  await import('../js/duplicate-detector.js');

// similarity
test('similarity: identical strings → 1', () => {
  eq(similarity('ค่าไฟ MEA', 'ค่าไฟ MEA'), 1);
});
test('similarity: case-insensitive identical → 1', () => {
  eq(similarity('Starbucks', 'starbucks'), 1);
});
test('similarity: substring → 0.9', () => {
  eq(similarity('ค่าไฟ', 'ค่าไฟ MEA'), 0.9);
});
test('similarity: reverse substring → 0.9', () => {
  eq(similarity('ค่าไฟ MEA', 'ค่าไฟ'), 0.9);
});
test('similarity: empty both → 1', () => {
  eq(similarity('', ''), 1);
});
test('similarity: one empty → 0', () => {
  eq(similarity('', 'abc'), 0);
});
test('similarity: completely different → 0', () => {
  assert(similarity('กาแฟ', 'ค่าเช่า') < 0.5);
});

// daysBetween
test('daysBetween: same date → 0', () => {
  eq(daysBetween('2026-05-01', '2026-05-01'), 0);
});
test('daysBetween: 3 days apart', () => {
  eq(daysBetween('2026-05-01', '2026-05-04'), 3);
});
test('daysBetween: order-independent', () => {
  eq(daysBetween('2026-05-10', '2026-05-03'), 7);
});

// findPotentialDuplicates
const EXISTING = [
  { id: 'a', amount: 120000, date: '2026-05-01', description: 'ค่าไฟ MEA', deleted_by: null },
  { id: 'b', amount: 500000, date: '2026-05-01', description: 'ค่าเช่า',   deleted_by: null },
  { id: 'c', amount: 120000, date: '2026-05-01', description: 'ค่าไฟ MEA', deleted_by: 'someone@example.com' },  // soft-deleted
];

test('findPotentialDuplicates: same amount + date + desc → found', () => {
  const r = findPotentialDuplicates(
    { amount: 120000, date: '2026-05-01', description: 'ค่าไฟ MEA' },
    EXISTING
  );
  eq(r.length, 1);
  eq(r[0].tx.id, 'a');
  eq(r[0].score, 1);
});

test('findPotentialDuplicates: same amount + 5 day diff + same desc → found', () => {
  const r = findPotentialDuplicates(
    { amount: 120000, date: '2026-05-06', description: 'ค่าไฟ MEA' },
    EXISTING
  );
  eq(r.length, 1);
  eq(r[0].tx.id, 'a');
});

test('findPotentialDuplicates: amount diff > 100 satang → not found', () => {
  const r = findPotentialDuplicates(
    { amount: 121500, date: '2026-05-01', description: 'ค่าไฟ MEA' },
    EXISTING
  );
  eq(r.length, 0);
});

test('findPotentialDuplicates: soft-deleted not returned', () => {
  // id 'c' matches but is soft-deleted → only 'a' should match
  const r = findPotentialDuplicates(
    { amount: 120000, date: '2026-05-01', description: 'ค่าไฟ MEA' },
    EXISTING
  );
  assert(r.every(c => c.tx.id !== 'c'), 'soft-deleted tx must be excluded');
});

test('findPotentialDuplicates: > 7 day diff → not found', () => {
  const r = findPotentialDuplicates(
    { amount: 120000, date: '2026-05-10', description: 'ค่าไฟ MEA' },
    EXISTING
  );
  eq(r.length, 0);
});

test('findPotentialDuplicates: returns at most 3', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({
    id: `x${i}`, amount: 120000, date: '2026-05-01',
    description: 'ค่าไฟ MEA', deleted_by: null
  }));
  const r = findPotentialDuplicates(
    { amount: 120000, date: '2026-05-01', description: 'ค่าไฟ MEA' },
    many
  );
  assert(r.length <= 3, `expected ≤ 3, got ${r.length}`);
});

test('findPotentialDuplicates: low similarity → not found', () => {
  const r = findPotentialDuplicates(
    { amount: 120000, date: '2026-05-01', description: 'ค่ากาแฟ' },
    EXISTING,
    0.7
  );
  eq(r.length, 0);
});


// ═══════════════════════════════════════════════════════════════════════
// ADD.JS — source checks (no window.prompt, openAccountPickerModal exported)
// ═══════════════════════════════════════════════════════════════════════
console.log('\nadd.js');
const { readFileSync } = await import('node:fs');
const addJsSrc = readFileSync('./js/add.js', 'utf8');

test('add.js: openAccountPickerModal is exported', () => {
  assert(addJsSrc.includes('export function openAccountPickerModal'), 'must export openAccountPickerModal');
});

test('add.js: no window.prompt() calls', () => {
  // allow the string "prompt(" only inside comments or strings — simplest check: raw presence
  assert(!addJsSrc.includes('= prompt(') && !addJsSrc.includes('window.prompt('), 'add.js must not call prompt()');
});

test('add.js: picker-overlay class used in openAccountPickerModal', () => {
  assert(addJsSrc.includes('picker-overlay'), 'must use picker-overlay class');
});

test('add.js: picker-sheet class used', () => {
  assert(addJsSrc.includes('picker-sheet'), 'must use picker-sheet class');
});

test('add.js: picker-add button present', () => {
  assert(addJsSrc.includes('picker-add'), 'must have picker-add button');
});

test('add.js: ESC key closes picker', () => {
  assert(addJsSrc.includes("e.key==='Escape'") || addJsSrc.includes('e.key === \'Escape\''), 'must handle ESC key');
});


// ═══════════════════════════════════════════════════════════════════════
// DEMO MODE
// ═══════════════════════════════════════════════════════════════════════
console.log('\ndemo mode');

test('getDemoTransactions returns array of 30+ items', () => {
  const txs = getDemoTransactions();
  assert(Array.isArray(txs), 'should be array');
  assert(txs.length >= 30, `should have ≥30 transactions, got ${txs.length}`);
});

test('getDemoTransactions: all items have source=sample', () => {
  const txs = getDemoTransactions();
  assert(txs.every(t => t.source === 'sample'), 'every tx must have source: sample');
});

test('getDemoTransactions: has income and expense types', () => {
  const txs = getDemoTransactions();
  assert(txs.some(t => t.type === 'income'),  'must include income tx');
  assert(txs.some(t => t.type === 'expense'), 'must include expense tx');
});

test('isDemoMode: false by default', () => {
  resetAll();
  eq(isDemoMode(), false, 'should be false on fresh state');
});

test('markAsDemoMode: sets demo mode', () => {
  resetAll();
  markAsDemoMode();
  eq(isDemoMode(), true, 'should be true after markAsDemoMode');
});

test('markDemoComplete: clears demo mode', () => {
  resetAll();
  markAsDemoMode();
  markDemoComplete();
  eq(isDemoMode(), false, 'should be false after markDemoComplete');
});

test('loadDemoData flow: addTransactionsBatch + markAsDemoMode → has transactions', () => {
  resetAll();
  markAsDemoMode();
  addTransactionsBatch(getDemoTransactions());
  assert(isDemoMode(), 'demo mode should be set');
  assert(getTransactions().length >= 30, 'should have ≥30 transactions');
});

test('clearDemoData flow: clearSampleData removes sample txs', () => {
  resetAll();
  markAsDemoMode();
  addTransactionsBatch(getDemoTransactions());
  assert(getTransactions().length >= 30, 'precondition: has demo data');
  clearSampleData();
  markDemoComplete();
  eq(getTransactions().length, 0, 'all sample transactions should be removed');
  eq(isDemoMode(), false, 'demo mode should be cleared');
});

test('clearSampleData preserves non-sample transactions', () => {
  resetAll();
  markAsDemoMode();
  addTransactionsBatch(getDemoTransactions());
  addTransaction({ date: todayISO(), type: 'expense', amount: 5000, group: 'food', description: 'real tx' });
  clearSampleData();
  eq(getTransactions().length, 1, 'real transaction should survive clearSampleData');
  eq(getTransactions()[0].description, 'real tx', 'should keep the real tx');
});


// ═══════════════════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════════════════
console.log('\nanalytics.js');

// Reset state + re-init analytics before each analytics test
function resetForAnalytics() {
  resetAll();
  setSetting('analytics_opt_out', false);
  initAnalytics({ getSettings });
}

// ── sanitize ──────────────────────────────────────────────────────────

test('sanitize boolean: coerces truthy/falsy values', () => {
  eq(sanitize(1, 'boolean'), true);
  eq(sanitize(0, 'boolean'), false);
  eq(sanitize('yes', 'boolean'), true);
  eq(sanitize(false, 'boolean'), false);
});

test('sanitize number: accepts finite number', () => {
  eq(sanitize(42, 'number'), 42);
  eq(sanitize(0, 'number'), 0);
  eq(sanitize(-5.5, 'number'), -5.5);
});

test('sanitize number: rejects string', () => {
  eq(sanitize('42', 'number'), undefined);
});

test('sanitize number: rejects NaN', () => {
  eq(sanitize(NaN, 'number'), undefined);
});

test('sanitize number: rejects Infinity', () => {
  eq(sanitize(Infinity, 'number'), undefined);
  eq(sanitize(-Infinity, 'number'), undefined);
});

test('sanitize string: returns string as-is under 100 chars', () => {
  eq(sanitize('hello', 'string'), 'hello');
});

test('sanitize string: truncates to 100 chars', () => {
  const long = 'x'.repeat(150);
  eq(sanitize(long, 'string').length, 100);
});

test('sanitize string: rejects non-string', () => {
  eq(sanitize(123, 'string'), undefined);
  eq(sanitize(null, 'string'), undefined);
});

test('sanitize enum: accepts value in list', () => {
  eq(sanitize('manual', ['manual', 'voice', 'pdf']), 'manual');
  eq(sanitize('pdf', ['manual', 'voice', 'pdf']), 'pdf');
});

test('sanitize enum: rejects value not in list', () => {
  eq(sanitize('other', ['manual', 'voice', 'pdf']), undefined);
  eq(sanitize('', ['manual', 'voice', 'pdf']), undefined);
});

test('sanitize unknown type: returns undefined', () => {
  eq(sanitize('value', 'object'), undefined);
});

// ── track ─────────────────────────────────────────────────────────────

test('track: non-whitelisted event warns + does not throw', () => {
  resetAll();
  setSetting('analytics_opt_out', false);
  initAnalytics({ getSettings });
  const warns = [];
  const origWarn = console.warn;
  console.warn = (...args) => warns.push(args.join(' '));
  track('unknown_event_xyz', {});
  console.warn = origWarn;
  assert(warns.some(w => w.includes('not in whitelist')), 'should warn about unknown event');
});

test('track: whitelisted event with unknown field drops the field', () => {
  resetAll();
  setSetting('analytics_opt_out', false);
  initAnalytics({ getSettings });
  const captured = [];
  global.window = { posthog: { capture: (name, props) => captured.push({ name, props }) } };
  track('transaction_added', { source: 'manual', secret_amount: 99999 });
  global.window = undefined;
  assert(captured.length === 1, 'should have captured one event');
  assert(!('secret_amount' in captured[0].props), 'unknown field must be dropped');
  eq(captured[0].props.source, 'manual', 'known field must be present');
});

test('track: user opt-out → no send', () => {
  resetAll();
  setSetting('analytics_opt_out', true);
  initAnalytics({ getSettings });
  const captured = [];
  global.window = { posthog: { capture: (name, props) => captured.push({ name, props }) } };
  track('transaction_added', { source: 'manual' });
  global.window = undefined;
  eq(captured.length, 0, 'should not send when opt-out is true');
});

test('track: opt-in sends valid event', () => {
  resetAll();
  setSetting('analytics_opt_out', false);
  initAnalytics({ getSettings });
  const captured = [];
  global.window = { posthog: { capture: (name, props) => captured.push({ name, props }) } };
  track('session_length_sec', { value: 120 });
  global.window = undefined;
  eq(captured.length, 1, 'should capture event');
  eq(captured[0].name, 'session_length_sec');
  eq(captured[0].props.value, 120);
});

test('track: enum field with invalid value → field dropped', () => {
  resetAll();
  setSetting('analytics_opt_out', false);
  initAnalytics({ getSettings });
  const captured = [];
  global.window = { posthog: { capture: (name, props) => captured.push({ name, props }) } };
  track('transaction_added', { source: 'unknown_source' });
  global.window = undefined;
  assert(captured.length === 1, 'event still fires');
  assert(!('source' in captured[0].props), 'invalid enum value should be dropped');
});

test('track: event with empty schema sends empty props', () => {
  resetAll();
  setSetting('analytics_opt_out', false);
  initAnalytics({ getSettings });
  const captured = [];
  global.window = { posthog: { capture: (name, props) => captured.push({ name, props }) } };
  track('app_first_open', { extra: 'data' });
  global.window = undefined;
  eq(captured.length, 1, 'should capture event');
  eq(Object.keys(captured[0].props).length, 0, 'no props from empty schema');
});

test('track: number field with string value → field dropped', () => {
  resetAll();
  setSetting('analytics_opt_out', false);
  initAnalytics({ getSettings });
  const captured = [];
  global.window = { posthog: { capture: (name, props) => captured.push({ name, props }) } };
  track('session_length_sec', { value: '120' });
  global.window = undefined;
  assert(captured.length === 1, 'event fires');
  assert(!('value' in captured[0].props), 'string passed as number should be dropped');
});

// ── getAllowedEvents ──────────────────────────────────────────────────

test('getAllowedEvents returns copy of whitelist', () => {
  const events = getAllowedEvents();
  assert('app_first_open' in events, 'should have app_first_open');
  assert('transaction_added' in events, 'should have transaction_added');
  assert('rage_tap_detected' in events, 'should have rage_tap_detected');
  // Verify it's a copy, not the original
  events.injected_event = {};
  const events2 = getAllowedEvents();
  assert(!('injected_event' in events2), 'mutations to copy should not affect original');
});

// ── withRageTap ───────────────────────────────────────────────────────

test('withRageTap: 3 taps within 1.5s triggers rage_tap_detected', () => {
  resetAll();
  setSetting('analytics_opt_out', false);
  initAnalytics({ getSettings });
  const captured = [];
  global.window = { posthog: { capture: (name, props) => captured.push({ name, props }) } };

  const handler = withRageTap('test_button', () => {});
  handler({});
  handler({});
  handler({});

  global.window = undefined;
  const rageTaps = captured.filter(c => c.name === 'rage_tap_detected');
  eq(rageTaps.length, 1, 'should trigger exactly once on 3rd tap');
  eq(rageTaps[0].props.feature, 'test_button', 'should include feature name');
});

test('withRageTap: resets after trigger, needs 3 more taps', () => {
  resetAll();
  setSetting('analytics_opt_out', false);
  initAnalytics({ getSettings });
  const captured = [];
  global.window = { posthog: { capture: (name, props) => captured.push({ name, props }) } };

  const handler = withRageTap('reset_test', () => {});
  handler({}); handler({}); handler({}); // first rage tap
  handler({}); handler({}); // only 2 after reset → no second trigger

  global.window = undefined;
  const rageTaps = captured.filter(c => c.name === 'rage_tap_detected');
  eq(rageTaps.length, 1, 'should only trigger once after reset with 2 more taps');
});

test('withRageTap: calls original handler', () => {
  let called = 0;
  const handler = withRageTap('btn', () => { called++; });
  handler({});
  eq(called, 1, 'original handler should be called');
});

test('withRageTap: works without original handler', () => {
  const handler = withRageTap('btn_no_handler');
  // Should not throw
  handler({});
  assert(true, 'no error when originalHandler is undefined');
});


// ═══════════════════════════════════════════════════════════════════════
// EXPORT.JS — utility functions
// ═══════════════════════════════════════════════════════════════════════
console.log('\nexport.js');

// Mock SVGElement + document.createElement for import (export.js uses svgIcon)
if (!global.document) {
  global.document = {
    createElement: () => ({ innerHTML: '', className: '', querySelectorAll: () => [], querySelector: () => null, appendChild: () => {} }),
    body: { appendChild: () => {} },
  };
}

const { resolvePeriod, generateFilename, enumerateMonths, normalizeMerchant } =
  await import('../js/export.js');

// resolvePeriod
test('resolvePeriod this-month: from = 1st of current month', () => {
  const { from, to } = resolvePeriod('this-month', null);
  const today = new Date();
  const expectedFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  eq(from, expectedFrom);
});

test('resolvePeriod this-month: to = today', () => {
  const { to } = resolvePeriod('this-month', null);
  eq(to, todayISO());
});

test('resolvePeriod this-year: from starts with current year', () => {
  const { from } = resolvePeriod('this-year', null);
  const year = new Date().getFullYear().toString();
  assert(from.startsWith(year), `from should start with ${year}, got ${from}`);
});

test('resolvePeriod all: from is 2000-01-01', () => {
  const { from } = resolvePeriod('all', null);
  eq(from, '2000-01-01');
});

test('resolvePeriod last-month: from < to', () => {
  const { from, to } = resolvePeriod('last-month', null);
  assert(from < to, `from (${from}) should be before to (${to})`);
  assert(from.endsWith('-01'), 'from should be 1st of last month');
});

// generateFilename
test('generateFilename full year: ปี พ.ศ. in name', () => {
  const name = generateFilename('2026-01-01', '2026-12-31');
  assert(name.includes('2569'), `should contain BE year 2569, got: ${name}`);
  assert(name.endsWith('.xlsx'), 'must end with .xlsx');
});

test('generateFilename partial range: contains both endpoints', () => {
  const name = generateFilename('2026-03-01', '2026-05-31');
  assert(name.includes('.xlsx'), 'must end with .xlsx');
  assert(name.length > 5, 'filename must not be empty');
});

test('generateFilename: always ends with .xlsx', () => {
  assert(generateFilename('2025-01-01', '2025-06-30').endsWith('.xlsx'));
  assert(generateFilename('2026-01-01', '2026-12-31').endsWith('.xlsx'));
});

// enumerateMonths
test('enumerateMonths same month: returns 1 entry', () => {
  const months = enumerateMonths('2026-05-01', '2026-05-31');
  eq(months.length, 1);
  eq(months[0], '2026-05');
});

test('enumerateMonths 3 months: returns 3 entries', () => {
  const months = enumerateMonths('2026-01-01', '2026-03-31');
  eq(months.length, 3);
  eq(months[0], '2026-01');
  eq(months[2], '2026-03');
});

test('enumerateMonths cross year: counts correctly', () => {
  const months = enumerateMonths('2025-11-01', '2026-02-28');
  eq(months.length, 4);
  eq(months[0], '2025-11');
  eq(months[3], '2026-02');
});

test('enumerateMonths full year: 12 months', () => {
  const months = enumerateMonths('2026-01-01', '2026-12-31');
  eq(months.length, 12);
});

// normalizeMerchant
test('normalizeMerchant removes trailing numbers', () => {
  const r = normalizeMerchant('STARBUCKS 0042');
  assert(!r.match(/\d{3,}/), 'should not have 3+ digits in result');
});

test('normalizeMerchant strips branch suffix patterns', () => {
  const r = normalizeMerchant('7-ELEVEN BRANCH 0123');
  assert(r.length > 0, 'result must not be empty');
  assert(r.includes('7-ELEVEN') || r.startsWith('7'), 'should keep merchant name');
});

test('normalizeMerchant: uppercases result', () => {
  const r = normalizeMerchant('starbucks coffee');
  eq(r, r.toUpperCase());
});

test('normalizeMerchant: empty string returns empty', () => {
  eq(normalizeMerchant(''), '');
});


// ─── Summary ─────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n\n${total} tests: ${passed} passed${failed ? `, ${failed} failed` : ''}\n`);
if (errors.length) {
  errors.forEach(e => console.log(e));
  process.exit(1);
}
