// ============================================================================
// Mult/Div trainer page — the authentic rod-placement method driving the shared
// board. Composition root for trainer.html.
// ============================================================================
import { mountNav } from '../nav.js';
import { mountBoardShell } from '../boardShell.js';
import { MathRng } from '../drill/rng.js';
import { ROD_MODES } from '../domain/mulDiv.js';
import { RodTrainerSession } from '../tutorial/rodTrainerSession.js';
import { RodTrainerView } from '../view/rodTrainerView.js';
import { figure, figLayout, multTableHTML, figSolveTimes } from '../view/figures.js';
import { SolveLog } from '../tutorial/solveLog.js';
import { FaultLog } from '../tutorial/faultLog.js';
import { LocalStorageProgressStore } from '../tutorial/progressStore.js';

const $ = id => document.getElementById(id);
mountNav('trainer');
const shell = mountBoardShell($('boardMount'));
// Merge the cockpit: the live board sits directly under the step instruction,
// so each "place NN on rod X" is read right above the rods it names.
shell.adoptBoard($('rtBoardSlot'));

// Persistence: solve times + best streak per mode; fumbles share the practice
// page's log, so the diagnosis chart there sees trainer mistakes too.
const log = new SolveLog(new LocalStorageProgressStore(window.localStorage, 'npv-trainer-progress'));
const faultLog = new FaultLog(new LocalStorageProgressStore(window.localStorage, 'npv-fault-log'));

const rodTrainer = new RodTrainerSession({
  modes: ROD_MODES, rng: new MathRng(), store: shell.store,
  clock: { now: () => performance.now() }, log,
});
// A rejected move or a reset spoils a clean solve here too.
shell.setFaultHook(info => {
  if (!rodTrainer.active) return;
  rodTrainer.fault();
  if (info && info.kind === 'reset') faultLog.recordReset();
  else if (info && info.rule) faultLog.recordIllegal(info.rule, info.amount);
});
new RodTrainerView({
  modesEl: $('rtModes'), stageEl: $('rtStage'), titleEl: $('rtTitle'), teachEl: $('rtTeach'),
  promptEl: $('rtPrompt'), setupEl: $('rtSetup'), progressEl: $('rtProgress'), instrEl: $('rtInstr'),
  feedbackEl: $('rtFeedback'), doStepBtn: $('rtDoStep'), nextBtn: $('rtNext'), stopBtn: $('rtStop'),
}, rodTrainer, { onTargets: rods => shell.soroban.markTargets(rods) }).build();

// --- Figures: layout band (1, per problem) + pace trend (2) + the table (3) --
let curMode = null;
const renderTrend = () => {
  const m = rodTrainer.modeInfos().find(x => x.id === curMode);
  $('figTrend').innerHTML = figure(2,
    'Seconds per solve for the selected mode, oldest → newest. The red rule is the mode’s pace floor; hollow dots were assisted, fumbled, or slow.',
    figSolveTimes(m ? log.solves(m.id) : [], m ? m.timeFloorMs : 0));
};
renderTrend();
$('figMult').innerHTML = figure(3,
  'The multiplication table, shaded by product (darker = larger). Hover any cell to read it; during a problem the cell the current step reads carries a red mark.',
  multTableHTML());
const markCell = factors => {
  document.querySelectorAll('.multab td.hot').forEach(td => td.classList.remove('hot'));
  if (factors) $(`mt-${factors[0]}-${factors[1]}`)?.classList.add('hot');
};

rodTrainer.subscribe(evt => {
  if (evt.type === 'problem') {
    curMode = evt.modeId;
    shell.setFocus(0);
    shell.coachEl.textContent = 'trainer: place the highlighted rods with the keyboard';
    // Fig. 1 — the handbook's bracket diagram for this problem's rod layout.
    $('rtLayoutFig').innerHTML = figure(1,
      `Rod layout for ${rodTrainer.problem.prompt}. Grey brackets mark the operands as set; the answer forms under the red bracket.`,
      figLayout(rodTrainer.problem));
    markCell(null);
    renderTrend();
  } else if (evt.type === 'step') {
    shell.setFocus(Math.min(...evt.targets)); // snap focus to the step's rightmost target
    markCell(evt.factors);
  } else if (evt.type === 'solved') {
    if (evt.clean) shell.sound.solve(); else shell.sound.reject();
    markCell(null);
    renderTrend();
  } else if (evt.type === 'stopped') {
    shell.soroban.markTargets([]); $('rtLayoutFig').innerHTML = ''; markCell(null);
    curMode = null;
    renderTrend();
  }
});

shell.start();
