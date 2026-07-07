// ============================================================================
// Village advisor — turns the current village blob into ONE concrete "do this
// next" hint, purely (no DOM, no stored state; a healed save re-derives the
// same advice). The rules are a prioritized ladder: while goals remain, the
// hint says HOW to reach the next rung (the goal chip says WHAT); once the
// ladder is complete the advisor drives the endless game — it points at the
// cheapest upgrade, since levels and yields grow forever.
// Every hint is { id, msg }: id for tests/telemetry, msg plain text built
// from the frozen tables (emoji are data, as everywhere else).
// ============================================================================
import { buildingById, RES_EMOJI } from './buildings.js';
import { isUnlocked, canAfford, shortfall, upgradeCost, FESTIVAL_COST, FESTIVAL_SOLVES } from './economy.js';
import { nextGoal } from './goals.js';

export const costText = cost => Object.entries(cost)
  .filter(([, n]) => n)
  .map(([k, n]) => k === 'sp' ? `${n} sp` : `${n} ${RES_EMOJI[k]}`)
  .join(' + ');

// The cheapest pending upgrade on the grid (by summed resource cost), with
// its cell so a view could point at it. Null on an empty grid.
export function cheapestUpgrade(village) {
  let best = null;
  for (let i = 0; i < village.grid.length; i++) {
    const cell = village.grid[i];
    if (!cell) continue;
    const def = buildingById(cell.id);
    if (!def) continue;
    const cost = upgradeCost(def, cell.level);
    const total = (cost.food || 0) + (cost.wood || 0) + (cost.coin || 0);
    if (!best || total < best.total) best = { cell: i, def, level: cell.level, cost, total };
  }
  return best;
}

export function nextHint(village) {
  const v = village;
  if (v.stats.solves === 0) {
    return { id: 'first-contract', msg: 'Take an Errand contract — reaching the answer on the beads mints your first sp.' };
  }
  const goal = nextGoal(v);
  if (goal) {
    const def = buildingById(goal.id);
    if (def) return buildHint(v, def);
    switch (goal.id) {
      case 'clean3': {
        const left = Math.max(1, 3 - v.stats.clean);
        return { id: 'clean3', msg: `Solve ${left} more contract${left > 1 ? 's' : ''} clean — no fumbles, and beat the pace floor.` };
      }
      case 'level2':
        return upgradeHint(v, 'level2', 'Levels multiply the daily yield.');
      case 'streak5':
        return { id: 'streak5', msg: `Best streak so far: ${v.stats.bestStreak}. Chain clean solves to 5 in a row — leave "keep contracts coming" on, and remember a fumble resets it.` };
      case 'sp250':
        return { id: 'sp250', msg: `Mint ${250 - v.stats.spEarned} more sp — harder tiers pay more, and a live streak adds up to +10 per solve.` };
      case 'found': {
        const shrine = v.grid.find(c => c && c.id === 'shrine');
        const cost = upgradeCost(buildingById('shrine'), shrine.level);
        const miss = shortfall(v, cost);
        return {
          id: 'found',
          msg: `Raise the shrine to level 3 to found the village — click it to take the upgrade contract` +
            (Object.keys(miss).length ? ` once you have ${costText(miss)} more.` : ` (${costText(cost)} on hand ✓).`),
        };
      }
      case 'festival':
        return festivalHint(v) ||
          { id: 'festival-save', msg: `Feast the village: a festival costs ${costText(FESTIVAL_COST)} — short ${costText(shortfall(v, FESTIVAL_COST))}.` };
    }
    // A goal this advisor doesn't know yet — fall through to endless advice.
  }
  // Endless mode: a festival is the best sp-per-solve move whenever the
  // feast is on hand; otherwise grow the cheapest building.
  return festivalHint(v) ||
    upgradeHint(v, 'endless', 'The ladder is complete — levels never stop, and yields scale with them.');
}

// "Light it now" — only when none is burning and the feast is affordable.
function festivalHint(v) {
  if (v.festival > 0 || !canAfford(v, FESTIVAL_COST)) return null;
  return { id: 'festival', msg: `Light a festival (${costText(FESTIVAL_COST)} on hand ✓) — +50% sp on every payout for the next ${FESTIVAL_SOLVES} solves.` };
}

// "Which building should I grow?" — shared by the level-2 rung and the
// endless late game.
function upgradeHint(v, id, why) {
  const up = cheapestUpgrade(v);
  if (!up) return { id: 'rebuild', msg: 'The grid is empty — build something first; contracts pay for the ground.' };
  const name = `${up.def.emoji} ${up.def.name} (L${up.level}→L${up.level + 1})`;
  const miss = shortfall(v, up.cost);
  return Object.keys(miss).length
    ? { id, msg: `${why} Cheapest next step: the ${name} for ${costText(up.cost)} — short ${costText(miss)}; every solved contract banks a day of yields.` }
    : { id, msg: `${why} Cheapest next step: click the ${name} — ${costText(up.cost)} on hand ✓.` };
}

// The next goal is a building: unlock it, afford it, or go earn.
function buildHint(v, def) {
  if (!isUnlocked(v, def)) {
    const need = buildingById(def.unlock.building);
    return { id: 'unlock', msg: `The ${def.emoji} ${def.name} unlocks after your first ${need.emoji} ${need.name.toLowerCase()} — build that first.` };
  }
  if (canAfford(v, def.cost)) {
    return { id: 'build', msg: `You can afford the ${def.emoji} ${def.name} (${costText(def.cost)}) — pick it under Build, then click an empty plot.` };
  }
  return { id: 'save', msg: `Next up: the ${def.emoji} ${def.name} costs ${costText(def.cost)} — short ${costText(shortfall(v, def.cost))}. Contracts mint sp, and each solve banks a day of yields.` };
}
