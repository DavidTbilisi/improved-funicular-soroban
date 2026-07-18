import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStatsStore, DrillStatsService } from '../src/drill/statsStore.js';

const FIXED = () => '2026-07-03T12:00';

test('saveSession returns null for empty sessions', () => {
  const svc = new DrillStatsService(new MemoryStatsStore(), FIXED);
  assert.equal(svc.saveSession('faceToDigit', { n: 0, correct: 0, sumMs: 0, floorPass: 0 }), null);
});

test('saveSession computes accuracy / mean / floor%', () => {
  const store = new MemoryStatsStore();
  const svc = new DrillStatsService(store, FIXED);
  const rec = svc.saveSession('faceToDigit', { n: 4, correct: 3, sumMs: 2000, floorPass: 2 });
  assert.deepEqual(rec, { t: '2026-07-03T12:00', n: 4, acc: 75, meanMs: 500, floorPct: 50 });
  assert.equal(store.load().faceToDigit.sessions.length, 1);
});

test('best tracks the highest floor%, tie-broken by lower mean', () => {
  const svc = new DrillStatsService(new MemoryStatsStore(), FIXED);
  svc.saveSession('d', { n: 10, correct: 10, sumMs: 5000, floorPass: 5 });  // floor 50%
  svc.saveSession('d', { n: 10, correct: 10, sumMs: 4000, floorPass: 8 });  // floor 80% -> best
  svc.saveSession('d', { n: 10, correct: 10, sumMs: 9000, floorPass: 5 });  // floor 50%, ignored
  assert.equal(svc.best('d').floorPct, 80);
  assert.equal(svc.best('d').meanMs, 400);
});

test('keeps at most 20 sessions', () => {
  const store = new MemoryStatsStore();
  const svc = new DrillStatsService(store, FIXED);
  for (let i = 0; i < 25; i++) svc.saveSession('d', { n: 1, correct: 1, sumMs: 100, floorPass: 1 });
  assert.equal(store.load().d.sessions.length, 20);
});

test('per-fact tallies merge into lifetime aggregates across sessions', () => {
  const svc = new DrillStatsService(new MemoryStatsStore(), FIXED);
  svc.saveSession('d', {
    n: 2, correct: 1, sumMs: 1000, floorPass: 1,
    facts: { '7x8': { n: 2, miss: 1, sumMs: 1000, floorPass: 1 } },
  });
  svc.saveSession('d', {
    n: 2, correct: 2, sumMs: 600, floorPass: 2,
    facts: {
      '7x8': { n: 1, miss: 0, sumMs: 300, floorPass: 1 },
      '6x9': { n: 1, miss: 0, sumMs: 300, floorPass: 1 },
    },
  });
  assert.deepEqual(svc.facts('d')['7x8'], { n: 3, miss: 1, sumMs: 1300, floorPass: 2 });
  assert.deepEqual(svc.facts('d')['6x9'], { n: 1, miss: 0, sumMs: 300, floorPass: 1 });
  assert.deepEqual(svc.facts('undrilled'), {});
});

test('history returns the saved sessions oldest-first, [] for undrilled decks', () => {
  const svc = new DrillStatsService(new MemoryStatsStore(), FIXED);
  assert.deepEqual(svc.history('d'), []);
  svc.saveSession('d', { n: 10, correct: 8, sumMs: 8000, floorPass: 4 });
  svc.saveSession('d', { n: 10, correct: 9, sumMs: 7000, floorPass: 6 });
  const h = svc.history('d');
  assert.equal(h.length, 2);
  assert.equal(h[0].floorPct, 40);
  assert.equal(h[1].floorPct, 60);
});
