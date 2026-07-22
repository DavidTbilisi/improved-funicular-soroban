// ============================================================================
// DayLog — the set of calendar days on which the learner did real work, on the
// ProgressStore port (key 'npv-days' in the app, Memory in tests).
//
// WHY ITS OWN KEY, rather than deriving the streak from the existing logs.
// The logs are capped: DrillStatsService keeps 20 sessions *per deck* and
// SolveLog keeps 40 solves *per level*. A learner who grinds one deck three
// times a day evicts their 8th-most-recent day — so a true 30-day streak would
// render as 7 and never grow. A retention counter that silently stalls for the
// most committed user is worse than none, so the days get a store of their own.
// 730 days of 'YYYY-MM-DD' is ~8 KB; the cap exists only as a backstop.
//
// Existing players are not started at zero: seedFrom(harvestDays(...)) backfills
// once, exactly as AchievementTracker.seed backfills counters from the village.
//
//   blob = { v: 1, seeded: false, days: ['YYYY-MM-DD', …] }
//
// DOM-free; the clock is injected. Unit-tested in test/dayLog.test.js.
// ============================================================================
import { dayKey, streakOf } from './dayKey.js';

const CAP = 730;

export class DayLog {
  constructor(store, { now = () => new Date().toISOString(), cap = CAP } = {}) {
    this.store = store;
    this.now = now;
    this.cap = cap;
  }

  _data() {
    const raw = this.store.load();
    const d = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    if (typeof d.v !== 'number') d.v = 1;
    if (typeof d.seeded !== 'boolean') d.seeded = false;
    if (!Array.isArray(d.days)) d.days = [];
    return d;
  }

  _write(d) {
    d.days = [...new Set(d.days)].sort().slice(-this.cap);
    this.store.save(d);
  }

  // Record that work happened. Idempotent per day: the second call of a day
  // performs no write at all, so this is safe to fire on every single solve.
  mark(iso = this.now()) {
    const key = dayKey(iso);
    if (!key) return false;
    const d = this._data();
    if (d.days.includes(key)) return false;
    d.days.push(key);
    this._write(d);
    return true;
  }

  days() { return this._data().days.slice(); }

  // One-time backfill from history. Later calls are no-ops, so a user who has
  // since deleted old logs doesn't lose the days already banked.
  seedFrom(dayKeys = []) {
    const d = this._data();
    if (d.seeded) return false;
    d.days = d.days.concat(dayKeys.filter(k => !!dayKey(k)));
    d.seeded = true;
    this._write(d);
    return true;
  }

  streak(todayKey) { return streakOf(this._data().days, todayKey); }
}
