// tests/run.mjs — Node.js test harness. Run: node tests/run.mjs
// No dependencies. Exits 1 on any failure.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const U = require('../js/utils.js');
const S = require('../js/store.js');
const P = require('../js/parsers.js');

let passed = 0, failed = 0;
const failures = [];

function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    process.stdout.write('.');
  } else {
    failed++;
    failures.push(`✗ ${label}\n   expected: ${e}\n   actual:   ${a}`);
    process.stdout.write('F');
  }
}
function ok(cond, label) {
  if (cond) { passed++; process.stdout.write('.'); }
  else { failed++; failures.push(`✗ ${label}`); process.stdout.write('F'); }
}
function approx(actual, expected, label, tol = 0) {
  if (typeof actual === 'number' && typeof expected === 'number'
      && Math.abs(actual - expected) <= tol) { passed++; process.stdout.write('.'); }
  else { failed++; failures.push(`✗ ${label}\n   expected ≈ ${expected} (±${tol})\n   actual:    ${actual}`); process.stdout.write('F'); }
}
function section(name) { console.log(`\n--- ${name} ---`); }

// Polyfill localStorage for store tests
const _ls = {};
globalThis.localStorage = {
  getItem: k => Object.prototype.hasOwnProperty.call(_ls, k) ? _ls[k] : null,
  setItem: (k, v) => { _ls[k] = String(v); },
  removeItem: k => { delete _ls[k]; },
  clear: () => { for (const k in _ls) delete _ls[k]; }
};
if (!globalThis.crypto) {
  // Older Node only — Node 22+ has crypto built-in as a read-only getter.
  Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: () => 'id-' + Math.random().toString(36).slice(2, 10) } });
}

// ============================================================
section('utils: money');
// ============================================================
eq(U.toSatang('1,234.56'), 123456, 'toSatang comma+decimal');
eq(U.toSatang('1234.5'),    123450, 'toSatang single decimal pad');
eq(U.toSatang('1234'),      123400, 'toSatang integer');
eq(U.toSatang(' 12.50 '),   1250,   'toSatang trim');
eq(U.toSatang('(500.00)'), -50000,  'toSatang parenthesized negative');
eq(U.toSatang('-12.34'),   -1234,   'toSatang negative sign');
eq(U.toSatang('100.00 Cr'), 10000,  'toSatang Cr suffix');
eq(U.toSatang('100.00 Dr'),-10000,  'toSatang Dr suffix');
eq(U.toSatang('฿1,000'),   100000,  'toSatang strip baht symbol');
eq(U.toSatang(''),         null,    'toSatang empty');
eq(U.toSatang(null),       null,    'toSatang null');
eq(U.toSatang('abc'),      null,    'toSatang garbage');
// Float-precision robustness
eq(U.toSatang(0.1) + U.toSatang(0.2), 30, 'toSatang avoids 0.1+0.2 drift');
eq(U.formatTHB(123456), '1,234.56 ฿', 'formatTHB');
eq(U.formatTHB(50),     '0.50 ฿', 'formatTHB cents only');
eq(U.formatTHB(-12345), '-123.45 ฿', 'formatTHB negative');
eq(U.formatTHB(0),      '0.00 ฿', 'formatTHB zero');

// ============================================================
section('utils: dates / BE↔CE');
// ============================================================
const refDate = new Date('2026-04-30');  // anchor for ambiguous years
eq(U.parseThaiDate('01/01/69',   refDate), '2026-01-01', 'BE 2-digit 69 → CE 2026');
eq(U.parseThaiDate('27/04/69',   refDate), '2026-04-27', 'BE 2-digit 69 day boundary');
eq(U.parseThaiDate('01/01/2569', refDate), '2026-01-01', 'BE 4-digit 2569 → CE 2026');
eq(U.parseThaiDate('01/01/2026', refDate), '2026-01-01', 'CE 4-digit passthrough');
eq(U.parseThaiDate('15 ม.ค. 69', refDate), '2026-01-15', 'Thai abbrev month');
eq(U.parseThaiDate('15 มกราคม 2569', refDate), '2026-01-15', 'Thai full month');
eq(U.parseThaiDate('15 ก.พ. 2569', refDate), '2026-02-15', 'Thai abbrev with 4-digit');
eq(U.parseThaiDate('15-JAN-2569',refDate), '2026-01-15', 'English abbrev');
eq(U.parseThaiDate('15-JAN-26',  refDate), '2026-01-15', '2-digit ambiguous near now → CE');
// Critical: a 2-digit year "26" is ambiguous. Spec says Thai bank context = BE.
// 2-digit "26" → BE 2526 → CE 1983 (too far) → fall back to CE 2026.
eq(U.parseThaiDate('2026-04-27', refDate), '2026-04-27', 'ISO format');
eq(U.parseThaiDate('31/02/69',   refDate), null, 'invalid date rejected');
eq(U.parseThaiDate('',           refDate), null, 'empty');
eq(U.parseThaiDate('garbage',    refDate), null, 'garbage');
eq(U.monthKey('2026-01-15'), '2026-01', 'monthKey');
eq(U.formatThaiMonth('2026-01'), 'ม.ค. 69', 'formatThaiMonth');
eq(U.formatThaiDate('2026-01-15'), '15 ม.ค. 69', 'formatThaiDate');

// ============================================================
section('utils: Thai number words');
// ============================================================
eq(U.parseThaiNumberWord('ห้าร้อย'),       500,   'ห้าร้อย');
eq(U.parseThaiNumberWord('หนึ่งพัน'),       1000,  'หนึ่งพัน');
eq(U.parseThaiNumberWord('สองพันห้าร้อย'),  2500,  'สองพันห้าร้อย');
eq(U.parseThaiNumberWord('หนึ่งหมื่น'),     10000, 'หนึ่งหมื่น');
eq(U.parseThaiNumberWord('สี่ร้อยห้าสิบ'),    450,   'สี่ร้อยห้าสิบ');
eq(U.extractAmount('จ่ายค่าไฟ 450 บาท'),  450,   'extract digit amount');
eq(U.extractAmount('1,234.56 บาท'),        1234.56, 'extract comma decimal');
eq(U.extractAmount('จ่ายค่าน้ำสี่ร้อยห้าสิบ'), 450, 'extract Thai-word amount');

// ============================================================
section('store: basic add + classification');
// ============================================================
const store = new S.Store();
store.load();
store.clear();
const t1 = store.add({ date: '2026-01-01', amount: 3751120, description: 'BSD02 SALARY', source: 'import' });
eq(t1.type,     'income',     'BSD02 → income');
eq(t1.group,    'salary',     'BSD02 → salary group');
eq(t1.category, 'เงินเดือน',   'BSD02 → เงินเดือน');
const t2 = store.add({ date: '2026-01-05', amount: 50000, description: 'ATM WITHDRAW' });
eq(t2.type,  'expense', 'ATM → expense');
eq(t2.group, 'atm',     'ATM → atm group');
const t3 = store.add({ date: '2026-01-06', amount: 15000, description: 'KTC payment' });
eq(t3.group, 'creditcard', 'KTC → creditcard');
const t4 = store.add({ date: '2026-01-07', amount: 17500, description: 'DDSWT INSURANCE' });
eq(t4.group, 'autodebit', 'DDSWT → autodebit');
const t5 = store.add({ date: '2026-01-08', amount: 5000, description: 'พร้อมเพย์ shop' });
eq(t5.group, 'promptpay', 'พร้อมเพย์ → promptpay');
const t6 = store.add({ date: '2026-01-09', amount: 20000, description: 'ค่าธรรมเนียม' });
eq(t6.group, 'fee', 'ค่าธรรมเนียม → fee');

// ============================================================
section('store: dedup on import');
// ============================================================
store.clear();
const before = store.list().length;
const result1 = store.addMany([
  { date: '2026-01-01', amount: 100000, description: 'Test A' },
  { date: '2026-01-02', amount: 200000, description: 'Test B' }
]);
eq(result1.added, 2, 'first batch adds 2');
const result2 = store.addMany([
  { date: '2026-01-01', amount: 100000, description: 'Test A' }, // duplicate
  { date: '2026-01-03', amount: 300000, description: 'Test C' }  // new
]);
eq(result2.added, 1, 'second batch dedupes 1');
eq(result2.skipped, 1, 'second batch skipped 1');
eq(store.list().length, 3, 'total after dedup');

// ============================================================
section('store: monthly stats');
// ============================================================
store.clear();
store.addMany([
  { date: '2026-01-15', amount: 3000000, description: 'BSD02', source: 'import' },
  { date: '2026-01-16', amount: 50000,   description: 'ATM' },
  { date: '2026-01-17', amount: 100000,  description: 'KTC' },
  { date: '2026-02-10', amount: 4000000, description: 'BSD02' },
  { date: '2026-02-11', amount: 200000,  description: 'พร้อมเพย์' }
]);
const stats = store.monthlyStats();
eq(stats['2026-01'].income,  3000000, 'Jan income');
eq(stats['2026-01'].expense, 150000,  'Jan expense (50k+100k)');
eq(stats['2026-01'].count,   3,       'Jan count');
eq(stats['2026-02'].income,  4000000, 'Feb income');
eq(stats['2026-02'].expense, 200000,  'Feb expense');
ok(stats['2026-01'].byGroup.atm,        'Jan has atm group');
ok(stats['2026-01'].byGroup.creditcard, 'Jan has creditcard group');

// ============================================================
section('store: daily balance + min balance + days below threshold');
// ============================================================
store.clear();
// Simulate a tiny statement with provided balances.
// Day 1: deposit 5000, balance 5000
// Day 2: withdraw 3000, balance 2000
// Day 3: withdraw 1500, balance 500   ← below 2000 threshold
// Day 4: nothing, balance carried =  500
// Day 5: deposit 4000, balance 4500
store.addMany([
  { date: '2026-03-01', type: 'income',  amount: 500000, balance: 500000, description: 'D1' },
  { date: '2026-03-02', type: 'expense', amount: 300000, balance: 200000, description: 'D2' },
  { date: '2026-03-03', type: 'expense', amount: 150000, balance: 50000,  description: 'D3' },
  { date: '2026-03-05', type: 'income',  amount: 400000, balance: 450000, description: 'D5' }
]);
const series = store.dailyBalanceSeries();
eq(series.length, 5, 'series fills gap (Mar 1-5)');
eq(series[0].balance, 500000, 'D1 balance');
eq(series[3].balance, 50000,  'D4 carries D3 balance');
eq(series[4].balance, 450000, 'D5 balance');
const minByMonth = store.minBalanceByMonth();
eq(minByMonth['2026-03'].balance, 50000,    'Min balance = 50000 satang');
eq(minByMonth['2026-03'].date,    '2026-03-03', 'Min balance day = D3');
const dbt = store.daysBelowThreshold(200000); // 2000 baht
eq(dbt['2026-03'].days, 2, 'Days below 2000 baht = 2 (Mar 3 + Mar 4)');

// ============================================================
section('parsers: bank detection');
// ============================================================
eq(P.detectBank('STATEMENT OF ACCOUNT - ธนาคารกรุงไทย จำกัด (มหาชน)').id,  'ktb',   'detect KTB');
eq(P.detectBank('KASIKORNBANK PUBLIC COMPANY LIMITED').id,                'kbank', 'detect KBank');
eq(P.detectBank('SIAM COMMERCIAL BANK PCL.').id,                          'scb',   'detect SCB');
eq(P.detectBank('BANGKOK BANK PUBLIC COMPANY LIMITED').id,                'bbl',   'detect BBL');
eq(P.detectBank('Krungsri - Bank of Ayudhya').id,                          'bay',   'detect BAY');
eq(P.detectBank('TMBThanachart Bank Public Company Limited').id,           'ttb',   'detect TTB');
eq(P.detectBank('ธนาคารออมสิน Government Savings Bank').id,                'gsb',   'detect GSB');
eq(P.detectBank('ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร BAAC').id,            'baac',  'detect BAAC');
eq(P.detectBank('ธนาคารอาคารสงเคราะห์ GHB').id,                            'ghb',   'detect GHB');
eq(P.detectBank('TISCO Bank').id,                                          'tisco', 'detect TISCO');
eq(P.detectBank('Kiatnakin Phatra Bank KKP').id,                           'kkp',   'detect KKP');
eq(P.detectBank('CIMB Thai Bank').id,                                      'cimb',  'detect CIMB');
eq(P.detectBank('UOB Thailand').id,                                        'uob',   'detect UOB');
eq(P.detectBank('LH Bank Land and Houses Bank').id,                        'lhb',   'detect LH');
eq(P.detectBank('ICBC (Thai) Bank').id,                                    'icbc',  'detect ICBC');
eq(P.detectBank('Some random text with no bank').id,                       'unknown','detect unknown');

// ============================================================
section('parsers: findDateInText / findNumbersInText');
// ============================================================
eq(P.findDateInText('15/01/2569 BSD02 37,511.20 14,325.02'), '15/01/2569', 'find DD/MM/YYYY');
eq(P.findDateInText('15 ม.ค. 69 BSD02 37,511.20'),           '15 ม.ค. 69', 'find Thai month');
eq(P.findDateInText('15-JAN-69 some text'),                  '15-JAN-69',  'find English month');
eq(P.findDateInText('no date here'),                          null,         'no date');
eq(P.findNumbersInText('37,511.20  0.00  14,325.02'), ['37,511.20', '0.00', '14,325.02'], 'three numbers');
eq(P.findNumbersInText('1,234 (500.00)'), ['1,234', '(500.00)'], 'parens preserved');

// ============================================================
section('parsers: row-by-row statement parse (3-column layout)');
// ============================================================
// Mock KTB-style rows: [date] [code/desc] [debit] [credit] [balance]
const ktbRows = [
  'ยอดยกมา 10,000.00',
  '01/01/2569 BSD02 SALARY 0.00 37,511.20 47,511.20',
  '02/01/2569 ATM WITHDRAW 5,000.00 0.00 42,511.20',
  '03/01/2569 KTC PAYMENT 4,948.91 0.00 37,562.29',
  '04/01/2569 พร้อมเพย์ SHOP 1,200.00 0.00 36,362.29',
  '05/01/2569 NBSDT TRANSFER IN 0.00 5,000.00 41,362.29',
  'รวม 11,148.91 42,511.20'  // footer — should be skipped
];
const ktbTx = P.parseStatement(ktbRows, { bank: 'ktb' });
eq(ktbTx.length, 5, 'KTB parsed 5 transactions');
eq(ktbTx[0].date, '2026-01-01', 'KTB tx0 date');
eq(ktbTx[0].type, 'income',     'KTB tx0 type');
eq(ktbTx[0].amount, 3751120,    'KTB tx0 amount = 37,511.20 satang');
eq(ktbTx[0].balance, 4751120,   'KTB tx0 balance');
eq(ktbTx[1].type, 'expense',    'KTB tx1 ATM = expense');
eq(ktbTx[1].amount, 500000,     'KTB tx1 amount');
eq(ktbTx[2].amount, 494891,     'KTB tx2 KTC amount');
eq(ktbTx[4].type, 'income',     'KTB tx4 NBSDT = income');

// ============================================================
section('parsers: 2-column layout (amount + balance with sign inferred)');
// ============================================================
// Some banks publish [amount, balance] only, with debit/credit inferred.
const sclRows = [
  'Brought forward 10,000.00',
  '01/01/2569 SALARY 37511.20 47511.20',   // +37511.20 to balance ⇒ credit
  '02/01/2569 ATM WITHDRAWAL 5000.00 42511.20', // -5000 ⇒ debit
  '03/01/2569 PAYMENT 1000.00 41511.20'    // -1000 ⇒ debit
];
const scbTx = P.parseStatement(sclRows, { bank: 'scb' });
eq(scbTx.length, 3, '2-col parsed 3 transactions');
eq(scbTx[0].type, 'income',  '2-col tx0 inferred income from balance delta');
eq(scbTx[1].type, 'expense', '2-col tx1 inferred expense');
eq(scbTx[2].type, 'expense', '2-col tx2 inferred expense');

// ============================================================
section('parsers: groupRowsByY');
// ============================================================
const items = [
  { str: 'B', transform: [1,0,0,1, 100, 700] },
  { str: 'A', transform: [1,0,0,1,  50, 700] },
  { str: 'D', transform: [1,0,0,1, 100, 680] },
  { str: 'C', transform: [1,0,0,1,  50, 680] }
];
const rowsGrp = P.groupRowsByY(items);
eq(rowsGrp.length, 2, 'grouped into 2 rows');
eq(rowsGrp[0].map(r => r.str).join(''), 'AB', 'row 0 sorted by X');
eq(rowsGrp[1].map(r => r.str).join(''), 'CD', 'row 1 sorted by X');

// ============================================================
section('regression: spec\'s Jan 69 expected totals (from PDF analysis)');
// ============================================================
// The spec gives: Jan 2569 income = 53,511.20  expense = 52,697.23  closing = 14,325.02
// We simulate the breakdown from the spec text and verify our store rolls it up.
store.clear();
store.addMany([
  // Income
  { date: '2026-01-25', amount: 3751120, description: 'BSD02 SALARY' },
  { date: '2026-01-15', amount: 1600000, description: 'NBSDT TRANSFER IN' },
  // Expenses
  { date: '2026-01-05', amount:  500000, description: 'โอนออก 1' },
  { date: '2026-01-06', amount:  500000, description: 'โอนออก 2' },
  { date: '2026-01-07', amount:  500000, description: 'โอนออก 3' },
  { date: '2026-01-08', amount:  232000, description: 'โอนออก 4' },
  { date: '2026-01-09', amount:  200000, description: 'โอนออก 5' },
  { date: '2026-01-10', amount:  300000, description: 'โอนออก 6' }, // total โอน = 22,320 baht
  { date: '2026-01-11', amount: 1800000, description: 'ATM' },
  { date: '2026-01-12', amount:  100000, description: 'พร้อมเพย์ 1' },
  { date: '2026-01-13', amount:  100000, description: 'พร้อมเพย์ 2' },
  { date: '2026-01-14', amount:  100000, description: 'พร้อมเพย์ 3' },
  { date: '2026-01-16', amount:  100000, description: 'พร้อมเพย์ 4' },
  { date: '2026-01-17', amount:  170800, description: 'พร้อมเพย์ 5' }, // 5,708 baht
  { date: '2026-01-18', amount:  494891, description: 'KTC' },
  { date: '2026-01-19', amount:  134532, description: 'DDSWT' },
  { date: '2026-01-20', amount:    7500, description: 'จ่ายบิล 1' },
  { date: '2026-01-21', amount:   10000, description: 'จ่ายบิล 2' },
  { date: '2026-01-22', amount:   20000, description: 'ค่าธรรมเนียม' }
]);
const sJan = store.monthlyStats()['2026-01'];
eq(sJan.income,           3751120 + 1600000, 'Jan income matches spec (5,351,120 satang)');
const expectedExpense = 500000+500000+500000+232000+200000+300000 + 1800000 + 100000+100000+100000+100000+170800 + 494891 + 134532 + 7500+10000 + 20000;
eq(sJan.expense, expectedExpense, 'Jan expense sums correctly');
ok(sJan.byGroup.salary,    'Jan has salary group');
ok(sJan.byGroup.transfer_in, 'Jan has transfer_in group');
ok(sJan.byGroup.transfer_out, 'Jan has transfer_out group');
ok(sJan.byGroup.atm,       'Jan has atm group');
ok(sJan.byGroup.promptpay, 'Jan has promptpay group');
ok(sJan.byGroup.bill,      'Jan has bill group (จ่ายบิล)');
ok(sJan.byGroup.creditcard,'Jan has creditcard group');
ok(sJan.byGroup.autodebit, 'Jan has autodebit group');
ok(sJan.byGroup.fee,       'Jan has fee group');
eq(sJan.byGroup.promptpay.count, 5, 'พร้อมเพย์ count = 5');
eq(sJan.byGroup.bill.count,      2, 'จ่ายบิล count = 2');

// ============================================================
section('parsers: stress — account numbers / phone / time should not pollute');
// ============================================================
// "TRANSFER TO 123-4-56789-0 ..." would naively yield 4 fake numbers.
const acctRows = [
  'Brought forward 10,000.00',
  '01/01/2569 TRANSFER TO 123-4-56789-0 K.SOMCHAI 5,000.00 5,000.00'
];
const acctTx = P.parseStatement(acctRows, { bank: 'ktb' });
eq(acctTx.length, 1, 'account-num row → 1 tx (no spurious extras)');
eq(acctTx[0].amount, 500000, 'amount = 5,000 baht');
ok(/123-4-56789-0|K\.SOMCHAI/i.test(acctTx[0].description), 'desc retains account/recipient');

// Time strings like 10:30 also have numbers
const timeRows = [
  'Brought forward 50,000.00',
  '01/01/2569 10:30 ATM WITHDRAW BTS ASOK 1,500.00 48,500.00'
];
const timeTx = P.parseStatement(timeRows, { bank: 'kbank' });
eq(timeTx.length, 1, 'time-stamped row → 1 tx');
eq(timeTx[0].amount, 150000, 'amount = 1,500 baht (not confused by 10:30)');

// Phone numbers in description
const phoneRows = [
  'Brought forward 20,000.00',
  '15/01/2569 พร้อมเพย์ 081-234-5678 K.SOMSAK 2,500.00 17,500.00'
];
const phoneTx = P.parseStatement(phoneRows, { bank: 'kbank' });
eq(phoneTx.length, 1, 'phone-num row → 1 tx');
eq(phoneTx[0].amount, 250000, 'amount = 2,500 baht (phone ignored)');

// ============================================================
section('parsers: year boundary (Dec → Jan)');
// ============================================================
const xmasRows = [
  'Brought forward 10,000.00',
  '31/12/2568 SALARY 30,000.00 0.00 40,000.00',  // BE 2568 → CE 2025
  '01/01/2569 RENT 0.00 15,000.00 25,000.00'      // CE 2026 — wait, this is wrong order
];
// Actually credit/debit columns: in my synthetic format [debit, credit, balance].
// So "30,000.00 0.00" = debit 30000, credit 0 → expense.
// Let me redo with correct semantics: salary should be in credit column.
const xmasRows2 = [
  'Brought forward 10,000.00',
  '31/12/2568 SALARY 0.00 30,000.00 40,000.00',
  '01/01/2569 RENT  15,000.00 0.00 25,000.00'
];
const xmasTx = P.parseStatement(xmasRows2, { bank: 'ktb' });
eq(xmasTx.length, 2, 'cross-year statement parsed');
eq(xmasTx[0].date, '2025-12-31', 'Dec 2568 → CE 2025');
eq(xmasTx[1].date, '2026-01-01', 'Jan 2569 → CE 2026');
eq(xmasTx[0].type, 'income',  'Dec 31 = salary income');
eq(xmasTx[1].type, 'expense', 'Jan 1 = rent expense');

// ============================================================
section('store: empty store stability');
// ============================================================
const empty = new S.Store();
empty.load();
empty.clear();
eq(empty.list().length, 0, 'empty list');
eq(JSON.stringify(empty.monthlyStats()), '{}', 'empty monthlyStats');
eq(empty.dailyBalanceSeries().length, 0, 'empty series');
eq(JSON.stringify(empty.minBalanceByMonth()), '{}', 'empty min by month');
eq(JSON.stringify(empty.daysBelowThreshold(200000)), '{}', 'empty days below');

// ============================================================
section('store: garbage tx input does not corrupt totals');
// ============================================================
empty.clear();
empty.add({ date: '2026-01-01', amount: 100000, description: 'good' });
empty.add({ date: '2026-01-02', amount: 'not a number', description: 'bad amount' });
empty.add({ date: 'bogus-date', amount: 50000, description: 'bad date' }); // bad date should not be in monthly stats
const stats2 = empty.monthlyStats();
ok(stats2['2026-01'], 'Jan stats present');
eq(stats2['2026-01'].count, 1, 'only valid Jan rows counted');
ok(!stats2['bogus-d'], 'bad-date row ignored from stats');

// ============================================================
section('parsers: bank detection — ambiguous text picks higher score');
// ============================================================
// If a text has SCB and KBank mentioned (say a comparison letter), the bank
// with more matches wins. This guards against PDF letterheads that mention
// multiple banks.
const ambiguous = 'Customer X transferred from KASIKORNBANK to SCB Siam Commercial. KASIKORN account.';
const detected = P.detectBank(ambiguous);
eq(detected.id, 'kbank', 'ambiguous text → highest match (KBank: 2)');

// ============================================================
section('voice: parseVoiceText (Thai NLP)');
// ============================================================
const V = require('../js/voice.js');

const v1 = V.parseVoiceText('จ่ายค่าไฟ 450 บาท');
eq(v1.type,     'expense',           'voice expense intent');
eq(v1.amount,   45000,               'voice 450 baht → 45000 satang');
eq(v1.group,    'utility',           'voice utility category');

const v2 = V.parseVoiceText('ได้รับเงินเดือน 30000');
eq(v2.type,     'income',            'voice income intent');
eq(v2.amount,   3000000,             'voice 30000 baht');
eq(v2.group,    'salary',            'voice salary category');

const v3 = V.parseVoiceText('ซื้อกาแฟร้อยห้าสิบ');
eq(v3.type,     'expense',           'voice expense (default)');
eq(v3.amount,   15000,               'voice Thai-words 150 baht');
eq(v3.group,    'food',              'voice food category');

const v4 = V.parseVoiceText('โอนเงินให้แม่ 5000 บาท');
eq(v4.type,     'expense',           'voice transfer-out is expense');
eq(v4.group,    'transfer_out',      'voice transfer_out group');

const v5 = V.parseVoiceText('ลงทุนกองทุน 10000');
eq(v5.type,     'investment',        'voice investment intent');
eq(v5.group,    'investment',        'voice investment category');

const v6 = V.parseVoiceText('ผ่อนรถ 8500 บาท');
eq(v6.type,     'debt',              'voice debt intent');
eq(v6.group,    'debt',              'voice debt category');

const v7 = V.parseVoiceText('grab food สองร้อยห้าสิบ');
eq(v7.type,     'expense',           'voice grab food expense');
eq(v7.amount,   25000,               'voice 250 from Thai words');
eq(v7.group,    'food',              'voice grab → food');

eq(V.parseVoiceText(''),           null, 'empty voice text → null');
eq(V.parseVoiceText('hello world'),null, 'no amount → null');

// ============================================================
console.log(`\n\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\n' + failures.join('\n'));
  process.exit(1);
}
