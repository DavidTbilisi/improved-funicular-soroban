import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harvestDays } from '../src/today/harvest.js';

test('nothing saved → no days', () => {
  assert.deepEqual(harvestDays(), []);
  assert.deepEqual(harvestDays({}), []);
});

test('drill sessions, practice solves, trainer solves and unlocks all contribute', () => {
  const days = harvestDays({
    drillStats: { fingerTimes: { sessions: [{ t: '2026-07-01T10:00', n: 20 }] } },
    practiceHistory: { 'big-add': { solves: [{ t: '2026-07-02T11:00', ms: 3000, clean: true }] } },
    trainerHistory: { 'mul-1x1': { solves: [{ t: '2026-07-03T12:00', ms: 9000, clean: true }] } },
    achievements: { unlocked: { 'first-solve': '2026-07-04T13:20:11.004Z' } },
  });
  assert.deepEqual(days, ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04']);
});

test('days are deduped across sources and decks, and sorted ascending', () => {
  const days = harvestDays({
    drillStats: {
      a: { sessions: [{ t: '2026-07-05T10:00' }, { t: '2026-07-01T10:00' }] },
      b: { sessions: [{ t: '2026-07-05T18:00' }] },
    },
    practiceHistory: { read: { solves: [{ t: '2026-07-01T09:00' }] } },
  });
  assert.deepEqual(days, ['2026-07-01', '2026-07-05']);
});

test('every shape of junk is skipped rather than thrown on', () => {
  const days = harvestDays({
    drillStats: { ok: { sessions: [{ t: '2026-07-01T10:00' }, null, 7, { t: 42 }, {}] },
                  bad: null, worse: 'string', arr: [], noSessions: { best: {} },
                  strSessions: { sessions: 'nope' } },
    practiceHistory: 'not an object',
    trainerHistory: 12,
    achievements: { unlocked: 'nope' },
  });
  assert.deepEqual(days, ['2026-07-01']);
});

test('achievements with no unlocked map contribute nothing', () => {
  assert.deepEqual(harvestDays({ achievements: { counters: { solves: 5 } } }), []);
});

// Documented limitation: neither of these keys carries a wall-clock stamp.
test('the village save and the fault log are correctly not harvestable', () => {
  const days = harvestDays({
    drillStats: { d: { sessions: [{ t: '2026-07-01T10:00' }] } },
    // deliberately passed as unknown blobs — they must be ignored, not crash
    save: { day: 40, stats: { solves: 120 } },
    faults: { 'big:3-7': 9 },
  });
  assert.deepEqual(days, ['2026-07-01']);
});
