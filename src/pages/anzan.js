// ============================================================================
// Flash anzan page — composition root for anzan.html.
//
// Like the Today page it mounts no board: the whole discipline is that there is
// nothing to look at. What it does own is the real timer — the session's
// schedule is injected here as a setTimeout/clearTimeout pair, exactly as
// TutorialSession takes its idle timer, which is what lets the state machine be
// walked tick by tick in the unit suite.
// ============================================================================
import { mountNav } from '../nav.js';
import { MathRng } from '../drill/rng.js';
import { ANZAN_LEVELS, SPEEDS, speedStep } from '../anzan/levels.js';
import { AnzanSession } from '../anzan/anzanSession.js';
import { AnzanLog } from '../anzan/anzanLog.js';
import { AnzanView } from '../view/anzanView.js';
import { DayLog } from '../today/dayLog.js';
import { targetFromSearch, hrefFor } from '../today/deepLink.js';
import { diagnoseRung } from '../anzan/bridge.js';
import { TUTORIAL_LEVELS } from '../tutorial/levels.js';
import { LocalStorageProgressStore, TutorialProgress } from '../tutorial/progressStore.js';
import { FaultLog, fumbleRows } from '../tutorial/faultLog.js';
import { figure, figAnzan, figSessions, figComplements } from '../view/figures.js';

const $ = id => document.getElementById(id);
mountNav('anzan');

const log = new AnzanLog(new LocalStorageProgressStore(window.localStorage, 'npv-anzan'));
// The day axis behind the Today page's streak — marked on real work only.
const dayLog = new DayLog(new LocalStorageProgressStore(window.localStorage, 'npv-days'));
// Read-only: the anzan page never writes either of these. It reads the unlock
// ladder so it can't send you to a locked level, and the fault log so a stalling
// rung can name a weakness you demonstrably have on the board.
const progress = new TutorialProgress(new LocalStorageProgressStore(window.localStorage));
const faultLog = new FaultLog(new LocalStorageProgressStore(window.localStorage, 'npv-fault-log'));

const session = new AnzanSession({
  levels: ANZAN_LEVELS,
  rng: new MathRng(),
  log,
  clock: { now: () => performance.now() },
  timer: { set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id) },
});

let activeId = null;

const rowsFor = () => ANZAN_LEVELS.map(l => ({
  id: l.id, title: l.title, baseMs: l.baseMs, floor: l.floor,
  best: log.best(l.id), fastest: log.fastest(l.id),
  cleared: log.fastest(l.id) !== null,
  rounds: log.rounds(l.id).length, accuracy: log.accuracy(l.id),
}));

const view = new AnzanView({
  levelsEl: $('azLevels'), stageEl: $('azStage'), teachEl: $('azTeach'),
  paceEl: $('azPace'), scoreEl: $('azScore'), progressEl: $('azProgress'),
  numberEl: $('azNumber'), inputEl: $('azInput'), form: $('azForm'),
  nextBtn: $('azNext'), feedbackEl: $('azFeedback'),
  slowerBtn: $('azSlower'), fasterBtn: $('azFaster'),
}, session, {
  onStart: id => { activeId = id; session.start(id, savedSpeed(id)); render(); },
  onSpeed: dir => {
    const next = speedStep(session.intervalMs, dir);
    session.setSpeed(next);
    if (activeId) localStorage.setItem(`npv-anzan-speed:${activeId}`, String(next));
  },
  onNext: () => session.newRound(),
}).build();

// The chosen pace is per rung and worth keeping: it is the learner's current
// working difficulty, and re-picking it every visit would be busywork.
function savedSpeed(id) {
  const v = parseInt(localStorage.getItem(`npv-anzan-speed:${id}`), 10);
  return SPEEDS.includes(v) ? v : null;
}

// --- Figures ---------------------------------------------------------------
const render = () => {
  const rows = rowsFor();
  view.renderLevels(rows, activeId);
  $('figAnzan').innerHTML = figure(1,
    'Fastest pace carried per rung, on a log axis — faster is further right. A filled dot is a rung carried unbroken at that pace; a hollow one has been attempted but not yet carried; a small mark is untouched. The bar runs from the rung’s starting pace to your record.',
    figAnzan(rows));
  // The pace history of the rung in hand, reusing the drill trend plate: the
  // "share under floor" axis reads here as "share correct".
  const hist = activeId ? log.rounds(activeId) : [];
  const byRun = [];
  for (let i = 0; i < hist.length; i += 5) {
    const chunk = hist.slice(i, i + 5);
    byRun.push({
      t: chunk[chunk.length - 1].t, n: chunk.length,
      acc: Math.round(100 * chunk.filter(r => r.ok).length / chunk.length),
      meanMs: Math.round(chunk.reduce((a, r) => a + r.ms, 0) / chunk.length),
      floorPct: Math.round(100 * chunk.filter(r => r.ok).length / chunk.length),
    });
  }
  // figSessions' own empty state is worded for the drill page ("run a drill and
  // stop it"), which is not how a round is recorded here — so supply our own.
  const paceCaption = activeId
    ? 'Correct share for the current rung, in blocks of five rounds. Hover a point for its date and the mean pace those rounds ran at — a dip right after a speed increase is the expected shape, not a regression.'
    : 'Pick a rung to chart its history.';
  $('figPace').innerHTML = figure(2, paceCaption, byRun.length
    ? figSessions(byRun)
    : `<div class="fig-empty">${activeId
        ? 'No rounds on this rung yet — answer one and it charts here.'
        : 'No rung selected.'}</div>`);
};

$('figFive').innerHTML = figure(3,
  'The five-complements — the trades every single-digit rung is really drilling. Each pair sums to five: out of earth beads, +3 becomes +5 −2.',
  figComplements(5));

// A stalling rung points back at the board. It appears only on a result — there
// is nothing to diagnose before you have tried — and only when the rung really
// is stalling, so a learner having a good session is never nagged.
const renderDiagnosis = () => {
  const el = $('azDiagnose');
  if (!el) return;
  const d = activeId ? diagnoseRung({
    rungId: activeId,
    rounds: log.rounds(activeId).length,
    accuracy: log.accuracy(activeId),
    faults: fumbleRows(faultLog.counts()),
    levels: TUTORIAL_LEVELS.map((l, i) => ({
      id: l.id, title: l.title, unlocked: progress.isUnlocked(i), cleared: progress.best(l.id) >= l.floor,
    })),
  }) : null;
  el.hidden = !d;
  el.innerHTML = d
    ? `🧮 Stalling? <a href="${hrefFor('practice', d.levelId)}">${d.title}</a> on the board — <em>${d.why}</em>`
    : '';
};

session.subscribe(evt => {
  if (evt.type === 'result') {
    dayLog.mark(); // a completed round is work: today counts toward the streak
    render();
    renderDiagnosis();
  }
  if (evt.type === 'started' || evt.type === 'stopped') renderDiagnosis();
});

// Deep link from the Today plan: anzan.html?level=five2 opens that rung.
// Rungs are never locked, so any known id is fair game.
{
  const want = targetFromSearch(location.search, 'anzan');
  if (want && ANZAN_LEVELS.some(l => l.id === want)) { activeId = want; session.start(want, savedSpeed(want)); }
}
render();
