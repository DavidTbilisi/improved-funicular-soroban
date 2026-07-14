import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SolveLog } from '../src/tutorial/solveLog.js';
import { MemoryProgressStore } from '../src/tutorial/progressStore.js';

const make = () => new SolveLog(new MemoryProgressStore({}), () => '2026-01-01T00:00');

test('record stamps the injected time, rounds ms, coerces clean, and defaults support to Beads', () => {
  const log = make();
  log.record('lvl', { ms: 1234.6, clean: 1 });
  assert.deepEqual(log.solves('lvl'), [{ t: '2026-01-01T00:00', ms: 1235, clean: true, support: 0 }]);
  assert.deepEqual(log.solves('other'), [], 'unseen ids read as empty');
});

test('record tags the mnemonic-mental support level it was solved at', () => {
  const log = make();
  log.record('lvl', { ms: 900, clean: true, support: 2 });
  assert.equal(log.solves('lvl')[0].support, 2);
});

test('history is capped at the most recent 40 solves', () => {
  const log = make();
  for (let i = 1; i <= 45; i++) log.record('lvl', { ms: i, clean: true });
  const s = log.solves('lvl');
  assert.equal(s.length, 40);
  assert.equal(s[0].ms, 6, 'oldest five dropped');
  assert.equal(s[39].ms, 45);
});

test('best streak is monotonic per id', () => {
  const log = make();
  assert.equal(log.best('m'), 0);
  log.setBest('m', 3);
  log.setBest('m', 1);   // a reset streak never lowers the best
  assert.equal(log.best('m'), 3);
  log.setBest('m', 5);
  assert.equal(log.best('m'), 5);
});
