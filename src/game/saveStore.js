// ============================================================================
// Game save persistence — the same Adapter/Repository recipe as SolveLog and
// FaultLog: GameSave owns the village blob's shape and rides on any
// ProgressStore port (LocalStorageProgressStore with key 'npv-game-save' in
// the app, MemoryProgressStore in tests). load() always returns a village that
// is safe to play: _fix() rebuilds from newVillage() and copies over only the
// fields of the stored blob that validate — so a corrupt, legacy, or empty
// blob degrades to (partially) fresh state instead of a crash, and unknown
// building ids from a future/edited save are dropped. v:1 is stamped for
// future migrations (the pattern TutorialProgress._data uses).
// ============================================================================
import { newVillage } from './economy.js';
import { buildingById, GRID_CELLS } from './buildings.js';

export class GameSave {
  constructor(store) { this.store = store; }

  load() { return this._fix(this.store.load()); }
  save(village) { this.store.save(village); }
  reset() { const v = newVillage(); this.save(v); return v; }

  _fix(raw) {
    const v = newVillage();
    if (!raw || typeof raw !== 'object') return v;
    const num = (x, min) => Number.isFinite(x) && x >= min ? Math.floor(x) : null;
    if (num(raw.sp, 0) !== null) v.sp = num(raw.sp, 0);
    if (num(raw.day, 1) !== null) v.day = num(raw.day, 1);
    if (num(raw.festival, 0) !== null) v.festival = num(raw.festival, 0);
    for (const k of ['food', 'wood', 'coin']) {
      const n = raw.res ? num(raw.res[k], 0) : null;
      if (n !== null) v.res[k] = n;
    }
    if (Array.isArray(raw.grid)) {
      for (let i = 0; i < GRID_CELLS; i++) {
        const c = raw.grid[i];
        if (c && buildingById(c.id) && Number.isInteger(c.level) && c.level >= 1) {
          v.grid[i] = { id: c.id, level: c.level };
        }
      }
    }
    if (raw.stats && typeof raw.stats === 'object') {
      for (const k of ['solves', 'clean', 'spEarned', 'bestPayout', 'streak', 'bestStreak', 'festivals']) {
        const n = num(raw.stats[k], 0);
        if (n !== null) v.stats[k] = n;
      }
      if (raw.stats.founded === true) v.stats.founded = true;
    }
    v.v = 1;
    return v;
  }
}
