// ============================================================================
// 運指 — which finger, and how many motions. Pure logic, no DOM.
//
// Every other module here answers WHAT to move: `classifyAdd`/`classifySub`
// pick the complement, `planAdd`/`planSub` flatten it into single bead moves.
// None of them says HOW the hand does it, which is the first thing a teacher
// corrects and the last thing a screen can see. This is that layer, and it is
// two rules deep:
//
//   • The THUMB pushes earth beads UP to the bar. That is all it does.
//   • The INDEX finger does everything else — earth beads down off the bar,
//     and the heaven bead in both directions.
//
// (Down and up are the instrument's, as in `src/a11y/boardSpeech.js`: the
// heaven bead comes DOWN to the bar and the earth beads come UP to it, so
// "toward the bar" is a different direction for each group. Getting that
// backwards would teach the instrument wrong.)
//
// From those two rules the interesting part falls out on its own. A ±digit is
// often TWO bead moves, and whether the hand makes one motion or two is not a
// matter of speed but of which fingers the two moves ask for:
//
//   +6 = +5 +1   index down on the heaven bead, thumb up on an earth bead —
//                two fingers, so they converge in ONE pinch.
//   +4 = +5 −1   index both times, but both beads travel DOWN — one finger,
//                one sweep past the bar.
//   −4 = −5 +1   index lifts the heaven bead, thumb pushes an earth bead —
//                two fingers again, one motion.
//   −6 = −5 −1   index both times, in OPPOSITE directions. One finger cannot
//                be in two places: this one is genuinely two motions, and the
//                earth bead goes first (the 運珠 both the Japanese and the
//                English teaching traditions give — see the module tests,
//                which prove the swap is legal in either order).
//
// So: two motions fuse into one gesture iff they need DIFFERENT fingers, or
// the same finger travelling the same way. A gesture is at most two motions,
// because a hand working a soroban has two fingers.
//
// The carry (±10) is a bead on the NEXT rod and joins the same rule — the
// thumb carrying one rod while the index clears another is standard technique.
// But it only ever joins a motion nothing else wants: the same-rod pair is the
// taught unit, and the carry pairs off only when the payback is a single move.
//
// This is instruction, not enforcement. The app's keyboard has no fingers and
// cannot mark you on this; what it can do is tell you, every time it shows a
// chain, what your hand should have done — and drill it (`fingerBead` /
// `fingerMotions` in `src/drill/decks.js`).
// ============================================================================
import { planAdd, planSub } from './movePlan.js';

export const THUMB = 'thumb';
export const INDEX = 'index';

// The whole rule as a table, for the plate and the deck. `toward` = the bead is
// being pushed to the bar (it starts counting); away = it is being taken off.
export const FINGER_RULES = Object.freeze([
  Object.freeze({ bead: 'earth', toward: true, travel: 'up', finger: THUMB,
    what: 'earth beads up to the bar', why: 'the one job of the thumb' }),
  Object.freeze({ bead: 'earth', toward: false, travel: 'down', finger: INDEX,
    what: 'earth beads down off the bar', why: 'the thumb never pulls' }),
  Object.freeze({ bead: 'heaven', toward: true, travel: 'down', finger: INDEX,
    what: 'the heaven bead down to the bar', why: 'the heaven bead is the index finger’s, both ways' }),
  Object.freeze({ bead: 'heaven', toward: false, travel: 'up', finger: INDEX,
    what: 'the heaven bead up off the bar', why: 'the heaven bead is the index finger’s, both ways' }),
]);

const beads = n => `${n} earth bead${n > 1 ? 's' : ''}`;

/**
 * One primitive step ('+3', '-5', '+10', …) as a finger motion.
 *   { step, bead, n, sign, rod, finger, travel, toward, text }
 * `rod` is 0 for this rod and 1 for the carry's rod (the next one left).
 */
export function motionFor(step) {
  const sign = step[0] === '-' ? -1 : 1;
  const mag = Math.abs(Number(step));
  if (![1, 2, 3, 4, 5, 10].includes(mag)) throw new Error(`motionFor: not a bead move: ${step}`);
  const bead = mag === 5 ? 'heaven' : 'earth';
  const rod = mag === 10 ? 1 : 0;
  const n = mag === 10 || bead === 'heaven' ? 1 : mag;
  const toward = sign > 0;
  // Toward the bar is UP for an earth bead and DOWN for the heaven bead.
  const travel = bead === 'heaven' ? (toward ? 'down' : 'up') : (toward ? 'up' : 'down');
  const finger = bead === 'earth' && toward ? THUMB : INDEX;
  const text = rod === 1
    ? (toward ? 'thumb pushes 1 earth bead up on the next rod (the carry)'
      : 'index pulls 1 earth bead down on the next rod (the borrow)')
    : bead === 'heaven'
      ? (toward ? 'index brings the heaven bead down to the bar'
        : 'index lifts the heaven bead up off the bar')
      : (toward ? `thumb pushes ${beads(n)} up to the bar`
        : `index pulls ${beads(n)} down off the bar`);
  return Object.freeze({ step, bead, n, sign, rod, finger, travel, toward, text });
}

// Two adjacent motions can be one gesture if they ask for different fingers,
// or the same finger travelling the same way (one sweep through both beads).
// A one-finger sweep is only ever a sweep on ONE rod — a finger cannot span two.
const canFuse = (a, b) =>
  a.finger !== b.finger ? true : a.rod === b.rod && a.travel === b.travel;

// The 運珠 order: where one finger has to make two motions on the same rod in
// opposite directions (only −(5+n) does this), the earth bead goes first. Both
// orders are legal — the two moves touch different bead groups — and this is
// the order the teaching gives, so it is the order the app narrates.
function taughtOrder(ms) {
  const out = ms.slice();
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i], b = out[i + 1];
    if (a.rod === b.rod && a.finger === b.finger && a.travel !== b.travel && a.bead === 'heaven') {
      out[i] = b; out[i + 1] = a; i++;
    }
  }
  return out;
}

/** The motions a flattened plan asks for, in the order a hand makes them. */
export const motionsFor = steps => taughtOrder(steps.map(motionFor));

const gesture = ms => {
  const kind = ms.length === 1 ? 'single'
    : ms[0].finger === ms[1].finger ? 'sweep' : 'together';
  // A pinch is the converging case — two fingers closing on the same rod from
  // opposite sides. The parallel cases (both travelling the same way, or one
  // finger on each of two rods) are just as simultaneous, but they do not feel
  // like a pinch and calling them one would teach the hand a shape it isn't.
  const pinch = kind === 'together' && ms[0].rod === ms[1].rod && ms[0].travel !== ms[1].travel;
  const crossRod = ms.length === 2 && ms[0].rod !== ms[1].rod;
  return Object.freeze({
    kind, pinch, crossRod, motions: Object.freeze(ms),
    fingers: Object.freeze([...new Set(ms.map(m => m.finger))]),
    steps: Object.freeze(ms.map(m => m.step)),
    label: kind === 'single' ? ms[0].finger
      : kind === 'sweep' ? 'index sweeps both'
        : `${ms[0].finger} + ${ms[1].finger} together`,
    text: kind === 'single' ? `The ${ms[0].text}.`
      : kind === 'sweep'
        ? `One index finger straight down through both: ${ms[0].bead === 'heaven'
          ? `the heaven bead to the bar and ${beads(ms[1].n)} off it`
          : `${beads(ms[0].n)} off the bar and the heaven bead to it`}.`
        : `The ${ms[0].text} as the ${ms[1].text} — ${pinch ? 'one pinch' : 'both at once'}.`,
  });
};

/**
 * A flattened plan's steps as the gestures a hand actually makes.
 * Greedy, left to right, with one preference: a pair on the SAME rod is the
 * taught unit, so the carry is not allowed to poach the first half of one.
 */
export function gesturesFor(steps) {
  const ms = motionsFor(steps);
  const out = [];
  for (let i = 0; i < ms.length;) {
    const a = ms[i], b = ms[i + 1], c = ms[i + 2];
    const poaching = b && a.rod !== b.rod && c && b.rod === c.rod && canFuse(b, c);
    if (b && canFuse(a, b) && !poaching) { out.push(gesture([a, b])); i += 2; }
    else { out.push(gesture([a])); i += 1; }
  }
  return out;
}

/** Whole ±digit on a rod showing c: the plan, plus how the hand plays it. */
export function fingeringOf(c, sign, d) {
  const plan = sign === '-' || sign === -1 ? planSub(c, d) : planAdd(c, d);
  const gestures = gesturesFor(plan.steps);
  return {
    from: c, op: `${sign === '-' || sign === -1 ? '−' : '+'}${d}`, rule: plan.rule,
    steps: plan.steps, motions: motionsFor(plan.steps), gestures,
    motionCount: plan.steps.length, gestureCount: gestures.length,
  };
}

/**
 * One line for a coach or a hint: 'thumb, then index + thumb together'.
 * Two singles in a row by the same finger are named as what they are — one
 * finger going back for a second motion, which is the cost the fusion rules
 * are there to explain.
 */
export const fingeringText = gestures => gestures
  .map((g, i) => (i && g.kind === 'single' && gestures[i - 1].label === g.label
    ? 'the same finger again' : g.label))
  .join(', then ');

/** The long form, for a reveal: a sentence per gesture, and the motion count. */
export function fingeringStory(c, sign, d) {
  const f = fingeringOf(c, sign, d);
  const n = f.gestureCount;
  return `${f.op} on a rod showing ${c}: ${f.gestures.map(g => g.text).join(' ')} ` +
    `${n} motion${n > 1 ? 's' : ''}.`;
}
