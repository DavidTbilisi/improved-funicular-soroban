// ============================================================================
// Village goals — a fixed ladder of milestones derived PURELY from the village
// blob (nothing is stored; a healed or edited save re-derives the same list).
// The ladder gives the one-screen HUD a single "next goal" hint instead of a
// tutorial: each rung nudges toward the unlock chain (hut → farm → well →
// woodcutter → workshop → market → shrine) with practice rungs woven in.
// ============================================================================
import { counts } from './economy.js';

const has = id => v => (counts(v)[id] || 0) >= 1;

export const GOALS = Object.freeze([
  { id: 'hut', emoji: '🛖', label: 'Build a hut', done: has('hut') },
  { id: 'farm', emoji: '🌾', label: 'Plant a farm', done: has('farm') },
  { id: 'clean3', emoji: '✨', label: 'Make 3 clean solves', done: v => v.stats.clean >= 3 },
  { id: 'well', emoji: '💧', label: 'Dig a well', done: has('well') },
  { id: 'woodcutter', emoji: '🪓', label: 'Hire a woodcutter', done: has('woodcutter') },
  { id: 'level2', emoji: '⬆️', label: 'Raise any building to level 2', done: v => v.grid.some(c => c && c.level >= 2) },
  { id: 'workshop', emoji: '🏭', label: 'Open a workshop', done: has('workshop') },
  { id: 'streak5', emoji: '🔥', label: 'Hold a 5-clean streak', done: v => v.stats.bestStreak >= 5 },
  { id: 'market', emoji: '🏪', label: 'Open a market', done: has('market') },
  { id: 'sp250', emoji: '🧮', label: 'Mint 250 sp all-time', done: v => v.stats.spEarned >= 250 },
  { id: 'shrine', emoji: '⛩️', label: 'Raise a shrine', done: has('shrine') },
  { id: 'found', emoji: '🎌', label: 'Shrine to level 3 — found the village', done: v => v.stats.founded },
  { id: 'festival', emoji: '🏮', label: 'Light a festival', done: v => v.stats.festivals >= 1 },
].map(Object.freeze));

// Every rung with its done flag, in ladder order.
export const goalStates = village =>
  GOALS.map(({ id, emoji, label, done }) => ({ id, emoji, label, done: done(village) }));

// The first undone rung, or null once the ladder is complete.
export const nextGoal = village => goalStates(village).find(g => !g.done) || null;
