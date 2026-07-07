import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextHint, cheapestUpgrade, costText } from '../src/game/advisor.js';
import { newVillage } from '../src/game/economy.js';

const put = (v, id, cellIdx, level = 1) => { v.grid[cellIdx] = { id, level }; };

// A village with the whole goal ladder behind it — the endless late game.
function thrivingVillage() {
  const v = newVillage();
  ['hut', 'farm', 'well', 'woodcutter', 'workshop', 'market', 'shrine']
    .forEach((id, i) => put(v, id, i, id === 'shrine' ? 3 : 2));
  v.stats = { ...v.stats, solves: 60, clean: 30, spEarned: 500, bestStreak: 7, festivals: 1, founded: true };
  return v;
}

test('costText formats mixed bags with the shared glyphs', () => {
  assert.equal(costText({ sp: 10 }), '10 sp');
  assert.equal(costText({ sp: 60, wood: 15, food: 10 }), '60 sp + 15 🪵 + 10 🌾'); // bag order preserved
  assert.equal(costText({}), '');
});

test('a fresh village is told to take its first contract', () => {
  const v = newVillage();
  assert.equal(nextHint(v).id, 'first-contract');
});

test('building goals: build when affordable, save (with the exact gap) when not', () => {
  const v = newVillage();
  v.stats.solves = 1;
  assert.equal(nextHint(v).id, 'build'); // hut costs 10, 20 sp on hand
  assert.match(nextHint(v).msg, /🛖 Hut/);
  v.sp = 3;
  assert.equal(nextHint(v).id, 'save');
  assert.match(nextHint(v).msg, /short 7 sp/);
});

test('practice goals speak to the stats', () => {
  const v = newVillage();
  v.stats.solves = 5;
  put(v, 'hut', 0);
  put(v, 'farm', 1);
  v.stats.clean = 1;
  assert.equal(nextHint(v).id, 'clean3');
  assert.match(nextHint(v).msg, /2 more contracts/);
});

test('the level-2 rung points at the cheapest upgrade on the grid', () => {
  const v = newVillage();
  v.stats = { ...v.stats, solves: 10, clean: 5 };
  put(v, 'hut', 0);
  put(v, 'farm', 1);
  put(v, 'well', 2);
  put(v, 'woodcutter', 3);
  const hint = nextHint(v);
  assert.equal(hint.id, 'level2');
  assert.match(hint.msg, /🛖 Hut \(L1→L2\)/); // tier 1, cheapest
  assert.match(hint.msg, /short/);            // fresh village has no resources
  v.res = { food: 50, wood: 50, coin: 0 };
  assert.match(nextHint(v).msg, /on hand ✓/);
});

test('the founding rung names what is missing for the shrine upgrade', () => {
  const v = thrivingVillage();
  v.grid[6].level = 2; // shrine back to 2 → 'found' is the next goal
  v.stats.founded = false;
  v.res = { food: 0, wood: 0, coin: 0 };
  const hint = nextHint(v);
  assert.equal(hint.id, 'found');
  assert.match(hint.msg, /once you have 50 🌾 \+ 50 🪵 \+ 25 🪙 more/); // shrine t5 L2→3
});

test('after the ladder: a rich, unlit village is told to feast first', () => {
  const v = thrivingVillage();
  v.res = { food: 1000, wood: 1000, coin: 1000 };
  const hint = nextHint(v);
  assert.equal(hint.id, 'festival');
  assert.match(hint.msg, /150 🌾 \+ 50 🪵 \+ 100 🪙/);
});

test('with the festival burning (or unaffordable), the advisor drives endless upgrades', () => {
  const v = thrivingVillage();
  v.res = { food: 1000, wood: 1000, coin: 1000 };
  v.festival = 6;
  const hint = nextHint(v);
  assert.equal(hint.id, 'endless');
  assert.match(hint.msg, /🛖 Hut \(L2→L3\)/); // cheapest: tier 1 level 2 → 10/10/5
  assert.match(hint.msg, /on hand ✓/);
  const up = cheapestUpgrade(v);
  assert.equal(up.def.id, 'hut');
  assert.deepEqual(up.cost, { food: 10, wood: 10, coin: 5 });
  v.festival = 0;
  v.res = { food: 100, wood: 100, coin: 50 }; // feast out of reach → upgrades again
  assert.equal(nextHint(v).id, 'endless');
});

test('the festival goal rung coaches saving up, then lighting', () => {
  const v = thrivingVillage();
  v.stats.festivals = 0; // 'festival' is now the next rung
  v.res = { food: 20, wood: 0, coin: 0 };
  const saving = nextHint(v);
  assert.equal(saving.id, 'festival-save');
  assert.match(saving.msg, /short 130 🌾 \+ 50 🪵 \+ 100 🪙/);
  v.res = { food: 200, wood: 60, coin: 120 };
  assert.equal(nextHint(v).id, 'festival');
});

test('an empty grid in endless mode asks for rebuilding, never throws', () => {
  const v = newVillage();
  v.stats = { ...v.stats, solves: 99, clean: 50, spEarned: 999, bestStreak: 9, founded: true };
  // Goal ladder incomplete (no buildings) → building goal path, not a crash.
  assert.ok(nextHint(v).msg.length > 0);
});

test('advising never mutates the village', () => {
  const v = thrivingVillage();
  const before = JSON.stringify(v);
  nextHint(v);
  cheapestUpgrade(v);
  assert.equal(JSON.stringify(v), before);
});
