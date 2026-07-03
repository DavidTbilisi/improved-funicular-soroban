// ============================================================================
// Drill decks — Strategy pattern. Each deck is an interchangeable strategy with
// { label, floorMs, mode, gen(rng) }. gen() returns an item:
//   { prompt, sub, answers:[...], reveal, small? }
// Ordered per the tier discipline: atomics → cells → scenes → seals.
// gen() takes an rng (see rng.js) so items are reproducible under test.
// ============================================================================
import { HEX_SYMS, AUDIO_PEGS, VISUAL_PEGS } from '../domain/pegs.js';
import { cubeEmojis, cubeName } from '../domain/faces.js';
import { matrixCell, hexCell, packAction } from '../domain/codec/cell.js';
import { deepPackScenes, sceneStory } from '../domain/codec/scene.js';
import { sealDigit, sealHex } from '../domain/codec/codec.js';
import { sealPerceptHex } from '../domain/codec/scene.js';
import { stripStoryDigits } from './text.js';

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
};
