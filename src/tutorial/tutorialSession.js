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
// Emitted events (payload.type):
//   level    { idx, id, title, teach, floor, timeFloorMs, best, levels }
//   problem  { prompt, sub, streak, floor, timeFloorMs }
//   solved   { clean, verdict, elapsedMs, timeFloorMs, faults, streak, floor, justPassed, unlockedIdx, levels }
//   hint     { text }
//   skipped  { text, floor }
//   locked   { idx }
//   stopped  {}
// ============================================================================
import { Observable } from '../state/observable.js';

export class TutorialSession extends Observable {
  constructor({ levels, progress, rng, store, clock = { now: () => 0 }, history = null, support = () => 0 }) {
    super();
    this.levels = levels;
    this.progress = progress;
    this.rng = rng;
    this.store = store;
    this.clock = clock;
    this.history = history; // optional SolveLog — records every solve for the trend chart
    this.support = support; // () => current mnemonic-mental fade level, tagged onto each solve
    this.idx = null;
    this.problem = null;
    this.streak = 0;
    this.solved = false;
    this.armed = false; // ignore store notifications while seeding a problem
    this.t0 = 0;
    this.faults = 0;
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
    if (this.store.scaledValue() === BigInt(this.problem.targetScaled)) this._solve();
  }

  _solve() {
    this.solved = true;
    this.armed = false;
    const lv = this.levels[this.idx];
    const floor = lv.floor;
    const elapsedMs = this.clock.now() - this.t0;
    const overTime = elapsedMs > lv.timeFloorMs;
    const clean = !overTime && this.faults === 0;

    // Automaticity gate: only a clean solve advances the streak; slow or fumbled
    // solves reset it. (A correct answer is table stakes — it's how we detect a
    // solve at all — so the verdict is about speed and cleanliness.)
    let verdict;
    if (clean) { this.streak++; verdict = 'clean'; }
    else { this.streak = 0; verdict = this.faults > 0 ? 'fumbled' : 'slow'; }

    if (this.history) this.history.record(lv.id, { ms: elapsedMs, clean, support: this.support() });
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
    this.notify({ type: 'skipped', text: lv.hint ? lv.hint(this.problem) : '', floor: lv.floor });
  }

  next() { this.newProblem(); }
  restart() { if (this.idx !== null) this.startLevel(this.idx); }
  stop() { this.idx = null; this.problem = null; this.notify({ type: 'stopped' }); }
}
