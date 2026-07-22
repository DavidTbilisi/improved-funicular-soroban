import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRILL_DECKS } from '../src/drill/decks.js';
import { SequenceRng, MathRng } from '../src/drill/rng.js';

test('every deck has the strategy shape', () => {
  for (const [id, deck] of Object.entries(DRILL_DECKS)) {
    assert.equal(typeof deck.label, 'string', `${id} label`);
    assert.equal(typeof deck.floorMs, 'number', `${id} floorMs`);
    assert.ok(deck.mode === 'type' || deck.mode === 'reveal', `${id} mode`);
    assert.equal(typeof deck.gen, 'function', `${id} gen`);
  }
});

test('deck items are reproducible under a seeded rng', () => {
  const item = DRILL_DECKS.faceToDigit.gen(new SequenceRng([3]));
  assert.equal(item.prompt, '👽');
  assert.deepEqual(item.answers, ['3']);
  assert.equal(item.reveal, '3 = Alien');
});

test('erasure deck accepts both 0 and 9 when the missing digit is ambiguous', () => {
  // rng: first 10 ints are the digits, 11th is the erased index.
  // digits all 0, erase index 0 -> missing 0, seal-ambiguous with 9.
  const item = DRILL_DECKS.erasure.gen(new SequenceRng([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  assert.deepEqual(item.answers.sort(), ['0', '9']);
});

test('fingerTimes deck drills the 6–9 square and reveals mirrored hands', () => {
  // fact index 6 in the 16-pair grid → 7 × 8 (see FINGER_FACTS ordering).
  const item = DRILL_DECKS.fingerTimes.gen(new SequenceRng([6]));
  assert.equal(item.prompt, '7 × 8');
  assert.deepEqual(item.answers, ['56']);
  assert.ok(item.reveal.includes('●●○○○ ✕ ○○●●●'));
  assert.ok(item.reveal.includes('50+6 = 56'));
  assert.equal(item.fact.key, '7x8');
});

test('fingerRead deck prompts with the hands and answers with the product', () => {
  const item = DRILL_DECKS.fingerRead.genFact({ key: '7x8', kind: 'raise', a: 7, b: 8 });
  assert.equal(item.prompt, '●●○○○ ✕ ○○●●●');
  assert.deepEqual(item.answers, ['56']);
  assert.equal(item.fact.key, '7x8');
});

test('nineFold deck asks the 9s row in either operand order', () => {
  const fact = { key: '9f3', kind: 'fold', n: 3 };
  const heads = DRILL_DECKS.nineFold.genFact(fact, new SequenceRng([1]));
  const tails = DRILL_DECKS.nineFold.genFact(fact, new SequenceRng([0]));
  assert.equal(heads.prompt, '3 × 9');
  assert.equal(tails.prompt, '9 × 3');
  assert.deepEqual(heads.answers, ['27']);
  assert.ok(heads.reveal.includes('fold finger 3'));
});

test('percentOf deck multiplies then shifts two places (÷100)', () => {
  // SequenceRng([2, 20]) → pct = PCTS[2] = 15, base = 10*(2+20) = 220.
  const item = DRILL_DECKS.percentOf.gen(new SequenceRng([2, 20]));
  assert.equal(item.prompt, '15% of 220');
  assert.deepEqual(item.answers, ['33']);
  assert.equal(item.reveal, '220 × 15 = 3300, shift ÷100 → 33');
});

test('percentOf lands a leftover half on the tenths rod', () => {
  // pct = PCTS[2] = 15, base = 10*(2+23) = 250 → 250×15 = 3750 → 37.5
  const item = DRILL_DECKS.percentOf.gen(new SequenceRng([2, 23]));
  assert.equal(item.prompt, '15% of 250');
  assert.deepEqual(item.answers, ['37.5', '37.50']);
  assert.ok(item.reveal.endsWith('→ 37.5'));
});

test('fact decks cover their whole space with distinct keys', () => {
  for (const id of ['fingerRead', 'fingerTimes', 'nineFold']) {
    const deck = DRILL_DECKS[id];
    const keys = new Set(deck.facts.map(f => f.key));
    assert.equal(keys.size, deck.facts.length, `${id} keys distinct`);
    for (const fact of deck.facts) {
      const item = deck.genFact(fact, new SequenceRng([0]));
      assert.ok(item.answers.length >= 1, `${id}:${fact.key} has an answer`);
      assert.equal(item.fact, fact, `${id}:${fact.key} carries its fact`);
    }
  }
  assert.equal(DRILL_DECKS.fingerTimes.facts.length, 16, 'the full 6–9 square, both orders');
  assert.equal(DRILL_DECKS.nineFold.facts.length, 8, '9×2 .. 9×9');
});

test('typed decks always expose at least one accepted answer', () => {
  // SequenceRng ignores int()'s bound, so the value must be in range for every
  // deck's data-selecting draws — 3 is (the narrowest is int(8) for the
  // nine-fold fact pick; its orientation coin only reads the draw as a truthy).
  const rng = new SequenceRng([3]);
  for (const deck of Object.values(DRILL_DECKS)) {
    if (deck.mode !== 'type') continue;
    const item = deck.gen(rng);
    assert.ok(item.answers.length >= 1);
  }
});

// --- the point decks --------------------------------------------------------
test('every point question places to the value the arithmetic gives', () => {
  const rng = new MathRng();
  for (const id of ['pointMul', 'pointDiv']) {
    for (let i = 0; i < 300; i++) {
      const item = DRILL_DECKS[id].gen(rng);
      const [a, op, b] = item.prompt.split(' ');
      const expected = op === '×' ? Number(a) * Number(b) : Number(a) / Number(b);
      const given = Number(item.answers[0]);
      assert.ok(Math.abs(given - expected) < 1e-9,
        `${item.prompt} → ${item.answers[0]}, arithmetic says ${expected}`);
    }
  }
});

test('a point question hands over the digits and asks only for the placement', () => {
  const rng = new MathRng();
  for (const id of ['pointMul', 'pointDiv']) {
    for (let i = 0; i < 100; i++) {
      const item = DRILL_DECKS[id].gen(rng);
      const digits = /<b>(\d+)<\/b>/.exec(item.sub)[1];
      // The answer is those digits, with a point put in or zeros added — never
      // a different number.
      assert.equal(item.answers[item.answers.length - 1].replace(/[.]/g, '').replace(/0+$/, '').replace(/^0+/, ''),
        digits.replace(/0+$/, '').replace(/^0+/, ''), `${item.prompt} changed the digits`);
      assert.ok(item.reveal && item.reveal.length > 10, 'the rule is revealed');
    }
  }
});

test('the point decks never deal a written trailing zero — it would be an ambiguous question', () => {
  const rng = new MathRng();
  for (const id of ['pointMul', 'pointDiv']) {
    for (let i = 0; i < 200; i++) {
      const item = DRILL_DECKS[id].gen(rng);
      for (const operand of item.prompt.split(' ').filter(t => /\d/.test(t))) {
        if (operand.includes('.')) assert.ok(!/0$/.test(operand), `${item.prompt} deals ${operand}`);
      }
    }
  }
});
