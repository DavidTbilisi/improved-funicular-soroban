import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  review, schedule, isDue, daysUntilDue, dueEntries, streakOf, statusOf,
  FIRST_STEPS, EASE_START, EASE_MIN, EASE_MAX, MAX_INTERVAL,
} from '../src/vault/schedule.js';

const D = '2026-07-22';
const fresh = (over = {}) => ({ id: 'v1', ease: EASE_START, interval: 0, due: null, reviews: [], ...over });

test('a new entry is due the moment it is made — recall it while it is fresh', () => {
  const e = schedule(fresh(), D);
  assert.equal(e.due, D);
  assert.equal(isDue(e, D), true);
});

test('schedule does not move an entry that already has a due date', () => {
  const e = schedule(fresh({ due: '2026-08-01' }), D);
  assert.equal(e.due, '2026-08-01');
});

test('the first two successes walk the fixed steps, not the ease', () => {
  let e = fresh();
  e = review(e, true, D);
  assert.equal(e.interval, FIRST_STEPS[0]);
  assert.equal(e.due, '2026-07-23');

  e = review(e, true, '2026-07-23');
  assert.equal(e.interval, FIRST_STEPS[1]);
  assert.equal(e.due, '2026-07-26');
});

test('after the steps the interval multiplies by the ease', () => {
  let e = fresh({ interval: FIRST_STEPS[1] });
  const before = e.ease;
  e = review(e, true, D);
  assert.ok(e.ease > before, 'a success nudges the ease up');
  assert.equal(e.interval, Math.round(FIRST_STEPS[1] * e.ease));
  assert.ok(e.interval > FIRST_STEPS[1]);
});

test('a lapse collapses the interval to the first step and drops the ease hard', () => {
  let e = fresh({ interval: 90, ease: 2.6 });
  e = review(e, false, D);
  assert.equal(e.interval, FIRST_STEPS[0]);
  assert.equal(e.due, '2026-07-23');
  assert.ok(e.ease < 2.6);
  // A lapse must cost more than a success gains, or a coin-flip learner drifts up.
  const gained = review(fresh({ ease: 2.0 }), true, D).ease - 2.0;
  const lost = 2.0 - review(fresh({ ease: 2.0 }), false, D).ease;
  assert.ok(lost > gained, 'a lapse costs more than a success gains');
});

test('a lapse does NOT re-show the same day — that would test short-term memory', () => {
  const e = review(fresh({ interval: 30 }), false, D);
  assert.equal(isDue(e, D), false);
  assert.equal(isDue(e, '2026-07-23'), true);
});

test('the ease is clamped at both ends', () => {
  let e = fresh({ ease: EASE_MIN });
  for (let i = 0; i < 10; i++) e = review(e, false, D);
  assert.equal(e.ease, EASE_MIN);

  let g = fresh({ ease: EASE_MAX, interval: 5 });
  for (let i = 0; i < 20; i++) g = review(g, true, D);
  assert.ok(g.ease <= EASE_MAX);
});

test('the interval is capped at a year', () => {
  let e = fresh({ interval: 300, ease: EASE_MAX });
  e = review(e, true, D);
  assert.equal(e.interval, MAX_INTERVAL);
  e = review(e, true, D);
  assert.equal(e.interval, MAX_INTERVAL, 'and stays there');
});

// The shape the scheme is tuned for.
test('about eight clean reviews reach a year', () => {
  let e = fresh(), day = D, n = 0;
  while (e.interval < 300 && n < 40) { e = review(e, true, day); day = e.due; n++; }
  assert.ok(n >= 6 && n <= 10, `expected ~8 reviews to a year, took ${n}`);
});

test('review never mutates its input', () => {
  const e = fresh({ interval: 10 });
  const snapshot = JSON.stringify(e);
  review(e, true, D);
  assert.equal(JSON.stringify(e), snapshot);
});

test('every review is logged, capped, oldest dropped first', () => {
  let e = fresh();
  for (let i = 0; i < 50; i++) e = review(e, true, D);
  assert.equal(e.reviews.length, 40);
  assert.ok(e.reviews.every(r => r.t === D && r.ok === true));
});

test('daysUntilDue is negative when overdue', () => {
  const e = fresh({ due: '2026-07-20' });
  assert.equal(daysUntilDue(e, D), -2);
  assert.equal(daysUntilDue(fresh({ due: '2026-07-25' }), D), 3);
  assert.equal(daysUntilDue(fresh(), D), null);
});

test('dueEntries returns the overdue first and excludes the waiting', () => {
  const es = [
    fresh({ id: 'a', due: '2026-07-25' }),
    fresh({ id: 'b', due: '2026-07-20' }),
    fresh({ id: 'c', due: D }),
    fresh({ id: 'd', due: null }),
  ];
  assert.deepEqual(dueEntries(es, D).map(e => e.id), ['d', 'b', 'c']);
});

test('streakOf counts successes back from the most recent review', () => {
  assert.equal(streakOf({ reviews: [] }), 0);
  assert.equal(streakOf({ reviews: [{ ok: true }, { ok: true }] }), 2);
  assert.equal(streakOf({ reviews: [{ ok: true }, { ok: false }] }), 0);
  assert.equal(streakOf({ reviews: [{ ok: false }, { ok: true }, { ok: true }] }), 2);
});

test('statusOf gives the view a label without any date arithmetic of its own', () => {
  assert.deepEqual(statusOf(fresh(), D), { state: 'new', label: 'new', days: 0 });
  assert.equal(statusOf(fresh({ due: D }), D).state, 'due');
  assert.equal(statusOf(fresh({ due: '2026-07-19' }), D).label, '3d overdue');
  assert.equal(statusOf(fresh({ due: '2026-07-29' }), D).label, '+7d');
});
