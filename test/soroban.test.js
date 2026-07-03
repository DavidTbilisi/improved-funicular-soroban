import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAdd, classifySub } from '../src/domain/soroban.js';

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

test('invariant: big friend exactly when the move crosses a column', () => {
  for (let c = 0; c <= 9; c++) {
    for (let d = 1; d <= 9; d++) {
      assert.equal(classifyAdd(c, d).rule === 'big', c + d > 9, `add c=${c} d=${d}`);
      assert.equal(classifySub(c, d).rule === 'big', c - d < 0, `sub c=${c} d=${d}`);
    }
  }
});
