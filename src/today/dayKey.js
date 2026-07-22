// ============================================================================
// Calendar-day arithmetic + the streak reducer.
//
// The app had no calendar-day concept at all until this layer: every "streak"
// elsewhere (the tutorial unlock streak, gameSession.stats.streak) counts
// consecutive *solves*, never consecutive *days*. This is the day axis.
//
// DAY KEYS ARE UTC. Every stamp already written by the app is
// `new Date().toISOString().slice(0, 16)` — UTC, with the local offset gone and
// unrecoverable. Deriving local days from those and UTC days from new marks
// would open phantom gaps at the seam, so the whole layer commits to UTC. The
// cost is that "did I practise today?" reads stale for a few hours in far-east
// timezones; a consistent daily habit never gaps under any *fixed* boundary.
// Everything funnels through one injected `todayKey()` at the composition root,
// so moving to local days later is a one-line change plus a migration decision.
//
// Pure — no DOM, no globals, no clock of its own. Unit-tested in
// test/dayKey.test.js.
// ============================================================================

const DAY_MS = 86400000;
const KEY_RE = /^\d{4}-\d{2}-\d{2}/;

// Any ISO stamp (the app's 'YYYY-MM-DDTHH:MM' or a full one with 'Z') → 'YYYY-MM-DD'.
// Returns null for anything that isn't one, so junk in a saved blob is skipped
// rather than poisoning the day set.
export function dayKey(iso) {
  if (typeof iso !== 'string') return null;
  const m = KEY_RE.exec(iso);
  return m ? m[0] : null;
}

// A day key n days away. Goes through UTC epoch ms so month/year/leap-day ends
// are the calendar's problem, not ours: shiftDay('2026-03-01', -1) = '2026-02-28'.
export function shiftDay(key, n) {
  const t = Date.parse(`${key}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t + n * DAY_MS).toISOString().slice(0, 10);
}

// Day of the week, MONDAY-FIRST (0 = Mon … 6 = Sun) — the layout the calendar
// ribbon reads down its columns. Null for a key that isn't one.
export function weekdayIndex(key) {
  const t = Date.parse(`${key}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return (new Date(t).getUTCDay() + 6) % 7;
}

// Whole days from a to b (b − a); negative when b is earlier.
export function daysBetween(a, b) {
  const ta = Date.parse(`${a}T00:00:00Z`), tb = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.round((tb - ta) / DAY_MS);
}

/**
 * The streak reducer.
 *
 * The rule that carries the whole feature: a streak whose last day is YESTERDAY
 * is still ALIVE — it just hasn't been fed today. That's the state the home page
 * exists to act on ("practise to keep your 6-day streak"), so it must not read
 * as 0. Only a gap of two or more days breaks the run.
 *
 * @param dayKeys  any iterable of 'YYYY-MM-DD' (unsorted and duplicated is fine)
 * @param todayKey the day to measure "current" against
 * @returns { current, longest, lastActive, activeToday, total }
 */
export function streakOf(dayKeys, todayKey) {
  const days = [...new Set([...(dayKeys || [])].filter(d => typeof d === 'string' && KEY_RE.test(d)))].sort();
  const base = { current: 0, longest: 0, lastActive: null, activeToday: false, total: days.length };
  if (!days.length) return base;

  const lastActive = days[days.length - 1];
  const activeToday = lastActive === todayKey;

  // Longest run anywhere in the history.
  let longest = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    run = daysBetween(days[i - 1], days[i]) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  // The current run only counts if it reaches today or yesterday.
  const gap = todayKey ? daysBetween(lastActive, todayKey) : null;
  let current = 0;
  if (gap === 0 || gap === 1) {
    current = 1;
    for (let i = days.length - 1; i > 0; i--) {
      if (daysBetween(days[i - 1], days[i]) !== 1) break;
      current++;
    }
  }

  return { current, longest, lastActive, activeToday, total: days.length };
}
