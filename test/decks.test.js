import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRILL_DECKS } from '../src/drill/decks.js';
import { SequenceRng } from '../src/drill/rng.js';

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

test('typed decks always expose at least one accepted answer', () => {
  const rng = new SequenceRng([5]);
  for (const deck of Object.values(DRILL_DECKS)) {
    if (deck.mode !== 'type') continue;
    const item = deck.gen(rng);
    assert.ok(item.answers.length >= 1);
  }
});
