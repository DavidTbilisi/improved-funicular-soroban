import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  placeName, beadPhrase, rodSpeech, valueSpeech, rodsSpeech, focusSpeech, boardSpeech,
} from '../src/a11y/boardSpeech.js';
import { AbacusStore } from '../src/state/abacusStore.js';
import { INT_COLS, FRAC_COLS } from '../src/domain/config.js';

// The real store is the shape this reads, so the tests use it rather than a
// hand-built stub — a board that cannot be spoken is a bug either way.
const boardOf = (intVal, fracStr = '') => new AbacusStore(intVal, fracStr);

test('places are named the way you would say them, all the way up', () => {
  assert.equal(placeName(0), 'ones');
  assert.equal(placeName(1), 'tens');
  assert.equal(placeName(2), 'hundreds');
  assert.equal(placeName(3), 'thousands');
  assert.equal(placeName(4), 'ten thousands');
  assert.equal(placeName(5), 'hundred thousands');
  assert.equal(placeName(6), 'millions');
  assert.equal(placeName(9), 'billions');
  assert.equal(placeName(12), 'trillions');
  assert.equal(placeName(15), 'quadrillions');
  assert.equal(placeName(18), 'quintillions');
});

test('every rod on the real board has a name', () => {
  for (let e = 0; e < INT_COLS; e++) {
    assert.ok(!/undefined|NaN/.test(placeName(e)), `int ${e} → ${placeName(e)}`);
  }
  for (let e = 1; e <= FRAC_COLS; e++) {
    assert.ok(!/undefined|NaN/.test(placeName(-e)), `frac ${-e} → ${placeName(-e)}`);
  }
  assert.equal(placeName(-1), 'tenths');
  assert.equal(placeName(-4), 'ten-thousandths');
});

test('the beads are described the way a finger finds them', () => {
  assert.equal(beadPhrase(0), 'clear');
  assert.equal(beadPhrase(1), '1 earth bead up');
  assert.equal(beadPhrase(4), '4 earth beads up');
  assert.equal(beadPhrase(5), 'heaven bead down');
  assert.equal(beadPhrase(7), 'heaven bead down and 2 earth beads up');
  assert.equal(beadPhrase(9), 'heaven bead down and 4 earth beads up');
});

test('down and up both mean toward the bar — a counted bead is against it', () => {
  // The heaven bead comes DOWN to the bar; the earth beads go UP to it. Getting
  // this backwards would teach the instrument wrong to the one learner who
  // cannot check it against the picture.
  assert.match(beadPhrase(5), /heaven bead down/);
  assert.match(beadPhrase(1), /earth bead up/);
});

test('one rod reads as place, digit and beads', () => {
  assert.equal(rodSpeech(1, 2), 'tens: 2, 2 earth beads up');
  assert.equal(rodSpeech(0, 0), 'ones: 0, clear');
});

test('the value is spoken as a number, and the fraction digit by digit', () => {
  assert.equal(valueSpeech(boardOf(0)), 'zero');
  assert.equal(valueSpeech(boardOf(7)), 'seven');
  assert.equal(valueSpeech(boardOf(123)), 'one hundred twenty-three');
  assert.equal(valueSpeech(boardOf(123, '45')), 'one hundred twenty-three point four five');
  assert.equal(valueSpeech(boardOf(0, '05')), 'zero point zero five');
});

test('a nineteen-digit board is exact — the reason words() takes a string', () => {
  const store = new AbacusStore(0);
  store.setIntValue(1234567890123456789n);
  const said = valueSpeech(store);
  assert.match(said, /^one quintillion/);
  assert.ok(!/undefined|NaN|Infinity/.test(said), said);
});

test('only the rods holding something are read out', () => {
  assert.equal(rodsSpeech(boardOf(0)), 'every rod clear');
  assert.equal(rodsSpeech(boardOf(102)), 'hundreds 1, ones 2');
  assert.equal(rodsSpeech(boardOf(5, '3')), 'ones 5, tenths 3');
  // High place first — the order you would read a number in.
  assert.equal(rodsSpeech(boardOf(321)), 'hundreds 3, tens 2, ones 1');
});

test('the detailed reading adds the beads on each set rod', () => {
  assert.equal(rodsSpeech(boardOf(7), { beads: true }), 'ones: 7, heaven bead down and 2 earth beads up');
});

test('focus says where the keys will land and what is under them', () => {
  assert.equal(focusSpeech(boardOf(23), 0), 'focus ones, 3, 3 earth beads up');
  assert.equal(focusSpeech(boardOf(23), 1), 'focus tens, 2, 2 earth beads up');
  assert.equal(focusSpeech(boardOf(0, '5'), -1), 'focus tenths, 5, heaven bead down');
  assert.equal(focusSpeech(boardOf(0), 4), 'focus ten thousands, 0, clear');
});

test('the whole announcement is value, rods, then focus', () => {
  const s = boardSpeech(boardOf(123, '4'), { focus: 1 });
  assert.equal(s.value, 'one hundred twenty-three point four');
  assert.equal(s.rods, 'hundreds 1, tens 2, ones 3, tenths 4');
  assert.equal(s.focus, 'focus tens, 2, 2 earth beads up');
  assert.equal(s.text, 'Board reads one hundred twenty-three point four. hundreds 1, tens 2, ones 3, tenths 4. focus tens, 2, 2 earth beads up.');
});

test('an empty board still says something useful', () => {
  const s = boardSpeech(boardOf(0));
  assert.equal(s.text, 'Board reads zero. every rod clear. focus ones, 0, clear.');
});

test('nothing here needs a store — a plain snapshot works', () => {
  const snapshot = { int: [{ sky: 1, earth: 2 }], frac: [] };
  assert.equal(valueSpeech(snapshot), 'seven');
  assert.equal(rodsSpeech(snapshot), 'ones 7');
  assert.equal(boardSpeech(snapshot).value, 'seven');
  // …and a missing one does not throw.
  assert.equal(valueSpeech(undefined), 'zero');
  assert.equal(rodsSpeech(null), 'every rod clear');
});
