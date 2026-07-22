import { test } from 'node:test';
import assert from 'node:assert/strict';
import { padCells, compoundCells } from '../src/view/touchPad.js';
import { CUBE_LAYOUT, digitFromFaces, cubeFaceValues } from '../src/domain/faces.js';
import { CUBE_FACES } from '../src/domain/pegs.js';

test('the pad is the die cross — five cells, one per face', () => {
  const cells = padCells();
  assert.equal(cells.length, 5);
  assert.deepEqual(cells.map(c => c.pos), ['top', 'left', 'center', 'right', 'bottom']);
  assert.deepEqual(cells.map(c => c.digit), [3, 2, 1, 5, 4]);
});

test('every cell agrees with the chord keyboard about which digit it is', () => {
  // This is the whole point of deriving the pad from CUBE_LAYOUT: a tap and the
  // key it mirrors must mean the same thing, for ever.
  for (const c of padCells()) {
    assert.equal(digitFromFaces([c.pos]), c.digit, c.pos);
  }
});

test('the cells carry their own face, from the frozen table', () => {
  for (const c of padCells()) {
    assert.equal(c.emoji, CUBE_FACES[c.digit].emoji, c.pos);
    assert.equal(c.word, CUBE_FACES[c.digit].word, c.pos);
  }
});

test('the pad covers every position the layout declares', () => {
  const declared = CUBE_LAYOUT.map(f => f.pos).sort();
  assert.deepEqual(padCells().map(c => c.pos).sort(), declared);
});

test('6-9 get their own row, still labelled as the chord they are', () => {
  const comps = compoundCells();
  assert.deepEqual(comps.map(c => c.digit), [6, 7, 8, 9]);
  for (const c of comps) {
    // Each is the rose plus one earth face — exactly what the keyboard chords.
    assert.equal(c.faces.length, 2, c.digit);
    assert.equal(c.faces[0], CUBE_FACES[5].emoji, 'the rose leads');
    const values = cubeFaceValues(c.digit);
    assert.deepEqual(c.faces, values.map(v => CUBE_FACES[v].emoji));
    // …and the same set of cells, chorded, is the same digit.
    const positions = values.map(v => CUBE_LAYOUT.find(f => f.value === v).pos);
    assert.equal(digitFromFaces(positions), c.digit, `${c.digit} chord`);
  }
});

test('the pad reaches every digit 1-9 exactly once', () => {
  const digits = [...padCells().map(c => c.digit), ...compoundCells().map(c => c.digit)].sort((a, b) => a - b);
  assert.deepEqual(digits, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('it is a pure builder — no document, no state', () => {
  assert.deepEqual(padCells(), padCells());
  assert.notEqual(padCells(), padCells(), 'a fresh array each call, so a caller cannot mutate the table');
});
