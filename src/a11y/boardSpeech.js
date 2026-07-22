// ============================================================================
// The board, in words.
//
// This app's whole argument is that a soroban is something you eventually stop
// looking at: the mnemonic-mental track fades the beads out, flash anzan takes
// the board away entirely, read-aloud reaches the rods through the ear. And yet
// until now the board itself was a silent pile of <div>s — unreadable by a
// screen reader, and unreadable to anyone who cannot see it. That is a strange
// gap in a trainer for an instrument that blind arithmeticians have used for a
// century, and it is the same idea taken one step further: if the board is
// worth imagining, it is worth SAYING.
//
// So this turns a board state into English, at three levels of detail:
//   • the VALUE — "one hundred twenty-three point four five"
//   • the RODS — "hundreds 1, tens 2, ones 3", high place to low
//   • the BEADS on a rod — "heaven bead down and two earth beads up", which is
//     what a finger would find, and the only description that distinguishes a
//     7 you can feel from a 7 you were told about.
//
// Down and up are the instrument's own directions: both mean TOWARD THE BAR —
// the heaven bead comes down to it, the earth beads go up to it — and a bead
// only counts when it is against the bar.
//
// Numbers go through the read-aloud caller's `words()`, so the board and the
// caller say a number the same way. Everything here is pure: a plain snapshot
// in, a string out, no DOM. Unit-tested in test/boardSpeech.test.js.
// ============================================================================
import { words } from '../yomiage/words.js';
import { rodValue } from '../domain/rod.js';

// Place names by exponent. The contracted labels the board prints (1k, 1m…) are
// for the eye; an ear needs the word.
const IN_GROUP = ['ones', 'tens', 'hundreds'];
const PREFIX = ['', 'ten ', 'hundred '];
const GROUPS = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion'];
const FRAC_NAMES = ['tenths', 'hundredths', 'thousandths', 'ten-thousandths'];

/** Exponent → the place's spoken name. 0 = ones, negatives are the fraction. */
export function placeName(exp) {
  if (exp < 0) return FRAC_NAMES[-exp - 1] || `ten to the ${exp}`;
  const group = Math.floor(exp / 3), rest = exp % 3;
  if (group === 0) return IN_GROUP[rest];
  const name = GROUPS[group];
  return name ? `${PREFIX[rest]}${name}s` : `ten to the ${exp}`;
}

/** What the beads on one rod are doing — the description a finger would give. */
export function beadPhrase(digit) {
  const d = Math.max(0, Math.min(9, digit | 0));
  if (d === 0) return 'clear';
  const parts = [];
  if (d >= 5) parts.push('heaven bead down');
  const earth = d % 5;
  if (earth) parts.push(`${earth} earth bead${earth === 1 ? '' : 's'} up`);
  return parts.join(' and ');
}

/** One rod, fully: "tens: 2, two earth beads up". */
export function rodSpeech(exp, digit) {
  return `${placeName(exp)}: ${digit}, ${beadPhrase(digit)}`;
}

// --- Reading a whole board ---------------------------------------------------
// The snapshot is the store's own shape: { int: [rod…], frac: [rod…] }, index 0
// = ones / tenths, so nothing here needs the store itself.
const digitsOf = rods => (rods || []).map(rodValue);

/** The number the board is holding, spoken. */
export function valueSpeech(state) {
  const int = digitsOf(state && state.int).slice().reverse().join('').replace(/^0+(?=\d)/, '') || '0';
  const frac = digitsOf(state && state.frac).join('').replace(/0+$/, '');
  const whole = words(int);
  // A fraction is read digit by digit — "point four five", never "forty-five
  // hundredths", because the rods are what is being read and each one is a
  // digit. It is also how every soroban text reads a decimal aloud.
  return frac ? `${whole} point ${frac.split('').map(d => words(d)).join(' ')}` : whole;
}

/**
 * Every rod that is holding something, high place to low. A board is mostly
 * empty rods and reading all twenty-three of them would bury the three that
 * matter; "clear" is said only when the whole board is.
 */
export function rodsSpeech(state, { beads = false } = {}) {
  const set = [];
  digitsOf(state && state.int).forEach((d, i) => { if (d) set.push({ exp: i, d }); });
  digitsOf(state && state.frac).forEach((d, i) => { if (d) set.push({ exp: -(i + 1), d }); });
  if (!set.length) return 'every rod clear';
  set.sort((a, b) => b.exp - a.exp);
  return set.map(r => (beads ? rodSpeech(r.exp, r.d) : `${placeName(r.exp)} ${r.d}`)).join(', ');
}

/** Where the keys will land, and what is under them. */
export function focusSpeech(state, exp) {
  const rods = exp >= 0 ? digitsOf(state && state.int) : digitsOf(state && state.frac);
  const idx = exp >= 0 ? exp : -exp - 1;
  const d = rods[idx] || 0;
  return `focus ${placeName(exp)}, ${d}, ${beadPhrase(d)}`;
}

/**
 * The whole announcement, in the order that is useful when you cannot see it:
 * what the board reads, which rods hold it, and where your keys are pointing.
 * @returns { value, rods, focus, text }
 */
export function boardSpeech(state, { focus = 0, beads = false } = {}) {
  const value = valueSpeech(state);
  const rods = rodsSpeech(state, { beads });
  const foc = focusSpeech(state, focus);
  return { value, rods, focus: foc, text: `Board reads ${value}. ${rods}. ${foc}.` };
}
