// ============================================================================
// Today page — composition root for index.html, the app's front door.
//
// It is the only page that reads EVERY store at once, and the only one that
// mounts no board: nothing here is practised, so there is no soroban, no
// keyboard and no audio context to pay for. It builds one profile, plans one
// session from it, and renders. The single clock seam is `todayKey()` below —
// the whole day axis is UTC (see src/today/dayKey.js) and this is where that
// decision is made.
// ============================================================================
import { mountNav } from '../nav.js';
import { TUTORIAL_LEVELS } from '../tutorial/levels.js';
import { DRILL_DECKS } from '../drill/decks.js';
import { ROD_MODES } from '../domain/mulDiv.js';
import { ANZAN_LEVELS } from '../anzan/levels.js';
import { AnzanLog } from '../anzan/anzanLog.js';
import { YOMIAGE_LEVELS } from '../yomiage/levels.js';
import { Vault } from '../vault/vaultStore.js';
import { EXAM_GRADES } from '../exam/grades.js';
import { ExamLog } from '../exam/examLog.js';
import { LocalStorageProgressStore, TutorialProgress } from '../tutorial/progressStore.js';
import { LocalStorageStatsStore, DrillStatsService } from '../drill/statsStore.js';
import { SolveLog } from '../tutorial/solveLog.js';
import { FaultLog } from '../tutorial/faultLog.js';
import { GameSave } from '../game/saveStore.js';
import { AchievementTracker } from '../game/achievementTracker.js';
import { DayLog } from '../today/dayLog.js';
import { harvestDays } from '../today/harvest.js';
import { buildProfile } from '../today/profile.js';
import { todaysPlan } from '../today/plan.js';
import { retentionSummary } from '../review/skills.js';
import { Checklist } from '../today/checklist.js';
import { exportSave, importSave, validateSave } from '../today/transfer.js';
import { TodayView } from '../view/todayView.js';
import { figure, figStreak, figLadder, figRetention } from '../view/figures.js';
import { REVIEW_AT } from '../review/decay.js';

const $ = id => document.getElementById(id);
mountNav('today');

const LS = window.localStorage;
const store = key => new LocalStorageProgressStore(LS, key);
// The one place the day boundary is decided. UTC, to match every stamp already
// written by the app — see the header of src/today/dayKey.js.
const todayKey = () => new Date().toISOString().slice(0, 10);

const progress = new TutorialProgress(store('npv-tutorial-progress'));
const practiceLog = new SolveLog(store('npv-practice-history'));
const trainerLog = new SolveLog(store('npv-trainer-progress'));
const stats = new DrillStatsService(new LocalStorageStatsStore(LS));
const faults = new FaultLog(store('npv-fault-log'));
const save = new GameSave(store('npv-game-save'));
const achievements = new AchievementTracker(store('npv-achievements'));
const dayLog = new DayLog(store('npv-days'));
const anzanLog = new AnzanLog(store('npv-anzan'));
// The read-aloud page scores exactly like anzan (the pace a rung was carried
// at), so it is the same log class on its own key.
const yomiageLog = new AnzanLog(store('npv-yomiage'));
const vault = new Vault(store('npv-vault'));
const examLog = new ExamLog(store('npv-exam'));

// Backfill once, so a learner who has been practising for months doesn't see a
// zero-day streak the first time this page loads. Reads the raw blobs (the
// harvest tolerates anything) rather than the services, and is a no-op forever
// after — exactly AchievementTracker.seed's contract.
const raw = key => { try { return JSON.parse(LS.getItem(key)); } catch { return null; } };
dayLog.seedFrom(harvestDays({
  drillStats: raw('npv-drill-stats'),
  practiceHistory: raw('npv-practice-history'),
  trainerHistory: raw('npv-trainer-progress'),
  achievements: raw('npv-achievements'),
}));

const checklist = new Checklist(store('npv-today'), { today: todayKey() });

const view = new TodayView({
  headEl: $('todayHead'), planEl: $('todayPlan'), planMsgEl: $('todayMsg'),
  planTotalEl: $('todayTotal'), mentalEl: $('todayMental'), faultsEl: $('todayFaults'),
  villageEl: $('todayVillage'), retentionEl: $('todayRetention'), statusEl: $('todayStatus'),
  exportBtn: $('todayExport'), importBtn: $('todayImportBtn'),
  importEl: $('todayImport'), importFile: $('todayImportFile'),
}, {
  onToggle: id => { checklist.toggle(id); render(); },
  onExport: () => downloadSave(),
  onImport: text => doImport(text),
}).build();

function render() {
  const today = todayKey();
  const profile = buildProfile({
    levels: TUTORIAL_LEVELS, decks: DRILL_DECKS, modes: ROD_MODES, anzanRungs: ANZAN_LEVELS,
    yomiageRungs: YOMIAGE_LEVELS, examGrades: EXAM_GRADES,
    progress, practiceLog, trainerLog, stats, faults, save, achievements, dayLog,
    anzanLog, yomiageLog, vault, examLog,
    support: parseInt(LS.getItem('npv-support'), 10) || 0,
    today,
  });
  const plan = todaysPlan(profile);
  // Derived, never stored: the schedule is a pure function of the logs the app
  // already keeps (see src/review/decay.js).
  const retention = retentionSummary(profile);
  // A task counts as done if it was ticked OR the profile already shows work on
  // it today — practice done before opening this page still counts.
  for (const t of plan.tasks) t.done = t.autoDone || checklist.isDone(t.id);
  const done = plan.tasks.filter(t => t.done).length;

  view.render({ profile, plan, done, retention });

  $('figStreak').innerHTML = figure(1,
    'Calendar days you practised, one cell per day in weekday rows — a habit reads as a solid block, a lapse as a hole. Today carries the vermilion ring.',
    figStreak(profile.days, today));
  $('figLadder').innerHTML = figure(2,
    'Best clean streak per level (bars) against the streak each level demands (red tick). A red seal marks a cleared level; locked levels are dimmed.',
    figLadder(profile.practice.levels));
  $('figRetention').innerHTML = figure(3,
    'What the decay model says is left of every track you have practised, most faded first. The bar is retention now; the vermilion rule is the point at which a rep is worth taking, so anything reaching left of it is due — and it is the same axis for a tutorial level, a drill deck and a paced rung, which is what lets the plan rank them against each other.',
    figRetention(retention.rows, REVIEW_AT));
}

// --- Save transfer ----------------------------------------------------------
function fileFor(obj, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadSave(prefix = 'soroban-save') {
  const blob = exportSave(LS);
  fileFor(blob, `${prefix}-${blob.exportedAt.slice(0, 10)}.json`);
  return blob;
}

function doImport(text) {
  let obj;
  try { obj = JSON.parse(text); }
  catch { view.status('That is not valid JSON.', 'bad'); return; }

  const check = validateSave(obj);
  if (!check.ok) { view.status(check.errors.join(' '), 'bad'); return; }

  // Import overwrites live progress, so bank a copy of what is here first —
  // the one destructive action in the app gets an automatic undo.
  downloadSave('soroban-save-before-import');

  const res = importSave(LS, obj);
  if (!res.ok) { view.status(res.errors.join(' ') || 'Nothing was imported.', 'bad'); return; }
  $('todayImport').value = '';
  view.status(
    `Restored ${res.written.length} key${res.written.length === 1 ? '' : 's'}.` +
    (res.skipped.length ? ` Skipped ${res.skipped.length} unknown.` : '') +
    ' A copy of your previous save was downloaded first.', 'ok');
  // Everything downstream was read at construction — reload rather than try to
  // re-seat eight stores in place.
  setTimeout(() => location.reload(), 1200);
}

render();
