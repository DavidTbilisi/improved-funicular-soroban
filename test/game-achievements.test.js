import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, achievementStates } from '../src/game/achievements.js';
import { AchievementTracker } from '../src/game/achievementTracker.js';
import { AbacusStore } from '../src/state/abacusStore.js';
import { GameSession } from '../src/game/gameSession.js';
import { GameSave } from '../src/game/saveStore.js';
import { MemoryProgressStore } from '../src/tutorial/progressStore.js';
import { newVillage } from '../src/game/economy.js';
import { BUILDINGS } from '../src/game/buildings.js';
import { CHALLENGE_TIERS } from '../src/game/challenges.js';

// ── Pure ladder (achievements.js) ──────────────────────────────────────────
const freshCounters = () => ({
  solves: 0, clean: 0, fast: 0, upgrades: 0, placed: 0, festivals: 0,
  earnSp: 0, bestStreak: 0, maxLevel: 0, tiersSolved: {}, placedTypes: {},
});
const ctx = (counters = {}, village = newVillage()) => ({
  counters: { ...freshCounters(), ...counters }, village,
});
const rung = (c, id) => achievementStates(c).find(s => s.id === id);

test('cumulative counter rungs report live progress and a done flag', () => {
  const c = ctx({ clean: 10 });
  assert.equal(rung(c, 'clean-10').done, true);
  assert.equal(rung(c, 'clean-10').cur, 10);
  assert.equal(rung(c, 'clean-50').done, false);
  assert.equal(rung(c, 'clean-50').cur, 10);
  assert.equal(rung(c, 'clean-50').target, 50);
});

test('progress clamps cur to target for the bar', () => {
  assert.equal(rung(ctx({ solves: 99 }), 'first-solve').cur, 1);
});

test('set-based rungs: every tier and every building', () => {
  const allTiers = Object.fromEntries(CHALLENGE_TIERS.map(t => [t.id, true]));
  const allBuildings = Object.fromEntries(BUILDINGS.map(b => [b.id, true]));
  assert.equal(rung(ctx({ tiersSolved: allTiers }), 'all-tiers').done, true);
  assert.equal(rung(ctx({ tiersSolved: { errand: true } }), 'all-tiers').done, false);
  assert.equal(rung(ctx({ tiersSolved: { tax: true } }), 'tax-solve').done, true);
  assert.equal(rung(ctx({ placedTypes: allBuildings }), 'all-buildings').done, true);
});

test('state-based rungs read the current village: founded and rank', () => {
  const founded = newVillage(); founded.stats.founded = true;
  assert.equal(rung(ctx({}, founded), 'founded').done, true);
  const rich = newVillage(); rich.stats.spEarned = 50 * 35; // → rank 5
  assert.equal(rung(ctx({}, rich), 'rank-5').done, true);
  assert.equal(rung(ctx({}, rich), 'rank-10').done, false);
  assert.equal(rung(ctx({}, rich), 'rank-10').cur, 5);
});

test('endless-level rungs ride the tracker counter, not the (resettable) grid', () => {
  assert.equal(rung(ctx({ maxLevel: 10 }), 'level-10').done, true);
  assert.equal(rung(ctx({ maxLevel: 24 }), 'level-25').done, false);
  assert.equal(rung(ctx({ maxLevel: 50 }), 'level-50').done, true);
});

test('every achievement id is unique and frozen', () => {
  const ids = ACHIEVEMENTS.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.throws(() => { ACHIEVEMENTS[0].title = 'x'; });
});

// ── Tracker over a live session (achievementTracker.js) ─────────────────────
// Stub tiers mirror game-session.test: t0 seeds 0 → 50000 (scaled 5).
const TIERS = [
  { id: 't0', title: 'T0', baseSp: 10, timeFloorMs: 1000, gen: () => ({ prompt: 'p', sub: 's', startScaled: 0, targetScaled: 50000 }) },
];
const NOW = () => '2026-07-22T00:00';

function harness(blob = {}) {
  const save = new GameSave(new MemoryProgressStore(blob));
  const store = new AbacusStore(0, '');
  const clock = { t: 0, now() { return this.t; } };
  const session = new GameSession({ tiers: TIERS, save, rng: {}, store, clock });
  const achStore = new MemoryProgressStore({});
  const tracker = new AchievementTracker(achStore, { now: NOW });
  const unlocked = [];
  tracker.subscribe(e => { if (e.type === 'unlocked') unlocked.push(e.achievement.id); });
  tracker.seed(session.village);
  tracker.observe(session);
  const solveClean = () => { session.startChallenge('t0'); clock.t += 200; store.setScaled(50000); };
  return { save, store, clock, session, achStore, tracker, unlocked, solveClean };
}

test('a first live solve fires the first-contract unlock', () => {
  const h = harness();
  assert.deepEqual(h.unlocked, []);           // nothing before play
  h.solveClean();
  assert.ok(h.unlocked.includes('first-solve'));
  assert.equal(h.tracker.data.counters.solves, 1);
  assert.equal(h.tracker.data.unlocked['first-solve'], NOW());
});

test('ten clean solves cross the clean and streak rungs', () => {
  const h = harness();
  for (let i = 0; i < 10; i++) h.solveClean();
  assert.ok(h.unlocked.includes('clean-10'));
  assert.ok(h.unlocked.includes('streak-5'));
  assert.ok(h.unlocked.includes('streak-10'));
  assert.equal(h.tracker.data.counters.clean, 10);
  assert.equal(h.tracker.data.counters.fast, 10);
  assert.ok(!h.unlocked.includes('fast-25')); // 10 < 25
});

test('placing a building unlocks break-ground and tallies placed types', () => {
  const h = harness();
  h.session.placeBuilding('farm', 0);
  assert.ok(h.unlocked.includes('first-build'));
  assert.deepEqual(h.tracker.data.counters.placedTypes, { farm: true });
});

test('backfill is silent: history unlocks fire no toast events', () => {
  // A returning player whose village already carries progress.
  const v = newVillage();
  v.stats = { ...v.stats, solves: 5, clean: 5, spEarned: 600, bestStreak: 6, festivals: 1 };
  v.grid[0] = { id: 'hut', level: 4 };
  const store = new MemoryProgressStore({});
  const tracker = new AchievementTracker(store, { now: NOW });
  const events = [];
  tracker.subscribe(e => events.push(e));
  tracker.seed(v);
  assert.equal(events.length, 0);                       // no toast storm
  const got = tracker.data.unlocked;
  for (const id of ['first-solve', 'sp-500', 'streak-5', 'first-festival', 'first-build'])
    assert.ok(got[id], `expected retroactive unlock: ${id}`);
  assert.ok(!got['clean-10']);                          // clean 5 < 10
  // Counters were seeded from the village history (upgrades = Σ level-1).
  assert.equal(tracker.data.counters.solves, 5);
  assert.equal(tracker.data.counters.upgrades, 3);
  assert.equal(tracker.data.counters.maxLevel, 4);
});

test('unlocks and counters persist across a reload and re-seed once only', () => {
  const v = newVillage();
  v.stats = { ...v.stats, solves: 5, spEarned: 600 };
  const store = new MemoryProgressStore({});
  new AchievementTracker(store, { now: NOW }).seed(v);
  // A second tracker over the same store must NOT re-seed the counters.
  const again = new AchievementTracker(store, { now: NOW });
  again.seed(v);
  assert.equal(again.data.seeded, true);
  assert.equal(again.data.counters.solves, 5);          // not doubled to 10
  assert.ok(again.unlockedCount() >= 2);
  assert.ok(again.data.unlocked['sp-500']);
});

test('achievements survive a raze: badges stay, lifetime counters keep climbing', () => {
  const h = harness();
  h.solveClean();
  const beforeCount = h.tracker.unlockedCount();
  assert.ok(beforeCount >= 1);
  assert.equal(h.tracker.data.counters.solves, 1);
  h.session.resetSave();                                // raze the village
  assert.equal(h.tracker.unlockedCount(), beforeCount); // badges untouched
  assert.equal(h.tracker.data.counters.solves, 1);      // counter not reset
  h.solveClean();                                       // play on in the new village
  assert.equal(h.tracker.data.counters.solves, 2);      // keeps climbing
});

test('states() reports persisted done + unlock date, with live bars for locked', () => {
  const h = harness();
  h.solveClean();
  const states = h.tracker.states(h.session.village);
  const first = states.find(s => s.id === 'first-solve');
  assert.equal(first.done, true);
  assert.equal(first.at, NOW());
  const clean50 = states.find(s => s.id === 'clean-50');
  assert.equal(clean50.done, false);
  assert.equal(clean50.cur, 1);
  assert.equal(clean50.target, 50);
});
