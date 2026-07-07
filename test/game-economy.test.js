import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildingById, GRID_CELLS } from '../src/game/buildings.js';
import {
  newVillage, counts, isUnlocked, canAfford, spend, refund, shortfall,
  canPlace, place, dailyYield, advanceDay, shrineBonus, upgradeCost,
  festivalBonus, festivalCost, FESTIVAL_COST, FESTIVAL_SOLVES, FESTIVAL_BONUS, FESTIVAL_YIELD_DAYS,
} from '../src/game/economy.js';

const put = (v, id, cellIdx, level = 1) => { v.grid[cellIdx] = { id, level }; };

test('a new village: 20 sp, day 1, empty 54-cell grid, zeroed stats', () => {
  const v = newVillage();
  assert.equal(v.sp, 20);
  assert.equal(v.day, 1);
  assert.deepEqual(v.res, { food: 0, wood: 0, coin: 0 });
  assert.equal(v.grid.length, GRID_CELLS);
  assert.ok(v.grid.every(c => c === null));
  assert.equal(v.festival, 0);
  assert.deepEqual(v.stats, { solves: 0, clean: 0, spEarned: 0, bestPayout: 0, streak: 0, bestStreak: 0, festivals: 0, founded: false });
});

test('counts tallies buildings regardless of level', () => {
  const v = newVillage();
  put(v, 'farm', 0); put(v, 'farm', 1, 3); put(v, 'hut', 2);
  assert.deepEqual(counts(v), { farm: 2, hut: 1 });
});

test('unlocks: workshop needs a woodcutter; farm is always open', () => {
  const v = newVillage();
  assert.equal(isUnlocked(v, buildingById('farm')), true);
  assert.equal(isUnlocked(v, buildingById('workshop')), false);
  put(v, 'woodcutter', 0);
  assert.equal(isUnlocked(v, buildingById('workshop')), true);
});

test('spend and refund round-trip a mixed cost', () => {
  const v = newVillage();
  v.res = { food: 10, wood: 8, coin: 3 };
  const cost = { sp: 12, food: 4, wood: 8 };
  assert.equal(canAfford(v, cost), true);
  spend(v, cost);
  assert.equal(v.sp, 8);
  assert.deepEqual(v.res, { food: 6, wood: 0, coin: 3 });
  refund(v, cost);
  assert.equal(v.sp, 20);
  assert.deepEqual(v.res, { food: 10, wood: 8, coin: 3 });
});

test('canPlace refuses in order: range, occupied, locked, cost', () => {
  const v = newVillage();
  const farm = buildingById('farm'), workshop = buildingById('workshop');
  assert.deepEqual(canPlace(v, farm, -1), { ok: false, reason: 'range' });
  assert.deepEqual(canPlace(v, farm, GRID_CELLS), { ok: false, reason: 'range' });
  put(v, 'hut', 5);
  assert.deepEqual(canPlace(v, farm, 5), { ok: false, reason: 'occupied' });
  v.sp = 1000;
  assert.deepEqual(canPlace(v, workshop, 6), { ok: false, reason: 'locked' });
  v.sp = 5;
  assert.deepEqual(canPlace(v, farm, 6), { ok: false, reason: 'cost' });
  v.sp = 15;
  assert.deepEqual(canPlace(v, farm, 6), { ok: true });
});

test('place pays the cost and occupies the cell at level 1', () => {
  const v = newVillage();
  place(v, buildingById('farm'), 7);
  assert.equal(v.sp, 5);
  assert.deepEqual(v.grid[7], { id: 'farm', level: 1 });
});

test('dailyYield: a lone farm grows 2 food; a well makes it 4', () => {
  const v = newVillage();
  put(v, 'farm', 0);
  assert.deepEqual(dailyYield(v), { sp: 0, food: 2, wood: 0, coin: 0 });
  put(v, 'well', 1); // well: +1 food, aura: the farm +1
  assert.deepEqual(dailyYield(v), { sp: 0, food: 4, wood: 0, coin: 0 });
});

test('dailyYield scales with level and the market trickles sp', () => {
  const v = newVillage();
  put(v, 'farm', 0, 2);   // 2 food × L2
  put(v, 'market', 1);    // +2 coin +1 sp
  assert.deepEqual(dailyYield(v), { sp: 1, food: 4, wood: 0, coin: 2 });
});

test('advanceDay banks the yields, advances the calendar, and reports them', () => {
  const v = newVillage();
  put(v, 'farm', 0); put(v, 'hut', 1); put(v, 'market', 2);
  const y = advanceDay(v);
  assert.deepEqual(y, { sp: 1, food: 2, wood: 0, coin: 3 });
  assert.equal(v.day, 2);
  assert.equal(v.sp, 21);
  assert.deepEqual(v.res, { food: 2, wood: 0, coin: 3 });
});

test('festival: bonus while lit, one day burned per advanceDay, never below 0', () => {
  const v = newVillage();
  assert.equal(festivalBonus(v), 0);
  v.festival = FESTIVAL_SOLVES;
  assert.equal(festivalBonus(v), FESTIVAL_BONUS);
  advanceDay(v);
  assert.equal(v.festival, FESTIVAL_SOLVES - 1);
  v.festival = 1;
  advanceDay(v);           // last boosted day burns out…
  assert.equal(v.festival, 0);
  assert.equal(festivalBonus(v), 0);
  advanceDay(v);           // …and stays at zero
  assert.equal(v.festival, 0);
  assert.ok(Object.isFrozen(FESTIVAL_COST));
});

test('festivalCost: floored at the founding feast, scaled to ten days of production', () => {
  const v = newVillage();
  // A young village pays exactly the floor.
  assert.deepEqual(festivalCost(v), { food: 150, wood: 50, coin: 100 });
  // A mature village pays FESTIVAL_YIELD_DAYS days of its own yields, per
  // resource independently — here only coin has outgrown its floor.
  put(v, 'farm', 0, 2);        // 4 food
  put(v, 'well', 1, 2);        // 2 food + aura (+1 for the one farm) -> 7 food
  put(v, 'workshop', 2, 4);    // 12 coin
  const y = dailyYield(v);
  assert.deepEqual(y, { sp: 0, food: 7, wood: 0, coin: 12 });
  assert.deepEqual(festivalCost(v), {
    food: 150,                              // 70 < floor
    wood: 50,                               // 0 < floor
    coin: FESTIVAL_YIELD_DAYS * y.coin,     // 120 > floor
  });
});

test('shrineBonus: +10% per shrine level, capped at +30%', () => {
  const v = newVillage();
  assert.equal(shrineBonus(v), 0);
  put(v, 'shrine', 0);
  assert.equal(shrineBonus(v), 0.1);
  v.grid[0].level = 3;
  assert.equal(shrineBonus(v), 0.3);
  put(v, 'shrine', 1, 2); // levels total 5 → still capped
  assert.equal(shrineBonus(v), 0.3);
});

test('upgradeCost scales with tier and level, and never caps', () => {
  const farm = buildingById('farm'), workshop = buildingById('workshop');
  assert.deepEqual(upgradeCost(farm, 1), { food: 5, wood: 5 });
  assert.deepEqual(upgradeCost(farm, 2), { food: 10, wood: 10, coin: 5 });
  assert.deepEqual(upgradeCost(workshop, 1), { food: 15, wood: 15 });
  assert.deepEqual(upgradeCost(workshop, 2), { food: 30, wood: 30, coin: 15 });
  // Endless: the pre-endless values above are the first rungs of a linear
  // curve that keeps going.
  assert.deepEqual(upgradeCost(farm, 3), { food: 15, wood: 15, coin: 10 });
  assert.deepEqual(upgradeCost(farm, 10), { food: 50, wood: 50, coin: 45 });
  assert.deepEqual(upgradeCost(workshop, 100), { food: 1500, wood: 1500, coin: 1485 });
});

test('shortfall reports exactly what is missing, {} when affordable', () => {
  const v = newVillage(); // 20 sp, no resources
  assert.deepEqual(shortfall(v, { sp: 15 }), {});
  assert.deepEqual(shortfall(v, { sp: 60, wood: 15, food: 10 }), { sp: 40, food: 10, wood: 15 });
  v.res.wood = 9;
  assert.deepEqual(shortfall(v, { wood: 15 }), { wood: 6 });
});
