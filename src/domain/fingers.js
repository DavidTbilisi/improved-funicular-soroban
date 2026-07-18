// ============================================================================
// Finger multiplication — the classic hands methods, pure logic, no DOM.
// The drill decks and the figures both derive from these plans, so narration
// and math can never drift apart.
//
// Raised-fingers method (the 6–10 square): number each hand's fingers 6..10
// (pinky→thumb) and raise (n−5) fingers per hand: the raised fingers count tens
// ((upA+upB)×10), the folded fingers multiply into units (downA×downB), and the
// sum is always the exact product — algebraically
// ((a−5)+(b−5))·10 + (10−a)(10−b) = a·b.
//
// Nine-fold method (the 9s row): hold all ten fingers up, numbered 1..10 left
// to right, and fold finger n: the fingers left of the fold are the tens digit,
// those right of it the units — (n−1)·10 + (10−n) = 9n.
// ============================================================================

export function fingerPlan(a, b) {
  if (a < 6 || a > 10 || b < 6 || b > 10) throw new Error(`fingerPlan needs 6..10, got ${a}×${b}`);
  const upA = a - 5, upB = b - 5;       // raised fingers per hand
  const downA = 10 - a, downB = 10 - b; // folded fingers per hand
  const tens = (upA + upB) * 10;
  const units = downA * downB;
  return { a, b, upA, upB, downA, downB, tens, units, product: tens + units };
}

// One hand as text: raised fingers filled, folded hollow. The two hands mirror
// like real hands raised toward you — left hand pinky-first (6 leftmost, thumb
// at the middle), right hand thumb-first (thumb at the middle, 6 rightmost) —
// so a glyph pair reads exactly like the plate in Fig. 1.
export const handGlyph = up => '●'.repeat(up) + '○'.repeat(5 - up);
export const handGlyphR = up => '○'.repeat(5 - up) + '●'.repeat(up);

// The reveal narration: hands, then the two counts, then the sum.
export function fingerStory(a, b) {
  const p = fingerPlan(a, b);
  return `${handGlyph(p.upA)} ✕ ${handGlyphR(p.upB)} — raised ${p.upA}+${p.upB} → ${p.tens} · ` +
    `folded ${p.downA}×${p.downB} = ${p.units} · ${p.tens}+${p.units} = ${p.product}`;
}

// --- Nine-fold ---------------------------------------------------------------

export function nineFoldPlan(n) {
  if (n < 2 || n > 9) throw new Error(`nineFoldPlan needs 2..9, got 9×${n}`);
  const left = n - 1, right = 10 - n; // fingers left/right of the folded one
  return { n, left, right, product: 9 * n };
}

// Ten fingers as text, the folded one hollow: fold 3 → ●●○●●●●●●●.
export const nineGlyph = n => '●'.repeat(n - 1) + '○' + '●'.repeat(10 - n);

export function nineFoldStory(n) {
  const p = nineFoldPlan(n);
  return `${nineGlyph(n)} — fold finger ${n}: ${p.left} left → ${p.left * 10} · ` +
    `${p.right} right → ${p.right} · 9×${n} = ${p.product}`;
}
