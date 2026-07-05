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
import { figure, figLayout, multTableHTML } from '../view/figures.js';

const $ = id => document.getElementById(id);
mountNav('trainer');
const shell = mountBoardShell($('boardMount'));
// Merge the cockpit: the live board sits directly under the step instruction,
// so each "place NN on rod X" is read right above the rods it names.
shell.adoptBoard($('rtBoardSlot'));

const rodTrainer = new RodTrainerSession({ modes: ROD_MODES, rng: new MathRng(), store: shell.store });
new RodTrainerView({
  modesEl: $('rtModes'), stageEl: $('rtStage'), titleEl: $('rtTitle'), teachEl: $('rtTeach'),
  promptEl: $('rtPrompt'), setupEl: $('rtSetup'), progressEl: $('rtProgress'), instrEl: $('rtInstr'),
  feedbackEl: $('rtFeedback'), doStepBtn: $('rtDoStep'), nextBtn: $('rtNext'), stopBtn: $('rtStop'),
}, rodTrainer, { onTargets: rods => shell.soroban.markTargets(rods) }).build();

// --- Figures: the table every step reads + the layout band per problem ------
$('figMult').innerHTML = figure(2,
  'The multiplication table, shaded by product (darker = larger). Hover any cell to read it; during a problem the cell the current step reads carries a red mark.',
  multTableHTML());
const markCell = factors => {
  document.querySelectorAll('.multab td.hot').forEach(td => td.classList.remove('hot'));
  if (factors) $(`mt-${factors[0]}-${factors[1]}`)?.classList.add('hot');
};

rodTrainer.subscribe(evt => {
  if (evt.type === 'problem') {
    shell.setFocus(0);
    shell.coachEl.textContent = 'trainer: place the highlighted rods with the keyboard';
    // Fig. 1 — the handbook's bracket diagram for this problem's rod layout.
    $('rtLayoutFig').innerHTML = figure(1,
      `Rod layout for ${rodTrainer.problem.prompt}. Grey brackets mark the operands as set; the answer forms under the red bracket.`,
      figLayout(rodTrainer.problem));
    markCell(null);
  } else if (evt.type === 'step') {
    shell.setFocus(Math.min(...evt.targets)); // snap focus to the step's rightmost target
    markCell(evt.factors);
  } else if (evt.type === 'solved') { shell.sound.solve(); markCell(null); }
  else if (evt.type === 'stopped') { shell.soroban.markTargets([]); $('rtLayoutFig').innerHTML = ''; markCell(null); }
});

shell.start();
