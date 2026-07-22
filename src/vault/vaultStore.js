// ============================================================================
// Vault persistence — the stored numbers, on the ProgressStore port (key
// 'npv-vault' in the app, Memory in tests).
//
// This is the first store in the app that holds CONTENT rather than performance
// records. SolveLog, AnzanLog, DrillStatsService and the fault log all record
// how you did; this records what you are trying to remember. That difference is
// why entry.js has a 'sealed' mode, and why _fix() below never invents a `code`
// field — a healed entry must not appear to hold digits it does not have.
//
//   blob = { v: 1, entries: [ …see entry.js… ] }
//
// Ids are assigned from a counter rather than a clock or random source, so the
// store stays deterministic under test (the whole app injects its clocks).
//
// DOM-free. Unit-tested in test/vaultStore.test.js.
// ============================================================================
import { makeEntry, validateCode, MODES } from './entry.js';
import { schedule, review, dueEntries, isDue } from './schedule.js';

const CAP = 200;

export class Vault {
  constructor(store, { now = () => new Date().toISOString().slice(0, 16) } = {}) {
    this.store = store;
    this.now = now;
  }

  _data() {
    const raw = this.store.load();
    const d = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    if (typeof d.v !== 'number') d.v = 1;
    d.entries = Array.isArray(d.entries) ? d.entries.map(fix).filter(Boolean) : [];
    return d;
  }

  _write(d) { d.entries = d.entries.slice(-CAP); this.store.save(d); }

  all() { return this._data().entries; }

  get(id) { return this._data().entries.find(e => e.id === id) || null; }

  nextId() {
    const ids = this._data().entries.map(e => parseInt(String(e.id).replace(/\D/g, ''), 10) || 0);
    return `v${(ids.length ? Math.max(...ids) : 0) + 1}`;
  }

  /**
   * @returns { ok, entry, error }
   */
  add({ label, code, radix = 10, mode = 'full', today = null }) {
    const check = validateCode(code, radix);
    if (!check.ok) return { ok: false, entry: null, error: check.error };
    const d = this._data();
    const entry = schedule(
      makeEntry({ id: this.nextId(), label, code: check.code, radix, mode, now: this.now() }),
      today);
    d.entries.push(entry);
    this._write(d);
    return { ok: true, entry, error: null };
  }

  remove(id) {
    const d = this._data();
    const before = d.entries.length;
    d.entries = d.entries.filter(e => e.id !== id);
    if (d.entries.length === before) return false;
    this._write(d);
    return true;
  }

  rename(id, label) {
    const d = this._data();
    const e = d.entries.find(x => x.id === id);
    if (!e) return false;
    e.label = String(label || '').slice(0, 60) || e.label;
    this._write(d);
    return true;
  }

  // Record a review outcome and reschedule. Returns the updated entry.
  recordReview(id, ok, today) {
    const d = this._data();
    const i = d.entries.findIndex(e => e.id === id);
    if (i === -1) return null;
    d.entries[i] = review(d.entries[i], ok, today);
    this._write(d);
    return d.entries[i];
  }

  due(today) { return dueEntries(this.all(), today); }

  stats(today) {
    const entries = this.all();
    return {
      total: entries.length,
      due: entries.filter(e => isDue(e, today)).length,
      sealed: entries.filter(e => e.mode === 'sealed').length,
      digits: entries.reduce((n, e) => n + (e.length || 0), 0),
      reviews: entries.reduce((n, e) => n + (e.reviews || []).length, 0),
    };
  }
}

// Heal one stored entry, or drop it. Deliberately conservative about `code`:
// it is copied only when it is a string, and never fabricated — an entry saved
// in 'sealed' mode must never come back looking like it holds the digits.
function fix(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  const radix = raw.radix === 16 ? 16 : 10;
  const seals = Array.isArray(raw.seals) ? raw.seals.filter(n => Number.isFinite(n)) : [];
  const length = Number.isFinite(raw.length) && raw.length > 0 ? Math.floor(raw.length) : 0;
  if (!length || !seals.length) return null;
  const mode = MODES.includes(raw.mode) ? raw.mode : 'sealed';
  const e = {
    id: String(raw.id),
    label: String(raw.label || 'Untitled').slice(0, 60),
    radix, mode, length, seals,
    created: typeof raw.created === 'string' ? raw.created : '',
    reviews: Array.isArray(raw.reviews) ? raw.reviews.filter(r => r && typeof r.t === 'string') : [],
    ease: Number.isFinite(raw.ease) ? raw.ease : 2.2,
    interval: Number.isFinite(raw.interval) ? raw.interval : 0,
    due: typeof raw.due === 'string' ? raw.due : null,
  };
  if (mode === 'full' && typeof raw.code === 'string' && raw.code.length === length) e.code = raw.code;
  // A 'full' entry whose code did not survive is downgraded rather than
  // discarded: the seals still make it reviewable, and silently keeping the
  // 'full' label would promise a reveal that cannot be delivered.
  if (mode === 'full' && typeof e.code !== 'string') e.mode = 'sealed';
  return e;
}
