// ============================================================================
// Number parsing / display / decode — pure presentation-logic over rods.
// Returns plain data (chip descriptors); rendering to DOM is the view's job.
// ============================================================================
import { INT_COLS, FRAC_COLS, MAXINT, columnLetter } from './config.js';
import { rodValue, intValOf, fracStrOf } from './rod.js';

// Parse a decimal-ish string -> clamped { intVal:Number, fracStr:String(digits, tenths-first) }
export function parseDecimal(str) {
  const cleaned = String(str).replace(/[^0-9.]/g, '');
  const dot = cleaned.indexOf('.');
  const ipart = dot < 0 ? cleaned : cleaned.slice(0, dot);
  const fpart = dot < 0 ? '' : cleaned.slice(dot + 1).replace(/\./g, '');
  const parsed = BigInt(ipart.replace(/[^0-9]/g, '') || '0');  // BigInt: up to 19 digits
  const intVal = parsed > MAXINT ? MAXINT : parsed;
  const fracStr = fpart.replace(/[^0-9]/g, '').slice(0, FRAC_COLS);
  return { intVal, fracStr };
}

export function displayString(intRods, fracRods) {
  const iv = intValOf(intRods), fs = fracStrOf(fracRods);
  return fs ? iv.toLocaleString('en-US') + '.' + fs : iv.toLocaleString('en-US');
}

// Ordered chip descriptors: integer high->ones (upright), a point, then
// fraction tenths->lowest-nonzero (flipped). Empty only when value is exactly 0
// with no fraction. `pegs` is injected (Dependency Inversion) — defaults to the
// A–Z food pegs but any peg table works.
export function decodeChips(intRods, fracRods, pegs) {
  const allIntZero = intValOf(intRods) === 0n;
  const fs = fracStrOf(fracRods);
  const hasFrac = fs.length > 0;
  const chips = [];
  if (!allIntZero || hasFrac) {
    let H = 0;
    for (let i = INT_COLS - 1; i >= 0; i--) { if (rodValue(intRods[i]) > 0) { H = i; break; } }
    for (let i = H; i >= 0; i--) {
      const L = columnLetter(i);
      chips.push({ side: 'int', place: i, letter: L, digit: rodValue(intRods[i]), peg: pegs[L], flipped: false });
    }
  }
  if (hasFrac) {
    chips.push({ side: 'point' });
    let low = 0;
    for (let j = FRAC_COLS - 1; j >= 0; j--) { if (rodValue(fracRods[j]) > 0) { low = j; break; } }
    for (let j = 0; j <= low; j++) {
      const L = columnLetter(j);
      chips.push({ side: 'frac', place: j, letter: L, digit: rodValue(fracRods[j]), peg: pegs[L], flipped: true });
    }
  }
  return chips;
}
