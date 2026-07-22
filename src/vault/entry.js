// ============================================================================
// A vault entry — one number the learner has committed to memory.
//
// This is the piece the app has been missing. Everything else in the codec half
// teaches the ALPHABET of the encoding (pegs, cells, actions, seals) on randomly
// generated items that are discarded after one rep. Nothing ever asked the
// learner to hold ONE specific number and give it back a week later, which is
// the only thing the encoding exists to do.
//
// TWO STORAGE MODES, and the distinction is the point.
//
//   'full'   — the digits are kept. Recall is checked exactly and the answer can
//              be revealed.
//   'sealed' — the digits are NOT kept. Only the length and the per-locus seals
//              are stored, so the app never holds the number at all. Recall is
//              checked by recomputing the seals from what was typed.
//
// 'sealed' exists because this is localStorage: unencrypted, readable by
// anything with script access to the origin, and included in an exported save
// file. A memory trainer invites exactly the numbers you should not leave lying
// around in plain text, so it should be possible to practise one without
// storing it. The seal is a checksum, not a hash — it cannot reconstruct the
// number, and it catches a wrong digit ~8 times in 9 per locus (14 in 15 in
// hex). That is honest to say and is said in the UI; it is not a security
// guarantee, it is the absence of a liability.
//
// DOM-free. Unit-tested in test/vaultEntry.test.js.
// ============================================================================
import { codecForRadix, sealDigit, sealHex } from '../domain/codec/codec.js';

export const MODES = Object.freeze(['full', 'sealed']);
export const MAX_LABEL = 60;
export const MAX_DIGITS = 400;   // ~40 loci; well past any real mnemonic feat

// Strip the separators people actually type — spaces, dashes, dots, commas —
// and nothing else. A stray letter is an error worth reporting, not silently
// dropping: dropping it would store a different number than the one given.
export const normalizeCode = (raw, radix = 10) =>
  String(raw == null ? '' : raw).replace(/[\s\-–—.,_]/g, '').toUpperCase();

const VALID = { 10: /^[0-9]+$/, 16: /^[0-9A-F]+$/ };

export function validateCode(raw, radix = 10) {
  const code = normalizeCode(raw, radix);
  if (!code) return { ok: false, code: '', error: 'Enter the digits to memorise.' };
  if (!VALID[radix].test(code)) {
    return { ok: false, code, error: radix === 16 ? 'Hex codes use 0–9 and A–F only.' : 'Decimal codes use 0–9 only.' };
  }
  if (code.length > MAX_DIGITS) return { ok: false, code, error: `That is longer than ${MAX_DIGITS} digits.` };
  return { ok: true, code, error: null };
}

export const sealOf = (digits, radix = 10) => (radix === 16 ? sealHex(digits) : sealDigit(digits));

// The loci a code encodes to. Goes through the codec's `encode`, NOT `prepare`:
// prepare builds its string from a board value, which caps at the rod count and
// drops leading zeros through BigInt — a vault entry must encode the string it
// was actually given.
export const lociFor = (code, radix = 10) => codecForRadix(radix).encode(code).loci;

/**
 * @param label  what this number is, for the learner ("π to 60", "front door")
 * @param code   the validated code string
 * @param radix  10 | 16
 * @param mode   'full' | 'sealed'
 * @param now    ISO stamp (injected)
 * @returns a plain entry blob — see vaultStore.js for the persisted shape
 */
export function makeEntry({ id, label, code, radix = 10, mode = 'full', now = '' } = {}) {
  const seals = lociFor(code, radix).map(l => l.seal);
  const entry = {
    id, label: String(label || '').slice(0, MAX_LABEL) || 'Untitled',
    radix, mode: MODES.includes(mode) ? mode : 'full',
    length: code.length,
    seals,                       // per locus, in order — kept in BOTH modes
    created: now, reviews: [],
    ease: 2.2, interval: 0, due: null,   // schedule.js owns these from here
  };
  // The one field that distinguishes the modes.
  if (entry.mode === 'full') entry.code = code;
  return entry;
}

// True when the entry can show its own answer. 'sealed' entries cannot — by
// construction, not by policy — and the UI must not offer a reveal for them.
export const canReveal = entry => entry.mode === 'full' && typeof entry.code === 'string';
