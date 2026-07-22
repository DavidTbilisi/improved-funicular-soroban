// ============================================================================
// Today's plan — one short, concrete practice session, chosen from the profile.
//
// The app has ten pages and 55-plus things to practise (11 levels, 17 decks,
// 6 rod modes, 9 anzan rungs, 6 read-aloud rungs, 10 kyu grades, the village,
// and however many numbers are stored). A returning learner's real question is not "what is
// available" but "what should I do for the next ten minutes" — so this turns
// the whole profile into three tasks with a reason and a deep link each.
//
// The shape is advisor.js's, one rung up: a PRIORITIZED LADDER of pure rules,
// each yielding at most one task. Two extra constraints keep the result a
// *session* rather than a list:
//   • A page appears at most once, so the plan is never three drills in a row —
//     variety is the point, and interleaving is how the skills actually stick.
//   • Tasks are taken while they fit a minute budget, but at least one is
//     always emitted: an empty plan is worse than an over-long one.
//
// Pure — profile in, plan out. No DOM, no storage, no clock (the profile
// carries the day). Unit-tested in test/todayPlan.test.js.
// ============================================================================
import { hrefFor } from './deepLink.js';
import { pickRung } from '../anzan/bridge.js';
import { skillsFrom } from '../review/skills.js';

// Read-the-prompt + settle overhead per rep, matching prognosis.js's OVERHEAD_MS.
const OVERHEAD_MS = 4000;
// A drill visit is a short round, not a full deck sweep.
const DECK_REPS = 12;
// Anzan rounds per visit — short, because a missed round is worth sitting with.
const ANZAN_ROUNDS = 6;
// Read-aloud rounds per visit. Fewer: a called round takes the caller's own
// time on top of the gap, so each one is a good deal longer than a flash.
const YOMIAGE_ROUNDS = 4;
// Reps assumed per practice/trainer visit when the level's own shortfall is small
// (you never do just one problem).
const MIN_REPS = 4;
// Days a failed kyu paper rests before the plan offers it again. Re-sitting the
// same grade the next morning is not practice, it is hoping for a kinder paper.
const EXAM_COOLDOWN = 2;
const FAULT_FLOOR = 3;     // fumbles on a pair below this are noise, not a pattern

// The complement pair a fumble names → the ladder level that drills it. The key
// is faultLog's ('small:2-3' / 'big:3-7'); direction is unknowable from a pair,
// so the add level is the default and '−' is only chosen when the learner has
// cleared the add side.
const FAULT_LEVELS = Object.freeze({ small: ['small-add', 'small-sub'], big: ['big-add', 'big-sub'] });

const minutesFor = (reps, msEach) => Math.max(1, Math.ceil(reps * (msEach + OVERHEAD_MS) / 60000));

const task = (rule, kind, page, targetId, title, why, minutes, extra = {}) => ({
  id: `${page}:${targetId || ''}`,
  rule, kind, page, targetId: targetId || null, title, why,
  minutes, href: hrefFor(page, targetId), ...extra,
});

// A practice/trainer visit: enough reps to move the streak, at the level's pace.
function levelTask(rule, lvl, why) {
  const reps = Math.max(MIN_REPS, Math.min(lvl.floor - lvl.best, lvl.floor) || MIN_REPS);
  return task(rule, 'practice', 'practice', lvl.id, lvl.title, why,
    minutesFor(reps, lvl.timeFloorMs || 4000), { floor: lvl.floor, best: lvl.best });
}

function deckTask(rule, deck, why) {
  return task(rule, 'drill', 'drills', deck.id, deck.label, why,
    minutesFor(DECK_REPS, deck.floorMs || 2000), { dueFacts: deck.dueFacts });
}

function modeTask(rule, mode, why) {
  return task(rule, 'trainer', 'trainer', mode.id, mode.title || mode.label, why,
    minutesFor(MIN_REPS, mode.timeFloorMs || 30000), { floor: mode.floor, best: mode.best });
}

function pacedTask(rule, page, lv, why, reps) {
  return task(rule, page, page, lv.id, lv.title, why,
    minutesFor(reps, lv.terms * (lv.lastMs || lv.baseMs) + 6000));
}

// A retention row (src/review/skills.js) as a task on whichever page owns it.
// The reason is the forecast's own sentence — "42% held · 6d overdue" says more
// than any of the per-track counters could, and says the same thing for all of
// them, which is the entire point of measuring retention.
function skillTask(rule, s) {
  const why = s.text;
  if (s.page === 'practice') return levelTask(rule, s.src, why);
  if (s.page === 'drills') return deckTask(rule, s.src, why);
  if (s.page === 'trainer') return modeTask(rule, s.src, why);
  if (s.page === 'anzan') return pacedTask(rule, 'anzan', s.src, why, ANZAN_ROUNDS);
  if (s.page === 'yomiage') return pacedTask(rule, 'yomiage', s.src, why, YOMIAGE_ROUNDS);
  return null;
}

// The ladder. Order IS the priority; each build() returns a Task, null, or — for
// a rule that has a RANKED set of candidates rather than one answer — an array
// in preference order, from which the planner takes the first that fits. The
// retention rungs need that: their best candidate may live on a page an earlier
// rung has already claimed, and yielding nothing in that case would silently
// drop the whole schedule instead of falling to the next-most-faded thing.
export const TASK_RULES = Object.freeze([
  // 1. A number is DUE. This outranks EVERYTHING, including the first-run rungs:
  //    it is the only work in the app with a deadline, it exists only because the
  //    learner deliberately stored something, and it is being lost right now
  //    while they drill. Skills wait; memories decay.
  { id: 'vault-due', build: p => {
      const v = p.vault;
      if (!v || !v.due) return null;
      const late = v.next && v.next.daysUntil != null && v.next.daysUntil < 0;
      const why = v.due === 1
        ? (late ? `${-v.next.daysUntil}d overdue — ${v.next.label}` : `due today — ${v.next.label}`)
        : `${v.due} due${late ? `, oldest ${-v.next.daysUntil}d overdue` : ''}`;
      return task('vault-due', 'vault', 'vault', null,
        v.due === 1 ? 'Recall a stored number' : `Recall ${v.due} stored numbers`, why,
        Math.max(1, Math.ceil(v.due * 1.5)));
    } },

  // 2. Nothing done yet — hand over the intended first hour, in order.
  { id: 'first-level', build: p => p.fresh && p.practice.levels[0]
      ? levelTask('first-level', p.practice.levels[0], 'start here') : null },
  { id: 'first-deck', build: p => p.fresh && p.drills.decks[0]
      ? deckTask('first-deck', p.drills.decks[0], 'learn the faces') : null },
  { id: 'first-contract', build: p => p.fresh
      ? task('first-contract', 'game', 'game', null, 'Soroban Village', 'earn your first sp', 4) : null },

  // 3. A pattern in the fumbles beats everything else — it names the exact
  //    trade that is costing clean solves.
  { id: 'weak-pair', build: p => {
      const top = p.faults.top[0];
      if (!top || top.count < FAULT_FLOOR) return null;
      const [rule, pair] = top.key.split(':');
      const ids = FAULT_LEVELS[rule];
      if (!ids) return null;
      const lv = p.practice.levels.find(l => l.id === ids[0] && l.unlocked);
      const alt = p.practice.levels.find(l => l.id === ids[1] && l.unlocked);
      // Once the add side is clean, the same pair is failing on the subtract side.
      const target = (lv && !lv.cleared) ? lv : (alt || lv);
      return target ? levelTask('weak-pair', target,
        `weakest — ${pair.replace('-', ' ↔ ')} costs you ${top.count} fumbles`) : null;
    } },

  // 4. Ready to fade the beads. This sits ABOVE the plain level rung because it
  //    targets the SAME level — it is the same visit, better framed ("drop to
  //    Percept" beats "3/8 clean" when the solves already say you can).
  { id: 'mental-step', build: p => {
      const pr = p.mental.prognosis;
      // `ready` is a bare readiness threshold and prognose() reports it even on a
      // single solve — gate on enoughData too, or one lucky rep proposes fading.
      if (!pr.enoughData || !pr.ready || pr.atMental || !p.mental.levelId) return null;
      const lv = p.practice.levels.find(l => l.id === p.mental.levelId);
      return lv ? levelTask('mental-step', lv, `ready to fade — drop to ${pr.nextName}`) : null;
    } },

  // 5. The level the ladder is actually on.
  { id: 'unfinished-level', build: p => {
      const lv = p.practice.current;
      return lv && !lv.cleared ? levelTask('unfinished-level', lv, `${lv.best}/${lv.floor} clean`) : null;
    } },

  // 6. A deck with facts still below the floor. MASTERY only: whether it has
  //    gone cold is retention's question now, and rung 7 asks it for every
  //    track at once rather than this rule guessing with a flat day count.
  { id: 'due-deck', build: p => {
      const d = p.drills.weakest;
      return d && d.dueFacts > 0 ? deckTask('due-deck', d, `${d.dueFacts} due`) : null;
    } },

  // 7. The most FADED thing you have practised, if it has fallen through the
  //    review mark. This replaced a flat "untouched for 3 days = cold" flag,
  //    which could not tell a skill drilled once from one drilled forty times
  //    across a fortnight and sent the learner to the wrong one. Retention is
  //    the one number that means the same thing on every track, so this rule
  //    can rank a level against a deck against an anzan rung and simply take
  //    the worst. It sits below the ladder rungs because a skill going soft is
  //    a smaller emergency than one you never had.
  { id: 'fading', build: p => skillsFrom(p).filter(s => s.due).map(s => skillTask('fading', s)) },

  // 8. A kyu paper you have earned the right to sit. This is a CHECKPOINT, not
  //    daily work, so it sits BELOW the rung the ladder is on and the deck that
  //    is due: on a day with real practice owing, the practice wins. It is
  //    gated hard besides — the grade must be unpassed, the practice level it
  //    leans on must be cleared, and a failed attempt has to cool off — so when
  //    it does fire it is worth the ten minutes it costs.
  { id: 'exam', build: p => {
      const g = p.exam && p.exam.next;
      if (!g) return null;
      // A paper sat today is still EMITTED — wasDoneToday ticks it, and a task
      // that comes back ticked reads as "you did that" where a task that
      // silently vanishes reads as a plan that forgot. Only an older failed
      // attempt is suppressed, and only until it has cooled off.
      const satToday = !!g.lastDay && g.lastDay === p.today;
      if (!satToday && g.attempts > 0 && (g.daysSince == null || g.daysSince < EXAM_COOLDOWN)) return null;
      const needs = p.practice.levels.find(l => l.id === g.needs);
      if (!needs || !needs.cleared) return null;
      const why = g.attempts
        ? `retake — best ${g.best}/100, 70 needed in every section`
        : `${needs.title} is clear — sit the paper`;
      return task('exam', 'exam', 'exam', g.id, `${g.name} — the kyu paper`, why, Math.max(2, g.minutes));
    } },

  // 9. Something new is open and untried — that pull is worth a slot.
  { id: 'next-unlock', build: p => p.practice.untouched
      ? levelTask('next-unlock', p.practice.untouched, 'newly unlocked') : null },
  { id: 'new-deck', build: p => p.drills.untouched
      ? deckTask('new-deck', p.drills.untouched, 'not yet drilled') : null },

  // 10. Flash anzan — but only once the Mental stage is in reach. Offering it to
  //    someone still at Beads is offering the exam before the course: the whole
  //    discipline is the mnemonic-mental track under time pressure.
  { id: 'anzan', build: p => {
      if (!p.anzan || !p.anzan.levels.length) return null;
      // A deliberately more permissive gate than the practice page's: once
      // someone is doing anzan, keep offering it even if they have put the
      // board back up. WHICH rung is pickRung's call either way, so the plan
      // and the prognosis can never name different ones.
      const earned = p.mental.support > 0 || p.mental.prognosis.ready || p.anzan.rounds > 0;
      if (!earned) return null;
      const pickedId = (pickRung({
        levelId: p.practice.current ? p.practice.current.id : null,
        rungs: p.anzan.levels,
      }) || {}).id;
      const lv = p.anzan.levels.find(l => l.id === pickedId) || p.anzan.current;
      if (!lv) return null;
      const why = lv.fastest ? `cleared at ${lv.fastest} ms — push it`
        : lv.rounds ? `${Math.round((lv.accuracy || 0) * 100)}% at ${lv.lastMs || lv.baseMs} ms`
        : 'mental, under time';
      return pacedTask('anzan', 'anzan', lv, why, ANZAN_ROUNDS);
    } },

  // 11. Read-aloud. Gated on the carry being in hand — "minus sixty-three" has
  //     to reach the beads as a borrow, and a learner who cannot yet borrow is
  //     being asked to do the exercise and learn the rule at once. Unlike anzan
  //     it needs NO mental stage: the board does the remembering here, which is
  //     exactly why it is worth doing early.
  { id: 'yomiage', build: p => {
      if (!p.yomiage || !p.yomiage.levels.length) return null;
      const carry = p.practice.levels.find(l => l.id === 'big-add');
      const earned = (carry && carry.cleared) || p.yomiage.rounds > 0;
      if (!earned) return null;
      const lv = p.yomiage.current;
      if (!lv) return null;
      const why = lv.fastest ? `carried at ${lv.fastest} ms — shorten the gap`
        : lv.rounds ? `${Math.round((lv.accuracy || 0) * 100)}% at a ${lv.lastMs || lv.baseMs} ms gap`
        : 'called aloud, straight to the rods';
      return pacedTask('yomiage', 'yomiage', lv, why, YOMIAGE_ROUNDS);
    } },

  // 12. The rod method.
  { id: 'trainer-mode', build: p => {
      const m = p.trainer.weakest;
      return m ? modeTask('trainer-mode', m, m.solves ? `${m.best}/${m.floor} clean` : 'rod method') : null;
    } },

  // 13. The village — its own advisor already knows what it wants.
  { id: 'village', build: p => p.village
      ? task('village', 'game', 'game', null, 'Soroban Village',
        (p.village.goal && p.village.goal.label) || 'endless — grow the village', 4,
        { hint: p.village.hint ? p.village.hint.msg : null }) : null },

  // 14. Nothing is due and nothing is owed — keep the softest thing warm. Same
  //     ranking as rung 7 without the due gate, so the fallback and the
  //     scheduler agree about what "softest" means.
  { id: 'keep-warm', build: p => {
      const rows = skillsFrom(p);
      // Strictly the nothing-is-due case. While anything is due, rung 7 owns the
      // retention slot — two retention tasks in one plan would just be the same
      // rung twice, and the second one is by definition the less urgent.
      return rows.some(s => s.due) ? null : rows.map(s => skillTask('keep-warm', s));
    } },
]);

/**
 * @param profile a buildProfile() snapshot
 * @param max     how many tasks the session may hold
 * @param budgetMin the minute budget the plan aims at
 * @returns { date, tasks, totalMin, message }
 */
export function todaysPlan(profile, { max = 3, budgetMin = 10 } = {}) {
  const tasks = [];
  const pages = new Set();
  let totalMin = 0;

  for (const rule of TASK_RULES) {
    if (tasks.length >= max) break;
    let built = null;
    try { built = rule.build(profile); } catch { built = null; }  // a rule must never break the page
    const candidates = (Array.isArray(built) ? built : [built]).filter(Boolean);
    for (const t of candidates) {
      if (pages.has(t.page)) continue;
      // Always take the first task, even if it alone busts the budget — an empty
      // plan is the one outcome this feature cannot afford.
      if (tasks.length && totalMin + t.minutes > budgetMin) continue;
      t.autoDone = wasDoneToday(profile, t);
      tasks.push(t);
      pages.add(t.page);
      totalMin += t.minutes;
      break;                                                     // one task per rule
    }
  }

  return { date: profile.today, tasks, totalMin, message: messageFor(profile, tasks, totalMin) };
}

// Work already done today shows ticked without a click — the plan should
// recognise practice that happened before the learner opened this page.
function wasDoneToday(profile, t) {
  if (!profile.today) return false;
  if (t.page === 'practice') {
    const lv = profile.practice.levels.find(l => l.id === t.targetId);
    return !!lv && lv.lastDay === profile.today;
  }
  if (t.page === 'drills') {
    const d = profile.drills.decks.find(x => x.id === t.targetId);
    return !!d && d.lastDay === profile.today;
  }
  if (t.page === 'trainer') {
    const m = profile.trainer.modes.find(x => x.id === t.targetId);
    return !!m && m.lastDay === profile.today;
  }
  if (t.page === 'anzan') {
    const a = profile.anzan.levels.find(x => x.id === t.targetId);
    return !!a && a.lastDay === profile.today;
  }
  if (t.page === 'yomiage') {
    const y = (profile.yomiage ? profile.yomiage.levels : []).find(x => x.id === t.targetId);
    return !!y && y.lastDay === profile.today;
  }
  if (t.page === 'exam') {
    const g = (profile.exam ? profile.exam.grades : []).find(x => x.id === t.targetId);
    return !!g && g.lastDay === profile.today;
  }
  return false; // the village carries no wall-clock stamp to check against
}

function messageFor(profile, tasks, totalMin) {
  if (!tasks.length) return 'Nothing queued — pick any page and practise.';
  const s = profile.streak;
  const plural = tasks.length === 1 ? '' : 's';
  if (s.current > 0 && !s.activeToday) {
    return `${tasks.length} task${plural}, about ${totalMin} min — enough to keep your ${s.current}-day streak alive.`;
  }
  if (s.activeToday) {
    return `Already practised today — ${tasks.length} more task${plural}, about ${totalMin} min.`;
  }
  return `${tasks.length} task${plural}, about ${totalMin} min. Finish them and the streak starts today.`;
}
