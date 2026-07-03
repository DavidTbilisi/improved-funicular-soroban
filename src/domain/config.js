// ============================================================================
// Abacus geometry constants. Kept in one module so the width of the soroban is
// changed in exactly one place (Open/Closed: rows/columns scale from here).
// ============================================================================
export const INT_COLS = 11;  // A=ones … K=10^10
export const FRAC_COLS = 4;  // flipped A=tenths … D=ten-thousandths
export const MAXINT = Math.pow(10, INT_COLS) - 1;

export const INT_PLACES  = ['ones', 'tens', 'hundreds', 'thousands', '10K', '100K', 'million', '10M', '100M', 'billion', '10B'];
export const FRAC_PLACES = ['tenths', 'hundredths', 'thousandths', 'ten-thousandths'];

export function columnLetter(i) { return String.fromCharCode(65 + i); }
