// ============================================================================
// Vault page — composition root for vault.html.
//
// Like Today it mounts no board: a stored code may be far longer than the 19
// rods can hold, and going through the board would round-trip it via BigInt and
// eat any leading zeros. It encodes the STRING, through the codec's `encode`.
//
// The single clock seam is `todayKey()`, the same UTC day axis the streak uses.
// ============================================================================
import { mountNav } from '../nav.js';
import { LocalStorageProgressStore } from '../tutorial/progressStore.js';
import { Vault } from '../vault/vaultStore.js';
import { verifyRecall } from '../vault/verify.js';
import { statusOf, daysUntilDue } from '../vault/schedule.js';
import { lociFor, canReveal } from '../vault/entry.js';
import { codecForRadix } from '../domain/codec/codec.js';
import { VaultView } from '../view/vaultView.js';
import { lociHTML } from '../view/deepPackView.js';
import { figure, figVault } from '../view/figures.js';
import { DayLog } from '../today/dayLog.js';

const $ = id => document.getElementById(id);
mountNav('vault');

const todayKey = () => new Date().toISOString().slice(0, 10);
const vault = new Vault(new LocalStorageProgressStore(window.localStorage, 'npv-vault'));
// A completed recall is real work: it marks the day like every other page.
const dayLog = new DayLog(new LocalStorageProgressStore(window.localStorage, 'npv-days'));

let current = null;     // the entry being recalled
let lastResult = null;  // its verdict, so the grade buttons know what happened

const view = new VaultView({
  headEl: $('vaultHead'), listEl: $('vaultList'), statusEl: $('vaultStatus'),
  addForm: $('vaultAddForm'), labelEl: $('vaultLabel'), codeEl: $('vaultCode'),
  radixEl: $('vaultRadix'), modeEl: $('vaultMode'),
  stageEl: $('vaultStage'), stageTitleEl: $('vaultStageTitle'), stageMetaEl: $('vaultStageMeta'),
  recallForm: $('vaultRecallForm'), recallEl: $('vaultRecall'), verdictEl: $('vaultVerdict'),
  gradeRow: $('vaultGrade'), gotBtn: $('vaultGot'), missedBtn: $('vaultMissed'),
  revealBtn: $('vaultReveal'), skipBtn: $('vaultSkip'), scenesEl: $('vaultScenes'),
}, {
  onAdd: ({ label, code, radix, mode }) => {
    const r = vault.add({ label, code, radix, mode, today: todayKey() });
    if (!r.ok) { view.status(r.error, 'bad'); return; }
    $('vaultLabel').value = '';
    $('vaultCode').value = '';
    view.status(
      `Stored “${r.entry.label}” — ${r.entry.seals.length} ${r.entry.seals.length === 1 ? 'locus' : 'loci'}` +
      (r.entry.mode === 'sealed' ? ', sealed (the digits were not kept).' : '.') +
      ' Recall it now, while the scenes are warm.', 'ok');
    render();
    study(r.entry.id);
  },
  onStudy: id => study(id),
  onRemove: id => {
    const e = vault.get(id);
    if (!e) return;
    // Removing is the one destructive action here and a sealed entry cannot be
    // reconstructed, so it asks — with the label, so it is clear what goes.
    if (!window.confirm(`Forget “${e.label}”? This cannot be undone.`)) return;
    vault.remove(id);
    if (current && current.id === id) { current = null; view.closeStage(); }
    view.status(`Forgot “${e.label}”.`, '');
    render();
  },
  onReview: typed => {
    if (!current) return;
    lastResult = verifyRecall(current, typed);
    view.showVerdict(lastResult, current);
  },
  onGrade: ok => {
    if (!current) return;
    vault.recordReview(current.id, ok, todayKey());
    dayLog.mark();
    const e = vault.get(current.id);
    const d = daysUntilDue(e, todayKey());
    view.status(`“${e.label}” — next review in ${d} day${d === 1 ? '' : 's'}.`, ok ? 'ok' : '');
    current = null; lastResult = null;
    view.closeStage();
    render();
  },
  onReveal: () => {
    if (!current || !canReveal(current)) return;
    view.reveal(scenesFor(current.code, current.radix));
  },
  onSkip: () => { current = null; lastResult = null; view.closeStage(); },
}).build();

function scenesFor(code, radix) {
  const codec = codecForRadix(radix);
  return lociHTML(lociFor(code, radix), codec, { inScope: code.length >= 8 });
}

function study(id) {
  const e = vault.get(id);
  if (!e) return;
  current = e;
  lastResult = null;
  // The scenes are built up front but hidden — Reveal only unhides them, and
  // for a sealed entry there is nothing to build in the first place.
  view.startRecall(e, canReveal(e) ? scenesFor(e.code, e.radix) : '');
  $('vaultStage').scrollIntoView({ block: 'nearest' });
}

function render() {
  const today = todayKey();
  const entries = vault.all();
  // Due first, then by due date; a stable order so the list does not shuffle
  // under the learner between renders.
  const sorted = [...entries].sort((a, b) => {
    const da = daysUntilDue(a, today) ?? -999, db = daysUntilDue(b, today) ?? -999;
    return da - db || String(a.id).localeCompare(String(b.id));
  });
  view.renderList(sorted, today, vault.stats(today));

  $('figVault').innerHTML = figure(1,
    'When each stored number next comes up, on a log day-axis. The bar is its current interval — from the last review to the next — so a number you keep missing shows as a short bar pinned near today. Overdue sits left of the red rule. 🔒 marks a sealed entry.',
    figVault(sorted.map(e => {
      const st = statusOf(e, today);
      return { label: e.label, days: daysUntilDue(e, today), interval: e.interval || 0, status: st.label, sealed: e.mode === 'sealed' };
    }), today));
}

render();
