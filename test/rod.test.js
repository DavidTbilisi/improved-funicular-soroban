import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rodValue, digitToRod, intRodsFromVal, fracRodsFromStr, intValOf, fracStrOf } from '../src/domain/rod.js';
import { INT_COLS, FRAC_COLS } from '../src/domain/config.js';

test('digitToRod splits into sky (5) + earth (0-4)', () => {
  assert.deepEqual(digitToRod(0), { sky: false, earth: 0 });
  assert.deepEqual(digitToRod(4), { sky: false, earth: 4 });
  assert.deepEqual(digitToRod(5), { sky: true, earth: 0 });
  assert.deepEqual(digitToRod(8), { sky: true, earth: 3 });
  assert.deepEqual(digitToRod(9), { sky: true, earth: 4 });
});

test('rodValue is the round-trip inverse of digitToRod', () => {
  for (let d = 0; d <= 9; d++) assert.equal(rodValue(digitToRod(d)), d);
});

test('intRodsFromVal / intValOf round-trip', () => {
  for (const v of [0, 7, 15, 90909, 4217583906]) {
    const rods = intRodsFromVal(v);
    assert.equal(rods.length, INT_COLS);
    assert.equal(intValOf(rods), BigInt(v));  // intValOf is BigInt
  }
});

test('fracRodsFromStr fills FRAC_COLS and trims trailing zeros on read', () => {
  const rods = fracRodsFromStr('98');
  assert.equal(rods.length, FRAC_COLS);
  assert.equal(fracStrOf(rods), '98');
  assert.equal(fracStrOf(fracRodsFromStr('9800')), '98'); // trailing zeros trimmed
  assert.equal(fracStrOf(fracRodsFromStr('')), '');
});

test('intValOf uses place weights (low index = ones)', () => {
  const rods = intRodsFromVal(1000);
  assert.equal(intValOf(rods), 1000n);
  assert.equal(rodValue(rods[3]), 1); // thousands place
});
