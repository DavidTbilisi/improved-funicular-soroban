// ============================================================================
// Checklist — which of today's plan tasks have been ticked off, on the
// ProgressStore port (key 'npv-today' in the app, Memory in tests).
//
// It holds ONE day of state and rolls itself over: constructing it with a
// different day wipes the blob, so the store can never grow and yesterday's
// ticks can never make today's plan look already done. That self-expiry is why
// this is separate from DayLog — the day log is permanent history, this is a
// scratch pad.
//
//   blob = { v: 1, day: 'YYYY-MM-DD', done: { [taskId]: true } }
//
// Task ids come from plan.js (`${page}:${targetId}`), so a tick survives a
// re-plan as long as the same task is still proposed.
//
// DOM-free. Unit-tested in test/todayChecklist.test.js.
// ============================================================================

export class Checklist {
  constructor(store, { today = null } = {}) {
    this.store = store;
    this.today = today;
    this._roll();
  }

  _data() {
    const raw = this.store.load();
    const d = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    if (typeof d.v !== 'number') d.v = 1;
    if (!d.done || typeof d.done !== 'object' || Array.isArray(d.done)) d.done = {};
    return d;
  }

  // A new day clears the sheet — but only writes when there was something to
  // clear, so opening the page on a fresh day costs no storage write.
  _roll() {
    const d = this._data();
    if (d.day === this.today) return;
    const hadTicks = Object.keys(d.done).length > 0 || d.day !== undefined;
    d.day = this.today;
    d.done = {};
    if (hadTicks) this.store.save(d);
  }

  isDone(id) { return !!this._data().done[id]; }

  set(id, done) {
    const d = this._data();
    if (!!d.done[id] === !!done) return !!done;
    if (done) d.done[id] = true; else delete d.done[id];
    d.day = this.today;
    this.store.save(d);
    return !!done;
  }

  toggle(id) { return this.set(id, !this.isDone(id)); }

  doneCount(ids = []) { const d = this._data(); return ids.filter(id => d.done[id]).length; }
}
