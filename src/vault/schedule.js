// ============================================================================
// Expanding-interval review scheduling — the app's first genuinely time-based
// one.
//
// What already existed was not scheduling. `STALE_DAYS = 3` in the Today plan
// is a flat whole-deck staleness flag that never moves, and `dueFacts` is a
// MASTERY threshold (share under the floor < 90%), so an item at 100% is never
// revisited and an item at 50% is due forever regardless of elapsed time.
// Neither models forgetting. A stored number is the one thing in this app that
// genuinely decays with time rather than with practice count, so it needs a
// real interval.
//
// This is deliberately a small, legible scheme rather than SM-2. SM-2's
// constants are folklore, its grade scale needs five buttons the learner has to
// interpret, and a recall here is already binary — the seals either check out
// or they do not. So: succeed and the interval multiplies by an ease that drifts
// up slowly; fail and it collapses to the first step and the ease drops. The
// numbers below are chosen to reach a year in about eight successful reviews,
// which is the shape the memory-athlete literature actually agrees on.
//
// Pure and clock-free: every function takes the day key. Unit-tested in
// test/vaultSchedule.test.js.
// ============================================================================
import { shiftDay, daysBetween } from '../today/dayKey.js';

export const FIRST_STEPS = Object.freeze([1, 3]);   // days, before the ease takes over
export const EASE_START = 2.2;
export const EASE_MIN = 1.4;
export const EASE_MAX = 3.2;
export const EASE_UP = 0.08;     // a success nudges the ease up a little...
export const EASE_DOWN = 0.35;   // ...a lapse drops it much harder
export const MAX_INTERVAL = 365;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Apply one review outcome.
 * @param entry a vault entry ({ interval, ease, reviews, due })
 * @param ok    did the recall pass
 * @param today the day key the review happened on
 * @returns a NEW entry — this never mutates its input, so a caller can diff or
 *          discard the result (the store decides what to persist).
 */
export function review(entry, ok, today) {
  const ease = clamp(
    (entry.ease || EASE_START) + (ok ? EASE_UP : -EASE_DOWN),
    EASE_MIN, EASE_MAX);
  const prev = entry.interval || 0;

  let interval;
  if (!ok) {
    // A lapse goes back to the first step, not to zero: the number is still
    // half-known, and re-showing it the same day tests short-term memory
    // instead of the encoding.
    interval = FIRST_STEPS[0];
  } else if (prev < FIRST_STEPS[0]) {
    interval = FIRST_STEPS[0];
  } else if (prev < FIRST_STEPS[1]) {
    interval = FIRST_STEPS[1];
  } else {
    interval = Math.min(MAX_INTERVAL, Math.round(prev * ease));
  }

  const reviews = (entry.reviews || []).slice(-39).concat([{ t: today, ok: !!ok, interval }]);
  return { ...entry, ease: Math.round(ease * 100) / 100, interval, due: shiftDay(today, interval), reviews };
}

// A brand-new entry is due immediately: the first recall attempt should happen
// in the session that created it, while the scenes are still fresh — that is
// what turns an encoding into a memory.
export const schedule = (entry, today) => ({ ...entry, due: entry.due || today });

export const isDue = (entry, today) => !entry.due || entry.due <= today;

// Negative = overdue by that many days. null when never scheduled.
export const daysUntilDue = (entry, today) =>
  (entry.due && today ? daysBetween(today, entry.due) : null);

export const dueEntries = (entries, today) =>
  entries.filter(e => isDue(e, today))
    .sort((a, b) => (a.due || '').localeCompare(b.due || ''));

// How firmly held: successes in a row, ending at the most recent review.
export function streakOf(entry) {
  const r = entry.reviews || [];
  let n = 0;
  for (let i = r.length - 1; i >= 0 && r[i].ok; i--) n++;
  return n;
}

// A one-line status for the UI, so the view does no date arithmetic of its own.
export function statusOf(entry, today) {
  if (!entry.due) return { state: 'new', label: 'new', days: 0 };
  const d = daysUntilDue(entry, today);
  if (d === null) return { state: 'new', label: 'new', days: 0 };
  if (d < 0) return { state: 'overdue', label: `${-d}d overdue`, days: d };
  if (d === 0) return { state: 'due', label: 'due', days: 0 };
  return { state: 'waiting', label: `+${d}d`, days: d };
}
