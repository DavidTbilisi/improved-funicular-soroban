// ============================================================================
// The prognosis → anzan bridge.
//
// Two tracks in this app were forecasting toward each other and never met.
// prognosis.js estimates when the learner can drop the beads and work on
// imagined rods; flash anzan is the place that skill is actually spent. But the
// practice page's runway simply ended at "Mental" — a station with nothing
// beyond it — and the anzan page had no idea which of its nine rungs suited
// someone who had just got there. This module is the join: given where the
// learner is on the practice ladder and what they have carried in anzan, it
// names ONE rung to go do.
//
// It lives in src/anzan/ rather than src/tutorial/ on purpose. prognosis.js is
// pure and dependency-free and should stay that way — knowing which anzan rung
// suits which level is anzan's business, not the forecaster's. The map below is
// data, so this module needs no import from the tutorial layer either; it takes
// a level id and a rung state and returns a suggestion.
//
// Pure — no DOM, no storage, no clock. Unit-tested in test/anzanBridge.test.js.
// ============================================================================
import { ANZAN_LEVELS } from './levels.js';

// Which anzan rung matches the arithmetic a practice level has just taught.
// The shape follows the ladder's own logic: single-digit levels are ones-rod
// work, so they map to 1-digit rungs; carries need more terms before they bite;
// multi-digit work maps to 2-digit terms.
export const LEVEL_RUNG = Object.freeze({
  read: 'warm',
  direct: 'warm',
  'small-add': 'warm',
  'small-sub': 'warm',
  'big-add': 'five1',    // carries only bite once the ones rod overflows
  'big-sub': 'five1',
  compound: 'ten1',      // nested trades need a long enough run to appear
  multi: 'three2',       // multi-digit on the board → multi-digit in the air
  mult: 'five2',
  square: 'five2',
  divide: 'ten2',
});

const rungIndex = id => ANZAN_LEVELS.findIndex(l => l.id === id);

/**
 * Has the learner earned the suggestion yet? At Beads the board is still fully
 * up and Mental is two stages away — pointing at anzan there is pointing at the
 * exam before the course. So: anyone already AT Mental, or anyone at Percept
 * whose readiness says they may drop to Mental now.
 */
export function readyForAnzan({ support = 0, prognosis = {} } = {}) {
  if (support >= 2) return true;
  return support >= 1 && !!prognosis.ready && !!prognosis.enoughData;
}

/**
 * WHICH rung, ignoring whether it has been earned. Split out from suggestRung so
 * the Today plan can apply its own (more permissive) gate — someone already
 * doing anzan keeps being offered it even at Beads — while still agreeing with
 * the practice page about which rung. One source of truth for the choice.
 *
 * @param levelId the practice level in hand (null → start at the bottom rung)
 * @param rungs   [{ id, cleared, fastest }] in ladder order
 * @returns { id, title, terms, digits, baseMs, floor, kind, why }
 *          kind: 'start' (never carried, at your shape)
 *              | 'next'  (your shape is carried; here is the next rung)
 *              | 'push'  (everything from here up is carried — push the pace)
 */
export function pickRung({ levelId = null, rungs = [] } = {}) {
  if (!ANZAN_LEVELS.length) return null;
  const state = new Map(rungs.map(r => [r.id, r]));
  const cleared = id => !!(state.get(id) || {}).cleared;

  // Start at the rung matching the level in hand; an unmapped or missing level
  // starts at the bottom, which is the honest default for "I don't know yet".
  const floor = Math.max(0, rungIndex(LEVEL_RUNG[levelId] || ANZAN_LEVELS[0].id));

  // The first rung at or above that floor they have not yet carried.
  let idx = -1;
  for (let i = floor; i < ANZAN_LEVELS.length; i++) {
    if (!cleared(ANZAN_LEVELS[i].id)) { idx = i; break; }
  }

  // Everything from their shape upward is carried — the ladder has nothing
  // harder to offer, so the remaining axis is speed.
  if (idx === -1) {
    const last = ANZAN_LEVELS[ANZAN_LEVELS.length - 1];
    const rec = (state.get(last.id) || {}).fastest;
    return {
      ...pick(last), kind: 'push',
      why: rec ? `every rung carried — push ${last.title} below ${rec} ms` : 'every rung carried — push the pace',
    };
  }

  const l = ANZAN_LEVELS[idx];
  const kind = idx > floor ? 'next' : 'start';
  return {
    ...pick(l), kind,
    why: kind === 'next'
      ? 'your shape is carried — this is the next rung'
      : 'your level\u2019s shape, blind and on the clock',
  };
}

/**
 * The gated form: null until the mnemonic-mental track says the beads can go.
 * This is what the practice page's prognosis uses.
 */
export function suggestRung({ levelId = null, support = 0, prognosis = {}, rungs = [] } = {}) {
  if (!readyForAnzan({ support, prognosis })) return null;
  return pickRung({ levelId, rungs });
}

const pick = l => ({ id: l.id, title: l.title, terms: l.terms, digits: l.digits, baseMs: l.baseMs, floor: l.floor });

// ============================================================================
// The reverse direction: a stalling rung → the board work that fixes it.
//
// ONE HONESTY CONSTRAINT SHAPES ALL OF THIS. The fault log records rejected
// moves on a BOARD — practice, trainer, village. Flash anzan has no board, so
// an anzan miss produces no fault entry and the log can never say what caused
// one. Anything claiming "this miss was your 3↔7 trade" would be invented.
//
// What can be said honestly is a different, weaker, still-useful sentence: this
// rung leans on a particular family of trades, AND your board record already
// shows which pair in that family you fumble. That is a standing weakness the
// rung happens to exercise — evidence gathered elsewhere, not a diagnosis of
// the miss. The wording below is chosen to claim exactly that and no more.
//
// The candidate levels come from inverting LEVEL_RUNG, so the two directions
// cannot drift apart and no second mapping has to be maintained.
// ============================================================================

const MIN_ROUNDS = 5;    // fewer than this and "stalling" is just noise
const STALL = 0.6;       // correct share below which a rung reads as stalled
const PAIR_FLOOR = 3;    // fumbles on a pair below this are noise, not a pattern

// rungId → the practice levels that map to it (LEVEL_RUNG, inverted).
export const RUNG_LEVELS = Object.freeze(
  Object.entries(LEVEL_RUNG).reduce((acc, [levelId, rungId]) => {
    (acc[rungId] = acc[rungId] || []).push(levelId);
    return acc;
  }, {}));

// A rung is stalling when there is enough evidence AND the evidence is bad.
export function isStalling({ rounds = 0, accuracy = null } = {}) {
  return rounds >= MIN_ROUNDS && accuracy !== null && accuracy < STALL;
}

/**
 * @param rungId   the rung in hand
 * @param rounds   how many rounds are on record for it
 * @param accuracy its recent correct share (0..1), or null
 * @param faults   fumbleRows(counts) output: [{ key: 'big:3-7', label, count }]
 * @param levels   practice level state: [{ id, title, unlocked, cleared }]
 * @returns { levelId, title, pair, pairLabel, count, why } | null
 */
export function diagnoseRung({ rungId, rounds = 0, accuracy = null, faults = [], levels = [] } = {}) {
  if (!isStalling({ rounds, accuracy })) return null;

  const byId = new Map(levels.map(l => [l.id, l]));
  // The practice ladder stops mapping part-way up the anzan ladder — nothing
  // maps to the 3-digit rungs, because the board levels run out first. So walk
  // DOWN to the nearest rung that does have levels: the arithmetic a 3-digit
  // round leans on is the 2-digit arithmetic, just with a third rod along.
  let candidates = [];
  for (let i = Math.max(0, rungIndex(rungId)); i >= 0; i--) {
    const ids = RUNG_LEVELS[ANZAN_LEVELS[i].id] || [];
    candidates = ids.map(id => byId.get(id)).filter(l => l && l.unlocked !== false);
    if (candidates.length) break;
  }
  if (!candidates.length) return null;

  // The learner's worst fumbled pair that one of these levels actually drills.
  const ranked = [...faults].filter(f => f.count >= PAIR_FLOOR).sort((a, b) => b.count - a.count);
  for (const f of ranked) {
    const family = String(f.key).split(':')[0];             // 'small' | 'big'
    const hit = candidates.find(l => l.id.startsWith(family));
    if (!hit) continue;
    const pairLabel = String(f.label || '').split(' · ')[0]; // '3 ↔ 7'
    return {
      levelId: hit.id, title: hit.title, pair: f.key, pairLabel, count: f.count,
      // Deliberately "the trades this rung leans on", not "the cause of your miss".
      why: `this rung leans on the ${family === 'small' ? 'five' : 'ten'}-trades, and your board record fumbles ${pairLabel} ${f.count}×`,
    };
  }

  // Nothing this rung drills is in the fault record. Two different situations,
  // and conflating them would misreport one of them: no pattern at all, versus
  // a pattern in trades this rung does not lean on.
  const hit = candidates.find(l => !l.cleared) || candidates[candidates.length - 1];
  return {
    levelId: hit.id, title: hit.title, pair: null, pairLabel: null, count: 0,
    why: ranked.length
      ? 'drop back to the board for this shape — your fumbles are on trades this rung does not lean on'
      : 'drop back to the board for this shape — no fumble pattern on record to point at',
  };
}
