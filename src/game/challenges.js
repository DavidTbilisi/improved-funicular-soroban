// ============================================================================
// Village contracts — the sp faucet. Each tier is a Strategy object in the
// same shape family as TUTORIAL_LEVELS: { id, title, math, baseSp, timeFloorMs,
// gen(rng) -> problem } where a problem is { a, b, op, prompt, sub,
// startScaled, targetScaled } — the session seeds the beads to startScaled and
// detects a solve by pure integer compare against targetScaled (the bead
// engine's move-legality already polices technique, exactly as in guided
// practice). All tiers are always available: harder arithmetic simply pays
// more. Every gen guarantees targetScaled !== startScaled, or a fresh contract
// would self-solve on seeding.
//
// Payout = baseSp, +½ base for a fumble-free solve, +¼ base for beating the
// tier's time floor, +⌈base/20⌉ sp per clean solve already on the streak
// (at most 10 count), all × (1 + shrine blessing), floored to whole sp.
//
// The baseSp ladder is tuned so sp per SECOND rises with tier (base/floor:
// 1.25, 1.6, 2.0, 2.4, 2.5, 2.7, 3.1) — with a flat ladder, grinding the easy
// tiers out-earned hard ones per wall-clock second, since a village day also
// passes per solve. Same for the streak step scaling with base: a flat +1/sp
// streak is harvested fastest on 4-second errands. The stock-and-flow model
// behind these numbers lives in design/hardness.flow (Q2).
// ============================================================================
import { FRAC_COLS } from '../domain/config.js';
import { classifyAdd, classifySub } from '../domain/soroban.js';
import { planAdd, planSub } from '../domain/movePlan.js';

const SCALE = Math.pow(10, FRAC_COLS);
const scaled = v => Math.round(v * SCALE);
const pick = (rng, arr) => arr[rng.int(arr.length)];

// Cosmetic scene prefixes per tier — the arithmetic itself stays canonical.
const FLAVORS = Object.freeze({
  errand:   Object.freeze(['🛖 Hut errand', '🧺 Basket count', '🐓 Hen count']),
  delivery: Object.freeze(['🌾 Grain delivery', '💧 Water rounds', '🍞 Bread run']),
  ledger:   Object.freeze(['📜 Ledger entry', '🪙 Till count', '⚖️ Weigh-in']),
  caravan:  Object.freeze(['🐫 Caravan load', '🛶 River freight', '📦 Crate tally']),
  magnate:  Object.freeze(['🏯 Castle levy', '🚢 Harbor manifest', '🌾 Granary census']),
  guild:    Object.freeze(['🏭 Guild order', '🪓 Timber order', '🧵 Cloth order']),
  tax:      Object.freeze(['⛩️ Tax season', '🏪 Market share-out', '🪙 Split the purse']),
});

// Thousands separators keep million-scale prompts readable; numbers under
// 1,000 come out unchanged.
const fmt = n => n.toLocaleString('en-US');

function mk(rng, tierId, a, b, op) {
  const target = op === '+' ? a + b : a - b;
  const sym = op === '+' ? '+' : '−';
  return {
    a, b, op,
    prompt: `${pick(rng, FLAVORS[tierId])}: <b>${fmt(a)}</b> ${sym} <b>${fmt(b)}</b>`,
    sub: `beads start at ${fmt(a)} — reach the answer`,
    startScaled: scaled(a),
    targetScaled: scaled(target),
  };
}

function mkMul(rng, tierId, a, m) {
  return {
    a, b: m, op: '×',
    prompt: `${pick(rng, FLAVORS[tierId])}: <b>${a}</b> × <b>${m}</b>`,
    sub: `beads start at ${a} — add ${a} until you reach ${a * m}`,
    startScaled: scaled(a),
    targetScaled: scaled(a * m),
  };
}

function mkDiv(rng, tierId, D, b) {
  return {
    a: D, b, op: '÷', q: D / b,
    prompt: `${pick(rng, FLAVORS[tierId])}: <b>${D}</b> ÷ <b>${b}</b>`,
    sub: `beads start at ${D} — subtract ${b} repeatedly down to 0`,
    startScaled: scaled(D),
    targetScaled: 0,
  };
}

export const CHALLENGE_TIERS = Object.freeze([
  {
    id: 'errand', title: 'Errand', math: 'direct add / subtract', baseSp: 5, timeFloorMs: 4000,
    gen(rng) {
      for (let k = 0; k < 80; k++) {
        const add = rng.int(2) === 0;
        const a = rng.int(10), b = 1 + rng.int(9);
        if (add && a + b <= 9 && classifyAdd(a, b).rule === 'direct') return mk(rng, this.id, a, b, '+');
        if (!add && a - b >= 0 && classifySub(a, b).rule === 'direct') return mk(rng, this.id, a, b, '-');
      }
      return mk(rng, this.id, 1, 1, '+');
    },
  },
  {
    id: 'delivery', title: 'Delivery', math: 'small friend (5-bead trade)', baseSp: 8, timeFloorMs: 5000,
    gen(rng) {
      for (let k = 0; k < 80; k++) {
        const add = rng.int(2) === 0;
        const a = rng.int(10), b = 1 + rng.int(4);
        if (add && a + b <= 9 && classifyAdd(a, b).rule === 'small') return mk(rng, this.id, a, b, '+');
        if (!add && a - b >= 0 && classifySub(a, b).rule === 'small') return mk(rng, this.id, a, b, '-');
      }
      return mk(rng, this.id, 4, 3, '+');
    },
  },
  {
    id: 'ledger', title: 'Ledger', math: 'big friend (carry / borrow)', baseSp: 12, timeFloorMs: 6000,
    gen(rng) {
      for (let k = 0; k < 80; k++) {
        const add = rng.int(2) === 0;
        if (add) {
          const a = rng.int(10), b = 1 + rng.int(9);
          if (a + b >= 10 && a + b <= 18 && classifyAdd(a, b).rule === 'big') return mk(rng, this.id, a, b, '+');
        } else {
          const A = 10 + rng.int(9), b = 1 + rng.int(9);
          if (A - b >= 0 && classifySub(A % 10, b).rule === 'big') return mk(rng, this.id, A, b, '-');
        }
      }
      return mk(rng, this.id, 8, 5, '+');
    },
  },
  {
    id: 'caravan', title: 'Caravan', math: 'compound trade / two-digit carry', baseSp: 22, timeFloorMs: 9000,
    gen(rng) {
      for (let k = 0; k < 200; k++) {
        const kind = rng.int(2);
        if (kind === 0) {
          // Nested single-digit trade (one trade opens another).
          const add = rng.int(2) === 0;
          if (add) {
            const a = 5 + rng.int(4), b = 6 + rng.int(4);
            if (a + b >= 10 && planAdd(a, b).story.length > 1) return mk(rng, this.id, a, b, '+');
          } else {
            const A = 10 + rng.int(5), b = 6 + rng.int(4);
            if (A - b >= 0 && A % 10 < b && planSub(A % 10, b).story.length > 1) return mk(rng, this.id, A, b, '-');
          }
        } else {
          // Two-digit with a forced carry / borrow on the ones rod.
          const add = rng.int(2) === 0;
          const a = 10 + rng.int(90), b = 10 + rng.int(90);
          if (add) { if ((a % 10) + (b % 10) >= 10) return mk(rng, this.id, a, b, '+'); }
          else { const hi = Math.max(a, b), lo = Math.min(a, b); if ((hi % 10) < (lo % 10)) return mk(rng, this.id, hi, lo, '-'); }
        }
      }
      return mk(rng, this.id, 6, 7, '+');
    },
  },
  {
    id: 'magnate', title: 'Magnate', math: 'add / subtract in the millions', baseSp: 28, timeFloorMs: 11000,
    // The ones-rod skills lifted to the top of the board: identical friend
    // trades and carries, played on the 10^5 / 10^6 / 10^7 rods — proof that
    // technique is magnitude-invariant.
    gen(rng) {
      const M = Math.pow(10, 5 + rng.int(3));
      for (let k = 0; k < 200; k++) {
        const add = rng.int(2) === 0;
        if (rng.int(2) === 0) {
          // A single-rod friend trade, a million high.
          const a = rng.int(10), b = 1 + rng.int(9);
          if (add && classifyAdd(a, b).rule !== 'direct') return mk(rng, this.id, a * M, b * M, '+');
          if (!add && a >= b && classifySub(a, b).rule !== 'direct') return mk(rng, this.id, a * M, b * M, '-');
        } else {
          // Caravan's forced two-digit carry / borrow, at scale.
          const a = 10 + rng.int(90), b = 10 + rng.int(90);
          if (add) { if ((a % 10) + (b % 10) >= 10) return mk(rng, this.id, a * M, b * M, '+'); }
          else { const hi = Math.max(a, b), lo = Math.min(a, b); if ((hi % 10) < (lo % 10)) return mk(rng, this.id, hi * M, lo * M, '-'); }
        }
      }
      return mk(rng, this.id, 7 * M, 8 * M, '+');
    },
  },
  {
    id: 'guild', title: 'Guild order', math: 'multiply by repeated addition', baseSp: 38, timeFloorMs: 14000,
    gen(rng) {
      const a = 12 + rng.int(38); // 12..49
      const m = 2 + rng.int(2);   // ×2..×3
      return mkMul(rng, this.id, a, m);
    },
  },
  {
    id: 'tax', title: 'Tax season', math: 'divide by repeated subtraction', baseSp: 50, timeFloorMs: 16000,
    gen(rng) {
      const b = 2 + rng.int(8); // divisor 2..9
      const q = 3 + rng.int(5); // quotient 3..7
      return mkDiv(rng, this.id, b * q, b);
    },
  },
]);

export const tierById = id => CHALLENGE_TIERS.find(t => t.id === id) || null;

// The payout breakdown for a solve — kept separate so the HUD can show why a
// contract paid what it did. `streak` is the clean streak BEFORE this solve
// (village stats.streak), so the first solve of a run carries no bonus yet.
export function payoutParts(tier, { faults, elapsedMs }, streak = 0) {
  const base = tier.baseSp;
  return {
    base,
    cleanBonus: faults === 0 ? Math.ceil(base / 2) : 0,
    fastBonus: elapsedMs <= tier.timeFloorMs ? Math.ceil(base / 4) : 0,
    streakBonus: Math.min(streak, 10) * Math.ceil(base / 20),
  };
}

// Total sp for a solve; `bonus` is the village's shrine blessing (0 … 0.3).
export function payout(tier, judge, bonus = 0, streak = 0) {
  const p = payoutParts(tier, judge, streak);
  return Math.floor((p.base + p.cleanBonus + p.fastBonus + p.streakBonus) * (1 + bonus));
}
