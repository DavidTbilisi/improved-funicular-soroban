import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skillsFrom, dueSkills, retentionSummary } from '../src/review/skills.js';
import { buildProfile } from '../src/today/profile.js';
import { TUTORIAL_LEVELS } from '../src/tutorial/levels.js';
import { DRILL_DECKS } from '../src/drill/decks.js';
import { ROD_MODES } from '../src/domain/mulDiv.js';
import { ANZAN_LEVELS } from '../src/anzan/levels.js';
import { YOMIAGE_LEVELS } from '../src/yomiage/levels.js';
import { AnzanLog } from '../src/anzan/anzanLog.js';
import { MemoryProgressStore, TutorialProgress } from '../src/tutorial/progressStore.js';
import { MemoryStatsStore, DrillStatsService } from '../src/drill/statsStore.js';
import { SolveLog } from '../src/tutorial/solveLog.js';
import { FaultLog } from '../src/tutorial/faultLog.js';
import { GameSave } from '../src/game/saveStore.js';
import { DayLog } from '../src/today/dayLog.js';

const TODAY = '2026-07-22';

const profileFrom = ({ tutorial = {}, practice = {}, trainer = {}, drills = {}, anzan = {}, yomiage = {}, today = TODAY } = {}) =>
  buildProfile({
    levels: TUTORIAL_LEVELS, decks: DRILL_DECKS, modes: ROD_MODES,
    anzanRungs: ANZAN_LEVELS, yomiageRungs: YOMIAGE_LEVELS,
    progress: new TutorialProgress(new MemoryProgressStore(tutorial)),
    practiceLog: new SolveLog(new MemoryProgressStore(practice)),
    trainerLog: new SolveLog(new MemoryProgressStore(trainer)),
    stats: new DrillStatsService(new MemoryStatsStore(drills)),
    faults: new FaultLog(new MemoryProgressStore({})),
    save: new GameSave(new MemoryProgressStore({})),
    dayLog: new DayLog(new MemoryProgressStore({})),
    anzanLog: new AnzanLog(new MemoryProgressStore(anzan)),
    yomiageLog: new AnzanLog(new MemoryProgressStore(yomiage)),
    today,
  });

// n solves, one per day, ending `endedDaysAgo` before TODAY.
const solvesOn = (days, { clean = true, ms = 2000 } = {}) =>
  days.map(d => ({ t: `${d}T10:00`, ms, clean, support: 0 }));
const sessionsOn = (days, floorPct = 90) =>
  days.map(d => ({ t: `${d}T10:00`, n: 20, acc: 95, meanMs: 1200, floorPct }));
const roundsOn = (days, ok = true) => days.map(d => ({ t: `${d}T10:00`, ms: 1000, ok }));

test('an untouched profile has nothing to schedule', () => {
  const p = profileFrom();
  assert.deepEqual(skillsFrom(p), []);
  assert.deepEqual(dueSkills(p), []);
  const sum = retentionSummary(p);
  assert.equal(sum.total, 0);
  assert.equal(sum.worst, null);
  assert.equal(sum.mean, null);
  assert.equal(skillsFrom(null).length, 0);
});

test('only things actually practised are listed', () => {
  const p = profileFrom({
    tutorial: { v: 2, unlocked: 4, best: { read: 6 } },
    practice: { read: { solves: solvesOn(['2026-07-20']) } },
  });
  const rows = skillsFrom(p);
  assert.equal(rows.length, 1, 'the other unlocked levels have no reps to model');
  assert.equal(rows[0].targetId, 'read');
  assert.equal(rows[0].page, 'practice');
  assert.equal(rows[0].id, 'practice:read');
});

test('all five tracks flatten into one comparable list', () => {
  const p = profileFrom({
    tutorial: { v: 2, unlocked: 4, best: { read: 6 } },
    practice: { read: { solves: solvesOn(['2026-07-20']) } },
    drills: { faceToDigit: { sessions: sessionsOn(['2026-07-19']) } },
    trainer: { [ROD_MODES[0].id]: { solves: solvesOn(['2026-07-18']), best: 3 } },
    anzan: { warm: { rounds: roundsOn(['2026-07-17']), best: 2, fastest: null } },
    yomiage: { warm: { rounds: roundsOn(['2026-07-16']), best: 2, fastest: null } },
  });
  const kinds = skillsFrom(p).map(r => r.kind).sort();
  assert.deepEqual(kinds, ['anzan', 'drill', 'practice', 'trainer', 'yomiage']);
  for (const r of skillsFrom(p)) {
    assert.ok(r.retention > 0 && r.retention <= 1, r.id);
    assert.ok(r.title && r.text, r.id);
  }
});

test('the vault and the exam are not in here, on purpose', () => {
  const p = profileFrom({
    tutorial: { v: 2, unlocked: 4, best: { read: 6 } },
    practice: { read: { solves: solvesOn(['2026-07-20']) } },
  });
  const pages = new Set(skillsFrom(p).map(r => r.page));
  assert.ok(!pages.has('vault'), 'the vault schedules its own content');
  assert.ok(!pages.has('exam'), 'a passed grade does not decay into an unpassed one');
});

test('spacing beats volume — same rep count, different days', () => {
  const crammed = profileFrom({
    tutorial: { v: 2, unlocked: 4, best: { read: 6 } },
    practice: { read: { solves: solvesOn(Array(6).fill('2026-07-15')) } },
  });
  const spread = profileFrom({
    tutorial: { v: 2, unlocked: 4, best: { read: 6 } },
    practice: { read: { solves: solvesOn(['2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15']) } },
  });
  const a = skillsFrom(crammed)[0], b = skillsFrom(spread)[0];
  assert.equal(a.activeDays, 1);
  assert.equal(b.activeDays, 6);
  assert.equal(a.daysSince, b.daysSince, 'both stopped on the same day');
  assert.ok(b.retention > a.retention, 'the spread learner still has it; the crammer does not');
  assert.equal(a.due, true);
  assert.equal(b.due, false);
});

test('a fumbled track decays faster than a clean one with the same history', () => {
  const days = ['2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16'];
  const clean = profileFrom({
    tutorial: { v: 2, unlocked: 4, best: { read: 6 } },
    practice: { read: { solves: solvesOn(days, { clean: true }) } },
  });
  const messy = profileFrom({
    tutorial: { v: 2, unlocked: 4, best: { read: 6 } },
    practice: { read: { solves: solvesOn(days, { clean: false }) } },
  });
  assert.ok(skillsFrom(clean)[0].retention > skillsFrom(messy)[0].retention);
});

test('the list is ordered most-faded first', () => {
  const p = profileFrom({
    tutorial: { v: 2, unlocked: 4, best: { read: 6, direct: 8 } },
    practice: {
      read: { solves: solvesOn(['2026-07-21']) },
      direct: { solves: solvesOn(['2026-07-01']) },
    },
  });
  const rows = skillsFrom(p);
  assert.equal(rows[0].targetId, 'direct', 'the one left longest');
  assert.ok(rows[0].retention <= rows[1].retention);
});

test('dueSkills is the tail that has actually fallen through the mark', () => {
  const p = profileFrom({
    tutorial: { v: 2, unlocked: 4, best: { read: 6, direct: 8 } },
    practice: {
      read: { solves: solvesOn([TODAY]) },              // practised today
      direct: { solves: solvesOn(['2026-06-01']) },     // seven weeks ago
    },
  });
  const due = dueSkills(p);
  assert.equal(due.length, 1);
  assert.equal(due[0].targetId, 'direct');
  assert.ok(due[0].overdue > 0);
  assert.match(due[0].text, /overdue/);
});

test('the summary counts the bands and averages what is held', () => {
  const p = profileFrom({
    tutorial: { v: 2, unlocked: 4, best: { read: 6, direct: 8 } },
    practice: {
      read: { solves: solvesOn([TODAY]) },
      direct: { solves: solvesOn(['2026-05-01']) },
    },
  });
  const s = retentionSummary(p);
  assert.equal(s.total, 2);
  assert.equal(s.bands.fresh, 1);
  assert.equal(s.bands.cold, 1);
  assert.equal(s.due, 1);
  assert.equal(s.worst.targetId, 'direct');
  assert.ok(s.mean > 0 && s.mean < 100);
});

test('nothing here reads or writes storage — it is a function of the profile', () => {
  const p = profileFrom({
    tutorial: { v: 2, unlocked: 4, best: { read: 6 } },
    practice: { read: { solves: solvesOn(['2026-07-20']) } },
  });
  const before = JSON.stringify(p);
  skillsFrom(p); dueSkills(p); retentionSummary(p);
  assert.equal(JSON.stringify(p), before, 'the profile was not touched');
});
