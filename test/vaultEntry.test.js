import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODES, MAX_DIGITS, normalizeCode, validateCode, sealOf, lociFor, makeEntry, canReveal,
} from '../src/vault/entry.js';
import { sealDigit, sealHex, DECIMAL_CODEC } from '../src/domain/codec/codec.js';

const PI60 = '141592653589793238462643383279502884197169399375105820974944';

test('normalize strips the separators people actually type', () => {
  assert.equal(normalizeCode('4111 1111-1111.1111'), '4111111111111111');
  assert.equal(normalizeCode('1,234,567'), '1234567');
  assert.equal(normalizeCode('  90210  '), '90210');
  assert.equal(normalizeCode('de–ad_beef', 16), 'DEADBEEF');
  assert.equal(normalizeCode(null), '');
});

test('a stray letter is an error, not silently dropped', () => {
  // Dropping it would store a DIFFERENT number than the one given.
  const r = validateCode('123x456');
  assert.equal(r.ok, false);
  assert.match(r.error, /0–9 only/);
});

test('validation covers empty, radix and length', () => {
  assert.equal(validateCode('').ok, false);
  assert.equal(validateCode('   ').ok, false);
  assert.equal(validateCode('0123456789').ok, true, 'leading zeros are legal');
  assert.equal(validateCode('FF', 16).ok, true);
  assert.equal(validateCode('FG', 16).ok, false);
  assert.equal(validateCode('12', 16).ok, true);
  assert.equal(validateCode('9'.repeat(MAX_DIGITS)).ok, true);
  assert.equal(validateCode('9'.repeat(MAX_DIGITS + 1)).ok, false);
});

// The reason entry.js encodes the STRING rather than a board value.
test('leading zeros survive — the board route would have eaten them', () => {
  const v = validateCode('000123');
  assert.equal(v.code, '000123');
  const e = makeEntry({ id: 'v1', label: 'x', code: v.code });
  assert.equal(e.length, 6);
  // What prepare() would have produced from the same number, for contrast:
  assert.equal(DECIMAL_CODEC.prepare(123n, '').code, '123');
});

test('a code far longer than the board can hold still encodes', () => {
  const loci = lociFor(PI60);
  assert.equal(PI60.length, 60);
  assert.equal(loci.length, 6, 'ten digits per locus');
  for (const l of loci) assert.equal(l.digits.length, 10);
});

test('sealOf routes by radix and matches the codec', () => {
  assert.equal(sealOf('12345', 10), sealDigit('12345'));
  assert.equal(sealOf('DEAD', 16), sealHex('DEAD'));
  assert.equal(sealOf('12345'), sealDigit('12345'), 'decimal is the default');
});

test('an entry keeps its seals in BOTH modes', () => {
  const full = makeEntry({ id: 'v1', label: 'π', code: PI60, mode: 'full' });
  const sealed = makeEntry({ id: 'v2', label: 'π', code: PI60, mode: 'sealed' });
  assert.deepEqual(full.seals, sealed.seals);
  assert.equal(full.seals.length, 6);
});

// The whole point of the sealed mode.
test('a sealed entry does NOT keep the digits', () => {
  const e = makeEntry({ id: 'v1', label: 'front door', code: '481516', mode: 'sealed' });
  assert.equal(e.code, undefined);
  assert.equal(canReveal(e), false);
  // And the digits are nowhere else in the blob either.
  assert.ok(!JSON.stringify(e).includes('481516'), 'the code must not survive anywhere in the entry');
  assert.equal(e.length, 6, 'only the length and the seals remain');
});

test('a full entry keeps the digits and can reveal them', () => {
  const e = makeEntry({ id: 'v1', label: 'π', code: '1415926535', mode: 'full' });
  assert.equal(e.code, '1415926535');
  assert.equal(canReveal(e), true);
});

test('an unknown mode falls back to full rather than silently sealing', () => {
  const e = makeEntry({ id: 'v1', label: 'x', code: '12345', mode: 'nonsense' });
  assert.equal(e.mode, 'full');
  assert.ok(MODES.includes(e.mode));
});

test('a blank label gets a placeholder and a long one is trimmed', () => {
  assert.equal(makeEntry({ id: 'v1', label: '', code: '1' }).label, 'Untitled');
  assert.equal(makeEntry({ id: 'v1', label: 'x'.repeat(200), code: '1' }).label.length, 60);
});

test('a new entry starts unscheduled, for schedule.js to place', () => {
  const e = makeEntry({ id: 'v1', label: 'x', code: '12345', now: '2026-07-22T10:00' });
  assert.equal(e.interval, 0);
  assert.equal(e.due, null);
  assert.deepEqual(e.reviews, []);
  assert.equal(e.created, '2026-07-22T10:00');
});

test('hex entries seal in hex', () => {
  const e = makeEntry({ id: 'v1', label: 'key', code: 'DEADBEEF', radix: 16 });
  assert.equal(e.radix, 16);
  assert.equal(e.seals[0], sealHex('DEADBEEF'));
});
