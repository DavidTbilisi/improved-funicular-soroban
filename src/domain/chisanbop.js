// ============================================================================
// Chisanbop — the soroban on two hands. Pure logic, no DOM.
//
// A hand IS a rod (`src/domain/rod.js`): the thumb is the 5-bead (sky), the
// four fingers are the earth beads, so one hand shows 0..9 and value =
// (thumb ? 5 : 0) + fingers. Two hands make a place-value number 0..99 — the
// right hand the ones, the left hand the tens.
//
// Because the hand is derived from `digitToRod` and every move is flattened by
// `planAdd`/`planSub`, the complement rules practised here (direct / small
// friend / big friend) are literally the same engine that drives the board —
// this is the away-from-the-abacus rung of the Beads→Percept→Mental ladder, a
// place to drill the 5-complement and 10-carry with nothing but your hands.
//
// Pressing a finger DOWN onto the table adds (+); lifting it OFF subtracts (−).
// A `+5`/`−5` step is the thumb; a `±n` (n=1..4) step is n fingers; a `±10`
// step is the carry/borrow — one press/lift on the *tens* hand. (The two-hand
// world tops out at 99, so an in-range problem's carry never overflows the tens
// hand; a fuller carry chain would be a separate per-rod plan.)
// ============================================================================
import { digitToRod, rodValue } from './rod.js';
import { planAdd, planSub } from './movePlan.js';

// --- Representation ----------------------------------------------------------

// Digit 0..9 → hand state. Mirrors `digitToRod` so a hand and a rod can never
// disagree about how a digit splits into a 5 plus units.
export function handOf(d) {
  if (d < 0 || d > 9) throw new Error(`handOf needs 0..9, got ${d}`);
  const rod = digitToRod(d);
  return { thumb: rod.sky, fingers: rod.earth };
}

export const handValue = h => (h.thumb ? 5 : 0) + h.fingers;

// A whole two-hand number 0..99: { tens, ones } hands plus its value.
export function handsOf(n) {
  if (!Number.isInteger(n) || n < 0 || n > 99)
    throw new Error(`handsOf needs an integer 0..99, got ${n}`);
  return { tens: handOf(Math.floor(n / 10)), ones: handOf(n % 10), value: n };
}

// --- Glyphs ------------------------------------------------------------------
// Pressed = active = contributes to the value (like ● in the finger plates).
// The thumb gets its own glyph so it reads as the 5-bead, not a sixth finger.
// The two hands mirror like real hands held toward you: the ones hand keeps its
// thumb inboard (leftmost), the tens hand mirrors it (thumb rightmost), so a
// glyph pair reads left-to-right as tens then ones.
const THUMB = { on: '◆', off: '◇' };
const FINGER = { on: '●', off: '○' };

export const handGlyph = h =>          // ones hand: thumb ● fingers
  (h.thumb ? THUMB.on : THUMB.off) + FINGER.on.repeat(h.fingers) + FINGER.off.repeat(4 - h.fingers);

export const handGlyphL = h =>         // tens hand: mirrored, thumb outboard
  FINGER.off.repeat(4 - h.fingers) + FINGER.on.repeat(h.fingers) + (h.thumb ? THUMB.on : THUMB.off);

// A whole number as a mirrored hand pair, e.g. 27 → '○○●●◆ ◆●●○○'.
export function numberGlyph(n) {
  const h = handsOf(n);
  return `${handGlyphL(h.tens)} ${handGlyph(h.ones)}`;
}

// --- Move mapping ------------------------------------------------------------

// One primitive board step ('+5', '−3', '+10', …) as a finger action.
export function actionFor(step) {
  const dir = step[0] === '+' ? 'press' : 'lift';
  const mag = Number(step.slice(1));
  if (mag === 10) {
    const word = dir === 'press' ? 'carry' : 'borrow';
    return { step, hand: 'tens', part: 'carry', dir, count: 1,
      text: `${word}: ${dir} 1 on the tens hand` };
  }
  if (mag === 5)
    return { step, hand: 'ones', part: 'thumb', dir, count: 1, text: `${dir} the thumb` };
  return { step, hand: 'ones', part: 'fingers', dir, count: mag,
    text: `${dir} ${mag} finger${mag > 1 ? 's' : ''}` };
}

// The signed value an action moves (thumb = 5, carry = 10, else the count),
// press positive / lift negative — the inverse of `actionFor`, used to prove
// the actions net to the operand.
export const actionValue = a =>
  (a.dir === 'press' ? 1 : -1) * (a.part === 'thumb' ? 5 : a.part === 'carry' ? 10 : a.count);

// Add digit d (1..9) onto ones-hand digit c (0..9) as a chisanbop press chain.
// Reuses `planAdd`, so `rule`/`story` are the board's — we only re-skin the
// flattened `steps` as finger actions and report where the ones hand lands.
export function chisanbopAdd(c, d) {
  const plan = planAdd(c, d);
  const ones = (c + d) % 10;
  return {
    from: c, op: `+${d}`, rule: plan.rule, story: plan.story,
    actions: plan.steps.map(actionFor),
    carry: (c + d >= 10) ? 1 : 0, ones, endHand: handOf(ones),
  };
}

// Subtract digit d (1..9) from ones-hand digit c (0..9).
export function chisanbopSub(c, d) {
  const plan = planSub(c, d);
  const ones = ((c - d) % 10 + 10) % 10;
  return {
    from: c, op: `-${d}`, rule: plan.rule, story: plan.story,
    actions: plan.steps.map(actionFor),
    borrow: (c - d < 0) ? 1 : 0, ones, endHand: handOf(ones),
  };
}

// Reveal narration: the starting hand, the actions in order, the landing hand —
// the chisanbop sibling of `fingerStory`.
export function chisanbopStory(c, sign, d) {
  const m = sign === '-' ? chisanbopSub(c, d) : chisanbopAdd(c, d);
  const acts = m.actions.map(a => a.text).join(', ');
  return `${handGlyph(handOf(c))} ${sign}${d} → ${acts} → ${handGlyph(m.endHand)}`;
}
