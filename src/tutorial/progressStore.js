// ============================================================================
// Tutorial progress persistence — same Adapter/Repository split as statsStore:
// a ProgressStore port (LocalStorage in the app, Memory in tests) holding an
// opaque JSON blob, with TutorialProgress owning the unlock/best-streak policy.
//   blob = { unlocked: <count of unlocked levels>, best: { levelId: streak } }
// ============================================================================
export class ProgressStore {
  load() { throw new Error('abstract'); }
  save() { throw new Error('abstract'); }
}

export class LocalStorageProgressStore extends ProgressStore {
  constructor(storage, key = 'npv-tutorial-progress') { super(); this.storage = storage; this.key = key; }
  load() { try { return JSON.parse(this.storage.getItem(this.key)) || {}; } catch { return {}; } }
  save(all) { try { this.storage.setItem(this.key, JSON.stringify(all)); } catch { /* quota / disabled */ } }
}

export class MemoryProgressStore extends ProgressStore {
  constructor(initial = {}) { super(); this.data = initial; }
  load() { return this.data; }
  save(all) { this.data = all; }
}

export class TutorialProgress {
  constructor(store) { this.store = store; }

  _data() {
    const d = this.store.load();
    if (typeof d.unlocked !== 'number') d.unlocked = 1; // level 0 is always open
    if (!d.best) d.best = {};
    // v2: 'Compound trades' was inserted at ladder index 6 — shift older saved
    // counts past it so a level that was open never relocks. Idempotent whether
    // or not the shifted blob gets saved (the raw count re-migrates the same way).
    if (!(d.v >= 2)) { if (d.unlocked > 6) d.unlocked += 1; d.v = 2; }
    return d;
  }

  unlockedCount() { return this._data().unlocked; }
  isUnlocked(idx) { return idx < this.unlockedCount(); }

  unlock(n) {
    const d = this._data();
    if (n > d.unlocked) { d.unlocked = n; this.store.save(d); }
  }

  best(id) { return this._data().best[id] || 0; }

  setBest(id, streak) {
    const d = this._data();
    if (streak > (d.best[id] || 0)) { d.best[id] = streak; this.store.save(d); }
  }
}
