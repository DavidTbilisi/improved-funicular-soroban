import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAM_GRADES, PASS_MARK, SECTION_POINTS, gradeById, gradeIndex,
  nextGrade, highestPassed, totalQuestions, totalSeconds, describeSection, describeGrade,
} from '../src/exam/grades.js';
import { TUTORIAL_LEVELS } from '../src/tutorial/levels.js';

test('the ladder runs 10級 down to 1級, easiest first', () => {
  assert.equal(EXAM_GRADES.length, 10);
  assert.deepEqual(EXAM_GRADES.map(g => g.kyu), [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.equal(EXAM_GRADES[0].id, 'kyu10');
  assert.equal(gradeIndex('kyu1'), 9);
});

test('the tables are frozen — a grade is a contract, not a knob', () => {
  assert.ok(Object.isFrozen(EXAM_GRADES));
  for (const g of EXAM_GRADES) {
    assert.ok(Object.isFrozen(g), `${g.id} frozen`);
    assert.ok(Object.isFrozen(g.sections), `${g.id} sections frozen`);
  }
});

test('every grade names a guided-practice level that exists', () => {
  const ids = new Set(TUTORIAL_LEVELS.map(l => l.id));
  for (const g of EXAM_GRADES) {
    assert.ok(ids.has(g.needs), `${g.id} needs '${g.needs}', which is not a level`);
  }
});

test('difficulty never goes backwards up the ladder', () => {
  let prevTerms = 0, prevDigits = 0;
  for (const g of EXAM_GRADES) {
    const m = g.sections.find(s => s.kind === 'mitori');
    assert.ok(m, `${g.id} has a column section`);
    // The column may hold its shape between grades, but it never shrinks.
    assert.ok(m.terms >= prevTerms, `${g.id} column shrank`);
    if (m.terms === prevTerms) assert.ok(m.digits >= prevDigits, `${g.id} digits shrank`);
    prevTerms = m.terms; prevDigits = m.digits;
  }
});

test('minus terms and division both arrive, and never leave', () => {
  const withMinus = EXAM_GRADES.findIndex(g => g.sections.some(s => s.kind === 'mitori' && s.minus));
  const withWari = EXAM_GRADES.findIndex(g => g.sections.some(s => s.kind === 'wari'));
  assert.ok(withMinus > 0, 'the first grade is addition only');
  assert.ok(withWari > 0, 'the first grade has no division');
  for (const g of EXAM_GRADES.slice(withMinus)) {
    assert.ok(g.sections.some(s => s.kind === 'mitori' && s.minus), `${g.id} lost its minus terms`);
  }
  for (const g of EXAM_GRADES.slice(withWari)) {
    assert.ok(g.sections.some(s => s.kind === 'wari'), `${g.id} lost its division`);
  }
});

test('a paper is short enough to sit in one go', () => {
  for (const g of EXAM_GRADES) {
    assert.ok(totalQuestions(g) <= 15, `${g.id} paper is ${totalQuestions(g)} questions`);
    assert.ok(totalSeconds(g) <= 17 * 60, `${g.id} runs ${totalSeconds(g)}s`);
  }
});

test('the pass mark is per section, out of 100', () => {
  assert.equal(SECTION_POINTS, 100);
  assert.equal(PASS_MARK, 70);
});

test('nextGrade walks the ladder and stops when it runs out', () => {
  assert.equal(nextGrade([]).id, 'kyu10');
  assert.equal(nextGrade(['kyu10']).id, 'kyu9');
  // Out of order: the LOWEST unpassed is still the one you owe.
  assert.equal(nextGrade(['kyu9']).id, 'kyu10');
  assert.equal(nextGrade(EXAM_GRADES.map(g => g.id)), null);
});

test('highestPassed is the smallest kyu number held', () => {
  assert.equal(highestPassed([]), null);
  assert.equal(highestPassed(['kyu10', 'kyu9', 'kyu8']).id, 'kyu8');
  assert.equal(highestPassed(['kyu3', 'kyu10']).id, 'kyu3');
  assert.equal(highestPassed(['nope']), null);
});

test('sections describe their own shape in words', () => {
  assert.equal(describeSection({ kind: 'mitori', terms: 10, digits: 3, minus: true }), '10 terms × 3 digits, with subtraction');
  assert.equal(describeSection({ kind: 'mitori', terms: 5, digits: 1, minus: false }), '5 terms × 1 digit, addition only');
  assert.equal(describeSection({ kind: 'kake', a: 3, b: 2 }), '3 digits × 2 digits');
  assert.equal(describeSection({ kind: 'wari', a: 4, b: 1 }), '4 digits ÷ 1 digit, exact');
  assert.equal(describeSection(null), '');
  assert.match(describeGrade(gradeById('kyu8')), /見取算 5 terms × 2 digits, with subtraction/);
});
