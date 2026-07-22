// ============================================================================
// AchievementsView — the DOM half of achievements: an unlock toast and a
// browsable panel. Observes the AchievementTracker (never mutates it), the same
// contract as every other view. The toast is a fixed-position element above the
// focus backdrop, so an unlock still reads mid-solve without touching the
// no-scroll cockpit grid; the panel clones the help overlay's hidden-toggle.
// ============================================================================
const TOAST_MS = 3200;   // how long a toast lingers before sliding out
const GAP_MS = 340;      // slide-out + gap before the next queued toast

export class AchievementsView {
  constructor({ toastEl, listEl }, tracker) {
    this.toastEl = toastEl;
    this.listEl = listEl;
    this.tracker = tracker;
    this.onShow = null;    // page injects juice (chime + canvas sparkle) here
    this.queue = [];
    this.showing = false;
    tracker.subscribe(evt => { if (evt.type === 'unlocked') this._enqueue(evt.achievement); });
  }

  _enqueue(ach) { this.queue.push(ach); if (!this.showing) this._next(); }

  _next() {
    const ach = this.queue.shift();
    if (!ach) { this.showing = false; return; }
    this.showing = true;
    this.toastEl.innerHTML =
      `<span class="toast-badge">🏆</span>` +
      `<span class="toast-body"><b>Achievement unlocked</b>` +
      `<span>${ach.emoji} ${ach.title}</span></span>`;
    this.toastEl.hidden = false;
    // Reflow between hidden→shown so the CSS transition actually plays.
    this.toastEl.classList.remove('on');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('on');
    if (this.onShow) this.onShow(ach);
    clearTimeout(this._hideT);
    this._hideT = setTimeout(() => {
      this.toastEl.classList.remove('on');
      setTimeout(() => { this.toastEl.hidden = true; this._next(); }, GAP_MS);
    }, TOAST_MS);
  }

  // Repaint the panel from the tracker's states against the live village.
  paintPanel(village) {
    const rows = this.tracker.states(village);
    const done = rows.filter(r => r.done).length;
    this.listEl.innerHTML =
      `<div class="ach-tally">${done} / ${rows.length} unlocked</div>` +
      rows.map(r => {
        const pct = r.target ? Math.round((100 * Math.min(r.cur, r.target)) / r.target) : 100;
        const foot = r.done
          ? `<span class="ach-when">✓ unlocked</span>`
          : `<span class="ach-bar"><i style="width:${pct}%"></i></span>` +
            `<span class="ach-prog">${r.cur} / ${r.target}</span>`;
        return `<div class="ach-row ${r.tier}${r.done ? ' done' : ''}">` +
          `<span class="ach-emoji">${r.emoji}</span>` +
          `<span class="ach-text"><b>${r.title}</b>` +
          `<span class="ach-desc">${r.desc}</span>${foot}</span></div>`;
      }).join('');
  }
}
