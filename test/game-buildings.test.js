import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, buildingById, GRID_COLS, GRID_ROWS, GRID_CELLS, FOUNDING_LEVEL, RES_EMOJI } from '../src/game/buildings.js';

test('grid geometry constants', () => {
  assert.equal(GRID_COLS, 9);
  assert.equal(GRID_ROWS, 6);
  assert.equal(GRID_CELLS, 54);
  assert.equal(FOUNDING_LEVEL, 3);
});

test('the resource glyph table is frozen and covers every resource key', () => {
  assert.ok(Object.isFrozen(RES_EMOJI));
  assert.deepEqual(Object.keys(RES_EMOJI).sort(), ['coin', 'food', 'sp', 'wood']);
  for (const k of Object.keys(RES_EMOJI)) assert.ok(RES_EMOJI[k]);
});

test('building ids are unique', () => {
  const ids = BUILDINGS.map(b => b.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every building carries its full contract: emoji, name, tier, cost, yield, desc', () => {
  for (const b of BUILDINGS) {
    assert.ok(b.emoji, b.id);
    assert.ok(b.name, b.id);
    assert.ok(Number.isInteger(b.tier) && b.tier >= 1, b.id);
    assert.ok(Number.isInteger(b.cost.sp) && b.cost.sp > 0, `${b.id} must cost sp`);
    assert.ok(b.yield && typeof b.yield === 'object', b.id);
    assert.ok(b.desc, b.id);
  }
});

test('unlock requirements reference existing buildings', () => {
  for (const b of BUILDINGS) {
    if (b.unlock.building) assert.ok(buildingById(b.unlock.building), `${b.id} unlock ref`);
  }
});

test('cost and yield bags use only known resource keys', () => {
  const KEYS = new Set(['sp', 'food', 'wood', 'coin']);
  for (const b of BUILDINGS) {
    for (const k of Object.keys(b.cost)) assert.ok(KEYS.has(k), `${b.id} cost.${k}`);
    for (const k of Object.keys(b.yield)) assert.ok(KEYS.has(k), `${b.id} yield.${k}`);
  }
});

test('the tables are frozen contracts', () => {
  assert.ok(Object.isFrozen(BUILDINGS));
  for (const b of BUILDINGS) {
    assert.ok(Object.isFrozen(b), b.id);
    assert.ok(Object.isFrozen(b.cost) && Object.isFrozen(b.yield) && Object.isFrozen(b.unlock), b.id);
  }
  assert.throws(() => { BUILDINGS[0].cost.sp = 999; });
});

test('buildingById finds each building and misses unknowns', () => {
  for (const b of BUILDINGS) assert.equal(buildingById(b.id), b);
  assert.equal(buildingById('castle'), null);
});
