// ============================================================================
// Today's plan — one short, concrete practice session, chosen from the profile.
//
// The app has six pages and 34 things to practise (11 levels, 17 decks, 6 rod
// modes, the village). A returning learner's real question is not "what is
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

// Read-the-prompt + settle overhead per rep, matching prognosis.js's OVERHEAD_MS.
const OVERHEAD_MS = 4000;
// A drill visit is a short round, not a full deck sweep.
const DECK_REPS = 12;
// Reps assumed per practice/trainer visit when the level's own shortfall is small
// (you never do just one problem).
const MIN_REPS = 4;
const STALE_DAYS = 3;      // a deck untouched this long is "cold"
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

// The ladder. Order IS the priority; each build() returns a Task or null.
export const TASK_RULES = Object.freeze([
  // 1. Nothing done yet — hand over the intended first hour, in order.
  { id: 'first-level', build: p => p.fresh && p.practice.levels[0]
      ? levelTask('first-level', p.practice.levels[0], 'start here') : null },
  { id: 'first-deck', build: p => p.fresh && p.drills.decks[0]
      ? deckTask('first-deck', p.drills.decks[0], 'learn the faces') : null },
  { id: 'first-contract', build: p => p.fresh
      ? task('first-contract', 'game', 'game', null, 'Soroban Village', 'earn your first sp', 4) : null },

  // 2. A pattern in the fumbles beats everything else — it names the exact
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

  // 3. Ready to fade the beads. This sits ABOVE the plain level rung because it
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

  // 4. The level the ladder is actually on.
  { id: 'unfinished-level', build: p => {
      const lv = p.practice.current;
      return lv && !lv.cleared ? levelTask('unfinished-level', lv, `${lv.best}/${lv.floor} clean`) : null;
    } },

  // 5. A deck with facts still below the floor, or one gone cold.
  { id: 'due-deck', build: p => {
      const d = p.drills.weakest;
      if (!d) return null;
      if (d.dueFacts > 0) return deckTask('due-deck', d, `${d.dueFacts} due`);
      if (d.daysSince != null && d.daysSince >= STALE_DAYS) return deckTask('due-deck', d, `${d.daysSince} days cold`);
      return null;
    } },

  // 6. Something new is open and untried — that pull is worth a slot.
  { id: 'next-unlock', build: p => p.practice.untouched
      ? levelTask('next-unlock', p.practice.untouched, 'newly unlocked') : null },
  { id: 'new-deck', build: p => p.drills.untouched
      ? deckTask('new-deck', p.drills.untouched, 'not yet drilled') : null },

  // 7. The rod method.
  { id: 'trainer-mode', build: p => {
      const m = p.trainer.weakest;
      return m ? modeTask('trainer-mode', m, m.solves ? `${m.best}/${m.floor} clean` : 'rod method') : null;
    } },

  // 8. The village — its own advisor already knows what it wants.
  { id: 'village', build: p => p.village
      ? task('village', 'game', 'game', null, 'Soroban Village',
        (p.village.goal && p.village.goal.label) || 'endless — grow the village', 4,
        { hint: p.village.hint ? p.village.hint.msg : null }) : null },

  // 9. Everything is cleared — keep the coldest thing warm.
  { id: 'keep-warm', build: p => {
      const cold = [...p.practice.levels.filter(l => l.unlocked), ...p.drills.decks.filter(d => d.sessions > 0)]
        .filter(x => x.daysSince != null)
        .sort((a, b) => b.daysSince - a.daysSince)[0];
      if (!cold) return null;
      return cold.floor != null
        ? levelTask('keep-warm', cold, `${cold.daysSince} days cold`)
        : deckTask('keep-warm', cold, `${cold.daysSince} days cold`);
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
    let t = null;
    try { t = rule.build(profile); } catch { t = null; }       // a rule must never break the page
    if (!t || pages.has(t.page)) continue;
    // Always take the first task, even if it alone busts the budget — an empty
    // plan is the one outcome this feature cannot afford.
    if (tasks.length && totalMin + t.minutes > budgetMin) continue;
    t.autoDone = wasDoneToday(profile, t);
    tasks.push(t);
    pages.add(t.page);
    totalMin += t.minutes;
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
