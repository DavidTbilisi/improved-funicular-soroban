import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryProgressStore } from '../src/tutorial/progressStore.js';
import { AnzanLog } from '../src/anzan/anzanLog.js';

const log = (initial = {}, opts = {}) =>
  new AnzanLog(new MemoryProgressStore(initial), { nowIso: () => '2026-07-22T10:00', ...opts });

test('an untouched level reads as empty, not as a throw', () => {
  const l = log();
  assert.deepEqual(l.rounds('warm'), []);
  assert.equal(l.best('warm'), 0);
  assert.equal(l.fastest('warm'), null);
  assert.equal(l.accuracy('warm'), null);
});

test('a round records its interval and its verdict', () => {
  const l = log();
  l.record('warm', { intervalMs: 800, ok: true });
  l.record('warm', { intervalMs: 800, ok: false });
  assert.deepEqual(l.rounds('warm'), [
    { t: '2026-07-22T10:00', ms: 800, ok: true },
    { t: '2026-07-22T10:00', ms: 800, ok: false },
  ]);
});

// The whole reason this is not a SolveLog.
test('correct at 400 ms and correct at 1600 ms stay distinguishable', () => {
  const l = log();
  l.record('warm', { intervalMs: 1600, ok: true });
  l.record('warm', { intervalMs: 400, ok: true });
  assert.deepEqual(l.rounds('warm').map(r => r.ms), [1600, 400]);
});

test('levels keep separate histories', () => {
  const l = log();
  l.record('warm', { intervalMs: 800, ok: true });
  l.record('ten3', { intervalMs: 300, ok: false });
  assert.equal(l.rounds('warm').length, 1);
  assert.equal(l.rounds('ten3').length, 1);
  assert.equal(l.rounds('ten3')[0].ms, 300);
});

test('best keeps the maximum streak and never regresses', () => {
  const l = log();
  l.setBest('warm', 3);
  l.setBest('warm', 5);
  l.setBest('warm', 1);
  assert.equal(l.best('warm'), 5);
});

test('fastest keeps the MINIMUM interval — lower is better', () => {
  const l = log();
  l.setFastest('warm', 1000);
  assert.equal(l.fastest('warm'), 1000);
  l.setFastest('warm', 650);
  assert.equal(l.fastest('warm'), 650);
  l.setFastest('warm', 2000);
  assert.equal(l.fastest('warm'), 650, 'a slower clear does not overwrite a faster one');
});

test('accuracy is the correct share of the recent window', () => {
  const l = log();
  [true, true, false, true].forEach(ok => l.record('warm', { intervalMs: 800, ok }));
  assert.equal(l.accuracy('warm'), 0.75);
  assert.equal(l.accuracy('warm', 2), 0.5, 'the window is respected');
});

test('the cap keeps the most recent rounds', () => {
  const l = log({}, { cap: 3 });
  for (const ms of [100, 200, 300, 400, 500]) l.record('warm', { intervalMs: ms, ok: true });
  assert.deepEqual(l.rounds('warm').map(r => r.ms), [300, 400, 500]);
});

test('rounds() hands back a copy — a caller cannot mutate the store', () => {
  const l = log();
  l.record('warm', { intervalMs: 800, ok: true });
  l.rounds('warm').push({ t: 'x', ms: 1, ok: false });
  assert.equal(l.rounds('warm').length, 1);
});

test('a corrupt or foreign blob degrades to empty instead of throwing', () => {
  for (const junk of [null, 'wat', 7, [], { warm: 'nope' }, { warm: { rounds: 'nope', best: 'x' } }]) {
    const l = log(junk);
    assert.deepEqual(l.rounds('warm'), []);
    assert.equal(l.best('warm'), 0);
    assert.equal(l.fastest('warm'), null);
    l.record('warm', { intervalMs: 800, ok: true });
    assert.equal(l.rounds('warm').length, 1, 'and it heals on the next write');
  }
});
