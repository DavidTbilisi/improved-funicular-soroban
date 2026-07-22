// ============================================================================
// Recall verification — the codec's missing return direction.
//
// The codec ran one way only: digits → cells → scenes → prose. Nothing could
// take something back from the learner and say whether it was right, which is
// why the codec half had no practice loop at all.
//
// What the learner types is DIGITS, not prose, so this is not a story parser.
// It is the check that matters: compare per LOCUS, and use the seal to localise
// the damage. That is exactly what the seal is for and what the `erasure` drill
// already rehearses — a locus whose digits do not match its seal is corrupt,
// and the learner is told WHICH locus without being told the answer.
//
// The two storage modes verify differently, and the difference is honest:
//   'full'   — exact comparison against the stored code. A locus can be wrong
//              even when its seal happens to pass (two compensating errors).
//   'sealed' — the digits were never stored, so the seal is all there is. A
//              locus passes when the seal it recomputes matches the one saved.
//              This can be fooled: ~1 chance in 9 per locus in decimal (1 in 15
//              in hex) that a wrong locus seals correctly. `certain` says so.
//
// DOM-free. Unit-tested in test/vaultVerify.test.js.
// ============================================================================
import { normalizeCode, sealOf, canReveal } from './entry.js';

const LOCUS_DIGITS = 10;   // two 5-digit scenes per locus — codec.js groupLoci
const LOCUS_HEX = 4;       // two 2-byte scenes per locus

export const locusSize = radix => (radix === 16 ? LOCUS_HEX * 2 : LOCUS_DIGITS);

// Split a code into locus-sized chunks; the last may be short.
export function splitLoci(code, radix = 10) {
  const n = locusSize(radix), out = [];
  for (let i = 0; i < code.length; i += n) out.push(code.slice(i, i + n));
  return out;
}

/**
 * @param entry a vault entry
 * @param typed what the learner recalled (separators tolerated)
 * @returns {
 *   ok,          every locus passed AND the length is right
 *   certain,     whether ok is exact ('full') or seal-checked ('sealed')
 *   code,        the normalised input
 *   lengthOk,    right number of digits
 *   loci: [{ index, typed, expected|null, seal, wantSeal, sealOk, exact|null, ok }],
 *   firstBad,    index of the first failing locus, or -1
 *   message,
 * }
 */
export function verifyRecall(entry, typed) {
  const radix = entry.radix || 10;
  const code = normalizeCode(typed, radix);
  const lengthOk = code.length === entry.length;
  const exactMode = canReveal(entry);
  const want = exactMode ? splitLoci(entry.code, radix) : [];
  const got = splitLoci(code, radix);
  const seals = entry.seals || [];

  const loci = [];
  const n = Math.max(got.length, seals.length);
  for (let i = 0; i < n; i++) {
    const t = got[i] ?? '';
    const wantSeal = seals[i] ?? null;
    // An absent or short locus has no meaningful seal — report it as missing
    // rather than computing a seal over a fragment and calling it wrong.
    const full = t.length === (want[i]?.length ?? locusSize(radix)) || (i === n - 1 && t.length > 0);
    const seal = t ? sealOf(t, radix) : null;
    const sealOk = seal !== null && wantSeal !== null && seal === wantSeal;
    const exact = exactMode ? (want[i] !== undefined && t === want[i]) : null;
    loci.push({
      index: i, typed: t, expected: exactMode ? (want[i] ?? null) : null,
      seal, wantSeal, sealOk, exact,
      ok: exactMode ? !!exact : (!!t && full && sealOk),
    });
  }

  const firstBad = loci.findIndex(l => !l.ok);
  const ok = lengthOk && loci.length > 0 && firstBad === -1;

  return {
    ok, certain: exactMode, code, lengthOk, loci, firstBad,
    message: messageFor({ ok, certain: exactMode, lengthOk, code, entry, loci, firstBad }),
  };
}

function messageFor({ ok, certain, lengthOk, code, entry, loci, firstBad }) {
  if (ok) {
    return certain
      ? '✓ Exactly right.'
      : `✓ Every seal checks out. (Sealed entry — the seals agree, which is strong evidence but not proof; roughly 1 locus in ${entry.radix === 16 ? 15 : 9} could pass while wrong.)`;
  }
  if (!code) return 'Nothing entered.';
  if (!lengthOk) {
    const d = code.length - entry.length;
    return `${Math.abs(d)} ${entry.radix === 16 ? 'symbol' : 'digit'}${Math.abs(d) === 1 ? '' : 's'} too ${d > 0 ? 'many' : 'few'} — expected ${entry.length}.`;
  }
  const bad = loci.filter(l => !l.ok).map(l => l.index + 1);
  const which = bad.length === 1 ? `Locus ${bad[0]}` : `Loci ${bad.join(', ')}`;
  return certain
    ? `${which} ${bad.length === 1 ? 'is' : 'are'} wrong — the rest is right.`
    : `${which} ${bad.length === 1 ? 'fails its seal' : 'fail their seals'}. The seal says where, not what.`;
}
