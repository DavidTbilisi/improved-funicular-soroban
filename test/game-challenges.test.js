import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGE_TIERS, tierById, payout, payoutParts } from '../src/game/challenges.js';
import { classifyAdd, classifySub } from '../src/domain/soroban.js';
import { planAdd, planSub } from '../src/domain/movePlan.js';
import { MathRng, SequenceRng } from '../src/drill/rng.js';
import { FRAC_COLS } from '../src/domain/config.js';

const SCALE = Math.pow(10, FRAC_COLS);

test('the tier ladder pays strictly more for harder arithmetic', () => {
  assert.deepEqual(CHALLENGE_TIERS.map(t => t.id), ['errand', 'delivery', 'ledger', 'caravan', 'magnate', 'guild', 'tax']);
  for (let i = 1; i < CHALLENGE_TIERS.length; i++) {
    assert.ok(CHALLENGE_TIERS[i].baseSp > CHALLENGE_TIERS[i - 1].baseSp);
    assert.ok(CHALLENGE_TIERS[i].timeFloorMs > CHALLENGE_TIERS[i - 1].timeFloorMs);
  }
  assert.equal(tierById('guild'), CHALLENGE_TIERS[5]);
  assert.equal(tierById('nope'), null);
});

test('gens are deterministic under an injected rng', () => {
  for (const tier of CHALLENGE_TIERS) {
    const a = tier.gen(new SequenceRng([3, 1, 4, 1, 5, 9, 2, 6]));
    const b = tier.gen(new SequenceRng([3, 1, 4, 1, 5, 9, 2, 6]));
    assert.deepEqual(a, b, tier.id);
  }
});

// Shared invariants plus the per-tier rule the contract is supposed to drill.
// startScaled === targetScaled would self-solve the moment the board is seeded.
test('fuzz: every generated contract is well-formed and matches its tier', () => {
  const rng = new MathRng();
  const checks = {
    errand(p) {
      const rule = p.op === '+' ? classifyAdd(p.a % 10, p.b).rule : classifySub(p.a % 10, p.b).rule;
      assert.equal(rule, 'direct');
    },
    delivery(p) {
      const rule = p.op === '+' ? classifyAdd(p.a % 10, p.b).rule : classifySub(p.a % 10, p.b).rule;
      assert.equal(rule, 'small');
    },
    ledger(p) {
      const rule = p.op === '+' ? classifyAdd(p.a % 10, p.b).rule : classifySub(p.a % 10, p.b).rule;
      assert.equal(rule, 'big');
    },
    caravan(p) {
      if (p.b >= 10) { // two-digit: the ones column must force a carry/borrow
        if (p.op === '+') assert.ok((p.a % 10) + (p.b % 10) >= 10);
        else assert.ok((p.a % 10) < (p.b % 10));
      } else {         // single-digit: the trade must nest
        const plan = p.op === '+' ? planAdd(p.a % 10, p.b) : planSub(p.a % 10, p.b);
        assert.ok(plan.story.length > 1);
      }
    },
    magnate(p) {
      const M = 100000;
      assert.ok(p.a % M === 0 && p.b % M === 0, 'both operands sit on the 10^5+ rods');
      assert.ok(p.b >= M && p.a <= 99e7 && p.b <= 99e7);
      assert.ok(p.prompt.includes(','), 'thousands separators keep it readable');
      if (p.op === '+') assert.equal(p.targetScaled, (p.a + p.b) * SCALE);
      else { assert.ok(p.a - p.b >= 0); assert.equal(p.targetScaled, (p.a - p.b) * SCALE); }
    },
    guild(p) {
      assert.equal(p.op, '×');
      assert.ok(p.a >= 12 && p.a <= 49);
      assert.ok(p.b >= 2 && p.b <= 3);
      assert.equal(p.targetScaled, p.a * p.b * SCALE);
    },
    tax(p) {
      assert.equal(p.op, '÷');
      assert.ok(p.b >= 2 && p.b <= 9);
      assert.ok(p.q >= 3 && p.q <= 7);
      assert.equal(p.a, p.b * p.q);
      assert.equal(p.targetScaled, 0);
    },
  };
  for (const tier of CHALLENGE_TIERS) {
    for (let i = 0; i < 200; i++) {
      const p = tier.gen(rng);
      assert.ok(Number.isInteger(p.startScaled) && p.startScaled >= 0, tier.id);
      assert.ok(Number.isInteger(p.targetScaled) && p.targetScaled >= 0, tier.id);
      assert.notEqual(p.startScaled, p.targetScaled, `${tier.id} would self-solve`);
      assert.ok(p.prompt.includes('<b>') && p.sub, tier.id);
      checks[tier.id](p);
    }
  }
});

test('payout: base, +half for fumble-free, +quarter for beating the floor', () => {
  const ledger = tierById('ledger'); // baseSp 12, floor 6000ms
  assert.deepEqual(payoutParts(ledger, { faults: 0, elapsedMs: 3000 }), { base: 12, cleanBonus: 6, fastBonus: 3, streakBonus: 0 });
  assert.equal(payout(ledger, { faults: 0, elapsedMs: 3000 }), 21);
  assert.equal(payout(ledger, { faults: 0, elapsedMs: 9000 }), 18); // slow keeps the clean-hands bonus
  assert.equal(payout(ledger, { faults: 2, elapsedMs: 3000 }), 15); // fumbled but fast
  assert.equal(payout(ledger, { faults: 2, elapsedMs: 9000 }), 12); // just the base
});

test('the streak bonus adds +1 sp per banked clean solve, capped at +10', () => {
  const ledger = tierById('ledger');
  assert.equal(payoutParts(ledger, { faults: 0, elapsedMs: 3000 }, 4).streakBonus, 4);
  assert.equal(payoutParts(ledger, { faults: 0, elapsedMs: 3000 }, 25).streakBonus, 10);
  assert.equal(payout(ledger, { faults: 0, elapsedMs: 3000 }, 0, 4), 25);   // 21 + 4
  assert.equal(payout(ledger, { faults: 2, elapsedMs: 9000 }, 0, 4), 16);   // a fumble still cashes the old streak
  assert.equal(payout(ledger, { faults: 0, elapsedMs: 3000 }, 0.3, 10), Math.floor(31 * 1.3));
});

test('the shrine blessing multiplies the whole payout, floored to whole sp', () => {
  const ledger = tierById('ledger');
  assert.equal(payout(ledger, { faults: 0, elapsedMs: 3000 }, 0.3), Math.floor(21 * 1.3)); // 27
  assert.equal(payout(ledger, { faults: 2, elapsedMs: 9000 }, 0.1), Math.floor(12 * 1.1)); // 13
});
