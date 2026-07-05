import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUTORIAL_LEVELS } from '../src/tutorial/levels.js';
import { classifyAdd, classifySub } from '../src/domain/soroban.js';
import { planAdd, planSub } from '../src/domain/movePlan.js';
import { MathRng } from '../src/drill/rng.js';
import { FRAC_COLS } from '../src/domain/config.js';

const SCALE = Math.pow(10, FRAC_COLS);
const rng = new MathRng();

test('every level has the required Strategy shape', () => {
  const ids = new Set();
  for (const lv of TUTORIAL_LEVELS) {
    assert.ok(lv.id && lv.title && lv.teach, `${lv.id} has id/title/teach`);
    assert.equal(typeof lv.gen, 'function');
    assert.equal(typeof lv.hint, 'function');
    assert.ok(lv.floor >= 1);
    assert.ok(lv.timeFloorMs > 0, `${lv.id} has a positive time floor`);
    assert.ok(!ids.has(lv.id), `id ${lv.id} is unique`);
    ids.add(lv.id);
  }
});

test('generated problems are well-formed and reachable', () => {
  for (const lv of TUTORIAL_LEVELS) {
    for (let k = 0; k < 300; k++) {
      const p = lv.gen(rng);
      assert.ok(Number.isInteger(p.startScaled) && p.startScaled >= 0, `${lv.id} startScaled`);
      assert.ok(Number.isInteger(p.targetScaled) && p.targetScaled >= 0, `${lv.id} targetScaled`);
      assert.notEqual(p.startScaled, p.targetScaled, `${lv.id} start != target (non-trivial)`);
      assert.ok(typeof p.prompt === 'string' && p.prompt.length > 0);
      assert.ok(typeof lv.hint(p) === 'string');
      // scaled values decode back to the operands
      if (lv.id === 'read') {
        assert.equal(p.startScaled, 0);
        assert.equal(p.targetScaled, p.b * SCALE);
      } else if (p.op === '+' || p.op === '-') {
        const expected = p.op === '+' ? p.a + p.b : p.a - p.b;
        assert.equal(p.startScaled, p.a * SCALE, `${lv.id} start encodes a`);
        assert.equal(p.targetScaled, expected * SCALE, `${lv.id} target encodes a${p.op}b`);
      } else if (p.op === '×') {
        // reached by repeated addition from the multiplicand up to the product
        assert.equal(p.startScaled, p.a * SCALE, `${lv.id} start encodes a`);
        assert.equal(p.targetScaled, p.a * p.b * SCALE, `${lv.id} target encodes a×b`);
      } else if (p.op === '^') {
        assert.equal(p.startScaled, p.a * SCALE, `${lv.id} start encodes the base`);
        assert.equal(p.targetScaled, Math.pow(p.a, p.b) * SCALE, `${lv.id} target encodes a^b`);
      } else if (p.op === '÷') {
        // reached by repeated subtraction from the dividend down to 0
        assert.equal(p.startScaled, p.a * SCALE, `${lv.id} start encodes the dividend`);
        assert.equal(p.targetScaled, 0, `${lv.id} target is 0`);
        assert.equal(p.a % p.b, 0, `${lv.id} divides exactly`);
        assert.equal(p.q, p.a / p.b, `${lv.id} carries the quotient`);
      } else {
        assert.fail(`${lv.id} produced an unknown op ${p.op}`);
      }
    }
  }
});

test('each rule-specific level forces its intended technique on the ones column', () => {
  const ruleOf = (lv, p) => {
    const c = p.a % 10;
    return (p.op === '+' ? classifyAdd(c, p.b) : classifySub(c, p.b)).rule;
  };
  const expect = { direct: 'direct', 'small-add': 'small', 'small-sub': 'small', 'big-add': 'big', 'big-sub': 'big' };
  for (const lv of TUTORIAL_LEVELS) {
    const want = expect[lv.id];
    if (!want) continue;
    for (let k = 0; k < 300; k++) {
      const p = lv.gen(rng);
      assert.equal(ruleOf(lv, p), want, `${lv.id} should produce a "${want}" move (got ${p.a}${p.op}${p.b})`);
    }
  }
});

test('compound level always nests: the big trade’s payback needs its own trade', () => {
  const lv = TUTORIAL_LEVELS.find(l => l.id === 'compound');
  for (let k = 0; k < 300; k++) {
    const p = lv.gen(rng);
    const c = p.a % 10;
    const plan = p.op === '+' ? planAdd(c, p.b) : planSub(c, p.b);
    assert.equal(plan.rule, 'big', `${p.a}${p.op}${p.b} crosses ten`);
    assert.equal(plan.story.length, 2, `${p.a}${p.op}${p.b} nests a second trade`);
    if (p.op === '-') assert.ok(p.a - p.b >= 0, 'result non-negative');
    // the hint narrates the whole chain, ending in single keys
    assert.match(lv.hint(p), /Chain: <b>/);
  }
});

test('nested hints narrate every trade down to keys', () => {
  const big = TUTORIAL_LEVELS.find(l => l.id === 'big-add');
  const h = big.hint({ a: 6, b: 7, op: '+' });
  assert.match(h, /\+7 = \+10 −3/);
  assert.match(h, /−3 = −5 \+2/);
  assert.match(h, /<b>\+10 −5 \+2<\/b> \(I then R then K\)/);
});

test('multi-digit level uses two-digit operands and a non-negative result', () => {
  const lv = TUTORIAL_LEVELS.find(l => l.id === 'multi');
  for (let k = 0; k < 300; k++) {
    const p = lv.gen(rng);
    assert.ok(p.a >= 10 && p.b >= 10, 'both operands two-digit');
    const r = p.op === '+' ? p.a + p.b : p.a - p.b;
    assert.ok(r >= 0, 'result non-negative');
    // forces a carry (add) or borrow (sub) at the ones column
    if (p.op === '+') assert.ok((p.a % 10) + (p.b % 10) >= 10, 'add forces a carry');
    else assert.ok((p.a % 10) < (p.b % 10), 'sub forces a borrow');
  }
});
