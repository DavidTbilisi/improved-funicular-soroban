// ============================================================================
// DrillView — DOM binding for the drill. It observes a DrillSession (subscribing
// to its events) and forwards user input back to the session's methods. All
// timing/scoring lives in the session; this file only renders and wires input.
// Auto-advance uses an injected scheduler (setTimeout by default) so it is easy
// to control in a browser and to stub elsewhere.
// ============================================================================
export class DrillView {
  constructor(elements, session, { scheduler = (fn, ms) => setTimeout(fn, ms) } = {}) {
    this.el = elements;
    this.session = session;
    this.scheduler = scheduler;
    this._stopped = false;
  }

  build() {
    const el = this.el;
    el.decksEl.innerHTML = Object.keys(this.session.decks).map(id =>
      `<button data-deck="${id}">${this.session.decks[id].label}</button>`).join('');
    el.decksEl.querySelectorAll('button').forEach(b =>
      b.addEventListener('click', () => this.session.start(b.dataset.deck)));

    el.inputEl.addEventListener('keypress', e => { if (e.key === 'Enter') this._submit(); });
    el.revealBtn.addEventListener('click', () => this.session.reveal());
    el.gotItBtn.addEventListener('click', () => this._grade(true));
    el.missedBtn.addEventListener('click', () => this._grade(false));
    el.stopBtn.addEventListener('click', () => this.session.stop());

    document.addEventListener('keydown', e => {
      if (!this.session.activeDeckId || this.session.mode.isTyped) return;
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space' && !this.session.revealed) { e.preventDefault(); this.session.reveal(); }
      else if (this.session.revealed && (e.key === 'g' || e.key === 'G')) this._grade(true);
      else if (this.session.revealed && (e.key === 'm' || e.key === 'M')) this._grade(false);
    });

    this.session.subscribe(evt => this._onEvent(evt));
  }

  _submit() { this.session.submitTyped(this.el.inputEl.value); }
  _grade(ok) { this.session.grade(ok); }

  _onEvent(evt) {
    switch (evt.type) {
      case 'started': return this._onStarted(evt);
      case 'item': return this._onItem(evt);
      case 'revealed': return this._onRevealed(evt);
      case 'result': return this._onResult(evt);
      case 'stopped': return this._onStopped();
    }
  }

  _onStarted(evt) {
    this._stopped = false;
    this.el.stageEl.className = 'drill-stage on';
    this.el.decksEl.querySelectorAll('button').forEach(b =>
      b.className = b.dataset.deck === evt.deckId ? 'active' : '');
    this.el.bestEl.textContent = evt.best
      ? `best session: ${evt.best.floorPct}% under floor · mean ${evt.best.meanMs}ms · ${evt.best.t}`
      : 'no previous sessions';
  }

  _onItem(evt) {
    const el = this.el;
    const deck = this.session.decks[evt.deckId];
    el.floorEl.textContent = `${deck.label} — floor ${deck.floorMs / 1000}s`;
    el.promptEl.innerHTML = evt.item.prompt;
    el.promptEl.className = 'drill-prompt' + (evt.item.small ? ' small' : '');
    el.subEl.textContent = evt.item.sub || '';
    el.feedbackEl.innerHTML = '';
    el.typeRow.style.display = evt.isTyped ? 'flex' : 'none';
    el.revealRow.style.display = evt.isTyped ? 'none' : 'flex';
    if (evt.isTyped) { el.inputEl.value = ''; el.inputEl.focus(); }
    else {
      el.revealBtn.style.display = '';
      el.gotItBtn.style.display = 'none';
      el.missedBtn.style.display = 'none';
    }
  }

  _onRevealed(evt) {
    this.el.feedbackEl.innerHTML = `<span class="detail">${evt.item.reveal}</span>`;
    this.el.revealBtn.style.display = 'none';
    this.el.gotItBtn.style.display = '';
    this.el.missedBtn.style.display = '';
  }

  _onResult(evt) {
    const { result } = evt;
    this.el.feedbackEl.innerHTML =
      `<span class="${result.cls}">${result.verdict}</span> · ${(result.elapsedMs / 1000).toFixed(2)}s ` +
      `<span class="detail">— ${result.reveal}</span>`;
    const s = result.stats;
    this.el.statsEl.innerHTML =
      `<span>reps <b>${s.n}</b></span><span>accuracy <b>${s.accuracy}%</b></span>` +
      `<span>mean <b>${s.meanMs}ms</b></span><span>under floor <b>${s.floorPct}%</b></span>`;
    this.scheduler(() => { if (!this._stopped) this.session.next(); }, result.nextDelayMs);
  }

  _onStopped() {
    this._stopped = true;
    this.el.stageEl.className = 'drill-stage';
    this.el.decksEl.querySelectorAll('button').forEach(b => b.className = '');
  }
}
