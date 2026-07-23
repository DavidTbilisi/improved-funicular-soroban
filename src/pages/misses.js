// ============================================================================
// Mistake book page — composition root for misses.html.
//
// It mounts no board and no session: every entry here was already graded
// somewhere else, and what is left is a typed answer against the accepted
// spellings the producing page recorded. The queue owns every policy decision
// (see src/review/misses.js); this file only asks and shows.
// ============================================================================
import { mountNav } from '../nav.js';
import { LocalStorageProgressStore } from '../tutorial/progressStore.js';
import { MissQueue } from '../review/misses.js';
import { MissesView } from '../view/missesView.js';
import { DayLog } from '../today/dayLog.js';

const $ = id => document.getElementById(id);
mountNav('misses');

const queue = new MissQueue(new LocalStorageProgressStore(window.localStorage, 'npv-misses'));
// Working the book is practice like any other, and marks the day.
const dayLog = new DayLog(new LocalStorageProgressStore(window.localStorage, 'npv-days'));

// Skipped entries go to the back of tonight's queue rather than out of the
// book: skipping is "not this one now", not "I have dealt with this".
const skipped = new Set();

const view = new MissesView({
  headEl: $('msHead'), listEl: $('msList'), stageEl: $('msStage'),
  sourceEl: $('msSource'), metaEl: $('msMeta'), promptEl: $('msPrompt'), subEl: $('msSub'),
  form: $('msForm'), inputEl: $('msInput'), verdictEl: $('msVerdict'),
  skipBtn: $('msSkip'), clearBtn: $('msClear'),
}, {
  onAnswer: (key, typed) => {
    const entry = queue.all().find(e => e.key === key);
    if (!entry) { render(); return; }
    const ok = queue.check(entry, typed);
    if (ok === null) return;                       // empty box: not an attempt
    const res = queue.record(key, ok);
    dayLog.mark();
    view.verdict(ok, entry, !!(res && res.retired));
    $('msInput').disabled = true;
    // A beat to read the verdict, then the next one. Long enough to take in the
    // answer you were shown, short enough not to be a pause.
    setTimeout(() => { render(); ask(); }, ok ? 900 : 2200);
  },
  onSkip: () => { if (view.current) skipped.add(view.current.key); ask(); },
  onRemove: key => { queue.remove(key); skipped.delete(key); render(); ask(); },
  onClear: () => {
    if (!queue.all().length) return;
    if (!window.confirm('Strike out the whole book? The entries go without being worked.')) return;
    queue.clear();
    skipped.clear();
    render();
    ask();
  },
}).build();

function nextEntry() {
  const due = queue.due();
  return due.find(e => !skipped.has(e.key)) || due[0] || null;
}

function ask() { view.ask(nextEntry()); }

function render() { view.render(queue.due(), queue.stats()); }

render();
ask();
