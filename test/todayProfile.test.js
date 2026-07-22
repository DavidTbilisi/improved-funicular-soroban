import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile } from '../src/today/profile.js';
import { TUTORIAL_LEVELS } from '../src/tutorial/levels.js';
import { DRILL_DECKS } from '../src/drill/decks.js';
import { ROD_MODES } from '../src/domain/mulDiv.js';
import { ANZAN_LEVELS } from '../src/anzan/levels.js';
import { AnzanLog } from '../src/anzan/anzanLog.js';
import { YOMIAGE_LEVELS } from '../src/yomiage/levels.js';
import { Vault } from '../src/vault/vaultStore.js';
import { EXAM_GRADES } from '../src/exam/grades.js';
import { ExamLog } from '../src/exam/examLog.js';
import { MissQueue } from '../src/review/misses.js';
import { MemoryProgressStore, TutorialProgress } from '../src/tutorial/progressStore.js';
import { MemoryStatsStore, DrillStatsService } from '../src/drill/statsStore.js';
import { SolveLog } from '../src/tutorial/solveLog.js';
import { FaultLog } from '../src/tutorial/faultLog.js';
import { GameSave } from '../src/game/saveStore.js';
import { DayLog } from '../src/today/dayLog.js';

const TODAY = '2026-07-22';

// Build a profile from plain blobs — the same shapes the real keys hold.
function profileFrom({
  tutorial = {}, practice = {}, trainer = {}, drills = {}, faults = {},
  village = {}, days = {}, anzan = {}, yomiage = {}, vault = {}, exam = {}, misses = {}, support = 0, today = TODAY,
} = {}) {
  return buildProfile({
    levels: TUTORIAL_LEVELS, decks: DRILL_DECKS, modes: ROD_MODES, anzanRungs: ANZAN_LEVELS,
    yomiageRungs: YOMIAGE_LEVELS, examGrades: EXAM_GRADES,
    examLog: new ExamLog(new MemoryProgressStore(exam)),
    misses: new MissQueue(new MemoryProgressStore(misses)),
    progress: new TutorialProgress(new MemoryProgressStore(tutorial)),
    practiceLog: new SolveLog(new MemoryProgressStore(practice)),
    trainerLog: new SolveLog(new MemoryProgressStore(trainer)),
    stats: new DrillStatsService(new MemoryStatsStore(drills)),
    faults: new FaultLog(new MemoryProgressStore(faults)),
    save: new GameSave(new MemoryProgressStore(village)),
    dayLog: new DayLog(new MemoryProgressStore(days)),
    anzanLog: new AnzanLog(new MemoryProgressStore(anzan)),
    yomiageLog: new AnzanLog(new MemoryProgressStore(yomiage)),
    vault: new Vault(new MemoryProgressStore(vault)),
    support, today,
  });
}

const solves = (n, { clean = true, ms = 2000, day = TODAY, support = 0 } = {}) =>
  Array.from({ length: n }, () => ({ t: `${day}T10:00`, ms, clean, support }));

// --- the virgin case: this is what every first-run null-guard bug shows up in -
test('a completely empty profile builds without throwing', () => {
  const p = profileFrom();
  assert.equal(p.fresh, true);
  assert.equal(p.streak.current, 0);
  assert.equal(p.practice.cleared, 0);
  assert.equal(p.practice.solves, 0);
  assert.equal(p.trainer.cleared, 0);
  assert.equal(p.drills.sessions, 0);
  assert.equal(p.faults.total, 0);
  assert.deepEqual(p.faults.top, []);
  assert.equal(p.practice.unlocked, 1, 'level 0 is always open');
  assert.equal(p.practice.current.id, 'read');
  assert.equal(p.village.sp >= 0, true);
});

test('buildProfile with no arguments at all still returns a shaped snapshot', () => {
  const p = buildProfile();
  assert.equal(p.practice.total, 0);
  assert.equal(p.village, null);
  assert.equal(p.streak.current, 0);
  assert.equal(p.mental.stageName, 'Beads');
});

// --- streak ----------------------------------------------------------------
test('the streak comes through from the day log', () => {
  const p = profileFrom({ days: { v: 1, seeded: true, days: ['2026-07-20', '2026-07-21', '2026-07-22'] } });
  assert.equal(p.streak.current, 3);
  assert.equal(p.streak.activeToday, true);
  assert.equal(p.fresh, true, 'days alone are not work history');
});

// --- practice ladder --------------------------------------------------------
test('current is the first unlocked level short of its floor; cleared counts up', () => {
  const p = profileFrom({
    tutorial: { v: 2, unlocked: 4, best: { read: 6, direct: 8, 'small-add': 2 } },
  });
  assert.equal(p.practice.cleared, 2, 'read (6/6) and direct (8/8)');
  assert.equal(p.practice.current.id, 'small-add');
  assert.equal(p.practice.unlocked, 4);
});

test('weakest is the unlocked level furthest from its floor', () => {
  const p = profileFrom({
    tutorial: { v: 2, unlocked: 4, best: { read: 6, direct: 7, 'small-add': 0, 'small-sub': 5 } },
  });
  // shortfalls: direct 1, small-add 8, small-sub 3
  assert.equal(p.practice.weakest.id, 'small-add');
});

test('untouched is the newest unlocked level with no solves', () => {
  const p = profileFrom({
    tutorial: { v: 2, unlocked: 3, best: { read: 6, direct: 8 } },
    practice: { read: { solves: solves(6) }, direct: { solves: solves(8) } },
  });
  assert.equal(p.practice.untouched.id, 'small-add');
});

test('lastDay and daysSince read off the solve stamps', () => {
  const p = profileFrom({
    practice: { read: { solves: solves(3, { day: '2026-07-18' }) } },
  });
  const read = p.practice.levels.find(l => l.id === 'read');
  assert.equal(read.lastDay, '2026-07-18');
  assert.equal(read.daysSince, 4);
  assert.equal(read.solves, 3);
});

test('a level never solved has a null lastDay and null daysSince', () => {
  const read = profileFrom().practice.levels.find(l => l.id === 'read');
  assert.equal(read.lastDay, null);
  assert.equal(read.daysSince, null);
});

// --- trainer ----------------------------------------------------------------
test('trainer modes carry their floors, bests and the first uncleared one', () => {
  const p = profileFrom({ trainer: { 'mul-1x1': { solves: solves(4), best: 3 } } });
  const first = p.trainer.modes.find(m => m.id === 'mul-1x1');
  assert.equal(first.cleared, true, 'best 3 meets the floor of 3');
  assert.equal(first.solves, 4);
  assert.equal(p.trainer.cleared, 1);
  assert.equal(p.trainer.weakest.id, 'mul-2x1', 'the next mode down the ladder');
});

// --- drills -----------------------------------------------------------------
test('dueFacts counts facts under the 90% automatic bar', () => {
  const p = profileFrom({
    drills: {
      fingerTimes: {
        sessions: [{ t: `${TODAY}T10:00`, n: 20, acc: 90, meanMs: 2000, floorPct: 60 }],
        facts: {
          '7x8': { n: 10, miss: 4, sumMs: 30000, floorPass: 5 },   // 50% — due
          '6x7': { n: 10, miss: 0, sumMs: 20000, floorPass: 10 },  // 100% — not due
          '9x9': { n: 4, miss: 2, sumMs: 12000, floorPass: 3 },    // 75% — due
        },
      },
    },
  });
  const deck = p.drills.decks.find(d => d.id === 'fingerTimes');
  assert.equal(deck.dueFacts, 2);
  assert.equal(deck.factCount, 3);
  assert.equal(deck.latestFloorPct, 60);
  assert.equal(deck.sessions, 1);
  assert.equal(p.drills.weakest.id, 'fingerTimes');
});

test('an untouched deck is not "weakest" — it is untouched', () => {
  const p = profileFrom();
  assert.equal(p.drills.weakest, null);
  assert.ok(p.drills.untouched, 'but there is an unstarted deck to point at');
});

test('the deck forecast is the real automaticityForecast, not a reimplementation', () => {
  const sessions = [40, 55, 70].map((floorPct, i) =>
    ({ t: `2026-07-1${i}T10:00`, n: 20, acc: 90, meanMs: 1200, floorPct }));
  const p = profileFrom({ drills: { faceToDigit: { sessions } } });
  const deck = p.drills.decks.find(d => d.id === 'faceToDigit');
  assert.equal(deck.forecast.status, 'climbing');
  assert.ok(deck.forecast.sessionsToTarget > 0);
});

// --- mental track -----------------------------------------------------------
test('the mental stage follows the injected support level', () => {
  for (const [sup, name] of [[0, 'Beads'], [1, 'Percept'], [2, 'Mental']]) {
    assert.equal(profileFrom({ support: sup }).mental.stageName, name);
  }
  assert.equal(profileFrom({ support: 9 }).mental.stageName, 'Mental', 'clamped');
});

test('the prognosis reads only solves logged at the current support', () => {
  const p = profileFrom({
    tutorial: { v: 2, unlocked: 2, best: { read: 6 } },
    practice: { direct: { solves: [...solves(6, { support: 0, ms: 1000 }), ...solves(2, { support: 1, ms: 5000 })] } },
    support: 1,
  });
  assert.equal(p.mental.levelId, 'direct');
  assert.equal(p.mental.prognosis.support, 1);
  assert.equal(p.mental.prognosis.n, 2, 'only the two Percept solves count');
});

// --- faults -----------------------------------------------------------------
test('the top fumble pairs come back count-ordered, zeroes excluded', () => {
  const p = profileFrom({
    faults: { pairs: { 'big:3-7': 9, 'small:2-3': 4, 'big:1-9': 6, 'big:5-5': 0 }, resets: 2 },
  });
  assert.deepEqual(p.faults.top.map(r => r.key), ['big:3-7', 'big:1-9', 'small:2-3']);
  assert.equal(p.faults.resets, 2);
  assert.equal(p.faults.total, 19);
  assert.equal(p.faults.rows.length, 7, 'the full fixed-order chart is still there');
});

// --- village ----------------------------------------------------------------
test('the village block carries rank, goal, hint and the healed save', () => {
  const p = profileFrom({
    village: {
      v: 1, sp: 240, day: 30, res: { food: 200, wood: 90, coin: 150 },
      grid: [{ id: 'hut', level: 2 }, { id: 'farm', level: 2 }, { id: 'shrine', level: 3 }],
      stats: { solves: 40, clean: 22, spEarned: 600, bestStreak: 6, festivals: 1, founded: true },
    },
  });
  assert.equal(p.village.sp, 240);
  assert.equal(p.village.founded, true);
  assert.equal(p.village.solves, 40);
  assert.ok(p.village.rank.title, 'a rank title is always produced');
  assert.equal(p.village.rank.score, 7 + Math.floor(600 / 50));
  assert.ok(p.village.hint && typeof p.village.hint.msg === 'string');
  assert.equal(p.fresh, false, 'village solves count as work');
});

test('a corrupt village blob is healed by GameSave, not propagated', () => {
  const p = profileFrom({ village: { sp: 'lots', grid: 'nope', stats: null } });
  assert.equal(typeof p.village.sp, 'number');
  assert.ok(p.village.rank);
});

// --- freshness --------------------------------------------------------------
test('one practice solve is enough to stop being fresh', () => {
  assert.equal(profileFrom({ practice: { read: { solves: solves(1) } } }).fresh, false);
});

test('one drill session is enough to stop being fresh', () => {
  const p = profileFrom({
    drills: { faceToDigit: { sessions: [{ t: `${TODAY}T10:00`, n: 10, acc: 100, meanMs: 900, floorPct: 80 }] } },
  });
  assert.equal(p.fresh, false);
});

// --- flash anzan ------------------------------------------------------------
test('an untouched anzan ladder still reports every rung', () => {
  const p = profileFrom();
  assert.equal(p.anzan.total, ANZAN_LEVELS.length);
  assert.equal(p.anzan.cleared, 0);
  assert.equal(p.anzan.rounds, 0);
  assert.equal(p.anzan.current.id, ANZAN_LEVELS[0].id, 'current is the first uncarried rung');
  for (const l of p.anzan.levels) {
    assert.equal(l.fastest, null);
    assert.equal(l.cleared, false);
    assert.equal(l.accuracy, null);
  }
});

test('a rung counts as cleared once a pace has been carried', () => {
  const p = profileFrom({
    anzan: {
      warm: { rounds: [{ t: `${TODAY}T10:00`, ms: 650, ok: true }], best: 5, fastest: 650 },
      five1: { rounds: [{ t: `${TODAY}T10:00`, ms: 1300, ok: false }], best: 1, fastest: null },
    },
  });
  const warm = p.anzan.levels.find(l => l.id === 'warm');
  assert.equal(warm.cleared, true);
  assert.equal(warm.fastest, 650);
  assert.equal(warm.best, 5);
  assert.equal(p.anzan.cleared, 1);
  assert.equal(p.anzan.current.id, 'five1', 'current moves to the first rung not yet carried');
});

test('anzan accuracy and staleness come through', () => {
  const p = profileFrom({
    anzan: { warm: { rounds: [
      { t: '2026-07-18T10:00', ms: 800, ok: true },
      { t: '2026-07-18T10:01', ms: 800, ok: false },
    ], best: 1, fastest: null } },
  });
  const warm = p.anzan.levels.find(l => l.id === 'warm');
  assert.equal(warm.accuracy, 0.5);
  assert.equal(warm.rounds, 2);
  assert.equal(warm.lastDay, '2026-07-18');
  assert.equal(warm.daysSince, 4);
});

test('an anzan round is enough to stop being fresh', () => {
  const p = profileFrom({ anzan: { warm: { rounds: [{ t: `${TODAY}T10:00`, ms: 800, ok: true }], best: 1, fastest: null } } });
  assert.equal(p.fresh, false);
});

// --- vault ------------------------------------------------------------------
const vaultBlob = entries => ({ v: 1, entries });
const stored = (id, label, over = {}) => ({
  id, label, radix: 10, mode: 'full', length: 10, seals: [6], code: '1415926535',
  created: '2026-07-01T10:00', reviews: [], ease: 2.2, interval: 0, due: TODAY, ...over,
});

test('an empty vault reports zeros without throwing', () => {
  const p = profileFrom();
  assert.deepEqual(p.vault, { entries: [], total: 0, due: 0, next: null, digits: 0 });
});

test('the vault block counts what is stored and what is due', () => {
  const p = profileFrom({ vault: vaultBlob([
    stored('v1', 'π to 10'),
    stored('v2', 'padlock', { due: '2026-08-01', interval: 10, mode: 'sealed', code: undefined }),
  ]) });
  assert.equal(p.vault.total, 2);
  assert.equal(p.vault.due, 1);
  assert.equal(p.vault.digits, 20);
  assert.equal(p.vault.next.label, 'π to 10');
});

test('the most OVERDUE entry is the one named next', () => {
  const p = profileFrom({ vault: vaultBlob([
    stored('v1', 'recent', { due: TODAY }),
    stored('v2', 'ancient', { due: '2026-07-12' }),
    stored('v3', 'waiting', { due: '2026-09-01' }),
  ]) });
  assert.equal(p.vault.due, 2);
  assert.equal(p.vault.next.label, 'ancient');
  assert.equal(p.vault.next.daysUntil, -10);
});

test('a vault review counts as work — it stops the profile being fresh', () => {
  const p = profileFrom({ vault: vaultBlob([
    stored('v1', 'x', { reviews: [{ t: TODAY, ok: true, interval: 1 }] }),
  ]) });
  assert.equal(p.fresh, false);
});

test('merely storing a number is not yet work', () => {
  assert.equal(profileFrom({ vault: vaultBlob([stored('v1', 'x')]) }).fresh, true);
});

// --- the kyu exam -----------------------------------------------------------
const attempt = (gradeId, score, passed, day = TODAY, kyu = 10) =>
  ({ t: `${day}T10:00`, gradeId, kyu, score, passed, ms: 300000, sections: [{ kind: 'mitori', score, passed }] });

test('an unsat ladder reports every grade, none held, and 10級 next', () => {
  const p = profileFrom();
  assert.equal(p.exam.grades.length, EXAM_GRADES.length);
  assert.equal(p.exam.passed, 0);
  assert.equal(p.exam.highest, null);
  assert.equal(p.exam.next.id, 'kyu10');
  assert.equal(p.exam.next.needs, 'small-add');
  assert.ok(p.exam.next.minutes > 0, 'the plan needs a minute estimate');
  assert.equal(p.exam.attempts, 0);
});

test('passing walks the ladder on; the held grade is the smallest kyu', () => {
  const p = profileFrom({ exam: { attempts: [
    attempt('kyu10', 100, true, '2026-07-01'),
    attempt('kyu9', 60, false, '2026-07-10', 9),
    attempt('kyu9', 80, true, '2026-07-20', 9),
  ] } });
  assert.equal(p.exam.passed, 2);
  assert.equal(p.exam.highest.id, 'kyu9');
  assert.equal(p.exam.next.id, 'kyu8');
  assert.equal(p.exam.attempts, 3);
});

test('a grade carries its best score and how long since it was last sat', () => {
  const p = profileFrom({ exam: { attempts: [
    attempt('kyu10', 40, false, '2026-07-12'),
    attempt('kyu10', 60, false, '2026-07-20'),
  ] } });
  const g = p.exam.grades.find(x => x.id === 'kyu10');
  assert.equal(g.best, 60);
  assert.equal(g.passed, false);
  assert.equal(g.attempts, 2);
  assert.equal(g.lastDay, '2026-07-20');
  assert.equal(g.daysSince, 2);
});

test('sitting a paper counts as work — it stops the profile being fresh', () => {
  assert.equal(profileFrom({ exam: { attempts: [attempt('kyu10', 20, false)] } }).fresh, false);
});

// --- read-aloud -------------------------------------------------------------
test('the read-aloud ladder reports like the anzan one, off its own log', () => {
  const p = profileFrom({ yomiage: {
    warm: { rounds: [{ t: '2026-07-20T10:00', ms: 2000, ok: true }], best: 5, fastest: 2000 },
    five1: { rounds: [{ t: '2026-07-21T10:00', ms: 1600, ok: false }], best: 0, fastest: null },
  } });
  assert.equal(p.yomiage.total, YOMIAGE_LEVELS.length);
  assert.equal(p.yomiage.cleared, 1);
  assert.equal(p.yomiage.current.id, 'five1', 'the first uncarried rung');
  assert.equal(p.yomiage.rounds, 2);
  const warm = p.yomiage.levels[0];
  assert.equal(warm.fastest, 2000);
  assert.equal(warm.lastMs, 2000);
  assert.equal(warm.daysSince, 2);
  assert.equal(warm.baseMs, YOMIAGE_LEVELS[0].baseGap, 'the rung\'s opening pace, whatever it calls it');
});

test('the two paced ladders do not read each other\'s log', () => {
  const p = profileFrom({ anzan: { warm: { rounds: [{ t: '2026-07-20T10:00', ms: 1600, ok: true }], best: 5, fastest: 1600 } } });
  assert.equal(p.anzan.cleared, 1);
  assert.equal(p.yomiage.cleared, 0);
  assert.equal(p.yomiage.rounds, 0);
});

test('a called round counts as work', () => {
  const p = profileFrom({ yomiage: { warm: { rounds: [{ t: `${TODAY}T10:00`, ms: 2000, ok: false }], best: 0, fastest: null } } });
  assert.equal(p.fresh, false);
});
