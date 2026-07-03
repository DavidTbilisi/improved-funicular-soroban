// ============================================================================
// Soroban complement rules — the pure decision engine behind keyboard
// arithmetic. Given the digit currently on a rod (c = 0..9) and a digit to add
// or subtract (d = 1..9), classify the physical bead move per the standard
// method:
//
//   direct       — enough free beads, move them straight
//   small friend — blocked by the 5-bead:  +d = +5 −(5−d)   /  −d = −5 +(5−d)
//   big friend   — crosses 10, carry/borrow: +d = +10 −(10−d) / −d = −10 +(10−d)
//
// A rod shows c as: upper bead (5) if c ≥ 5, plus (c % 5) lower beads (0..4).
// `move` nets to the signed amount (invariant checked in tests): the +10 / −10
// term is the carry/borrow applied to the next column.
// ============================================================================

// --- Literal single bead-move legality -------------------------------------
// A rod shows c as: heaven bead (5) if c ≥ 5, plus (c % 5) earth beads (0..4).
//
// Earth move: push up / pull down `n` (1..4) earth beads on this rod.
//   add legal iff there are n free earth beads; sub legal iff n are active.
export function earthMoveLegal(c, n, sign) {
  const lower = c % 5;
  return sign > 0 ? lower + n <= 4 : lower >= n;
}

// Heaven move: set (+5) or clear (−5) the single heaven bead.
//   add legal iff the heaven bead is currently up (c < 5);
//   sub legal iff it is currently down (c ≥ 5).
export function heavenMoveLegal(c, sign) {
  return sign > 0 ? c < 5 : c >= 5;
}

// Add digit d (1..9) onto current rod digit c (0..9).
export function classifyAdd(c, d) {
  const lowerFree = 4 - (c % 5);
  if (d <= 4) {
    if (lowerFree >= d) return { rule: 'direct', move: `+${d}`, carry: 0 };
    if (c + d <= 9) return { rule: 'small', move: `+5 -${5 - d}`, carry: 0 };
    return { rule: 'big', move: `+10 -${10 - d}`, carry: 1 };
  }
  // d = 5..9: place the 5-bead plus (d−5) lower beads, if there is room.
  if (c <= 4 && (c % 5) + (d - 5) <= 4) {
    return { rule: 'direct', move: d === 5 ? '+5' : `+5 +${d - 5}`, carry: 0 };
  }
  return { rule: 'big', move: `+10 -${10 - d}`, carry: 1 };
}

// Subtract digit d (1..9) from current rod digit c (0..9).
export function classifySub(c, d) {
  const lowerActive = c % 5;
  if (d <= 4) {
    if (lowerActive >= d) return { rule: 'direct', move: `-${d}`, borrow: 0 };
    if (c - d >= 0) return { rule: 'small', move: `-5 +${5 - d}`, borrow: 0 };
    return { rule: 'big', move: `-10 +${10 - d}`, borrow: 1 };
  }
  // d = 5..9: remove the 5-bead plus (d−5) lower beads, if they are there.
  if (c >= 5 && lowerActive >= (d - 5)) {
    return { rule: 'direct', move: d === 5 ? '-5' : `-5 -${d - 5}`, borrow: 0 };
  }
  return { rule: 'big', move: `-10 +${10 - d}`, borrow: 1 };
}
