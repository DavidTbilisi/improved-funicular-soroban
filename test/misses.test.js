import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MissQueue, RETIRE_AT, CAP } from '../src/review/misses.js';
import { MemoryProgressStore } from '../src/tutorial/progressStore.js';

let clock = 0;
const queue = (initial = {}, cap = CAP) =>
  new MissQueue(new MemoryProgressStore(initial), { nowIso: () => `2026-07-23T10:${String(clock++ % 60).padStart(2, '0')}`, cap });

const miss = (q, key, over = {}) =>
  q.add({ key, source: 'Point: ×', page: 'drills', prompt: key, answers: ['42'], ...over });

test('an empty book reports nothing rather than throwing', () => {
  const q = queue();
  assert.deepEqual(q.all(), []);
  assert.deepEqual(q.due(), []);
  assert.equal(q.next(), null);
  assert.deepEqual(q.stats(), { open: 0, retired: 0, misses: 0, bySource: {}, nearlyOut: 0, lastWorked: null });
  assert.equal(q.lastWorked(), null);
});

test('junk in the key heals to an empty book', () => {
  for (const junk of [null, 7, 'nope', [1], { items: 'no' }, { items: [null, { key: 1 }] }]) {
    assert.deepEqual(queue(junk).all(), []);
  }
});

test('a miss is written down with everything the review needs', () => {
  const q = queue();
  const e = miss(q, '12.4 × 0.35');
  assert.equal(e.key, '12.4 × 0.35');
  assert.equal(e.source, 'Point: ×');
  assert.equal(e.page, 'drills');
  assert.equal(e.misses, 1);
  assert.equal(e.right, 0);
  assert.ok(e.t && e.last);
  assert.equal(q.all().length, 1);
});

test('an entry needs a key and an answer, or it is not written down', () => {
  const q = queue();
  assert.equal(q.add({ key: '', answers: ['1'] }), null);
  assert.equal(q.add({ key: 'x', answers: [] }), null);
  assert.equal(q.add(), null);
  assert.deepEqual(q.all(), []);
});

test('the same miss is one entry, counted twice', () => {
  const q = queue();
  miss(q, 'same');
  miss(q, 'same');
  assert.equal(q.all().length, 1);
  assert.equal(q.all()[0].misses, 2);
});

test('two consecutive rights retire it, and a retired entry is dropped', () => {
  const q = queue();
  miss(q, 'a');
  const first = q.record('a', true);
  assert.equal(first.retired, false);
  assert.equal(q.all()[0].right, 1);
  assert.equal(q.stats().nearlyOut, 1);

  const second = q.record('a', true);
  assert.equal(second.retired, true);
  assert.deepEqual(q.all(), [], 'a to-do list, not a history');
  assert.equal(q.stats().retired, 1);
  assert.equal(RETIRE_AT, 2);
});

test('a later miss undoes the progress — right-then-wrong is not one of two', () => {
  const q = queue();
  miss(q, 'a');
  q.record('a', true);
  q.record('a', false);
  assert.equal(q.all()[0].right, 0);
  assert.equal(q.all()[0].misses, 2);
  // …and it now takes two fresh rights.
  q.record('a', true);
  assert.equal(q.all().length, 1);
  q.record('a', true);
  assert.deepEqual(q.all(), []);
});

test('missing something again while it is half-cleared resets it too', () => {
  const q = queue();
  miss(q, 'a');
  q.record('a', true);
  miss(q, 'a');                       // met it in the wild and missed it again
  assert.equal(q.all()[0].right, 0);
  assert.equal(q.all()[0].misses, 2);
});

test('grading is the drills\' own comparison, so the two agree', () => {
  const q = queue();
  const e = miss(q, 'a', { answers: ['4.34', '4.340'] });
  assert.equal(q.check(e, '4.34'), true);
  assert.equal(q.check(e, ' 4.340 '), true);
  assert.equal(q.check(e, '4.3'), false);
  assert.equal(q.check(e, ''), null, 'an empty box is not an attempt');
  assert.equal(q.check(e, '   '), null);
});

test('the worst thing comes first: most missed, then oldest', () => {
  const q = queue();
  miss(q, 'old-once');
  miss(q, 'twice'); miss(q, 'twice');
  miss(q, 'new-once');
  assert.deepEqual(q.due().map(e => e.key), ['twice', 'old-once', 'new-once']);
  assert.equal(q.next().key, 'twice');
});

test('the book is capped, and the oldest go', () => {
  const q = queue({}, 5);
  for (let i = 0; i < 9; i++) miss(q, `k${i}`);
  const keys = q.all().map(e => e.key);
  assert.equal(keys.length, 5);
  assert.deepEqual(keys, ['k4', 'k5', 'k6', 'k7', 'k8']);
});

test('an entry can be struck out by hand, and the book emptied', () => {
  const q = queue();
  miss(q, 'a'); miss(q, 'b');
  assert.equal(q.remove('a'), true);
  assert.equal(q.remove('nope'), false);
  assert.deepEqual(q.all().map(e => e.key), ['b']);
  q.clear();
  assert.deepEqual(q.all(), []);
});

test('clearing the book keeps the count of what was actually cleared', () => {
  const q = queue();
  miss(q, 'a');
  q.record('a', true); q.record('a', true);
  miss(q, 'b');
  q.clear();
  assert.equal(q.stats().retired, 1, 'struck out is not the same as worked off');
  assert.equal(q.stats().open, 0);
});

test('the stats say where the misses came from', () => {
  const q = queue();
  miss(q, 'a', { source: 'Point: ×' });
  miss(q, 'b', { source: 'Point: ×' });
  miss(q, 'c', { source: '3級 · 掛算' });
  const s = q.stats();
  assert.equal(s.open, 3);
  assert.equal(s.misses, 3);
  assert.deepEqual(s.bySource, { 'Point: ×': 2, '3級 · 掛算': 1 });
});

test('the book remembers when it was last worked, even after clearing an entry', () => {
  const q = queue();
  miss(q, 'a');
  assert.equal(q.lastWorked(), null, 'writing a miss down is not working it');
  q.record('a', true);
  const once = q.lastWorked();
  assert.ok(once);
  q.record('a', true);                       // retires and drops the entry
  assert.deepEqual(q.all(), []);
  assert.ok(q.lastWorked() >= once, 'the stamp survives the entry it came from');
  assert.equal(q.stats().lastWorked, q.lastWorked());
});

test('it round-trips through the store', () => {
  const store = new MemoryProgressStore();
  const a = new MissQueue(store, { nowIso: () => 't' });
  a.add({ key: 'x', source: 's', prompt: 'p', answers: ['1'] });
  const b = new MissQueue(store);
  assert.equal(b.all().length, 1);
  assert.equal(b.next().key, 'x');
});
