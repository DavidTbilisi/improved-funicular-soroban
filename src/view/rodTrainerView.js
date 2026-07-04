// ============================================================================
// RodTrainerView — DOM binding for the authentic multiplication/division
// trainer. It observes a RodTrainerSession and renders the mode picker, the
// board layout instruction, and the current rod-placement step; it points the
// shared soroban at the step's target rods through an injected callback. The
// actual bead work happens on the soroban panel above (same store, keyboard) —
// this panel narrates the method and tracks which step you're on.
// ============================================================================
export class RodTrainerView {
  constructor(elements, session, { onTargets = () => {} } = {}) {
    this.el = elements;
    this.session = session;
    this.onTargets = onTargets;
    this._activeMode = null;
  }

  build() {
    this.session.subscribe(evt => this._onEvent(evt));
    this.el.doStepBtn.addEventListener('click', () => this.session.doStep());
    this.el.nextBtn.addEventListener('click', () => this.session.next());
    this.el.stopBtn.addEventListener('click', () => this.session.stop());
    this._renderModes(this.session.modeInfos());
    return this;
  }

  _renderModes(infos) {
    this.el.modesEl.innerHTML = infos.map(m =>
      `<button class="${m.id === this._activeMode ? 'active' : ''}" data-id="${m.id}">${m.label}</button>`).join('');
    this.el.modesEl.querySelectorAll('button').forEach(b =>
      b.addEventListener('click', () => this.session.start(b.dataset.id)));
  }

  _meter(done, total) {
    let dots = '';
    for (let i = 0; i < total; i++) dots += i < done ? '●' : '○';
    return `<span class="rt-dots">${dots}</span> <span class="rt-count">step ${Math.min(done + 1, total)} of ${total}</span>`;
  }

  _onEvent(evt) {
    const el = this.el;
    switch (evt.type) {
      case 'problem':
        this._activeMode = evt.modeId;
        this._total = evt.total;
        this._renderModes(this.session.modeInfos());
        el.stageEl.classList.add('on');
        el.titleEl.textContent = evt.title;
        el.teachEl.innerHTML = evt.teach;
        el.promptEl.innerHTML = evt.prompt.replace('×', '<b>×</b>').replace('÷', '<b>÷</b>');
        el.setupEl.innerHTML = evt.setupInstr;
        el.feedbackEl.innerHTML = '';
        el.nextBtn.disabled = true;
        el.doStepBtn.disabled = false;
        break;
      case 'step':
        el.progressEl.innerHTML = this._meter(evt.done, evt.total);
        el.instrEl.innerHTML = `<span class="rt-kind rt-${evt.kind}">${evt.n}.</span> ${evt.instr}`;
        this.onTargets(evt.targets);
        break;
      case 'solved':
        el.progressEl.innerHTML = this._meter(this._total, this._total);
        el.instrEl.innerHTML = '';
        el.feedbackEl.innerHTML =
          `<span class="ok">✓ done — the answer <b>${evt.answer}</b> reads on rods <b>${evt.answerRodSpan}</b></span>`;
        this.onTargets(evt.answerRods);   // light up where the answer sits
        el.nextBtn.disabled = false;
        el.doStepBtn.disabled = true;
        break;
      case 'stopped':
        el.stageEl.classList.remove('on');
        this.onTargets([]);
        break;
    }
  }
}
