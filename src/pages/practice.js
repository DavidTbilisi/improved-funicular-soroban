// ============================================================================
// Guided practice page — the leveled bead-arithmetic ladder driving the shared
// board. Composition root for practice.html.
// ============================================================================
import { mountNav } from '../nav.js';
import { mountBoardShell } from '../boardShell.js';
import { MathRng } from '../drill/rng.js';
import { TUTORIAL_LEVELS } from '../tutorial/levels.js';
import { LocalStorageProgressStore, TutorialProgress } from '../tutorial/progressStore.js';
import { TutorialSession } from '../tutorial/tutorialSession.js';
import { TutorialView } from '../view/tutorialView.js';
import { RodRailView } from '../view/rodRailView.js';
import { figure, figLadder, figComplements, figTradeChain, figSolveTimes, figFumbles } from '../view/figures.js';
import { planAdd } from '../domain/movePlan.js';
import { SolveLog } from '../tutorial/solveLog.js';
import { FaultLog, fumbleRows } from '../tutorial/faultLog.js';

const $ = id => document.getElementById(id);
mountNav('practice');
const shell = mountBoardShell($('boardMount'));
// Merge the cockpit: pull the live board into the practice panel, directly
// under the problem stage, so prompt and beads share one view. The readout and
// set-number controls stay below in #boardMount.
shell.adoptBoard($('tutBoardSlot'));

// Persistence: the unlock ladder, every solve's time (for the pace trend), and
// each fumble's needed trade (for diagnosis). All on the same blob-store port.
const solveLog = new SolveLog(new LocalStorageProgressStore(window.localStorage, 'npv-practice-history'));
const faultLog = new FaultLog(new LocalStorageProgressStore(window.localStorage, 'npv-fault-log'));

const tutorial = new TutorialSession({
  levels: TUTORIAL_LEVELS,
  progress: new TutorialProgress(new LocalStorageProgressStore(window.localStorage)),
  rng: new MathRng(),
  store: shell.store,
  clock: { now: () => performance.now() },
  history: solveLog,
});
new TutorialView({
  levelsEl: $('tutLevels'), stageEl: $('tutStage'), teachEl: $('tutTeach'),
  promptEl: $('tutPrompt'), subEl: $('tutSub'), timerEl: $('tutTimer'), meterEl: $('tutMeter'),
  feedbackEl: $('tutFeedback'), hintBtn: $('tutHint'), skipBtn: $('tutSkip'), restartBtn: $('tutRestart'),
}, tutorial).build();

// --- Figures: live progress trio + the complement pairing plates ------------
const renderLadder = infos => {
  $('figLadder').innerHTML = figure(1,
    'Best clean streak per level (bars) against the streak each level demands (red tick). A red seal marks a cleared level; locked levels are dimmed.',
    figLadder(infos));
};
let curLevel = null; // { id, timeFloorMs } of the level being practiced
const renderTimes = () => {
  $('figTimes').innerHTML = figure(2,
    'Seconds per solve on the current level, oldest → newest. The red rule is the level’s automaticity floor; hollow dots were slow or fumbled.',
    figSolveTimes(curLevel ? solveLog.solves(curLevel.id) : [], curLevel ? curLevel.timeFloorMs : 0));
};
const renderFumbles = () => {
  const c = faultLog.counts();
  $('figFumbles').innerHTML = figure(3,
    'Every rejected move, counted by the complement pair its trade needed. The tall bars are the pairs to drill.',
    figFumbles(fumbleRows(c), c.resets));
};
renderLadder(tutorial.levelInfos());
renderTimes();
renderFumbles();
$('figFive').innerHTML = figure(4,
  'The five-complements. Each pair sums to five: out of earth beads, +3 becomes +5 −2 — set the sky bead, remove the friend.',
  figComplements(5));
$('figTen').innerHTML = figure(5,
  'The ten-complements. Each pair sums to ten: crossing the bar, +8 becomes +10 −2 — carry one to the next rod, remove the friend. Five is its own complement (dashed).',
  figComplements(10));
$('figChain').innerHTML = figure(6,
  'A compound trade, walked bead for bead: 6 + 7 crosses ten, so +7 = +10 −3 — but −3 has only one earth bead to take, so it trades too: −3 = −5 +2. Each arrow is one key. You never plan the chain; you ask one local question per move and it unrolls itself.',
  figTradeChain(6, planAdd(6, 7)));

// The graduate pointer: once the ladder's ÷ level is cleared, repeated
// subtraction has done its job — hand the learner to the rod-placement method.
const renderGraduate = infos => {
  const div = infos.find(l => l.id === 'divide');
  const done = !!div && div.best >= div.floor;
  const el = $('tutGraduate');
  el.hidden = !done;
  if (done) el.innerHTML = '🎓 Ladder cleared — repeated addition and subtraction were training wheels. Graduate to the professional rod method in the <a href="trainer.html">Mult / Div trainer</a>.';
};
renderGraduate(tutorial.levelInfos());

// --- Rod rail: the focused rod, lifted out like a calendar month tab ---------
// Observes the store (for the digit on the focused rod) and follows the board's
// focus (arrows / G-H / a step's snap). It is the "which rod am I on?" anchor
// that survives the mnemonic-mental fade, when the beads themselves are hidden.
const rail = new RodRailView($('tutRail'), shell.soroban.el).build();
shell.store.subscribe(s => rail.update(s));
shell.setFocusHook(exp => rail.setFocus(exp));

// --- Mnemonic-mental track: the support-fade ladder on the shared board ------
// Beads → Percept (cube faces) → Mental (imagined rods). It is the same live
// soroban; only its display fades, so the arithmetic and the solve-check are
// unchanged — a mental solve is just a solve you couldn't see. Choice persists.
const SUP_HINTS = [
  'Beads — full support, the physical soroban.',
  'Percept — beads hidden; read and compute on the cube-face percepts.',
  'Mental — imagined rods; move blind, the trainer still checks your value.',
];
const stSeg = $('stSeg');
const setSupport = lvl => {
  lvl = shell.soroban.setSupport(lvl);
  stSeg.querySelectorAll('button').forEach(b => b.classList.toggle('active', +b.dataset.sup === lvl));
  $('stHint').textContent = SUP_HINTS[lvl];
  localStorage.setItem('npv-support', String(lvl));
  return lvl;
};
let support = setSupport(parseInt(localStorage.getItem('npv-support'), 10) || 0);
stSeg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { support = setSupport(+b.dataset.sup); }));
$('stPeek').addEventListener('click', () => shell.soroban.peek());
// Keyboard: M cycles the fade, P peeks — both miss the board's move keys
// (J K L ; U I / F D S A R E / G H / Q), so mental drilling stays on the home row.
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.code === 'KeyM') { e.preventDefault(); support = setSupport((support + 1) % 3); }
  else if (e.code === 'KeyP') { e.preventDefault(); shell.soroban.peek(); }
});

// A rejected move or a reset spoils a clean solve — and is logged by the trade
// it demanded, so the fumble chart can name what to drill.
shell.setFaultHook(info => {
  if (!tutorial.active) return;
  tutorial.fault();
  if (info && info.kind === 'reset') faultLog.recordReset();
  else if (info && info.rule) faultLog.recordIllegal(info.rule, info.amount);
  renderFumbles();
});
// A new problem seeds the beads at its start value — snap focus to the ones rod
// and clear the coach line; play the right sound on a verdict.
tutorial.subscribe(evt => {
  if (evt.type === 'problem' || evt.type === 'skipped') { shell.setFocus(0); shell.coachEl.textContent = ''; }
  if (evt.type === 'level') { curLevel = { id: evt.id, timeFloorMs: evt.timeFloorMs }; renderTimes(); }
  if (evt.type === 'solved') {
    if (evt.justPassed) shell.sound.levelUp(); else if (evt.clean) shell.sound.solve(); else shell.sound.reject();
    if (support > 0) shell.soroban.peek(); // faded modes: flash the landed value into view
    renderTimes();
  }
  if (evt.type === 'stopped') { curLevel = null; renderTimes(); }
  if (evt.levels) { renderLadder(evt.levels); renderGraduate(evt.levels); } // level/solved events carry a fresh snapshot
});

shell.start();
