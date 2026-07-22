import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExamSession } from '../src/exam/examSession.js';
import { ExamLog } from '../src/exam/examLog.js';
import { EXAM_GRADES, gradeById } from '../src/exam/grades.js';
import { MemoryProgressStore } from '../src/tutorial/progressStore.js';
import { MathRng } from '../src/drill/rng.js';

// The clock is the only moving part, so a test drives it by hand: `at(ms)` puts
// the session's idea of now wherever the question needs it.
const setup = ({ gradeId = 'kyu10' } = {}) => {
  let now = 0;
  const events = [];
  const log = new ExamLog(new MemoryProgressStore(), { nowIso: () => '2026-07-22T10:00' });
  const s = new ExamSession({ grades: EXAM_GRADES, rng: new MathRng(), log, clock: { now: () => now } });
  s.subscribe(e => events.push(e));
  s.start(gradeId);
  return {
    s, events, log,
    at: ms => { now = ms; },
    advance: ms => { now += ms; },
    types: () => events.map(e => e.type),
    last: type => [...events].reverse().find(e => e.type === type) || null,
  };
};

// Answer the current question correctly, for as many questions as asked.
const answerAll = (s, correct = true) => {
  let guard = 0;
  while (s.active && guard++ < 200) {
    const q = s.question;
    s.submit(correct ? String(q.answer) : String(q.answer + 1));
  }
};

test('starting deals the paper and opens the first section on its first question', () => {
  const { s, events } = setup();
  assert.equal(events[0].type, 'started');
  assert.equal(events[0].gradeId, 'kyu10');
  assert.equal(events[0].questions, 10);
  assert.equal(events[1].type, 'section');
  assert.equal(events[1].kind, 'mitori');
  assert.equal(events[2].type, 'question');
  assert.equal(events[2].si, 0);
  assert.equal(events[2].qi, 0);
  assert.ok(s.question.terms.length === 5);
});

test('an unknown grade does nothing at all', () => {
  const { s, events } = setup();
  const before = events.length;
  s.start('kyu-nope');
  assert.equal(events.length, before);
  assert.ok(s.active);
});

test('answers are recorded silently — the paper never marks as you go', () => {
  const { s, types } = setup();
  s.submit(String(s.question.answer));
  s.submit('0');
  assert.deepEqual(types().filter(t => t === 'finished'), []);
  assert.ok(!types().includes('result'), 'no per-question verdict exists');
});

test('submitting walks the questions, then the sections, then finishes', () => {
  const { s, last } = setup();
  answerAll(s);
  const fin = last('finished');
  assert.ok(fin, 'finished');
  assert.equal(fin.report.passed, true);
  assert.equal(fin.report.score, 100);
  assert.equal(s.active, false);
});

test('a wrong paper finishes too, and fails', () => {
  const { s, last } = setup();
  answerAll(s, false);
  assert.equal(last('finished').report.passed, false);
  assert.equal(last('finished').report.score, 0);
});

test('the board is the answer sheet — a BigInt board value marks fine', () => {
  const { s, last } = setup();
  let guard = 0;
  while (s.active && guard++ < 200) s.submit(BigInt(s.question.answer));
  assert.equal(last('finished').report.score, 100);
});

test('skipping leaves the question blank and moves on', () => {
  const { s, last } = setup();
  s.skip();
  answerAll(s);
  const sec = last('finished').report.sections[0];
  assert.equal(sec.marks[0].given, null);
  assert.equal(sec.correct, 4);
  assert.equal(sec.score, 80);
});

test('the section clock is a wall: time out closes the section, unanswered', () => {
  const { s, at, events, last } = setup();
  const secs = gradeById('kyu10').sections[0].seconds;
  s.submit(String(s.question.answer));
  at(secs * 1000 + 1);
  assert.equal(s.tick(), 0);
  const expired = last('expired');
  assert.ok(expired);
  assert.equal(expired.si, 0);
  assert.equal(expired.unanswered, 4);
  // It moved on rather than stopping: the next section is open.
  assert.equal(s.si, 1);
  assert.equal(s.section.kind, 'kake');
  assert.ok(events.some(e => e.type === 'section' && e.si === 1));
});

test('an answer keyed after the bell is not taken', () => {
  const { s, at, last } = setup();
  const secs = gradeById('kyu10').sections[0].seconds;
  const wanted = String(s.question.answer);
  at(secs * 1000 + 5);
  s.submit(wanted);
  assert.equal(s.si, 1, 'the late answer closed the section instead');
  answerAll(s);
  assert.equal(last('finished').report.sections[0].correct, 0);
});

test('time saved in one section does not carry into the next', () => {
  const { s, at, advance } = setup();
  const [first, second] = gradeById('kyu10').sections;
  at(20_000);                       // the column took twenty seconds…
  answerFirstSection(s);
  assert.equal(s.si, 1);
  // …and the multiplication still opens on its own full clock, not on what was
  // left of the column's.
  assert.equal(s.remainingMs(), second.seconds * 1000);
  assert.ok(first.seconds * 1000 - 20_000 !== second.seconds * 1000, 'the two clocks are distinguishable');
  advance(second.seconds * 1000 + 1);
  assert.equal(s.remainingMs(), 0);
});

// Answer exactly the first section, leaving the session in the second.
function answerFirstSection(s) {
  const si = s.si;
  let guard = 0;
  while (s.active && s.si === si && guard++ < 50) s.submit(String(s.question.answer));
}

test('ticking reports the time left without touching the paper', () => {
  const { s, at, last } = setup();
  at(4000);
  const left = s.tick();
  assert.equal(left, gradeById('kyu10').sections[0].seconds * 1000 - 4000);
  assert.equal(last('tick').remainingMs, left);
  assert.equal(s.qi, 0);
});

test('a finished paper is recorded once, with its per-section scores', () => {
  const { s, log } = setup();
  answerAll(s);
  const rows = log.attempts();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].gradeId, 'kyu10');
  assert.equal(rows[0].passed, true);
  assert.deepEqual(rows[0].sections.map(x => x.kind), ['mitori', 'kake']);
  assert.equal(log.passedIds()[0], 'kyu10');
});

test('walking out records nothing — an abandoned paper is not a failed one', () => {
  const { s, log, last } = setup();
  s.submit('0');
  s.abandon();
  assert.equal(s.active, false);
  assert.deepEqual(log.attempts(), []);
  assert.equal(last('abandoned').gradeId, 'kyu10');
  // And nothing responds afterwards.
  s.submit('1');
  s.skip();
  assert.equal(s.tick(), 0);
});

test('a three-section grade runs all three in table order', () => {
  const { s, events } = setup({ gradeId: 'kyu6' });
  answerAll(s);
  const kinds = events.filter(e => e.type === 'section').map(e => e.kind);
  assert.deepEqual(kinds, ['mitori', 'kake', 'wari']);
});
