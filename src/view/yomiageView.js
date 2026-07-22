// ============================================================================
// YomiageView — the dictation stage. It observes a YomiageSession and renders
// what it is told; it owns no state and decides nothing.
//
// There is almost nothing to draw here, and that is the design: the numbers are
// SPOKEN, so the screen carries only what an ear cannot — which term is being
// called, and the board you are setting it on. The one thing it must never do
// is show the number, so the captions are opt-in and off by default. They exist
// for the case where nothing can be heard at all (no speech engine, sound off),
// where a visible call is the difference between a hard exercise and a broken
// page — and the page says so in those words when it turns them on for you.
// ============================================================================

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class YomiageView {
  constructor(els, session, { onStart, onSpeed, onNext, onStop, onSubmit, onRate, onCaptions } = {}) {
    this.els = els;
    this.session = session;
    this.on = {
      onStart: onStart || (() => {}), onSpeed: onSpeed || (() => {}),
      onNext: onNext || (() => {}), onStop: onStop || (() => {}),
      onSubmit: onSubmit || (() => {}), onRate: onRate || (() => {}),
      onCaptions: onCaptions || (() => {}),
    };
    this.captions = false;
  }

  build() {
    const E = this.els;
    E.levelsEl.addEventListener('click', e => {
      const b = e.target.closest('button[data-level]');
      if (b) this.on.onStart(b.dataset.level);
    });
    E.slowerBtn.addEventListener('click', () => this.on.onSpeed(-1));
    E.fasterBtn.addEventListener('click', () => this.on.onSpeed(1));
    E.nextBtn.addEventListener('click', () => this.on.onNext());
    E.stopBtn.addEventListener('click', () => this.on.onStop());
    E.submitBtn.addEventListener('click', () => this.on.onSubmit());
    E.rateEl.addEventListener('input', () => this.on.onRate(Number(E.rateEl.value)));
    E.captionsEl.addEventListener('change', () => this.on.onCaptions(E.captionsEl.checked));
    this.session.subscribe(evt => this._on(evt));
    return this;
  }

  renderLevels(rows, activeId) {
    this.els.levelsEl.innerHTML = rows.map(r => {
      const cls = [r.id === activeId ? 'active' : '', r.cleared ? 'cleared' : ''].filter(Boolean).join(' ');
      const badge = r.fastest ? `<span class="ym-pb">${r.fastest}ms</span>` : '';
      return `<button data-level="${esc(r.id)}"${cls ? ` class="${cls}"` : ''}>${esc(r.title)}${badge}</button>`;
    }).join('');
  }

  setCaptions(on, forced = false) {
    this.captions = !!on;
    this.els.captionsEl.checked = !!on;
    this.els.captionEl.hidden = !on;
    this.els.silentEl.hidden = !forced;
  }

  setRate(r) {
    this.els.rateEl.value = String(r);
    this.els.rateValEl.textContent = `${r.toFixed(1)}×`;
  }

  // The board's running total, shown as what is about to be handed in.
  setAnswer(text) { this.els.answerEl.textContent = text; }

  _paceLine(gapMs) {
    this.els.paceEl.textContent = `${gapMs} ms between calls`;
  }

  _scoreLine(evt) {
    const parts = [`streak ${evt.streak || 0} / ${evt.floor}`];
    if (evt.best) parts.push(`best ${evt.best}`);
    if (evt.fastest) parts.push(`record ${evt.fastest} ms`);
    this.els.scoreEl.textContent = parts.join(' · ');
  }

  _on(evt) {
    const E = this.els;
    switch (evt.type) {
      case 'started':
        E.teachEl.innerHTML = evt.teach;
        E.stageEl.hidden = false;
        this._paceLine(evt.gapMs);
        this._scoreLine(evt);
        E.feedbackEl.textContent = '';
        E.feedbackEl.className = 'ym-feedback';
        break;

      case 'call': {
        E.stageEl.classList.add('ym-calling');
        E.nextBtn.hidden = true;
        E.submitBtn.disabled = true;
        // The opening and the closing are cues, not numbers: they get the word,
        // never a position in the column.
        E.progressEl.textContent = evt.kind === 'term' ? `${evt.index + 1} / ${evt.total}` : '';
        E.cueEl.textContent = evt.kind === 'open' ? '📣' : evt.kind === 'close' ? '❓' : '🔊';
        E.cueEl.classList.remove('pulse');
        void E.cueEl.offsetWidth;                 // restart the animation
        E.cueEl.classList.add('pulse');
        if (this.captions) E.captionEl.textContent = evt.text;
        break;
      }

      case 'answer':
        E.stageEl.classList.remove('ym-calling');
        E.cueEl.textContent = '=';
        E.cueEl.classList.remove('pulse');
        E.progressEl.textContent = '';
        E.submitBtn.disabled = false;
        E.submitBtn.focus();
        break;

      case 'result': {
        const shown = evt.terms.map((t, i) => (i === 0 ? String(t) : t < 0 ? `− ${-t}` : `+ ${t}`)).join(' ');
        E.feedbackEl.className = `ym-feedback ${evt.ok ? 'ok' : 'bad'}`;
        E.feedbackEl.innerHTML = evt.ok
          ? `✓ <b>${evt.sum}</b> — ${evt.justPassed ? `rung carried at ${evt.gapMs} ms` : `streak ${evt.streak}/${evt.floor}`}`
          // The column back, in order. It is the only feedback dictation can
          // give: there is no board to re-read and no flash to replay.
          : `✗ you said <b>${esc(evt.given) || '—'}</b>, the column was <b>${evt.sum}</b><span class="ym-terms">${esc(shown)}</span>`;
        this._scoreLine(evt);
        E.submitBtn.disabled = true;
        E.nextBtn.hidden = false;
        E.nextBtn.focus();
        break;
      }

      case 'speed':
        this._paceLine(evt.gapMs);
        break;

      case 'stopped':
        E.stageEl.hidden = true;
        E.stageEl.classList.remove('ym-calling');
        break;
    }
  }
}
