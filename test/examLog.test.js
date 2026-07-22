import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExamLog } from '../src/exam/examLog.js';
import { MemoryProgressStore } from '../src/tutorial/progressStore.js';

const log = (initial = {}, nowIso = () => '2026-07-22T10:00') =>
  new ExamLog(new MemoryProgressStore(initial), { nowIso });

const report = (gradeId, score, passed, kyu = 10) => ({
  gradeId, kyu, score, passed, ms: 90_000,
  sections: [{ kind: 'mitori', score, passed }, { kind: 'kake', score, passed }],
});

test('an empty log reports nothing rather than throwing', () => {
  const l = log();
  assert.deepEqual(l.attempts(), []);
  assert.equal(l.best('kyu10'), null);
  assert.equal(l.passed('kyu10'), false);
  assert.deepEqual(l.passedIds(), []);
  assert.equal(l.lastAttempt(), null);
});

test('junk in the key heals to an empty log', () => {
  for (const junk of [null, 42, 'nope', [1, 2], { attempts: 'no' }]) {
    assert.deepEqual(log(junk).attempts(), []);
  }
});

test('recording keeps the summary rows and stamps the time', () => {
  const l = log();
  const row = l.record(report('kyu10', 90, true));
  assert.equal(row.t, '2026-07-22T10:00');
  assert.equal(row.gradeId, 'kyu10');
  assert.equal(row.score, 90);
  assert.equal(row.passed, true);
  assert.equal(row.ms, 90_000);
  assert.deepEqual(row.sections, [{ kind: 'mitori', score: 90, passed: true }, { kind: 'kake', score: 90, passed: true }]);
  assert.equal(l.attempts().length, 1);
});

test('the paper itself is not kept — only the scores', () => {
  const l = log();
  const row = l.record({ ...report('kyu10', 100, true), sections: [{ kind: 'mitori', score: 100, passed: true, marks: [{ q: { terms: [1, 2, 3] } }] }] });
  assert.deepEqual(Object.keys(row.sections[0]).sort(), ['kind', 'passed', 'score']);
});

test('a report without a grade is refused', () => {
  const l = log();
  assert.equal(l.record(null), null);
  assert.equal(l.record({ score: 100 }), null);
  assert.deepEqual(l.attempts(), []);
});

test('best is the highest score ever, pass or fail', () => {
  const l = log();
  l.record(report('kyu10', 60, false));
  l.record(report('kyu10', 100, true));
  l.record(report('kyu10', 80, true));
  assert.equal(l.best('kyu10'), 100);
  assert.equal(l.best('kyu9'), null);
  assert.equal(l.attempts('kyu10').length, 3);
  assert.equal(l.lastAttempt('kyu10').score, 80);
});

test('a grade stays passed once passed, however badly it goes after', () => {
  const l = log();
  l.record(report('kyu10', 100, true));
  l.record(report('kyu10', 20, false));
  assert.equal(l.passed('kyu10'), true);
  assert.deepEqual(l.passedIds(), ['kyu10']);
});

test('passedIds lists each grade once, in the order it was first passed', () => {
  const l = log();
  l.record(report('kyu10', 90, true));
  l.record(report('kyu9', 40, false, 9));
  l.record(report('kyu9', 75, true, 9));
  l.record(report('kyu9', 80, true, 9));
  assert.deepEqual(l.passedIds(), ['kyu10', 'kyu9']);
});

test('attempts are capped at the most recent 40', () => {
  const l = new ExamLog(new MemoryProgressStore(), { nowIso: () => 't', cap: 5 });
  for (let i = 0; i < 12; i++) l.record(report('kyu10', i, false));
  const rows = l.attempts();
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map(r => r.score), [7, 8, 9, 10, 11]);
});

test('the blob survives a round trip through the store', () => {
  const store = new MemoryProgressStore();
  new ExamLog(store, { nowIso: () => 't' }).record(report('kyu8', 71, true, 8));
  const reread = new ExamLog(store);
  assert.equal(reread.best('kyu8'), 71);
  assert.equal(reread.passed('kyu8'), true);
});
