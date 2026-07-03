import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AbacusStore } from '../src/state/abacusStore.js';
import { TutorialSession } from '../src/tutorial/tutorialSession.js';
import { TutorialProgress, MemoryProgressStore } from '../src/tutorial/progressStore.js';

// Two deterministic stub levels (floor 2 each). Each gen() returns a fixed
// problem, so tests don't depend on rng or the real level formulas.
const LEVELS = [
  {
    id: 'l0', title: 'L0', teach: 't0', floor: 2,
    gen: () => ({ a: 0, b: 5, op: '+', prompt: '0 + 5', sub: 's', startScaled: 0, targetScaled: 50000 }),
    hint: () => 'do +5',
  },
  {
    id: 'l1', title: 'L1', teach: 't1', floor: 2,
    gen: () => ({ a: 3, b: 4, op: '+', prompt: '3 + 4', sub: 's', startScaled: 30000, targetScaled: 70000 }),
    hint: () => 'small friend',
  },
];

function makeSession(initialProgress = {}) {
  const store = new AbacusStore(0, '');
  const progress = new TutorialProgress(new MemoryProgressStore(initialProgress));
  const events = [];
  const session = new TutorialSession({ levels: LEVELS, progress, rng: {}, store });
  session.subscribe(e => events.push(e));
  return { store, progress, session, events };
}

test('starting a level seeds the beads and emits level + problem', () => {
  const { store, session, events } = makeSession();
  session.startLevel(0);
  assert.equal(store.scaledValue(), 0);              // seeded to start
  assert.deepEqual(events.map(e => e.type), ['level', 'problem']);
  assert.equal(events[0].teach, 't0');
});

test('reaching the target value counts a solve', () => {
  const { store, session, events } = makeSession();
  session.startLevel(0);
  store.setScaled(50000);                            // user "reaches" 5
  const solved = events.find(e => e.type === 'solved');
  assert.ok(solved);
  assert.equal(solved.streak, 1);
  assert.equal(solved.justPassed, false);            // floor is 2
});

test('seeding a new problem does not falsely count as a solve', () => {
  const { store, session, events } = makeSession();
  session.startLevel(0);                             // start == 0 == not target
  session.next();                                    // re-seeds start (0) again
  assert.equal(events.filter(e => e.type === 'solved').length, 0);
});

test('a streak at the floor unlocks the next level', () => {
  const { store, progress, session, events } = makeSession();
  session.startLevel(0);
  assert.equal(progress.isUnlocked(1), false);
  store.setScaled(50000);                            // solve 1
  session.next();                                    // fresh problem (start 0)
  store.setScaled(50000);                            // solve 2 -> passes floor 2
  const passed = events.filter(e => e.type === 'solved').pop();
  assert.equal(passed.streak, 2);
  assert.equal(passed.justPassed, true);
  assert.equal(passed.unlockedIdx, 1);
  assert.equal(progress.isUnlocked(1), true);
  assert.equal(progress.best('l0'), 2);
});

test('locked levels refuse to start', () => {
  const { session, events } = makeSession();         // only level 0 unlocked
  session.startLevel(1);
  assert.equal(session.active, false);
  assert.deepEqual(events.map(e => e.type), ['locked']);
});

test('skip reveals the answer, resets the streak, and re-seeds the same problem', () => {
  const { store, session, events } = makeSession();
  session.startLevel(0);
  store.setScaled(50000);                            // streak -> 1
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
