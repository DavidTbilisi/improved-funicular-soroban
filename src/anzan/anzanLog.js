// ============================================================================
// AnzanLog — per-level flash-anzan history on a ProgressStore port (key
// 'npv-anzan' in the app, Memory in tests).
//
// It is NOT a SolveLog, deliberately. SolveLog exists to compare a solve's
// DURATION against a level's time floor — the automaticity question the guided
// practice asks. Flash anzan's difficulty axis is the opposite one: the round's
// pace is imposed, not measured, so what a record has to carry is the INTERVAL
// it was answered at. "Correct at 400 ms" and "correct at 1500 ms" are not the
// same result, and a store that dropped the interval would flatten them.
//
//   blob = { [levelId]: {
//     rounds: [{ t, ms, ok }],   // ms = the interval, ok = right answer
//     best:   n,                 // best streak of correct rounds
//     fastest: ms | null,        // fastest interval ever cleared to `floor`
//   } }
//
// Rounds are capped at the most recent 60 — enough to chart the speed/accuracy
// history without growing the blob forever (SolveLog's 40 is per level too).
//
// DOM-free; the clock is injected. Unit-tested in test/anzanLog.test.js.
// ============================================================================

const CAP = 60;

export class AnzanLog {
  constructor(store, { nowIso = () => new Date().toISOString().slice(0, 16), cap = CAP } = {}) {
    this.store = store;
    this.nowIso = nowIso;
    this.cap = cap;
  }

  _all() {
    const raw = this.store.load();
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  }

  _one(all, id) {
    const d = all[id];
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      if (!Array.isArray(d.rounds)) d.rounds = [];
      if (typeof d.best !== 'number') d.best = 0;
      if (typeof d.fastest !== 'number') d.fastest = null;
      return d;
    }
    return { rounds: [], best: 0, fastest: null };
  }

  record(id, { intervalMs, ok }) {
    const all = this._all();
    const d = this._one(all, id);
    d.rounds = d.rounds.slice(-(this.cap - 1)).concat([{ t: this.nowIso(), ms: intervalMs | 0, ok: !!ok }]);
    all[id] = d;
    this.store.save(all);
  }

  rounds(id) { return this._one(this._all(), id).rounds.slice(); }

  best(id) { return this._one(this._all(), id).best; }

  setBest(id, streak) {
    const all = this._all();
    const d = this._one(all, id);
    if (streak > d.best) { d.best = streak; all[id] = d; this.store.save(all); }
  }

  // The fastest interval at which this level was ever carried to its floor —
  // the number that actually says how good you are at it. Lower is better, so
  // this keeps the MINIMUM.
  fastest(id) { return this._one(this._all(), id).fastest; }

  setFastest(id, intervalMs) {
    const all = this._all();
    const d = this._one(all, id);
    if (d.fastest === null || intervalMs < d.fastest) {
      d.fastest = intervalMs | 0; all[id] = d; this.store.save(all);
    }
  }

  // Correct share over the most recent `window` rounds, or null when untouched.
  accuracy(id, window = 20) {
    const win = this.rounds(id).slice(-window);
    return win.length ? win.filter(r => r.ok).length / win.length : null;
  }
}
