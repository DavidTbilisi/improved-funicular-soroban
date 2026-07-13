// ============================================================================
// Abacus geometry constants. Kept in one module so the width of the soroban is
// changed in exactly one place (Open/Closed: rows/columns scale from here).
// ============================================================================
export const INT_COLS = 19;  // A=ones … S=10^18 (a full 23-rod standard soroban with FRAC_COLS)
export const FRAC_COLS = 4;  // flipped A=tenths … D=ten-thousandths
// 19 integer digits overflow JS's exact-integer range, so the numeric core
// (rod.js / abacusStore.js) works in BigInt; MAXINT is a BigInt to match.
export const MAXINT = 10n ** BigInt(INT_COLS) - 1n;

// Contracted numeric place labels (1k = thousands, 1m = millions, 1b = billions,
// 1t = trillions, 1qa = quadrillions, 1qi = quintillions) so the rod strip reads
// as consistent short forms rather than spelled-out words.
export const INT_PLACES  = ['1', '10', '100', '1k', '10k', '100k', '1m', '10m', '100m',
  '1b', '10b', '100b', '1t', '10t', '100t', '1qa', '10qa', '100qa', '1qi'];
export const FRAC_PLACES = ['0.1', '0.01', '0.001', '0.0001'];

export function columnLetter(i) { return String.fromCharCode(65 + i); }
