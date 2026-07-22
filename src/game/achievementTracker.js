// ============================================================================
// AchievementTracker — the persistence + unlock engine behind achievements.js.
// It rides its OWN ProgressStore (key 'npv-achievements'), SEPARATE from the
// village save, on purpose: village.stats are wiped by a raze (resetSave →
// newVillage), but earned badges and lifetime tallies must survive it. So the
// tracker keeps its own `counters`, seeded once from the loaded village's stats
// (so a pre-existing player's history counts), then moved only by live events.
//
// It is Observable like the session: it observes a GameSession, updates
// counters on solved/placed/festival, re-evaluates the ladder, and notifies
// { type:'unlocked', achievement } for each newly crossed rung — the toast
// view subscribes to that, exactly as GameHudView observes the session.
//
//   blob = { v, seeded, unlocked: { id: isoDate }, counters: {…} }
// Unlocks are PERMANENT once written, so a later raze never revokes them.
// ============================================================================
import { Observable } from '../state/observable.js';
import { ACHIEVEMENTS, achievementStates } from './achievements.js';

const freshCounters = () => ({
  solves: 0, clean: 0, fast: 0, upgrades: 0, placed: 0, festivals: 0,
  earnSp: 0, bestStreak: 0, maxLevel: 0, tiersSolved: {}, placedTypes: {},
});

const maxGridLevel = village => {
  let m = 0;
  for (const cell of (village && village.grid) || []) if (cell && cell.level > m) m = cell.level;
  return m;
};

export class AchievementTracker extends Observable {
  constructor(store, { now = () => new Date().toISOString() } = {}) {
    super();
    this.store = store;
    this.now = now;
    this.village = null;
    this.data = this._load();
  }

  _load() {
    const raw = this.store.load();
    const d = raw && typeof raw === 'object' ? raw : {};
    if (typeof d.v !== 'number') d.v = 1;
    if (typeof d.seeded !== 'boolean') d.seeded = false;
    if (!d.unlocked || typeof d.unlocked !== 'object') d.unlocked = {};
    d.counters = { ...freshCounters(), ...(d.counters || {}),
      tiersSolved: { ...((d.counters && d.counters.tiersSolved) || {}) },
      placedTypes: { ...((d.counters && d.counters.placedTypes) || {}) } };
    return d;
  }

  _persist() { this.store.save(this.data); }

  // Call once with the loaded village, before observe(). On first run this
  // seeds cumulative counters from the village's own history and silently
  // backfills anything already earned (no toast storm); on later runs it just
  // updates the cached village and silently grants any newly-added rungs the
  // player already qualifies for.
  seed(village) {
    this.village = village;
    if (!this.data.seeded) {
      this._seedCounters(village);
      this.data.seeded = true;
      this._persist();
    }
    this.evaluate(true);
    return this;
  }

  _seedCounters(village) {
    const c = this.data.counters;
    const s = (village && village.stats) || {};
    c.solves = s.solves || 0;
    c.clean = s.clean || 0;
    c.earnSp = s.spEarned || 0;
    c.festivals = s.festivals || 0;
    c.bestStreak = s.bestStreak || 0;
    let placed = 0, upgrades = 0, maxLevel = 0;
    for (const cell of (village && village.grid) || []) {
      if (!cell) continue;
      placed++;
      upgrades += cell.level - 1;
      if (cell.level > maxLevel) maxLevel = cell.level;
      c.placedTypes[cell.id] = true;
    }
    c.placed = placed;
    c.upgrades = upgrades;
    c.maxLevel = maxLevel;
    // fast / tiersSolved are unknowable from history — they earn as you play.
  }

  observe(session) { return session.subscribe(evt => this._onEvent(evt)); }

  _onEvent(evt) {
    if (evt.village) this.village = evt.village;
    const c = this.data.counters;
    let touched = false;
    switch (evt.type) {
      case 'solved':
        c.solves++;
        if (evt.clean) c.clean++;
        if (typeof evt.elapsedMs === 'number' && evt.elapsedMs <= evt.timeFloorMs) c.fast++;
        if (evt.kind === 'earn') c.earnSp += evt.payout || 0;
        else if (evt.kind === 'upgrade') c.upgrades++;
        if (evt.tierId) c.tiersSolved[evt.tierId] = true;
        if (typeof evt.streak === 'number' && evt.streak > c.bestStreak) c.bestStreak = evt.streak;
        { const ml = maxGridLevel(this.village); if (ml > c.maxLevel) c.maxLevel = ml; }
        touched = true;
        break;
      case 'placed':
        c.placed++;
        if (evt.buildingId) c.placedTypes[evt.buildingId] = true;
        touched = true;
        break;
      case 'festival':
        c.festivals++;
        touched = true;
        break;
    }
    if (touched) this._persist();
    this.evaluate(false);
  }

  // Cross the ladder against the live context; write + announce new unlocks.
  evaluate(silent) {
    const ctx = { village: this.village, counters: this.data.counters };
    const newly = [];
    for (const a of ACHIEVEMENTS) {
      if (this.data.unlocked[a.id]) continue;
      const { cur, target } = a.progress(ctx);
      if (cur >= target) { this.data.unlocked[a.id] = this.now(); newly.push(a); }
    }
    if (newly.length) {
      this._persist();
      if (!silent) for (const a of newly) this.notify({ type: 'unlocked', achievement: a });
    }
  }

  // Panel read: every rung with live progress, but `done` from the PERSISTED
  // unlock (so an earned badge stays lit even if the live value regresses).
  states(village = this.village) {
    return achievementStates({ village, counters: this.data.counters }).map(s => {
      const at = this.data.unlocked[s.id] || null;
      return { ...s, done: !!at, at };
    });
  }

  unlockedCount() { return Object.keys(this.data.unlocked).length; }
}
