import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genMitori, genKake, genWari, genKaihei, genQuestion, genPaper, gradePaper, normalizeAnswer } from '../src/exam/paper.js';
import { EXAM_GRADES, gradeById, PASS_MARK } from '../src/exam/grades.js';
import { MathRng, SequenceRng } from '../src/drill/rng.js';

const rng = new MathRng();
const widthOf = n => String(Math.abs(n)).length;

test('every mitori term is exactly the section width', () => {
  for (let i = 0; i < 200; i++) {
    const q = genMitori({ terms: 10, digits: 3, minus: true }, rng);
    assert.equal(q.terms.length, 10);
    for (const t of q.terms) assert.equal(widthOf(t), 3, `term ${t} is not 3 digits`);
  }
});

test('the running total never goes below zero — there is nothing to borrow from', () => {
  for (let i = 0; i < 300; i++) {
    const q = genMitori({ terms: 10, digits: 2, minus: true }, rng);
    let sum = 0;
    for (const t of q.terms) {
      sum += t;
      assert.ok(sum >= 0, `running total went negative: ${q.terms.join(' ')}`);
    }
    assert.equal(sum, q.answer);
  }
});

test('an addition-only section has no minus terms; a minus section has some', () => {
  for (let i = 0; i < 50; i++) {
    const plus = genMitori({ terms: 5, digits: 2, minus: false }, rng);
    assert.ok(plus.terms.every(t => t > 0));
  }
  let sawMinus = 0;
  for (let i = 0; i < 50; i++) {
    const q = genMitori({ terms: 10, digits: 2, minus: true }, rng);
    if (q.terms.some(t => t < 0)) sawMinus++;
    assert.ok(q.terms[0] > 0, 'the first term is never a subtraction');
  }
  assert.ok(sawMinus >= 45, `only ${sawMinus}/50 columns had a minus term`);
});

test('mitori terms are capped at about a third subtraction', () => {
  for (let i = 0; i < 200; i++) {
    const q = genMitori({ terms: 10, digits: 2, minus: true }, rng);
    assert.ok(q.terms.filter(t => t < 0).length <= 4, q.terms.join(' '));
  }
});

test('multiplication operands hold their width and skip the free ones', () => {
  for (let i = 0; i < 200; i++) {
    const q = genKake({ a: 3, b: 2 }, rng);
    assert.equal(widthOf(q.a), 3);
    assert.equal(widthOf(q.b), 2);
    assert.equal(q.answer, q.a * q.b);
  }
  for (let i = 0; i < 100; i++) {
    const q = genKake({ a: 1, b: 1 }, rng);
    assert.ok(q.a >= 2 && q.b >= 2, `${q.a} × ${q.b} answers itself`);
  }
});

test('division is exact, and the dividend keeps its width', () => {
  for (const spec of [{ a: 2, b: 1 }, { a: 3, b: 2 }, { a: 5, b: 3 }, { a: 7, b: 3 }]) {
    for (let i = 0; i < 120; i++) {
      const q = genWari(spec, rng);
      assert.equal(widthOf(q.a), spec.a, `${q.a} ÷ ${q.b} — dividend width`);
      assert.equal(widthOf(q.b), spec.b, `${q.a} ÷ ${q.b} — divisor width`);
      assert.equal(q.a % q.b, 0, `${q.a} ÷ ${q.b} leaves a remainder`);
      assert.equal(q.answer, q.a / q.b);
      assert.ok(q.answer >= 2, 'a quotient of 1 is not a division question');
    }
  }
});

test('a paper carries every section of its grade, generated up front', () => {
  for (const g of EXAM_GRADES) {
    const p = genPaper(g, rng);
    assert.equal(p.gradeId, g.id);
    assert.equal(p.kyu, g.kyu);
    assert.equal(p.sections.length, g.sections.length);
    p.sections.forEach((s, i) => {
      assert.equal(s.questions.length, g.sections[i].count);
      assert.equal(s.kind, g.sections[i].kind);
      for (const q of s.questions) assert.equal(typeof q.answer, 'number');
    });
  }
});

test('the same rng seed deals the same paper', () => {
  const seed = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9];
  const a = genPaper(gradeById('kyu8'), new SequenceRng(seed));
  const b = genPaper(gradeById('kyu8'), new SequenceRng(seed));
  assert.deepEqual(a, b);
});

test('answers normalise the way people write numbers', () => {
  assert.equal(normalizeAnswer(' 1 234 '), '1234');
  assert.equal(normalizeAnswer('1,234'), '1234');
  assert.equal(normalizeAnswer('0042'), '42');
  assert.equal(normalizeAnswer(42), '42');
  assert.equal(normalizeAnswer('-7'), '-7');
  assert.equal(normalizeAnswer('-0'), '0');
  assert.equal(normalizeAnswer('0'), '0', 'zero is an answer, not a blank');
});

test('anything that is not an integer marks as unattempted, not as wrong', () => {
  for (const junk of ['12x4', '', '  ', 'twelve', '1.5', null, undefined]) {
    assert.equal(normalizeAnswer(junk), null, JSON.stringify(junk));
  }
});

test('marking scores each section out of 100 and passes only on all of them', () => {
  const paper = genPaper(gradeById('kyu9'), rng);
  const right = paper.sections.map(s => s.questions.map(q => String(q.answer)));
  const perfect = gradePaper(paper, right);
  assert.equal(perfect.score, 100);
  assert.ok(perfect.passed);
  assert.ok(perfect.sections.every(s => s.score === 100 && s.passed));

  // 100, 100, 40 — an average of 80 would pass this. Per-section does not.
  const lopsided = right.map((sec, i) => (i === 2 ? sec.map((a, qi) => (qi < 2 ? a : 'nope')) : sec));
  const mixed = gradePaper(paper, lopsided);
  assert.equal(mixed.passed, false);
  assert.equal(mixed.sections[0].passed, true);
  assert.equal(mixed.sections[2].passed, false);
  assert.ok(mixed.score > PASS_MARK, 'the mean alone would have passed it');
});

test('an unattempted question is marked, and reads as blank rather than wrong', () => {
  const paper = genPaper(gradeById('kyu10'), rng);
  const answers = paper.sections.map(s => s.questions.map(() => null));
  const r = gradePaper(paper, answers);
  assert.equal(r.correct, 0);
  assert.equal(r.score, 0);
  assert.equal(r.passed, false);
  const m = r.sections[0].marks[0];
  assert.equal(m.given, null);
  assert.equal(m.ok, false);
  assert.equal(m.answer, paper.sections[0].questions[0].answer);
  assert.ok(m.q, 'the question rides along so the mark sheet can show it');
});

test('4 of 5 is 80 and passes; 3 of 5 is 60 and does not', () => {
  const paper = genPaper(gradeById('kyu10'), rng);
  const four = paper.sections.map(s => s.questions.map((q, i) => (i === 0 ? 'nope' : String(q.answer))));
  const three = paper.sections.map(s => s.questions.map((q, i) => (i < 2 ? 'nope' : String(q.answer))));
  assert.equal(gradePaper(paper, four).sections[0].score, 80);
  assert.ok(gradePaper(paper, four).passed);
  assert.equal(gradePaper(paper, three).sections[0].score, 60);
  assert.equal(gradePaper(paper, three).passed, false);
});

// --- past 1級: the two sections a kyu paper never has ------------------------
test('開平 deals perfect squares, built from the root', () => {
  for (const digits of [2, 3]) {
    for (let i = 0; i < 150; i++) {
      const q = genKaihei({ digits }, rng);
      assert.equal(q.kind, 'kaihei');
      assert.equal(q.answer * q.answer, q.a, `√${q.a}`);
      assert.equal(String(q.answer).length, digits, `${q.answer} is ${digits} digits`);
      assert.ok(q.answer >= 4, 'a root of 1, 2 or 3 answers itself');
    }
  }
});

test('暗算 is the same column as 見取算 — one generator, no drift', () => {
  const spec = { kind: 'anzan', terms: 5, digits: 2, minus: false, count: 4, seconds: 180 };
  for (let i = 0; i < 100; i++) {
    const q = genQuestion(spec, rng);
    assert.equal(q.kind, 'anzan', 'the section owns the kind');
    assert.equal(q.terms.length, 5);
    let run = 0;
    for (const t of q.terms) {
      assert.equal(String(Math.abs(t)).length, 2);
      run += t;
      assert.ok(run >= 0);
    }
    assert.equal(run, q.answer);
  }
});

test('a dan paper carries every section its grade declares, and marks like any other', () => {
  const grade = gradeById('shodan');
  const paper = genPaper(grade, rng);
  assert.deepEqual(paper.sections.map(s => s.kind), ['mitori', 'kake', 'wari', 'kaihei', 'anzan']);
  const right = paper.sections.map(s => s.questions.map(q => String(q.answer)));
  const perfect = gradePaper(paper, right);
  assert.equal(perfect.score, 100);
  assert.ok(perfect.passed);
  // Fail only the root section: five sections, and every one still has to pass.
  const noRoot = right.map((sec, i) => (i === 3 ? sec.map(() => '1') : sec));
  const r = gradePaper(paper, noRoot);
  assert.equal(r.passed, false);
  assert.equal(r.sections[3].score, 0);
  assert.equal(r.sections[4].passed, true);
});
