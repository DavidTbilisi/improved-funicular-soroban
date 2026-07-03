// ============================================================================
// Rng — a tiny randomness port so deck generators are deterministic under test.
// Production uses MathRng; tests inject a stub (e.g. a SequenceRng) to drive an
// exact item. This is why DRILL_DECKS take an rng argument rather than calling
// Math.random directly (Dependency Inversion).
// ============================================================================
import { HEX_SYMS } from '../domain/pegs.js';

export class Rng {
  int() { throw new Error('abstract'); }
  digits(n) { let s = ''; for (let i = 0; i < n; i++) s += this.int(10); return s; }
  hexString(n) { let s = ''; for (let i = 0; i < n; i++) s += HEX_SYMS[this.int(16)]; return s; }
}

export class MathRng extends Rng {
  int(n) { return Math.floor(Math.random() * n); }
}

// Deterministic stub for tests: returns ints from a supplied sequence (cycled).
export class SequenceRng extends Rng {
  constructor(seq) { super(); this.seq = seq; this.i = 0; }
  int() { const v = this.seq[this.i % this.seq.length]; this.i++; return v; }
}
