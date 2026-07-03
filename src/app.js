// ============================================================================
// Composition root. The one place that knows the concrete DOM and wires the
// object graph: store ← commands ← controls, store → views (observers), and the
// drill session → drill view. Everything below depends only on abstractions;
// this file supplies the concrete instances (Dependency Injection by hand).
// ============================================================================
import { FRAC_COLS, INT_COLS, INT_PLACES } from './domain/config.js';
import { classifyAdd, classifySub } from './domain/soroban.js';
import { AbacusStore } from './state/abacusStore.js';
import {
  CommandBus, SetValueCommand, StepIntCommand, ToggleSkyCommand, ClickEarthCommand, AddDigitCommand,
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

// --- Keyboard arithmetic (soroban complement rules with live coaching) ------
const coachEl = $('coach');
let focus = 0; // focused integer place (0 = ones)
const digitAt = place => Math.floor(store.intValue() / Math.pow(10, place)) % 10;
const setFocus = p => { focus = Math.max(0, Math.min(INT_COLS - 1, p)); soroban.highlightColumn(focus); };

function applyDigit(d, sign) {
  const info = sign > 0 ? classifyAdd(digitAt(focus), d) : classifySub(digitAt(focus), d);
  dispatch(new AddDigitCommand(store, focus, d, sign));
  setFocus(focus); // re-highlight (store re-render rebuilds nothing, but keep focus visible)
  const op = `${sign > 0 ? '+' : '−'}${d}`;
  const place = INT_PLACES[focus] || `10^${focus}`;
  const label = { direct: 'direct', small: 'small friend', big: 'big friend' }[info.rule];
  let tail = `<span class="move">${info.move.replace(/-/g, '−')}</span>`;
  if (info.rule === 'big') {
    const nbr = INT_PLACES[focus + 1] || 'next column';
    tail += sign > 0 ? ` <span style="color:#8a929e">(carry 1 → ${nbr})</span>`
                     : ` <span style="color:#8a929e">(borrow 1 ← ${nbr})</span>`;
  }
  coachEl.innerHTML = `<b>${op}</b> on ${place} — <span class="rule ${info.rule}">${label}</span>: ${tail}`;
}

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (session.activeDeckId) return; // a drill is running — don't hijack keys
  if (e.code === 'ArrowLeft') { e.preventDefault(); setFocus(focus + 1); return; }
  if (e.code === 'ArrowRight') { e.preventDefault(); setFocus(focus - 1); return; }
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
  if (m && +m[1] !== 0) { e.preventDefault(); applyDigit(+m[1], e.altKey ? -1 : 1); }
});

// --- Initial paint ----------------------------------------------------------
store.notify(store);
refreshUndo();
setFocus(0);
