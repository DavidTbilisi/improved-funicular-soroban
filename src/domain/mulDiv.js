// ============================================================================
// Authentic soroban multiplication & division — the rod-placement methods from
// the Japan Chamber of Commerce & Industry "Soroban" handbook, formalised as a
// verifiable step sequence. Pure and DOM-free (fully unit-tested); no bead/DOM
// knowledge — it only computes *where digits go and what the board should read*.
//
// Board model: integer rods only. Rod at PLACE p holds one digit; place 0 is the
// ones rod, and place increases LEFTWARD exactly like a physical soroban, so the
// board value is Σ digit·10^p. A trainer seeds the layout, then the operator
// works the beads; after each step the board must equal that step's `expected`
// value — which pins down the rod placement without policing individual moves.
//
// Layout (per the handbook):
//   multiplication —  [multiplier] · gap · [multiplicand] · [product →]
//   division       —  [divisor] · gap · [quotient] · [dividend]
// The multiplier/divisor stay put; the multiplicand/dividend are consumed as the
// product/quotient is built. Offsets are chosen so the running board is always
// an unambiguous integer — a quotient digit only ever lands on a rod the
// dividend has already vacated.
//
// The key rule the handbook repeats, in place-value form:
//   multiplicand digit i (from the ones) × multiplier digit k (from the ones)
//   → the two-digit product d_i·m_k is added with its ONES on rod
//     (m0 + i − 2 − (P−1−k)) and its tens one rod to the left, where m0 is the
//     multiplicand's ones rod and P the number of multiplier digits. Summed over
//     i,k this telescopes to (multiplicand × multiplier) sitting with its ones on
//     rod (m0 − 1 − P). Division is the same identity read backwards.
// ============================================================================
import { columnLetter } from './config.js';

const digitsLE = n => String(n).split('').reverse().map(Number); // ones-first
const pow10 = p => Math.pow(10, p);
const L = p => columnLetter(p);                     // rod letter for a place (A=ones)
const pad2 = n => String(n).padStart(2, '0');

// --- Multiplication ---------------------------------------------------------
// a = multiplicand, b = multiplier (as the handbook writes "76 × 3": 76 on the
// board, 3 the multiplier to its left).
export function buildMultiplication(a, b) {
  const mcD = digitsLE(a), mpD = digitsLE(b);
  const Lc = mcD.length, Pm = mpD.length;
  const m0 = 1 + Pm;             // multiplicand ones rod → product ones lands on rod 0
  const mg0 = m0 + Lc + 1;       // multiplier ones rod (one-rod gap, left of multiplicand)

  let board = 0;
  for (let i = 0; i < Lc; i++) board += mcD[i] * pow10(m0 + i);
  for (let k = 0; k < Pm; k++) board += mpD[k] * pow10(mg0 + k);
  const setup = board;

  const mcRods = range(m0, m0 + Lc - 1);
  const mpRods = range(mg0, mg0 + Pm - 1);
  const setupInstr =
    `Set the <b>multiplier ${b}</b> on the left (rods <b>${rodSpan(mpRods)}</b>) and the ` +
    `<b>multiplicand ${a}</b> to its right (rods <b>${rodSpan(mcRods)}</b>). The product is ` +
    `built to the right of the multiplicand, one rod per column.`;

  const steps = [];
  for (let i = 0; i < Lc; i++) {
    for (let k = Pm - 1; k >= 0; k--) {
      const prod = mcD[i] * mpD[k];
      if (prod === 0) continue;                      // "0 × n = 0 — no counters move"
      const ones = m0 + i - 2 - (Pm - 1 - k);
      board += prod * pow10(ones);
      steps.push({
        kind: 'partial',
        instr: `<b>${mcD[i]} × ${mpD[k]} = ${prod}</b> — add <b>${pad2(prod)}</b> with its tens on rod <b>${L(ones + 1)}</b>, ones on rod <b>${L(ones)}</b>.`,
        targets: [ones, ones + 1],
        factors: [mcD[i], mpD[k]],   // the multiplication-table cell this step reads
        expected: board,
      });
    }
    if (mcD[i] !== 0) {
      board -= mcD[i] * pow10(m0 + i);
      steps.push({
        kind: 'clear',
        instr: `Clear the used multiplicand digit <b>${mcD[i]}</b> on rod <b>${L(m0 + i)}</b>.`,
        targets: [m0 + i],
        expected: board,
      });
    }
  }

  const answer = a * b;
  const answerRods = range(0, digitsLE(answer).length - 1);
  return {
    op: '×', a, b, prompt: `${a} × ${b}`, answer,
    setup, setupInstr, steps,
    answerRods, answerRodSpan: rodSpan(answerRods),
    layout: { multiplier: mpRods, multiplicand: mcRods, product: answerRods },
    topRod: mg0 + Pm - 1,
  };
}

// --- Division ---------------------------------------------------------------
// a ÷ b, exact (a % b === 0). a = dividend (board, right), b = divisor (left);
// the quotient is built just left of the dividend.
export function buildDivision(a, b) {
  if (a % b !== 0) throw new Error(`buildDivision expects exact division (${a} ÷ ${b})`);
  const Q = a / b;
  const nD = digitsLE(a), vD = digitsLE(b), qD = digitsLE(Q);
  const Nlen = nD.length, Pv = vD.length, qlen = qD.length;
  const d0 = 0;                  // dividend ones rod
  const Q0 = d0 + 1 + Pv;        // quotient ones rod (so q×divisor lands back on the dividend)
  const qTop = Q0 + qlen - 1;
  const vg0 = qTop + 2;          // divisor ones rod (gap, left of the quotient)

  let board = 0;
  for (let i = 0; i < Nlen; i++) board += nD[i] * pow10(d0 + i);
  for (let k = 0; k < Pv; k++) board += vD[k] * pow10(vg0 + k);
  const setup = board;

  const nRods = range(d0, d0 + Nlen - 1);
  const vRods = range(vg0, vg0 + Pv - 1);
  const qRods = range(Q0, qTop);
  const setupInstr =
    `Set the <b>dividend ${a}</b> on the right (rods <b>${rodSpan(nRods)}</b>) and the ` +
    `<b>divisor ${b}</b> to the left (rods <b>${rodSpan(vRods)}</b>). The quotient is built ` +
    `just left of the dividend (rods <b>${rodSpan(qRods)}</b>).`;

  const steps = [];
  for (let j = qlen - 1; j >= 0; j--) {
    const q = qD[j];
    if (q === 0) continue;         // a 0 quotient digit leaves its rod at 0 — nothing to place
    board += q * pow10(Q0 + j);
    steps.push({
      kind: 'quotient',
      instr: `Quotient digit: think <b>${b} × ? </b> into the leading dividend → <b>${q}</b>. Set <b>${q}</b> on rod <b>${L(Q0 + j)}</b>.`,
      targets: [Q0 + j],
      expected: board,
    });
    for (let k = Pv - 1; k >= 0; k--) {
      const p = q * vD[k];
      if (p === 0) continue;
      const ones = d0 + j + k;
      board -= p * pow10(ones);
      steps.push({
        kind: 'subtract',
        instr: `<b>${q} × ${vD[k]} = ${p}</b> — subtract <b>${pad2(p)}</b> from the dividend, tens on rod <b>${L(ones + 1)}</b>, ones on rod <b>${L(ones)}</b>.`,
        targets: [ones, ones + 1],
        factors: [q, vD[k]],         // the multiplication-table cell this step reads
        expected: board,
      });
    }
  }

  return {
    op: '÷', a, b, prompt: `${a} ÷ ${b}`, answer: Q,
    setup, setupInstr, steps,
    answerRods: qRods, answerRodSpan: rodSpan(qRods),
    layout: { divisor: vRods, dividend: nRods, quotient: qRods },
    topRod: vg0 + Pv - 1,
  };
}

export function buildProblem(op, a, b) {
  return op === '÷' ? buildDivision(a, b) : buildMultiplication(a, b);
}

// --- helpers ----------------------------------------------------------------
function range(lo, hi) { const r = []; for (let p = lo; p <= hi; p++) r.push(p); return r; }
// A human span of rod letters for a place range, e.g. [2,3,4] -> "C–E", [5] -> "F".
function rodSpan(places) {
  if (!places.length) return '';
  const hi = Math.max(...places), lo = Math.min(...places);
  return hi === lo ? L(lo) : `${L(hi)}–${L(lo)}`; // left(high place)–right(low place)
}

// --- Trainer modes (difficulty ladder) --------------------------------------
// Each generates operands for buildProblem(op, a, b). Exact division only (pick
// divisor × quotient so there is never a remainder).
const between = (rng, lo, hi) => lo + rng.int(hi - lo + 1);
export const ROD_MODES = [
  { id: 'mul-1x1', floor: 3, timeFloorMs: 25000, op: '×', label: '× 1-digit', title: 'Multiply: 1 × 1 digit',
    teach: 'Multiplier on the left, multiplicand mid-board; each product digit lands two rods to the right of the multiplicand.',
    gen: rng => ({ a: between(rng, 2, 9), b: between(rng, 2, 9) }) },
  { id: 'mul-2x1', floor: 3, timeFloorMs: 45000, op: '×', label: '× 2×1', title: 'Multiply: 2-digit × 1-digit',
    teach: 'Work the multiplicand ones digit first, then its tens; each partial product is placed off its own multiplicand rod, then that digit is cleared.',
    gen: rng => ({ a: between(rng, 12, 98), b: between(rng, 2, 9) }) },
  { id: 'mul-3x1', floor: 3, timeFloorMs: 70000, op: '×', label: '× 3×1', title: 'Multiply: 3-digit × 1-digit',
    teach: 'Same rule across three multiplicand digits — a zero digit means no counters move for that column.',
    gen: rng => ({ a: between(rng, 105, 987), b: between(rng, 2, 9) }) },
  { id: 'mul-2x2', floor: 3, timeFloorMs: 90000, op: '×', label: '× 2×2', title: 'Multiply: 2-digit × 2-digit',
    teach: 'For each multiplicand digit, multiply by the multiplier tens then ones; the ones-digit product shifts one rod further right.',
    gen: rng => ({ a: between(rng, 12, 98), b: between(rng, 12, 98) }) },
  { id: 'div-1', floor: 3, timeFloorMs: 60000, op: '÷', label: '÷ 1-digit', title: 'Divide: ÷ 1-digit',
    teach: 'Set the quotient just left of the dividend, then subtract quotient × divisor back onto the dividend; repeat down the dividend.',
    gen: rng => { const b = between(rng, 2, 9), q = between(rng, 11, 98); return { a: b * q, b }; } },
  { id: 'div-2', floor: 3, timeFloorMs: 120000, op: '÷', label: '÷ 2-digit', title: 'Divide: ÷ 2-digit',
    teach: 'Same method with a two-digit divisor: subtract quotient × (each divisor digit), the ones product shifted one rod right.',
    gen: rng => { const b = between(rng, 12, 79), q = between(rng, 12, 79); return { a: b * q, b }; } },
];
