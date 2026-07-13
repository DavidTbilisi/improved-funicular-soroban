// ============================================================================
// Move planner — flattens any digit add/subtract into the exact chain of
// single-key bead moves, however deep the trades nest. `classifyAdd`/
// `classifySub` answer one level ("+7 = +10 −3"); this module keeps asking the
// same local question of each payback until every token is one physical move:
//
//   planAdd(6, 7) → { rule: 'big', steps: ['+10','-5','+2'],
//                     story: [ {op:'+7', rule:'big',   into:'+10 -3'},
//                              {op:'-3', rule:'small', into:'-5 +2'} ] }
//
// `steps` net to ±d (the ±10 being the carry/borrow on the next rod) and each
// is legal at the moment it is applied — invariants checked in tests. `story`
// records one row per trade, so a hint can narrate WHY the chain unrolls; a
// nested (compound) trade is simply story.length > 1. The nesting never goes
// deeper: a big trade's payback can at worst need a small trade (proved by the
// exhaustive test), so a chain is at most three keys.
// ============================================================================
import { classifyAdd, classifySub } from './soroban.js';

// Keyboard for each primitive move — mirrors the board-shell die-cross layout
// (right hand adds, left hand mirrors it for subtraction): center 1, left 2,
// top 3, bottom 4, right 5. The ±10 carry is not a die cell (its own key).
export const MOVE_KEYS = Object.freeze({
  '+1': 'K', '+2': 'J', '+3': 'I', '+4': ',', '+5': 'L', '+10': 'U',
  '-1': 'D', '-2': 'S', '-3': 'E', '-4': 'C', '-5': 'F', '-10': 'R',
});

const tokens = move => move.split(/\s+/);

// Add digit d (1..9) onto rod digit c (0..9), fully flattened.
export function planAdd(c, d) {
  const cl = classifyAdd(c, d);
  const story = [{ op: `+${d}`, rule: cl.rule, into: cl.move }];
  // direct and small moves are already primitive (a small trade's payback
  // always has the earth beads it needs); only a big trade's payback can nest.
  if (cl.rule !== 'big') return { rule: cl.rule, steps: tokens(cl.move), story };
  const p = 10 - d;
  const pay = classifySub(c, p);
  if (pay.rule !== 'direct') story.push({ op: `-${p}`, rule: pay.rule, into: pay.move });
  return { rule: 'big', steps: ['+10', ...tokens(pay.move)], story };
}

// Subtract digit d (1..9) from rod digit c (0..9), fully flattened.
export function planSub(c, d) {
  const cl = classifySub(c, d);
  const story = [{ op: `-${d}`, rule: cl.rule, into: cl.move }];
  if (cl.rule !== 'big') return { rule: cl.rule, steps: tokens(cl.move), story };
  const q = 10 - d;
  const pay = classifyAdd(c, q);
  if (pay.rule !== 'direct') story.push({ op: `+${q}`, rule: pay.rule, into: pay.move });
  return { rule: 'big', steps: ['-10', ...tokens(pay.move)], story };
}

// Display helpers shared by coach and hints (typographic minus for reading,
// ASCII minus stays in the data).
export const stepsText = steps => steps.join(' ').replace(/-/g, '−');
export const keysText = steps =>
  steps.every(s => MOVE_KEYS[s]) ? steps.map(s => MOVE_KEYS[s]).join(' then ') : null;
