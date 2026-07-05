import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AbacusStore } from '../src/state/abacusStore.js';
import { RodTrainerSession } from '../src/tutorial/rodTrainerSession.js';
import { buildMultiplication } from '../src/domain/mulDiv.js';
import { FRAC_COLS } from '../src/domain/config.js';

const SCALE = Math.pow(10, FRAC_COLS);
// One fixed multiplication mode so tests don't depend on rng.
const MODES = [{ id: 'mul', op: '×', label: '×', title: 'Multiply', teach: 't', gen: () => ({ a: 6, b: 3 }) }];

function make() {
  const store = new AbacusStore(0, '');
  const events = [];
  const session = new RodTrainerSession({ modes: MODES, rng: {}, store });
  session.subscribe(e => events.push(e));
  return { store, session, events };
}
const setBoard = (store, v) => store.setScaled(v * SCALE);
const P = buildMultiplication(6, 3); // steps expected: [30618, 30018]

test('start seeds the layout and emits problem + first step', () => {
  const { store, session, events } = make();
  session.start('mul');
  assert.equal(store.intValue(), P.setup);
  assert.deepEqual(events.map(e => e.type), ['problem', 'step']);
  assert.equal(events[0].total, 2);
  assert.equal(events[0].answer, 18);
  assert.equal(events[1].n, 1);
  assert.deepEqual(events[1].targets, P.steps[0].targets);
  assert.deepEqual(events[1].factors, [6, 3], 'step event exposes the mult-table cell');
});

test('reaching a step value advances to the next step', () => {
  const { store, session, events } = make();
  session.start('mul');
  setBoard(store, P.steps[0].expected);
  const step = events.filter(e => e.type === 'step').pop();
  assert.equal(step.n, 2);
});

test('reaching the final value solves with the answer', () => {
  const { store, session, events } = make();
  session.start('mul');
  setBoard(store, P.steps[0].expected);
  setBoard(store, P.steps[1].expected);
  const solved = events.filter(e => e.type === 'solved').pop();
  assert.ok(solved);
  assert.equal(solved.answer, 18);
  assert.equal(solved.solves, 1);
});

test('an intermediate (non-checkpoint) value does not advance', () => {
  const { store, session, events } = make();
  session.start('mul');
  const before = events.filter(e => e.type === 'step').length;
  setBoard(store, P.setup + 5);           // some mid-move value
  assert.equal(events.filter(e => e.type === 'step').length, before);
});

test('a fluent operator can clear several book-steps at once', () => {
  const { store, session, events } = make();
  session.start('mul');
  setBoard(store, P.steps[1].expected);   // jump straight to the final checkpoint
  assert.ok(events.some(e => e.type === 'solved'));
});

test('doStep plays the current step and advances', () => {
  const { store, session, events } = make();
  session.start('mul');
  session.doStep();
  assert.equal(store.intValue(), P.steps[0].expected);
  assert.equal(events.filter(e => e.type === 'step').pop().n, 2);
  session.doStep();
  assert.ok(events.some(e => e.type === 'solved'));
});

test('stop clears the session', () => {
  const { session, events } = make();
  session.start('mul');
  session.stop();
  assert.equal(session.active, false);
  assert.equal(events.pop().type, 'stopped');
});

test('seeding a new problem is not mistaken for a solve', () => {
  const { session, events } = make();
  session.start('mul');
  session.next();
  assert.equal(events.filter(e => e.type === 'solved').length, 0);
});
