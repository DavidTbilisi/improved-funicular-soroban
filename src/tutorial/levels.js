// ============================================================================
// Tutorial levels — an ordered ladder of bead-arithmetic drills, as Strategy
// objects (the same shape as drill decks). Each level is:
//   { id, title, teach, floor, timeFloorMs, gen(rng) -> problem, hint(problem) }
// `floor` is the streak of CLEAN solves needed to unlock the next level;
// `timeFloorMs` is the per-problem time budget — the gate is automaticity, so a
// solve only counts if it is correct, under time, AND fumble-free (see session).
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
import { planAdd, planSub, stepsText, keysText } from '../domain/movePlan.js';

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

// Fully-flattened move hint for the ones-column operation. One level of
// classification isn't a usable hint when the trade nests ("+7 = +10 −3" on a 6
// leaves you staring at an impossible −3) — so narrate every trade in the
// chain, then give the whole thing as keys.
function movesOf(p) {
  const c = p.a % 10;
  const plan = p.op === '+' ? planAdd(c, p.b) : planSub(c, p.b);
  const pretty = s => s.replace(/-/g, '−');
  const chain = `<b>${stepsText(plan.steps)}</b>`;
  const keys = keysText(plan.steps);
  if (plan.story.length > 1) {
    const [top, pay] = plan.story;
    return `${pretty(top.op)} = ${pretty(top.into)} — but ${pretty(pay.op)} is blocked on this rod, so it trades too: ` +
      `${pretty(pay.op)} = ${pretty(pay.into)}. Chain: ${chain}${keys ? ` (${keys})` : ''}`;
  }
  return `${chain}${keys ? ` (${keys})` : ''}`;
}

// --- Advanced builders ------------------------------------------------------
// ×, ÷, and powers are not new bead rules — they DECOMPOSE into the adds and
// subtracts the earlier levels drilled. Each problem is reached on the beads by
// the decomposition the level teaches, so the session's value-compare still
// detects a correct solve, and the keyboard's move-legality still proves clean
// technique. Operands stay whole so *Scaled is exact.
const times = n => (n === 1 ? '1 more time' : `${n} more times`);

// a × m, reached by adding a (m−1) more times: a → 2a → … → m·a.
function mkMul(a, m) {
  return {
    a, b: m, op: '×',
    prompt: `<b>${a}</b> × <b>${m}</b>`,
    sub: `beads start at ${a} — add ${a} until you reach ${a * m}`,
    startScaled: scaled(a), targetScaled: scaled(a * m),
  };
}

// a^n (small n), reached the same way — a square is n=2 groups of a.
function mkPow(a, n) {
  const t = Math.pow(a, n);
  return {
    a, b: n, op: '^',
    prompt: `<b>${a}</b><sup>${n}</sup>`,
    sub: `beads start at ${a} — ${a} groups of ${a} → reach ${t}`,
    startScaled: scaled(a), targetScaled: scaled(t),
  };
}

// D ÷ b (exact), reached by subtracting b repeatedly down to 0. The quotient q
// is how many subtractions it takes — the answer the user counts off mentally.
function mkDiv(D, b) {
  return {
    a: D, b, op: '÷', q: D / b,
    prompt: `<b>${D}</b> ÷ <b>${b}</b>`,
    sub: `beads start at ${D} — subtract ${b} repeatedly down to 0`,
    startScaled: scaled(D), targetScaled: 0,
  };
}

export const TUTORIAL_LEVELS = [
  {
    id: 'read', title: 'Read & set', floor: 6, timeFloorMs: 2500,
    teach: 'Each rod: one <b>sky bead = 5</b> (above the bar), four <b>earth beads = 1</b>. A bead counts only when pushed <b>toward the bar</b>. Build the number on the ones rod.',
    gen(rng) {
      const t = 1 + rng.int(9);
      return { a: 0, b: t, op: 'set', prompt: `Set the beads to <b>${t}</b>`, sub: 'build it on the ones rod from 0', startScaled: 0, targetScaled: scaled(t) };
    },
    hint: p => `${p.b} = ${p.b >= 5 ? 'sky bead (5) + ' : ''}${p.b % 5} earth bead(s)`,
  },
  {
    id: 'direct', title: 'Direct add / subtract', floor: 8, timeFloorMs: 3000,
    teach: 'When the beads you need are free, just move them — no complement. The <b>die cross</b> adds earth <kbd>K</kbd>1 <kbd>J</kbd>2 <kbd>I</kbd>3 <kbd>,</kbd>4 and <kbd>L</kbd> sets 5; the left hand mirrors it — <kbd>D</kbd> <kbd>S</kbd> <kbd>E</kbd> <kbd>C</kbd> subtract 1–4, <kbd>F</kbd> clears 5.',
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
    id: 'small-add', title: 'Small friend +', floor: 8, timeFloorMs: 3500,
    teach: 'Out of earth beads but the digit stays under 10? Use the <b>5-bead</b>: <b>+d = +5 −(5−d)</b>. Friends that sum to 5: 1↔4, 2↔3. e.g. 4 + 3 → <kbd>L</kbd> then <kbd>S</kbd> (+5 −2).',
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
    id: 'small-sub', title: 'Small friend −', floor: 8, timeFloorMs: 3500,
    teach: 'The mirror: not enough earth beads to remove, but the 5-bead is there? <b>−d = −5 +(5−d)</b>. e.g. 7 − 3 → <kbd>F</kbd> then <kbd>J</kbd> (−5 +2).',
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
    id: 'big-add', title: 'Big friend + (carry)', floor: 8, timeFloorMs: 4500,
    teach: 'When a digit would cross 10, <b>carry</b>: <b>+d = +10 −(10−d)</b>. <kbd>U</kbd> adds 10 to the next rod; then subtract the complement here. e.g. 8 + 5 → <kbd>U</kbd> then <kbd>F</kbd> (+10 −5).',
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
    id: 'big-sub', title: 'Big friend − (borrow)', floor: 8, timeFloorMs: 4500,
    teach: 'The mirror: <b>borrow</b> from the next rod: <b>−d = −10 +(10−d)</b>. <kbd>R</kbd> subtracts 10 from the next rod; then add the complement here. e.g. 13 − 5 → <kbd>R</kbd> then <kbd>L</kbd> (−10 +5).',
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
    // NOTE: inserted at index 6 after release — progressStore migrates older
    // saved `unlocked` counts past this slot (see TutorialProgress._data).
    id: 'compound', title: 'Compound trades', floor: 6, timeFloorMs: 6000,
    teach: 'Sometimes one trade opens another: <b>6 + 7</b> crosses ten, so +7 = +10 −3 — but −3 is blocked (only 1 earth bead down), so it trades too: −3 = −5 +2. <b>Never plan the whole chain.</b> Ask one question per move — <i>can I do this directly? if not, which trade?</i> — and the chain unrolls itself: <kbd>U</kbd> <kbd>F</kbd> <kbd>J</kbd>.',
    gen(rng) {
      for (let k = 0; k < 200; k++) {
        const add = rng.int(2) === 0;
        if (add) {
          const a = 5 + rng.int(4), b = 6 + rng.int(4);          // a 5..8, b 6..9
          if (a + b >= 10 && planAdd(a, b).story.length > 1) return mk(a, b, '+');
        } else {
          const A = 10 + rng.int(5), b = 6 + rng.int(4);         // A 10..14, b 6..9
          if (A - b >= 0 && A % 10 < b && planSub(A % 10, b).story.length > 1) return mk(A, b, '-');
        }
      }
      return mk(6, 7, '+');
    },
    hint: p => `compound trade: ${movesOf(p)}`,
  },
  {
    id: 'multi', title: 'Multi-digit', floor: 6, timeFloorMs: 9000,
    teach: 'Chain the rules across columns. Focus a rod with <kbd>←</kbd>/<kbd>→</kbd> (or <kbd>G</kbd>/<kbd>H</kbd>); when a column overflows, carry <kbd>U</kbd> into the next; when it underflows, borrow <kbd>R</kbd>.',
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
  {
    id: 'mult', title: 'Multiply (repeated +)', floor: 5, timeFloorMs: 12000,
    teach: 'Multiplication is <b>repeated addition</b>. 6 × 4 → set <b>6</b>, then add 6 three more times: 6 → 12 → 18 → <b>24</b>. Every step is an add you already know (direct / friend / carry).',
    gen(rng) {
      const m = 2 + rng.int(4);   // 2..5 groups
      const a = 2 + rng.int(8);   // 2..9 multiplicand → product 4..45
      return mkMul(a, m);
    },
    hint: p => `add ${p.a} — ${times(p.b - 1)} → ${p.a * p.b}`,
  },
  {
    id: 'square', title: 'Squares & powers', floor: 5, timeFloorMs: 15000,
    teach: 'A power is repeated multiplication — and a <b>square</b> is repeated addition. 4² = 4 groups of 4 → set <b>4</b>, add 4 three more times → <b>16</b>.',
    gen(rng) {
      const a = 2 + rng.int(6);   // 2..7 → squares 4..49 (≤6 adds)
      return mkPow(a, 2);
    },
    hint: p => `${p.a}² = add ${p.a}, ${times(p.a - 1)} → ${p.a * p.a}`,
  },
  {
    id: 'divide', title: 'Divide (repeated −)', floor: 5, timeFloorMs: 15000,
    teach: 'Division is <b>repeated subtraction</b>. 56 ÷ 7 → set <b>56</b>, subtract 7 until the beads read 0; the number of subtractions (<b>8</b>) is the answer. Each step is a subtract you know (direct / friend / borrow).',
    gen(rng) {
      const b = 2 + rng.int(8);   // divisor 2..9
      const q = 2 + rng.int(5);   // quotient 2..6 (≤6 subtractions)
      return mkDiv(b * q, b);     // exact dividend 4..54
    },
    hint: p => `subtract ${p.b} down to 0 — that takes ${p.q} steps, so ${p.a} ÷ ${p.b} = ${p.q}`,
  },
];
