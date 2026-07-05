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

const $ = id => document.getElementById(id);
mountNav('trainer');
const shell = mountBoardShell($('boardMount'));

const rodTrainer = new RodTrainerSession({ modes: ROD_MODES, rng: new MathRng(), store: shell.store });
new RodTrainerView({
  modesEl: $('rtModes'), stageEl: $('rtStage'), titleEl: $('rtTitle'), teachEl: $('rtTeach'),
  promptEl: $('rtPrompt'), setupEl: $('rtSetup'), progressEl: $('rtProgress'), instrEl: $('rtInstr'),
  feedbackEl: $('rtFeedback'), doStepBtn: $('rtDoStep'), nextBtn: $('rtNext'), stopBtn: $('rtStop'),
}, rodTrainer, { onTargets: rods => shell.soroban.markTargets(rods) }).build();

rodTrainer.subscribe(evt => {
  if (evt.type === 'problem') { shell.setFocus(0); shell.coachEl.textContent = 'trainer: place the highlighted rods with the keyboard'; }
  else if (evt.type === 'step') shell.setFocus(Math.min(...evt.targets)); // snap focus to the step's rightmost target
  else if (evt.type === 'solved') shell.sound.solve();
  else if (evt.type === 'stopped') shell.soroban.markTargets([]);
});

shell.start();
