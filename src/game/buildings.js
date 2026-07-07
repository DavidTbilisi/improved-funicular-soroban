// ============================================================================
// Village buildings — frozen data tables only (same contract style as the peg
// tables in src/domain/pegs.js: emoji are load-bearing data, not decoration).
// Each building is { id, emoji, name, tier, cost, yield, unlock, desc }:
//   cost   — what placing level 1 takes ({ sp, food?, wood?, coin? })
//   yield  — what one building produces per village day, × its level
//   unlock — { building: id } means "at least one of that building exists";
//            {} means always available
//   tier   — drives upgrade costs and which contract tier an upgrade demands
// The well's farm aura and the shrine's payout bonus are behaviors, so they
// live in economy.js — the table only carries data.
// ============================================================================
export const GRID_COLS = 9;
export const GRID_ROWS = 6;
export const GRID_CELLS = GRID_COLS * GRID_ROWS; // cellIdx = row * GRID_COLS + col
export const MAX_LEVEL = 3;

export const BUILDINGS = Object.freeze([
  Object.freeze({
    id: 'hut', emoji: '🛖', name: 'Hut', tier: 1,
    cost: Object.freeze({ sp: 10 }), yield: Object.freeze({ coin: 1 }),
    unlock: Object.freeze({}), desc: 'Villagers pay a coin of rent each day.',
  }),
  Object.freeze({
    id: 'farm', emoji: '🌾', name: 'Farm', tier: 1,
    cost: Object.freeze({ sp: 15 }), yield: Object.freeze({ food: 2 }),
    unlock: Object.freeze({}), desc: 'Grows food every day.',
  }),
  Object.freeze({
    id: 'well', emoji: '💧', name: 'Well', tier: 1,
    cost: Object.freeze({ sp: 20 }), yield: Object.freeze({ food: 1 }),
    unlock: Object.freeze({ building: 'farm' }),
    desc: 'A little food itself — and while a well stands, every farm grows +1 food a day.',
  }),
  Object.freeze({
    id: 'woodcutter', emoji: '🪓', name: 'Woodcutter', tier: 2,
    cost: Object.freeze({ sp: 25, food: 5 }), yield: Object.freeze({ wood: 2 }),
    unlock: Object.freeze({ building: 'farm' }), desc: 'Fells timber for bigger works.',
  }),
  Object.freeze({
    id: 'workshop', emoji: '🏭', name: 'Workshop', tier: 3,
    cost: Object.freeze({ sp: 40, wood: 10 }), yield: Object.freeze({ coin: 3 }),
    unlock: Object.freeze({ building: 'woodcutter' }), desc: 'Turns timber into steady coin.',
  }),
  Object.freeze({
    id: 'market', emoji: '🏪', name: 'Market', tier: 4,
    cost: Object.freeze({ sp: 60, wood: 15, food: 10 }), yield: Object.freeze({ coin: 2, sp: 1 }),
    unlock: Object.freeze({ building: 'workshop' }),
    desc: 'Trade brings coin — and even a trickle of soroban points.',
  }),
  Object.freeze({
    id: 'shrine', emoji: '⛩️', name: 'Shrine', tier: 5,
    cost: Object.freeze({ sp: 100, coin: 20 }), yield: Object.freeze({}),
    unlock: Object.freeze({ building: 'market' }),
    desc: 'Each shrine level blesses contracts: +10% sp payout (village cap +30%). Level 3 founds the village.',
  }),
]);

export const buildingById = id => BUILDINGS.find(b => b.id === id) || null;
