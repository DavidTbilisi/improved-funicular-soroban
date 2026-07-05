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
import { figure, figLadder, figComplements } from '../view/figures.js';

const $ = id => document.getElementById(id);
mountNav('practice');
const shell = mountBoardShell($('boardMount'));
// Merge the cockpit: pull the live board into the practice panel, directly
// under the problem stage, so prompt and beads share one view. The readout and
// set-number controls stay below in #boardMount.
shell.adoptBoard($('tutBoardSlot'));

const tutorial = new TutorialSession({
  levels: TUTORIAL_LEVELS,
  progress: new TutorialProgress(new LocalStorageProgressStore(window.localStorage)),
  rng: new MathRng(),
  store: shell.store,
  clock: { now: () => performance.now() },
});
new TutorialView({
  levelsEl: $('tutLevels'), stageEl: $('tutStage'), teachEl: $('tutTeach'),
  promptEl: $('tutPrompt'), subEl: $('tutSub'), timerEl: $('tutTimer'), meterEl: $('tutMeter'),
  feedbackEl: $('tutFeedback'), hintBtn: $('tutHint'), skipBtn: $('tutSkip'), restartBtn: $('tutRestart'),
}, tutorial).build();

// --- Figures: live ladder progress + the complement pairing plates ----------
const renderLadder = infos => {
  $('figLadder').innerHTML = figure(1,
    'Best clean streak per level (bars) against the streak each level demands (red tick). A red seal marks a cleared level; locked levels are dimmed.',
    figLadder(infos));
};
renderLadder(tutorial.levelInfos());
$('figFive').innerHTML = figure(2,
  'The five-complements. Each pair sums to five: out of earth beads, +3 becomes +5 −2 — set the sky bead, remove the friend.',
  figComplements(5));
$('figTen').innerHTML = figure(3,
  'The ten-complements. Each pair sums to ten: crossing the bar, +8 becomes +10 −2 — carry one to the next rod, remove the friend. Five is its own complement (dashed).',
  figComplements(10));

// A rejected move or a reset spoils a clean solve.
shell.setFaultHook(() => { if (tutorial.active) tutorial.fault(); });
// A new problem seeds the beads at its start value — snap focus to the ones rod
// and clear the coach line; play the right sound on a verdict.
tutorial.subscribe(evt => {
  if (evt.type === 'problem' || evt.type === 'skipped') { shell.setFocus(0); shell.coachEl.textContent = ''; }
  if (evt.type === 'solved') { if (evt.justPassed) shell.sound.levelUp(); else if (evt.clean) shell.sound.solve(); else shell.sound.reject(); }
  if (evt.levels) renderLadder(evt.levels); // level/solved events carry a fresh snapshot
});

shell.start();
