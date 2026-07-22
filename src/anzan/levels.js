// ============================================================================
// Flash anzan — the ladder.
//
// Anzan (暗算) is the soroban's endgame: the beads move on an imagined board.
// FLASH anzan is its competition form — numbers appear one at a time, each
// erased before the next arrives, and you add them as they land. There is no
// board to read back and nothing to re-check, so it can only be done the way
// the guided-practice track already teaches: seeing the rods rather than the
// digits. This page is where the mnemonic-mental track's Mental stage goes to
// be used (see src/tutorial/prognosis.js).
//
// Difficulty is three independent axes — how MANY numbers, how WIDE each one
// is, and how FAST they come — so this is a ladder over the first two with
// speed left as a live control (SPEEDS below). A level is never locked: the
// rod trainer's rule, for the same reason, which is that the ladder is advice
// and the learner knows which axis they want to push today.
//
// Frozen data only; the state machine is anzanSession.js. Unit-tested in
// test/anzanLevels.test.js.
// ============================================================================

// The flash interval, slowest → fastest, in ms per number. The bottom of this
// list is roughly competition pace: 10 three-digit numbers at 200 ms is two
// seconds of screen time for the whole round.
export const SPEEDS = Object.freeze([2000, 1600, 1300, 1000, 800, 650, 500, 400, 300, 250, 200]);

// Share of each interval the number is actually lit; the rest is blank. The gap
// is not decoration — without it two equal consecutive numbers read as one long
// flash, and the count silently drops by one.
export const LIT_SHARE = 0.68;

export const ANZAN_LEVELS = Object.freeze([
  {
    id: 'warm', title: 'Warm-up · 3 × 1 digit', terms: 3, digits: 1, baseMs: 1600, floor: 5,
    teach: 'Three single digits. Everything happens on the <b>ones rod</b> — the only moves are the direct ones and the five-complement you drilled in <i>Small friend</i>. Watch the rod, not the numeral.',
  },
  {
    id: 'five1', title: '5 × 1 digit', terms: 5, digits: 1, baseMs: 1300, floor: 5,
    teach: 'Five digits now, so the ones rod overflows and you carry into the tens. This is <i>Big friend</i> with nothing to look at.',
  },
  {
    id: 'ten1', title: '10 × 1 digit', terms: 10, digits: 1, baseMs: 1000, floor: 5,
    teach: 'Ten in a row. The arithmetic has not changed — what is being trained is <b>holding the board</b> while the next number lands on it.',
  },
  {
    id: 'three2', title: '3 × 2 digits', terms: 3, digits: 2, baseMs: 1600, floor: 5,
    teach: 'Two rods at once. Read each number as a <b>pair of rods</b>, tens and ones together, and set both in one gesture — reading it as “forty-seven” and then converting is the slow path.',
  },
  {
    id: 'five2', title: '5 × 2 digits', terms: 5, digits: 2, baseMs: 1300, floor: 5,
    teach: 'Five two-digit numbers. Carries now propagate: a ten-complement on the ones rod moves a bead on the tens rod, which may itself be full.',
  },
  {
    id: 'ten2', title: '10 × 2 digits', terms: 10, digits: 2, baseMs: 1000, floor: 5,
    teach: 'The standard club exercise. If you lose the board, let the number go and keep the rods you still hold — recovering one rod beats restarting none.',
  },
  {
    id: 'three3', title: '3 × 3 digits', terms: 3, digits: 3, baseMs: 1600, floor: 4,
    teach: 'Three rods. The hundreds rod barely moves, so give it the least attention and spend it on the ones — that is where every trade starts.',
  },
  {
    id: 'five3', title: '5 × 3 digits', terms: 5, digits: 3, baseMs: 1300, floor: 4,
    teach: 'Five three-digit numbers — the shape most flash-anzan practice settles on. Compound trades appear here: a carry whose payback is itself blocked.',
  },
  {
    id: 'ten3', title: '10 × 3 digits', terms: 10, digits: 3, baseMs: 1000, floor: 3,
    teach: 'Competition shape. At the fastest speeds the whole round is under three seconds of screen time; there is no time to name a single digit, only to move rods.',
  },
].map(Object.freeze));

export const levelById = id => ANZAN_LEVELS.find(l => l.id === id) || null;

// Nearest speed in SPEEDS, then step by `dir` rungs (−1 = slower, +1 = faster).
// Clamped, so the caller can wire two buttons without bounds-checking.
export function speedStep(ms, dir = 0) {
  let i = 0, best = Infinity;
  for (let k = 0; k < SPEEDS.length; k++) {
    const d = Math.abs(SPEEDS[k] - ms);
    if (d < best) { best = d; i = k; }
  }
  return SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + dir))];
}

// Every term has exactly `digits` digits — a 2-digit round never slips a 7 in.
// That is the classic rule, and it matters: the width of the number is the
// difficulty, so a narrow term would be a free one.
export function genRound(level, rng) {
  const lo = level.digits === 1 ? 1 : 10 ** (level.digits - 1);
  const span = 10 ** level.digits - lo;
  const terms = [];
  for (let i = 0; i < level.terms; i++) terms.push(lo + rng.int(span));
  return { terms, sum: terms.reduce((a, b) => a + b, 0) };
}

// Total screen time for one round — what the page quotes, and what makes the
// speed control legible ("10 × 3 digits @ 900 ms = 9.0 s").
export const roundMs = (level, intervalMs) => level.terms * intervalMs;
