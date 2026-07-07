// ============================================================================
// Village economy — pure functions over a plain village object, no DOM, no
// globals. The village is the single save blob (see saveStore.js):
//   { v, sp, res: {food, wood, coin}, day, festival,
//     grid: [null | {id, level}] × 54,
//     stats: {solves, clean, spEarned, bestPayout, streak, bestStreak,
//             festivals, founded} }
// stats.streak = consecutive clean solves right now (any contract kind);
// stats.bestStreak = the best it has ever been (feeds the goal ladder).
// festival = village days of festival remaining (the late-game resource sink:
// a lit festival multiplies contract payouts and burns down one day per
// solve); stats.festivals counts how many were ever lit.
// Costs and yields are plain {sp?, food?, wood?, coin?} bags; sp lives on the
// village root (it's the primary currency), the rest under res.
//
// Time is discrete: one village day passes per SOLVED contract (advanceDay is
// called by GameSession._solve), so the whole economy is deterministic and
// testable — no wall clock, no idle accrual.
// ============================================================================
import { buildingById, GRID_CELLS } from './buildings.js';

export function newVillage() {
  return {
    v: 1,
    sp: 20,
    res: { food: 0, wood: 0, coin: 0 },
    day: 1,
    festival: 0,
    grid: Array(GRID_CELLS).fill(null),
    stats: { solves: 0, clean: 0, spEarned: 0, bestPayout: 0, streak: 0, bestStreak: 0, festivals: 0, founded: false },
  };
}

// The festival — the standing resource sink. Lighting one costs a feast's
// worth of everything and multiplies contract payouts (+50%, on top of the
// shrine blessing) for the next FESTIVAL_SOLVES village days.
export const FESTIVAL_COST = Object.freeze({ food: 150, wood: 50, coin: 100 });
export const FESTIVAL_SOLVES = 10;
export const FESTIVAL_BONUS = 0.5;
export const festivalBonus = village => village.festival > 0 ? FESTIVAL_BONUS : 0;

// How many of each building stand, regardless of level.
export function counts(village) {
  const c = {};
  for (const cell of village.grid) if (cell) c[cell.id] = (c[cell.id] || 0) + 1;
  return c;
}

export function isUnlocked(village, def) {
  return !def.unlock.building || (counts(village)[def.unlock.building] || 0) >= 1;
}

export function canAfford(village, cost) {
  if ((cost.sp || 0) > village.sp) return false;
  for (const k of ['food', 'wood', 'coin']) if ((cost[k] || 0) > village.res[k]) return false;
  return true;
}

// What is still missing to afford a cost — {} when affordable. Feeds hints.
export function shortfall(village, cost) {
  const s = {};
  if ((cost.sp || 0) > village.sp) s.sp = cost.sp - village.sp;
  for (const k of ['food', 'wood', 'coin']) {
    if ((cost[k] || 0) > village.res[k]) s[k] = cost[k] - village.res[k];
  }
  return s;
}

export function spend(village, cost) {
  village.sp -= cost.sp || 0;
  for (const k of ['food', 'wood', 'coin']) village.res[k] -= cost[k] || 0;
}

export function refund(village, cost) {
  village.sp += cost.sp || 0;
  for (const k of ['food', 'wood', 'coin']) village.res[k] += cost[k] || 0;
}

export function canPlace(village, def, cellIdx) {
  if (!Number.isInteger(cellIdx) || cellIdx < 0 || cellIdx >= GRID_CELLS) return { ok: false, reason: 'range' };
  if (village.grid[cellIdx]) return { ok: false, reason: 'occupied' };
  if (!isUnlocked(village, def)) return { ok: false, reason: 'locked' };
  if (!canAfford(village, def.cost)) return { ok: false, reason: 'cost' };
  return { ok: true };
}

// Caller checks canPlace first (GameSession does).
export function place(village, def, cellIdx) {
  spend(village, def.cost);
  village.grid[cellIdx] = { id: def.id, level: 1 };
}

// One day's production: Σ (yield × level) over the grid, plus the well aura —
// while at least one well stands, every farm grows +1 food (once per farm,
// independent of levels).
export function dailyYield(village) {
  const y = { sp: 0, food: 0, wood: 0, coin: 0 };
  let farms = 0, hasWell = false;
  for (const cell of village.grid) {
    if (!cell) continue;
    const def = buildingById(cell.id);
    if (!def) continue;
    if (def.id === 'farm') farms++;
    if (def.id === 'well') hasWell = true;
    for (const k of Object.keys(def.yield)) y[k] += def.yield[k] * cell.level;
  }
  if (hasWell) y.food += farms;
  return y;
}

// Apply a day: bank the yields, advance the calendar, burn a festival day.
// Returns the yields so the caller can narrate/animate them.
export function advanceDay(village) {
  const y = dailyYield(village);
  village.res.food += y.food;
  village.res.wood += y.wood;
  village.res.coin += y.coin;
  village.sp += y.sp;
  village.day++;
  if (village.festival > 0) village.festival--;
  return y;
}

// Shrine blessing on contract payouts: +10% per shrine level, capped at +30%.
export function shrineBonus(village) {
  let levels = 0;
  for (const cell of village.grid) if (cell && cell.id === 'shrine') levels += cell.level;
  return Math.min(0.3, levels * 0.1);
}

// Upgrading costs resources (not sp — sp buys new ground; growth is fed by the
// village itself) and scales with the building's tier and level, forever:
// yields grow ×level and the cost grows linearly with it, so every upgrade
// pays back in about the same number of village days. Level 1→2 and 2→3 are
// exactly the pre-endless values, so old saves feel no seam.
export function upgradeCost(def, level) {
  const t = def.tier;
  const cost = { food: 5 * t * level, wood: 5 * t * level };
  if (level >= 2) cost.coin = 5 * t * (level - 1);
  return cost;
}
