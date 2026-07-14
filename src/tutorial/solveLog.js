// ============================================================================
// SolveLog — per-level (or per-trainer-mode) solve records plus best clean
// streak, on a blob store port (LocalStorage in the app, Memory in tests).
// Same date-stamping convention as DrillStatsService, injected for tests.
//   blob = { [id]: { solves: [{ t, ms, clean, support }], best: n } }
// `support` is the mnemonic-mental fade level the solve was landed at (0 beads,
// 1 percept, 2 mental) — the seam the mental-readiness prognosis reads. Legacy
// records predate it and are treated as Beads (0) on read.
// Solves are oldest → newest, capped at the most recent 40 — enough to chart
// an automaticity curve without growing the blob forever.
// ============================================================================

export class SolveLog {
  constructor(store, nowIso = () => new Date().toISOString().slice(0, 16)) {
    this.store = store;
    this.nowIso = nowIso;
  }

  record(id, { ms, clean, support = 0 }) {
    const all = this.store.load();
    const d = all[id] || { solves: [], best: 0 };
    d.solves = (d.solves || []).slice(-39).concat([{ t: this.nowIso(), ms: Math.round(ms), clean: !!clean, support: support | 0 }]);
    all[id] = d;
    this.store.save(all);
  }

  solves(id) { return (this.store.load()[id] || {}).solves || []; }

  best(id) { return (this.store.load()[id] || {}).best || 0; }

  setBest(id, streak) {
    const all = this.store.load();
    const d = all[id] || { solves: [], best: 0 };
    if (streak > (d.best || 0)) { d.best = streak; all[id] = d; this.store.save(all); }
  }
}
