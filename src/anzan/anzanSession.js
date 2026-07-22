// ============================================================================
// AnzanSession — the flash-anzan state machine, DOM-free and Observable (same
// family as DrillSession / TutorialSession). It owns the flash schedule; the
// view only renders what it is told and hands back a typed answer.
//
// THE SCHEDULE IS SELF-CHAINING. Each step books exactly ONE timeout for the
// next step, rather than laying down 2N timeouts up front. Two reasons, and
// both are load-bearing:
//   • Stopping is exact. One pending handle to clear means an abandoned round
//     can never flash a stray number onto the next one.
//   • It is testable. A fake timer only has to hold a single pending callback,
//     so a test can walk a whole round tick by tick and assert the exact
//     sequence of events — which is the only way to prove a flash trainer works
//     without a browser.
//
// Each number is LIT for LIT_SHARE of the interval and BLANK for the rest. The
// blank is not styling: without it two equal consecutive numbers read as one
// long flash and the learner silently adds one term fewer than was shown.
//
// The clock measures only the ANSWER (from the last blank to submit) — the
// round's own duration is imposed by the interval, so timing it would just
// re-measure the setting.
//
// Emitted events (payload.type):
//   started  { levelId, title, terms, digits, intervalMs, roundMs, best, fastest, streak, floor }
//   flash    { value, index, total }
//   blank    { index, total }
//   answer   { total }                       // every number shown; type the sum
//   result   { ok, given, sum, terms, elapsedMs, intervalMs, streak, floor, justPassed, best, fastest }
//   speed    { intervalMs, roundMs }
//   stopped  {}
// ============================================================================
import { Observable } from '../state/observable.js';
import { levelById, genRound, roundMs, LIT_SHARE } from './levels.js';

export class AnzanSession extends Observable {
  constructor({ levels, rng, log = null, clock = { now: () => 0 },
                timer = { set: () => 0, clear: () => {} } }) {
    super();
    this.levels = levels;
    this.rng = rng;
    this.log = log;
    this.clock = clock;
    this.timer = timer;
    this._reset();
  }

  _reset() {
    this.level = null;
    this.intervalMs = 0;    // the pace the NEXT round will use
    this.roundMs_ = 0;      // the pace the round in flight is actually using
    this.round = null;      // { terms, sum }
    this.phase = 'idle';    // idle | flash | blank | answer
    this.index = -1;
    this.streak = 0;
    this.t0 = 0;
    this._id = null;
  }

  get active() { return this.phase !== 'idle'; }
  get accepting() { return this.phase === 'answer'; }

  _cancel() { if (this._id !== null) { this.timer.clear(this._id); this._id = null; } }
  _after(ms, fn) { this._cancel(); this._id = this.timer.set(() => { this._id = null; fn(); }, ms); }

  start(levelId, intervalMs = null) {
    const level = levelById(levelId) || (this.levels || []).find(l => l.id === levelId);
    if (!level) return;
    this._cancel();
    this.level = level;
    this.intervalMs = intervalMs || level.baseMs;
    this.streak = 0;
    this.notify({
      type: 'started', levelId: level.id, title: level.title, teach: level.teach,
      terms: level.terms, digits: level.digits, intervalMs: this.intervalMs,
      roundMs: roundMs(level, this.intervalMs), floor: level.floor, streak: 0,
      best: this.log ? this.log.best(level.id) : 0,
      fastest: this.log ? this.log.fastest(level.id) : null,
    });
    this.newRound();
  }

  // Change the pace between rounds. Mid-round it takes effect on the next one,
  // so a speed click can never rescale a flash the learner is already reading.
  setSpeed(intervalMs) {
    if (!this.level || !intervalMs) return;
    this.intervalMs = intervalMs;
    this.notify({ type: 'speed', intervalMs, roundMs: roundMs(this.level, intervalMs) });
  }

  newRound() {
    if (!this.level) return;
    this._cancel();
    // Pin the pace for the whole round HERE. _step() must not read
    // this.intervalMs, or a speed click mid-flash would rescale the round the
    // learner is already reading — and the logged interval would be a pace that
    // was never actually shown.
    this.roundMs_ = this.intervalMs;
    this.round = genRound(this.level, this.rng);
    this.index = -1;
    this._step();
  }

  // One tick of the schedule: light the next number, or blank, or ask.
  _step() {
    const litMs = Math.max(40, Math.round(this.roundMs_ * LIT_SHARE));
    const gapMs = Math.max(20, this.roundMs_ - litMs);

    if (this.phase === 'flash') {
      // The number has had its time — blank it, then move on.
      this.phase = 'blank';
      this.notify({ type: 'blank', index: this.index, total: this.round.terms.length });
      this._after(gapMs, () => this._step());
      return;
    }

    this.index++;
    if (this.index < this.round.terms.length) {
      this.phase = 'flash';
      this.notify({ type: 'flash', value: this.round.terms[this.index], index: this.index, total: this.round.terms.length });
      this._after(litMs, () => this._step());
      return;
    }

    this.phase = 'answer';
    this.t0 = this.clock.now();
    this.notify({ type: 'answer', total: this.round.terms.length });
  }

  // Accepts a string or a number; anything unparseable counts as a wrong answer
  // rather than being swallowed, so a fumbled keystroke still breaks the streak
  // exactly as a wrong sum would.
  submit(input) {
    if (this.phase !== 'answer') return null;
    const given = typeof input === 'number' ? input : parseInt(String(input).replace(/[\s,]/g, ''), 10);
    const ok = Number.isFinite(given) && given === this.round.sum;
    const elapsedMs = Math.round(this.clock.now() - this.t0);
    const id = this.level.id;

    this.streak = ok ? this.streak + 1 : 0;
    const justPassed = ok && this.streak === this.level.floor;

    const paceMs = this.roundMs_;   // the pace this round was actually shown at
    if (this.log) {
      this.log.record(id, { intervalMs: paceMs, ok });
      this.log.setBest(id, this.streak);
      // "Cleared at this pace" means carrying the level's whole floor without a
      // miss — one lucky round at 200 ms is not a personal best.
      if (justPassed) this.log.setFastest(id, paceMs);
    }

    this.phase = 'idle';
    const evt = {
      type: 'result', ok, given: Number.isFinite(given) ? given : null,
      sum: this.round.sum, terms: this.round.terms.slice(),
      elapsedMs, intervalMs: paceMs, streak: this.streak,
      floor: this.level.floor, justPassed,
      best: this.log ? this.log.best(id) : 0,
      fastest: this.log ? this.log.fastest(id) : null,
    };
    this.notify(evt);
    return evt;
  }

  stop() {
    this._cancel();
    const was = this.level;
    this._reset();
    if (was) this.notify({ type: 'stopped' });
  }
}
