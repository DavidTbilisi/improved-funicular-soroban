// ============================================================================
// Retention — how much of a skill is still there, and when it is worth a rep.
//
// THE HOLE THIS FILLS. The vault schedules the numbers you memorised, because a
// stored number decays with time whether or not you practise. Skills decay too,
// and until now nothing in the app modelled that: `STALE_DAYS = 3` in plan.js
// is a flat flag that says a deck untouched for three days is "cold" whether it
// was drilled once or forty times, and `dueFacts` is a mastery threshold that
// says nothing about time at all. Neither is a forgetting curve. This is.
//
// THE MODEL, and it is a choice rather than a law:
//
//   R(d) = 2^(−d / H)        retention after d days without practice
//   H    = HL0 · GROWTH^(s−1)  half-life, in days, after s practice DAYS
//
// Two decisions carry the whole thing:
//
//   • STRENGTH IS COUNTED IN DAYS, NOT REPS. Forty solves in one sitting is one
//     day of learning; the same forty spread over a fortnight is a skill. This
//     is the spacing effect, and counting reps instead would let a single
//     cramming session claim a year-long half-life.
//
//   • GROWTH IS SCALED BY HOW WELL IT WENT. A day of 50%-accurate reps buys
//     half the growth of a clean one (`quality`), so a skill you keep fumbling
//     keeps coming back — the same asymmetry the vault's ease has.
//
// A skill is DUE when retention falls to REVIEW_AT. 0.7, not the 0.9 the
// flashcard world targets: these are motor and automaticity skills rather than
// facts, and a rep taken at 95% is mostly wasted while one taken at 40% is
// re-learning rather than refreshing. Somewhere near 70% is the cheap middle.
//
// NOTHING IS STORED. Every input is already in the logs the app keeps, so the
// schedule is a pure function of the record — no new key, no migration, and no
// second source of truth that can disagree with the practice it came from.
// Unit-tested in test/reviewDecay.test.js.
// ============================================================================

export const HL0_DAYS = 2;        // half-life after a single day of practice
export const GROWTH = 1.9;        // what each further practice day multiplies it by
export const MAX_HL_DAYS = 365;   // a year: past this the model has nothing to say
export const REVIEW_AT = 0.7;     // retention at which a rep is worth taking

// The retention bands, loosest first. These are labels for the UI, not extra
// model: the numbers above are the model.
export const BANDS = Object.freeze([
  { state: 'fresh', at: 0.9, label: 'fresh' },
  { state: 'holding', at: REVIEW_AT, label: 'holding' },
  { state: 'due', at: 0.4, label: 'due' },
  { state: 'cold', at: 0, label: 'cold' },
]);

const clamp01 = v => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

/**
 * Half-life in days after `activeDays` distinct days of practice, discounted by
 * how clean those days were. One day at any quality is still HL0 — you did
 * learn something — so quality scales the GROWTH exponent, not the base.
 */
export function halfLife(activeDays = 0, quality = 1) {
  const s = Math.max(0, Math.floor(activeDays));
  if (s <= 0) return 0;
  const effective = 1 + (s - 1) * clamp01(quality);
  return Math.min(MAX_HL_DAYS, HL0_DAYS * Math.pow(GROWTH, effective - 1));
}

// Share still retained `days` after the last practice. Same-day practice is 1.
export function retention(days = 0, hl = 0) {
  if (!(hl > 0)) return 0;
  return Math.pow(2, -Math.max(0, days) / hl);
}

// Days from the last practice until retention reaches REVIEW_AT.
export const dueAfterDays = hl => (hl > 0 ? hl * Math.log2(1 / REVIEW_AT) : 0);

export const bandOf = r => (BANDS.find(b => r >= b.at) || BANDS[BANDS.length - 1]);

/**
 * The whole picture for one skill.
 * @param activeDays distinct calendar days it was practised on
 * @param daysSince  days since the last of them (null = never practised)
 * @param quality    0..1, how clean those days were
 * @returns { practised, halfLife, retention, dueIn, due, overdue, state, label }
 */
export function forecast({ activeDays = 0, daysSince = null, quality = 1 } = {}) {
  // Never practised is not "forgotten" — there is nothing to schedule, and
  // handing it to the learner is the unlock rules' job, not this one's.
  if (!activeDays || daysSince == null) {
    return { practised: false, halfLife: 0, retention: null, dueIn: null, due: false, overdue: 0, state: 'new', label: 'not started' };
  }
  const hl = halfLife(activeDays, quality);
  const r = retention(daysSince, hl);
  const dueIn = Math.round((dueAfterDays(hl) - daysSince) * 10) / 10;
  const band = bandOf(r);
  return {
    practised: true,
    halfLife: Math.round(hl * 10) / 10,
    retention: Math.round(r * 1000) / 1000,
    dueIn,
    due: r <= REVIEW_AT,
    overdue: dueIn < 0 ? -dueIn : 0,
    state: band.state,
    label: band.label,
  };
}

// One short line for the plan's reason field and the Today panel.
export function retentionText(f) {
  if (!f || !f.practised) return 'not started';
  const pct = Math.round(f.retention * 100);
  if (!f.due) return `${pct}% held · due in ${Math.max(0, Math.ceil(f.dueIn))}d`;
  return f.overdue >= 1 ? `${pct}% held · ${Math.round(f.overdue)}d overdue` : `${pct}% held · due now`;
}
