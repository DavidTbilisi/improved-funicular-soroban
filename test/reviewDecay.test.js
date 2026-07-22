import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  halfLife, retention, dueAfterDays, forecast, retentionText, bandOf,
  HL0_DAYS, GROWTH, MAX_HL_DAYS, REVIEW_AT,
} from '../src/review/decay.js';

test('one day of practice buys the base half-life; more days multiply it', () => {
  assert.equal(halfLife(1), HL0_DAYS);
  assert.equal(halfLife(2), HL0_DAYS * GROWTH);
  assert.ok(Math.abs(halfLife(3) - HL0_DAYS * GROWTH * GROWTH) < 1e-9);
  assert.equal(halfLife(0), 0, 'never practised has no half-life at all');
});

test('the half-life is capped — past a year the model has nothing to say', () => {
  assert.equal(halfLife(50), MAX_HL_DAYS);
  assert.ok(halfLife(12) <= MAX_HL_DAYS);
});

test('strength is counted in DAYS, so cramming cannot buy a year', () => {
  // The caller passes distinct practice days; forty reps in one sitting is one.
  assert.equal(halfLife(1), HL0_DAYS);
  assert.ok(halfLife(10) > halfLife(1) * 100, 'ten spread days are worth far more');
});

test('a fumbled day buys less growth than a clean one', () => {
  assert.ok(halfLife(6, 0.5) < halfLife(6, 1));
  assert.ok(halfLife(6, 0) < halfLife(6, 0.5));
  // …but the first day still counts: you did learn something.
  assert.equal(halfLife(1, 0), HL0_DAYS);
  assert.equal(halfLife(6, 0), HL0_DAYS, 'no growth at all at zero quality');
});

test('retention halves every half-life', () => {
  assert.equal(retention(0, 10), 1);
  assert.equal(retention(10, 10), 0.5);
  assert.equal(retention(20, 10), 0.25);
  assert.equal(retention(5, 0), 0, 'nothing practised, nothing retained');
});

test('a skill comes due when retention reaches the review mark', () => {
  const hl = 10;
  const d = dueAfterDays(hl);
  assert.ok(Math.abs(retention(d, hl) - REVIEW_AT) < 1e-9);
  assert.ok(d > 0 && d < hl, 'due well before it is half forgotten');
});

test('a never-practised skill is not "forgotten" — there is nothing to schedule', () => {
  const f = forecast({ activeDays: 0, daysSince: null });
  assert.equal(f.practised, false);
  assert.equal(f.due, false);
  assert.equal(f.retention, null);
  assert.equal(f.state, 'new');
  assert.equal(retentionText(f), 'not started');
  // Practised but with no last day is the same case (a hand-edited save).
  assert.equal(forecast({ activeDays: 4, daysSince: null }).practised, false);
});

test('practised today is fully held and not due', () => {
  const f = forecast({ activeDays: 3, daysSince: 0 });
  assert.equal(f.retention, 1);
  assert.equal(f.due, false);
  assert.equal(f.state, 'fresh');
  assert.ok(f.dueIn > 0);
});

test('the same gap is due for a young skill and safe for an old one', () => {
  const young = forecast({ activeDays: 1, daysSince: 4 });
  const old = forecast({ activeDays: 8, daysSince: 4 });
  assert.equal(young.due, true);
  assert.equal(old.due, false);
  assert.ok(old.retention > young.retention);
  // This is the whole point: the flat "3 days = cold" rule could not tell them
  // apart, and would have sent the learner to the wrong one.
});

test('overdue is reported in days, and the text says so', () => {
  const f = forecast({ activeDays: 2, daysSince: 30 });
  assert.equal(f.due, true);
  assert.ok(f.overdue > 20);
  assert.match(retentionText(f), /% held · \d+d overdue/);
  assert.match(retentionText(forecast({ activeDays: 6, daysSince: 1 })), /% held · due in \d+d/);
});

test('the bands run fresh → holding → due → cold', () => {
  assert.equal(bandOf(0.95).state, 'fresh');
  assert.equal(bandOf(0.8).state, 'holding');
  assert.equal(bandOf(0.5).state, 'due');
  assert.equal(bandOf(0.1).state, 'cold');
  assert.equal(forecast({ activeDays: 1, daysSince: 30 }).state, 'cold');
});

test('retention only ever falls with time, and rises with practice days', () => {
  let prev = 1;
  for (let d = 0; d <= 30; d++) {
    const r = forecast({ activeDays: 4, daysSince: d }).retention;
    assert.ok(r <= prev + 1e-9, `day ${d}`);
    prev = r;
  }
  let last = 0;
  for (let s = 1; s <= 10; s++) {
    const r = forecast({ activeDays: s, daysSince: 7 }).retention;
    assert.ok(r >= last, `strength ${s}`);
    last = r;
  }
});
