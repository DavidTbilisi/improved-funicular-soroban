import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMultiplication, buildDivision, buildProblem, ROD_MODES } from '../src/domain/mulDiv.js';
import { INT_COLS } from '../src/domain/config.js';
import { MathRng } from '../src/drill/rng.js';

const digitAt = (board, p) => Math.floor(board / Math.pow(10, p)) % 10;
const finalBoard = P => (P.steps.length ? P.steps[P.steps.length - 1].expected : P.setup);
// Read a multi-digit number off a set of rod places (highest place = leftmost).
const readRods = (board, rods) =>
  [...rods].sort((x, y) => y - x).reduce((n, p) => n * 10 + digitAt(board, p), 0);

function checkCommon(P) {
  assert.ok(Number.isInteger(P.setup) && P.setup >= 0, 'setup non-negative int');
  assert.ok(P.topRod < INT_COLS, `layout fits ${INT_COLS} rods (topRod ${P.topRod})`);
  let prev = P.setup;
  for (const s of P.steps) {
    assert.ok(Number.isInteger(s.expected) && s.expected >= 0, `step expected ok (${P.prompt})`);
    assert.notEqual(s.expected, prev, `step ${P.prompt} changes the board`);
    assert.ok(s.targets.every(p => p >= 0 && p < INT_COLS), 'targets in range');
    assert.ok(typeof s.instr === 'string' && s.instr.length > 0);
    prev = s.expected;
  }
  // the answer read off the answer rods equals the true answer
  assert.equal(readRods(finalBoard(P), P.answerRods), P.answer, `${P.prompt} reads ${P.answer}`);
}

test('multiplication reaches the product with the multiplier still on the board', () => {
  for (let a = 2; a <= 99; a++) {
    for (const b of [2, 3, 4, 5, 6, 7, 8, 9, 12, 37, 84]) {
      const P = buildMultiplication(a, b);
      assert.equal(P.answer, a * b);
      // setup encodes both operands at their rods
      const mgOnes = Math.min(...P.layout.multiplier);
      const mcOnes = Math.min(...P.layout.multiplicand);
      assert.equal(P.setup, a * Math.pow(10, mcOnes) + b * Math.pow(10, mgOnes), `setup ${a}×${b}`);
      // final board = product (at rods 0..) + the untouched multiplier
      const expectedFinal = a * b + b * Math.pow(10, mgOnes);
      assert.equal(finalBoard(P), expectedFinal, `final ${a}×${b}`);
      checkCommon(P);
    }
  }
});

test('multiplication handles interior zero digits (e.g. 306 × 3)', () => {
  const P = buildMultiplication(306, 3);
  assert.equal(P.answer, 918);
  // no step tries to place a zero partial product
  assert.ok(P.steps.every(s => !/= 0\b/.test(s.instr)));
  checkCommon(P);
});

test('division reaches the quotient with the divisor still on the board', () => {
  const cases = [];
  for (const b of [2, 3, 4, 5, 6, 7, 8, 9]) for (const q of [7, 11, 23, 48, 96]) cases.push([b * q, b]);
  for (const b of [12, 27, 53, 79]) for (const q of [12, 34, 73]) cases.push([b * q, b]);
  for (const [a, b] of cases) {
    const P = buildDivision(a, b);
    assert.equal(P.answer, a / b);
    const vgOnes = Math.min(...P.layout.divisor);
    assert.equal(P.setup, a + b * Math.pow(10, vgOnes), `setup ${a}÷${b}`);
    const qOnes = Math.min(...P.layout.quotient);
    // final = quotient (at its rods) + untouched divisor; dividend consumed to 0
    const expectedFinal = (a / b) * Math.pow(10, qOnes) + b * Math.pow(10, vgOnes);
    assert.equal(finalBoard(P), expectedFinal, `final ${a}÷${b}`);
    checkCommon(P);
  }
});

test('division rejects non-exact division', () => {
  assert.throws(() => buildDivision(10, 3));
});

test('a quotient digit only lands on an already-vacated rod (no live collision)', () => {
  // Walk the steps; whenever a quotient digit is set, that rod must read 0 first.
  for (const [a, b] of [[69, 3], [144, 3], [95, 5], [756, 7], [1272, 4], [3869, 53]]) {
    const P = buildDivision(a, b);
    let board = P.setup;
    for (const s of P.steps) {
      if (s.kind === 'quotient') {
        const rod = s.targets[0];
        assert.equal(digitAt(board, rod), 0, `${a}÷${b}: quotient rod ${rod} vacated before use`);
      }
      board = s.expected;
    }
  }
});

test('ROD_MODES generate well-formed, in-range problems', () => {
  const rng = new MathRng();
  for (const m of ROD_MODES) {
    for (let k = 0; k < 200; k++) {
      const { a, b } = m.gen(rng);
      if (m.op === '÷') assert.equal(a % b, 0, `${m.id} exact`);
      const P = buildProblem(m.op, a, b);
      assert.ok(P.topRod < INT_COLS, `${m.id} fits the board (${P.prompt}, topRod ${P.topRod})`);
      checkCommon(P);
    }
  }
});
