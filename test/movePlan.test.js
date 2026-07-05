import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planAdd, planSub, stepsText, keysText, MOVE_KEYS } from '../src/domain/movePlan.js';
import { earthMoveLegal, heavenMoveLegal } from '../src/domain/soroban.js';

// Apply a plan's steps to a rod showing c, checking each ±5/±n is physically
// legal at the moment it happens (the ±10 lands on the next rod). Returns the
// final rod digit and the net signed value moved.
function simulate(c, steps) {
  let rod = c, net = 0;
  for (const s of steps) {
    const n = parseInt(s, 10);
    assert.ok(MOVE_KEYS[s], `${s} is a single key`);
    if (Math.abs(n) === 10) { net += n; continue; }
    if (Math.abs(n) === 5) assert.ok(heavenMoveLegal(rod, Math.sign(n)), `${s} legal on ${rod}`);
    else assert.ok(earthMoveLegal(rod, Math.abs(n), Math.sign(n)), `${s} legal on ${rod}`);
    rod += n; net += n;
  }
  return { rod, net };
}

test('planAdd: every (c,d) flattens to legal single-key steps netting +d', () => {
  for (let c = 0; c <= 9; c++) {
    for (let d = 1; d <= 9; d++) {
      const plan = planAdd(c, d);
      const { rod, net } = simulate(c, plan.steps);
      assert.equal(net, d, `+${d} on ${c} nets +${d}`);
      assert.equal(rod, (c + d) % 10, `+${d} on ${c} leaves the right rod digit`);
      assert.ok(plan.steps.length <= 3, 'a chain is at most three keys');
      assert.ok(plan.story.length <= 2, 'trades nest at most once');
      assert.equal(plan.story[0].op, `+${d}`);
    }
  }
});

test('planSub: every (c,d) flattens to legal single-key steps netting −d', () => {
  for (let c = 0; c <= 9; c++) {
    for (let d = 1; d <= 9; d++) {
      const plan = planSub(c, d);
      const { rod, net } = simulate(c, plan.steps);
      assert.equal(net, -d, `−${d} on ${c} nets −${d}`);
      assert.equal(rod, ((c - d) % 10 + 10) % 10, `−${d} on ${c} leaves the right rod digit`);
      assert.ok(plan.steps.length <= 3);
      assert.ok(plan.story.length <= 2);
    }
  }
});

test('the canonical compound add: +7 on 6 is +10 −5 +2', () => {
  const plan = planAdd(6, 7);
  assert.equal(plan.rule, 'big');
  assert.deepEqual(plan.steps, ['+10', '-5', '+2']);
  assert.equal(plan.story.length, 2);
  assert.deepEqual(plan.story[0], { op: '+7', rule: 'big', into: '+10 -3' });
  assert.deepEqual(plan.story[1], { op: '-3', rule: 'small', into: '-5 +2' });
});

test('the mirror compound subtract: −7 on 3 is −10 +5 −2', () => {
  const plan = planSub(3, 7); // e.g. 13 − 7
  assert.deepEqual(plan.steps, ['-10', '+5', '-2']);
  assert.equal(plan.story.length, 2);
  assert.deepEqual(plan.story[1], { op: '+3', rule: 'small', into: '+5 -2' });
});

test('a big trade with a direct payback stays a flat story', () => {
  const plan = planAdd(8, 4); // +4 = +10 −6, and −6 on 8 is direct −5 −1
  assert.deepEqual(plan.steps, ['+10', '-5', '-1']);
  assert.equal(plan.story.length, 1);
});

test('direct and small plans pass through unchanged', () => {
  assert.deepEqual(planAdd(2, 2).steps, ['+2']);
  assert.deepEqual(planAdd(4, 3).steps, ['+5', '-2']);
  assert.deepEqual(planSub(8, 5).steps, ['-5']);
});

test('display helpers: typographic chain text and home-row keys', () => {
  assert.equal(stepsText(['+10', '-5', '+2']), '+10 −5 +2');
  assert.equal(keysText(['+10', '-5', '+2']), 'I then R then K');
  assert.equal(keysText(['+42']), null);
});
