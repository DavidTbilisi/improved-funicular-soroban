import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecimal, displayString, decodeChips } from '../src/domain/number.js';
import { intRodsFromVal, fracRodsFromStr } from '../src/domain/rod.js';
import { ALPHABET_PEGS } from '../src/domain/pegs.js';
import { INT_COLS, FRAC_COLS, MAXINT } from '../src/domain/config.js';

test('parseDecimal splits and sanitizes', () => {
  assert.deepEqual(parseDecimal('15.98'), { intVal: 15, fracStr: '98' });
  assert.deepEqual(parseDecimal('  42 '), { intVal: 42, fracStr: '' });
  assert.deepEqual(parseDecimal('abc'), { intVal: 0, fracStr: '' });
  assert.deepEqual(parseDecimal('3.14159'), { intVal: 3, fracStr: '1415' }); // frac clamped to FRAC_COLS
});

test('parseDecimal clamps the integer to MAXINT', () => {
  assert.equal(parseDecimal('999999999999999').intVal, MAXINT);
  assert.equal(MAXINT, Math.pow(10, INT_COLS) - 1);
  assert.equal(FRAC_COLS, 4);
});

test('displayString groups thousands and appends fraction', () => {
  assert.equal(displayString(intRodsFromVal(1000), fracRodsFromStr('25')), '1,000.25');
  assert.equal(displayString(intRodsFromVal(7), fracRodsFromStr('')), '7');
  assert.equal(displayString(intRodsFromVal(0), fracRodsFromStr('5')), '0.5');
});

test('decodeChips is empty only for exact zero', () => {
  assert.equal(decodeChips(intRodsFromVal(0), fracRodsFromStr(''), ALPHABET_PEGS).length, 0);
  assert.ok(decodeChips(intRodsFromVal(0), fracRodsFromStr('5'), ALPHABET_PEGS).length > 0);
});

test('decodeChips orders integer high→ones, a point, then fraction', () => {
  const chips = decodeChips(intRodsFromVal(15), fracRodsFromStr('98'), ALPHABET_PEGS);
  const sides = chips.map(c => c.side);
  assert.deepEqual(sides, ['int', 'int', 'point', 'frac', 'frac']);
  assert.equal(chips[0].digit, 1); // tens (Banana)
  assert.equal(chips[0].peg, ALPHABET_PEGS.B);
  assert.equal(chips[1].digit, 5); // ones (Apple)
  const frac = chips.filter(c => c.side === 'frac');
  assert.ok(frac.every(c => c.flipped === true));
});
