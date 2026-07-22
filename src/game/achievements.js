// ============================================================================
// Achievements — a frozen ladder of badges, modelled on goals.js: pure
// definitions with a progress(ctx) reducer, no DOM and no persistence of their
// own (achievementTracker.js owns the unlocked map + lifetime counters).
//
//   ctx = { village, counters }
//     village  — the current save blob (for state-based rungs: founded, rank)
//     counters — lifetime tallies kept by the tracker, which SURVIVE a raze
//                (so cumulative rungs keep climbing across a fresh village)
//   each rung: { id, emoji, title, desc, tier, progress(ctx) → {cur, target} }
//   done ≡ cur ≥ target. `tier` (bronze|silver|gold) only tints the panel.
//
// Both themes, per the brief: soroban mastery (clean, streak, speed, tiers) and
// village growth (sp, endless levels, buildings, festivals, rank).
// ============================================================================
import { BUILDINGS } from './buildings.js';
import { CHALLENGE_TIERS } from './challenges.js';
import { villageRank } from './rank.js';

const c = ctx => ctx.counters;
const TIER_COUNT = CHALLENGE_TIERS.length;
const BUILDING_COUNT = BUILDINGS.length;

// cumulative counter ≥ target
const count = (key, target) => ctx => ({ cur: c(ctx)[key] || 0, target });

export const ACHIEVEMENTS = Object.freeze([
  // ── First steps ──────────────────────────────────────────────────────────
  { id: 'first-solve', emoji: '🧮', title: 'First contract', tier: 'bronze',
    desc: 'Solve your first contract on the beads.', progress: count('solves', 1) },
  { id: 'first-build', emoji: '🛖', title: 'Break ground', tier: 'bronze',
    desc: 'Place your first building.', progress: count('placed', 1) },
  { id: 'first-upgrade', emoji: '⬆️', title: 'Level up', tier: 'bronze',
    desc: 'Raise a building a level.', progress: count('upgrades', 1) },
  { id: 'first-festival', emoji: '🏮', title: 'Lantern light', tier: 'bronze',
    desc: 'Light your first festival.', progress: count('festivals', 1) },
  { id: 'founded', emoji: '🎌', title: 'Village founded', tier: 'silver',
    desc: 'Raise a shrine to level 3.',
    progress: ctx => ({ cur: ctx.village?.stats?.founded ? 1 : 0, target: 1 }) },

  // ── Mastery ─────────────────────────────────────────────────────────────
  { id: 'clean-10', emoji: '✨', title: 'Steady hands', tier: 'bronze',
    desc: 'Land 10 clean solves.', progress: count('clean', 10) },
  { id: 'clean-50', emoji: '✨', title: 'Practised', tier: 'silver',
    desc: 'Land 50 clean solves.', progress: count('clean', 50) },
  { id: 'clean-250', emoji: '✨', title: 'Bead master', tier: 'gold',
    desc: 'Land 250 clean solves.', progress: count('clean', 250) },
  { id: 'streak-5', emoji: '🔥', title: 'On a roll', tier: 'bronze',
    desc: 'Hold a 5-clean streak.', progress: count('bestStreak', 5) },
  { id: 'streak-10', emoji: '🔥', title: 'Unbroken', tier: 'silver',
    desc: 'Hold a 10-clean streak.', progress: count('bestStreak', 10) },
  { id: 'streak-25', emoji: '🔥', title: 'Flawless run', tier: 'gold',
    desc: 'Hold a 25-clean streak.', progress: count('bestStreak', 25) },
  { id: 'fast-25', emoji: '⚡', title: 'Quick hands', tier: 'silver',
    desc: 'Beat the pace floor 25 times.', progress: count('fast', 25) },
  { id: 'tax-solve', emoji: '🧾', title: 'Tax season', tier: 'silver',
    desc: 'Solve a Tax-season (division) contract.',
    progress: ctx => ({ cur: c(ctx).tiersSolved?.tax ? 1 : 0, target: 1 }) },
  { id: 'all-tiers', emoji: '📜', title: 'Every contract', tier: 'gold',
    desc: 'Solve at least one of every contract tier.',
    progress: ctx => ({ cur: Object.keys(c(ctx).tiersSolved || {}).length, target: TIER_COUNT }) },

  // ── Village & the endless climb ───────────────────────────────────────────
  { id: 'sp-500', emoji: '🪙', title: 'Full coffers', tier: 'bronze',
    desc: 'Mint 500 sp all-time.', progress: count('earnSp', 500) },
  { id: 'sp-5000', emoji: '🪙', title: 'Rich village', tier: 'gold',
    desc: 'Mint 5,000 sp all-time.', progress: count('earnSp', 5000) },
  { id: 'level-10', emoji: '🏗️', title: 'Tall order', tier: 'silver',
    desc: 'Raise any building to level 10.', progress: count('maxLevel', 10) },
  { id: 'level-25', emoji: '🏛️', title: 'Landmark', tier: 'gold',
    desc: 'Raise any building to level 25.', progress: count('maxLevel', 25) },
  { id: 'level-50', emoji: '🗼', title: 'Endless spire', tier: 'gold',
    desc: 'Raise any building to level 50 — levels never cap.', progress: count('maxLevel', 50) },
  { id: 'all-buildings', emoji: '🏘️', title: 'Master builder', tier: 'gold',
    desc: 'Place one of every kind of building.',
    progress: ctx => ({ cur: Object.keys(c(ctx).placedTypes || {}).length, target: BUILDING_COUNT }) },
  { id: 'festivals-10', emoji: '🎆', title: 'Festival season', tier: 'silver',
    desc: 'Light 10 festivals.', progress: count('festivals', 10) },
  { id: 'rank-5', emoji: '🏙️', title: 'Boomtown', tier: 'silver',
    desc: 'Reach Village Rank 5.',
    progress: ctx => ({ cur: villageRank(ctx.village).n, target: 5 }) },
  { id: 'rank-10', emoji: '🌆', title: 'Great city', tier: 'gold',
    desc: 'Reach Village Rank 10.',
    progress: ctx => ({ cur: villageRank(ctx.village).n, target: 10 }) },
  { id: 'rank-25', emoji: '🌇', title: 'Metropolis', tier: 'gold',
    desc: 'Reach Village Rank 25.',
    progress: ctx => ({ cur: villageRank(ctx.village).n, target: 25 }) },
].map(Object.freeze));

// Every rung with its live progress + done flag, in ladder order (goalStates
// analogue). `done` here is the LIVE predicate; the tracker overrides it with
// the persisted unlock so an earned badge never regresses (e.g. after a raze).
export const achievementStates = ctx =>
  ACHIEVEMENTS.map(a => {
    const { cur, target } = a.progress(ctx);
    return { id: a.id, emoji: a.emoji, title: a.title, desc: a.desc, tier: a.tier,
      cur: Math.min(cur, target), target, done: cur >= target };
  });
