import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fingerPlan, handGlyph, handGlyphR, fingerStory,
  nineFoldPlan, nineGlyph, nineFoldStory,
} from '../src/domain/fingers.js';

test('fingerPlan is exact over the whole 6–10 square', () => {
  for (let a = 6; a <= 10; a++) {
    for (let b = 6; b <= 10; b++) {
      const p = fingerPlan(a, b);
      assert.equal(p.product, a * b, `${a}×${b}`);
      assert.equal(p.tens + p.units, p.product, `${a}×${b} tens+units`);
      assert.equal(p.upA + p.downA, 5, `${a} raised+folded fill the hand`);
      assert.equal(p.upB + p.downB, 5, `${b} raised+folded fill the hand`);
    }
  }
});

test('fingerPlan decomposes 7×8 the way the hands do', () => {
  const p = fingerPlan(7, 8);
  assert.deepEqual(
    { upA: p.upA, upB: p.upB, downA: p.downA, downB: p.downB, tens: p.tens, units: p.units },
    { upA: 2, upB: 3, downA: 3, downB: 2, tens: 50, units: 6 });
});

test('fingerPlan rejects operands off the hands', () => {
  assert.throws(() => fingerPlan(5, 8));
  assert.throws(() => fingerPlan(7, 11));
});

test('hand glyphs mirror like real hands: left pinky-first, right thumb-first', () => {
  assert.equal(handGlyph(2), '●●○○○');
  assert.equal(handGlyph(0), '○○○○○');
  assert.equal(handGlyph(5), '●●●●●');
  assert.equal(handGlyphR(2), '○○○●●');
  assert.equal(handGlyphR(5), '●●●●●');
});

test('fingerStory narrates hands, tens, units, and the sum', () => {
  assert.equal(fingerStory(7, 8),
    '●●○○○ ✕ ○○●●● — raised 2+3 → 50 · folded 3×2 = 6 · 50+6 = 56');
});

test('nineFoldPlan is exact over the 9s row', () => {
  for (let n = 2; n <= 9; n++) {
    const p = nineFoldPlan(n);
    assert.equal(p.product, 9 * n, `9×${n}`);
    assert.equal(p.left * 10 + p.right, p.product, `9×${n} tens+units`);
    assert.equal(p.left + p.right, 9, `9×${n} nine fingers stay up`);
  }
});

test('nineFoldPlan rejects folds off the row', () => {
  assert.throws(() => nineFoldPlan(1));
  assert.throws(() => nineFoldPlan(10));
});

test('nineGlyph folds exactly one finger in place', () => {
  assert.equal(nineGlyph(3), '●●○●●●●●●●');
  assert.equal(nineGlyph(9), '●●●●●●●●○●');
});

test('nineFoldStory narrates the fold, both sides, and the product', () => {
  assert.equal(nineFoldStory(3),
    '●●○●●●●●●● — fold finger 3: 2 left → 20 · 7 right → 7 · 9×3 = 27');
});
