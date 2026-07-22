import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todaysPlan, TASK_RULES } from '../src/today/plan.js';
import { targetFromSearch, PAGE_HREF } from '../src/today/deepLink.js';
import { buildProfile } from '../src/today/profile.js';
import { TUTORIAL_LEVELS } from '../src/tutorial/levels.js';
import { DRILL_DECKS } from '../src/drill/decks.js';
import { ROD_MODES } from '../src/domain/mulDiv.js';
import { ANZAN_LEVELS } from '../src/anzan/levels.js';
import { suggestRung } from '../src/anzan/bridge.js';
import { AnzanLog } from '../src/anzan/anzanLog.js';
import { YOMIAGE_LEVELS } from '../src/yomiage/levels.js';
import { Vault } from '../src/vault/vaultStore.js';
import { EXAM_GRADES } from '../src/exam/grades.js';
import { ExamLog } from '../src/exam/examLog.js';
import { MemoryProgressStore, TutorialProgress } from '../src/tutorial/progressStore.js';
import { MemoryStatsStore, DrillStatsService } from '../src/drill/statsStore.js';
import { SolveLog } from '../src/tutorial/solveLog.js';
import { FaultLog } from '../src/tutorial/faultLog.js';
import { GameSave } from '../src/game/saveStore.js';
import { DayLog } from '../src/today/dayLog.js';

const TODAY = '2026-07-22';

function profileFrom({
  tutorial = {}, practice = {}, trainer = {}, drills = {}, faults = {},
  village = {}, days = {}, anzan = {}, yomiage = {}, vault = {}, exam = {}, support = 0, today = TODAY,
} = {}) {
  return buildProfile({
    levels: TUTORIAL_LEVELS, decks: DRILL_DECKS, modes: ROD_MODES, anzanRungs: ANZAN_LEVELS,
    yomiageRungs: YOMIAGE_LEVELS, examGrades: EXAM_GRADES,
    examLog: new ExamLog(new MemoryProgressStore(exam)),
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

const solves = (n, { clean = true, ms = 2000, day = TODAY } = {}) =>
  Array.from({ length: n }, () => ({ t: `${day}T10:00`, ms, clean, support: 0 }));
const sessions = (pcts, day = TODAY) =>
  pcts.map(floorPct => ({ t: `${day}T10:00`, n: 20, acc: 95, meanMs: 1200, floorPct }));

// A learner mid-ladder with real history, used as the base for the targeted cases.
const midLadder = (over = {}) => profileFrom({
  tutorial: { v: 2, unlocked: 6, best: { read: 6, direct: 8, 'small-add': 8, 'small-sub': 8, 'big-add': 3 } },
  practice: {
    read: { solves: solves(6, { day: '2026-07-10' }) },
    direct: { solves: solves(8, { day: '2026-07-12' }) },
    'small-add': { solves: solves(8, { day: '2026-07-14' }) },
    'small-sub': { solves: solves(8, { day: '2026-07-16' }) },
    // A 3/8 streak means fumbles happened: 2 of the 5 solves were not clean.
    'big-add': { solves: [...solves(2, { day: '2026-07-20', clean: false }), ...solves(3, { day: '2026-07-20' })] },
  },
  drills: { faceToDigit: { sessions: sessions([70, 80], '2026-07-20') } },
  village: { v: 1, sp: 80, day: 12, grid: [{ id: 'hut', level: 1 }], stats: { solves: 12, clean: 6, spEarned: 140, bestStreak: 3, festivals: 0, founded: false } },
  days: { v: 1, seeded: true, days: ['2026-07-20', '2026-07-21'] },
  ...over,
});

// --- first run --------------------------------------------------------------
test('a fresh learner is handed the intended first session, in order', () => {
  const plan = todaysPlan(profileFrom());
  assert.deepEqual(plan.tasks.map(t => t.rule), ['first-level', 'first-deck', 'first-contract']);
  assert.equal(plan.tasks[0].targetId, 'read');
  assert.equal(plan.tasks[0].href, 'practice.html?level=read');
  assert.equal(plan.tasks[2].page, 'game');
  assert.equal(plan.date, TODAY);
});

// --- the fumble pattern outranks the ladder ---------------------------------
test('a heavy fumble pair pulls the matching level to the front', () => {
  const plan = todaysPlan(midLadder({ faults: { pairs: { 'big:3-7': 9, 'small:1-4': 2 }, resets: 0 } }));
  const first = plan.tasks[0];
  assert.equal(first.rule, 'weak-pair');
  assert.equal(first.targetId, 'big-add');
  assert.match(first.why, /3 ↔ 7/);
  assert.match(first.why, /9 fumbles/);
});

test('once the add side is cleared the same pair points at the subtract side', () => {
  const p = midLadder({
    tutorial: { v: 2, unlocked: 7, best: { read: 6, direct: 8, 'small-add': 8, 'small-sub': 8, 'big-add': 8, 'big-sub': 2 } },
    faults: { pairs: { 'big:3-7': 9 }, resets: 0 },
  });
  const first = todaysPlan(p).tasks[0];
  assert.equal(first.rule, 'weak-pair');
  assert.equal(first.targetId, 'big-sub');
});

test('a fumble count below the noise floor does not trigger the rule', () => {
  const plan = todaysPlan(midLadder({ faults: { pairs: { 'big:3-7': 2 }, resets: 0 } }));
  assert.ok(!plan.tasks.some(t => t.rule === 'weak-pair'));
});

test('a locked level is never proposed, even when its pair is fumbled hardest', () => {
  const p = profileFrom({
    tutorial: { v: 2, unlocked: 2, best: { read: 6, direct: 3 } },
    practice: { read: { solves: solves(6) }, direct: { solves: solves(3) } },
    faults: { pairs: { 'big:3-7': 20 }, resets: 0 },
  });
  const plan = todaysPlan(p);
  for (const t of plan.tasks.filter(x => x.page === 'practice')) {
    const lvl = p.practice.levels.find(l => l.id === t.targetId);
    assert.equal(lvl.unlocked, true, `${t.targetId} must be unlocked`);
  }
});

// --- the ladder's own level -------------------------------------------------
test('with no fumble pattern the plan leads with the level in progress', () => {
  const first = todaysPlan(midLadder()).tasks[0];
  assert.equal(first.rule, 'unfinished-level');
  assert.equal(first.targetId, 'big-add');
  assert.equal(first.why, '3/8 clean');
});

// --- decks ------------------------------------------------------------------
test('a deck with facts under the floor is queued with its due count', () => {
  const plan = todaysPlan(midLadder({
    drills: {
      fingerTimes: {
        sessions: sessions([60], '2026-07-21'),
        facts: { '7x8': { n: 10, miss: 5, sumMs: 30000, floorPass: 3 },
                 '6x9': { n: 10, miss: 4, sumMs: 30000, floorPass: 4 } },
      },
    },
  }));
  const drill = plan.tasks.find(t => t.page === 'drills');
  assert.equal(drill.rule, 'due-deck');
  assert.equal(drill.why, '2 due');
  assert.equal(drill.targetId, 'fingerTimes');
});

test('a cold deck with no due facts is queued on staleness instead', () => {
  const plan = todaysPlan(midLadder({
    drills: { faceToDigit: { sessions: sessions([95], '2026-07-15') } },
  }));
  const drill = plan.tasks.find(t => t.page === 'drills');
  assert.equal(drill.rule, 'due-deck');
  assert.equal(drill.why, '7 days cold');
});

// --- mental track -----------------------------------------------------------
test('a ready prognosis proposes fading the beads', () => {
  // 12 clean solves comfortably under the 4500 ms floor at Beads → ready.
  const p = profileFrom({
    tutorial: { v: 2, unlocked: 6, best: { read: 6, direct: 8, 'small-add': 8, 'small-sub': 8, 'big-add': 8 } },
    practice: { 'big-sub': { solves: solves(12, { ms: 1500 }) } },
    support: 0,
  });
  assert.equal(p.mental.prognosis.ready, true, 'fixture must actually be ready');
  const t = todaysPlan(p).tasks.find(x => x.rule === 'mental-step');
  assert.ok(t, 'the mental rung is offered');
  assert.match(t.why, /drop to Percept/);
});

test('one clean solve does not propose fading — readiness needs enough data', () => {
  const p = profileFrom({
    tutorial: { v: 2, unlocked: 6, best: { read: 6, direct: 8, 'small-add': 8, 'small-sub': 8, 'big-add': 8 } },
    practice: { 'big-sub': { solves: solves(1, { ms: 1500 }) } },
  });
  assert.equal(p.mental.prognosis.ready, true, 'prognose() reports bare readiness even at n=1');
  assert.equal(p.mental.prognosis.enoughData, false);
  assert.ok(!todaysPlan(p).tasks.some(t => t.rule === 'mental-step'), 'but the plan must not act on it');
});

// --- trainer + village ------------------------------------------------------
test('the rod trainer and the village fill out a cleared-ladder plan', () => {
  const cleared = {};
  TUTORIAL_LEVELS.forEach(l => { cleared[l.id] = l.floor; });
  const p = profileFrom({
    tutorial: { v: 2, unlocked: TUTORIAL_LEVELS.length, best: cleared },
    practice: Object.fromEntries(TUTORIAL_LEVELS.map(l => [l.id, { solves: solves(l.floor, { day: '2026-07-21' }) }])),
    drills: Object.fromEntries(Object.keys(DRILL_DECKS).map(id => [id, { sessions: sessions([95], '2026-07-21') }])),
  });
  // Room for six: a learner with the whole ladder cleared also has an unsat kyu
  // paper, an anzan rung and a read-aloud rung waiting, and all three outrank
  // these two.
  const plan = todaysPlan(p, { max: 6, budgetMin: 60 });
  const rules = plan.tasks.map(t => t.rule);
  assert.ok(rules.includes('trainer-mode'), `expected a trainer task, got ${rules}`);
  assert.ok(rules.includes('village'), `expected a village task, got ${rules}`);
});

test('keep-warm catches the coldest thing when everything is cleared', () => {
  const cleared = {};
  TUTORIAL_LEVELS.forEach(l => { cleared[l.id] = l.floor; });
  const trainerBlob = Object.fromEntries(ROD_MODES.map(m => [m.id, { solves: solves(3, { day: '2026-07-21' }), best: m.floor ?? 3 }]));
  // Solves are clean but SLOW (20 s, over every level's floor), so readiness
  // stays below the drop line and the mental rung doesn't claim the practice slot.
  const p = profileFrom({
    tutorial: { v: 2, unlocked: TUTORIAL_LEVELS.length, best: cleared },
    practice: {
      ...Object.fromEntries(TUTORIAL_LEVELS.map(l => [l.id, { solves: solves(l.floor, { day: '2026-07-21', ms: 20000 }) }])),
      read: { solves: solves(6, { day: '2026-05-01', ms: 20000 }) }, // the cold one
    },
    trainer: trainerBlob,
    drills: Object.fromEntries(Object.keys(DRILL_DECKS).map(id => [id, { sessions: sessions([95], '2026-07-21') }])),
  });
  const t = todaysPlan(p, { max: 4, budgetMin: 60 }).tasks.find(x => x.rule === 'keep-warm');
  assert.ok(t, 'the coldest target is offered');
  assert.equal(t.targetId, 'read');
});

// --- session shape ----------------------------------------------------------
test('the plan never exceeds max, and never repeats a page', () => {
  for (const p of [profileFrom(), midLadder(), midLadder({ faults: { pairs: { 'big:3-7': 9 }, resets: 1 } })]) {
    const plan = todaysPlan(p);
    assert.ok(plan.tasks.length <= 3);
    const pages = plan.tasks.map(t => t.page);
    assert.equal(new Set(pages).size, pages.length, `pages repeat: ${pages}`);
  }
});

test('the plan is never empty, even under an absurd budget', () => {
  const plan = todaysPlan(midLadder(), { budgetMin: 0 });
  assert.equal(plan.tasks.length, 1, 'the first task is always taken');
  assert.ok(plan.totalMin > 0);
});

test('the budget is respected once the first task is in', () => {
  const plan = todaysPlan(midLadder(), { max: 3, budgetMin: 10 });
  const [first, ...rest] = plan.tasks;
  const tail = rest.reduce((n, t) => n + t.minutes, 0);
  assert.ok(first.minutes + tail <= 10 || plan.tasks.length === 1);
});

test('a larger budget admits more of the ladder', () => {
  const small = todaysPlan(midLadder(), { max: 3, budgetMin: 4 });
  const large = todaysPlan(midLadder(), { max: 3, budgetMin: 60 });
  assert.ok(large.tasks.length >= small.tasks.length);
});

test('every task carries a positive minute estimate and a reason', () => {
  for (const t of todaysPlan(midLadder(), { max: 3, budgetMin: 60 }).tasks) {
    assert.ok(t.minutes >= 1, `${t.rule} has no time estimate`);
    assert.ok(t.why && t.why.length, `${t.rule} has no reason`);
    assert.ok(t.title && t.title.length, `${t.rule} has no title`);
  }
});

test('work already done today comes back auto-ticked', () => {
  const p = midLadder({
    practice: {
      read: { solves: solves(6, { day: '2026-07-10' }) },
      direct: { solves: solves(8, { day: '2026-07-12' }) },
      'small-add': { solves: solves(8, { day: '2026-07-14' }) },
      'small-sub': { solves: solves(8, { day: '2026-07-16' }) },
      'big-add': { solves: solves(5, { day: TODAY }) },  // worked today
    },
  });
  const t = todaysPlan(p).tasks.find(x => x.targetId === 'big-add');
  assert.equal(t.autoDone, true);
});

test('a task not touched today is not auto-ticked', () => {
  const t = todaysPlan(midLadder()).tasks.find(x => x.targetId === 'big-add');
  assert.equal(t.autoDone, false);
});

// --- messages ---------------------------------------------------------------
test('the message names an unfed streak, so the page has something to say', () => {
  assert.match(todaysPlan(midLadder()).message, /2-day streak alive/);
});

test('the message changes once today has been practised', () => {
  const p = midLadder({ days: { v: 1, seeded: true, days: ['2026-07-21', TODAY] } });
  assert.match(todaysPlan(p).message, /Already practised today/);
});

test('with no streak at all the message invites starting one', () => {
  assert.match(todaysPlan(profileFrom()).message, /streak starts today/);
});

// --- the deep-link contract: the whole feature rests on these resolving ------
test('every task a rule can emit deep-links to a real target', () => {
  const profiles = [
    profileFrom(),
    midLadder(),
    midLadder({ faults: { pairs: { 'big:3-7': 9, 'small:2-3': 5 }, resets: 2 } }),
    midLadder({ drills: { fingerTimes: { sessions: sessions([50], '2026-07-10'), facts: { '7x8': { n: 8, miss: 5, sumMs: 20000, floorPass: 2 } } } } }),
    midLadder({ support: 2 }),   // so the anzan rung actually fires here too
  ];
  const seen = new Set();
  for (const p of profiles) {
    for (const t of todaysPlan(p, { max: 9, budgetMin: 999 }).tasks) {
      seen.add(t.rule);
      assert.ok(PAGE_HREF[t.page], `unknown page ${t.page}`);
      if (!t.targetId) continue;
      // The id must exist where the target page will look it up...
      if (t.page === 'practice') assert.ok(TUTORIAL_LEVELS.some(l => l.id === t.targetId), t.targetId);
      if (t.page === 'drills') assert.ok(DRILL_DECKS[t.targetId], t.targetId);
      if (t.page === 'trainer') assert.ok(ROD_MODES.some(m => m.id === t.targetId), t.targetId);
      if (t.page === 'anzan') assert.ok(ANZAN_LEVELS.some(l => l.id === t.targetId), t.targetId);
      if (t.page === 'exam') assert.ok(EXAM_GRADES.some(g => g.id === t.targetId), t.targetId);
      if (t.page === 'yomiage') assert.ok(YOMIAGE_LEVELS.some(l => l.id === t.targetId), t.targetId);
      // ...and the href must round-trip back through the reader the page uses.
      const search = new URL(t.href, 'http://x/').search;
      assert.equal(targetFromSearch(search, t.page), t.targetId, t.href);
    }
  }
  assert.ok(seen.size >= 5, `expected several rules to fire across the fixtures, saw ${[...seen]}`);
});

test('a rule that throws is skipped rather than breaking the page', () => {
  const broken = { ...midLadder() };
  Object.defineProperty(broken, 'faults', { get() { throw new Error('boom'); } });
  const plan = todaysPlan(broken);
  assert.ok(plan.tasks.length > 0, 'the other rules still produced a plan');
});

test('the exported ladder is frozen and every rung is buildable', () => {
  assert.ok(Object.isFrozen(TASK_RULES));
  for (const r of TASK_RULES) {
    assert.equal(typeof r.build, 'function');
    assert.ok(r.id);
  }
});

// --- flash anzan ------------------------------------------------------------
// The gate exists so the plan never offers the exam before the course.
test('anzan is NOT offered to a learner still working on the beads', () => {
  const p = midLadder();                       // support 0, no anzan history
  assert.equal(p.mental.support, 0);
  assert.equal(p.anzan.rounds, 0);
  assert.ok(!todaysPlan(p, { max: 9, budgetMin: 999 }).tasks.some(t => t.page === 'anzan'));
});

test('fading the board past Beads unlocks the anzan rung', () => {
  const p = midLadder({ support: 1 });
  const t = todaysPlan(p, { max: 9, budgetMin: 999 }).tasks.find(x => x.page === 'anzan');
  assert.ok(t, 'once the board is fading, anzan is on the table');
  // The rung follows the LEVEL in hand, not the bottom of the ladder: midLadder
  // is working big-add, which LEVEL_RUNG maps to the 5 × 1-digit rung.
  assert.equal(p.practice.current.id, 'big-add');
  assert.equal(t.targetId, 'five1');
  assert.equal(t.href, 'anzan.html?level=five1');
  assert.equal(t.why, 'mental, under time');
});

// The plan and the practice page must never name different rungs.
test('the plan agrees with the prognosis bridge about which rung', () => {
  for (const over of [{}, { support: 2 }, { anzan: { five1: { rounds: [{ t: '2026-07-20T10:00', ms: 800, ok: true }], best: 5, fastest: 800 } } }]) {
    const p = midLadder({ support: 2, ...over });
    const t = todaysPlan(p, { max: 9, budgetMin: 999 }).tasks.find(x => x.page === 'anzan');
    const bridge = suggestRung({
      levelId: p.practice.current ? p.practice.current.id : null,
      support: p.mental.support, prognosis: p.mental.prognosis, rungs: p.anzan.levels,
    });
    assert.ok(t && bridge);
    assert.equal(t.targetId, bridge.id, JSON.stringify(over));
  }
});

test('anzan history alone qualifies — someone already doing it keeps being offered it', () => {
  // Deliberately at Beads: the plan's gate is looser than the practice page's,
  // so someone who has put the board back up still gets their rung.
  const p = midLadder({ anzan: { five1: { rounds: [{ t: '2026-07-20T10:00', ms: 1300, ok: true }], best: 1, fastest: null } } });
  assert.equal(p.mental.support, 0);
  assert.equal(suggestRung({ levelId: 'big-add', support: 0, prognosis: p.mental.prognosis, rungs: p.anzan.levels }), null,
    'the practice page would show nothing here');
  const t = todaysPlan(p, { max: 9, budgetMin: 999 }).tasks.find(x => x.page === 'anzan');
  assert.ok(t, 'but the plan still offers it');
  assert.match(t.why, /100% at 1300 ms/, 'and it quotes the pace actually run, not the rung default');
});

test('a carried rung is reported by the pace it was carried at', () => {
  const p = midLadder({
    support: 2,
    anzan: {
      five1: { rounds: [{ t: '2026-07-20T10:00', ms: 650, ok: true }], best: 5, fastest: 650 },
    },
  });
  const t = todaysPlan(p, { max: 9, budgetMin: 999 }).tasks.find(x => x.page === 'anzan');
  assert.equal(t.targetId, 'ten1', 'it moves on to the next uncarried rung');
  assert.equal(t.why, 'mental, under time');

  // ...and a rung carried but still current reports its record.
  const all = {};
  for (const l of ANZAN_LEVELS) all[l.id] = { rounds: [{ t: '2026-07-20T10:00', ms: 500, ok: true }], best: l.floor, fastest: 500 };
  const done = midLadder({ support: 2, anzan: all });
  const t2 = todaysPlan(done, { max: 9, budgetMin: 999 }).tasks.find(x => x.page === 'anzan');
  assert.match(t2.why, /cleared at 500 ms — push it/);
});

test('the anzan reason quotes the pace last run, not the rung default', () => {
  const p = midLadder({
    support: 1,
    // Run at 500 ms, well off the rung's 1600 ms default.
    anzan: { five1: { rounds: [{ t: '2026-07-20T10:00', ms: 500, ok: false }], best: 0, fastest: null } },
  });
  const t = todaysPlan(p, { max: 9, budgetMin: 999 }).tasks.find(x => x.page === 'anzan');
  assert.equal(t.why, '0% at 500 ms');
});

test('an anzan round today auto-ticks its task', () => {
  const p = midLadder({
    support: 1,
    anzan: { five1: { rounds: [{ t: `${TODAY}T10:00`, ms: 1300, ok: true }], best: 1, fastest: null } },
  });
  const t = todaysPlan(p, { max: 9, budgetMin: 999 }).tasks.find(x => x.page === 'anzan');
  assert.equal(t.autoDone, true);
});

// --- vault ------------------------------------------------------------------
const vaultOf = entries => ({ v: 1, entries });
const storedEntry = (id, label, over = {}) => ({
  id, label, radix: 10, mode: 'full', length: 10, seals: [6], code: '1415926535',
  created: '2026-07-01T10:00', reviews: [], ease: 2.2, interval: 0, due: TODAY, ...over,
});

test('nothing due means no vault task', () => {
  const p = midLadder({ vault: vaultOf([storedEntry('v1', 'x', { due: '2026-09-01' })]) });
  assert.ok(!todaysPlan(p, { max: 9, budgetMin: 999 }).tasks.some(t => t.page === 'vault'));
});

// Skills wait; memories decay. That is why this outranks the skill rungs.
test('a due number outranks even the first-run onboarding', () => {
  const p = profileFrom({ vault: vaultOf([storedEntry('v1', 'π to 10')]) });
  assert.equal(p.fresh, true, 'storing is not yet work, so this IS a first run');
  const plan = todaysPlan(p);
  assert.equal(plan.tasks[0].rule, 'vault-due');
  assert.ok(plan.tasks.some(t => t.rule === 'first-level'), 'and the ladder still gets a slot');
});

test('a due number leads the plan, ahead of the fumble pattern', () => {
  const p = midLadder({
    faults: { pairs: { 'big:3-7': 9 }, resets: 0 },
    vault: vaultOf([storedEntry('v1', 'π to 10')]),
  });
  const plan = todaysPlan(p);
  assert.equal(plan.tasks[0].page, 'vault');
  assert.equal(plan.tasks[0].rule, 'vault-due');
  assert.match(plan.tasks[0].why, /due today — π to 10/);
  assert.ok(plan.tasks.some(t => t.rule === 'weak-pair'), 'the fumble rung still gets its slot');
});

test('an overdue number says how late it is', () => {
  const p = midLadder({ vault: vaultOf([storedEntry('v1', 'padlock', { due: '2026-07-15' })]) });
  const t = todaysPlan(p).tasks[0];
  assert.match(t.why, /7d overdue — padlock/);
});

test('several due numbers are counted, and the oldest named', () => {
  const p = midLadder({ vault: vaultOf([
    storedEntry('v1', 'a', { due: TODAY }),
    storedEntry('v2', 'b', { due: '2026-07-18' }),
    storedEntry('v3', 'c', { due: TODAY }),
  ]) });
  const t = todaysPlan(p).tasks[0];
  assert.equal(t.title, 'Recall 3 stored numbers');
  assert.match(t.why, /3 due, oldest 4d overdue/);
});

test('the vault task deep-links to the page and costs real minutes', () => {
  const p = midLadder({ vault: vaultOf([storedEntry('v1', 'x')]) });
  const t = todaysPlan(p).tasks[0];
  assert.equal(t.href, 'vault.html');
  assert.ok(t.minutes >= 1);
});

// --- the kyu exam -----------------------------------------------------------
test('no paper is offered until the level the grade leans on is cleared', () => {
  // 10級 needs 'small-add'; this learner is still on 'direct'.
  const p = profileFrom({
    tutorial: { v: 2, unlocked: 3, best: { read: 6, direct: 4 } },
    practice: { read: { solves: solves(6, { day: '2026-07-20' }) }, direct: { solves: solves(4, { day: '2026-07-21' }) } },
  });
  assert.equal(p.exam.next.id, 'kyu10');
  assert.ok(!todaysPlan(p, { max: 6, budgetMin: 99 }).tasks.some(t => t.page === 'exam'));
});

test('clearing that level puts the paper in the plan, with the reason', () => {
  const t = todaysPlan(midLadder(), { max: 6, budgetMin: 99 }).tasks.find(x => x.page === 'exam');
  assert.ok(t, 'the paper is offered');
  assert.equal(t.rule, 'exam');
  assert.equal(t.targetId, 'kyu10');
  assert.equal(t.href, 'exam.html?grade=kyu10');
  assert.match(t.why, /Small friend \+ is clear/);
  assert.ok(t.minutes >= 2);
});

test('practice owing beats the paper — it is a checkpoint, not the work', () => {
  const rules = todaysPlan(midLadder(), { max: 6, budgetMin: 99 }).tasks.map(t => t.rule);
  assert.ok(rules.indexOf('unfinished-level') < rules.indexOf('exam'), rules.join(','));
});

test('a passed grade is never offered again — the next one is', () => {
  const passed = { attempts: [{ t: '2026-07-01T10:00', gradeId: 'kyu10', kyu: 10, score: 100, passed: true, ms: 1, sections: [] }] };
  const p = midLadder({ exam: passed });
  assert.equal(p.exam.highest.id, 'kyu10');
  assert.equal(p.exam.next.id, 'kyu9');
  // 9級 needs 'big-add', which this learner has not cleared, so nothing is offered.
  assert.ok(!todaysPlan(p, { max: 6, budgetMin: 99 }).tasks.some(t => t.page === 'exam'));
});

test('a failed paper rests for a couple of days before it is offered again', () => {
  const failed = day => ({ attempts: [{ t: `${day}T10:00`, gradeId: 'kyu10', kyu: 10, score: 60, passed: false, ms: 1, sections: [] }] });
  const offered = day => todaysPlan(midLadder({ exam: failed(day) }), { max: 6, budgetMin: 99 })
    .tasks.some(t => t.page === 'exam');
  assert.equal(offered('2026-07-21'), false, 'not the next day');
  assert.equal(offered('2026-07-19'), true, 'but after the cooldown');
  const t = todaysPlan(midLadder({ exam: failed('2026-07-19') }), { max: 6, budgetMin: 99 }).tasks.find(x => x.page === 'exam');
  assert.match(t.why, /retake — best 60\/100/);
});

test('a paper sat today comes back auto-ticked rather than quietly vanishing', () => {
  const sat = { attempts: [{ t: `${TODAY}T10:00`, gradeId: 'kyu10', kyu: 10, score: 40, passed: false, ms: 1, sections: [] }] };
  const t = todaysPlan(midLadder({ exam: sat }), { max: 6, budgetMin: 99 }).tasks.find(x => x.page === 'exam');
  assert.ok(t, 'still on the plan');
  assert.equal(t.autoDone, true);
});

// --- read-aloud -------------------------------------------------------------
test('read-aloud is not offered before the carry is in hand', () => {
  // "minus sixty-three" has to land as a borrow; big-add is not cleared here.
  const rules = todaysPlan(midLadder(), { max: 9, budgetMin: 999 }).tasks.map(t => t.rule);
  assert.ok(!rules.includes('yomiage'), rules.join(','));
});

const canCarry = (over = {}) => midLadder({
  tutorial: { v: 2, unlocked: 7, best: { read: 6, direct: 8, 'small-add': 8, 'small-sub': 8, 'big-add': 8, 'big-sub': 4 } },
  ...over,
});

test('clearing the carry opens it, and it deep-links to the first rung', () => {
  const t = todaysPlan(canCarry(), { max: 9, budgetMin: 999 }).tasks.find(x => x.page === 'yomiage');
  assert.ok(t, 'offered');
  assert.equal(t.rule, 'yomiage');
  assert.equal(t.targetId, YOMIAGE_LEVELS[0].id);
  assert.equal(t.href, `yomiage.html?level=${YOMIAGE_LEVELS[0].id}`);
  assert.equal(t.why, 'called aloud, straight to the rods');
  assert.ok(t.minutes > 0);
});

test('it needs no mental stage — the board does the remembering', () => {
  const p = canCarry();
  assert.equal(p.mental.support, 0, 'still on the beads');
  assert.ok(todaysPlan(p, { max: 9, budgetMin: 999 }).tasks.some(t => t.page === 'yomiage'));
});

test('rounds already run qualify on their own, and the reason quotes the gap', () => {
  const rounds = { warm: { rounds: [{ t: '2026-07-20T10:00', ms: 1600, ok: true }, { t: '2026-07-20T10:01', ms: 1600, ok: false }], best: 1, fastest: null } };
  const t = todaysPlan(midLadder({ yomiage: rounds }), { max: 9, budgetMin: 999 }).tasks.find(x => x.page === 'yomiage');
  assert.ok(t, 'someone already doing it keeps being offered it');
  assert.match(t.why, /50% at a 1600 ms gap/);
});

test('a carried rung is reported by the pace it was carried at', () => {
  const carried = { warm: { rounds: [{ t: '2026-07-20T10:00', ms: 800, ok: true }], best: 5, fastest: 800 } };
  const t = todaysPlan(canCarry({ yomiage: carried }), { max: 9, budgetMin: 999 }).tasks.find(x => x.page === 'yomiage');
  assert.equal(t.targetId, YOMIAGE_LEVELS[1].id, 'a cleared rung moves the ladder on');
  assert.equal(t.why, 'called aloud, straight to the rods');
});

test('a rung called today comes back auto-ticked', () => {
  const todayRound = { warm: { rounds: [{ t: `${TODAY}T10:00`, ms: 2500, ok: true }], best: 1, fastest: null } };
  const t = todaysPlan(canCarry({ yomiage: todayRound }), { max: 9, budgetMin: 999 }).tasks.find(x => x.page === 'yomiage');
  assert.equal(t.autoDone, true);
});
