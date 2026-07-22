// ============================================================================
// The call — a number turned into the words a caller says, and the script of a
// whole dictation round.
//
// 読上算 (yomiage-zan) is the soroban exercise where the numbers are READ ALOUD
// and never shown: the caller opens, calls each term, and asks for the total.
// It is a third modality, not a harder anzan — practice reads digits with the
// eyes, flash anzan reads them faster, and this one never shows them at all.
// The ear has to reach the rods directly, with no numeral in between.
//
// THE WHOLE NUMBER IS SPOKEN, not its digits: "three thousand four hundred
// twenty-five", never "three four two five". Reading digit by digit would be a
// different and much easier exercise — you would be handed the rods already
// separated, which is precisely the work this trains.
//
// No "and" before the tens ("three hundred twenty-five"): every speech engine
// reads it cleanly, and a caller counting time does not add syllables.
//
// Pure — no DOM, no speech API, no globals. The VoiceService in the view layer
// is what actually says these strings. Unit-tested in test/yomiageWords.test.js.
// ============================================================================

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];

function under100(n) {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)], r = n % 10;
  return r ? `${t}-${ONES[r]}` : t;
}

function under1000(n) {
  if (n < 100) return under100(n);
  const h = `${ONES[Math.floor(n / 100)]} hundred`;
  const r = n % 100;
  return r ? `${h} ${under100(r)}` : h;
}

// A non-negative integer in words. The sign is the CALLER's job (a term is
// announced as "plus …" or "minus …"), so this never says "negative".
export function words(n) {
  let v = Math.abs(Math.round(Number(n) || 0));
  if (v < 1000) return under1000(v);
  const parts = [];
  for (const [size, name] of SCALES) {
    if (v >= size) {
      parts.push(`${under1000(Math.floor(v / size))} ${name}`);
      v %= size;
    }
  }
  if (v) parts.push(under1000(v));
  return parts.join(' ');
}

// The traditional calls, in the positions the Japanese ones occupy:
//   negaimashite wa …  → the opening, which is the cue to clear the board
//   … de wa            → each following term
//   … wa ikura?        → the request for the total
export const OPENING = 'Ready';
export const CLOSING = 'How much?';

// One term as it is called. The first term carries no sign word — the round has
// only just opened and there is nothing to add it to yet.
export function callFor(term, index = 0) {
  const n = words(Math.abs(term));
  if (index === 0) return n;
  return `${term < 0 ? 'minus' : 'plus'} ${n}`;
}

/**
 * The whole round as an ordered script of utterances. The session walks this
 * and nothing else, which is what keeps the schedule free of arithmetic.
 * @returns [{ kind: 'open'|'term'|'close', text, index }]  (index: term number, else -1)
 */
export function scriptFor(terms = []) {
  return [
    { kind: 'open', text: OPENING, index: -1 },
    ...terms.map((t, i) => ({ kind: 'term', text: callFor(t, i), index: i })),
    { kind: 'close', text: CLOSING, index: -1 },
  ];
}

// How long an utterance will take to say, when the speech engine will not tell
// us. Speech runs about 2.7 words a second at rate 1, and a call is short, so
// this is a word count with a floor — deliberately generous, because cutting a
// caller off mid-number loses the term entirely while waiting too long only
// costs a beat.
export function estimateMs(text, rate = 1) {
  const wordCount = String(text || '').trim().split(/[\s-]+/).filter(Boolean).length;
  return Math.max(500, Math.round((wordCount * 370 + 220) / (rate || 1)));
}
