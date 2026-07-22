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
import { earthMoveLegal, classifyAdd, classifySub } from './domain/soroban.js';
import { planAdd, planSub, stepsText, keysText } from './domain/movePlan.js';
import { digitFromFaces } from './domain/faces.js';
import { AbacusStore } from './state/abacusStore.js';
import { CommandBus, SetValueCommand, StepIntCommand, AddAtColumnCommand, ToggleSkyCommand, ClickEarthCommand } from './state/commands.js';
import { SorobanView } from './view/sorobanView.js';
import { mountTouchPad } from './view/touchPad.js';
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
    <div class="touchpad" id="touchPad"></div>
    <div class="coach" id="coach"><span class="kbg"><b class="kbl">column</b> <kbd>←</kbd><kbd>→</kbd> or <kbd>G</kbd><kbd>H</kbd></span><span class="kbg"><b class="kbl">add ·die cross</b> <kbd>K</kbd>1 <kbd>J</kbd>2 <kbd>I</kbd>3 <kbd>,</kbd>4 <kbd>L</kbd>5 · <kbd>U</kbd> +10</span><span class="kbg"><b class="kbl">sub</b> <kbd>D</kbd>1 <kbd>S</kbd>2 <kbd>E</kbd>3 <kbd>C</kbd>4 <kbd>F</kbd>5 · <kbd>R</kbd> −10</span><span class="kbg"><b class="kbl">chords</b> <kbd>L+J</kbd>7 <kbd>L+I</kbd>8 <kbd>L+,</kbd>9 <kbd>L+K</kbd>6</span><span class="kbg"><b class="kbl">reset</b> <kbd>Q</kbd></span><span class="kbg"><b class="kbl">number</b> type <kbd>0</kbd>–<kbd>9</kbd></span></div>
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

  // --- Keyboard arithmetic: the die-cross home clusters ---------------------
  // Each hand IS the digit's die face — center 1, left 2, top 3, bottom 4,
  // right 5 (rose) — so the keys you hold spell the digit's lit cells. The right
  // hand adds, the left mirrors it for subtraction (same layout; the hand is the
  // sign). Holding cells together is a CHORD: left+right = 7, up+right = 8, … —
  // resolved by digitFromFaces (the inverse of the die grid). The ±10 carry is
  // not a die cell, so it keeps its own keys (U / R).
  const ADD_CELLS = { KeyK: 'center', KeyJ: 'left', KeyI: 'top', Comma: 'bottom', KeyL: 'right' };
  const SUB_CELLS = { KeyD: 'center', KeyS: 'left', KeyE: 'top', KeyC: 'bottom', KeyF: 'right' };
  const CHORD_MS = 45; // cells pressed within this window group into one digit
  let chord = null;    // { sign, cells: Set<pos>, timer } — the pending press
  const coachEl = $('coach');
  let focus = 0;
  const MIN_EXP = -FRAC_COLS, MAX_EXP = INT_COLS - 1;
  const colDigit = e => rodValue(e >= 0 ? store.int[e] : store.frac[-e - 1]);  // per-rod: exact past 15 digits
  const placeName = e => e >= 0 ? (INT_PLACES[e] || `10^${e}`) : (FRAC_PLACES[-e - 1] || `10^${e}`);
  // A page can watch focus (the rod your keys land on) to drive its own
  // indicator — e.g. the practice page's rod rail. Fires on every focus change,
  // keyboard or programmatic.
  let focusHook = () => {};
  // The shell's own focus watchers (the touch pad's rod label) run beside the
  // page's hook rather than through it, so a page that sets its own hook cannot
  // accidentally silence the pad.
  let shellFocusHooks = [];
  const setFocus = e => {
    focus = Math.max(MIN_EXP, Math.min(MAX_EXP, e));
    soroban.highlightColumn(focus);
    for (const fn of shellFocusHooks) fn(focus);
    focusHook(focus);
  };

  // A page (e.g. the tutorial) can register a fault sink; a rejected move or a
  // reset is reported to it so the page can spoil a "clean" solve — and with
  // enough context ({kind, rule, amount}) to diagnose WHICH trade was missed.
  let faultHook = () => {};

  // The beads a whole digit lands on this rod (for the coach line).
  const beadWord = d => d === 5 ? 'heaven bead'
    : d < 5 ? `${d} earth bead${d > 1 ? 's' : ''}` : `heaven + ${d - 5} earth`;

  // Add/subtract a whole digit d (1..9) on the focused rod — STRICT: it lands
  // only if it fits directly (classifyAdd/Sub === 'direct', which already covers
  // the compound 6-9 = rose + earth). Otherwise it is rejected with the exact
  // complement chain to key by hand, and reported to the fault sink — the same
  // contract the single-key moves used, so the practice fumble chart is unchanged.
  function applyDigit(sign, d) {
    if (!d) return;
    const c = colDigit(focus);
    const place = placeName(focus);
    const op = `${sign > 0 ? '+' : '−'}${d}`;
    const cl = sign > 0 ? classifyAdd(c, d) : classifySub(c, d);
    if (cl.rule !== 'direct') {
      const plan = (sign > 0 ? planAdd : planSub)(c, d);
      const keys = keysText(plan.steps);
      coachEl.innerHTML = `<span class="warn">⚠ ${op} on ${place} — needs a ${plan.rule === 'big' ? 'carry' : 'five'} trade</span>: use <span class="move">${stepsText(plan.steps)}</span>${keys ? ` (${keys})` : ''}`;
      sound.reject();
      faultHook({ kind: 'illegal', rule: plan.rule, amount: d, sign });
      return;
    }
    dispatch(new AddAtColumnCommand(store, focus, d, sign));
    sound.digit(d, sign);
    setFocus(focus);
    coachEl.innerHTML = `<span class="rule direct">${op}</span> on ${place} — ${sign > 0 ? 'set' : 'clear'} ${beadWord(d)} → ${place} now ${colDigit(focus)}`;
  }

  // The ±10 carry/borrow — a bead on the NEXT rod, not a die cell of this one.
  function applyCarry(sign) {
    const place = placeName(focus);
    const nbr = placeName(focus + 1);
    const op = `${sign > 0 ? '+' : '−'}10`;
    const hasNext = focus + 1 <= MAX_EXP;
    const next = hasNext ? colDigit(focus + 1) : 0;
    if (!(hasNext && earthMoveLegal(next, 1, sign))) {
      const reason = !hasNext ? 'no column beyond the top'
        : sign > 0 ? `${nbr} can’t take a carry bead (it’s at ${next})` : `${nbr} has no earth bead to borrow (it’s at ${next})`;
      coachEl.innerHTML = `<span class="warn">⚠ ${op} on ${place} — illegal</span>: ${reason}`;
      sound.reject();
      faultHook({ kind: 'illegal', rule: null, amount: 10, sign });
      return;
    }
    dispatch(new AddAtColumnCommand(store, focus, 10, sign));
    sound.carry(sign);
    setFocus(focus);
    coachEl.innerHTML = `<span class="rule direct">${op}</span> on ${place} — ${sign > 0 ? `carry 1 → ${nbr}` : `borrow 1 ← ${nbr}`}`;
  }

  // Chord accumulator: die-cell keys pressed within CHORD_MS group into one
  // digit (a single key is just a one-cell "chord"). An opposite-hand key first
  // commits the pending group, so add and subtract never blur together.
  function flushChord() {
    if (!chord) return;
    const { sign, cells, timer } = chord;
    clearTimeout(timer);
    chord = null;
    const d = digitFromFaces([...cells]); // null for a non-die combo → ignored
    if (d) applyDigit(sign, d);
  }
  function pushCell(sign, cell) {
    if (chord && chord.sign !== sign) flushChord();
    if (!chord) chord = { sign, cells: new Set(), timer: null };
    chord.cells.add(cell);
    clearTimeout(chord.timer);
    chord.timer = setTimeout(flushChord, CHORD_MS);
  }

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    // Die-cross cells (single key or chord): accumulate, don't fire yet.
    const cell = ADD_CELLS[e.code] || SUB_CELLS[e.code];
    if (cell) { e.preventDefault(); if (!e.repeat) pushCell(ADD_CELLS[e.code] ? +1 : -1, cell); return; }
    // Any other key commits a pending chord first, preserving move order.
    flushChord();
    if (/^[0-9]$/.test(e.key) || e.key === '.') {
      e.preventDefault();
      const inp = $('numInput'); inp.value = e.key === '.' ? '0.' : e.key; inp.focus(); return;
    }
    if (e.code === 'ArrowLeft' || e.code === 'KeyG') { e.preventDefault(); setFocus(focus + 1); return; }
    if (e.code === 'ArrowRight' || e.code === 'KeyH') { e.preventDefault(); setFocus(focus - 1); return; }
    if (e.code === 'KeyQ') { e.preventDefault(); faultHook({ kind: 'reset' }); dispatch(new SetValueCommand(store, '0')); coachEl.textContent = 'reset — cleared to 0'; sound.reset(); return; }
    if (e.code === 'KeyU') { e.preventDefault(); applyCarry(+1); return; }
    if (e.code === 'KeyR') { e.preventDefault(); applyCarry(-1); return; }
  });

  // --- Fit the board to its panel width -------------------------------------
  // The board's bead geometry is fixed px, so a full 23-rod strip is wider than
  // the reading column. `zoom` scales the whole subtree *including its layout
  // box* (unlike transform), so it just fits — no overflow, gap, or click
  // offset. The one-screen game page runs its own transform-based fitBoard, so
  // this is skipped there. natW is the fixed natural width, measured once.
  if (!document.body.classList.contains('page-game')) {
    const soroEl = $('soroban');
    let natW = 0;
    const fitBoard = () => {
      const wrap = soroEl.parentElement; // .soroban-wrap
      // clientWidth counts the wrap's own horizontal padding as usable room,
      // but the board sits *inside* that padding — fitting to the full
      // clientWidth leaves it a few px too wide, and `overflow-x: auto` then
      // shows a scrollbar. Fit to the content box (clientWidth minus padding).
      const cs = getComputedStyle(wrap);
      const avail = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (avail <= 0) return;
      if (!natW) { soroEl.style.zoom = ''; natW = soroEl.offsetWidth; }
      soroEl.style.zoom = (natW && natW > avail) ? String(avail / natW) : '';
    };
    new ResizeObserver(fitBoard).observe(mountEl);
    fitBoard();
  }

  // --- The touch pad --------------------------------------------------------
  // The same handlers the keyboard calls, so a tap is a keypress in every way
  // that matters — including being rejected with the complement to compose.
  // Skipped on the one-screen game cockpit, which has no room for it and whose
  // board is a popup over the village.
  let pad = null;
  if (!document.body.classList.contains('page-game')) {
    pad = mountTouchPad($('touchPad'), {
      applyDigit,
      applyCarry,
      stepFocus: dir => setFocus(focus + dir),
      reset: () => { faultHook({ kind: 'reset' }); dispatch(new SetValueCommand(store, '0')); coachEl.textContent = 'reset — cleared to 0'; sound.reset(); },
    });
  } else {
    const slot = $('touchPad');
    if (slot) slot.remove();
  }
  // The pad's rod label follows the same focus hook a page would use, without
  // taking it: setFocusHook is the page's, this is the shell's own.
  const paintFocus = e => { if (pad) pad.setFocusLabel(`place ${placeName(e)}`); };

  return {
    store, dispatch, bus, soroban, readout, sound, metronome, coachEl,
    setFocus, refreshUndo,
    setFaultHook(fn) { faultHook = fn; },
    setFocusHook(fn) { focusHook = fn; },
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
    start() { shellFocusHooks.push(paintFocus); store.notify(store); refreshUndo(); setFocus(0); },
  };
}
