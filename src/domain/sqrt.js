// ============================================================================
// 開平法 — the square root on the soroban.
//
// The rod trainer teaches the two operations a kyu paper asks for. This is the
// one it does not: the method that starts where 1級 stops, and the reason the
// abacus kept being used after the calculator arrived — a root falls out of the
// same board, by the same kind of subtract-and-place work as division.
//
// THE METHOD, which is long division's twin:
//   1. Pair the digits from the ones — 5476 becomes 54|76. One pair, one root
//      digit; an odd count leaves the leading group a single digit.
//   2. Take the largest d with d² ≤ the first group, set it as the first root
//      digit, and subtract d² from that group.
//   3. Bring the next pair down. DOUBLE the root so far — that is the whole
//      trick — and find the largest d with (20·root + d)·d ≤ the remainder.
//      Set d as the next root digit and subtract (20·root + d)·d.
//   4. Repeat. When the radicand reaches zero the number was a perfect square
//      and the root rods hold the answer.
//
// Why doubling: (10r + d)² = 100r² + (20r + d)·d, and 100r² is exactly what the
// previous rounds already subtracted. So every step removes the part of the
// square the new digit adds — the same identity long division uses, read
// through a square.
//
// THE BOARD MODEL is buildDivision's, and deliberately so: the radicand sits on
// the right and is consumed, the root is built on rods to its left, and the
// trial divisor (twice the root) is held in the head rather than on the board —
// the same way the quotient's multiplications are. So every step's `expected`
// is an unambiguous integer, which is what lets the trainer verify a step by
// comparing the whole board instead of policing individual moves.
//
// Pure and DOM-free, and it returns exactly the shape buildMultiplication and
// buildDivision return, so rodTrainerSession walks it without knowing it exists.
// Unit-tested in test/sqrt.test.js.
// ============================================================================
import { columnLetter } from './config.js';

const pow10 = p => Math.pow(10, p);
const L = p => columnLetter(p);
const range = (lo, hi) => { const r = []; for (let p = lo; p <= hi; p++) r.push(p); return r; };
const rodSpan = places => {
  if (!places.length) return '';
  const hi = Math.max(...places), lo = Math.min(...places);
  return hi === lo ? L(lo) : `${L(hi)}–${L(lo)}`;
};

/**
 * The digit pairs, most significant first. An odd digit count leaves the
 * leading group with one digit — pairing runs from the ONES, never from the
 * left, because the pairs are what fixes the root's place value.
 */
export function pairsOf(n) {
  const digits = String(Math.abs(Math.floor(n)));
  const out = [];
  for (let end = digits.length; end > 0; end -= 2) out.unshift(Number(digits.slice(Math.max(0, end - 2), end)));
  return out;
}

/** The largest digit d with (20·root + d)·d ≤ rem — the trial the method turns on. */
export function rootDigit(root, rem) {
  for (let d = 9; d >= 1; d--) if ((20 * root + d) * d <= rem) return d;
  return 0;
}

/** The integer square root and what is left over (0 for a perfect square). */
export function isqrt(n) {
  let root = 0, rem = 0;
  for (const pair of pairsOf(n)) {
    rem = rem * 100 + pair;
    const d = rootDigit(root, rem);
    rem -= (20 * root + d) * d;
    root = root * 10 + d;
  }
  return { root, remainder: rem };
}

/**
 * The whole walkthrough for √n, in the shape the rod trainer walks.
 * n should be a perfect square for the trainer's modes; a non-square simply
 * leaves its remainder on the radicand rods, which is what the method does.
 */
export function buildSquareRoot(n) {
  const digits = String(n);
  const nLen = digits.length;
  const pairs = pairsOf(n);
  const P = pairs.length;

  const d0 = 0;                 // radicand ones rod
  const R0 = nLen + 1;          // root ones rod — one clear rod left of the radicand
  const rootTop = R0 + P - 1;

  const nRods = range(d0, nLen - 1);
  const rootRods = range(R0, rootTop);
  // The pairs as WRITTEN, not as numbers: 4900 pairs into 49|00, and printing
  // it as 49|0 would show the learner a pairing that is not the one being used.
  const pairText = pairs
    .map((v, i) => (i === 0 && nLen % 2 === 1 ? String(v) : String(v).padStart(2, '0')))
    .join('|');

  let board = n;                // setup: the radicand alone
  const setup = board;
  const setupInstr =
    `Set the <b>radicand ${n}</b> on the right (rods <b>${rodSpan(nRods)}</b>) and pair its digits ` +
    `from the ones: <b>${pairText}</b>. One pair, one root digit — the root is built to the left ` +
    `(rods <b>${rodSpan(rootRods)}</b>), and the radicand is eaten away as it goes.`;

  const steps = [];
  let root = 0, rem = 0;
  for (let k = 0; k < P; k++) {
    const j = P - 1 - k;                       // this pair's root rod index
    const before = root;
    rem = rem * 100 + pairs[k];
    const d = rootDigit(root, rem);
    const sub = (20 * root + d) * d;

    // A zero root digit leaves its rod at zero and subtracts nothing — the same
    // case as a zero quotient digit in division, and the same non-move.
    if (d === 0) { root = root * 10; continue; }

    board += d * pow10(R0 + j);
    steps.push({
      kind: 'root',
      instr: k === 0
        ? `First group <b>${pairs[0]}</b>: the largest <b>d</b> with <b>d² ≤ ${pairs[0]}</b> is <b>${d}</b>. ` +
          `Set <b>${d}</b> on rod <b>${L(R0 + j)}</b>.`
        : `Bring down the next pair (<b>${pairs[k]}</b>) → working remainder <b>${rem}</b>. ` +
          `Double the root so far: <b>${before} → ${2 * before}</b>, so the trial divisor is <b>${20 * before}+d</b>. ` +
          `The largest <b>d</b> with <b>(${20 * before} + d) × d ≤ ${rem}</b> is <b>${d}</b> — set it on rod <b>${L(R0 + j)}</b>.`,
      targets: [R0 + j],
      expected: board,
    });

    const ones = 2 * j;
    board -= sub * pow10(ones);
    const width = String(sub).length;
    steps.push({
      kind: 'subtract',
      instr: k === 0
        ? `Subtract <b>${d}² = ${sub}</b> from the leading group — ones on rod <b>${L(ones)}</b>.`
        : `Subtract <b>(${20 * before} + ${d}) × ${d} = ${sub}</b> from the radicand — ones on rod <b>${L(ones)}</b>.`,
      targets: range(ones, ones + width - 1),
      expected: board,
    });

    rem -= sub;
    root = root * 10 + d;
  }

  return {
    op: '√', a: n, b: null, prompt: `√${n}`, answer: root,
    setup, setupInstr, steps,
    answerRods: rootRods, answerRodSpan: rodSpan(rootRods),
    layout: { radicand: nRods, root: rootRods },
    topRod: rootTop,
    remainder: rem,
    pairs,
  };
}
