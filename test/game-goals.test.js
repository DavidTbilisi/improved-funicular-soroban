import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GOALS, goalStates, nextGoal } from '../src/game/goals.js';
import { newVillage } from '../src/game/economy.js';
import { buildingById, BUILDINGS } from '../src/game/buildings.js';

const put = (v, id, cellIdx, level = 1) => { v.grid[cellIdx] = { id, level }; };

test('a fresh village starts at the bottom rung with nothing done', () => {
  const v = newVillage();
  const states = goalStates(v);
  assert.equal(states.length, GOALS.length);
  assert.ok(states.every(g => !g.done));
  assert.equal(nextGoal(v).id, 'hut');
});

test('every goal id is unique and building rungs reference real buildings', () => {
  assert.equal(new Set(GOALS.map(g => g.id)).size, GOALS.length);
  for (const g of GOALS) {
    if (buildingById(g.id)) assert.ok(BUILDINGS.some(b => b.id === g.id));
    assert.ok(g.emoji && g.label);
  }
});

test('the ladder advances rung by rung as the village grows', () => {
  const v = newVillage();
  put(v, 'hut', 0);
  assert.equal(nextGoal(v).id, 'farm');
  put(v, 'farm', 1);
  assert.equal(nextGoal(v).id, 'clean3');
  v.stats.clean = 3;
  assert.equal(nextGoal(v).id, 'well');
  put(v, 'well', 2);
  put(v, 'woodcutter', 3);
  assert.equal(nextGoal(v).id, 'level2');
  v.grid[0].level = 2;
  assert.equal(nextGoal(v).id, 'workshop');
});

test('practice rungs read the stats: streak5 uses bestStreak, sp250 spEarned', () => {
  const v = newVillage();
  v.stats.bestStreak = 4;
  assert.equal(goalStates(v).find(g => g.id === 'streak5').done, false);
  v.stats.bestStreak = 5;
  assert.equal(goalStates(v).find(g => g.id === 'streak5').done, true);
  v.stats.spEarned = 250;
  assert.equal(goalStates(v).find(g => g.id === 'sp250').done, true);
});

test('a fully built, founded, feasted village completes the ladder', () => {
  const v = newVillage();
  ['hut', 'farm', 'well', 'woodcutter', 'workshop', 'market', 'shrine']
    .forEach((id, i) => put(v, id, i, id === 'shrine' ? 3 : 2));
  v.stats.clean = 10;
  v.stats.bestStreak = 6;
  v.stats.spEarned = 400;
  v.stats.founded = true;
  assert.equal(nextGoal(v).id, 'festival'); // founding is not the end any more
  v.stats.festivals = 1;
  assert.ok(goalStates(v).every(g => g.done));
  assert.equal(nextGoal(v), null);
});

test('deriving goals never mutates the village', () => {
  const v = newVillage();
  const before = JSON.stringify(v);
  goalStates(v);
  nextGoal(v);
  assert.equal(JSON.stringify(v), before);
});
