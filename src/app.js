// ============================================================================
// Composition root. The one place that knows the concrete DOM and wires the
// object graph: store ← commands ← controls, store → views (observers), and the
// drill session → drill view. Everything below depends only on abstractions;
// this file supplies the concrete instances (Dependency Injection by hand).
// ============================================================================
import { FRAC_COLS, INT_COLS, INT_PLACES } from './domain/config.js';
import { classifyAdd, classifySub, earthMoveLegal, heavenMoveLegal } from './domain/soroban.js';
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

// --- Keyboard arithmetic (home-row soroban moves with live coaching) --------
// Right hand adds, left hand subtracts. Home row = 1..4, the row above = 5/10.
//   add:  J K L ;  = +1 +2 +3 +4    U = +5    I = +10 (carry)
//   sub:  A S D F  = -1 -2 -3 -4    Q = -5    W = -10 (borrow)
// Q/W mirror U/I: they sit directly above A/S just as U/I sit above J/K.
const KEYMAP = {
  KeyJ: { sign: +1, amount: 1 }, KeyK: { sign: +1, amount: 2 }, KeyL: { sign: +1, amount: 3 }, Semicolon: { sign: +1, amount: 4 },
  KeyU: { sign: +1, amount: 5 }, KeyI: { sign: +1, amount: 10 },
  KeyA: { sign: -1, amount: 1 }, KeyS: { sign: -1, amount: 2 }, KeyD: { sign: -1, amount: 3 }, KeyF: { sign: -1, amount: 4 },
  KeyQ: { sign: -1, amount: 5 }, KeyW: { sign: -1, amount: 10 },
};

const coachEl = $('coach');
let focus = 0; // focused integer place (0 = ones)
const digitAt = place => Math.floor(store.intValue() / Math.pow(10, place)) % 10;
const setFocus = p => { focus = Math.max(0, Math.min(INT_COLS - 1, p)); soroban.highlightColumn(focus); };

// Reverse map: a complement-move token -> the key that performs it, so an
// illegal move can suggest exactly which keys to press instead.
const MOVE_KEYS = {
  '+1': 'J', '+2': 'K', '+3': 'L', '+4': ';', '+5': 'U', '+10': 'I',
  '-1': 'A', '-2': 'S', '-3': 'D', '-4': 'F', '-5': 'Q', '-10': 'W',
};
function keysFor(move) {
  const toks = move.split(/\s+/);
  return toks.every(t => MOVE_KEYS[t]) ? toks.map(t => MOVE_KEYS[t]).join(' then ') : null;
}

// Each key is a strictly literal bead move. If the move is physically
// impossible on the focused rod, reject it and flag why (with the proper
// complement as a hint).
function applyMove(sign, amount) {
  const c = digitAt(focus);
  const place = INT_PLACES[focus] || `10^${focus}`;
  const nbr = INT_PLACES[focus + 1];
  const op = `${sign > 0 ? '+' : '−'}${amount}`;

  let legal, reason, hint = null;
  if (amount === 10) {                    // carry/borrow = ±1 earth bead on the next rod
    const hasNext = focus + 1 < INT_COLS;
    const next = hasNext ? digitAt(focus + 1) : 0;
    legal = hasNext && earthMoveLegal(next, 1, sign);
    if (!legal) reason = !hasNext ? 'no column beyond the top'
      : sign > 0 ? `${nbr} can’t take a carry bead (it’s at ${next})`
                 : `${nbr} has no earth bead to borrow (it’s at ${next})`;
  } else if (amount === 5) {               // heaven bead
    legal = heavenMoveLegal(c, sign);
    if (!legal) { reason = sign > 0 ? 'heaven bead already set' : 'heaven bead not set'; hint = (sign > 0 ? classifyAdd : classifySub)(c, 5).move; }
  } else {                                 // 1..4 earth beads
    legal = earthMoveLegal(c, amount, sign);
    if (!legal) { reason = sign > 0 ? 'not enough free earth beads' : 'not enough active earth beads'; hint = (sign > 0 ? classifyAdd : classifySub)(c, amount).move; }
  }

  if (!legal) {
    let msg = `<span class="warn">⚠ ${op} on ${place} — illegal</span>: ${reason}`;
    if (hint) {
      const keys = keysFor(hint);
      msg += ` · use <span class="move">${hint.replace(/-/g, '−')}</span>${keys ? ` (${keys})` : ''}`;
    }
    coachEl.innerHTML = msg;
    return; // strictly literal: an impossible move is not performed
  }

  dispatch(new AddDigitCommand(store, focus, amount, sign));
  setFocus(focus); // keep the focus highlight after the re-render
  let detail;
  if (amount === 10) detail = sign > 0 ? `carry 1 → ${nbr}` : `borrow 1 ← ${nbr}`;
  else {
    const what = amount === 5 ? 'heaven bead' : `${amount} earth bead${amount > 1 ? 's' : ''}`;
    detail = `${what} → ${place} now ${digitAt(focus)}`;
  }
  coachEl.innerHTML = `<span class="rule direct">${op}</span> on ${place} — ${detail}`;
}

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (session.activeDeckId) return; // a drill is running — don't hijack keys
  if (e.altKey || e.ctrlKey || e.metaKey) return; // leave browser/OS shortcuts alone
  if (e.code === 'ArrowLeft') { e.preventDefault(); setFocus(focus + 1); return; }
  if (e.code === 'ArrowRight') { e.preventDefault(); setFocus(focus - 1); return; }
  const mv = KEYMAP[e.code];
  if (mv) { e.preventDefault(); applyMove(mv.sign, mv.amount); }
});

// --- Initial paint ----------------------------------------------------------
store.notify(store);
refreshUndo();
setFocus(0);
