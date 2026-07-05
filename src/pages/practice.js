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

const $ = id => document.getElementById(id);
mountNav('practice');
const shell = mountBoardShell($('boardMount'));

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

// A rejected move or a reset spoils a clean solve.
shell.setFaultHook(() => { if (tutorial.active) tutorial.fault(); });
// A new problem seeds the beads at its start value — snap focus to the ones rod
// and clear the coach line; play the right sound on a verdict.
tutorial.subscribe(evt => {
  if (evt.type === 'problem' || evt.type === 'skipped') { shell.setFocus(0); shell.coachEl.textContent = ''; }
  if (evt.type === 'solved') { if (evt.justPassed) shell.sound.levelUp(); else if (evt.clean) shell.sound.solve(); else shell.sound.reject(); }
});

shell.start();
