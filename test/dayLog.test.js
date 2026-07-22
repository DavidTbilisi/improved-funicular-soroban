import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryProgressStore } from '../src/tutorial/progressStore.js';
import { DayLog } from '../src/today/dayLog.js';

// A store that counts writes — `mark` must not touch storage on a repeat day.
class CountingStore extends MemoryProgressStore {
  constructor(initial = {}) { super(initial); this.writes = 0; }
  save(all) { this.writes++; super.save(all); }
}

const at = iso => new DayLog(new CountingStore(), { now: () => iso });

test('mark records the injected clock day', () => {
  const store = new CountingStore();
  const log = new DayLog(store, { now: () => '2026-07-22T09:00' });
  assert.equal(log.mark(), true);
  assert.deepEqual(log.days(), ['2026-07-22']);
});

test('mark is idempotent per day and performs NO write the second time', () => {
  const store = new CountingStore();
  const log = new DayLog(store, { now: () => '2026-07-22T09:00' });
  log.mark();
  const after = store.writes;
  assert.equal(log.mark(), false);
  assert.equal(log.mark('2026-07-22T23:59'), false);
  assert.equal(store.writes, after, 'a repeat day must be free — this fires on every solve');
  assert.deepEqual(log.days(), ['2026-07-22']);
});

test('an explicit stamp overrides the clock; junk is refused', () => {
  const log = at('2026-07-22T09:00');
  assert.equal(log.mark('2026-07-20T10:00'), true);
  assert.equal(log.mark('not-a-date'), false);
  assert.deepEqual(log.days(), ['2026-07-20']);
});

test('days come back sorted and deduped regardless of insertion order', () => {
  const log = at('2026-07-22T09:00');
  ['2026-07-22', '2026-07-19', '2026-07-21', '2026-07-19'].forEach(d => log.mark(d));
  assert.deepEqual(log.days(), ['2026-07-19', '2026-07-21', '2026-07-22']);
});

test('seedFrom backfills once, then no-ops forever', () => {
  const store = new CountingStore();
  const log = new DayLog(store, { now: () => '2026-07-22T09:00' });
  assert.equal(log.seedFrom(['2026-07-01', '2026-07-02']), true);
  assert.deepEqual(log.days(), ['2026-07-01', '2026-07-02']);

  // A second seed must not re-add days the user has since aged out.
  assert.equal(log.seedFrom(['2026-06-01']), false);
  assert.deepEqual(log.days(), ['2026-07-01', '2026-07-02']);
});

test('seeding merges with days already marked live', () => {
  const log = at('2026-07-22T09:00');
  log.mark();
  log.seedFrom(['2026-07-21', '2026-07-22']);
  assert.deepEqual(log.days(), ['2026-07-21', '2026-07-22']);
});

test('the cap keeps the NEWEST days', () => {
  const store = new CountingStore();
  const log = new DayLog(store, { now: () => '2026-07-22T09:00', cap: 3 });
  ['2026-07-18', '2026-07-19', '2026-07-20', '2026-07-21', '2026-07-22'].forEach(d => log.mark(d));
  assert.deepEqual(log.days(), ['2026-07-20', '2026-07-21', '2026-07-22']);
});

test('a corrupt or foreign blob degrades to empty instead of throwing', () => {
  for (const junk of [null, 'wat', 42, [], { days: 'nope', seeded: 'yes' }]) {
    const log = new DayLog(new MemoryProgressStore(junk), { now: () => '2026-07-22T09:00' });
    assert.deepEqual(log.days(), []);
    assert.equal(log.mark(), true);
    assert.deepEqual(log.days(), ['2026-07-22']);
  }
});

test('streak() reads the stored days through streakOf', () => {
  const log = at('2026-07-22T09:00');
  ['2026-07-20', '2026-07-21', '2026-07-22'].forEach(d => log.mark(d));
  const s = log.streak('2026-07-22');
  assert.equal(s.current, 3);
  assert.equal(s.activeToday, true);
});
