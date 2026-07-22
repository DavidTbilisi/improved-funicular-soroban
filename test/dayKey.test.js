import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, shiftDay, daysBetween, streakOf } from '../src/today/dayKey.js';

test('dayKey reads both stamp formats the app writes', () => {
  assert.equal(dayKey('2026-07-22T14:33'), '2026-07-22');           // SolveLog / DrillStatsService
  assert.equal(dayKey('2026-07-22T14:33:07.921Z'), '2026-07-22');   // AchievementTracker
  assert.equal(dayKey('2026-07-22'), '2026-07-22');
});

test('dayKey rejects junk instead of poisoning the day set', () => {
  for (const junk of [null, undefined, 42, {}, [], '', 'yesterday', '26-07-22'])
    assert.equal(dayKey(junk), null);
});

test('shiftDay crosses month, year and leap-day boundaries', () => {
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDay('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDay('2025-12-31', 1), '2026-01-01');
  assert.equal(shiftDay('2028-03-01', -1), '2028-02-29');   // leap year
  assert.equal(shiftDay('2026-07-22', 0), '2026-07-22');
  assert.equal(shiftDay('nope', -1), null);
});

test('daysBetween is signed and calendar-correct', () => {
  assert.equal(daysBetween('2026-07-20', '2026-07-22'), 2);
  assert.equal(daysBetween('2026-07-22', '2026-07-20'), -2);
  assert.equal(daysBetween('2026-02-28', '2026-03-01'), 1);
  assert.equal(daysBetween('2028-02-28', '2028-03-01'), 2); // leap
  assert.equal(daysBetween('x', '2026-07-22'), null);
});

test('empty history → a zeroed streak, not a throw', () => {
  const s = streakOf([], '2026-07-22');
  assert.deepEqual(s, { current: 0, longest: 0, lastActive: null, activeToday: false, total: 0 });
  assert.equal(streakOf(null, '2026-07-22').current, 0);
});

test('a single day today is a streak of 1', () => {
  const s = streakOf(['2026-07-22'], '2026-07-22');
  assert.equal(s.current, 1);
  assert.equal(s.longest, 1);
  assert.equal(s.activeToday, true);
  assert.equal(s.lastActive, '2026-07-22');
});

test('a run ending today counts through to today', () => {
  const s = streakOf(['2026-07-18', '2026-07-19', '2026-07-20', '2026-07-21', '2026-07-22'], '2026-07-22');
  assert.equal(s.current, 5);
  assert.equal(s.activeToday, true);
});

// The rule the whole feature hangs on: unfed but alive.
test('a run ending YESTERDAY is still alive, just not fed today', () => {
  const s = streakOf(['2026-07-20', '2026-07-21'], '2026-07-22');
  assert.equal(s.current, 2, 'the streak is not reset merely because today is unplayed');
  assert.equal(s.activeToday, false);
  assert.equal(s.lastActive, '2026-07-21');
});

test('a two-day gap breaks the current run', () => {
  const s = streakOf(['2026-07-19', '2026-07-20'], '2026-07-22');
  assert.equal(s.current, 0);
  assert.equal(s.longest, 2, 'but the historical best survives');
  assert.equal(s.activeToday, false);
});

test('a gap inside the history stops the current count there', () => {
  const s = streakOf(['2026-07-01', '2026-07-02', '2026-07-21', '2026-07-22'], '2026-07-22');
  assert.equal(s.current, 2);
});

test('longest is found across gaps, independent of the current run', () => {
  const s = streakOf(
    ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-07-22'], '2026-07-22');
  assert.equal(s.current, 1);
  assert.equal(s.longest, 4);
});

test('unsorted, duplicated and junk-laced input is tolerated', () => {
  const s = streakOf(
    ['2026-07-22', '2026-07-20', '2026-07-21', '2026-07-21', null, 'nope', 7, '2026-07-22'],
    '2026-07-22');
  assert.equal(s.current, 3);
  assert.equal(s.total, 3, 'duplicates and junk do not inflate the total');
});

test('with no todayKey there is no current run, but the history still reads', () => {
  const s = streakOf(['2026-07-21', '2026-07-22'], null);
  assert.equal(s.current, 0);
  assert.equal(s.longest, 2);
  assert.equal(s.total, 2);
});
