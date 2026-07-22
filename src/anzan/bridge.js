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
