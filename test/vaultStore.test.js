import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryProgressStore } from '../src/tutorial/progressStore.js';
import { Vault } from '../src/vault/vaultStore.js';

const D = '2026-07-22';
const vault = (initial = {}) =>
  new Vault(new MemoryProgressStore(initial), { now: () => '2026-07-22T10:00' });

const PI30 = '141592653589793238462643383279';

test('an empty vault reports nothing rather than throwing', () => {
  const v = vault();
  assert.deepEqual(v.all(), []);
  assert.deepEqual(v.due(D), []);
  assert.deepEqual(v.stats(D), { total: 0, due: 0, sealed: 0, digits: 0, reviews: 0 });
  assert.equal(v.get('nope'), null);
});

test('adding an entry validates, schedules it due now, and returns it', () => {
  const v = vault();
  const r = v.add({ label: 'π to 30', code: '1415 9265 3589 7932 3846 2643 3832 79', today: D });
  assert.equal(r.ok, true);
  assert.equal(r.entry.label, 'π to 30');
  assert.equal(r.entry.code, PI30, 'separators stripped');
  assert.equal(r.entry.due, D, 'due immediately');
  assert.equal(v.all().length, 1);
  assert.equal(v.due(D).length, 1);
});

test('an invalid code is refused with a reason and nothing is stored', () => {
  const v = vault();
  const r = v.add({ label: 'bad', code: '12x34', today: D });
  assert.equal(r.ok, false);
  assert.match(r.error, /0–9 only/);
  assert.deepEqual(v.all(), []);
});

test('ids are assigned deterministically, with no clock or randomness', () => {
  const v = vault();
  v.add({ label: 'a', code: '111', today: D });
  v.add({ label: 'b', code: '222', today: D });
  assert.deepEqual(v.all().map(e => e.id), ['v1', 'v2']);
  v.remove('v1');
  v.add({ label: 'c', code: '333', today: D });
  assert.deepEqual(v.all().map(e => e.id), ['v2', 'v3'], 'ids are never reused');
});

test('entries persist through the store', () => {
  const store = new MemoryProgressStore();
  new Vault(store, { now: () => 'x' }).add({ label: 'π', code: PI30, today: D });
  assert.equal(new Vault(store, { now: () => 'x' }).all()[0].code, PI30);
});

test('remove and rename', () => {
  const v = vault();
  v.add({ label: 'a', code: '111', today: D });
  assert.equal(v.rename('v1', 'renamed'), true);
  assert.equal(v.get('v1').label, 'renamed');
  assert.equal(v.rename('nope', 'x'), false);
  assert.equal(v.remove('v1'), true);
  assert.equal(v.remove('v1'), false);
  assert.deepEqual(v.all(), []);
});

test('a review is recorded and the entry rescheduled', () => {
  const v = vault();
  v.add({ label: 'π', code: PI30, today: D });
  const e = v.recordReview('v1', true, D);
  assert.equal(e.interval, 1);
  assert.equal(e.due, '2026-07-23');
  assert.equal(e.reviews.length, 1);
  assert.deepEqual(v.due(D), [], 'no longer due today');
  assert.equal(v.due('2026-07-23').length, 1);
  assert.equal(v.recordReview('nope', true, D), null);
});

test('stats count what the header needs', () => {
  const v = vault();
  v.add({ label: 'a', code: PI30, today: D });
  v.add({ label: 'b', code: '4815162342', mode: 'sealed', today: D });
  v.recordReview('v1', true, D);
  const s = v.stats(D);
  assert.equal(s.total, 2);
  assert.equal(s.due, 1, 'only the unreviewed one');
  assert.equal(s.sealed, 1);
  assert.equal(s.digits, 40);
  assert.equal(s.reviews, 1);
});

// --- healing ---------------------------------------------------------------
test('a corrupt or foreign blob degrades to empty', () => {
  for (const junk of [null, 'wat', 7, [], { entries: 'nope' }]) {
    const v = vault(junk);
    assert.deepEqual(v.all(), []);
    assert.equal(v.add({ label: 'x', code: '123', today: D }).ok, true, 'and heals on write');
  }
});

test('an entry with no seals or no length is dropped, not half-loaded', () => {
  const v = vault({ v: 1, entries: [
    { id: 'v1', label: 'no seals', length: 10, seals: [] },
    { id: 'v2', label: 'no length', seals: [3] },
    { id: 'v3', label: 'ok', length: 3, seals: [6], mode: 'sealed' },
    { id: null, label: 'no id', length: 3, seals: [6] },
    'not an object',
  ] });
  assert.deepEqual(v.all().map(e => e.id), ['v3']);
});

// The load-bearing healing rule.
test('healing never fabricates a code — a sealed entry stays sealed', () => {
  const v = vault({ v: 1, entries: [{ id: 'v1', label: 's', length: 6, seals: [3], mode: 'sealed' }] });
  const e = v.all()[0];
  assert.equal(e.mode, 'sealed');
  assert.equal(e.code, undefined);
});

test('a full entry whose code did not survive is downgraded, not left promising a reveal', () => {
  const v = vault({ v: 1, entries: [
    { id: 'v1', label: 'lost', length: 6, seals: [3], mode: 'full' },              // no code
    { id: 'v2', label: 'wrong length', length: 6, seals: [3], mode: 'full', code: '123' },
  ] });
  for (const e of v.all()) {
    assert.equal(e.mode, 'sealed', `${e.id} downgraded`);
    assert.equal(e.code, undefined);
  }
});

test('an unknown mode heals to sealed — the safe direction', () => {
  const v = vault({ v: 1, entries: [{ id: 'v1', label: 'x', length: 3, seals: [6], mode: 'nonsense', code: '123' }] });
  assert.equal(v.all()[0].mode, 'sealed');
  assert.equal(v.all()[0].code, undefined, 'and the code is not carried over');
});
