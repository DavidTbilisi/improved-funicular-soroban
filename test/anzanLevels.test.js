import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANZAN_LEVELS, SPEEDS, LIT_SHARE, levelById, speedStep, genRound, roundMs,
} from '../src/anzan/levels.js';
import { SequenceRng, MathRng } from '../src/drill/rng.js';

test('the ladder is frozen and every rung is fully specified', () => {
  assert.ok(Object.isFrozen(ANZAN_LEVELS));
  const ids = new Set();
  for (const l of ANZAN_LEVELS) {
    assert.ok(Object.isFrozen(l), `${l.id} is frozen`);
    assert.ok(l.id && !ids.has(l.id), `${l.id} is unique`);
    ids.add(l.id);
    assert.ok(l.title && l.teach, `${l.id} has a title and teaching line`);
    assert.ok(l.terms >= 3 && l.digits >= 1 && l.digits <= 3, l.id);
    assert.ok(l.baseMs > 0 && l.floor > 0, l.id);
    assert.ok(SPEEDS.includes(l.baseMs), `${l.id}'s base pace is a real rung of the speed control`);
  }
});

test('the ladder never gets easier as it goes', () => {
  for (let i = 1; i < ANZAN_LEVELS.length; i++) {
    const a = ANZAN_LEVELS[i - 1], b = ANZAN_LEVELS[i];
    assert.ok(b.digits > a.digits || b.terms > a.terms || b.baseMs < a.baseMs,
      `${b.id} must be harder than ${a.id} on some axis`);
  }
});

test('SPEEDS runs slowest to fastest, no duplicates', () => {
  for (let i = 1; i < SPEEDS.length; i++) assert.ok(SPEEDS[i] < SPEEDS[i - 1], `${SPEEDS[i]}`);
  assert.ok(LIT_SHARE > 0 && LIT_SHARE < 1, 'the blank gap must be real');
});

test('levelById finds a rung and refuses an unknown one', () => {
  assert.equal(levelById('ten2').terms, 10);
  assert.equal(levelById('nope'), null);
  assert.equal(levelById(undefined), null);
});

test('speedStep moves one rung and clamps at both ends', () => {
  assert.equal(speedStep(1000, 0), 1000);
  assert.equal(speedStep(1000, 1) < 1000, true, 'faster is a smaller interval');
  assert.equal(speedStep(1000, -1) > 1000, true);
  assert.equal(speedStep(SPEEDS[0], -1), SPEEDS[0], 'clamped at the slow end');
  assert.equal(speedStep(SPEEDS[SPEEDS.length - 1], 1), SPEEDS[SPEEDS.length - 1], 'clamped at the fast end');
});

test('speedStep snaps an off-ladder value to the nearest rung first', () => {
  assert.equal(speedStep(1050, 0), 1000);
  assert.equal(speedStep(999999, 0), SPEEDS[0]);
  assert.equal(speedStep(1, 0), SPEEDS[SPEEDS.length - 1]);
});

test('every term has exactly the level width — a 2-digit round never slips in a 7', () => {
  const rng = new MathRng();
  for (const l of ANZAN_LEVELS) {
    for (let k = 0; k < 40; k++) {
      const { terms, sum } = genRound(l, rng);
      assert.equal(terms.length, l.terms, l.id);
      for (const t of terms) {
        assert.equal(String(t).length, l.digits, `${l.id}: ${t} is not ${l.digits} digits`);
      }
      assert.equal(sum, terms.reduce((a, b) => a + b, 0), l.id);
    }
  }
});

test('genRound is deterministic under an injected rng', () => {
  const level = levelById('warm'); // 3 × 1 digit, lo = 1, span = 9
  const a = genRound(level, new SequenceRng([0, 4, 8]));
  const b = genRound(level, new SequenceRng([0, 4, 8]));
  assert.deepEqual(a.terms, [1, 5, 9]);
  assert.equal(a.sum, 15);
  assert.deepEqual(a, b);
});

test('single-digit terms are never zero — a 0 would be a free term', () => {
  const level = levelById('warm');
  const { terms } = genRound(level, new SequenceRng([0, 0, 0]));
  assert.deepEqual(terms, [1, 1, 1]);
});

test('roundMs quotes the screen time the speed control promises', () => {
  assert.equal(roundMs(levelById('ten3'), 900), 9000);
  assert.equal(roundMs(levelById('warm'), 1500), 4500);
});
