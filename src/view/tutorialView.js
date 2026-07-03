// ============================================================================
// TutorialView — DOM binding for guided practice. It observes a TutorialSession
// and renders the level map, current problem, streak meter and feedback; it
// forwards button intent back to the session. The actual bead manipulation
// happens on the shared soroban panel (same store) with the keyboard — this
// panel only shows the problem and tracks progress. Auto-advance uses an
// injected scheduler so it is trivial to control/stub.
// ============================================================================
export class TutorialView {
  constructor(elements, session, { scheduler = (fn, ms) => setTimeout(fn, ms) } = {}) {
    this.el = elements;
    this.session = session;
    this.scheduler = scheduler;
    this._activeIdx = null;
  }

  build() {
    this.session.subscribe(evt => this._onEvent(evt));
    this.el.hintBtn.addEventListener('click', () => this.session.hint());
    this.el.skipBtn.addEventListener('click', () => this.session.skip());
    this.el.restartBtn.addEventListener('click', () => this.session.restart());
    this._renderLevels(this.session.levelInfos());
    return this;
  }

  _renderLevels(infos) {
    this.el.levelsEl.innerHTML = infos.map(l => {
      const cls = ['tut-level', l.idx === this._activeIdx ? 'active' : '', l.unlocked ? '' : 'locked'].filter(Boolean).join(' ');
      const lock = l.unlocked ? '' : '🔒 ';
      const cleared = l.best >= l.floor ? ' <span class="tut-clear">✓</span>' : '';
      return `<button class="${cls}" data-idx="${l.idx}"${l.unlocked ? '' : ' disabled'}>${lock}${l.idx + 1}. ${l.title}${cleared}</button>`;
    }).join('');
    this.el.levelsEl.querySelectorAll('button').forEach(b =>
      b.addEventListener('click', () => this.session.startLevel(+b.dataset.idx)));
  }

  _meter(streak, floor) {
    let dots = '';
    for (let i = 0; i < floor; i++) dots += i < streak ? '●' : '○';
    return `<span class="tut-dots">${dots}</span> <span class="tut-count">${streak}/${floor} in a row to unlock</span>`;
  }

  _onEvent(evt) {
    const el = this.el;
    switch (evt.type) {
      case 'level':
        this._activeIdx = evt.idx;
        this._renderLevels(evt.levels);
        el.stageEl.classList.add('on');
        el.teachEl.innerHTML = evt.teach;
        el.feedbackEl.innerHTML = '';
        break;
      case 'problem':
        el.promptEl.innerHTML = evt.prompt;
        el.subEl.textContent = evt.sub;
        el.meterEl.innerHTML = this._meter(evt.streak, evt.floor);
        el.feedbackEl.innerHTML = '';
        break;
      case 'solved':
        el.meterEl.innerHTML = this._meter(evt.streak, evt.floor);
        if (evt.justPassed) {
          el.feedbackEl.innerHTML = '<span class="ok">✓ level cleared — next level unlocked!</span>';
          this._renderLevels(evt.levels);
        } else {
          el.feedbackEl.innerHTML = '<span class="ok">✓ correct</span>';
        }
        this.scheduler(() => this.session.next(), 850);
        break;
      case 'hint':
        el.feedbackEl.innerHTML = `<span class="tut-hint">💡 ${evt.text}</span>`;
        break;
      case 'skipped':
        el.meterEl.innerHTML = this._meter(0, evt.floor);
        el.feedbackEl.innerHTML = `<span class="bad">answer:</span> <span class="tut-hint">${evt.text}</span> · streak reset — try it now`;
        break;
      case 'stopped':
        el.stageEl.classList.remove('on');
        break;
    }
  }
}
