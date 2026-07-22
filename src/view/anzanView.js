// ============================================================================
// AnzanView — the flash stage. It observes an AnzanSession and renders exactly
// what it is told; it owns no state and decides nothing.
//
// The one visual rule that matters: while a round is running the screen holds
// NOTHING but the number. Anzan fails on the first stray thing to read — a
// streak counter ticking, a hint reappearing — so `.az-running` blanks the
// chrome rather than merely dimming it, and the number sits in a fixed-height
// box so the layout cannot shift under a change of digit count.
// ============================================================================

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class AnzanView {
  constructor(els, session, { onStart, onSpeed, onNext } = {}) {
    this.els = els;
    this.session = session;
    this.onStart = onStart || (() => {});
    this.onSpeed = onSpeed || (() => {});
    this.onNext = onNext || (() => {});
  }

  build() {
    this.els.levelsEl.addEventListener('click', e => {
      const b = e.target.closest('button[data-level]');
      if (b) this.onStart(b.dataset.level);
    });
    this.els.slowerBtn.addEventListener('click', () => this.onSpeed(-1));
    this.els.fasterBtn.addEventListener('click', () => this.onSpeed(1));
    this.els.nextBtn.addEventListener('click', () => this.onNext());
    this.els.form.addEventListener('submit', e => {
      e.preventDefault();
      const v = this.els.inputEl.value;
      if (this.session.accepting) { this.session.submit(v); this.els.inputEl.value = ''; }
      else this.onNext();
    });
    this.session.subscribe(evt => this._on(evt));
    return this;
  }

  renderLevels(rows, activeId) {
    this.els.levelsEl.innerHTML = rows.map(r => {
      const cls = [r.id === activeId ? 'active' : '', r.cleared ? 'cleared' : ''].filter(Boolean).join(' ');
      const badge = r.fastest ? `<span class="az-pb">${r.fastest}ms</span>` : '';
      return `<button data-level="${esc(r.id)}"${cls ? ` class="${cls}"` : ''}>${esc(r.title)}${badge}</button>`;
    }).join('');
  }

  _running(on) {
    this.els.stageEl.classList.toggle('az-running', on);
  }

  _on(evt) {
    const E = this.els;
    switch (evt.type) {
      case 'started':
        E.teachEl.innerHTML = evt.teach;
        E.stageEl.hidden = false;
        this._paceLine(evt.intervalMs, evt.roundMs);
        this._scoreLine(evt);
        E.feedbackEl.textContent = '';
        E.feedbackEl.className = 'az-feedback';
        break;

      case 'flash':
        this._running(true);
        E.numberEl.textContent = String(evt.value);
        E.numberEl.classList.remove('blank');
        E.progressEl.textContent = `${evt.index + 1} / ${evt.total}`;
        E.inputEl.disabled = true;
        E.nextBtn.hidden = true;
        break;

      case 'blank':
        // Cleared, not hidden — the box must keep its height or the next number
        // lands somewhere else on screen and the eye has to re-find it.
        E.numberEl.textContent = '';
        E.numberEl.classList.add('blank');
        break;

      case 'answer':
        this._running(false);
        E.numberEl.textContent = '=';
        E.numberEl.classList.add('blank');
        E.progressEl.textContent = '';
        E.inputEl.disabled = false;
        E.inputEl.value = '';
        E.inputEl.focus();
        break;

      case 'speed':
        this._paceLine(evt.intervalMs, evt.roundMs);
        break;

      case 'result': {
        E.numberEl.textContent = String(evt.sum);
        E.numberEl.classList.toggle('blank', false);
        E.inputEl.disabled = true;
        E.nextBtn.hidden = false;
        E.nextBtn.focus();
        const sum = `${evt.terms.join(' + ')} = <b>${evt.sum}</b>`;
        E.feedbackEl.className = `az-feedback ${evt.ok ? 'ok' : 'bad'}`;
        E.feedbackEl.innerHTML = evt.ok
          ? `${evt.justPassed ? '🎌 ' : '✓ '}${sum}${evt.justPassed ? ` — level carried at ${evt.intervalMs} ms` : ''}`
          : `✗ ${sum} — you said <b>${evt.given == null ? '—' : evt.given}</b>`;
        this._scoreLine(evt);
        break;
      }

      case 'stopped':
        this._running(false);
        E.stageEl.hidden = true;
        break;
    }
  }

  _paceLine(intervalMs, roundMs) {
    this.els.paceEl.textContent = `${intervalMs} ms per number · ${(roundMs / 1000).toFixed(1)} s per round`;
  }

  _scoreLine(evt) {
    const parts = [`streak ${evt.streak} / ${evt.floor}`];
    if (evt.best) parts.push(`best ${evt.best}`);
    if (evt.fastest) parts.push(`cleared at ${evt.fastest} ms`);
    this.els.scoreEl.textContent = parts.join(' · ');
  }
}
