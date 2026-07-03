// ============================================================================
// Tutorial levels — an ordered ladder of bead-arithmetic drills, as Strategy
// objects (the same shape as drill decks). Each level is:
//   { id, title, teach, floor, gen(rng) -> problem, hint(problem) -> string }
// A problem is:
//   { a, b, op, prompt, sub, startScaled, targetScaled }
// where *Scaled is the AbacusStore's scaled integer (value × 10^FRAC_COLS), so
// the session can seed the beads and detect completion by pure integer compare.
//
// The genius of pairing this with the live keyboard: the bead engine already
// REJECTS illegal moves, so a level only needs to check the final value —
// reaching the target proves the correct complement was used. No move policing.
// ============================================================================
import { FRAC_COLS } from '../domain/config.js';
import { classifyAdd, classifySub } from '../domain/soroban.js';

const SCALE = Math.pow(10, FRAC_COLS);
const scaled = v => Math.round(v * SCALE);

// Build a single-/multi-column problem object from operands.
function mk(a, b, op) {
  const target = op === '+' ? a + b : a - b;
  const sym = op === '+' ? '+' : '−';
  return {
    a, b, op,
    prompt: `<b>${a}</b> ${sym} <b>${b}</b>`,
    sub: `beads start at ${a} — reach the answer`,
    startScaled: scaled(a),
    targetScaled: scaled(target),
  };
}

// Move string for the ones-column operation (used by hints).
function movesOf(p) {
  const c = p.a % 10;
  const cl = p.op === '+' ? classifyAdd(c, p.b) : classifySub(c, p.b);
  return cl.move.replace(/-/g, '−');
}

export const TUTORIAL_LEVELS = [
  {
    id: 'read', title: 'Read & set', floor: 4,
    teach: 'Each rod: one <b>sky bead = 5</b> (above the bar), four <b>earth beads = 1</b>. A bead counts only when pushed <b>toward the bar</b>. Build the number on the ones rod.',
    gen(rng) {
      const t = 1 + rng.int(9);
      return { a: 0, b: t, op: 'set', prompt: `Set the beads to <b>${t}</b>`, sub: 'build it on the ones rod from 0', startScaled: 0, targetScaled: scaled(t) };
    },
    hint: p => `${p.b} = ${p.b >= 5 ? 'sky bead (5) + ' : ''}${p.b % 5} earth bead(s)`,
  },
  {
    id: 'direct', title: 'Direct add / subtract', floor: 5,
    teach: 'When the beads you need are free, just move them — no complement. <kbd>J K L ;</kbd> add 1–4 earth, <kbd>U</kbd> sets 5; <kbd>F D S A</kbd> subtract, <kbd>R</kbd> clears 5.',
    gen(rng) {
      for (let k = 0; k < 80; k++) {
        const add = rng.int(2) === 0;
        const a = rng.int(10), b = 1 + rng.int(9);
        if (add && a + b <= 9 && classifyAdd(a, b).rule === 'direct') return mk(a, b, '+');
        if (!add && a - b >= 0 && classifySub(a, b).rule === 'direct') return mk(a, b, '-');
      }
      return mk(1, 1, '+');
    },
    hint: p => `direct: ${movesOf(p)}`,
  },
  {
    id: 'small-add', title: 'Small friend +', floor: 5,
    teach: 'Out of earth beads but the digit stays under 10? Use the <b>5-bead</b>: <b>+d = +5 −(5−d)</b>. Friends that sum to 5: 1↔4, 2↔3. e.g. 4 + 3 → <kbd>U</kbd> then <kbd>D</kbd> (+5 −2).',
    gen(rng) {
      for (let k = 0; k < 80; k++) {
        const a = rng.int(10), b = 1 + rng.int(4);
        if (a + b <= 9 && classifyAdd(a, b).rule === 'small') return mk(a, b, '+');
      }
      return mk(4, 3, '+');
    },
    hint: p => `small friend: ${movesOf(p)}`,
  },
  {
    id: 'small-sub', title: 'Small friend −', floor: 5,
    teach: 'The mirror: not enough earth beads to remove, but the 5-bead is there? <b>−d = −5 +(5−d)</b>. e.g. 7 − 3 → <kbd>R</kbd> then <kbd>K</kbd> (−5 +2).',
    gen(rng) {
      for (let k = 0; k < 80; k++) {
        const a = rng.int(10), b = 1 + rng.int(4);
        if (a - b >= 0 && classifySub(a, b).rule === 'small') return mk(a, b, '-');
      }
      return mk(7, 3, '-');
    },
    hint: p => `small friend: ${movesOf(p)}`,
  },
  {
    id: 'big-add', title: 'Big friend + (carry)', floor: 5,
    teach: 'When a digit would cross 10, <b>carry</b>: <b>+d = +10 −(10−d)</b>. <kbd>I</kbd> adds 10 to the next rod; then subtract the complement here. e.g. 8 + 5 → <kbd>I</kbd> then <kbd>R</kbd> (+10 −5).',
    gen(rng) {
      for (let k = 0; k < 80; k++) {
        const a = rng.int(10), b = 1 + rng.int(9);
        if (a + b >= 10 && a + b <= 18 && classifyAdd(a, b).rule === 'big') return mk(a, b, '+');
      }
      return mk(8, 5, '+');
    },
    hint: p => `big friend (carry): ${movesOf(p)}`,
  },
  {
    id: 'big-sub', title: 'Big friend − (borrow)', floor: 5,
    teach: 'The mirror: <b>borrow</b> from the next rod: <b>−d = −10 +(10−d)</b>. <kbd>E</kbd> subtracts 10 from the next rod; then add the complement here. e.g. 13 − 5 → <kbd>E</kbd> then <kbd>U</kbd> (−10 +5).',
    gen(rng) {
      for (let k = 0; k < 80; k++) {
        const A = 10 + rng.int(9), b = 1 + rng.int(9); // A = 10..18
        const c = A % 10;
        if (A - b >= 0 && classifySub(c, b).rule === 'big') return mk(A, b, '-');
      }
      return mk(13, 5, '-');
    },
    hint: p => `big friend (borrow): ${movesOf(p)}`,
  },
  {
    id: 'multi', title: 'Multi-digit', floor: 6,
    teach: 'Chain the rules across columns. Focus a rod with <kbd>←</kbd>/<kbd>→</kbd> (or <kbd>G</kbd>/<kbd>H</kbd>); when a column overflows, carry <kbd>I</kbd> into the next; when it underflows, borrow <kbd>E</kbd>.',
    gen(rng) {
      for (let k = 0; k < 120; k++) {
        const add = rng.int(2) === 0;
        const a = 10 + rng.int(90), b = 10 + rng.int(90);
        if (add) { if ((a % 10) + (b % 10) >= 10) return mk(a, b, '+'); }        // forces a carry
        else { const hi = Math.max(a, b), lo = Math.min(a, b); if ((hi % 10) < (lo % 10)) return mk(hi, lo, '-'); } // forces a borrow
      }
      return mk(19, 3, '+');
    },
    hint: () => 'work column by column; carry +10 into the next rod, or borrow −10 from it',
  },
];
