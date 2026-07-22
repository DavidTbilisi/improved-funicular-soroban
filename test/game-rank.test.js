import { test } from 'node:test';
import assert from 'node:assert/strict';
import { villageRank, rankTitle, totalLevels, SP_PER_POINT } from '../src/game/rank.js';
import { newVillage } from '../src/game/economy.js';

// A village with a given sp-minted history and grid levels — the two inputs to
// the rank score (Σ levels + ⌊spEarned / SP_PER_POINT⌋).
const V = (spEarned = 0, levels = []) => {
  const v = newVillage();
  v.stats.spEarned = spEarned;
  levels.forEach((lvl, i) => { v.grid[i] = { id: 'hut', level: lvl }; });
  return v;
};

test('a fresh village is rank 0 — a Camp', () => {
  const r = villageRank(newVillage());
  assert.equal(r.n, 0);
  assert.equal(r.title, 'Camp');
  assert.equal(r.score, 0);
  assert.equal(r.cur, 0);
});

test('thresholds follow n·(n+2): 3→1, 8→2, 15→3, 35→5', () => {
  // Pure sp score: ⌊spEarned/50⌋ with no buildings.
  assert.equal(villageRank(V(50 * 3)).n, 1);   // score 3
  assert.equal(villageRank(V(50 * 8)).n, 2);   // score 8
  assert.equal(villageRank(V(50 * 15)).n, 3);  // score 15
  assert.equal(villageRank(V(50 * 35)).n, 5);  // score 35 = 5·7
  assert.equal(villageRank(V(50 * 34)).n, 4);  // just under → still 4
});

test('score blends building levels and sp', () => {
  const r = villageRank(V(500, [2, 3])); // ⌊500/50⌋=10 + (2+3)=5 → score 15
  assert.equal(r.score, 15);
  assert.equal(r.n, 3);
});

test('cur/next describe the bar to the next rank', () => {
  const at = villageRank(V(50 * 35));      // exactly at rank 5
  assert.equal(at.cur, 0);
  assert.equal(at.next, 2 * 5 + 3);        // 13 to reach rank 6
  const past = villageRank(V(50 * 36));     // score 36, one into the rung
  assert.equal(past.n, 5);
  assert.equal(past.cur, 1);
  assert.equal(past.next, 13);
});

test('rank is monotonic in score and never caps', () => {
  let prev = -1;
  for (let sp = 0; sp <= 50 * 700; sp += 50 * 7) {
    const n = villageRank(V(sp)).n;
    assert.ok(n >= prev, `rank should not drop: ${n} < ${prev}`);
    prev = n;
  }
  // Past the named tiers the top name keeps ascending with a numeral.
  assert.equal(rankTitle(0), 'Camp');
  assert.equal(rankTitle(9), 'Megalopolis');
  assert.equal(rankTitle(10), 'Megalopolis 2');
  assert.equal(rankTitle(12), 'Megalopolis 4');
});

test('totalLevels sums grid levels; SP_PER_POINT is the sp divisor', () => {
  assert.equal(totalLevels(V(0, [1, 4, 2])), 7);
  assert.equal(SP_PER_POINT, 50);
});

test('villageRank does not mutate the village (pure derivation)', () => {
  const v = V(1234, [3, 5]);
  const before = JSON.stringify(v);
  villageRank(v);
  assert.equal(JSON.stringify(v), before);
});
