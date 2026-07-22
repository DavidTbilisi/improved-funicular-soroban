// ============================================================================
// 間違いノート — the mistake book.
//
// The retention model schedules SKILLS: which track has gone soft and is worth a
// visit. It cannot say anything about the individual question you got wrong ten
// minutes ago, because nothing kept it. A drill miss was re-dealt inside its own
// round and then forgotten; a wrong line on a kyu paper appeared once on the
// mark sheet and vanished with it; a lost anzan round showed its terms back and
// moved on. The single highest-yield study habit after spacing is working the
// things you got wrong, and the app was throwing them all away.
//
// So every page that can grade an answer writes its misses here, in ONE shape:
//
//   { key, source, page, prompt, sub, answers, misses, right, t, last }
//
// and this is the only file that decides what happens to them:
//
//   • THE SAME MISS IS ONE ENTRY. Missing something twice is not two problems;
//     it is one problem you now know more about, so the entry keeps a `misses`
//     count and its progress resets. `key` is what makes two misses "the same"
//     and the producer chooses it — for a drill item that is its prompt, for an
//     exam line the question itself.
//   • TWO CONSECUTIVE RIGHTS RETIRE IT, and a retired entry is DROPPED, not
//     archived: this is a to-do list, not a history. One right is a coin flip
//     on a two-choice answer and a fluke on most of the rest.
//   • A LATER MISS UNDOES PROGRESS. Right-then-wrong is not "one of two"; it is
//     an item you still do not have.
//   • THE BOOK IS CAPPED at the most recent 80. Past that, the oldest go: a
//     mistake from three hundred items ago is not the one to work on tonight,
//     and a book you cannot finish is a book nobody opens.
//
// Grading reuses the drills' own `normalizeAnswer`, so an answer that counts on
// the drill page counts here — a review that graded differently from the thing
// it is reviewing would be its own bug factory.
//
// DOM-free, on the ProgressStore port, key 'npv-misses'. Unit-tested in
// test/misses.test.js.
// ============================================================================
import { normalizeAnswer } from '../drill/text.js';

export const RETIRE_AT = 2;   // consecutive rights that clear an entry
export const CAP = 80;

export class MissQueue {
  constructor(store, { nowIso = () => new Date().toISOString().slice(0, 16), cap = CAP } = {}) {
    this.store = store;
    this.nowIso = nowIso;
    this.cap = cap;
  }

  _data() {
    const raw = this.store.load();
    const d = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    if (!Array.isArray(d.items)) d.items = [];
    if (typeof d.retired !== 'number') d.retired = 0;
    if (typeof d.lastWorked !== 'string') d.lastWorked = '';
    d.items = d.items.filter(i => i && typeof i.key === 'string' && Array.isArray(i.answers));
    return d;
  }

  _save(d) { this.store.save(d); }

  /**
   * Record a miss. Returns the entry as it now stands.
   * @param key     what makes two misses the same question
   * @param source  where it came from, in the learner's words ("Point: ×", "3級 · 掛算")
   * @param page    the page that produced it, for the link back
   * @param prompt  the question, as HTML (the producer already renders it)
   * @param answers every accepted spelling
   */
  add({ key, source = '', page = null, prompt = '', sub = '', answers = [] } = {}) {
    if (!key || !answers.length) return null;
    const d = this._data();
    const now = this.nowIso();
    const found = d.items.find(i => i.key === key);
    if (found) {
      found.misses++;
      found.right = 0;          // a fresh miss undoes whatever progress it had
      found.last = now;
      found.prompt = prompt || found.prompt;
      found.answers = answers;
      this._save(d);
      return found;
    }
    const entry = { key, source, page, prompt, sub, answers, misses: 1, right: 0, t: now, last: now };
    d.items.push(entry);
    // Oldest first out — see the header. The cap is a promise that the book
    // stays finishable.
    if (d.items.length > this.cap) d.items = d.items.slice(d.items.length - this.cap);
    this._save(d);
    return entry;
  }

  /** Grade an attempt at an entry. Two rights in a row retire (and drop) it. */
  record(key, ok) {
    const d = this._data();
    const i = d.items.findIndex(x => x.key === key);
    if (i < 0) return null;
    const entry = d.items[i];
    entry.last = this.nowIso();
    // Stamped on the BOOK, not only on the entry: an entry worked off is
    // removed, so its stamp goes with it — and "did I do this today?" has to
    // survive finishing something.
    d.lastWorked = entry.last;
    if (!ok) { entry.right = 0; entry.misses++; this._save(d); return { entry, retired: false }; }
    entry.right++;
    if (entry.right >= RETIRE_AT) {
      d.items.splice(i, 1);
      d.retired++;
      this._save(d);
      return { entry, retired: true };
    }
    this._save(d);
    return { entry, retired: false };
  }

  /** Is this typed answer right? The drills' own comparison, so the two agree. */
  check(entry, typed) {
    const given = normalizeAnswer(typed);
    if (!given) return null;                     // empty: not an attempt
    return entry.answers.some(a => normalizeAnswer(a) === given);
  }

  all() { return this._data().items.slice(); }

  /** What to work on, worst first: most-missed, then oldest. */
  due() {
    return this.all().sort((a, b) => b.misses - a.misses || String(a.t).localeCompare(String(b.t)));
  }

  next() { return this.due()[0] || null; }

  remove(key) {
    const d = this._data();
    const i = d.items.findIndex(x => x.key === key);
    if (i < 0) return false;
    d.items.splice(i, 1);
    this._save(d);
    return true;
  }

  clear() {
    const d = this._data();
    this._save({ items: [], retired: d.retired, lastWorked: d.lastWorked });
  }

  /** When the book was last worked — survives the entries that were cleared. */
  lastWorked() { return this._data().lastWorked || null; }

  stats() {
    const d = this._data();
    const bySource = {};
    for (const i of d.items) bySource[i.source || '—'] = (bySource[i.source || '—'] || 0) + 1;
    return {
      open: d.items.length,
      retired: d.retired,
      misses: d.items.reduce((n, i) => n + i.misses, 0),
      bySource,
      // Half-done entries: one right already banked. Worth naming, because they
      // are the cheapest thing in the book to finish.
      nearlyOut: d.items.filter(i => i.right > 0).length,
      lastWorked: d.lastWorked || null,
    };
  }
}
