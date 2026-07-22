// ============================================================================
// The paper — generators for the three exam sections, and the marking.
//
// Pure and DOM-free: a grade and an rng in, a paper out; a paper and the typed
// answers in, a mark sheet out. The rng is the same seam the drill decks use,
// so a test can pin an exact paper (test/examPaper.test.js).
//
// The one generator with real rules in it is MITORI-ZAN, and they are the
// paper-setter's rules, not decoration:
//   • every term is EXACTLY the section's digit width — a narrow term in a
//     3-digit column is a free line, the same reason anzan's genRound insists
//     on it;
//   • a minus term may never take the RUNNING TOTAL below zero. This is not a
//     nicety: the board holds the running total and there is nothing to the
//     left of the top rod to borrow from, so a column that dips negative is a
//     question that cannot be sat on a soroban at all;
//   • the first term is never negative, and minus terms are capped at about a
//     third of the column — a paper that was mostly subtraction would be
//     testing one rule instead of the mixture.
//
// Division is EXACT here (the dividend is built as divisor × quotient). Real
// papers above about 4級 carry remainders and decimal quotients; that needs a
// place-setting convention for where the answer's point falls, which the rod
// trainer owns and this page deliberately does not re-litigate.
// ============================================================================
import { SECTION_POINTS, PASS_MARK } from './grades.js';
import { isqrt } from '../domain/sqrt.js';

// A number of exactly `d` digits. One-digit operands start at 2 in the ×/÷
// sections: a 1 or a 0 there is a question that answers itself.
function widthed(d, rng, floor1 = 1) {
  const lo = d === 1 ? floor1 : 10 ** (d - 1);
  const hi = 10 ** d - 1;
  return lo + rng.int(hi - lo + 1);
}

// --- 見取算 -----------------------------------------------------------------
export function genMitori(spec, rng) {
  const { terms, digits, minus } = spec;
  const lo = digits === 1 ? 1 : 10 ** (digits - 1);
  const span = 10 ** digits - lo;
  const capMinus = minus ? Math.max(1, Math.round(terms / 3)) : 0;

  // Attempts, not repairs: a column is cheap to throw away, and a repaired one
  // would no longer satisfy the width rule it was repaired against. A `minus`
  // section wants at least one minus term; the loop gives up rather than spin.
  let best = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const out = [];
    let sum = 0, used = 0;
    for (let i = 0; i < terms; i++) {
      const v = lo + rng.int(span);
      const canSub = used < capMinus && i > 0 && v <= sum && rng.int(3) === 0;
      if (canSub) { out.push(-v); sum -= v; used++; } else { out.push(v); sum += v; }
    }
    const q = { kind: 'mitori', terms: out, answer: sum };
    if (!minus || used > 0) return q;
    best = q;
  }
  return best;
}

// --- 掛算 -------------------------------------------------------------------
export function genKake(spec, rng) {
  const a = widthed(spec.a, rng, 2), b = widthed(spec.b, rng, 2);
  return { kind: 'kake', a, b, answer: a * b };
}

// --- 割算 -------------------------------------------------------------------
// The dividend is BUILT from the divisor and a quotient, so the division is
// exact by construction and the dividend still has exactly its digit width.
export function genWari(spec, rng) {
  const loA = spec.a === 1 ? 1 : 10 ** (spec.a - 1), hiA = 10 ** spec.a - 1;
  let fallback = null;
  for (let attempt = 0; attempt < 24; attempt++) {
    const b = widthed(spec.b, rng, 2);
    const qLo = Math.max(2, Math.ceil(loA / b));
    const qHi = Math.floor(hiA / b);
    if (qHi < qLo) continue;
    const q = qLo + rng.int(qHi - qLo + 1);
    const out = { kind: 'wari', a: b * q, b, answer: q };
    if (String(out.a).length === spec.a) return out;
    fallback = out;
  }
  return fallback || { kind: 'wari', a: loA, b: 1, answer: loA };
}

// --- 開平 -------------------------------------------------------------------
// A perfect square, built from its root — the same restriction the rod trainer's
// √ modes carry, and for the same reason: a root with a remainder is a different
// question from "√n is …", and this paper has one right answer per line.
export function genKaihei(spec, rng) {
  const lo = spec.digits === 1 ? 4 : 10 ** (spec.digits - 1);
  const hi = 10 ** spec.digits - 1;
  const root = lo + rng.int(hi - lo + 1);
  return { kind: 'kaihei', a: root * root, answer: root };
}

// 暗算 is the same COLUMN as 見取算 — the difference is that the board is faded
// out while it runs, which is the exam page's business, not the generator's.
// One generator, so a mental column cannot drift from a written one.
const GENERATORS = { mitori: genMitori, kake: genKake, wari: genWari, kaihei: genKaihei, anzan: genMitori };

// The section owns the kind: `anzan` deals a mitori column and must still be
// marked, printed and reported as the section it belongs to.
export const genQuestion = (section, rng) => ({ ...GENERATORS[section.kind](section, rng), kind: section.kind });

/**
 * A whole paper: every section's questions, generated up front.
 * @returns { gradeId, kyu, name, sections: [{ kind, title, seconds, count, spec, questions }] }
 */
export function genPaper(grade, rng) {
  return {
    gradeId: grade.id, kyu: grade.kyu, name: grade.name,
    sections: grade.sections.map(s => ({
      kind: s.kind, title: s.title, seconds: s.seconds, count: s.count, spec: s,
      questions: Array.from({ length: s.count }, () => genQuestion(s, rng)),
    })),
  };
}

// --- Marking ----------------------------------------------------------------
// An answer is a plain integer. Spaces, commas and underscores are how people
// write long numbers, so they are stripped; ANYTHING ELSE is not an answer at
// all and marks as blank rather than as a wrong number — "12x4" is a slip of
// the hand, not a claim about the sum.
export function normalizeAnswer(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/[\s,_']/g, '');
  if (!/^[+-]?\d+$/.test(s)) return null;
  const neg = s[0] === '-';
  const digits = s.replace(/^[+-]/, '').replace(/^0+(?=\d)/, '');
  return (neg && digits !== '0' ? '-' : '') + digits;
}

/**
 * Mark a paper. `answers[si][qi]` is the raw submission (null = not attempted).
 * Each section is scored out of SECTION_POINTS and must reach PASS_MARK on its
 * own — an average would let a perfect column carry a failed division.
 */
export function gradePaper(paper, answers = []) {
  const sections = paper.sections.map((sec, si) => {
    const given = answers[si] || [];
    const marks = sec.questions.map((q, qi) => {
      const g = normalizeAnswer(given[qi]);
      // The question rides along in the mark: the results table has to show the
      // column you got wrong, not just the number you missed.
      return { ok: g !== null && g === String(q.answer), given: g, answer: q.answer, q };
    });
    const correct = marks.filter(m => m.ok).length;
    const score = Math.round(SECTION_POINTS * correct / (sec.count || 1));
    return { kind: sec.kind, title: sec.title, count: sec.count, correct, score, passed: score >= PASS_MARK, marks };
  });
  const correct = sections.reduce((n, s) => n + s.correct, 0);
  const count = sections.reduce((n, s) => n + s.count, 0);
  return {
    gradeId: paper.gradeId, kyu: paper.kyu, name: paper.name,
    sections, correct, count,
    score: sections.length ? Math.round(sections.reduce((n, s) => n + s.score, 0) / sections.length) : 0,
    passed: sections.length > 0 && sections.every(s => s.passed),
  };
}
