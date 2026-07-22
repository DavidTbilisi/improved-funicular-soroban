import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_TAG, EXPORT_VERSION, SAVE_KEYS, RAW_KEYS,
  exportSave, validateSave, importSave,
} from '../src/today/transfer.js';
import { GameSave } from '../src/game/saveStore.js';
import { LocalStorageProgressStore } from '../src/tutorial/progressStore.js';

// A stand-in for window.localStorage — the same {getItem,setItem} seam the
// LocalStorage*Store adapters already take.
class FakeStorage {
  constructor(initial = {}) { this.data = { ...initial }; }
  getItem(k) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : null; }
  setItem(k, v) { this.data[k] = String(v); }
}

const populated = () => new FakeStorage({
  'npv-drill-stats': JSON.stringify({ fingerTimes: { sessions: [{ t: '2026-07-01T10:00', n: 20 }] } }),
  'npv-practice-history': JSON.stringify({ 'big-add': { solves: [{ t: '2026-07-02T10:00', ms: 3000, clean: true }], best: 4 } }),
  'npv-game-save': JSON.stringify({ v: 1, sp: 120, day: 14, grid: [] }),
  'npv-days': JSON.stringify({ v: 1, seeded: true, days: ['2026-07-01', '2026-07-02'] }),
  'npv-anzan': JSON.stringify({ warm: { rounds: [{ t: '2026-07-02T10:00', ms: 650, ok: true }], best: 5, fastest: 650 } }),
  'npv-support': '1',
  'npv-sound': 'off',
  'npv-bpm': '72',
  'unrelated-key': 'left alone',
});

test('export tags the file and carries only our keys', () => {
  const s = populated();
  const f = exportSave(s, { now: () => '2026-07-22T12:00:00.000Z' });
  assert.equal(f.app, APP_TAG);
  assert.equal(f.v, EXPORT_VERSION);
  assert.equal(f.exportedAt, '2026-07-22T12:00:00.000Z');
  assert.ok(!('unrelated-key' in f.keys), 'a foreign localStorage key is not swept up');
  assert.equal(f.keys['npv-game-save'].sp, 120, 'JSON keys come back as objects');
});

test('absent keys are simply absent — no nulls in the file', () => {
  const f = exportSave(new FakeStorage({ 'npv-sound': 'on' }));
  assert.deepEqual(Object.keys(f.keys), ['npv-sound']);
});

test('the raw string prefs survive a round trip as strings, not double-JSON', () => {
  const src = populated();
  const dst = new FakeStorage();
  importSave(dst, exportSave(src));
  for (const k of RAW_KEYS) {
    assert.equal(dst.getItem(k), src.getItem(k), `${k} must round-trip verbatim`);
    assert.ok(!/^"/.test(dst.getItem(k)), `${k} must not gain JSON quotes`);
  }
});

test('a full round trip restores every key byte-identically', () => {
  const src = populated();
  const dst = new FakeStorage();
  const res = importSave(dst, exportSave(src));
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, []);
  for (const k of SAVE_KEYS) {
    if (src.getItem(k) == null) continue;
    assert.deepEqual(
      RAW_KEYS.includes(k) ? dst.getItem(k) : JSON.parse(dst.getItem(k)),
      RAW_KEYS.includes(k) ? src.getItem(k) : JSON.parse(src.getItem(k)),
      k);
  }
});

test('a key holding invalid JSON exports raw instead of aborting the export', () => {
  const s = populated();
  s.setItem('npv-drill-stats', '{ truncated');
  const f = exportSave(s);
  assert.equal(f.keys['npv-drill-stats'], '{ truncated');
  assert.ok(f.keys['npv-game-save'], 'the other keys still made it out');
});

test('validate rejects non-objects, foreign files and unknown versions', () => {
  assert.equal(validateSave(null).ok, false);
  assert.equal(validateSave('nope').ok, false);
  assert.equal(validateSave([]).ok, false);
  assert.equal(validateSave({ app: 'something-else', v: 1, keys: {} }).ok, false);

  const wrongV = validateSave({ app: APP_TAG, v: 2, keys: { 'npv-days': {} } });
  assert.equal(wrongV.ok, false);
  assert.equal(wrongV.version, 2);
  assert.match(wrongV.errors[0], /version 2/);
});

test('validate rejects a file with no keys block and one with nothing restorable', () => {
  assert.equal(validateSave({ app: APP_TAG, v: 1 }).ok, false);
  const none = validateSave({ app: APP_TAG, v: 1, keys: { 'who-knows': 1 } });
  assert.equal(none.ok, false);
  assert.deepEqual(none.skipped, ['who-knows']);
});

test('an unknown key is skipped, not fatal — a newer export still imports', () => {
  const dst = new FakeStorage();
  const res = importSave(dst, {
    app: APP_TAG, v: 1,
    keys: { 'npv-sound': 'off', 'npv-future-thing': { x: 1 } },
  });
  assert.equal(res.ok, true);
  assert.deepEqual(res.written, ['npv-sound']);
  assert.deepEqual(res.skipped, ['npv-future-thing']);
  assert.equal(dst.getItem('npv-future-thing'), null);
});

test('import NEVER clears a key the file does not mention', () => {
  const dst = populated();
  importSave(dst, { app: APP_TAG, v: 1, keys: { 'npv-sound': 'on' } });
  assert.equal(dst.getItem('npv-sound'), 'on', 'the mentioned key is replaced');
  assert.ok(dst.getItem('npv-game-save'), 'the unmentioned village survives');
  assert.ok(dst.getItem('npv-days'), 'the unmentioned day log survives');
});

test('a rejected file writes nothing at all', () => {
  const dst = populated();
  const before = { ...dst.data };
  const res = importSave(dst, { app: 'other-app', v: 1, keys: { 'npv-days': {} } });
  assert.equal(res.ok, false);
  assert.deepEqual(dst.data, before);
});

// Validation stays shallow because the owning stores already heal. Prove it.
test('importing a garbage village still yields a playable one — the store heals it', () => {
  const dst = new FakeStorage();
  const res = importSave(dst, {
    app: APP_TAG, v: 1,
    keys: { 'npv-game-save': { sp: 'lots', grid: 'not an array', stats: null } },
  });
  assert.equal(res.ok, true);

  const village = new GameSave(new LocalStorageProgressStore(dst, 'npv-game-save')).load();
  assert.equal(typeof village.sp, 'number');
  assert.ok(Array.isArray(village.grid));
  assert.ok(village.stats && typeof village.stats === 'object');
});

test('storage that refuses writes reports the error without throwing', () => {
  const dst = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  const res = importSave(dst, { app: APP_TAG, v: 1, keys: { 'npv-sound': 'off' } });
  assert.equal(res.ok, false);
  assert.equal(res.errors.length, 1);
  assert.match(res.errors[0], /npv-sound/);
});

test('export survives storage that refuses reads', () => {
  const f = exportSave({ getItem: () => { throw new Error('disabled'); } });
  assert.deepEqual(f.keys, {});
  assert.equal(f.app, APP_TAG);
});
