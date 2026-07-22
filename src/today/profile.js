// ============================================================================
// Profile — ONE derived snapshot of everything the learner has done, read
// across all the saved keys at once.
//
// Every measurement layer this reads already existed; each was just siloed on
// the page that wrote it (forecast.js on drills, prognosis.js on practice,
// faultLog on practice, goals/rank/advisor on the game). Nothing here
// recomputes any of them — it calls them and lays the results side by side, so
// the Today page and the plan ladder can reason about the whole learner.
//
// It takes CONSTRUCTED SERVICES, never storage: the ports were already the
// injection seam everywhere else, so tests hand it Memory-backed services and
// the page hands it LocalStorage-backed ones. It only ever READS — nothing here
// writes, so building a profile can never corrupt a save.
//
// DOM-free. Unit-tested in test/todayProfile.test.js.
// ============================================================================
import { automaticityForecast } from '../drill/forecast.js';
import { prognose, STAGE_NAMES } from '../tutorial/prognosis.js';
import { fumbleRows } from '../tutorial/faultLog.js';
import { villageRank } from '../game/rank.js';
import { nextGoal } from '../game/goals.js';
import { nextHint } from '../game/advisor.js';
import { dayKey, daysBetween } from './dayKey.js';
import { isDue, daysUntilDue } from '../vault/schedule.js';
import { nextGrade, highestPassed, totalSeconds, describeGrade } from '../exam/grades.js';

// A deck fact counts as "due" while fewer than this share of its saved reps
// landed under the floor — the same 90% bar automaticityForecast uses for a
// whole deck, applied per fact.
const FACT_AUTOMATIC = 0.9;

// Newest day key in a list of {t}-stamped records (they are stored oldest→newest,
// but a hand-edited save need not be, so this scans rather than taking the last).
function lastDayOf(records) {
  let best = null;
  for (const r of records || []) {
    const d = r && dayKey(r.t);
    if (d && (!best || d > best)) best = d;
  }
  return best;
}

const sinceDays = (lastDay, today) =>
  (lastDay && today ? Math.max(0, daysBetween(lastDay, today)) : null);

// Share of the recent solves that were clean — a cheap per-level readiness that
// doesn't need the full prognosis machinery (which is per support level).
function cleanRate(solves, window = 10) {
  const win = (solves || []).slice(-window);
  if (!win.length) return 0;
  return win.filter(s => s.clean).length / win.length;
}

/**
 * @param levels   TUTORIAL_LEVELS
 * @param decks    DRILL_DECKS (an object keyed by deck id)
 * @param modes    ROD_MODES
 * @param anzanRungs ANZAN_LEVELS, with anzanLog the AnzanLog beside it
 * @param examGrades EXAM_GRADES, with examLog the ExamLog beside it
 * @param progress TutorialProgress
 * @param practiceLog / trainerLog  SolveLog instances
 * @param stats    DrillStatsService
 * @param faults   FaultLog
 * @param save     GameSave
 * @param achievements AchievementTracker (optional — the page has one, tests may not)
 * @param dayLog   DayLog
 * @param support  the current mnemonic-mental fade level (0..2)
 * @param today    the injected day key ('YYYY-MM-DD')
 */
export function buildProfile({
  levels = [], decks = {}, modes = [], anzanRungs = [], examGrades = [],
  progress, practiceLog, trainerLog, stats, faults, save, achievements, dayLog, anzanLog, vault, examLog,
  support = 0, today = null,
} = {}) {
  // --- Days ----------------------------------------------------------------
  const days = dayLog ? dayLog.days() : [];
  const streak = dayLog ? dayLog.streak(today) : { current: 0, longest: 0, lastActive: null, activeToday: false, total: 0 };

  // --- Practice ladder -----------------------------------------------------
  const practiceLevels = levels.map((lv, idx) => {
    const solves = practiceLog ? practiceLog.solves(lv.id) : [];
    const best = progress ? progress.best(lv.id) : 0;
    const lastDay = lastDayOf(solves);
    return {
      idx, id: lv.id, title: lv.title, floor: lv.floor, timeFloorMs: lv.timeFloorMs,
      unlocked: progress ? progress.isUnlocked(idx) : idx === 0,
      best, cleared: best >= lv.floor,
      solves: solves.length, lastDay, daysSince: sinceDays(lastDay, today),
      readiness: cleanRate(solves),
    };
  });
  const unlockedLevels = practiceLevels.filter(l => l.unlocked);
  // "Current" = the first unlocked level still short of its streak floor; that
  // is where the ladder actually wants you, and it's what the plan links to.
  const currentLevel = unlockedLevels.find(l => !l.cleared) || unlockedLevels[unlockedLevels.length - 1] || null;
  // "Weakest" ranks by how far short of the floor, then by staleness — an
  // untouched unlocked level outranks one being actively worked.
  const weakestLevel = [...unlockedLevels].filter(l => !l.cleared)
    .sort((a, b) => (b.floor - b.best) - (a.floor - a.best) || (b.daysSince ?? 999) - (a.daysSince ?? 999))[0] || null;

  // --- Rod trainer ---------------------------------------------------------
  const trainerModes = modes.map(m => {
    const solves = trainerLog ? trainerLog.solves(m.id) : [];
    const floor = m.floor ?? 3;
    const best = trainerLog ? trainerLog.best(m.id) : 0;
    const lastDay = lastDayOf(solves);
    return {
      id: m.id, label: m.label, title: m.title, op: m.op, floor, timeFloorMs: m.timeFloorMs ?? null,
      best, cleared: best >= floor,
      solves: solves.length, lastDay, daysSince: sinceDays(lastDay, today),
    };
  });
  const weakestMode = trainerModes.find(m => !m.cleared) || null;

  // --- Flash anzan ---------------------------------------------------------
  // Its axis is the PACE it was carried at, not the time it took, so `cleared`
  // means the floor was ever carried unbroken and `fastest` is the real score.
  const anzanLevels = anzanRungs.map(l => {
    const rounds = anzanLog ? anzanLog.rounds(l.id) : [];
    const lastDay = lastDayOf(rounds);
    return {
      id: l.id, title: l.title, terms: l.terms, digits: l.digits,
      baseMs: l.baseMs, floor: l.floor,
      best: anzanLog ? anzanLog.best(l.id) : 0,
      fastest: anzanLog ? anzanLog.fastest(l.id) : null,
      cleared: !!(anzanLog && anzanLog.fastest(l.id) !== null),
      rounds: rounds.length,
      accuracy: anzanLog ? anzanLog.accuracy(l.id) : null,
      // The pace of the most recent round — what the learner is actually working
      // at, which need not be the rung's default once they've moved the control.
      lastMs: rounds.length ? rounds[rounds.length - 1].ms : null,
      lastDay, daysSince: sinceDays(lastDay, today),
    };
  });
  const currentAnzan = anzanLevels.find(l => !l.cleared) || anzanLevels[anzanLevels.length - 1] || null;

  // --- Vault ---------------------------------------------------------------
  // The only track whose work is scheduled by TIME rather than by mastery: a
  // stored number decays whether or not you practise, so "due" here means a
  // date has arrived, not that a threshold is unmet.
  const vaultEntries = vault ? vault.all() : [];
  const vaultDue = vaultEntries.filter(e => isDue(e, today));
  const vaultOut = {
    entries: vaultEntries.map(e => ({
      id: e.id, label: e.label, length: e.length, radix: e.radix, mode: e.mode,
      due: e.due, interval: e.interval, daysUntil: daysUntilDue(e, today),
      reviews: (e.reviews || []).length,
    })),
    total: vaultEntries.length,
    due: vaultDue.length,
    // The most overdue entry — what the plan should name if it names one.
    next: vaultDue.map(e => ({ id: e.id, label: e.label, daysUntil: daysUntilDue(e, today) }))
      .sort((a, b) => (a.daysUntil ?? -999) - (b.daysUntil ?? -999))[0] || null,
    digits: vaultEntries.reduce((n, e) => n + (e.length || 0), 0),
  };

  // --- Kyu exam ------------------------------------------------------------
  // The only track measured against a standard the app did not invent, so
  // "passed" is a fact about attempts rather than a threshold this file picks:
  // it just asks the log which grades were ever carried, and grades.js which
  // one is therefore next.
  const passedIds = examLog ? examLog.passedIds() : [];
  const passedSet = new Set(passedIds);
  const examRows = examGrades.map(g => {
    const attempts = examLog ? examLog.attempts(g.id) : [];
    const lastDay = lastDayOf(attempts);
    return {
      id: g.id, name: g.name, kyu: g.kyu, needs: g.needs, desc: describeGrade(g),
      minutes: Math.round(totalSeconds(g) / 60),
      best: examLog ? examLog.best(g.id) : null,
      passed: passedSet.has(g.id),
      attempts: attempts.length,
      lastDay, daysSince: sinceDays(lastDay, today),
    };
  });
  const rowFor = grade => (grade ? examRows.find(r => r.id === grade.id) || null : null);
  const examOut = {
    grades: examRows,
    passed: examRows.filter(r => r.passed).length,
    highest: rowFor(highestPassed(passedIds)),
    next: rowFor(nextGrade(passedIds)),
    attempts: examRows.reduce((n, r) => n + r.attempts, 0),
  };

  // --- Drill decks ---------------------------------------------------------
  const drillDecks = Object.entries(decks).map(([id, deck]) => {
    const sessions = stats ? stats.history(id) : [];
    const factTallies = stats ? stats.facts(id) : {};
    let dueFacts = 0;
    for (const f of Object.values(factTallies)) {
      if (f && f.n > 0 && (f.floorPass || 0) / f.n < FACT_AUTOMATIC) dueFacts++;
    }
    const lastDay = lastDayOf(sessions);
    return {
      id, label: deck.label, floorMs: deck.floorMs, mode: deck.mode,
      sessions: sessions.length,
      latestFloorPct: sessions.length ? sessions[sessions.length - 1].floorPct : null,
      best: stats ? stats.best(id) : null,
      lastDay, daysSince: sinceDays(lastDay, today),
      forecast: automaticityForecast(sessions),
      dueFacts, factCount: Object.keys(factTallies).length,
    };
  });
  // Weakest deck: only ones that have been touched (an untouched deck isn't
  // "weak", it's unstarted — that's the next-unlock rule's business), ranked by
  // due facts, then by how far the under-floor share is from automatic.
  const weakestDeck = drillDecks.filter(d => d.sessions > 0)
    .sort((a, b) => b.dueFacts - a.dueFacts || (a.latestFloorPct ?? 0) - (b.latestFloorPct ?? 0))[0] || null;

  // --- Mnemonic-mental track ----------------------------------------------
  const sup = Math.max(0, Math.min(2, support | 0));
  const mentalOn = currentLevel || practiceLevels[0] || null;
  const mental = {
    support: sup,
    stageName: STAGE_NAMES[sup],
    levelId: mentalOn ? mentalOn.id : null,
    prognosis: prognose(
      mentalOn && practiceLog ? practiceLog.solves(mentalOn.id) : [],
      { floorMs: mentalOn ? mentalOn.timeFloorMs : 0, support: sup }),
  };

  // --- Fumble diagnosis ----------------------------------------------------
  const counts = faults ? faults.counts() : { pairs: {}, resets: 0 };
  const rows = fumbleRows(counts);
  const faultsOut = {
    rows, resets: counts.resets,
    top: [...rows].filter(r => r.count > 0).sort((a, b) => b.count - a.count).slice(0, 3),
    total: rows.reduce((n, r) => n + r.count, 0),
  };

  // --- Village -------------------------------------------------------------
  const village = save ? save.load() : null;
  const villageOut = village ? {
    village,
    rank: villageRank(village),
    goal: nextGoal(village),
    hint: nextHint(village),
    sp: village.sp,
    day: village.day,
    founded: !!(village.stats && village.stats.founded),
    solves: (village.stats && village.stats.solves) || 0,
    achievements: achievements
      ? { unlocked: achievements.unlockedCount(), total: achievements.states(village).length }
      : null,
  } : null;

  const totalSolves = practiceLevels.reduce((n, l) => n + l.solves, 0)
    + trainerModes.reduce((n, m) => n + m.solves, 0);
  const totalSessions = drillDecks.reduce((n, d) => n + d.sessions, 0)
    + anzanLevels.reduce((n, l) => n + l.rounds, 0)
    + vaultOut.entries.reduce((n, e) => n + e.reviews, 0)
    + examOut.attempts;

  return {
    today, days, streak,
    fresh: totalSolves === 0 && totalSessions === 0 && (!villageOut || villageOut.solves === 0),
    practice: {
      levels: practiceLevels,
      total: practiceLevels.length,
      cleared: practiceLevels.filter(l => l.cleared).length,
      unlocked: unlockedLevels.length,
      current: currentLevel,
      weakest: weakestLevel,
      // The newest unlocked level never yet attempted — the "there's something
      // new open" pull.
      untouched: [...unlockedLevels].reverse().find(l => l.solves === 0) || null,
      solves: practiceLevels.reduce((n, l) => n + l.solves, 0),
    },
    trainer: {
      modes: trainerModes,
      cleared: trainerModes.filter(m => m.cleared).length,
      weakest: weakestMode,
      solves: trainerModes.reduce((n, m) => n + m.solves, 0),
    },
    vault: vaultOut,
    exam: examOut,
    anzan: {
      levels: anzanLevels,
      total: anzanLevels.length,
      cleared: anzanLevels.filter(l => l.cleared).length,
      current: currentAnzan,
      rounds: anzanLevels.reduce((n, l) => n + l.rounds, 0),
    },
    drills: {
      decks: drillDecks,
      total: drillDecks.length,
      automatic: drillDecks.filter(d => d.forecast.status === 'automatic').length,
      weakest: weakestDeck,
      untouched: drillDecks.find(d => d.sessions === 0) || null,
      sessions: totalSessions,
    },
    mental,
    faults: faultsOut,
    village: villageOut,
  };
}
