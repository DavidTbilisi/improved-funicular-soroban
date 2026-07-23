// ============================================================================
// Drill decks — Strategy pattern. Each deck is an interchangeable strategy with
// { label, floorMs, mode, gen(rng) }. gen() returns an item:
//   { prompt, sub, answers:[...], reveal, small?, fact? }
// Ordered per the tier discipline: atomics → cells → scenes → seals, with the
// finger times-table decks appended after them (their own discipline).
// gen() takes an rng (see rng.js) so items are reproducible under test.
//
// Decks over a FINITE fact space may also declare { facts, genFact(fact, rng) }:
// the session then deals facts from a shuffled bag (full coverage per round,
// missed facts re-dealt early — see drillSession.js) instead of sampling gen()
// i.i.d. Such items carry their `fact` so misses can be requeued and per-fact
// stats aggregated; gen() stays as the uniform fallback.
// ============================================================================
import { HEX_SYMS, AUDIO_PEGS, VISUAL_PEGS } from '../domain/pegs.js';
import { cubeEmojis, cubeName } from '../domain/faces.js';
import { matrixCell, hexCell, packAction } from '../domain/codec/cell.js';
import { deepPackScenes, sceneStory } from '../domain/codec/scene.js';
import { sealDigit, sealHex } from '../domain/codec/codec.js';
import { sealPerceptHex } from '../domain/codec/scene.js';
import {
  fingerPlan, fingerStory, handGlyph, handGlyphR,
  nineFoldPlan, nineFoldStory,
} from '../domain/fingers.js';
import { motionFor, fingeringOf, fingeringStory } from '../domain/fingering.js';
import { stripStoryDigits } from './text.js';
import { placement, digitsOf } from '../domain/decimalPoint.js';

// The fact spaces of the finger decks: the hard 6–9 corner of the times table
// (both operand orders — recognizing 6×9 and 9×6 are separate skills) and the
// 9s row of the nine-fold method.
const FINGER_FACTS = Object.freeze(Array.from({ length: 16 }, (_, i) => {
  const a = 6 + (i >> 2), b = 6 + (i & 3);
  return Object.freeze({ key: `${a}x${b}`, kind: 'raise', a, b });
}));
const NINE_FACTS = Object.freeze(Array.from({ length: 8 }, (_, i) =>
  Object.freeze({ key: `9f${i + 2}`, kind: 'fold', n: i + 2 })));

// The twelve primitive bead moves — every motion a hand can be asked for, the
// carry included. A finite space, so the fingering rule is drilled to coverage
// rather than sampled.
const BEAD_FACTS = Object.freeze(['+1', '+2', '+3', '+4', '+5', '+10',
  '-1', '-2', '-3', '-4', '-5', '-10'].map(step =>
  Object.freeze({ key: `bead${step}`, kind: 'bead', step })));

export const DRILL_DECKS = {
  faceToDigit: {
    label: 'Face → digit', floorMs: 1000, mode: 'type',
    gen(rng) {
      const d = rng.int(10);
      return { prompt: d === 0 ? '·' : cubeEmojis(d), sub: 'cube percept → type the digit', answers: [String(d)], reveal: `${d} = ${cubeName(d)}` };
    },
  },
  digitToFace: {
    label: 'Digit → face', floorMs: 1000, mode: 'reveal',
    gen(rng) {
      const d = rng.int(10);
      return { prompt: String(d), sub: 'see the cube percept before revealing', answers: [], reveal: `${d === 0 ? '·' : cubeEmojis(d)} — ${cubeName(d)}` };
    },
  },
  audioPeg: {
    label: 'Audio peg → index', floorMs: 1000, mode: 'type',
    gen(rng) {
      const i = rng.int(16); const p = AUDIO_PEGS[i];
      return { prompt: p.emoji, sub: 'audio peg (tens) → type 0-9 or A-F', answers: [HEX_SYMS[i], String(i)], reveal: `${HEX_SYMS[i]} = ${p.word}` };
    },
  },
  visualPeg: {
    label: 'Visual peg → index', floorMs: 1000, mode: 'type',
    gen(rng) {
      const i = rng.int(16); const p = VISUAL_PEGS[i];
      return { prompt: p.emoji, sub: 'visual peg (units) → type 0-9 or A-F', answers: [HEX_SYMS[i], String(i)], reveal: `${HEX_SYMS[i]} = ${p.word}` };
    },
  },
  cellToNumber: {
    label: 'Cell → number', floorMs: 1500, mode: 'type',
    gen(rng) {
      const nn = rng.int(100); const c = matrixCell(nn); const s = String(nn).padStart(2, '0');
      const v = c.visual.rot ? `<span class="rot90">${c.visual.emoji}</span>` : c.visual.emoji;
      return { prompt: c.audio.emoji + v, sub: 'cell percept (audio × visual) → type the two digits', answers: [s, String(nn)], reveal: `${s} = ${c.name}` };
    },
  },
  numberToCell: {
    label: 'Number → cell', floorMs: 1500, mode: 'reveal',
    gen(rng) {
      const nn = rng.int(100); const c = matrixCell(nn);
      return { prompt: String(nn).padStart(2, '0'), sub: 'see the cell percept before revealing', answers: [], reveal: `${c.audio.emoji}${c.visual.emoji} — ${c.name}` };
    },
  },
  hexByte: {
    label: 'Hex byte → 0xNN', floorMs: 1500, mode: 'type',
    gen(rng) {
      const hi = rng.int(16), lo = rng.int(16); const c = hexCell(hi, lo);
      return { prompt: c.audio.emoji + c.visual.emoji, sub: 'byte cell → type two hex symbols', answers: [c.hexStr], reveal: `0x${c.hexStr} = ${c.name}` };
    },
  },
  actionToDigit: {
    label: 'Action → digit', floorMs: 1000, mode: 'type',
    gen(rng) {
      const d = rng.int(10); const a = packAction(d);
      return { prompt: a.emoji, sub: 'action percept → type the digit (flame = +5, rose stays an actor!)', answers: [String(d)], reveal: `${d} = ${a.name}` };
    },
  },
  storyToDigits: {
    label: 'Scene → 5 digits', floorMs: 3000, mode: 'type',
    gen(rng) {
      const s = rng.digits(5); const scene = deepPackScenes(s)[0];
      return { prompt: stripStoryDigits(sceneStory(scene)), sub: 'decode the scene → type the 5 digits', answers: [s], reveal: `${s} — ${sceneStory(scene)}`, small: true };
    },
  },
  digitsToScene: {
    label: '5 digits → scene', floorMs: 8000, mode: 'reveal',
    gen(rng) {
      const s = rng.digits(5); const scene = deepPackScenes(s)[0];
      return { prompt: s, sub: 'compose the scene before revealing', answers: [], reveal: sceneStory(scene), small: true };
    },
  },
  sealDec: {
    label: 'Seal (decimal)', floorMs: 15000, mode: 'type',
    gen(rng) {
      const s = rng.digits(10);
      return { prompt: s, sub: 'digit-sum mod 9, 0 written as 9 → type the seal', answers: [String(sealDigit(s))], reveal: `seal ${sealDigit(s)} = ${cubeEmojis(sealDigit(s))}`, small: true };
    },
  },
  sealHexDeck: {
    label: 'Seal (hex)', floorMs: 20000, mode: 'type',
    gen(rng) {
      const s = rng.hexString(8);
      const v = sealHex(s);
      return { prompt: '0x' + s, sub: 'nibble-sum mod 15, 0 written as F → type the seal (0-9/A-F)', answers: [HEX_SYMS[v], String(v)], reveal: `seal ${HEX_SYMS[v]} = ${sealPerceptHex(v)}`, small: true };
    },
  },
  erasure: {
    label: 'Erasure repair', floorMs: 20000, mode: 'type',
    gen(rng) {
      const s = rng.digits(10); const seal = sealDigit(s); const idx = rng.int(10);
      const missing = +s[idx];
      const shown = s.slice(0, idx) + '▢' + s.slice(idx + 1);
      const answers = (missing === 0 || missing === 9) ? ['0', '9'] : [String(missing)];
      return {
        prompt: `${shown}   (seal ${seal})`,
        sub: 'missing digit ≡ seal − sum of the rest (mod 9) → type it',
        answers,
        reveal: `▢ = ${missing}${(missing === 0 || missing === 9) ? ' (0 and 9 are both seal-consistent — mod-9 cannot tell them apart)' : ''}`,
        small: true,
      };
    },
  },
  fingerRead: {
    // Stage 1 of the finger ladder: fluently READ a pair of hands — raised
    // fingers count tens, folded multiply into units. Computing is the point
    // here (the floor allows it); Finger × below is where recall takes over.
    label: 'Hands → product', floorMs: 4000, mode: 'type',
    facts: FINGER_FACTS,
    genFact(fact) {
      const p = fingerPlan(fact.a, fact.b);
      return {
        prompt: `${handGlyph(p.upA)} ✕ ${handGlyphR(p.upB)}`,
        sub: 'read the hands — raised count tens, folded multiply into units → type the product',
        answers: [String(p.product)],
        reveal: fingerStory(fact.a, fact.b),
        fact,
      };
    },
    gen(rng) { return this.genFact(this.facts[rng.int(this.facts.length)], rng); },
  },
  fingerTimes: {
    // Not a codec tier — the hard 6–9 corner of the times table, drilled the
    // CRA way: compute on the hands first, let recall displace them. The floor
    // is tuned for *recall*, not finger work: early sessions run over it, and
    // the under-floor share climbing toward 100% is the signal that the fact
    // has become automatic and the hands have faded.
    label: 'Finger ×', floorMs: 2500, mode: 'type',
    facts: FINGER_FACTS,
    genFact(fact) {
      return {
        prompt: `${fact.a} × ${fact.b}`,
        sub: 'work it on your hands (fingers = 6–9) until recall beats them → type the product',
        answers: [String(fingerPlan(fact.a, fact.b).product)],
        reveal: fingerStory(fact.a, fact.b),
        fact,
      };
    },
    gen(rng) { return this.genFact(this.facts[rng.int(this.facts.length)], rng); },
  },
  nineFold: {
    // The sibling trick for the 9s row: fold finger n of ten, read tens left
    // of the fold and units right of it. Same CRA arc as Finger ×.
    label: '9-fold ×', floorMs: 2000, mode: 'type',
    facts: NINE_FACTS,
    genFact(fact, rng) {
      const p = nineFoldPlan(fact.n);
      return {
        prompt: rng.int(2) ? `${fact.n} × 9` : `9 × ${fact.n}`,
        sub: 'fold that finger of ten — tens left of the fold, units right → type the product',
        answers: [String(p.product)],
        reveal: nineFoldStory(fact.n),
        fact,
      };
    },
    gen(rng) { return this.genFact(this.facts[rng.int(this.facts.length)], rng); },
  },
  percentOf: {
    // Percentages on the soroban: P% of N = N × P ÷ 100 — and the ÷100 is not a
    // move but a two-rod place shift. The result slides right: whole digits land
    // on the integer rods, and a leftover half lands on the tenths rod. Drills
    // that multiply-then-shift routine. Bases are multiples of 10 and percents
    // multiples of 5, so N×P is always a multiple of 50 → every answer is whole
    // or lands on a single .5 (never finer than the tenths rod). Not a codec
    // tier or a finger trick — its own soroban-arithmetic discipline.
    label: '% of a number', floorMs: 8000, mode: 'type',
    gen(rng) {
      const PCTS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80];
      const pct = PCTS[rng.int(PCTS.length)];
      const base = 10 * (2 + rng.int(98)); // 20..990, a multiple of 10
      const product = base * pct;          // the multiply step (exact integer)
      const half = product % 100 === 50;   // ÷100 leaves a half on the tenths rod
      const whole = Math.floor(product / 100);
      const value = half ? `${whole}.5` : String(whole);
      return {
        prompt: `${pct}% of ${base}`,
        sub: 'multiply, then shift two rods right (÷100) → type the result',
        // accept the padded ".50" spelling of a half so an over-typed answer grades correct
        answers: half ? [value, `${whole}.50`] : [value],
        reveal: `${base} × ${pct} = ${product}, shift ÷100 → ${value}`,
      };
    },
  },
  // --- Where the point goes ------------------------------------------------
  // A soroban does not know where the point is: the rods hold digits, and the
  // point is a decision the operator makes and honours at the end. So these two
  // decks hand over the DIGITS — the part the board would have given you — and
  // ask only for the placement. It is the one thing on a real paper that the
  // beads cannot do for you, and the reason 4級 marks get lost.
  pointMul: {
    label: 'Point: ×', floorMs: 5000, mode: 'type',
    gen(rng) {
      const a = decimalOperand(rng), b = decimalOperand(rng);
      const digits = String(Number(digitsOf(a)) * Number(digitsOf(b)));
      const p = placement('×', a, b, digits);
      return {
        prompt: `${a} × ${b}`,
        sub: `the board gives you <b>${p.digits}</b> — type it with the point in`,
        answers: p.accepted,
        reveal: p.rule,
      };
    },
  },
  pointDiv: {
    label: 'Point: ÷', floorMs: 5000, mode: 'type',
    gen(rng) {
      // Built from an exact digit division, then each operand is given a point:
      // the digits are always clean, so the question is only ever the placement.
      // The dividend's digits may not end in 0 — writing 490 as "4.90" makes the
      // trailing zero load-bearing (it IS a rod here), and a question whose
      // meaning depends on spotting that is testing typography, not placement.
      let bd = 2 + rng.int(8), qd = 2 + rng.int(97);  // divisor 2..9, quotient 2..98
      for (let k = 0; k < 40 && (bd * qd) % 10 === 0; k++) qd = 2 + rng.int(97);
      const a = withPoint(String(bd * qd), rng), b = withPoint(String(bd), rng);
      const p = placement('÷', a, b, String(qd));
      return {
        prompt: `${a} ÷ ${b}`,
        sub: `the board gives you <b>${p.digits}</b> — type it with the point in`,
        answers: p.accepted,
        reveal: p.rule,
      };
    },
  },
  // --- 運指: which finger, and how many motions -----------------------------
  // The other thing the screen cannot see. Every deck above asks what the
  // answer is; these two ask what the HAND does, which is what a teacher
  // standing over the board would correct and what nobody self-taught ever
  // hears. Both are graded off `src/domain/fingering.js`, so the drill, the
  // coach line and the plate can never give three different answers.
  fingerBead: {
    // The rule itself, one bead move at a time: thumb or index. Twelve facts,
    // dealt from the bag so every motion comes round — including the two that
    // look like exceptions until you say the rule out loud (the heaven bead is
    // the index finger's in BOTH directions).
    label: 'Which finger?', floorMs: 1200, mode: 'type',
    facts: BEAD_FACTS,
    genFact(fact) {
      const m = motionFor(fact.step);
      return {
        prompt: fact.step.replace('-', '−'),
        sub: `${m.rod === 1 ? 'the carry — ' : ''}${beadPhrase(m)} → type thumb or index`,
        answers: [m.finger, m.finger[0]],
        reveal: `${m.finger} — ${m.text}.`,
        fact,
      };
    },
    gen(rng) { return this.genFact(this.facts[rng.int(this.facts.length)], rng); },
  },
  fingerMotions: {
    // The rule applied: a whole ±digit onto a rod that is already holding
    // something, answered with the number of motions the hand makes. It is a
    // number rather than a vocabulary, so there is nothing to spell — and it
    // is the number that matters, since technique on a soroban is exactly the
    // business of not making a motion you did not have to.
    label: 'Motions?', floorMs: 4000, mode: 'type',
    gen(rng) {
      const c = rng.int(10);
      const d = 1 + rng.int(9);
      const sign = rng.int(2) ? '+' : '-';
      const f = fingeringOf(c, sign, d);
      return {
        prompt: `${c} ${sign === '-' ? '−' : '+'} ${d}`,
        sub: 'one rod holding ' + c + ' — how many motions does the hand make? ' +
          '(everything that can go at once, does)',
        answers: [String(f.gestureCount)],
        reveal: fingeringStory(c, sign, d),
        fingering: { c, sign, d },
      };
    },
  },
};

// One bead move as the phrase the deck asks it with — the motion without its
// finger, which is the answer.
const beadPhrase = m => m.bead === 'heaven'
  ? `the heaven bead ${m.travel} ${m.toward ? 'to' : 'off'} the bar`
  : `${m.n} earth bead${m.n > 1 ? 's' : ''} ${m.travel} ${m.toward ? 'to' : 'off'} the bar`;

// --- helpers for the point decks --------------------------------------------
// A written operand with 0–2 decimals. Trailing zeros are never generated: a
// written "12.40" is a legitimate operand but an ambiguous QUESTION, since the
// learner cannot tell it from 12.4 without being told the zero is deliberate.
function decimalOperand(rng) {
  const digits = String(2 + rng.int(98));             // 2..99, no trailing zero
  return withPoint(digits.replace(/0$/, '4'), rng);
}

// Put a point 0, 1 or 2 rods from the right of a digit string.
function withPoint(digits, rng) {
  const places = rng.int(3);
  if (!places) return digits;
  const padded = digits.padStart(places + 1, '0');
  const cut = padded.length - places;
  return `${padded.slice(0, cut)}.${padded.slice(cut)}`;
}
