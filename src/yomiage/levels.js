// ============================================================================
// 読上算 — the ladder.
//
// The difficulty axes are the column's (how many terms, how wide, with or
// without minus terms) plus one this page owns alone: the GAP the caller leaves
// after each number. That gap is the whole game. It is not a display speed —
// there is nothing on screen — it is how long you have to hear a number, set it
// on the beads and be ready for the next one. Like anzan's pace it is a live
// control rather than a laddered one, because the learner knows which axis they
// want to push today, and rungs are never locked.
//
// THE COLUMN IS THE EXAM'S COLUMN. genRound calls the kyu paper's `genMitori`,
// so the paper-setter's rules — exact digit width, first term never negative,
// minus capped near a third, and a running total that never goes below zero —
// hold here too and cannot drift apart from the exam's. A dictation column that
// dipped negative would be unanswerable on a real board for exactly the same
// reason: there is nothing left of the top rod to borrow from.
//
// Frozen data + one generator call. Unit-tested in test/yomiageLevels.test.js.
// ============================================================================
import { genMitori } from '../exam/paper.js';

// Silence after each call, slowest → fastest, in ms. The bottom of the list is
// club pace: a two-digit number every second, called without pause.
export const GAPS = Object.freeze([3000, 2500, 2000, 1600, 1300, 1000, 800, 600, 400]);

export const YOMIAGE_LEVELS = Object.freeze([
  {
    id: 'warm', title: 'Warm-up · 3 × 1 digit', terms: 3, digits: 1, minus: false, baseGap: 2500, floor: 5,
    teach: 'Three single digits, called aloud. Set each one as you hear it — do <b>not</b> hold them and add at the end. The board is your memory here, which is the entire point of doing this on beads.',
  },
  {
    id: 'five1', title: '5 × 1 digit', terms: 5, digits: 1, minus: false, baseGap: 2000, floor: 5,
    teach: 'Five digits. The ones rod overflows, so a carry has to happen while the next number is already being called.',
  },
  {
    id: 'five2', title: '5 × 2 digits', terms: 5, digits: 2, minus: false, baseGap: 2000, floor: 5,
    teach: 'Two-digit numbers. Hear the whole number, not two digits: “forty-seven” is one gesture on two rods, and converting it in your head first is the slow path.',
  },
  {
    id: 'ten2', title: '10 × 2 digits', terms: 10, digits: 2, minus: true, baseGap: 1600, floor: 5,
    teach: 'Ten terms, and <b>minus</b> arrives. A call of “minus sixty-three” has to reach the beads as a borrow without a pause for translation.',
  },
  {
    id: 'five3', title: '5 × 3 digits', terms: 5, digits: 3, minus: true, baseGap: 1600, floor: 4,
    teach: 'Three rods per number. The hundreds rod barely moves; spend your attention on the ones, where every trade starts.',
  },
  {
    id: 'ten3', title: '10 × 3 digits', terms: 10, digits: 3, minus: true, baseGap: 1300, floor: 3,
    teach: 'The 読上算 shape a club actually calls. If you lose a number, let it go and keep the board you have — a column with one term missing still scores nothing, but a board you abandoned teaches nothing either.',
  },
].map(Object.freeze));

export const levelById = id => YOMIAGE_LEVELS.find(l => l.id === id) || null;

// Nearest gap in GAPS, then step by `dir` rungs (−1 = slower, +1 = faster).
export function gapStep(ms, dir = 0) {
  let i = 0, best = Infinity;
  for (let k = 0; k < GAPS.length; k++) {
    const d = Math.abs(GAPS[k] - ms);
    if (d < best) { best = d; i = k; }
  }
  return GAPS[Math.max(0, Math.min(GAPS.length - 1, i + dir))];
}

export const genRound = (level, rng) =>
  genMitori({ terms: level.terms, digits: level.digits, minus: level.minus }, rng);
