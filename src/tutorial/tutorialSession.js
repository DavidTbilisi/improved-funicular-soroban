// ============================================================================
// TutorialSession — the leveled-practice state machine, DOM-free and Observable
// (same family as DrillSession). Unlike the drill, it doesn't capture a typed
// answer: it drives the shared AbacusStore, seeds each problem's start value,
// and watches the store for the target value. A streak of solves at or above a
// level's floor unlocks the next level (persisted via TutorialProgress).
//
// Emitted events (payload.type):
//   level    { idx, id, title, teach, floor, best, levels }
//   problem  { prompt, sub, streak, floor }
//   solved   { streak, floor, justPassed, unlockedIdx, levels }
//   hint     { text }
//   skipped  { text, floor }
//   locked   { idx }
//   stopped  {}
// ============================================================================
import { Observable } from '../state/observable.js';

export class TutorialSession extends Observable {
  constructor({ levels, progress, rng, store }) {
    super();
    this.levels = levels;
    this.progress = progress;
    this.rng = rng;
    this.store = store;
    this.idx = null;
    this.problem = null;
    this.streak = 0;
    this.solved = false;
    this.armed = false; // ignore store notifications while seeding a problem
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
    this.notify({ type: 'level', idx, id: lv.id, title: lv.title, teach: lv.teach, floor: lv.floor, best: this.progress.best(lv.id), levels: this.levelInfos() });
    this.newProblem();
  }

  newProblem() {
    if (this.idx === null) return;
    const lv = this.levels[this.idx];
    this.problem = lv.gen(this.rng);
    this.solved = false;
    this.armed = false;
    this.store.setScaled(this.problem.startScaled); // notify fires while disarmed
    this.armed = true;
    this.notify({ type: 'problem', prompt: this.problem.prompt, sub: this.problem.sub, streak: this.streak, floor: lv.floor });
  }

  _onStore() {
    if (!this.armed || this.solved || this.idx === null) return;
    if (this.store.scaledValue() === this.problem.targetScaled) this._solve();
  }

  _solve() {
    this.solved = true;
    this.armed = false;
    this.streak++;
    const lv = this.levels[this.idx];
    const floor = lv.floor;
    this.progress.setBest(lv.id, this.streak);
    let justPassed = false, unlockedIdx = null;
    if (this.streak >= floor) {
      const next = this.idx + 1;
      justPassed = next < this.levels.length && !this.progress.isUnlocked(next);
      this.progress.unlock(Math.min(this.idx + 2, this.levels.length));
      unlockedIdx = next < this.levels.length ? next : null;
    }
    this.notify({ type: 'solved', streak: this.streak, floor, justPassed, unlockedIdx, levels: this.levelInfos() });
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
