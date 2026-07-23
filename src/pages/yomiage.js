// ============================================================================
// Read-aloud page (読上算) — composition root for yomiage.html.
//
// It mounts the full board shell, like the kyu exam and for the same reason:
// the beads are where the numbers land as they are called, and the board holds
// the running total, so handing in is just reading it (`store.intValue()`).
// Nothing on the page holds focus, which keeps the home-row keyboard live.
//
// The speech engine is injected as the session's `voice` port (VoiceService),
// and the gap between calls as its `timer` — the same arrangement AnzanSession
// has, so the whole round is walkable against a fake voice in the unit suite.
//
// If the browser has no voice, the page turns its captions on and says why: a
// soundless caller is still a usable exercise, a silent frozen one is not.
// ============================================================================
import { mountNav } from '../nav.js';
import { mountBoardShell } from '../boardShell.js';
import { SetValueCommand } from '../state/commands.js';
import { MathRng } from '../drill/rng.js';
import { YOMIAGE_LEVELS, GAPS, gapStep } from '../yomiage/levels.js';
import { YomiageSession } from '../yomiage/yomiageSession.js';
import { AnzanLog } from '../anzan/anzanLog.js';
import { VoiceService } from '../view/voiceService.js';
import { YomiageView } from '../view/yomiageView.js';
import { LocalStorageProgressStore } from '../tutorial/progressStore.js';
import { DayLog } from '../today/dayLog.js';
import { MissQueue } from '../review/misses.js';
import { targetFromSearch } from '../today/deepLink.js';
import { figure, figAnzan } from '../view/figures.js';

const $ = id => document.getElementById(id);
mountNav('yomiage');

// The record shape a dictation round needs is the flash-anzan one exactly —
// "correct at a 2000 ms gap" and "correct at 600 ms" are different results, and
// the score is the fastest pace ever carried to the rung's floor. So this is an
// AnzanLog on its own key rather than a second class saying the same thing.
const log = new AnzanLog(new LocalStorageProgressStore(window.localStorage, 'npv-yomiage'));
const dayLog = new DayLog(new LocalStorageProgressStore(window.localStorage, 'npv-days'));
// A called round that got away: the column goes in the mistake book, where it
// can be read rather than heard.
const misses = new MissQueue(new LocalStorageProgressStore(window.localStorage, 'npv-misses'));

const savedRate = parseFloat(localStorage.getItem('npv-voice-rate'));
const voice = new VoiceService({ rate: Number.isFinite(savedRate) ? savedRate : 1 });

const shell = mountBoardShell($('ymBoard'), { intVal: 0, fracStr: '' });

const session = new YomiageSession({
  levels: YOMIAGE_LEVELS,
  rng: new MathRng(),
  log,
  voice,
  timer: { set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id) },
});

let activeId = null;

const clearBoard = () => shell.dispatch(new SetValueCommand(shell.store, '0'));

const view = new YomiageView({
  levelsEl: $('ymLevels'), stageEl: $('ymStage'), teachEl: $('ymTeach'),
  paceEl: $('ymPace'), scoreEl: $('ymScore'), progressEl: $('ymProgress'),
  cueEl: $('ymCue'), captionEl: $('ymCaption'), captionsEl: $('ymCaptions'),
  silentEl: $('ymSilent'), rateEl: $('ymRate'), rateValEl: $('ymRateVal'),
  answerEl: $('ymAnswer'), submitBtn: $('ymSubmit'), nextBtn: $('ymNext'),
  slowerBtn: $('ymSlower'), fasterBtn: $('ymFaster'), stopBtn: $('ymStop'),
  feedbackEl: $('ymFeedback'),
}, session, {
  onStart: id => { activeId = id; session.start(id, savedGap(id)); render(); },
  onSpeed: dir => {
    const next = gapStep(session.gapMs, dir);
    session.setSpeed(next);
    if (activeId) localStorage.setItem(`npv-yomiage-gap:${activeId}`, String(next));
  },
  onNext: () => session.newRound(),
  onStop: () => { session.stop(); activeId = null; render(); },
  onSubmit: () => handIn(),
  onRate: r => { view.setRate(voice.setRate(r)); localStorage.setItem('npv-voice-rate', String(voice.rate)); },
  onCaptions: on => {
    captionsWanted = on;
    localStorage.setItem('npv-yomiage-cc', on ? 'on' : 'off');
    applyCaptions();
  },
}).build();

// Captions are OFF by default — a visible number is a different and easier
// exercise — but with no voice installed they are the only thing making the
// page usable, so they are forced on and the note says why.
let captionsWanted = localStorage.getItem('npv-yomiage-cc') === 'on';
const applyCaptions = () => view.setCaptions(captionsWanted || !voice.available, !voice.available);

function handIn() {
  if (!session.accepting) return;
  session.submit(shell.store.intValue().toString());
}

// The chosen pace is per rung and worth keeping — it is the learner's current
// working difficulty, and re-picking it every visit would be busywork.
function savedGap(id) {
  const v = parseInt(localStorage.getItem(`npv-yomiage-gap:${id}`), 10);
  return GAPS.includes(v) ? v : null;
}

shell.store.subscribe(s => view.setAnswer(s.intValue().toString()));

// Enter hands in, or takes the next round once one is marked. The board shell's
// keydown already ignores INPUT targets and so does this — while the value box
// has focus, Enter belongs to it.
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (session.accepting) { e.preventDefault(); handIn(); return; }
  if (session.active && !$('ymNext').hidden) { e.preventDefault(); session.newRound(); }
});

session.subscribe(e => {
  // "Ready" is the cue to clear the board, so the page clears it for you —
  // starting a round on last round's total is the one mistake this exercise
  // cannot recover from.
  if (e.type === 'call' && e.kind === 'open') clearBoard();
  if (e.type === 'result') {
    dayLog.mark();
    if (!e.ok) {
      misses.add({
        key: `yomiage:${e.terms.join('+')}`,
        source: `Read-aloud · ${(YOMIAGE_LEVELS.find(l => l.id === activeId) || {}).title || ''}`.trim(),
        page: 'yomiage',
        prompt: e.terms.map((t, i) => (i === 0 ? String(t) : t < 0 ? `− ${-t}` : `+ ${t}`)).join(' '),
        sub: 'the column that got away — add it and type the total',
        answers: [String(e.sum)],
      });
    }
    render();
  }
});

// --- Rendering ---------------------------------------------------------------
const rowsFor = () => YOMIAGE_LEVELS.map(l => ({
  id: l.id, title: l.title, baseMs: l.baseGap, floor: l.floor,
  best: log.best(l.id), fastest: log.fastest(l.id),
  cleared: log.fastest(l.id) !== null,
  rounds: log.rounds(l.id).length, accuracy: log.accuracy(l.id),
}));

function render() {
  const rows = rowsFor();
  view.renderLevels(rows, activeId);
  $('figYomiage').innerHTML = figure(1,
    'The fastest gap between calls each rung has been carried at, on a log pace axis — further right is a shorter gap, which is harder. A hollow mark is a rung with rounds behind it but no unbroken streak yet.',
    figAnzan(rows, { what: 'dictation rung' }));
}

view.setRate(voice.rate);
applyCaptions();
// Chrome fills its voice list asynchronously, so "no voice" at load can become
// "a voice" a moment later — re-decide rather than leaving the captions forced.
voice.onVoicesReady(() => applyCaptions());
render();

const wanted = targetFromSearch(location.search, 'yomiage');
if (wanted && YOMIAGE_LEVELS.some(l => l.id === wanted)) {
  // Deep-linked, but not auto-started: a caller that begins because a page
  // loaded is a round you did not hear the start of.
  view.renderLevels(rowsFor(), wanted);
  $('ymLevels').querySelector(`button[data-level="${wanted}"]`)?.scrollIntoView({ block: 'nearest' });
}
shell.start();
