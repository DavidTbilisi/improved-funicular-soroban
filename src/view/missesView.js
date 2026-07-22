// ============================================================================
// MissesView — the mistake book, open on one page.
//
// It renders what the queue hands it and owns no state. The one judgement in
// here is what a wrong answer shows: the right answer, immediately and without
// being asked. This is not a test — the entry is already a known miss, and
// withholding the answer twice in a row teaches nothing but frustration. The
// entry stays in the book either way; only two rights in a row take it out.
// ============================================================================

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const PAGE_LABEL = {
  drills: '🎴 drills', exam: '📜 exam', anzan: '⚡ anzan', yomiage: '👂 read-aloud',
  practice: '🧮 practice', trainer: '✖️ trainer', game: '🏮 village',
};

export class MissesView {
  constructor(els, { onAnswer, onSkip, onRemove, onClear } = {}) {
    this.els = els;
    this.on = { onAnswer, onSkip, onRemove, onClear };
    this.current = null;
  }

  build() {
    const E = this.els;
    E.form.addEventListener('submit', e => {
      e.preventDefault();
      if (this.current) this.on.onAnswer(this.current.key, E.inputEl.value);
    });
    E.skipBtn.addEventListener('click', () => this.on.onSkip());
    E.clearBtn.addEventListener('click', () => this.on.onClear());
    E.listEl.addEventListener('click', e => {
      const btn = e.target.closest('button[data-key]');
      if (btn) this.on.onRemove(btn.dataset.key);
    });
    return this;
  }

  // --- the one entry being worked ------------------------------------------
  ask(entry) {
    const E = this.els;
    this.current = entry;
    if (!entry) {
      E.stageEl.hidden = true;
      return;
    }
    E.stageEl.hidden = false;
    E.sourceEl.textContent = entry.source || '';
    E.metaEl.textContent = `missed ${entry.misses}×` + (entry.right ? ` · one right banked, one to go` : '');
    E.promptEl.innerHTML = entry.prompt || esc(entry.key);
    E.subEl.innerHTML = entry.sub || '';
    E.verdictEl.textContent = '';
    E.verdictEl.className = 'ms-verdict';
    E.inputEl.value = '';
    E.inputEl.disabled = false;
    E.inputEl.focus();
  }

  verdict(ok, entry, retired) {
    const E = this.els;
    E.verdictEl.className = `ms-verdict ${ok ? 'ok' : 'bad'}`;
    E.verdictEl.innerHTML = ok
      ? (retired
        ? `✓ <b>right</b> — twice in a row, so it comes out of the book.`
        : `✓ <b>right</b> — once more and it is out.`)
      // The answer, unasked: this entry is already a known miss, and hiding it
      // a second time teaches nothing.
      : `✗ the answer is <b>${esc(entry.answers[0])}</b>.`;
  }

  // --- the book -------------------------------------------------------------
  render(entries, stats) {
    const E = this.els;
    E.headEl.innerHTML =
      `<span class="ms-open${stats.open ? ' on' : ''}">📕 ${stats.open} open</span>` +
      (stats.nearlyOut ? `<span class="ms-near">${stats.nearlyOut} half-cleared</span>` : '') +
      (stats.retired ? `<span class="ms-done">${stats.retired} worked off</span>` : '');

    E.listEl.innerHTML = entries.length
      ? entries.map(e =>
        `<li class="ms-row${e.right ? ' near' : ''}">` +
          `<span class="ms-row-src">${esc(e.source || '—')}</span>` +
          `<span class="ms-row-q">${e.prompt || esc(e.key)}</span>` +
          `<span class="ms-row-n" title="Times missed">×${e.misses}</span>` +
          `<span class="ms-row-p">${esc(PAGE_LABEL[e.page] || '')}</span>` +
          `<button data-key="${esc(e.key)}" title="Strike it out without working it">✕</button>` +
        `</li>`).join('')
      : '<li class="ms-row empty">Nothing in the book. Every page that grades an answer writes its misses here — drills, kyu papers, flash anzan, read-aloud.</li>';
  }
}
