// ============================================================================
// Composition root. The one place that knows the concrete DOM and wires the
// object graph: store ← commands ← controls, store → views (observers), and the
// drill session → drill view. Everything below depends only on abstractions;
// this file supplies the concrete instances (Dependency Injection by hand).
// ============================================================================
import { FRAC_COLS } from './domain/config.js';
import { AbacusStore } from './state/abacusStore.js';
import {
  CommandBus, SetValueCommand, StepIntCommand, ToggleSkyCommand, ClickEarthCommand,
} from './state/commands.js';
import { SorobanView } from './view/sorobanView.js';
import { ReadoutView } from './view/readoutView.js';
import { DeepPackView } from './view/deepPackView.js';
import { ReferenceView } from './view/referenceView.js';
import { DrillView } from './view/drillView.js';
import { DRILL_DECKS } from './drill/decks.js';
import { MODES } from './drill/drillMode.js';
import { MathRng } from './drill/rng.js';
import { LocalStorageStatsStore, DrillStatsService } from './drill/statsStore.js';
import { DrillSession } from './drill/drillSession.js';

const $ = id => document.getElementById(id);

// --- State + command invoker ------------------------------------------------
const store = new AbacusStore(15, '98');
const bus = new CommandBus();
const undoBtn = $('undoBtn');
const refreshUndo = () => { if (undoBtn) undoBtn.disabled = !bus.canUndo; };
const dispatch = cmd => { bus.run(cmd); refreshUndo(); };

// --- Views (observers of the store) -----------------------------------------
const soroban = new SorobanView($('soroban'), {
  onToggleSky: (kind, idx) => dispatch(new ToggleSkyCommand(store, kind, idx)),
  onClickEarth: (kind, idx, bead) => dispatch(new ClickEarthCommand(store, kind, idx, bead)),
});
soroban.init();

const readout = new ReadoutView({
  valueEl: $('numValue'), inputEl: $('numInput'),
  incBtn: $('incBtn'), decBtn: $('decBtn'), decodeEl: $('decode'),
});

const deepPack = new DeepPackView({
  lineEl: $('packDigitsLine'), lociEl: $('packLoci'),
  decBtn: $('radixDec'), hexBtn: $('radixHex'),
}, 10);

store.subscribe(s => soroban.update(s));
store.subscribe(s => readout.update(s));
store.subscribe(s => deepPack.update(s));

// --- Static reference sections ----------------------------------------------
new ReferenceView({
  pegGridEl: $('pegGrid'), cubeGridEl: $('cubeGrid'),
  hexPegGridEl: $('hexPegGrid'), presetsEl: $('presets'),
}, { onPreset: v => dispatch(new SetValueCommand(store, v)) }).build();

// --- Drill (its own store + session + view) ---------------------------------
const statsService = new DrillStatsService(new LocalStorageStatsStore(window.localStorage));
const session = new DrillSession({
  decks: DRILL_DECKS, modes: MODES, stats: statsService,
  rng: new MathRng(), clock: { now: () => performance.now() },
});
new DrillView({
  decksEl: $('drillDecks'), stageEl: $('drillStage'), floorEl: $('drillFloor'),
  promptEl: $('drillPrompt'), subEl: $('drillSub'),
  typeRow: $('drillTypeRow'), revealRow: $('drillRevealRow'), inputEl: $('drillInput'),
  revealBtn: $('drillRevealBtn'), gotItBtn: $('drillGotIt'), missedBtn: $('drillMissed'),
  feedbackEl: $('drillFeedback'), statsEl: $('drillStats'), bestEl: $('drillBest'),
  stopBtn: $('drillStop'),
}, session).build();

// --- Controls (each user intent becomes a Command) --------------------------
$('setBtn').addEventListener('click', () => dispatch(new SetValueCommand(store, $('numInput').value)));
$('clearBtn').addEventListener('click', () => dispatch(new SetValueCommand(store, '0')));
$('incBtn').addEventListener('click', () => dispatch(new StepIntCommand(store, +1)));
$('decBtn').addEventListener('click', () => dispatch(new StepIntCommand(store, -1)));
$('numInput').addEventListener('keypress', e => { if (e.key === 'Enter') dispatch(new SetValueCommand(store, e.target.value)); });
$('randBtn').addEventListener('click', () => {
  const intDigits = Math.floor(Math.random() * 7);              // 0..6 integer digits
  const fracDigits = Math.floor(Math.random() * (FRAC_COLS + 1)); // 0..4 fraction digits
  const iv = Math.floor(Math.random() * Math.pow(10, intDigits));
  let fs = '';
  for (let k = 0; k < fracDigits; k++) fs += Math.floor(Math.random() * 10);
  dispatch(new SetValueCommand(store, iv + (fs ? '.' + fs : '')));
});
if (undoBtn) undoBtn.addEventListener('click', () => { bus.undo(); refreshUndo(); });

$('radixDec').addEventListener('click', () => deepPack.setRadix(10));
$('radixHex').addEventListener('click', () => deepPack.setRadix(16));

// --- Initial paint ----------------------------------------------------------
store.notify(store);
refreshUndo();
