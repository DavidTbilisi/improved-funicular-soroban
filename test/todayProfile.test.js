import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile } from '../src/today/profile.js';
import { TUTORIAL_LEVELS } from '../src/tutorial/levels.js';
import { DRILL_DECKS } from '../src/drill/decks.js';
import { ROD_MODES } from '../src/domain/mulDiv.js';
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
  village = {}, days = {}, support = 0, today = TODAY,
} = {}) {
  return buildProfile({
    levels: TUTORIAL_LEVELS, decks: DRILL_DECKS, modes: ROD_MODES,
    progress: new TutorialProgress(new MemoryProgressStore(tutorial)),
    practiceLog: new SolveLog(new MemoryProgressStore(practice)),
    trainerLog: new SolveLog(new MemoryProgressStore(trainer)),
    stats: new DrillStatsService(new MemoryStatsStore(drills)),
    faults: new FaultLog(new MemoryProgressStore(faults)),
    save: new GameSave(new MemoryProgressStore(village)),
    dayLog: new DayLog(new MemoryProgressStore(days)),
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
