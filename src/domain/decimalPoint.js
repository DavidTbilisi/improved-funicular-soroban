// ============================================================================
// Where the point goes.
//
// Everything in this app has been exact and whole on purpose: the rod trainer's
// multiplication and division are integer methods, and the kyu paper's 割算 is
// picked to come out even. That is a real simplification and it hides the one
// thing that actually costs marks on a real paper — not the arithmetic, which
// the beads do, but the DECIMAL POINT, which they do not.
//
// A soroban does not know where the point is. The rods hold digits; the point
// is a decision the operator makes before starting and honours at the end. So
// this is a skill of its own, and it is drilled as one (see the point decks in
// src/drill/decks.js): you are given the digits — the part the board hands you
// — and asked only to place them.
//
// THE TWO RULES, in the form the board suggests rather than the form a
// textbook prints:
//
//   × : the answer sits as many rods to the RIGHT of the point as the two
//       operands do together. 12.4 (1 rod) × 0.35 (2 rods) → 3 rods: 4.340.
//
//   ÷ : first make the divisor whole — shift BOTH by the divisor's decimals,
//       which is what an operator physically does before dividing — and the
//       quotient then carries whatever decimals the dividend has left.
//       8.4 ÷ 0.7 → 84 ÷ 7, and 1 − 1 = 0 rods: 12.
//       This is why the shift can go the OTHER WAY: 84 ÷ 0.7 → 840 ÷ 7 = 120,
//       and 0 − 1 = −1 means the digits gain a zero rather than a point. That
//       case is the one people get wrong, and it is the reason the drill deals
//       it as often as the others.
//
// Pure and DOM-free — strings in, strings out, no floating point anywhere near
// the placement (0.1 + 0.2 has no business in a decision about rods).
// Unit-tested in test/decimalPoint.test.js.
// ============================================================================

/** How many decimals a written operand has. "12.40" → 2, "84" → 0. */
export function decimalsOf(value) {
  const s = String(value);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

/** The digits of a written number, point removed and leading zeros dropped. */
export function digitsOf(value) {
  const d = String(value).replace('.', '').replace(/^0+(?=\d)/, '');
  return d || '0';
}

/**
 * How many rods to the right of the point the answer occupies.
 * Negative means the opposite: the digits gain trailing zeros.
 */
export function answerDecimals(op, a, b) {
  const p = decimalsOf(a), q = decimalsOf(b);
  return op === '÷' ? p - q : p + q;
}

/**
 * Put the point into a bare digit string. `decimals` may be negative, which
 * appends zeros — the case that catches people out.
 */
export function placePoint(digits, decimals) {
  const d = String(digits).replace(/[^0-9]/g, '') || '0';
  if (decimals <= 0) return d === '0' ? '0' : d + '0'.repeat(-decimals);
  const padded = d.padStart(decimals + 1, '0');
  const cut = padded.length - decimals;
  return `${padded.slice(0, cut)}.${padded.slice(cut)}`;
}

/** The same value with no trailing fractional zeros — 4.340 → 4.34, 12.0 → 12. */
export function trimZeros(value) {
  const s = String(value);
  if (!s.includes('.')) return s;
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

/** Both spellings a learner might type, so an over-typed answer still grades. */
export function acceptedForms(placed) {
  const trimmed = trimZeros(placed);
  return trimmed === placed ? [placed] : [trimmed, placed];
}

/**
 * The rule, in words, with these operands' own numbers in it. This is what the
 * drill reveals after an answer — the sentence is the teaching, and it has to
 * be about the question that was just asked.
 */
export function pointRule(op, a, b) {
  const p = decimalsOf(a), q = decimalsOf(b);
  if (op === '÷') {
    const n = p - q;
    const shift = q === 0
      ? `${b} is already whole, so nothing shifts`
      : `shift both ${q} rod${q === 1 ? '' : 's'} to make ${b} whole (${a} → ${digitsWithPoint(a, p - q >= 0 ? p - q : 0)} ÷ ${digitsOf(b)})`;
    return `${shift}. The quotient then carries the dividend's remaining decimals: ` +
      `${p} − ${q} = <b>${n}</b> ${Math.abs(n) === 1 ? 'rod' : 'rods'}` +
      (n < 0 ? ' — a shift the other way, so the digits gain a zero.' : n === 0 ? ' — the digits are the answer.' : '.');
  }
  return `${a} sits ${p} rod${p === 1 ? '' : 's'} right of the point and ${b} sits ${q}; ` +
    `the product sits <b>${p + q}</b> — ${p} + ${q}.`;
}

// The dividend as it reads after the shift that makes the divisor whole.
function digitsWithPoint(a, decimals) {
  return placePoint(digitsOf(a), decimals);
}

/**
 * A whole placement question, built from the two written operands and the bare
 * digits the board would leave you with.
 * @returns { op, a, b, digits, decimals, placed, accepted, rule }
 */
export function placement(op, a, b, digits) {
  const decimals = answerDecimals(op, a, b);
  const placed = placePoint(digits, decimals);
  return { op, a, b, digits: String(digits), decimals, placed, accepted: acceptedForms(placed), rule: pointRule(op, a, b) };
}
