// ============================================================================
// TutorialSession — the leveled-practice state machine, DOM-free and Observable
// (same family as DrillSession). Unlike the drill, it doesn't capture a typed
// answer: it drives the shared AbacusStore, seeds each problem's start value,
// and watches the store for the target value.
//
// The gate is AUTOMATICITY, not mere recognition: a solve counts toward the
// streak only when it is CLEAN — correct, under the level's time floor (timed
// from when the problem appears, via an injected clock), and fumble-free (no
// illegal move / reset, reported by the app through fault()). A slow or fumbled
// solve RESETS the streak. A streak of `floor` clean solves unlocks the next
// level (persisted via TutorialProgress).
//
// IDLE PAUSE: the automaticity timer measures *thinking* time, not wall time.
// If the learner stops answering for `idleMs` (default 30s of no bead move), the
// timer stops — the whole idle gap is excluded from the recorded elapsed, so a
// solve interrupted by stepping away isn't judged slow (and doesn't pollute the
// pace/prognosis history). It resumes on the next move. Idle detection needs a
// real timer, so one is injected (`timer.set/clear`, a setTimeout/clearTimeout
// wrapper); the default is a no-op, so without it the timer never pauses.
//
// Emitted events (payload.type):
//   level    { idx, id, title, teach, floor, timeFloorMs, best, levels }
//   problem  { prompt, sub, streak, floor, timeFloorMs }
//   idle     { sinceMs }   // timer stopped — no answer for idleMs
//   resume   {}            // answered again — timer running
//   solved   { clean, verdict, elapsedMs, timeFloorMs, faults, streak, floor, justPassed, unlockedIdx, levels }
//   hint     { text }
//   skipped  { text, floor }
//   locked   { idx }
//   stopped  {}
// ============================================================================
import { Observable } from '../state/observable.js';

export class TutorialSession extends Observable {
  constructor({ levels, progress, rng, store, clock = { now: () => 0 }, history = null,
                timer = { set: () => 0, clear: () => {} }, idleMs = 30000 }) {
    super();
    this.levels = levels;
    this.progress = progress;
    this.rng = rng;
    this.store = store;
    this.clock = clock;
    this.history = history; // optional SolveLog — records every solve for the trend chart
    this.timer = timer;     // { set(fn, ms) -> id, clear(id) } — drives the idle pause
    this.idleMs = idleMs;   // stop the timer after this long with no answer
    this.idx = null;
    this.problem = null;
    this.streak = 0;
    this.solved = false;
    this.armed = false; // ignore store notifications while seeding a problem
    this.t0 = 0;
    this.faults = 0;
    // Idle-pause bookkeeping (see IDLE PAUSE above).
    this.paused = false;
    this.pausedMs = 0;       // total time excluded from elapsed while idle
    this.pauseStart = 0;     // clock time the excluded gap began (= last activity)
    this.lastActivity = 0;   // clock time of the last answer/move
    this._idleId = null;     // pending idle timer handle
    store.subscribe(() => this._onStore());
  }

  get active() { return this.idx !== null; }

  // Snapshot of the ladder for the view (lock state + best streaks).
  levelInfos() {
    return this.levels.map((lv, i) => ({
      idx: i, id: lv.id, title: lv.title, floor: lv.floor,
      unlocked: this.progress.isUnlocked(i), best: this.progress.best(lv.id),
    }));
  }

  startLevel(idx) {
    if (idx < 0 || idx >= this.levels.length) return;
    if (!this.progress.isUnlocked(idx)) { this.notify({ type: 'locked', idx }); return; }
    this.idx = idx;
    this.streak = 0;
    const lv = this.levels[idx];
    this.notify({ type: 'level', idx, id: lv.id, title: lv.title, teach: lv.teach, floor: lv.floor, timeFloorMs: lv.timeFloorMs, best: this.progress.best(lv.id), levels: this.levelInfos() });
    this.newProblem();
  }

  newProblem() {
    if (this.idx === null) return;
    const lv = this.levels[this.idx];
    this.problem = lv.gen(this.rng);
    this.solved = false;
    this.armed = false;
    this.faults = 0;
    this.store.setScaled(this.problem.startScaled); // notify fires while disarmed
    this.armed = true;
    this.t0 = this.clock.now();                      // start the automaticity timer
    this.pausedMs = 0;
    this.paused = false;
    this.lastActivity = this.t0;
    this._armIdle();                                 // stop the timer if no answer for idleMs
    this.notify({ type: 'problem', prompt: this.problem.prompt, sub: this.problem.sub, streak: this.streak, floor: lv.floor, timeFloorMs: lv.timeFloorMs });
  }

  // The app reports a fumble during the active problem (an illegal/rejected move
  // or a reset). Any fault makes the eventual solve non-clean.
  fault() {
    if (this.idx === null || this.solved) return;
    this.faults++;
  }

  _onStore() {
    if (!this.armed || this.solved || this.idx === null) return;
    this._touch(); // a bead moved: resume the timer if idle, and restart the idle countdown
    if (this.store.scaledValue() === BigInt(this.problem.targetScaled)) this._solve();
  }

  // Activity during the active problem: close out any idle gap (excluding it from
  // the elapsed time) and restart the "no answer" countdown from now.
  _touch() {
    const t = this.clock.now();
    if (this.paused) {
      this.pausedMs += t - this.pauseStart; // exclude the whole gap since the last answer
      this.paused = false;
      this.notify({ type: 'resume' });
    }
    this.lastActivity = t;
    this._armIdle();
  }

  _armIdle() {
    this._clearIdle();
    this._idleId = this.timer.set(() => this._goIdle(), this.idleMs);
  }

  _clearIdle() {
    if (this._idleId !== null) { this.timer.clear(this._idleId); this._idleId = null; }
  }

  // No answer for idleMs: stop the timer. The excluded gap is dated back to the
  // last answer, so the whole away-time drops out of the recorded solve — not
  // just the part past idleMs (with sub-second time floors, counting the grace
  // would mark every interrupted solve slow).
  _goIdle() {
    if (this.solved || this.idx === null || this.paused) return;
    this.paused = true;
    this.pauseStart = this.lastActivity;
    this.notify({ type: 'idle', sinceMs: this.clock.now() - this.lastActivity });
  }

  _solve() {
    this._clearIdle();
    if (this.paused) { this.pausedMs += this.clock.now() - this.pauseStart; this.paused = false; }
    this.solved = true;
    this.armed = false;
    const lv = this.levels[this.idx];
    const floor = lv.floor;
    const elapsedMs = Math.max(0, this.clock.now() - this.t0 - this.pausedMs);
    const overTime = elapsedMs > lv.timeFloorMs;
    const clean = !overTime && this.faults === 0;

    // Automaticity gate: only a clean solve advances the streak; slow or fumbled
    // solves reset it. (A correct answer is table stakes — it's how we detect a
    // solve at all — so the verdict is about speed and cleanliness.)
    let verdict;
    if (clean) { this.streak++; verdict = 'clean'; }
    else { this.streak = 0; verdict = this.faults > 0 ? 'fumbled' : 'slow'; }

    if (this.history) this.history.record(lv.id, { ms: elapsedMs, clean });
    this.progress.setBest(lv.id, this.streak);
    let justPassed = false, unlockedIdx = null;
    if (clean && this.streak >= floor) {
      const next = this.idx + 1;
      justPassed = next < this.levels.length && !this.progress.isUnlocked(next);
      this.progress.unlock(Math.min(this.idx + 2, this.levels.length));
      unlockedIdx = next < this.levels.length ? next : null;
    }
    this.notify({
      type: 'solved', clean, verdict, elapsedMs, timeFloorMs: lv.timeFloorMs, faults: this.faults,
      streak: this.streak, floor, justPassed, unlockedIdx, levels: this.levelInfos(),
    });
  }

  hint() {
    if (this.idx === null || !this.problem) return;
    if (!this.solved) this._touch(); // asking for a hint means the learner is present
    const lv = this.levels[this.idx];
    this.notify({ type: 'hint', text: lv.hint ? lv.hint(this.problem) : '' });
  }

  // Give up: reveal the move, reset the streak, re-seed the SAME problem so the
  // user can complete it with the hint in view (that solve restarts the streak).
  skip() {
    if (this.idx === null || !this.problem) return;
    this.streak = 0;
    const lv = this.levels[this.idx];
    this.solved = false;
    this.armed = false;
    this.store.setScaled(this.problem.startScaled);
    this.armed = true;
    this._touch(); // clicking skip is activity — resume and restart the idle countdown
    this.notify({ type: 'skipped', text: lv.hint ? lv.hint(this.problem) : '', floor: lv.floor });
  }

  next() { this.newProblem(); }
  restart() { if (this.idx !== null) this.startLevel(this.idx); }
  stop() { this._clearIdle(); this.idx = null; this.problem = null; this.notify({ type: 'stopped' }); }
}
