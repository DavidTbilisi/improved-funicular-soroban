// ============================================================================
// Soroban Village page — composition root for game.html. Wires the shared
// board shell to the GameSession (solve detection + economy), the Phaser
// canvas (diorama), and the DOM HUD. The page is a one-screen cockpit: it
// never scrolls, so the live board is scaled here to fit its strip (fitBoard).
// The only module besides the other page entries, boardShell and nav that
// touches `document`.
// ============================================================================
import { mountNav } from '../nav.js';
import { mountBoardShell } from '../boardShell.js';
import { displayString } from '../domain/number.js';
import { MathRng } from '../drill/rng.js';
import { GameSession } from '../game/gameSession.js';
import { GameSave } from '../game/saveStore.js';
import { buildingById } from '../game/buildings.js';
import { goalStates } from '../game/goals.js';
import { LocalStorageProgressStore } from '../tutorial/progressStore.js';
import { FaultLog } from '../tutorial/faultLog.js';
import { mountGameCanvas } from '../view/game/gameCanvas.js';
import { GameHudView } from '../view/game/hudView.js';

const $ = id => document.getElementById(id);
mountNav('game');
const shell = mountBoardShell($('boardMount'), { intVal: 0, fracStr: '' });
// Merge the cockpit: the live board sits in the bottom strip. The readout and
// setter panels stay behind in the hidden #boardMount — on this page beads
// only move by being worked; the strip shows the value instead.
shell.adoptBoard($('gameBoardSlot'));
shell.store.subscribe(s => { $('gameValue').textContent = displayString(s.int, s.frac); });

// Scale the board to fit its strip — the whole page must fit one screen. The
// soroban's internal geometry is fixed px (bead travel is JS-positioned), so
// fitting is a pure transform; offset* report the untransformed layout size.
const soroEl = $('soroban');
const wrapEl = soroEl.parentElement; // .soroban-wrap
const fitBoard = () => {
  const s = Math.min(wrapEl.clientWidth / soroEl.offsetWidth, wrapEl.clientHeight / soroEl.offsetHeight, 1);
  soroEl.style.transform = `scale(${s})`;
};
new ResizeObserver(fitBoard).observe(wrapEl);
fitBoard();

// Persistence: the village save, plus the shared fault log so game fumbles
// feed the practice page's diagnosis chart (same as the trainer).
const save = new GameSave(new LocalStorageProgressStore(window.localStorage, 'npv-game-save'));
const faultLog = new FaultLog(new LocalStorageProgressStore(window.localStorage, 'npv-fault-log'));

const session = new GameSession({
  save, rng: new MathRng(), store: shell.store,
  clock: { now: () => performance.now() },
});
shell.setFaultHook(info => {
  if (!session.active) return;
  session.fault();
  if (info && info.kind === 'reset') faultLog.recordReset();
  else if (info && info.rule) faultLog.recordIllegal(info.rule, info.amount);
});

// The page owns the armed-placement state and fans it out to canvas + HUD.
let placementId = null;
const setPlacement = id => {
  placementId = id;
  canvas.setPlacement(id ? buildingById(id) : null);
  hud.setPlacement(id);
};

const canvas = mountGameCanvas($('gameMount'), {
  onCellTap(cellIdx) {
    if (placementId) {
      const id = placementId;
      setPlacement(null);
      session.placeBuilding(id, cellIdx);
    } else if (session.village.grid[cellIdx]) {
      session.startUpgrade(cellIdx);
    }
  },
});

const hud = new GameHudView({
  resEl: $('gameRes'), paletteEl: $('gamePalette'), contractsEl: $('gameContracts'),
  noticeEl: $('gameNotice'), stageEl: $('gameStage'), promptEl: $('gamePrompt'),
  subEl: $('gameSub'), payEl: $('gamePay'), feedbackEl: $('gameFeedback'),
  abandonBtn: $('gameAbandon'), resetBtn: $('gameReset'), goalEl: $('gameGoal'), hintEl: $('gameHint'),
}, session, {
  onPickBuilding: id => setPlacement(placementId === id ? null : id),
  onTakeContract: id => session.startChallenge(id),
  isChaining: () => $('gameChain').checked,
}).build();
$('gameAbandon').addEventListener('click', () => session.abandonChallenge());
$('gameReset').addEventListener('click', () => {
  if (window.confirm('Raze the village and start over? Your sp and buildings will be lost.')) session.resetSave();
});

// Help overlay: the textbook paragraph plus the full goal ladder, repainted
// each time it opens so the checkmarks are current.
const helpCard = $('helpCard');
const paintHelpGoals = () => {
  const states = goalStates(session.village);
  const next = states.find(g => !g.done);
  $('helpGoals').innerHTML = states.map(g =>
    `<div class="${g.done ? 'done' : (next && g.id === next.id ? 'g-next' : '')}">${g.done ? '✓' : '○'} ${g.emoji} ${g.label}</div>`).join('');
};
const toggleHelp = show => {
  helpCard.hidden = show === undefined ? !helpCard.hidden : !show;
  if (!helpCard.hidden) paintHelpGoals();
};
$('helpBtn').addEventListener('click', () => toggleHelp());
$('helpClose').addEventListener('click', () => toggleHelp(false));

// Focus mode: a live contract lifts the strip + board into a popup (CSS does
// the lifting off body.ck-focused; the nodes never move). After a solve the
// popup lingers just past the chain delay, so a chained run stays focused and
// a lone solve closes itself once the result has been seen.
let focusTimer = null;
const cancelFocusClose = () => { if (focusTimer) { clearTimeout(focusTimer); focusTimer = null; } };
const setBoardFocus = on => document.body.classList.toggle('ck-focused', on);

// Chained contracts: after an earn solve, deal another of the same tier so a
// run of problems needs no mouse (the drill page's auto-advance, transplanted).
// The timer is cancelled by any new challenge, an abandon, or a reset.
let lastTierId = null;
let chainTimer = null;
const cancelChain = () => { if (chainTimer) { clearTimeout(chainTimer); chainTimer = null; } };

session.subscribe(evt => {
  if (evt.type === 'loaded' || evt.type === 'placed' || evt.type === 'reset') {
    canvas.setVillage(evt.village);
    if (evt.type === 'placed') shell.sound.bead();
    if (evt.type === 'reset') { cancelChain(); cancelFocusClose(); setBoardFocus(false); shell.parts.setter.hidden = false; }
  } else if (evt.type === 'challenge') {
    cancelChain();
    cancelFocusClose();
    setBoardFocus(true);
    if (evt.kind === 'earn') lastTierId = evt.tierId;
    // Contract live: work the beads only — hide the type-a-number setter so
    // the answer can't be typed in (digit keys now focus a hidden input, a
    // no-op), and park the focus on the ones rod.
    shell.parts.setter.hidden = true;
    shell.setFocus(0);
    shell.coachEl.textContent = 'contract: reach the answer on the beads with the keyboard';
  } else if (evt.type === 'solved') {
    shell.parts.setter.hidden = false;
    canvas.setVillage(evt.village);
    // Close the popup unless the chain (1.4s) deals a new contract first.
    cancelFocusClose();
    focusTimer = setTimeout(() => { focusTimer = null; if (!session.active) setBoardFocus(false); }, 1600);
    if (evt.kind === 'earn' && $('gameChain').checked) {
      chainTimer = setTimeout(() => {
        chainTimer = null;
        if (!session.active && $('gameChain').checked) session.startChallenge(evt.tierId);
      }, 1400);
    }
    if (evt.kind === 'earn') canvas.flashPayout(`+${evt.payout} sp`, evt.clean);
    else canvas.flashPayout(`⬆ level ${evt.village.grid[evt.cell].level}`, evt.clean);
    canvas.pulseDay();
    if (evt.milestone === 'founded') { canvas.celebrate(); shell.sound.levelUp(); }
    else if (evt.clean) shell.sound.solve();
    else shell.sound.reject();
  } else if (evt.type === 'abandoned') {
    cancelChain();
    cancelFocusClose();
    setBoardFocus(false);
    shell.parts.setter.hidden = false;
  } else if (evt.type === 'refused') {
    shell.sound.reject();
  }
});

// N deals the next contract of the last tier — a full run without the mouse.
// ? toggles the help card; Escape closes it.
document.addEventListener('keydown', e => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'Escape' && !helpCard.hidden) { toggleHelp(false); return; }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === '?') { e.preventDefault(); toggleHelp(); return; }
  if (e.code !== 'KeyN') return;
  if (session.active || !lastTierId) return;
  e.preventDefault();
  cancelChain();
  session.startChallenge(lastTierId);
});

session.start();
shell.start();
