import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YOMIAGE_LEVELS, GAPS, gapStep, levelById, genRound } from '../src/yomiage/levels.js';
import { MathRng } from '../src/drill/rng.js';

const rng = new MathRng();

test('the ladder is frozen and every rung declares its column', () => {
  assert.ok(Object.isFrozen(YOMIAGE_LEVELS));
  for (const l of YOMIAGE_LEVELS) {
    assert.ok(Object.isFrozen(l), l.id);
    assert.ok(l.terms >= 3 && l.digits >= 1, l.id);
    assert.ok(GAPS.includes(l.baseGap), `${l.id} opens at a pace that is on the dial`);
    assert.ok(l.floor >= 1 && l.teach, l.id);
  }
  assert.equal(levelById('warm').terms, 3);
  assert.equal(levelById('nope'), null);
});

test('the column widens up the ladder and minus arrives, then stays', () => {
  const firstMinus = YOMIAGE_LEVELS.findIndex(l => l.minus);
  assert.ok(firstMinus > 0, 'the first rung is addition only');
  for (const l of YOMIAGE_LEVELS.slice(firstMinus)) assert.ok(l.minus, `${l.id} lost its minus terms`);
  // Width is the outer axis and term count the inner one — the anzan ladder's
  // shape: a wider number resets the column length rather than adding to it,
  // because width and length are independent difficulties.
  let prev = [0, 0];
  for (const l of YOMIAGE_LEVELS) {
    const here = [l.digits, l.terms];
    assert.ok(here[0] > prev[0] || (here[0] === prev[0] && here[1] > prev[1]),
      `${l.id} does not advance on either axis`);
    prev = here;
  }
});

test('the pace dial steps and clamps at both ends', () => {
  assert.equal(gapStep(2000, 0), 2000);
  assert.equal(gapStep(2000, +1), 1600, 'faster is a shorter gap');
  assert.equal(gapStep(2000, -1), 2500);
  assert.equal(gapStep(GAPS[0], -1), GAPS[0]);
  assert.equal(gapStep(GAPS[GAPS.length - 1], +1), GAPS[GAPS.length - 1]);
  assert.equal(gapStep(1234, 0), 1300, 'an off-dial value snaps to the nearest rung');
});

test('a round is the exam paper\'s column — same rules, one generator', () => {
  for (const level of YOMIAGE_LEVELS) {
    for (let i = 0; i < 40; i++) {
      const r = genRound(level, rng);
      assert.equal(r.terms.length, level.terms, level.id);
      let run = 0;
      for (const t of r.terms) {
        assert.equal(String(Math.abs(t)).length, level.digits, `${level.id}: ${t}`);
        run += t;
        assert.ok(run >= 0, `${level.id}: the running total went negative — unanswerable on a board`);
        if (!level.minus) assert.ok(t > 0, `${level.id} called a minus term`);
      }
      assert.equal(run, r.answer);
      assert.ok(r.terms[0] > 0, 'the first term is never a subtraction');
    }
  }
});
