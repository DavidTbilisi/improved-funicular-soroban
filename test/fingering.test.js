import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  THUMB, INDEX, FINGER_RULES, motionFor, motionsFor, gesturesFor,
  fingeringOf, fingeringText, fingeringStory,
} from '../src/domain/fingering.js';
import { planAdd, planSub } from '../src/domain/movePlan.js';
import { earthMoveLegal, heavenMoveLegal } from '../src/domain/soroban.js';

const STEPS = ['+1', '+2', '+3', '+4', '+5', '+10', '-1', '-2', '-3', '-4', '-5', '-10'];
// Every rod state and every operand — the whole space this module can be asked.
const ALL = [];
for (let c = 0; c <= 9; c++) for (let d = 1; d <= 9; d++) for (const s of ['+', '-']) ALL.push([c, s, d]);

// --- The two rules -----------------------------------------------------------

test('the thumb pushes earth beads up and does nothing else', () => {
  for (const step of STEPS) {
    const m = motionFor(step);
    const isEarthUp = m.bead === 'earth' && m.toward;
    assert.equal(m.finger, isEarthUp ? THUMB : INDEX, `${step} finger`);
  }
});

test('toward the bar is up for an earth bead and down for the heaven bead', () => {
  assert.equal(motionFor('+3').travel, 'up');    // earth beads rise to the bar
  assert.equal(motionFor('-3').travel, 'down');
  assert.equal(motionFor('+5').travel, 'down');  // the heaven bead comes down to it
  assert.equal(motionFor('-5').travel, 'up');
  for (const step of STEPS) assert.equal(motionFor(step).toward, step[0] !== '-');
});

test('the carry is one earth bead on the NEXT rod, by the same rule', () => {
  const up = motionFor('+10'), down = motionFor('-10');
  assert.equal(up.rod, 1); assert.equal(up.n, 1); assert.equal(up.finger, THUMB);
  assert.equal(down.rod, 1); assert.equal(down.finger, INDEX);
  for (const step of ['+1', '-4', '+5', '-5']) assert.equal(motionFor(step).rod, 0);
});

test('the rule table states each of the four motions exactly once', () => {
  assert.equal(FINGER_RULES.length, 4);
  const seen = new Set(FINGER_RULES.map(r => `${r.bead}${r.toward}`));
  assert.equal(seen.size, 4);
  for (const r of FINGER_RULES) {
    assert.equal(r.finger, r.bead === 'earth' && r.toward ? THUMB : INDEX);
  }
});

test('motionFor rejects anything that is not a single bead move', () => {
  for (const bad of ['+6', '-7', '+100', '0', '+']) assert.throws(() => motionFor(bad), /bead move/);
});

// --- The four shapes a ±digit takes ------------------------------------------

test('+6 is a pinch: two fingers converging on one rod, one motion', () => {
  const f = fingeringOf(0, '+', 6);
  assert.deepEqual(f.steps, ['+5', '+1']);
  assert.equal(f.gestureCount, 1);
  const [g] = f.gestures;
  assert.equal(g.kind, 'together');
  assert.equal(g.pinch, true);
  assert.deepEqual(g.fingers, [INDEX, THUMB]);
});

test('+4 is a sweep: one index finger straight down through both beads', () => {
  const f = fingeringOf(1, '+', 4);
  assert.deepEqual(f.steps, ['+5', '-1']);
  assert.equal(f.gestureCount, 1);
  assert.equal(f.gestures[0].kind, 'sweep');
  assert.deepEqual(f.gestures[0].fingers, [INDEX]);
  assert.match(f.gestures[0].text, /straight down through both/);
});

test('−4 is two fingers again, but travelling together rather than pinching', () => {
  const g = fingeringOf(5, '-', 4).gestures;
  assert.equal(g.length, 1);
  assert.equal(g[0].kind, 'together');
  assert.equal(g[0].pinch, false, 'both beads leave the bar upward — no pinch');
});

test('−6 is the one that costs two motions: one finger cannot be in two places', () => {
  const f = fingeringOf(6, '-', 6);
  assert.equal(f.motionCount, 2);
  assert.equal(f.gestureCount, 2);
  for (const g of f.gestures) { assert.equal(g.kind, 'single'); assert.deepEqual(g.fingers, [INDEX]); }
});

// --- The taught order --------------------------------------------------------

test('−(5+n) takes the earth bead first — the taught 運珠', () => {
  for (let n = 1; n <= 4; n++) {
    const c = 5 + n;
    const steps = planSub(c, 5 + n).steps;
    assert.deepEqual(steps, ['-5', `-${n}`], 'the plan still emits the 5-bead first');
    const ms = motionsFor(steps);
    assert.equal(ms[0].bead, 'earth', `−${5 + n}: the earth bead goes first`);
    assert.equal(ms[1].bead, 'heaven');
  }
});

test('nothing else is reordered — the plan order is the hand order', () => {
  for (const [c, s, d] of ALL) {
    const plan = s === '+' ? planAdd(c, d) : planSub(c, d);
    const ms = motionsFor(plan.steps);
    const swapped = ms.map(m => m.step).join(' ') !== plan.steps.join(' ');
    if (swapped) {
      // the only shape that may swap: a direct −(5+n) on one rod, possibly
      // after a carry step that is left where it is.
      assert.deepEqual(ms.map(m => m.step).slice(-2).sort(), plan.steps.slice(-2).sort());
      assert.equal(ms[ms.length - 1].step, '-5');
    }
  }
});

test('the taught order is playable: every motion legal at the moment it is made', () => {
  for (const [c, s, d] of ALL) {
    const plan = s === '+' ? planAdd(c, d) : planSub(c, d);
    let rod = c;
    for (const m of motionsFor(plan.steps)) {
      if (m.rod === 1) continue;                       // the carry rides on the next rod
      const legal = m.bead === 'heaven'
        ? heavenMoveLegal(rod, m.sign) : earthMoveLegal(rod, m.n, m.sign);
      assert.ok(legal, `${c} ${s}${d}: ${m.step} illegal in the taught order`);
      rod += m.sign * (m.bead === 'heaven' ? 5 : m.n);
    }
    assert.equal(rod, ((s === '+' ? c + d : c - d) % 10 + 10) % 10, `${c} ${s}${d} lands wrong`);
  }
});

// --- Fusion ------------------------------------------------------------------

test('a gesture is at most two motions and never asks one finger for both', () => {
  for (const [c, s, d] of ALL) {
    for (const g of fingeringOf(c, s, d).gestures) {
      assert.ok(g.motions.length <= 2, 'a hand has two fingers');
      if (g.motions.length === 2 && g.kind === 'together') {
        assert.notEqual(g.motions[0].finger, g.motions[1].finger);
      }
      if (g.kind === 'sweep') {
        assert.equal(g.motions[0].finger, g.motions[1].finger);
        assert.equal(g.motions[0].travel, g.motions[1].travel, 'a sweep goes one way');
        assert.equal(g.motions[0].rod, g.motions[1].rod, 'a finger cannot sweep two rods');
      }
    }
  }
});

test('the gestures account for every motion, in order, exactly once', () => {
  for (const [c, s, d] of ALL) {
    const f = fingeringOf(c, s, d);
    const flat = f.gestures.flatMap(g => g.motions.map(m => m.step));
    assert.deepEqual(flat, f.motions.map(m => m.step), `${c} ${s}${d}`);
  }
});

test('the carry only joins a motion nothing on its own rod wants', () => {
  // +7 on 3: the payback is a single move, so the carry rides with it.
  const near = fingeringOf(3, '+', 7);
  assert.deepEqual(near.steps, ['+10', '-3']);
  assert.equal(near.gestureCount, 1);
  assert.equal(near.gestures[0].crossRod, true);
  // +7 on 6: the payback is a 5-complement pair — that pair is the taught unit,
  // and the carry waits its turn rather than poaching the −5.
  const far = fingeringOf(6, '+', 7);
  assert.deepEqual(far.steps, ['+10', '-5', '+2']);
  assert.equal(far.gestureCount, 2);
  assert.deepEqual(far.gestures[0].steps, ['+10']);
  assert.deepEqual(far.gestures[1].steps, ['-5', '+2']);
});

test('a borrow and a heaven bead are both the index finger, so they cannot fuse', () => {
  const f = fingeringOf(2, '-', 5);
  assert.deepEqual(f.steps, ['-10', '+5']);
  assert.equal(f.gestureCount, 2, 'one finger, two rods — two motions');
});

test('fusion never makes a whole ±digit cost more gestures than it has moves', () => {
  for (const [c, s, d] of ALL) {
    const f = fingeringOf(c, s, d);
    assert.ok(f.gestureCount >= 1 && f.gestureCount <= f.motionCount);
    assert.ok(f.motionCount <= 3);
  }
});

// --- Narration ---------------------------------------------------------------

test('the one-line text names each gesture, and a repeated finger as itself', () => {
  assert.equal(fingeringText(fingeringOf(0, '+', 6).gestures), 'index + thumb together');
  assert.equal(fingeringText(fingeringOf(1, '+', 4).gestures), 'index sweeps both');
  assert.equal(fingeringText(fingeringOf(6, '-', 6).gestures), 'index, then the same finger again');
  assert.equal(fingeringText(fingeringOf(6, '+', 7).gestures), 'thumb, then index + thumb together');
});

test('the reveal story counts the motions and names the beads', () => {
  const s = fingeringStory(6, '-', 6);
  assert.match(s, /−6 on a rod showing 6/);
  assert.match(s, /2 motions\.$/);
  assert.match(s, /earth bead/);
  assert.match(fingeringStory(0, '+', 6), /1 motion\.$/);
});

test('every legal move in the space has a finger for every one of its motions', () => {
  for (const [c, s, d] of ALL) {
    const f = fingeringOf(c, s, d);
    assert.ok(f.motions.length > 0);
    for (const m of f.motions) assert.ok(m.finger === THUMB || m.finger === INDEX);
    assert.ok(fingeringText(f.gestures).length > 0);
  }
});
