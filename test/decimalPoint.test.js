import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decimalsOf, digitsOf, answerDecimals, placePoint, trimZeros, acceptedForms, pointRule, placement,
} from '../src/domain/decimalPoint.js';

test('decimals are counted as written, trailing zeros included', () => {
  assert.equal(decimalsOf('84'), 0);
  assert.equal(decimalsOf('12.4'), 1);
  assert.equal(decimalsOf('0.35'), 2);
  assert.equal(decimalsOf('12.40'), 2, 'a written zero is a rod');
  assert.equal(decimalsOf(7), 0);
});

test('the digits are what the board would hand you: no point, no leading zeros', () => {
  assert.equal(digitsOf('12.4'), '124');
  assert.equal(digitsOf('0.35'), '35');
  assert.equal(digitsOf('0.05'), '5');
  assert.equal(digitsOf('0'), '0');
  assert.equal(digitsOf('0.0'), '0');
});

test('multiplication adds the rods; division subtracts them', () => {
  assert.equal(answerDecimals('×', '12.4', '0.35'), 3);
  assert.equal(answerDecimals('×', '84', '7'), 0);
  assert.equal(answerDecimals('÷', '8.4', '0.7'), 0);
  assert.equal(answerDecimals('÷', '0.144', '1.2'), 2);
  // The case that catches people out: the shift goes the other way.
  assert.equal(answerDecimals('÷', '84', '0.7'), -1);
});

test('placing the point pads on the left when the digits run out', () => {
  assert.equal(placePoint('4340', 3), '4.340');
  assert.equal(placePoint('35', 2), '0.35');
  assert.equal(placePoint('5', 2), '0.05');
  assert.equal(placePoint('5', 4), '0.0005');
});

test('a negative placement appends zeros instead of a point', () => {
  assert.equal(placePoint('12', -1), '120');
  assert.equal(placePoint('12', -3), '12000');
  assert.equal(placePoint('12', 0), '12');
  assert.equal(placePoint('0', -2), '0', 'zero stays zero');
});

test('both spellings of an answer are accepted', () => {
  assert.deepEqual(acceptedForms('4.340'), ['4.34', '4.340']);
  assert.deepEqual(acceptedForms('12'), ['12']);
  assert.equal(trimZeros('12.0'), '12');
  assert.equal(trimZeros('4.340'), '4.34');
  assert.equal(trimZeros('120'), '120', 'integer zeros are digits, not padding');
});

test('the placement matches the arithmetic, for every shape the decks deal', () => {
  const cases = [
    ['×', '12.4', '0.35', 124 * 35],
    ['×', '0.6', '0.7', 6 * 7],
    ['×', '25', '4', 100],
    ['÷', '8.4', '0.7', 12],
    ['÷', '84', '0.7', 12],
    ['÷', '0.144', '1.2', 12],
    ['÷', '9.6', '4', 24],
  ];
  for (const [op, a, b, digits] of cases) {
    const p = placement(op, a, b, digits);
    const expected = op === '×' ? Number(a) * Number(b) : Number(a) / Number(b);
    assert.ok(Math.abs(Number(p.placed) - expected) < 1e-9,
      `${a} ${op} ${b} → ${p.placed}, arithmetic says ${expected}`);
  }
});

test('the rule is stated about the question that was actually asked', () => {
  const mul = pointRule('×', '12.4', '0.35');
  assert.match(mul, /12\.4 sits 1 rod/);
  assert.match(mul, /0\.35 sits 2/);
  assert.match(mul, /<b>3<\/b> — 1 \+ 2/);

  const div = pointRule('÷', '8.4', '0.7');
  assert.match(div, /shift both 1 rod to make 0\.7 whole/);
  assert.match(div, /1 − 1 = <b>0<\/b>/);
  assert.match(div, /the digits are the answer/);

  const back = pointRule('÷', '84', '0.7');
  assert.match(back, /<b>-1<\/b>/);
  assert.match(back, /gain a zero/);

  assert.match(pointRule('÷', '9.6', '4'), /already whole/);
});

test('a placement carries everything the drill needs', () => {
  const p = placement('×', '12.4', '0.35', 4340);
  assert.equal(p.digits, '4340');
  assert.equal(p.decimals, 3);
  assert.equal(p.placed, '4.340');
  assert.deepEqual(p.accepted, ['4.34', '4.340']);
  assert.ok(p.rule.includes('product sits'));
});

test('nothing here goes near floating point', () => {
  // 0.1 + 0.2 has no business in a decision about rods: the placement is done
  // on strings, so a value that cannot be represented exactly still places.
  assert.equal(placement('×', '0.1', '0.2', 2).placed, '0.02');
  assert.equal(placement('×', '0.3', '0.3', 9).placed, '0.09');
  assert.equal(placement('÷', '0.3', '0.1', 3).placed, '3');
});
