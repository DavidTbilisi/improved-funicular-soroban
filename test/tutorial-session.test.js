import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AbacusStore } from '../src/state/abacusStore.js';
import { TutorialSession } from '../src/tutorial/tutorialSession.js';
import { TutorialProgress, MemoryProgressStore } from '../src/tutorial/progressStore.js';

// Two deterministic stub levels (streak floor 2, time floor 1000ms each). Each
// gen() returns a fixed problem, so tests don't depend on rng or the real level
// formulas.
const LEVELS = [
  {
    id: 'l0', title: 'L0', teach: 't0', floor: 2, timeFloorMs: 1000,
    gen: () => ({ a: 0, b: 5, op: '+', prompt: '0 + 5', sub: 's', startScaled: 0, targetScaled: 50000 }),
    hint: () => 'do +5',
  },
  {
    id: 'l1', title: 'L1', teach: 't1', floor: 2, timeFloorMs: 1000,
    gen: () => ({ a: 3, b: 4, op: '+', prompt: '3 + 4', sub: 's', startScaled: 30000, targetScaled: 70000 }),
    hint: () => 'small friend',
  },
];

function makeSession(initialProgress = {}) {
  const store = new AbacusStore(0, '');
  const progress = new TutorialProgress(new MemoryProgressStore(initialProgress));
  const clock = { t: 0, now() { return this.t; } };
  const events = [];
  const session = new TutorialSession({ levels: LEVELS, progress, rng: {}, store, clock });
  session.subscribe(e => events.push(e));
  return { store, progress, clock, session, events };
}
const lastSolved = events => events.filter(e => e.type === 'solved').pop();

test('starting a level seeds the beads and emits level + problem', () => {
  const { store, session, events } = makeSession();
  session.startLevel(0);
  assert.equal(store.scaledValue(), 0);              // seeded to start
  assert.deepEqual(events.map(e => e.type), ['level', 'problem']);
  assert.equal(events[1].timeFloorMs, 1000);
});

test('a fast, fumble-free solve is clean and counts', () => {
  const { store, clock, session, events } = makeSession();
  session.startLevel(0);
  clock.t = 500;                                     // under the 1000ms floor
  store.setScaled(50000);
  const s = lastSolved(events);
  assert.equal(s.clean, true);
  assert.equal(s.verdict, 'clean');
  assert.equal(s.streak, 1);
});

test('a slow solve does not count and resets the streak', () => {
  const { store, clock, session, events } = makeSession();
  session.startLevel(0);
  clock.t = 400; store.setScaled(50000);             // clean solve 1 -> streak 1
  assert.equal(lastSolved(events).streak, 1);
  session.next(); assert.equal(session.t0, 400);     // new timer baseline
  clock.t = 400 + 2000;                              // 2000ms > floor
  store.setScaled(50000);
  const s = lastSolved(events);
  assert.equal(s.clean, false);
  assert.equal(s.verdict, 'slow');
  assert.equal(s.streak, 0);                         // streak wiped
});

test('a fumble (fault) makes the solve non-clean and resets the streak', () => {
  const { store, clock, session, events } = makeSession();
  session.startLevel(0);
  session.fault();                                   // e.g. an illegal move
  clock.t = 200;                                     // fast, but fumbled
  store.setScaled(50000);
  const s = lastSolved(events);
  assert.equal(s.clean, false);
  assert.equal(s.verdict, 'fumbled');
  assert.equal(s.faults, 1);
  assert.equal(s.streak, 0);
});

test('a streak of clean solves at the floor unlocks the next level', () => {
  const { store, progress, clock, session, events } = makeSession();
  session.startLevel(0);
  assert.equal(progress.isUnlocked(1), false);
  clock.t = 300; store.setScaled(50000);             // clean 1
  session.next();
  clock.t = 600; store.setScaled(50000);             // clean 2 -> passes floor 2
  const s = lastSolved(events);
  assert.equal(s.streak, 2);
  assert.equal(s.justPassed, true);
  assert.equal(s.unlockedIdx, 1);
  assert.equal(progress.isUnlocked(1), true);
});

test('a slow solve blocks the unlock even at a full streak', () => {
  const { store, progress, clock, session } = makeSession();
  session.startLevel(0);
  clock.t = 300; store.setScaled(50000);             // clean 1
  session.next();
  clock.t = 300 + 5000; store.setScaled(50000);      // slow -> resets, no unlock
  assert.equal(progress.isUnlocked(1), false);
});

test('seeding a new problem does not falsely count as a solve', () => {
  const { session, events } = makeSession();
  session.startLevel(0);
  session.next();
  assert.equal(events.filter(e => e.type === 'solved').length, 0);
});

test('locked levels refuse to start', () => {
  const { session, events } = makeSession();
  session.startLevel(1);
  assert.equal(session.active, false);
  assert.deepEqual(events.map(e => e.type), ['locked']);
});

test('skip reveals the answer, resets the streak, and re-seeds the same problem', () => {
  const { store, clock, session, events } = makeSession();
  session.startLevel(0);
  clock.t = 300; store.setScaled(50000);             // streak -> 1
  session.next();
  store.setScaled(30000);                            // a wrong value: no solve
  session.skip();
  const skipped = events.find(e => e.type === 'skipped');
  assert.ok(skipped);
  assert.equal(skipped.text, 'do +5');
  assert.equal(session.streak, 0);
  assert.equal(store.scaledValue(), 0);              // re-seeded to start
});

test('already-unlocked progress is honored on construction', () => {
  const { session } = makeSession({ unlocked: 2, best: {} });
  session.startLevel(1);
  assert.equal(session.active, true);
  assert.equal(session.idx, 1);
});

test('v2 migration: pre-insert unlock counts shift past the compound level', () => {
  // 'Compound trades' was inserted at ladder index 6; older blobs (no v field)
  // with unlock counts beyond it must not relock the levels above.
  const past = new TutorialProgress(new MemoryProgressStore({ unlocked: 7, best: {} }));
  assert.equal(past.unlockedCount(), 8);
  const before = new TutorialProgress(new MemoryProgressStore({ unlocked: 3, best: {} }));
  assert.equal(before.unlockedCount(), 3);           // counts at or below the slot don't move
  const modern = new TutorialProgress(new MemoryProgressStore({ unlocked: 8, v: 2, best: {} }));
  assert.equal(modern.unlockedCount(), 8);           // already-migrated blobs pass through
});
