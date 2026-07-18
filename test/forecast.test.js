import { test } from 'node:test';
import assert from 'node:assert/strict';
import { automaticityForecast } from '../src/drill/forecast.js';

const sess = pcts => pcts.map(floorPct => ({ floorPct }));

test('no sessions → no forecast, empty message', () => {
  const f = automaticityForecast([]);
  assert.equal(f.status, 'none');
  assert.equal(f.message, '');
});

test('too few sessions is only warming up', () => {
  const f = automaticityForecast(sess([30, 40]));
  assert.equal(f.status, 'warming');
  assert.ok(f.message.includes('1 more'));
});

test('at or over the target reads as automatic regardless of count', () => {
  const f = automaticityForecast(sess([95]));
  assert.equal(f.status, 'automatic');
  assert.equal(f.latest, 95);
});

test('a climbing share projects sessions-to-target from the slope', () => {
  // 40 → 50 → 60: slope 10/session, gap to 90 is 30 → 3 sessions.
  const f = automaticityForecast(sess([40, 50, 60]));
  assert.equal(f.status, 'climbing');
  assert.equal(f.sessionsToTarget, 3);
  assert.ok(f.message.includes('≈3 more sessions'));
});

test('a flat or sinking share refuses an ETA', () => {
  const f = automaticityForecast(sess([60, 60, 60, 59]));
  assert.equal(f.status, 'flat');
  assert.equal(f.sessionsToTarget, null);
  assert.ok(f.message.includes('not climbing'));
});

test('a shallow slope is capped, not extrapolated to absurdity', () => {
  // slope ≈ 0.65 pct-points/session, gap 44 → raw ETA 68 sessions, capped.
  const f = automaticityForecast(sess([40, 41, 41, 42, 43, 43, 44, 45, 45, 46]));
  assert.equal(f.status, 'climbing');
  assert.equal(f.capped, true);
  assert.equal(f.sessionsToTarget, 40);
  assert.ok(f.message.includes('40+'));
});

test('forecast reads only the recent window', () => {
  // Ancient zeros must not drag the slope: last 10 are flat at 70.
  const f = automaticityForecast(sess([0, 0, 0, ...Array(10).fill(70)]));
  assert.equal(f.status, 'flat');
  assert.equal(f.latest, 70);
});
