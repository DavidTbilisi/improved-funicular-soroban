// ============================================================================
// RodTrainerSession — the guided walkthrough for the authentic soroban
// multiplication & division methods. DOM-free and Observable (same family as
// TutorialSession/DrillSession). Unlike the leveled tutorial it is a *teacher*,
// not a timed gate: it seeds the multiplier/multiplicand (or dividend/divisor)
// layout on the shared AbacusStore and walks the operator through each rod-
// placement step, advancing only when the board reaches that step's expected
// value. Because the bead engine already rejects illegal moves, matching the
// expected value proves the digit landed on the right rod — true rod-level
// verification with no move policing.
//
// Emitted events (payload.type):
//   problem  { modeId, op, a, b, prompt, answer, setupInstr, total, layout }
//   step     { n, total, instr, kind, targets, done }
//   solved   { answer, answerRodSpan, answerRods, solves }
//   stopped  {}
// ============================================================================
import { Observable } from '../state/observable.js';
import { FRAC_COLS } from '../domain/config.js';
import { buildProblem } from '../domain/mulDiv.js';

const SCALE = Math.pow(10, FRAC_COLS); // board is integer-only → int value × 10^4

export class RodTrainerSession extends Observable {
  constructor({ modes, rng, store }) {
    super();
    this.modes = modes;
    this.rng = rng;
    this.store = store;
    this.modeId = null;
    this.problem = null;
    this.cur = 0;
    this.done = false;
    this.armed = false;       // ignore store notifications while seeding
    this.solves = 0;
    store.subscribe(() => this._onStore());
  }

  get active() { return this.modeId !== null; }

  modeInfos() {
    return this.modes.map(m => ({ id: m.id, op: m.op, label: m.label, title: m.title }));
  }

  start(modeId) {
    const mode = this.modes.find(m => m.id === modeId);
    if (!mode) return;
    this.modeId = modeId;
    this.newProblem();
  }

  newProblem() {
    const mode = this.modes.find(m => m.id === this.modeId);
    if (!mode) return;
    const { a, b } = mode.gen(this.rng);
    this.problem = buildProblem(mode.op, a, b);
    this.cur = 0;
    this.done = false;
    this.armed = false;
    this.store.setScaled(this.problem.setup * SCALE);  // seed the layout (disarmed)
    this.armed = true;
    this.notify({
      type: 'problem', modeId: this.modeId, op: this.problem.op, a, b,
      prompt: this.problem.prompt, answer: this.problem.answer,
      setupInstr: this.problem.setupInstr, total: this.problem.steps.length,
      layout: this.problem.layout, teach: mode.teach, title: mode.title,
    });
    this._emitStep();
  }

  _emitStep() {
    const s = this.problem.steps[this.cur];
    this.notify({
      type: 'step', n: this.cur + 1, total: this.problem.steps.length,
      instr: s.instr, kind: s.kind, targets: s.targets, done: this.cur,
    });
  }

  _onStore() {
    if (!this.armed || this.done || !this.problem) return;
    const v = this.store.intValue();
    const steps = this.problem.steps;
    // Find the furthest checkpoint the board now satisfies (a fluent operator may
    // clear several book-steps before we sample), starting from the current one.
    let i = this.cur;
    while (i < steps.length && steps[i].expected !== v) i++;
    if (i >= steps.length) return;      // mid-move or off the guided path — wait
    this.cur = i + 1;
    if (this.cur >= steps.length) this._solve();
    else this._emitStep();
  }

  _solve() {
    this.done = true;
    this.armed = false;
    this.solves++;
    this.notify({
      type: 'solved', answer: this.problem.answer,
      answerRods: this.problem.answerRods, answerRodSpan: this.problem.answerRodSpan,
      solves: this.solves,
    });
  }

  // "Do this step for me" — snap the board to the current step's expected value
  // (which re-enters _onStore and advances). Lets a stuck learner watch it play.
  doStep() {
    if (!this.active || this.done || !this.problem) return;
    this.store.setScaled(this.problem.steps[this.cur].expected * SCALE);
  }

  next() { if (this.active) this.newProblem(); }
  stop() { this.modeId = null; this.problem = null; this.done = false; this.armed = false; this.notify({ type: 'stopped' }); }
}
