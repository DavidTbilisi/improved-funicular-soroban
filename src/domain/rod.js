// ============================================================================
// Rod arithmetic — the pure numeric core of the abacus. No DOM, no float error
// (works in digit-strings / integer places). This is the most heavily
// unit-tested module.
//
// A rod is a plain value object: { sky: boolean, earth: 0..4 }.
//   value = (sky ? 5 : 0) + earth
// state.int[0] = ones, state.frac[0] = tenths (low place first in both arrays).
// ============================================================================
import { INT_COLS, FRAC_COLS } from './config.js';

export function rodValue(rod) { return (rod.sky ? 5 : 0) + rod.earth; }

export function digitToRod(d) { return { sky: d >= 5, earth: d % 5 }; }

export function intRodsFromVal(iv) {
  iv = BigInt(iv);  // accepts Number or BigInt; 19 int digits exceed exact-Number range
  const r = [];
  for (let i = 0; i < INT_COLS; i++) r.push(digitToRod(Number((iv / 10n ** BigInt(i)) % 10n)));
  return r;
}

export function fracRodsFromStr(fs) {
  const r = [];
  for (let j = 0; j < FRAC_COLS; j++) r.push(digitToRod(j < fs.length ? (+fs[j]) : 0));
  return r;
}

export function intValOf(intRods) {
  return intRods.reduce((s, r, i) => s + BigInt(rodValue(r)) * 10n ** BigInt(i), 0n);
}

// Fraction digits, tenths-first, with trailing zeros trimmed.
export function fracStrOf(fracRods) {
  return fracRods.map(rodValue).join('').replace(/0+$/, '');
}
