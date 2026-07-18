// ============================================================================
// Automaticity forecast — a DOM-free one-liner over a deck's saved sessions,
// the drill-side sibling of tutorial/prognosis.js. The drills already frame
// "share of reps under the pass-floor" as automaticity, so this fits a
// least-squares slope to that share across the recent sessions and turns the
// gap to the target into "≈ N more sessions". Like prognose(), it refuses to
// fabricate an ETA when the share isn't climbing.
// ============================================================================

const WINDOW = 10;       // most-recent sessions that define "now"
const MIN_SESSIONS = 3;  // fewer than this → no slope worth trusting
const TARGET = 90;       // % under floor at which a deck reads as automatic
const FLAT_EPS = 0.5;    // slope (pct-points per session) below which it's flat
const MAX_SESSIONS = 40; // cap so a hair-thin slope can't blow up the ETA

// Least-squares slope of the values against their index (per-session change).
function slopeOf(ys) {
  const n = ys.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (i - mx) * (ys[i] - my); den += (i - mx) ** 2; }
  return den ? num / den : 0;
}

/**
 * @param sessions a deck's saved history (oldest→newest), each { floorPct, ... }
 * @returns { status, latest, slope, sessionsToTarget, capped, message }
 *   status: 'none' | 'warming' | 'automatic' | 'climbing' | 'flat'
 */
export function automaticityForecast(sessions = [], { target = TARGET } = {}) {
  const win = sessions.slice(-WINDOW);
  const n = win.length;
  const base = { status: 'none', latest: null, slope: 0, sessionsToTarget: null, capped: false, message: '' };
  if (n === 0) return base;

  const latest = win[n - 1].floorPct;
  const slope = slopeOf(win.map(s => s.floorPct));

  if (latest >= target) {
    return { ...base, status: 'automatic', latest, slope,
      message: `Automatic — ${latest}% of reps under the floor last session. Keep it warm.` };
  }
  if (n < MIN_SESSIONS) {
    return { ...base, status: 'warming', latest, slope,
      message: `${n} session${n === 1 ? '' : 's'} saved — ${MIN_SESSIONS - n} more to forecast automaticity.` };
  }
  if (slope > FLAT_EPS) {
    let k = Math.ceil((target - latest) / slope), capped = false;
    if (k > MAX_SESSIONS) { k = MAX_SESSIONS; capped = true; }
    return { ...base, status: 'climbing', latest, slope, sessionsToTarget: k, capped,
      message: `≈${k}${capped ? '+' : ''} more session${k === 1 ? '' : 's'} to ${target}% under floor at your current pace (now ${latest}%, climbing).` };
  }
  return { ...base, status: 'flat', latest, slope,
    message: `Under-floor share ${latest}% and not climbing — keep drilling; missed items re-deal until they stick.` };
}
