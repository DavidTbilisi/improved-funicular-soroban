// ============================================================================
// Skills — every practisable thing in the app as ONE list, with a retention
// forecast on each.
//
// The app trains five separate tracks and each measures itself differently: a
// tutorial level counts clean streaks, a drill deck counts reps under a time
// floor, the rod trainer counts clean walkthroughs, a paced rung counts correct
// rounds at an interval. None of that is comparable, which is why the plan has
// always compared them by hand, rule by rule. Retention IS comparable — "42% of
// this is left" means the same thing whatever produced it — so this flattens
// the profile into rows the scheduler can simply sort.
//
// The only per-track judgement left is QUALITY: how well the reps went, in
// 0..1, taken from whatever that track already measures honestly. It is stated
// here, once, instead of being re-derived wherever a rule needs it.
//
// TWO TRACKS ARE DELIBERATELY ABSENT.
//   • The VAULT already has a real scheduler, over stored content rather than
//     skill, and it outranks everything in the plan on its own terms. Modelling
//     it a second time here could only produce a second answer.
//   • The KYU EXAM is a checkpoint, not a skill: a grade you passed does not
//     decay into one you did not, and "revise 8級" is not a thing to do — the
//     thing to do is the level it leans on, which is already in this list.
//
// Pure: a profile in, rows out. Nothing is read from storage and nothing is
// written. Unit-tested in test/reviewSkills.test.js.
// ============================================================================
import { forecast, retentionText } from './decay.js';

// Each track's own honest measure of how well its reps went, 0..1. Where a
// track has nothing to say yet, 0.5 — neither credited nor punished.
const QUALITY = {
  practice: l => (l.solves ? l.readiness : 0.5),
  drill: d => (d.latestFloorPct != null ? d.latestFloorPct / 100 : 0.5),
  trainer: m => (m.floor ? Math.min(1, m.best / m.floor) : 0.5),
  paced: l => (l.accuracy != null ? l.accuracy : 0.5),
};

const row = (kind, page, src, { title, targetId, quality }) => {
  const f = forecast({ activeDays: src.activeDays || 0, daysSince: src.daysSince, quality });
  return {
    id: `${page}:${targetId}`, kind, page, targetId, title,
    activeDays: src.activeDays || 0, daysSince: src.daysSince, quality,
    ...f, text: retentionText(f), src,
  };
};

/**
 * Every track the learner has actually touched, most faded first.
 * Untouched things are excluded on purpose: they have no retention to model,
 * and putting them in front of the learner is the unlock rules' job.
 */
export function skillsFrom(profile) {
  if (!profile) return [];
  const out = [];

  for (const l of profile.practice.levels) {
    if (l.unlocked && l.solves > 0) {
      out.push(row('practice', 'practice', l, { title: l.title, targetId: l.id, quality: QUALITY.practice(l) }));
    }
  }
  for (const d of profile.drills.decks) {
    if (d.sessions > 0) {
      out.push(row('drill', 'drills', d, { title: d.label, targetId: d.id, quality: QUALITY.drill(d) }));
    }
  }
  for (const m of profile.trainer.modes) {
    if (m.solves > 0) {
      out.push(row('trainer', 'trainer', m, { title: m.title || m.label, targetId: m.id, quality: QUALITY.trainer(m) }));
    }
  }
  for (const [track, page] of [['anzan', 'anzan'], ['yomiage', 'yomiage']]) {
    for (const l of (profile[track] ? profile[track].levels : [])) {
      if (l.rounds > 0) {
        out.push(row(page, page, l, { title: l.title, targetId: l.id, quality: QUALITY.paced(l) }));
      }
    }
  }

  // Most faded first, and among equals the one left longest — that is the order
  // a scheduler wants and the order the Today panel reads best in.
  return out.sort((a, b) => a.retention - b.retention || (b.daysSince || 0) - (a.daysSince || 0));
}

export const dueSkills = profile => skillsFrom(profile).filter(s => s.due);

// What the whole practice looks like right now: one number per band, plus the
// worst offender. The Today page's "what is fading" line reads off this.
export function retentionSummary(profile) {
  const rows = skillsFrom(profile);
  const by = { fresh: 0, holding: 0, due: 0, cold: 0 };
  for (const r of rows) by[r.state] = (by[r.state] || 0) + 1;
  const due = rows.filter(r => r.due);
  return {
    rows, total: rows.length, bands: by,
    due: due.length,
    worst: rows[0] || null,
    // The average of what is held, which is the one honest headline: a learner
    // with six tracks at 90% is in a different place from one with two at 95%
    // and four at 30%, and a count of "due" alone cannot tell them apart.
    mean: rows.length ? Math.round((rows.reduce((n, r) => n + r.retention, 0) / rows.length) * 100) : null,
  };
}
