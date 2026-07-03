import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAdd, classifySub, earthMoveLegal, heavenMoveLegal } from '../src/domain/soroban.js';

// Sum the signed terms of a move string ("+5 -2", "+10 -4", "-5 +2") to its net.
function netOf(move) {
  return move.split(/\s+/).reduce((a, t) => a + Number(t), 0);
}

test('addition: direct / small friend / big friend (cheat-sheet cases)', () => {
  assert.deepEqual(classifyAdd(3, 1), { rule: 'direct', move: '+1', carry: 0 });
  assert.deepEqual(classifyAdd(6, 2), { rule: 'direct', move: '+2', carry: 0 });
  assert.deepEqual(classifyAdd(4, 3), { rule: 'small', move: '+5 -2', carry: 0 });  // 4+3=7
  assert.deepEqual(classifyAdd(2, 3), { rule: 'small', move: '+5 -2', carry: 0 });  // 2 lower beads, only 2 free
  assert.deepEqual(classifyAdd(5, 6), { rule: 'big', move: '+10 -4', carry: 1 });   // 5+6=11
  assert.deepEqual(classifyAdd(4, 5), { rule: 'direct', move: '+5', carry: 0 });    // just set the 5-bead
  assert.deepEqual(classifyAdd(0, 9), { rule: 'direct', move: '+5 +4', carry: 0 }); // 9 = 5 + 4
  assert.deepEqual(classifyAdd(1, 9), { rule: 'big', move: '+10 -1', carry: 1 });
});

test('subtraction: direct / small friend / big friend (cheat-sheet cases)', () => {
  assert.deepEqual(classifySub(8, 3), { rule: 'direct', move: '-3', borrow: 0 });
  assert.deepEqual(classifySub(6, 1), { rule: 'direct', move: '-1', borrow: 0 });
  assert.deepEqual(classifySub(7, 3), { rule: 'small', move: '-5 +2', borrow: 0 }); // 7-3=4
  assert.deepEqual(classifySub(2, 7), { rule: 'big', move: '-10 +3', borrow: 1 });  // 12-7 in ones col
  assert.deepEqual(classifySub(9, 9), { rule: 'direct', move: '-5 -4', borrow: 0 });
  assert.deepEqual(classifySub(5, 5), { rule: 'direct', move: '-5', borrow: 0 });
});

test('invariant: every add move nets to +d, every sub move nets to −d', () => {
  for (let c = 0; c <= 9; c++) {
    for (let d = 1; d <= 9; d++) {
      assert.equal(netOf(classifyAdd(c, d).move), d, `add c=${c} d=${d}`);
      assert.equal(netOf(classifySub(c, d).move), -d, `sub c=${c} d=${d}`);
    }
  }
});

test('earthMoveLegal: enough free beads to add, enough active to subtract', () => {
  assert.equal(earthMoveLegal(1, 3, +1), true);   // 1 -> 4, three free
  assert.equal(earthMoveLegal(2, 3, +1), false);  // 2 -> would need 5 earth beads
  assert.equal(earthMoveLegal(4, 1, +1), false);  // lower beads full
  assert.equal(earthMoveLegal(6, 2, +1), true);   // 6 = 5+1, one earth active, room for 2 more
  assert.equal(earthMoveLegal(8, 3, -1), true);   // 8 = 5+3, three active
  assert.equal(earthMoveLegal(7, 3, -1), false);  // 7 = 5+2, only two active
});

test('heavenMoveLegal: set only when up, clear only when down', () => {
  assert.equal(heavenMoveLegal(4, +1), true);   // heaven free
  assert.equal(heavenMoveLegal(5, +1), false);  // already set
  assert.equal(heavenMoveLegal(7, -1), true);   // active, can clear
  assert.equal(heavenMoveLegal(3, -1), false);  // not set
});

test('legal literal earth/heaven moves never carry (stay within the digit)', () => {
  for (let c = 0; c <= 9; c++) {
    for (let n = 1; n <= 4; n++) {
      if (earthMoveLegal(c, n, +1)) assert.ok(c + n <= 9);
      if (earthMoveLegal(c, n, -1)) assert.ok(c - n >= 0);
    }
    if (heavenMoveLegal(c, +1)) assert.ok(c + 5 <= 9);
    if (heavenMoveLegal(c, -1)) assert.ok(c - 5 >= 0);
  }
});

test('invariant: big friend exactly when the move crosses a column', () => {
  for (let c = 0; c <= 9; c++) {
    for (let d = 1; d <= 9; d++) {
      assert.equal(classifyAdd(c, d).rule === 'big', c + d > 9, `add c=${c} d=${d}`);
      assert.equal(classifySub(c, d).rule === 'big', c - d < 0, `sub c=${c} d=${d}`);
    }
  }
});
