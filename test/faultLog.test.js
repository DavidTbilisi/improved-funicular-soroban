import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FaultLog, fumbleRows } from '../src/tutorial/faultLog.js';
import { MemoryProgressStore } from '../src/tutorial/progressStore.js';

const make = () => new FaultLog(new MemoryProgressStore({}));

test('illegal moves aggregate by normalized complement pair', () => {
  const log = make();
  log.recordIllegal('small', 3); // needs the 2↔3 five-trade
  log.recordIllegal('small', 2); // the same pair from the other side
  log.recordIllegal('small', 3);
  log.recordIllegal('big', 4);   // needs the 4↔6 ten-trade
  log.recordIllegal('big', 5);   // 5 is its own ten-complement
  const c = log.counts();
  assert.equal(c.pairs['small:2-3'], 3, '+3 and +2 fumbles share the 2↔3 bucket');
  assert.equal(c.pairs['big:4-6'], 1);
  assert.equal(c.pairs['big:5-5'], 1);
});

test('resets count separately; unknown rules are ignored', () => {
  const log = make();
  log.recordReset();
  log.recordReset();
  log.recordIllegal(null, 3);      // a blocked carry has no pair
  log.recordIllegal('direct', 2);  // never happens, but must not pollute
  const c = log.counts();
  assert.equal(c.resets, 2);
  assert.deepEqual(c.pairs, {});
});

test('fumbleRows returns every pair in fixed order with zero-filled counts', () => {
  const log = make();
  log.recordIllegal('big', 2);
  const rows = fumbleRows(log.counts());
  assert.deepEqual(rows.map(r => r.key), [
    'small:1-4', 'small:2-3',
    'big:1-9', 'big:2-8', 'big:3-7', 'big:4-6', 'big:5-5',
  ]);
  assert.deepEqual(rows.map(r => r.count), [0, 0, 0, 1, 0, 0, 0]);
  assert.equal(rows[3].label, '2 ↔ 8 · ten');
});
