// ============================================================================
// TutorialView — DOM binding for guided practice. It observes a TutorialSession
// and renders the level map, current problem, a live automaticity timer, streak
// meter and verdict; it forwards button intent back to the session. The actual
// bead manipulation happens on the shared soroban panel (same store) with the
// keyboard — this panel only shows the problem and tracks progress. Auto-advance
// uses an injected scheduler; the live timer uses setInterval (browser-only).
// The session's `idle`/`resume` events freeze and un-freeze this display so it
// mirrors the excluded idle gap (the session is the authoritative timer).
// ============================================================================
export class TutorialView {
  constructor(elements, session, { scheduler = (fn, ms) => setTimeout(fn, ms) } = {}) {
    this.el = elements;
    this.session = session;
    this.scheduler = scheduler;
    this._activeIdx = null;
    this._timer = null;
    this._t0 = 0;
    this._floorMs = 0;
    this._pausedMs = 0;   // display time excluded while idle (mirrors the session)
    this._pauseStart = 0; // clock time this display pause began
  }

  _now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

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

  _secs(ms) { return (ms / 1000).toFixed(1); }

  _meter(streak, floor, floorMs) {
    let dots = '';
    for (let i = 0; i < floor; i++) dots += i < streak ? '●' : '○';
    return `<span class="tut-dots">${dots}</span> <span class="tut-count">${streak}/${floor} clean in a row · under ${this._secs(floorMs)}s each</span>`;
  }

  // Live countdown from problem start, so the speed target is felt, not just
  // reported. Turns red once the time floor is blown.
  _startTimer(floorMs) {
    this._stopTimer();
    this._t0 = this._now();
    this._floorMs = floorMs;
    this._pausedMs = 0;
    this._runTimer();
  }

  // (Re)start the ticking interval, showing elapsed minus the excluded idle time.
  _runTimer() {
    if (this._timer) clearInterval(this._timer);
    const tick = () => {
      const el = this._now() - this._t0 - this._pausedMs;
      const over = el > this._floorMs;
      this.el.timerEl.className = 'tut-timer' + (over ? ' over' : '');
      this.el.timerEl.innerHTML = `⏱ ${this._secs(el)}s <span class="tut-floor">/ ${this._secs(this._floorMs)}s</span>`;
    };
    tick();
    this._timer = setInterval(tick, 100);
  }

  _stopTimer() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }

  // Idle: freeze the display. `sinceMs` back-dates the excluded gap to the last
  // answer (matching the session), and the whole away-span is excluded on resume.
  _pauseTimer(sinceMs) {
    if (!this._timer) return;      // no running timer to pause
    clearInterval(this._timer);
    this._timer = null;
    this._pausedMs += sinceMs || 0;
    this._pauseStart = this._now();
    this.el.timerEl.className = 'tut-timer idle';
    this.el.timerEl.innerHTML = '⏸ timer stopped — no answer';
  }

  _resumeTimer() {
    if (this._timer) return;       // already running
    this._pausedMs += this._now() - this._pauseStart;
    this._runTimer();
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
        el.meterEl.innerHTML = this._meter(evt.streak, evt.floor, evt.timeFloorMs);
        el.feedbackEl.innerHTML = '';
        this._startTimer(evt.timeFloorMs);
        break;
      case 'idle':
        this._pauseTimer(evt.sinceMs);
        break;
      case 'resume':
        this._resumeTimer();
        break;
      case 'solved': {
        this._stopTimer();
        el.meterEl.innerHTML = this._meter(evt.streak, evt.floor, evt.timeFloorMs);
        const t = `${this._secs(evt.elapsedMs)}s`;
        if (evt.justPassed) {
          el.feedbackEl.innerHTML = `<span class="ok">✓ ${t} — level cleared, next level unlocked!</span>`;
          this._renderLevels(evt.levels);
        } else if (evt.clean) {
          el.feedbackEl.innerHTML = `<span class="ok">✓ ${t}</span>`;
        } else if (evt.verdict === 'slow') {
          el.feedbackEl.innerHTML = `<span class="bad">⚠ too slow — ${t} (need under ${this._secs(evt.timeFloorMs)}s)</span> · streak reset`;
        } else {
          el.feedbackEl.innerHTML = `<span class="bad">✗ fumbled (illegal move or reset)</span> · streak reset`;
        }
        this.scheduler(() => this.session.next(), evt.clean ? 850 : 1500);
        break;
      }
      case 'hint':
        el.feedbackEl.innerHTML = `<span class="tut-hint">💡 ${evt.text}</span>`;
        break;
      case 'skipped':
        this._stopTimer();
        el.timerEl.innerHTML = '';
        el.feedbackEl.innerHTML = `<span class="bad">answer:</span> <span class="tut-hint">${evt.text}</span> · streak reset — try it now`;
        break;
      case 'stopped':
        this._stopTimer();
        el.stageEl.classList.remove('on');
        break;
    }
  }
}
