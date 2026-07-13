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
// Since the bridge from guided practice, it is ALSO a gate: each solve is
// timed (injected clock) and judged like the tutorial — clean means no
// illegal move (fault()), no "Do this step" assist, and under the mode's
// timeFloorMs. A streak of `floor` clean solves marks the mode cleared
// (persisted via an injected SolveLog). Modes are never locked — the gate
// measures, it doesn't bar the door.
//
// Emitted events (payload.type):
//   problem  { modeId, op, a, b, prompt, answer, setupInstr, total, layout }
//   step     { n, total, instr, kind, targets, done }
//   solved   { answer, answerRodSpan, answerRods, solves,
//              clean, verdict, elapsedMs, timeFloorMs, streak, floor, cleared, modes }
//   stopped  {}
// ============================================================================
import { Observable } from '../state/observable.js';
import { FRAC_COLS } from '../domain/config.js';
import { buildProblem } from '../domain/mulDiv.js';

const SCALE = Math.pow(10, FRAC_COLS); // board is integer-only → int value × 10^4

export class RodTrainerSession extends Observable {
  constructor({ modes, rng, store, clock = { now: () => 0 }, log = null }) {
    super();
    this.modes = modes;
    this.rng = rng;
    this.store = store;
    this.clock = clock;
    this.log = log;           // optional SolveLog: solve history + best streak per mode
    this.modeId = null;
    this.problem = null;
    this.cur = 0;
    this.done = false;
    this.armed = false;       // ignore store notifications while seeding
    this.solves = 0;
    this.streaks = {};        // in-session clean streak per mode
    this.faults = 0;
    this.assisted = false;
    this.t0 = 0;
    store.subscribe(() => this._onStore());
  }

  get active() { return this.modeId !== null; }

  modeInfos() {
    return this.modes.map(m => {
      const floor = m.floor ?? 3;
      const best = this.log ? this.log.best(m.id) : (this.streaks[m.id] || 0);
      return {
        id: m.id, op: m.op, label: m.label, title: m.title,
        floor, timeFloorMs: m.timeFloorMs ?? null, best, cleared: best >= floor,
      };
    });
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
    this.faults = 0;
    this.assisted = false;
    this.store.setScaled(this.problem.setup * SCALE);  // seed the layout (disarmed)
    this.armed = true;
    this.t0 = this.clock.now();                        // start the automaticity timer
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
      instr: s.instr, kind: s.kind, targets: s.targets, factors: s.factors || null, done: this.cur,
    });
  }

  _onStore() {
    if (!this.armed || this.done || !this.problem) return;
    const v = Number(this.store.intValue());  // rod-trainer values are small; step compares are Numbers
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

  // The app reports a fumble (illegal/rejected move or a reset) during the
  // active problem — same contract as TutorialSession.fault().
  fault() {
    if (!this.active || this.done || !this.problem) return;
    this.faults++;
  }

  _solve() {
    this.done = true;
    this.armed = false;
    this.solves++;
    const mode = this.modes.find(m => m.id === this.modeId);
    const floor = mode.floor ?? 3;
    const timeFloorMs = mode.timeFloorMs ?? null;
    const elapsedMs = this.clock.now() - this.t0;
    const clean = !this.assisted && this.faults === 0 && (timeFloorMs === null || elapsedMs <= timeFloorMs);
    const verdict = clean ? 'clean' : this.assisted ? 'assisted' : this.faults > 0 ? 'fumbled' : 'slow';
    this.streaks[this.modeId] = clean ? (this.streaks[this.modeId] || 0) + 1 : 0;
    const streak = this.streaks[this.modeId];
    if (this.log) {
      this.log.record(this.modeId, { ms: elapsedMs, clean });
      this.log.setBest(this.modeId, streak);
    }
    const best = this.log ? this.log.best(this.modeId) : streak;
    this.notify({
      type: 'solved', answer: this.problem.answer,
      answerRods: this.problem.answerRods, answerRodSpan: this.problem.answerRodSpan,
      solves: this.solves,
      clean, verdict, elapsedMs, timeFloorMs, streak, floor, cleared: best >= floor,
      modes: this.modeInfos(),
    });
  }

  // "Do this step for me" — snap the board to the current step's expected value
  // (which re-enters _onStore and advances). Lets a stuck learner watch it play;
  // an assisted solve can't be clean.
  doStep() {
    if (!this.active || this.done || !this.problem) return;
    this.assisted = true;
    this.store.setScaled(this.problem.steps[this.cur].expected * SCALE);
  }

  next() { if (this.active) this.newProblem(); }
  stop() { this.modeId = null; this.problem = null; this.done = false; this.armed = false; this.notify({ type: 'stopped' }); }
}
