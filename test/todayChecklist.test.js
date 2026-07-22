import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryProgressStore } from '../src/tutorial/progressStore.js';
import { Checklist } from '../src/today/checklist.js';

const TODAY = '2026-07-22';

test('an unknown id reads false', () => {
  const c = new Checklist(new MemoryProgressStore(), { today: TODAY });
  assert.equal(c.isDone('practice:read'), false);
});

test('a tick persists through the store', () => {
  const store = new MemoryProgressStore();
  new Checklist(store, { today: TODAY }).toggle('practice:read');
  // A fresh instance on the same day sees it — this is the page-reload case.
  assert.equal(new Checklist(store, { today: TODAY }).isDone('practice:read'), true);
});

test('toggle flips both ways and returns the new state', () => {
  const c = new Checklist(new MemoryProgressStore(), { today: TODAY });
  assert.equal(c.toggle('drills:fingerTimes'), true);
  assert.equal(c.isDone('drills:fingerTimes'), true);
  assert.equal(c.toggle('drills:fingerTimes'), false);
  assert.equal(c.isDone('drills:fingerTimes'), false);
});

test('set is idempotent', () => {
  const c = new Checklist(new MemoryProgressStore(), { today: TODAY });
  c.set('game:', true);
  c.set('game:', true);
  assert.equal(c.isDone('game:'), true);
  c.set('game:', false);
  c.set('game:', false);
  assert.equal(c.isDone('game:'), false);
});

test('a new day wipes the sheet — yesterday cannot tick today', () => {
  const store = new MemoryProgressStore();
  const yday = new Checklist(store, { today: '2026-07-21' });
  yday.toggle('practice:read');
  yday.toggle('drills:faceToDigit');

  const today = new Checklist(store, { today: TODAY });
  assert.equal(today.isDone('practice:read'), false);
  assert.equal(today.isDone('drills:faceToDigit'), false);
  assert.equal(store.load().day, TODAY);
});

test('doneCount counts only the ids asked about', () => {
  const c = new Checklist(new MemoryProgressStore(), { today: TODAY });
  c.set('a', true); c.set('b', true); c.set('c', true);
  assert.equal(c.doneCount(['a', 'b', 'zz']), 2);
  assert.equal(c.doneCount([]), 0);
});

test('a corrupt blob degrades to an empty sheet', () => {
  for (const junk of [null, 'wat', 7, [], { done: 'nope' }]) {
    const c = new Checklist(new MemoryProgressStore(junk), { today: TODAY });
    assert.equal(c.isDone('anything'), false);
    assert.equal(c.toggle('anything'), true);
  }
});

test('opening a fresh sheet on the same day performs no write', () => {
  class CountingStore extends MemoryProgressStore {
    constructor(initial) { super(initial); this.writes = 0; }
    save(all) { this.writes++; super.save(all); }
  }
  const store = new CountingStore();
  new Checklist(store, { today: TODAY }).set('a', true);
  const after = store.writes;
  new Checklist(store, { today: TODAY });
  assert.equal(store.writes, after, 'a same-day reopen must not touch storage');
});
