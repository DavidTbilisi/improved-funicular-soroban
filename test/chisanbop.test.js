import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  handOf, handValue, handsOf, handGlyph, handGlyphL, numberGlyph,
  actionFor, actionValue, chisanbopAdd, chisanbopSub, chisanbopStory,
} from '../src/domain/chisanbop.js';
import { digitToRod } from '../src/domain/rod.js';

test('a hand is a rod: thumb = sky bead, fingers = earth beads', () => {
  for (let d = 0; d <= 9; d++) {
    const h = handOf(d);
    const rod = digitToRod(d);
    assert.equal(h.thumb, rod.sky, `${d} thumb ↔ sky`);
    assert.equal(h.fingers, rod.earth, `${d} fingers ↔ earth`);
    assert.equal(handValue(h), d, `${d} reads back`);
  }
});

test('handOf rejects digits off one hand', () => {
  assert.throws(() => handOf(-1));
  assert.throws(() => handOf(10));
});

test('handsOf splits a number into tens and ones hands', () => {
  const h = handsOf(27);
  assert.equal(handValue(h.tens), 2);
  assert.equal(handValue(h.ones), 7);
  assert.equal(h.value, 27);
  assert.equal(handValue(handsOf(0).tens) + handValue(handsOf(0).ones), 0);
  assert.equal(handValue(handsOf(99).tens), 9);
});

test('handsOf rejects out-of-range and non-integers', () => {
  assert.throws(() => handsOf(-1));
  assert.throws(() => handsOf(100));
  assert.throws(() => handsOf(4.5));
});

test('glyphs place the thumb as the 5-bead and mirror the two hands', () => {
  assert.equal(handGlyph(handOf(0)), '◇○○○○');   // nothing pressed
  assert.equal(handGlyph(handOf(3)), '◇●●●○');   // three fingers, no thumb
  assert.equal(handGlyph(handOf(5)), '◆○○○○');   // thumb only
  assert.equal(handGlyph(handOf(7)), '◆●●○○');   // thumb + two fingers
  assert.equal(handGlyph(handOf(9)), '◆●●●●');   // full hand
  // left (tens) hand is the mirror image
  assert.equal(handGlyphL(handOf(7)), '○○●●◆');
  assert.equal(numberGlyph(27), '○○●●◇ ◆●●○○'); // tens = 2 (no thumb), ones = 7 (thumb)
});

test('actionFor / actionValue are inverses over every board step', () => {
  const steps = ['+1', '+2', '+3', '+4', '+5', '+10', '-1', '-2', '-3', '-4', '-5', '-10'];
  for (const step of steps) {
    assert.equal(actionValue(actionFor(step)), Number(step), step); // Number('+5')=5, Number('-10')=-10
  }
  // thumb, fingers, carry land on the right parts/hands
  assert.deepEqual(
    { part: actionFor('+5').part, hand: actionFor('+5').hand, dir: actionFor('+5').dir },
    { part: 'thumb', hand: 'ones', dir: 'press' });
  assert.deepEqual(
    { part: actionFor('-3').part, count: actionFor('-3').count, dir: actionFor('-3').dir },
    { part: 'fingers', count: 3, dir: 'lift' });
  assert.deepEqual(
    { part: actionFor('+10').part, hand: actionFor('+10').hand },
    { part: 'carry', hand: 'tens' });
});

test('chisanbop moves net to the operand across the whole ± table', () => {
  for (let c = 0; c <= 9; c++) {
    for (let d = 1; d <= 9; d++) {
      const add = chisanbopAdd(c, d);
      assert.equal(add.actions.reduce((s, a) => s + actionValue(a), 0), d, `${c}+${d}`);
      assert.equal(add.ones + 10 * add.carry, c + d, `${c}+${d} lands right`);
      assert.equal(handValue(add.endHand), add.ones, `${c}+${d} end hand`);

      const sub = chisanbopSub(c, d);
      assert.equal(sub.actions.reduce((s, a) => s + actionValue(a), 0), -d, `${c}-${d}`);
      assert.equal(sub.ones - 10 * sub.borrow, c - d, `${c}-${d} lands right`);
      assert.equal(handValue(sub.endHand), sub.ones, `${c}-${d} end hand`);
    }
  }
});

test('direct add just presses fingers (enough free earth beads)', () => {
  const m = chisanbopAdd(1, 2);        // 1 has 3 free earth beads, so +2 is direct
  assert.equal(m.rule, 'direct');
  assert.equal(m.carry, 0);
  assert.deepEqual(m.actions.map(a => a.step), ['+2']);
  assert.equal(m.actions[0].text, 'press 2 fingers');
  assert.equal(m.ones, 3);
});

test('small friend: 4+3 presses the thumb and lifts two fingers', () => {
  const m = chisanbopAdd(4, 3);        // +5 −2
  assert.equal(m.rule, 'small');
  assert.deepEqual(m.actions.map(a => a.step), ['+5', '-2']);
  assert.equal(m.actions[0].text, 'press the thumb');
  assert.equal(m.actions[1].text, 'lift 2 fingers');
  assert.equal(m.ones, 7);
});

test('big friend: 6+7 carries to the tens hand then pays back', () => {
  const m = chisanbopAdd(6, 7);        // +10 −5 +2 (the planAdd example)
  assert.equal(m.rule, 'big');
  assert.equal(m.carry, 1);
  assert.deepEqual(m.actions.map(a => a.step), ['+10', '-5', '+2']);
  assert.equal(m.actions[0].text, 'carry: press 1 on the tens hand');
  assert.equal(m.actions[0].hand, 'tens');
  assert.equal(m.ones, 3);
});

test('subtract borrows from the tens hand when it must', () => {
  const m = chisanbopSub(3, 7);        // −10 +... borrow
  assert.equal(m.rule, 'big');
  assert.equal(m.borrow, 1);
  assert.equal(m.actions[0].step, '-10');
  assert.equal(m.actions[0].text, 'borrow: lift 1 on the tens hand');
  assert.equal(m.ones, 6);
});

test('chisanbopStory narrates start hand, actions, and landing hand', () => {
  assert.equal(chisanbopStory(4, '+', 3),
    '◇●●●● +3 → press the thumb, lift 2 fingers → ◆●●○○');
});
