// ============================================================================
// VaultView — the stored-numbers list and the recall stage.
//
// It owns no state: the page hands it a snapshot and it renders. The one rule
// it enforces itself is that a SEALED entry can never be made to show digits —
// there are none to show, and the reveal control is not rendered at all rather
// than rendered-and-disabled, so there is nothing to try.
// ============================================================================
import { statusOf, streakOf } from '../vault/schedule.js';
import { canReveal } from '../vault/entry.js';

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const GROUPS = { new: 'due', due: 'due', overdue: 'due', waiting: 'waiting' };

export class VaultView {
  constructor(els, { onAdd, onReview, onRemove, onStudy, onGrade, onReveal, onSkip } = {}) {
    this.els = els;
    this.on = { onAdd, onReview, onRemove, onStudy, onGrade, onReveal, onSkip };
  }

  build() {
    this.els.addForm.addEventListener('submit', e => {
      e.preventDefault();
      this.on.onAdd({
        label: this.els.labelEl.value,
        code: this.els.codeEl.value,
        radix: this.els.radixEl.value === '16' ? 16 : 10,
        mode: this.els.modeEl.checked ? 'sealed' : 'full',
      });
    });
    this.els.listEl.addEventListener('click', e => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const id = btn.closest('[data-id]').dataset.id;
      if (btn.dataset.act === 'study') this.on.onStudy(id);
      if (btn.dataset.act === 'remove') this.on.onRemove(id);
    });
    this.els.recallForm.addEventListener('submit', e => {
      e.preventDefault();
      this.on.onReview(this.els.recallEl.value);
    });
    this.els.revealBtn.addEventListener('click', () => this.on.onReveal());
    this.els.skipBtn.addEventListener('click', () => this.on.onSkip());
    this.els.gotBtn.addEventListener('click', () => this.on.onGrade(true));
    this.els.missedBtn.addEventListener('click', () => this.on.onGrade(false));
    return this;
  }

  status(msg, kind = '') {
    this.els.statusEl.textContent = msg;
    this.els.statusEl.className = `vault-status${kind ? ` ${kind}` : ''}`;
  }

  renderList(entries, today, stats) {
    this.els.headEl.innerHTML =
      `<span class="vt-count">🔐 ${stats.total} stored</span>` +
      `<span class="vt-due${stats.due ? ' on' : ''}">${stats.due} due today</span>` +
      (stats.digits ? `<span class="vt-digits">${stats.digits} digits held</span>` : '') +
      (stats.sealed ? `<span class="vt-sealed">${stats.sealed} sealed</span>` : '');

    if (!entries.length) {
      this.els.listEl.innerHTML = '<li class="vault-row empty">Nothing stored yet — add a number above and it becomes a scene you can be tested on.</li>';
      return;
    }
    this.els.listEl.innerHTML = entries.map(e => {
      const st = statusOf(e, today);
      const streak = streakOf(e);
      return `<li class="vault-row ${GROUPS[st.state]}" data-id="${esc(e.id)}">` +
        `<span class="vt-label">${esc(e.label)}` +
          `<span class="vt-meta">${e.length} ${e.radix === 16 ? 'hex' : 'digit'}${e.length === 1 ? '' : 's'} · ` +
          `${e.seals.length} ${e.seals.length === 1 ? 'locus' : 'loci'}` +
          `${e.mode === 'sealed' ? ' · <b title="The digits are not stored — only the seals">sealed</b>' : ''}</span>` +
        `</span>` +
        `<span class="vt-streak" title="Successful reviews in a row">${streak ? '●'.repeat(Math.min(streak, 8)) : '·'}</span>` +
        `<span class="vt-status ${st.state}">${st.label}</span>` +
        `<span class="vt-acts">` +
          `<button data-act="study">${st.state === 'waiting' ? 'Review early' : 'Recall'}</button>` +
          `<button data-act="remove" title="Forget this entry">✕</button>` +
        `</span>` +
      `</li>`;
    }).join('');
  }

  // `scenes` is the locus HTML the page builds from the codec; the view does not
  // reach into the codec itself.
  startRecall(entry, scenesHtml) {
    const E = this.els;
    E.stageEl.hidden = false;
    E.stageTitleEl.textContent = entry.label;
    E.stageMetaEl.innerHTML =
      `${entry.length} ${entry.radix === 16 ? 'hex symbols' : 'digits'} · ${entry.seals.length} ${entry.seals.length === 1 ? 'locus' : 'loci'}` +
      (entry.mode === 'sealed'
        ? ' · <b>sealed</b> — the digits were never stored, so this is checked by seal'
        : '');
    E.scenesEl.innerHTML = scenesHtml;
    E.scenesEl.hidden = true;
    E.recallEl.value = '';
    E.recallEl.disabled = false;
    E.recallEl.focus();
    E.verdictEl.textContent = '';
    E.verdictEl.className = 'vault-verdict';
    E.gradeRow.hidden = true;
    E.recallForm.hidden = false;
    // A sealed entry has no answer to show, so the control is absent, not
    // disabled — there must be nothing to try.
    E.revealBtn.hidden = !canReveal(entry);
  }

  showVerdict(result, entry) {
    const E = this.els;
    E.verdictEl.className = `vault-verdict ${result.ok ? 'ok' : 'bad'}`;
    E.verdictEl.innerHTML = esc(result.message) + this._lociBar(result);
    E.recallEl.disabled = true;
    E.recallForm.hidden = true;
    E.gradeRow.hidden = false;
    E.revealBtn.hidden = !canReveal(entry);
  }

  _lociBar(result) {
    if (!result.loci.length) return '';
    return '<span class="vt-loci">' + result.loci.map((l, i) =>
      `<i class="${l.ok ? 'ok' : 'bad'}" title="Locus ${i + 1}${l.wantSeal != null ? ` — seal ${l.wantSeal}, you sealed ${l.seal ?? '—'}` : ''}">${i + 1}</i>`
    ).join('') + '</span>';
  }

  reveal(html) { this.els.scenesEl.hidden = false; this.els.scenesEl.innerHTML = html; }

  closeStage() { this.els.stageEl.hidden = true; }
}
