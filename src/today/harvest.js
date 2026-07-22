// ============================================================================
// Harvest — every timestamp already sitting in the saved logs, reduced to a
// sorted set of day keys. This is the BACKFILL source: an existing player has
// months of history, and their day streak must not start at zero the day the
// Today page ships (DayLog.seedFrom, the AchievementTracker.seed pattern).
//
// It reads the RAW blobs, not the services, because it must tolerate anything:
// a half-written key, a shape from an older version, an outright string. Junk
// is skipped, never thrown on.
//
// Two of the nine keys contribute nothing and never will:
//   npv-game-save   — the village blob counts *village days*, one per solve;
//                     it has no wall-clock stamp anywhere.
//   npv-fault-log   — fault counts, deliberately not rates and not timestamped.
// So the harvest floor is drills + practice + trainer + achievement unlocks.
// Live marking (DayLog.mark) is what makes game days count from here on.
//
// Pure — no DOM. Unit-tested in test/todayHarvest.test.js.
// ============================================================================
import { dayKey } from './dayKey.js';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = v => (Array.isArray(v) ? v : []);

// Every `t` inside blob[id][field][] — the shape DrillStatsService and SolveLog
// both write, differing only in the array's name.
function stampsFrom(blob, field, out) {
  if (!isObj(blob)) return;
  for (const entry of Object.values(blob)) {
    if (!isObj(entry)) continue;
    for (const rec of arr(entry[field])) {
      if (isObj(rec)) { const d = dayKey(rec.t); if (d) out.add(d); }
    }
  }
}

/**
 * @param blobs raw parsed contents of the timestamped keys (any may be missing)
 *   drillStats       npv-drill-stats      { [deckId]:  { sessions: [{ t, … }] } }
 *   practiceHistory  npv-practice-history { [levelId]: { solves:   [{ t, … }] } }
 *   trainerHistory   npv-trainer-progress { [modeId]:  { solves:   [{ t, … }] } }
 *   achievements     npv-achievements     { unlocked:  { [id]: isoDate } }
 * @returns ['YYYY-MM-DD', …] ascending, deduped
 */
export function harvestDays({ drillStats, practiceHistory, trainerHistory, achievements } = {}) {
  const out = new Set();
  stampsFrom(drillStats, 'sessions', out);
  stampsFrom(practiceHistory, 'solves', out);
  stampsFrom(trainerHistory, 'solves', out);
  if (isObj(achievements) && isObj(achievements.unlocked)) {
    for (const at of Object.values(achievements.unlocked)) {
      const d = dayKey(at); if (d) out.add(d);
    }
  }
  return [...out].sort();
}
