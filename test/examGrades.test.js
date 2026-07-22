import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAM_GRADES, PASS_MARK, SECTION_POINTS, gradeById, gradeIndex,
  nextGrade, highestPassed, totalQuestions, totalSeconds, describeSection, describeGrade,
} from '../src/exam/grades.js';
import { TUTORIAL_LEVELS } from '../src/tutorial/levels.js';
import { ROD_MODES } from '../src/domain/mulDiv.js';

test('the ladder runs 10級 down to 1級 and then into the dan grades', () => {
  assert.equal(EXAM_GRADES.length, 14);
  assert.deepEqual(EXAM_GRADES.slice(0, 10).map(g => g.kyu), [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.equal(EXAM_GRADES[0].id, 'kyu10');
  assert.equal(gradeIndex('kyu1'), 9);
  assert.deepEqual(EXAM_GRADES.slice(10).map(g => g.name), ['準初段', '初段', '二段', '三段']);
  // Order IS the ladder: the kyu number runs down and then stops, so nothing
  // may sort by it.
  let prevDan = 0;
  for (const g of EXAM_GRADES.slice(10)) {
    assert.ok(g.dan > prevDan, `${g.id} does not advance`);
    prevDan = g.dan;
  }
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

test('the extra sections arrive past 1級 and never leave', () => {
  const kyu = EXAM_GRADES.filter(g => !g.dan);
  for (const g of kyu) {
    assert.ok(!g.sections.some(s => s.kind === 'kaihei' || s.kind === 'anzan'), `${g.id} is a kyu paper`);
  }
  const dan = EXAM_GRADES.filter(g => g.dan);
  for (const g of dan) {
    assert.ok(g.sections.some(s => s.kind === 'kaihei'), `${g.id} has no 開平 section`);
    assert.ok(g.needsMode, `${g.id} names no method to have learned first`);
  }
  // 暗算 arrives one grade later than 開平 and stays.
  const firstAnzan = EXAM_GRADES.findIndex(g => g.sections.some(s => s.kind === 'anzan'));
  for (const g of EXAM_GRADES.slice(firstAnzan)) {
    assert.ok(g.sections.some(s => s.kind === 'anzan'), `${g.id} lost its mental section`);
  }
});

test('every dan grade names a rod-trainer mode that exists', () => {
  const ids = new Set(ROD_MODES.map(m => m.id));
  for (const g of EXAM_GRADES.filter(g => g.needsMode)) {
    assert.ok(ids.has(g.needsMode), `${g.id} needs '${g.needsMode}', which is not a mode`);
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

test('a paper is short enough to sit in one go — a dan one is longer by design', () => {
  for (const g of EXAM_GRADES) {
    const cap = g.dan ? 20 : 15;
    const mins = g.dan ? 22 : 17;
    assert.ok(totalQuestions(g) <= cap, `${g.id} paper is ${totalQuestions(g)} questions`);
    assert.ok(totalSeconds(g) <= mins * 60, `${g.id} runs ${totalSeconds(g)}s`);
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
  // Past 1級 the ladder keeps going.
  assert.equal(nextGrade(EXAM_GRADES.slice(0, 10).map(g => g.id)).id, 'jun-shodan');
});

test('highestPassed is the smallest kyu number held', () => {
  assert.equal(highestPassed([]), null);
  assert.equal(highestPassed(['kyu10', 'kyu9', 'kyu8']).id, 'kyu8');
  assert.equal(highestPassed(['kyu3', 'kyu10']).id, 'kyu3');
  assert.equal(highestPassed(['kyu1', 'shodan']).id, 'shodan', 'a dan outranks every kyu');
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
