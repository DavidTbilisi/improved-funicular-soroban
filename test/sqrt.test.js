import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairsOf, rootDigit, isqrt, buildSquareRoot } from '../src/domain/sqrt.js';
import { buildProblem, ROD_MODES } from '../src/domain/mulDiv.js';
import { INT_COLS } from '../src/domain/config.js';
import { MathRng } from '../src/drill/rng.js';

test('digits pair from the ONES, so an odd count leaves a single leading digit', () => {
  assert.deepEqual(pairsOf(5476), [54, 76]);
  assert.deepEqual(pairsOf(576), [5, 76]);
  assert.deepEqual(pairsOf(15129), [1, 51, 29]);
  assert.deepEqual(pairsOf(9), [9]);
  assert.deepEqual(pairsOf(100), [1, 0]);
  // Pairing from the left would put 5|47|6 and land the root in the wrong place.
  assert.notDeepEqual(pairsOf(5476), [5, 47, 6]);
});

test('the trial digit is the largest d with (20·root + d)·d ≤ remainder', () => {
  assert.equal(rootDigit(0, 54), 7);      // 7² = 49 ≤ 54 < 64
  assert.equal(rootDigit(7, 576), 4);     // 144 × 4 = 576 exactly
  assert.equal(rootDigit(0, 0), 0);
  assert.equal(rootDigit(0, 99), 9);
  for (let root = 0; root < 40; root++) {
    for (const rem of [0, 1, 55, 576, 9999]) {
      const d = rootDigit(root, rem);
      assert.ok((20 * root + d) * d <= rem, `${root}/${rem} → ${d} fits`);
      if (d < 9) assert.ok((20 * root + d + 1) * (d + 1) > rem, `${root}/${rem} → ${d} is the largest`);
    }
  }
});

test('the integer root and remainder are right for every square and near-square', () => {
  for (let r = 1; r <= 999; r++) {
    assert.deepEqual(isqrt(r * r), { root: r, remainder: 0 }, `${r}²`);
    const { root, remainder } = isqrt(r * r + r);      // between two squares
    assert.equal(root, r);
    assert.equal(remainder, r);
  }
});

test('a walkthrough ends with the root on the root rods and the radicand eaten', () => {
  for (let r = 4; r <= 400; r++) {
    const p = buildSquareRoot(r * r);
    assert.equal(p.answer, r, `√${r * r}`);
    assert.equal(p.remainder, 0);
    const last = p.steps[p.steps.length - 1];
    // The board at the end is exactly the root, sitting on the root rods.
    assert.equal(last.expected, r * Math.pow(10, Math.min(...p.answerRods)), `√${r * r} final board`);
  }
});

test('every step is a legal, non-negative board and moves only its own rods', () => {
  const rng = new MathRng();
  for (let k = 0; k < 200; k++) {
    const r = 12 + rng.int(300);
    const p = buildSquareRoot(r * r);
    let prev = p.setup;
    for (const s of p.steps) {
      assert.ok(s.expected >= 0, `${p.prompt} went negative`);
      assert.ok(Number.isInteger(s.expected), `${p.prompt} left a fraction on the rods`);
      assert.ok(s.instr && s.targets.length, `${p.prompt} step has no instruction`);
      const delta = Math.abs(s.expected - prev);
      // A step moves one contiguous place range — the rods it names.
      const lowest = Math.min(...s.targets);
      assert.equal(delta % Math.pow(10, lowest), 0, `${p.prompt} touched a rod below ${lowest}`);
      prev = s.expected;
    }
  }
});

test('the two kinds alternate: set a root digit, then subtract for it', () => {
  const p = buildSquareRoot(5476);
  assert.deepEqual(p.steps.map(s => s.kind), ['root', 'subtract', 'root', 'subtract']);
  assert.equal(p.answer, 74);
  assert.match(p.steps[0].instr, /largest <b>d<\/b> with <b>d² ≤ 54<\/b> is <b>7<\/b>/);
  assert.match(p.steps[2].instr, /Double the root so far/);
  assert.match(p.steps[2].instr, /\(140 \+ d\) × d ≤ 576/);
  assert.match(p.steps[3].instr, /\(140 \+ 4\) × 4 = 576/);
});

test('a zero root digit sets nothing and subtracts nothing', () => {
  // √10000 = 100: the two trailing pairs each give a zero digit, which on a
  // board is not a move at all — the rod is already clear.
  const p = buildSquareRoot(10000);
  assert.equal(p.answer, 100);
  assert.deepEqual(p.steps.map(s => s.kind), ['root', 'subtract']);
  assert.equal(p.steps[1].expected, 100 * Math.pow(10, Math.min(...p.answerRods)));
});

test('the layout keeps a clear rod between the radicand and the root', () => {
  const p = buildSquareRoot(5476);
  const radTop = Math.max(...p.layout.radicand);
  const rootLow = Math.min(...p.layout.root);
  assert.equal(rootLow, radTop + 2, 'one empty rod between them');
  assert.equal(p.topRod, Math.max(...p.layout.root));
  assert.match(p.setupInstr, /54\|76/);
  assert.equal(p.answerRodSpan, 'G–F');
});

test('it is reached through buildProblem, like the other two methods', () => {
  const viaOp = buildProblem('√', 576, 0);
  assert.equal(viaOp.op, '√');
  assert.equal(viaOp.answer, 24);
  assert.equal(viaOp.prompt, '√576');
  assert.equal(viaOp.b, null, 'a root has one operand');
});

test('the root modes generate perfect squares that fit the board', () => {
  const rng = new MathRng();
  const modes = ROD_MODES.filter(m => m.op === '√');
  assert.equal(modes.length, 2);
  for (const m of modes) {
    for (let k = 0; k < 200; k++) {
      const { a } = m.gen(rng);
      const root = Math.round(Math.sqrt(a));
      assert.equal(root * root, a, `${m.id} deals a perfect square`);
      const p = buildProblem(m.op, a, 0);
      assert.ok(p.topRod < INT_COLS, `${m.id} fits the board (${p.prompt}, topRod ${p.topRod})`);
      assert.ok(p.steps.length >= 2 && p.steps.length <= 8, `${m.id} is a sane number of steps`);
      assert.equal(p.answer, root);
    }
  }
});

test('the ladder still runs multiply, then divide, then root', () => {
  assert.deepEqual(ROD_MODES.map(m => m.op), ['×', '×', '×', '×', '÷', '÷', '√', '√']);
});
