import { test } from 'node:test';
import assert from 'node:assert/strict';
import { words, callFor, scriptFor, estimateMs, OPENING, CLOSING } from '../src/yomiage/words.js';

test('the small numbers read the way a caller says them', () => {
  assert.equal(words(0), 'zero');
  assert.equal(words(7), 'seven');
  assert.equal(words(13), 'thirteen');
  assert.equal(words(20), 'twenty');
  assert.equal(words(47), 'forty-seven');
  assert.equal(words(90), 'ninety');
});

test('hundreds and thousands group, with no "and"', () => {
  assert.equal(words(100), 'one hundred');
  assert.equal(words(325), 'three hundred twenty-five');
  assert.equal(words(1000), 'one thousand');
  assert.equal(words(3425), 'three thousand four hundred twenty-five');
  assert.equal(words(10007), 'ten thousand seven');
  assert.equal(words(250000), 'two hundred fifty thousand');
  assert.equal(words(999999), 'nine hundred ninety-nine thousand nine hundred ninety-nine');
  assert.ok(!words(325).includes(' and '));
});

test('the whole number is spoken, never its digits', () => {
  // The exercise is hearing a NUMBER and setting rods; "three four two five"
  // would hand the rods over already separated.
  assert.notEqual(words(3425), 'three four two five');
  assert.equal(words(3425).split(' ').length, 5);
});

test('every width the ladder calls has a reading', () => {
  for (let d = 1; d <= 6; d++) {
    const lo = d === 1 ? 1 : 10 ** (d - 1), hi = 10 ** d - 1;
    for (const n of [lo, hi, Math.floor((lo + hi) / 2)]) {
      const w = words(n);
      assert.ok(w && !/undefined|NaN/.test(w), `${n} → ${w}`);
    }
  }
});

test('the sign is the caller\'s, not the number\'s', () => {
  assert.equal(words(-42), 'forty-two', 'a number never says "negative"');
  assert.equal(callFor(42, 0), 'forty-two', 'the first term carries no sign word');
  assert.equal(callFor(42, 3), 'plus forty-two');
  assert.equal(callFor(-42, 3), 'minus forty-two');
});

test('a round script opens, calls each term, and asks for the total', () => {
  const s = scriptFor([12, -3, 40]);
  assert.deepEqual(s.map(x => x.kind), ['open', 'term', 'term', 'term', 'close']);
  assert.equal(s[0].text, OPENING);
  assert.equal(s[4].text, CLOSING);
  assert.deepEqual(s.slice(1, 4).map(x => x.text), ['twelve', 'minus three', 'plus forty']);
  assert.deepEqual(s.slice(1, 4).map(x => x.index), [0, 1, 2]);
  assert.equal(s[0].index, -1);
});

test('an empty round is still openable and closable', () => {
  assert.deepEqual(scriptFor([]).map(x => x.kind), ['open', 'close']);
  assert.deepEqual(scriptFor().map(x => x.kind), ['open', 'close']);
});

test('the duration estimate grows with the call and never collapses', () => {
  assert.ok(estimateMs('seven') >= 500);
  assert.ok(estimateMs('plus three hundred twenty-five') > estimateMs('seven'));
  assert.ok(estimateMs('') >= 500, 'a floor, so nothing is ever cut off');
  // A faster speech rate shortens it proportionally.
  assert.ok(estimateMs('plus forty-two', 2) < estimateMs('plus forty-two', 1));
});
