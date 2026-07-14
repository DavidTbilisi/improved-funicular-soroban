// ============================================================================
// Prognosis — a DOM-free forecast of "how much more soroban practice until I
// can drop the beads and work mentally", read purely from the SolveLog.
//
// The mnemonic-mental track fades the board in three stages (see sorobanView):
//   0 = Beads   1 = Percept   2 = Mental
// You "convert to mental mode" by earning your way up that ladder — and the
// gate for dropping a support level is the SAME thing the tutorial already
// grades: AUTOMATICITY. A solve you land clean (fumble-free) and comfortably
// under the level's time floor is one you no longer need the physical beads for.
//
// So this model reads the recent solves AT THE CURRENT SUPPORT LEVEL, scores how
// automatic they are (a readiness 0..1), fits how fast that readiness is rising
// (a per-solve slope), and turns the gap-to-ready into an ETA in solves and in
// wall-clock minutes. Two stages may remain (Beads→Percept→Mental), so it rolls
// the current stage's remaining cost up with a nominal cost for each stage still
// ahead. It refuses to fabricate an ETA when you aren't improving — a flat or
// sinking readiness returns a null forecast and a "drill, don't advance" message.
//
// Pure and injected-nothing: give it a level's solve records and its floor, get
// back a plain object. Unit-tested in test/prognosis.test.js.
// ============================================================================

export const STAGE_NAMES = ['Beads', 'Percept', 'Mental'];

const WINDOW = 12;          // most-recent same-support solves that define "now"
const MIN_SOLVES = 4;       // fewer than this at a stage → not enough signal
const READY = 0.8;          // readiness at/above which you may drop the support
const COMFORT = 0.75;       // a clean solve under COMFORT×floor is "comfortable"
const OVERHEAD_MS = 4000;   // read-prompt + seed + settle between problems
const FLAT_EPS = 0.005;     // |slope| below this reads as flat (per-solve quality)
const MAX_STAGE_SOLVES = 80; // cap so a hair-thin positive slope can't blow up ETAs
const NOMINAL_STAGE_SOLVES = 12; // fresh-stage cost when the slope can't set it

const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = xs => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Per-solve automaticity in [0,1]: a fumbled/slow (non-clean) solve is 0; a clean
// one under COMFORT×floor is a full 1; a clean-but-barely (between comfort and
// the floor) is a half — under the floor, but with no headroom to spare for the
// harder blind read once the beads are gone.
function quality(s, floorMs) {
  if (!s.clean) return 0;
  return (floorMs && s.ms <= COMFORT * floorMs) ? 1 : 0.5;
}

// Least-squares slope of the values against their index (per-solve change).
function slopeOf(ys) {
  const n = ys.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2, my = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (i - mx) * (ys[i] - my); den += (i - mx) ** 2; }
  return den ? num / den : 0;
}

const capSolves = v => (v > MAX_STAGE_SOLVES ? { n: MAX_STAGE_SOLVES, capped: true } : { n: v, capped: false });

/**
 * @param solves  a level's records (oldest→newest), each { ms, clean, support?, t? }
 * @param opts    { floorMs, support }  the level's time floor and the CURRENT support level
 * @returns a plain forecast object (see fields below)
 */
export function prognose(solves = [], { floorMs = 0, support = 0 } = {}) {
  support = Math.max(0, Math.min(2, support | 0));
  const stageName = STAGE_NAMES[support];
  const atMental = support === 2;
  const nextName = atMental ? null : STAGE_NAMES[support + 1];
  const stagesRemaining = 2 - support;

  // Only solves logged at THIS support level speak to readiness here. Legacy
  // records with no support tag are Beads (0) — that's where the board starts.
  const here = solves.filter(s => (s.support ?? 0) === support);
  const win = here.slice(-WINDOW);
  const n = win.length;

  const base = {
    support, stageName, atMental, nextName, stagesRemaining, n,
    enoughData: false, cleanRate: 0, readiness: 0, ready: false,
    trend: 'unknown', slope: 0, meanMs: 0, medianMs: 0,
    solvesToNextDrop: null, nextDropCapped: false, solvesToMental: null,
    minutesToNextDrop: null, minutesToMental: null,
    message: '',
  };

  if (atMental) {
    const clean = here.filter(s => s.clean).length;
    return { ...base, n: here.length, enoughData: here.length > 0, ready: true, readiness: 1,
      message: here.length
        ? `🧠 Mental mode — you're solving without the beads. ${clean} clean mental solve${clean === 1 ? '' : 's'} banked; keep them coming to lock it in.`
        : `🧠 Mental mode — solve one and the trainer still checks your value, blind.` };
  }

  if (n === 0) {
    return { ...base, message: `No ${stageName} solves logged yet — clear a few problems and your path to mental charts here.` };
  }

  const qs = win.map(s => quality(s, floorMs));
  const readiness = mean(qs);
  const cleanRate = mean(win.map(s => (s.clean ? 1 : 0)));
  const slope = slopeOf(qs);
  const meanMs = mean(win.map(s => s.ms));
  const medianMs = median(win.map(s => s.ms));
  const trend = slope > FLAT_EPS ? 'improving' : slope < -FLAT_EPS ? 'declining' : 'flat';
  const ready = readiness >= READY;
  const perSolveMs = meanMs + OVERHEAD_MS;
  const minutes = s => (s == null ? null : (s * perSolveMs) / 60000);

  if (n < MIN_SOLVES) {
    return { ...base, enoughData: false, cleanRate, readiness, ready, trend, slope, meanMs, medianMs,
      message: `Only ${n} ${stageName} solve${n === 1 ? '' : 's'} so far — solve ~${MIN_SOLVES - n} more to project your time to mental.` };
  }

  // Remaining solves to reach READY at THIS stage; a fresh stage's full cost.
  let solvesToNextDrop, nextDropCapped = false;
  if (ready) {
    solvesToNextDrop = 0;
  } else if (slope > FLAT_EPS) {
    const c = capSolves(Math.ceil((READY - readiness) / slope));
    solvesToNextDrop = c.n; nextDropCapped = c.capped;
  } else {
    solvesToNextDrop = null; // not improving — no honest ETA
  }
  const fullStage = slope > FLAT_EPS ? capSolves(Math.ceil(READY / slope)).n : NOMINAL_STAGE_SOLVES;

  const solvesToMental = solvesToNextDrop == null
    ? null
    : solvesToNextDrop + Math.max(0, stagesRemaining - 1) * fullStage;

  const result = { ...base, enoughData: true, cleanRate, readiness, ready, trend, slope, meanMs, medianMs,
    solvesToNextDrop, nextDropCapped, solvesToMental,
    minutesToNextDrop: minutes(solvesToNextDrop), minutesToMental: minutes(solvesToMental) };

  result.message = messageFor(result);
  return result;
}

const roundMin = m => (m == null ? '—' : m < 1 ? '<1' : String(Math.round(m)));
const pct = r => Math.round(r * 100);

function messageFor(p) {
  const { stageName, nextName, ready, trend, readiness, minutesToMental, solvesToMental, stagesRemaining } = p;
  if (ready) {
    return stagesRemaining === 1
      ? `✓ Ready — drop to Mental now; the trainer still verifies your value.`
      : `✓ Ready to fade the beads — switch to ${nextName}. ≈${roundMin(minutesToMental)} min more to fully mental.`;
  }
  if (trend === 'improving') {
    return `≈${roundMin(minutesToMental)} min (${solvesToMental} solves) of ${stageName} at your current pace to reach Mental — readiness ${pct(readiness)}%, climbing.`;
  }
  return `Readiness ${pct(readiness)}% and not climbing — string together clean, comfortably-fast solves before fading the beads (drill your fumble pairs).`;
}
