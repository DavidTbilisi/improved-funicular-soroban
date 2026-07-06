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

// --- The automaticity gate (bridge from guided practice) ---------------------
import { SolveLog } from '../src/tutorial/solveLog.js';
import { MemoryProgressStore } from '../src/tutorial/progressStore.js';

const GATED = [{
  id: 'mul', op: '×', label: '×', title: 'Multiply', teach: 't',
  floor: 2, timeFloorMs: 1000, gen: () => ({ a: 6, b: 3 }),
}];

function makeGated() {
  const store = new AbacusStore(0, '');
  const clock = { t: 0, now() { return this.t; } };
  const log = new SolveLog(new MemoryProgressStore({}), () => 'T1');
  const events = [];
  const session = new RodTrainerSession({ modes: GATED, rng: {}, store, clock, log });
  session.subscribe(e => events.push(e));
  return { store, clock, log, session, events };
}
const solvedOf = events => events.filter(e => e.type === 'solved').pop();
const finish = store => setBoard(store, P.steps[P.steps.length - 1].expected);

test('a fast, unassisted, fumble-free solve is clean and persists', () => {
  const { store, clock, log, session, events } = makeGated();
  session.start('mul');
  clock.t = 600;
  finish(store);
  const s = solvedOf(events);
  assert.equal(s.clean, true);
  assert.equal(s.verdict, 'clean');
  assert.equal(s.elapsedMs, 600);
  assert.equal(s.streak, 1);
  assert.equal(s.floor, 2);
  assert.equal(s.cleared, false);
  assert.deepEqual(log.solves('mul'), [{ t: 'T1', ms: 600, clean: true }]);
});

test('a streak of clean solves at the floor marks the mode cleared', () => {
  const { store, clock, session, events } = makeGated();
  session.start('mul');
  clock.t = 400; finish(store);
  session.next();
  clock.t = 900; finish(store);
  const s = solvedOf(events);
  assert.equal(s.streak, 2);
  assert.equal(s.cleared, true);
  assert.ok(s.modes.find(m => m.id === 'mul').cleared, 'mode snapshot carries the seal');
});

test('"Do this step" makes the solve assisted, resetting the streak', () => {
  const { store, clock, session, events } = makeGated();
  session.start('mul');
  clock.t = 300; finish(store);                       // clean → streak 1
  session.next();
  session.doStep();                                    // step 1 played for us
  session.doStep();                                    // step 2 → solves
  const s = solvedOf(events);
  assert.equal(s.verdict, 'assisted');
  assert.equal(s.clean, false);
  assert.equal(s.streak, 0);
});

test('a fault makes the solve fumbled; over the floor makes it slow', () => {
  const { store, clock, session, events } = makeGated();
  session.start('mul');
  session.fault();
  clock.t = 500; finish(store);
  assert.equal(solvedOf(events).verdict, 'fumbled');
  session.next();
  clock.t = 500 + 5000; finish(store);
  assert.equal(solvedOf(events).verdict, 'slow');
});

test('best streak survives a reset and feeds modeInfos', () => {
  const { store, clock, log, session } = makeGated();
  session.start('mul');
  clock.t = 100; finish(store);                       // streak 1
  session.next();
  session.fault(); clock.t = 200; finish(store);      // streak reset
  assert.equal(log.best('mul'), 1);
  const info = session.modeInfos().find(m => m.id === 'mul');
  assert.equal(info.best, 1);
  assert.equal(info.cleared, false);
  assert.equal(info.timeFloorMs, 1000);
});

test('modes without gate fields still solve (defaults: floor 3, no time bound)', () => {
  const { store, session, events } = make();          // the ungated MODES
  session.start('mul');
  finish(store);
  const s = solvedOf(events);
  assert.equal(s.clean, true, 'no time floor → never slow');
  assert.equal(s.floor, 3);
  assert.equal(s.timeFloorMs, null);
});
