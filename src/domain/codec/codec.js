// ============================================================================
// Codec — Strategy pattern. A Codec turns the current abacus value into a list
// of loci (scene groups + checksum seal) and knows how to render its own seal.
// DecimalCodec and HexCodec are interchangeable; the view holds one reference
// and never branches on radix. Adding a new base = adding a new Codec (OCP).
//
// Interface:
//   radix            number
//   label            string  (button/UI label)
//   encode(code)     -> { code, unitCount, unitNoun, loci }   raw code string in
//   prepare(iv, fs)  -> { code, unitCount, unitNoun, fractionIgnored, loci }
//   sealLabel(v)     -> string
//   sealPercept(v)   -> emoji string
//   sealExplain(loc) -> plain-text tooltip
// ============================================================================
import { HEX_SYMS } from '../pegs.js';
import { cubeEmojis } from '../faces.js';
import { deepPackScenes, deepPackScenesHex, padHex, sealPerceptHex } from './scene.js';

// digit-sum mod 9, remainder 0 written as 9 (so the seal always has a percept).
export function sealDigit(digitStr) {
  const s = digitStr.split('').reduce((a, c) => a + (+c), 0) % 9;
  return s === 0 ? 9 : s;
}

// nibble-sum mod 15 (casting out fifteens), remainder 0 written as F.
export function sealHex(hexStr) {
  const v = [...hexStr.toUpperCase()].reduce((a, c) => a + HEX_SYMS.indexOf(c), 0) % 15;
  return v === 0 ? 15 : v;
}

function groupLoci(scenes, digitsOf, sealOf, extra = {}) {
  const loci = [];
  for (let i = 0; i < scenes.length; i += 2) {
    const pair = scenes.slice(i, i + 2);
    const digits = pair.map(digitsOf).join('');
    loci.push({ scenes: pair, digits, seal: sealOf(digits), ...extra });
  }
  return loci;
}

class Codec {
  get radix() { throw new Error('abstract'); }
  get label() { throw new Error('abstract'); }
  // encode() takes the code STRING; prepare() builds that string from a board
  // value and delegates. The split exists because the board cannot express every
  // code worth encoding: it caps at INT_COLS digits and, going through BigInt,
  // silently drops leading zeros. Anything holding a code of its own (the vault)
  // must encode the string directly or it would store a different number than
  // the one it was given.
  encode() { throw new Error('abstract'); }
  prepare() { throw new Error('abstract'); }
  sealLabel(v) { return String(v); }
  sealPercept() { throw new Error('abstract'); }
  sealExplain() { throw new Error('abstract'); }
}

export class DecimalCodec extends Codec {
  get radix() { return 10; }
  get label() { return 'Decimal'; }
  encode(code) {
    const loci = code ? groupLoci(deepPackScenes(code), s => s.digits, sealDigit) : [];
    return { code, unitCount: code.length, unitNoun: 'digit', loci };
  }
  prepare(intVal, fracStr) {
    const code = (!intVal && !fracStr) ? '' : String(intVal) + fracStr;  // !intVal: 0 or 0n
    return { ...this.encode(code), fractionIgnored: false };
  }
  sealPercept(v) { return cubeEmojis(v); }
  sealExplain(locus) { return `digit-sum of ${locus.digits} mod 9 (0 written as 9) = ${locus.seal}`; }
}

export class HexCodec extends Codec {
  get radix() { return 16; }
  get label() { return 'Hex'; }
  encode(raw) {
    const code = raw ? padHex(String(raw).toUpperCase()) : '';
    const loci = code ? groupLoci(deepPackScenesHex(code), s => s.digits, sealHex, { radix: 16 }) : [];
    return { code, unitCount: code.length / 2, unitNoun: 'byte', loci };
  }
  prepare(intVal, fracStr) {
    const raw = !intVal ? '' : intVal.toString(16).toUpperCase();  // !intVal: 0 or 0n
    return { ...this.encode(raw), fractionIgnored: !!fracStr };
  }
  sealLabel(v) { return HEX_SYMS[v]; }
  sealPercept(v) { return sealPerceptHex(v); }
  sealExplain(locus) { return `nibble-sum of 0x${locus.digits} mod 15 (0 written as F) = ${HEX_SYMS[locus.seal]}`; }
}

export const DECIMAL_CODEC = new DecimalCodec();
export const HEX_CODEC = new HexCodec();
export function codecForRadix(radix) { return radix === 16 ? HEX_CODEC : DECIMAL_CODEC; }
