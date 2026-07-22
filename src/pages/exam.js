// ============================================================================
// Kyu exam page — composition root for exam.html.
//
// THE BOARD IS THE ANSWER SHEET. Every other answering page in the app takes a
// typed answer, which would be the wrong seam here: an exam sat with a soroban
// is one where you work the beads and read the total off the board, and typing
// the number somewhere else makes the abacus optional. So this page mounts the
// full board shell and hands in `store.intValue()` — which also keeps the whole
// home-row keyboard live, since nothing on the page holds focus.
//
// The clock is the page's: the session takes `now` and is ticked from here, the
// same arrangement AnzanSession has with its timer, so a whole paper (including
// a section timing out mid-question) is walkable in the unit suite.
// ============================================================================
import { mountNav } from '../nav.js';
import { mountBoardShell } from '../boardShell.js';
import { SetValueCommand } from '../state/commands.js';
import { MathRng } from '../drill/rng.js';
import { EXAM_GRADES, gradeById, nextGrade, describeGrade } from '../exam/grades.js';
import { ExamSession } from '../exam/examSession.js';
import { ExamLog } from '../exam/examLog.js';
import { ExamView } from '../view/examView.js';
import { LocalStorageProgressStore } from '../tutorial/progressStore.js';
import { DayLog } from '../today/dayLog.js';
import { targetFromSearch } from '../today/deepLink.js';
import { figure, figExam } from '../view/figures.js';

const $ = id => document.getElementById(id);
mountNav('exam');

const log = new ExamLog(new LocalStorageProgressStore(window.localStorage, 'npv-exam'));
// A sat paper is real work — it marks the day like every other practising page.
const dayLog = new DayLog(new LocalStorageProgressStore(window.localStorage, 'npv-days'));

const shell = mountBoardShell($('examBoard'), { intVal: 0, fracStr: '' });

const session = new ExamSession({
  grades: EXAM_GRADES,
  rng: new MathRng(),
  log,
  clock: { now: () => performance.now() },
});

const view = new ExamView({
  gradesEl: $('examGrades'), stageEl: $('examStage'), titleEl: $('examTitle'),
  sectionEl: $('examSection'), descEl: $('examDesc'), counterEl: $('examCounter'),
  clockEl: $('examClock'), questionEl: $('examQuestion'), answerEl: $('examAnswer'),
  submitBtn: $('examSubmit'), skipBtn: $('examSkip'), abandonBtn: $('examAbandon'),
  expiredEl: $('examExpired'), paperEl: $('examPaper'), sheetEl: $('examSheet'),
  mentalEl: $('examMental'),
}, session, {
  onStart: id => { clearBoard(); session.start(id); },
  onSubmit: () => handIn(),
  onSkip: () => { session.skip(); clearBoard(); },
  onAbandon: () => { session.abandon(); render(); },
}).build();

// --- Handing in --------------------------------------------------------------
// The integer rods only: every answer on this paper is a whole number, so a
// stray bead below the point cannot change what is handed in.
function handIn() {
  if (!session.active) return;
  session.submit(shell.store.intValue().toString());
  clearBoard();
}

const clearBoard = () => shell.dispatch(new SetValueCommand(shell.store, '0'));

// The answer chip follows the board — what you are about to hand in has to be
// readable without counting beads back.
shell.store.subscribe(s => view.setAnswer(s.intValue().toString()));

// Enter hands in. The board shell's own keydown already ignores INPUT targets,
// and so does this: while the value box has focus, Enter belongs to it.
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (!session.active) return;
  e.preventDefault();
  handIn();
});

// --- The clock ---------------------------------------------------------------
// One interval for the page's lifetime; the session ignores ticks when no paper
// is in flight, so there is nothing to start and stop.
setInterval(() => session.tick(), 250);

// --- Rendering ---------------------------------------------------------------
// The 暗算 section fades the beads to the mnemonic-mental track's Mental stage
// — imagined rods, hidden by `visibility` so nothing reflows. This is the one
// exam condition a paper cannot enforce and this page can: the keys still move
// the rods, you simply cannot read them. Everything else restores the board.
session.subscribe(e => {
  if (e.type === 'section') shell.soroban.setSupport(e.kind === 'anzan' ? 2 : 0);
  if (e.type === 'finished' || e.type === 'abandoned') shell.soroban.setSupport(0);
  if (e.type === 'finished') { dayLog.mark(); render(); }
});

function rows() {
  const passed = new Set(log.passedIds());
  return EXAM_GRADES.map(g => ({
    id: g.id, name: g.name, kyu: g.kyu, desc: describeGrade(g),
    best: log.best(g.id), passed: passed.has(g.id), attempts: log.attempts(g.id).length,
  }));
}

// A deep-linked grade (Today's plan sends one) is highlighted, never auto-started:
// a timed paper that begins because a page loaded is a paper you did not sit.
const wanted = targetFromSearch(location.search, 'exam');
const linked = gradeById(wanted) ? wanted : null;

function render() {
  const r = rows();
  const next = nextGrade(log.passedIds());
  const focusId = linked || (next ? next.id : null);
  view.renderGrades(r, focusId);

  $('figExam').innerHTML = figure(1,
    'Best score on each grade against the 70-point pass mark, hardest at the top — ten kyu grades and then the dan ones. A filled mark on the rule means the grade is held: every one of its sections reached 70 in the same sitting. Grades you have not sat keep their row, so the whole climb stays in view.',
    figExam(r, focusId));

  const history = log.attempts().slice(-8).reverse();
  $('examHistory').innerHTML = history.length
    ? history.map(a => {
      const g = gradeById(a.gradeId);
      return `<li class="${a.passed ? 'pass' : 'fail'}">` +
        `<span class="exh-grade">${g ? g.name : a.gradeId}</span>` +
        `<span class="exh-score">${a.score}/100</span>` +
        `<span class="exh-secs">${a.sections.map(s => `<i class="${s.passed ? 'ok' : 'bad'}">${s.score}</i>`).join('')}</span>` +
        `<span class="exh-when">${String(a.t).replace('T', ' ')}</span>` +
        `<span class="exh-verdict">${a.passed ? '合格' : '不合格'}</span>` +
      `</li>`;
    }).join('')
    : '<li class="empty">No papers sat yet.</li>';
}

render();
if (linked) $('examGrades').querySelector(`button[data-id="${linked}"]`)?.scrollIntoView({ block: 'nearest' });
shell.start();
