// ============================================================================
// Drill stats persistence. StatsStore is a port (Adapter pattern); the app uses
// LocalStorageStatsStore, tests use MemoryStatsStore — no window, no globals.
// DrillStatsService holds the session-record / best-record policy on top.
// ============================================================================

// Port: an opaque JSON blob keyed by deck id.
export class StatsStore {
  load() { throw new Error('abstract'); }
  save() { throw new Error('abstract'); }
}

export class LocalStorageStatsStore extends StatsStore {
  constructor(storage, key = 'npv-drill-stats') { super(); this.storage = storage; this.key = key; }
  load() {
    try { return JSON.parse(this.storage.getItem(this.key)) || {}; } catch { return {}; }
  }
  save(all) {
    try { this.storage.setItem(this.key, JSON.stringify(all)); } catch { /* quota / disabled — non-fatal */ }
  }
}

export class MemoryStatsStore extends StatsStore {
  constructor(initial = {}) { super(); this.data = initial; }
  load() { return this.data; }
  save(all) { this.data = all; }
}

// Session counters -> persisted records, keeping the last 20 sessions + best.
export class DrillStatsService {
  constructor(store, nowIso = () => new Date().toISOString().slice(0, 16)) {
    this.store = store;
    this.nowIso = nowIso;
  }

  best(deckId) { return (this.store.load()[deckId] || {}).best || null; }

  // The persisted session records for one deck (oldest → newest, ≤ 20).
  history(deckId) { return (this.store.load()[deckId] || {}).sessions || []; }

  // counters: { n, correct, sumMs, floorPass }
  saveSession(deckId, counters) {
    if (!deckId || counters.n === 0) return null;
    const rec = {
      t: this.nowIso(),
      n: counters.n,
      acc: Math.round(100 * counters.correct / counters.n),
      meanMs: Math.round(counters.sumMs / counters.n),
      floorPct: Math.round(100 * counters.floorPass / counters.n),
    };
    const all = this.store.load();
    const d = all[deckId] || { sessions: [] };
    d.sessions = (d.sessions || []).slice(-19).concat([rec]);
    if (!d.best || rec.floorPct > d.best.floorPct ||
        (rec.floorPct === d.best.floorPct && rec.meanMs < d.best.meanMs)) {
      d.best = rec;
    }
    all[deckId] = d;
    this.store.save(all);
    return rec;
  }
}
