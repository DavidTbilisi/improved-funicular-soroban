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
