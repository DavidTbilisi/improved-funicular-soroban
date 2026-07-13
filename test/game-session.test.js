import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AbacusStore } from '../src/state/abacusStore.js';
import { GameSession } from '../src/game/gameSession.js';
import { GameSave } from '../src/game/saveStore.js';
import { MemoryProgressStore } from '../src/tutorial/progressStore.js';
import { newVillage } from '../src/game/economy.js';
import { GRID_CELLS } from '../src/game/buildings.js';

// Deterministic stub tiers (the real gens are covered in game-challenges.test):
// t0 seeds 0 → target 5; t1 seeds 3 → target 7; t2 seeds 0 → target 9.
const TIERS = [
  { id: 't0', title: 'T0', baseSp: 10, timeFloorMs: 1000, gen: () => ({ prompt: 'p0', sub: 's', startScaled: 0, targetScaled: 50000 }) },
  { id: 't1', title: 'T1', baseSp: 20, timeFloorMs: 1000, gen: () => ({ prompt: 'p1', sub: 's', startScaled: 30000, targetScaled: 70000 }) },
  { id: 't2', title: 'T2', baseSp: 30, timeFloorMs: 1000, gen: () => ({ prompt: 'p2', sub: 's', startScaled: 0, targetScaled: 90000 }) },
];

function makeSession(blob = {}) {
  const memory = new MemoryProgressStore(blob);
  const save = new GameSave(memory);
  const store = new AbacusStore(0, '');
  const clock = { t: 0, now() { return this.t; } };
  const events = [];
  const session = new GameSession({ tiers: TIERS, save, rng: {}, store, clock });
  session.subscribe(e => events.push(e));
  return { memory, save, store, clock, session, events };
}
const last = (events, type) => events.filter(e => e.type === type).pop();

test('taking a contract seeds the board without self-solving', () => {
  const { store, session, events } = makeSession();
  session.startChallenge('t1');
  assert.equal(store.scaledValue(), 30000n);
  assert.equal(events.filter(e => e.type === 'solved').length, 0);
  const ch = last(events, 'challenge');
  assert.equal(ch.kind, 'earn');
  assert.equal(ch.tierId, 't1');
  assert.equal(session.active, true);
});

test('a clean, fast solve pays base + both bonuses and advances one day', () => {
  const { store, clock, session, events } = makeSession();
  session.startChallenge('t0');
  clock.t = 500;
  store.setScaled(50000);
  const s = last(events, 'solved');
  assert.equal(s.verdict, 'clean');
  assert.equal(s.tierId, 't0'); // so a page can chain another of the same tier
  assert.equal(s.payout, 18); // 10 + ceil(10/2) + ceil(10/4) + 0 streak
  assert.deepEqual(s.parts, { base: 10, cleanBonus: 5, fastBonus: 3, streakBonus: 0 });
  assert.equal(s.day, 2);
  assert.equal(session.village.sp, 38); // 20 start + 18
  assert.deepEqual(session.village.stats, { solves: 1, clean: 1, spEarned: 18, bestPayout: 18, streak: 1, bestStreak: 1, festivals: 0, founded: false });
  assert.equal(session.active, false);
});

test('the clean streak pays out on the NEXT solve and a fumble breaks it', () => {
  const { store, clock, session, events } = makeSession();
  const solve = (t, fault = false) => {
    session.startChallenge('t0');
    if (fault) session.fault();
    clock.t = t;
    store.setScaled(50000);
    return last(events, 'solved');
  };
  assert.equal(solve(500).payout, 18);            // streak was 0
  assert.equal(solve(1000).payout, 19);           // streak 1 → +1
  assert.equal(solve(1500).payout, 20);           // streak 2 → +2
  assert.equal(session.village.stats.streak, 3);
  const fumbled = solve(2000, true);              // streak 3 pays +3, then breaks
  assert.equal(fumbled.payout, 16);               // 10 + 0 clean + 3 fast + 3 streak
  assert.equal(fumbled.streak, 0);
  assert.equal(session.village.stats.streak, 0);
  assert.equal(session.village.stats.bestStreak, 3);
  assert.equal(solve(2500).payout, 18);           // back to no streak bonus
});

test('a fumble drops the clean-hands bonus; a slow solve drops the speed bonus', () => {
  const a = makeSession();
  a.session.startChallenge('t0');
  a.session.fault();
  a.clock.t = 500;
  a.store.setScaled(50000);
  assert.equal(last(a.events, 'solved').verdict, 'fumbled');
  assert.equal(last(a.events, 'solved').payout, 13); // 10 + 0 + 3

  const b = makeSession();
  b.session.startChallenge('t0');
  b.clock.t = 5000;
  b.store.setScaled(50000);
  assert.equal(last(b.events, 'solved').verdict, 'slow');
  assert.equal(last(b.events, 'solved').payout, 15); // 10 + 5 + 0
});

test('the shrine blessing raises earn payouts', () => {
  const { store, clock, session, events } = makeSession();
  session.village.grid[10] = { id: 'shrine', level: 3 }; // +30%
  session.startChallenge('t0');
  clock.t = 500;
  store.setScaled(50000);
  assert.equal(last(events, 'solved').payout, Math.floor(18 * 1.3)); // 23
});

test('only one contract at a time', () => {
  const { session, events } = makeSession();
  session.startChallenge('t0');
  session.startChallenge('t1');
  assert.deepEqual(last(events, 'refused'), { type: 'refused', reason: 'busy' });
});

test('placing a building pays its cost and persists', () => {
  const { memory, session, events } = makeSession();
  session.placeBuilding('farm', 0);
  assert.equal(session.village.sp, 5);
  assert.deepEqual(session.village.grid[0], { id: 'farm', level: 1 });
  assert.equal(last(events, 'placed').cellIdx, 0);
  const reloaded = new GameSave(memory).load();
  assert.deepEqual(reloaded.grid[0], { id: 'farm', level: 1 });
});

test('placement refusals: occupied, locked, cost, range', () => {
  const { session, events } = makeSession();
  session.placeBuilding('farm', 0);                          // sp 20 → 5
  session.placeBuilding('hut', 0);
  assert.equal(last(events, 'refused').reason, 'occupied');
  session.village.sp = 1000;
  session.placeBuilding('workshop', 1);
  assert.equal(last(events, 'refused').reason, 'locked');
  session.village.sp = 5;
  session.placeBuilding('farm', 1);
  assert.equal(last(events, 'refused').reason, 'cost');
  session.placeBuilding('farm', GRID_CELLS);
  assert.equal(last(events, 'refused').reason, 'range');
});

test('upgrade: cost held up front, level rises on solve, tier escalates with the building', () => {
  const { store, clock, session, events } = makeSession();
  session.placeBuilding('farm', 0);
  session.village.res = { food: 5, wood: 5, coin: 0 }; // farm 1→2 costs 5 food 5 wood
  session.startUpgrade(0);
  assert.deepEqual(session.village.res, { food: 0, wood: 0, coin: 0 }); // deducted at start
  const ch = last(events, 'challenge');
  assert.equal(ch.kind, 'upgrade');
  assert.equal(ch.tierId, 't1'); // farm tier 1, level 1 → tiers[min(2, 1-1+1)]
  clock.t = 500;
  store.setScaled(70000);
  const s = last(events, 'solved');
  assert.equal(s.kind, 'upgrade');
  assert.equal(s.payout, 0);
  assert.equal(s.cell, 0);
  assert.equal(session.village.grid[0].level, 2);
});

test('abandoning an upgrade refunds the held cost and leaves the level alone', () => {
  const { session, events } = makeSession();
  session.placeBuilding('farm', 0);
  session.village.res = { food: 5, wood: 5, coin: 0 };
  session.startUpgrade(0);
  session.abandonChallenge();
  assert.deepEqual(session.village.res, { food: 5, wood: 5, coin: 0 });
  assert.equal(session.village.grid[0].level, 1);
  assert.equal(session.active, false);
  assert.ok(last(events, 'abandoned'));
});

test('upgrade refusals: empty, cost — and the tier index is capped', () => {
  const { session, events } = makeSession();
  session.startUpgrade(3);
  assert.equal(last(events, 'refused').reason, 'empty');
  session.village.grid[1] = { id: 'farm', level: 1 }; // no resources on hand
  session.startUpgrade(1);
  assert.equal(last(events, 'refused').reason, 'cost');
  // A shrine (tier 5) at level 2 wants tiers[min(2, 5-1+2)] → the top stub tier.
  session.village.grid[2] = { id: 'shrine', level: 2 };
  session.village.res = { food: 50, wood: 50, coin: 25 };
  session.startUpgrade(2);
  assert.equal(last(events, 'challenge').tierId, 't2');
});

test('levels are endless: level 3 keeps upgrading and the top tier judges it', () => {
  const { store, clock, session, events } = makeSession();
  session.village.grid[0] = { id: 'farm', level: 3 };
  session.village.res = { food: 15, wood: 15, coin: 10 }; // farm 3→4 costs 15/15/10
  session.startUpgrade(0);
  assert.equal(last(events, 'challenge').tierId, 't2'); // tiers[min(2, 1-1+3)]
  assert.deepEqual(session.village.res, { food: 0, wood: 0, coin: 0 });
  clock.t = 100;
  store.setScaled(90000);
  assert.equal(session.village.grid[0].level, 4);
});

test('upgrading the shrine to level 3 founds the village', () => {
  const { store, clock, session, events } = makeSession();
  session.village.grid[0] = { id: 'shrine', level: 2 };
  session.village.res = { food: 50, wood: 50, coin: 25 };
  session.startUpgrade(0);
  clock.t = 100;
  store.setScaled(90000); // t2's target
  const s = last(events, 'solved');
  assert.equal(s.milestone, 'founded');
  assert.equal(session.village.stats.founded, true);
});

test('festival: costs the feast, boosts payouts, burns down, and refuses twice', () => {
  const { memory, store, clock, session, events } = makeSession();
  session.lightFestival();
  assert.equal(last(events, 'refused').reason, 'cost'); // fresh village can't feast
  session.village.res = { food: 150, wood: 50, coin: 100 };
  session.lightFestival();
  assert.deepEqual(session.village.res, { food: 0, wood: 0, coin: 0 });
  assert.equal(session.village.festival, 10);
  assert.equal(session.village.stats.festivals, 1);
  assert.ok(last(events, 'festival'));
  session.village.res = { food: 150, wood: 50, coin: 100 };
  session.lightFestival();
  assert.equal(last(events, 'refused').reason, 'festival'); // one at a time
  // A clean, fast solve pays ×1.5: floor((10 + 5 + 3) × 1.5) = 27, then burns a day.
  session.startChallenge('t0');
  clock.t = 500;
  store.setScaled(50000);
  assert.equal(last(events, 'solved').payout, 27);
  assert.equal(session.village.festival, 9);
  const reloaded = new GameSave(memory).load();
  assert.equal(reloaded.festival, 9); // survives a reload
  assert.equal(reloaded.stats.festivals, 1);
});

test('a solve banks the daily yields — arithmetic is the calendar', () => {
  const { store, clock, session, events } = makeSession();
  session.placeBuilding('farm', 0);
  session.startChallenge('t0');
  clock.t = 100;
  store.setScaled(50000);
  const s = last(events, 'solved');
  assert.deepEqual(s.yields, { sp: 0, food: 2, wood: 0, coin: 0 });
  assert.equal(session.village.res.food, 2);
  assert.equal(session.village.day, 2);
});

test('a second session over the same store resumes the village', () => {
  const { memory, store, clock, session } = makeSession();
  session.placeBuilding('farm', 0);
  session.startChallenge('t0');
  clock.t = 100;
  store.setScaled(50000);
  const resumed = new GameSession({ tiers: TIERS, save: new GameSave(memory), rng: {}, store: new AbacusStore(0, '') });
  assert.equal(resumed.village.sp, session.village.sp);
  assert.equal(resumed.village.day, 2);
  assert.deepEqual(resumed.village.grid[0], { id: 'farm', level: 1 });
});

test('resetSave returns to a fresh village and clears any active contract', () => {
  const { session, events } = makeSession();
  session.placeBuilding('farm', 0);
  session.startChallenge('t0');
  session.resetSave();
  assert.equal(session.active, false);
  assert.deepEqual(session.village, newVillage());
  assert.ok(last(events, 'reset'));
});

test('GameSave._fix heals corrupt and legacy blobs', () => {
  const bad = new GameSave(new MemoryProgressStore({
    sp: -50, day: 'nope',
    res: { food: 3.7, wood: -1 },
    grid: [{ id: 'farm', level: 2 }, { id: 'castle', level: 1 }, { id: 'hut', level: 99 }, { id: 'hut', level: 0.5 }, 'junk'],
    stats: { solves: 4, clean: 'x' },
  })).load();
  assert.equal(bad.sp, 20);                                // invalid → default
  assert.equal(bad.day, 1);
  assert.equal(bad.res.food, 3);                           // floored
  assert.equal(bad.res.wood, 0);                           // negative → default
  assert.deepEqual(bad.grid[0], { id: 'farm', level: 2 }); // valid cell kept
  assert.equal(bad.grid[1], null);                         // unknown building dropped
  assert.deepEqual(bad.grid[2], { id: 'hut', level: 99 }); // levels are endless — high is fine
  assert.equal(bad.grid[3], null);                         // non-integer level dropped
  assert.equal(bad.grid[4], null);
  assert.equal(bad.grid.length, GRID_CELLS);
  assert.equal(bad.stats.solves, 4);
  assert.equal(bad.stats.clean, 0);
  assert.equal(bad.v, 1);
  const empty = new GameSave(new MemoryProgressStore({})).load();
  assert.deepEqual(empty, newVillage());
});
