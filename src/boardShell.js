// ============================================================================
// Board shell — the reusable "live soroban" composition unit shared by every
// page that drives the beads (Explore, Guided practice, Mult/Div trainer). It
// injects the board markup into a mount element and wires the store, soroban,
// readout, sound, metronome, set-number controls and the keyboard-arithmetic
// handler, then returns a small API so a page can attach its own feature
// (tutorial / trainer) to the same store. This is the one module besides the
// page entries that touches `document`.
// ============================================================================
import { FRAC_COLS, INT_COLS, INT_PLACES, FRAC_PLACES } from './domain/config.js';
import { rodValue } from './domain/rod.js';
import { classifyAdd, classifySub, earthMoveLegal, heavenMoveLegal } from './domain/soroban.js';
import { AbacusStore } from './state/abacusStore.js';
import { CommandBus, SetValueCommand, StepIntCommand, AddAtColumnCommand, ToggleSkyCommand, ClickEarthCommand } from './state/commands.js';
import { SorobanView } from './view/sorobanView.js';
import { ReadoutView } from './view/readoutView.js';
import { SoundService } from './view/soundService.js';
import { Metronome } from './view/metronome.js';

const SHELL_HTML = `
  <div class="readout" id="shellReadout">
    <div class="num-box"><div class="label">Number</div><div class="value" id="numValue">0</div></div>
    <div class="decode" id="decode"></div>
  </div>
  <div class="panel" id="shellBoard">
    <div class="soroban-wrap"><div class="soroban" id="soroban"></div></div>
    <div class="coach" id="coach">Keyboard: <kbd>←</kbd> <kbd>→</kbd> or <kbd>G</kbd> <kbd>H</kbd> pick a column (integer or decimal) · add <kbd>J</kbd><kbd>K</kbd><kbd>L</kbd><kbd>;</kbd>=+1..4 <kbd>U</kbd>=+5 <kbd>I</kbd>=+10 · sub <kbd>F</kbd><kbd>D</kbd><kbd>S</kbd><kbd>A</kbd>=−1..4 <kbd>R</kbd>=−5 <kbd>E</kbd>=−10 · <kbd>Q</kbd>=reset · type <kbd>0</kbd>–<kbd>9</kbd> to enter a number</div>
    <div class="sound-row">
      <button id="soundBtn" class="sound-toggle">🔊 Sound on</button>
      <span class="metro">
        <button id="metroBtn" class="metro-toggle">▶ Metronome</button>
        <span class="metro-beat" id="metroBeat" aria-hidden="true"></span>
        <input type="range" id="metroBpm" min="40" max="200" step="5" value="60" aria-label="Metronome tempo">
        <span class="metro-bpm"><span id="metroBpmVal">60</span> BPM</span>
      </span>
    </div>
  </div>
  <div class="panel" id="shellSetter">
    <div class="input-row">
      <label for="numInput">Value:</label>
      <input type="text" id="numInput" inputmode="decimal" placeholder="e.g. 15.98" value="15.98">
      <button id="setBtn" class="primary">Set</button>
      <button id="clearBtn">Clear (0)</button>
      <button id="incBtn">+1</button>
      <button id="decBtn">−1</button>
      <button id="randBtn">Random</button>
      <button id="undoBtn" disabled>Undo</button>
    </div>
    <div class="presets" id="presets"></div>
  </div>`;

export function mountBoardShell(mountEl, { intVal = 15, fracStr = '98' } = {}) {
  mountEl.innerHTML = SHELL_HTML;
  const $ = id => document.getElementById(id);

  // --- State + command invoker ----------------------------------------------
  const store = new AbacusStore(intVal, fracStr);
  const bus = new CommandBus();
  const undoBtn = $('undoBtn');
  const refreshUndo = () => { if (undoBtn) undoBtn.disabled = !bus.canUndo; };
  const dispatch = cmd => { bus.run(cmd); refreshUndo(); };

  // --- Audio + metronome ----------------------------------------------------
  const sound = new SoundService({ enabled: localStorage.getItem('npv-sound') !== 'off' });
  const soundBtn = $('soundBtn');
  const paintSoundBtn = () => { soundBtn.textContent = sound.enabled ? '🔊 Sound on' : '🔇 Sound off'; };
  soundBtn.addEventListener('click', () => {
    sound.setEnabled(!sound.enabled);
    localStorage.setItem('npv-sound', sound.enabled ? 'on' : 'off');
    paintSoundBtn();
    if (sound.enabled) sound.bead();
  });
  paintSoundBtn();

  const savedBpm = parseInt(localStorage.getItem('npv-bpm'), 10);
  const metronome = new Metronome({ bpm: Number.isFinite(savedBpm) ? savedBpm : 60 });
  const metroBtn = $('metroBtn'), metroBeat = $('metroBeat'), metroBpm = $('metroBpm'), metroBpmVal = $('metroBpmVal');
  const paintMetro = () => { metroBtn.textContent = metronome.running ? '⏸ Metronome' : '▶ Metronome'; metroBtn.classList.toggle('on', metronome.running); };
  metronome.onBeat = (_beat, accent) => {
    metroBeat.classList.toggle('accent', accent);
    metroBeat.classList.remove('pulse');
    void metroBeat.offsetWidth;
    metroBeat.classList.add('pulse');
  };
  metroBtn.addEventListener('click', () => {
    metronome.toggle();
    if (!metronome.running) metroBeat.classList.remove('pulse', 'accent');
    paintMetro();
  });
  metroBpm.value = metronome.bpm;
  metroBpm.addEventListener('input', () => {
    const v = metronome.setBpm(+metroBpm.value);
    metroBpmVal.textContent = v;
    localStorage.setItem('npv-bpm', String(v));
  });
  metroBpmVal.textContent = metronome.bpm;
  paintMetro();

  // --- Views (observers of the store) ---------------------------------------
  const soroban = new SorobanView($('soroban'), {
    onToggleSky: (kind, idx) => { dispatch(new ToggleSkyCommand(store, kind, idx)); sound.bead(); },
    onClickEarth: (kind, idx, bead) => { dispatch(new ClickEarthCommand(store, kind, idx, bead)); sound.bead(); },
  });
  soroban.init();

  const readout = new ReadoutView({
    valueEl: $('numValue'), inputEl: $('numInput'), incBtn: $('incBtn'), decBtn: $('decBtn'), decodeEl: $('decode'),
  });
  store.subscribe(s => soroban.update(s));
  store.subscribe(s => readout.update(s));

  // --- Set-number controls --------------------------------------------------
  $('setBtn').addEventListener('click', () => dispatch(new SetValueCommand(store, $('numInput').value)));
  $('clearBtn').addEventListener('click', () => dispatch(new SetValueCommand(store, '0')));
  $('incBtn').addEventListener('click', () => dispatch(new StepIntCommand(store, +1)));
  $('decBtn').addEventListener('click', () => dispatch(new StepIntCommand(store, -1)));
  $('numInput').addEventListener('keypress', e => { if (e.key === 'Enter') dispatch(new SetValueCommand(store, e.target.value)); });
  $('numInput').addEventListener('keydown', e => { if (e.key === 'Escape') e.target.blur(); });
  $('randBtn').addEventListener('click', () => {
    const intDigits = Math.floor(Math.random() * 7), fracDigits = Math.floor(Math.random() * (FRAC_COLS + 1));
    const iv = Math.floor(Math.random() * Math.pow(10, intDigits));
    let fs = ''; for (let k = 0; k < fracDigits; k++) fs += Math.floor(Math.random() * 10);
    dispatch(new SetValueCommand(store, iv + (fs ? '.' + fs : '')));
  });
  undoBtn.addEventListener('click', () => { bus.undo(); refreshUndo(); });

  // --- Keyboard arithmetic (home-row soroban moves with live coaching) ------
  const KEYMAP = {
    KeyJ: { sign: +1, amount: 1 }, KeyK: { sign: +1, amount: 2 }, KeyL: { sign: +1, amount: 3 }, Semicolon: { sign: +1, amount: 4 },
    KeyU: { sign: +1, amount: 5 }, KeyI: { sign: +1, amount: 10 },
    KeyF: { sign: -1, amount: 1 }, KeyD: { sign: -1, amount: 2 }, KeyS: { sign: -1, amount: 3 }, KeyA: { sign: -1, amount: 4 },
    KeyR: { sign: -1, amount: 5 }, KeyE: { sign: -1, amount: 10 },
  };
  const MOVE_KEYS = {
    '+1': 'J', '+2': 'K', '+3': 'L', '+4': ';', '+5': 'U', '+10': 'I',
    '-1': 'F', '-2': 'D', '-3': 'S', '-4': 'A', '-5': 'R', '-10': 'E',
  };
  const keysFor = move => {
    const toks = move.split(/\s+/);
    return toks.every(t => MOVE_KEYS[t]) ? toks.map(t => MOVE_KEYS[t]).join(' then ') : null;
  };

  const coachEl = $('coach');
  let focus = 0;
  const MIN_EXP = -FRAC_COLS, MAX_EXP = INT_COLS - 1;
  const colDigit = e => e >= 0 ? Math.floor(store.intValue() / Math.pow(10, e)) % 10 : rodValue(store.frac[-e - 1]);
  const placeName = e => e >= 0 ? (INT_PLACES[e] || `10^${e}`) : (FRAC_PLACES[-e - 1] || `10^${e}`);
  const setFocus = e => { focus = Math.max(MIN_EXP, Math.min(MAX_EXP, e)); soroban.highlightColumn(focus); };

  // A page (e.g. the tutorial) can register a fault sink; a rejected move or a
  // reset is reported to it so the page can spoil a "clean" solve.
  let faultHook = () => {};

  function applyMove(sign, amount) {
    const c = colDigit(focus);
    const place = placeName(focus);
    const nbr = placeName(focus + 1);
    const op = `${sign > 0 ? '+' : '−'}${amount}`;
    let legal, reason, hint = null;
    if (amount === 10) {
      const hasNext = focus + 1 <= MAX_EXP;
      const next = hasNext ? colDigit(focus + 1) : 0;
      legal = hasNext && earthMoveLegal(next, 1, sign);
      if (!legal) reason = !hasNext ? 'no column beyond the top'
        : sign > 0 ? `${nbr} can’t take a carry bead (it’s at ${next})` : `${nbr} has no earth bead to borrow (it’s at ${next})`;
    } else if (amount === 5) {
      legal = heavenMoveLegal(c, sign);
      if (!legal) { reason = sign > 0 ? 'heaven bead already set' : 'heaven bead not set'; hint = (sign > 0 ? classifyAdd : classifySub)(c, 5).move; }
    } else {
      legal = earthMoveLegal(c, amount, sign);
      if (!legal) { reason = sign > 0 ? 'not enough free earth beads' : 'not enough active earth beads'; hint = (sign > 0 ? classifyAdd : classifySub)(c, amount).move; }
    }
    if (!legal) {
      let msg = `<span class="warn">⚠ ${op} on ${place} — illegal</span>: ${reason}`;
      if (hint) { const keys = keysFor(hint); msg += ` · use <span class="move">${hint.replace(/-/g, '−')}</span>${keys ? ` (${keys})` : ''}`; }
      coachEl.innerHTML = msg;
      sound.reject();
      faultHook();
      return;
    }
    dispatch(new AddAtColumnCommand(store, focus, amount, sign));
    if (amount === 10) sound.carry(sign); else sound.bead(sign);
    setFocus(focus);
    let detail;
    if (amount === 10) detail = sign > 0 ? `carry 1 → ${nbr}` : `borrow 1 ← ${nbr}`;
    else { const what = amount === 5 ? 'heaven bead' : `${amount} earth bead${amount > 1 ? 's' : ''}`; detail = `${what} → ${place} now ${colDigit(focus)}`; }
    coachEl.innerHTML = `<span class="rule direct">${op}</span> on ${place} — ${detail}`;
  }

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (/^[0-9]$/.test(e.key) || e.key === '.') {
      e.preventDefault();
      const inp = $('numInput'); inp.value = e.key === '.' ? '0.' : e.key; inp.focus(); return;
    }
    if (e.code === 'ArrowLeft' || e.code === 'KeyG') { e.preventDefault(); setFocus(focus + 1); return; }
    if (e.code === 'ArrowRight' || e.code === 'KeyH') { e.preventDefault(); setFocus(focus - 1); return; }
    if (e.code === 'KeyQ') { e.preventDefault(); faultHook(); dispatch(new SetValueCommand(store, '0')); coachEl.textContent = 'reset — cleared to 0'; sound.reset(); return; }
    const mv = KEYMAP[e.code];
    if (mv) { e.preventDefault(); applyMove(mv.sign, mv.amount); }
  });

  return {
    store, dispatch, bus, soroban, readout, sound, metronome, coachEl,
    setFocus, refreshUndo,
    setFaultHook(fn) { faultHook = fn; },
    // The shell's three top-level chunks, so a page can rearrange them (e.g.
    // pull the live board into its own practice panel). Moving DOM nodes keeps
    // their ids and listeners, so everything above stays wired.
    parts: { readout: $('shellReadout'), board: $('shellBoard'), setter: $('shellSetter') },
    // Pull the board's content (soroban + coach + sound row) out of its own
    // panel and into `slotEl`, removing the now-empty panel shell.
    adoptBoard(slotEl) {
      const board = $('shellBoard');
      while (board.firstChild) slotEl.appendChild(board.firstChild);
      board.remove();
    },
    // Paint once after a page has attached its own store subscribers.
    start() { store.notify(store); refreshUndo(); setFocus(0); },
  };
}
