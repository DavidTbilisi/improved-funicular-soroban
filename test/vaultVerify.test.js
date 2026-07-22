import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyRecall, splitLoci, locusSize } from '../src/vault/verify.js';
import { makeEntry } from '../src/vault/entry.js';

const PI30 = '141592653589793238462643383279';   // 3 loci
const entryOf = (code, mode = 'full', radix = 10) =>
  makeEntry({ id: 'v1', label: 't', code, radix, mode });

test('loci are ten digits in decimal, eight symbols in hex', () => {
  assert.equal(locusSize(10), 10);
  assert.equal(locusSize(16), 8);
  assert.deepEqual(splitLoci(PI30), ['1415926535', '8979323846', '2643383279']);
  assert.deepEqual(splitLoci('123', 10), ['123'], 'a short tail is its own locus');
  assert.deepEqual(splitLoci('DEADBEEFCAFE', 16), ['DEADBEEF', 'CAFE']);
});

// --- full mode: exact ------------------------------------------------------
test('an exact recall passes and says so with certainty', () => {
  const r = verifyRecall(entryOf(PI30), PI30);
  assert.equal(r.ok, true);
  assert.equal(r.certain, true);
  assert.equal(r.firstBad, -1);
  assert.match(r.message, /Exactly right/);
});

test('separators in the recall are tolerated', () => {
  assert.equal(verifyRecall(entryOf(PI30), '14159 26535 89793 23846 26433 83279').ok, true);
});

test('a wrong locus is named, and the rest is credited', () => {
  const wrong = '1415926535' + '8979323847' + '2643383279';   // one digit off in locus 2
  const r = verifyRecall(entryOf(PI30), wrong);
  assert.equal(r.ok, false);
  assert.equal(r.firstBad, 1);
  assert.equal(r.loci[0].ok, true);
  assert.equal(r.loci[1].ok, false);
  assert.equal(r.loci[2].ok, true);
  assert.match(r.message, /Locus 2 is wrong/);
  assert.match(r.message, /the rest is right/);
});

test('several wrong loci are all named', () => {
  const wrong = '1415926530' + '8979323840' + '2643383279';
  const r = verifyRecall(entryOf(PI30), wrong);
  assert.match(r.message, /Loci 1, 2/);
});

test('the wrong length is reported as a length problem, not a locus one', () => {
  const short = verifyRecall(entryOf(PI30), PI30.slice(0, 28));
  assert.equal(short.ok, false);
  assert.equal(short.lengthOk, false);
  assert.match(short.message, /2 digits too few/);

  const long = verifyRecall(entryOf(PI30), PI30 + '99');
  assert.match(long.message, /2 digits too many/);
});

test('empty input says so rather than reporting every locus wrong', () => {
  const r = verifyRecall(entryOf(PI30), '');
  assert.equal(r.ok, false);
  assert.equal(r.message, 'Nothing entered.');
});

// Exact mode catches what the seal alone cannot.
test('full mode catches two compensating errors that the seal would miss', () => {
  // Swap 5 and 3 between positions: the digit-sum is unchanged, so the seal passes.
  const code = '1234500000';
  const typed = '1432500000';
  const e = entryOf(code);
  const r = verifyRecall(e, typed);
  assert.equal(r.loci[0].sealOk, true, 'the seal is fooled...');
  assert.equal(r.ok, false, '...but the exact comparison is not');
  assert.equal(r.loci[0].exact, false);
});

// --- sealed mode: seal-checked ---------------------------------------------
test('sealed mode verifies without ever having stored the digits', () => {
  const e = entryOf(PI30, 'sealed');
  assert.equal(e.code, undefined);
  const r = verifyRecall(e, PI30);
  assert.equal(r.ok, true);
  assert.equal(r.certain, false, 'and it does not claim certainty');
  assert.match(r.message, /1 locus in 9/);
});

test('sealed mode localises a wrong locus without revealing the answer', () => {
  const wrong = '1415926535' + '8979323847' + '2643383279';
  const r = verifyRecall(entryOf(PI30, 'sealed'), wrong);
  assert.equal(r.ok, false);
  assert.equal(r.firstBad, 1);
  assert.match(r.message, /fails its seal/);
  assert.match(r.message, /says where, not what/);
  for (const l of r.loci) assert.equal(l.expected, null, 'no locus leaks the expected digits');
});

// The honest limit of sealed mode, asserted so it cannot be quietly forgotten.
test('sealed mode CAN be fooled — the message admits it and the test proves it', () => {
  const code = '1234500000';
  const r = verifyRecall(entryOf(code, 'sealed'), '1432500000');
  assert.equal(r.ok, true, 'a compensating error passes the seal');
  assert.equal(r.certain, false);
  assert.match(r.message, /not proof/);
});

test('hex entries verify against hex seals', () => {
  const e = entryOf('DEADBEEFCAFEF00D', 'sealed', 16);
  assert.equal(verifyRecall(e, 'DEADBEEFCAFEF00D').ok, true);
  assert.equal(verifyRecall(e, 'de ad be ef ca fe f0 0d').ok, true, 'case and spaces tolerated');

  const bad = verifyRecall(e, 'DEADBEE1CAFEF00D');   // F → 1: sum shifts by 14
  assert.equal(bad.ok, false);
  assert.equal(bad.firstBad, 0);
  assert.match(bad.message, /fails its seal/);
});

// A specific, permanent blind spot of the registered hex seal, worth recording
// so nobody later "fixes" a test that is actually describing the scheme.
test('a hex seal cannot see a symbol changed by exactly 15 (F ↔ 0)', () => {
  const e = entryOf('DEADBEEFCAFEF00D', 'sealed', 16);
  // F → 0 shifts the nibble-sum by 15, which is 0 mod 15.
  assert.equal(verifyRecall(e, 'DEADBEE0CAFEF00D').ok, true, 'the seal passes a genuinely wrong code');
  // In full mode the exact comparison catches it regardless.
  const full = entryOf('DEADBEEFCAFEF00D', 'full', 16);
  assert.equal(verifyRecall(full, 'DEADBEE0CAFEF00D').ok, false);
});

test('every locus reports the seal it computed and the one it wanted', () => {
  const r = verifyRecall(entryOf(PI30), PI30);
  for (const l of r.loci) {
    assert.equal(typeof l.seal, 'number');
    assert.equal(typeof l.wantSeal, 'number');
    assert.equal(l.seal, l.wantSeal);
  }
});

test('a short tail locus still verifies', () => {
  const code = '1415926535' + '89793';   // 15 digits: one full locus + a tail
  const e = entryOf(code);
  assert.equal(e.seals.length, 2);
  assert.equal(verifyRecall(e, code).ok, true);
  assert.equal(verifyRecall(e, '1415926535' + '89794').ok, false);
});
