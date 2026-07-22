// ============================================================================
// YomiageSession — the caller. DOM-free and Observable, the same family as
// AnzanSession, and self-chaining for the same reason: one pending handle at a
// time makes stopping exact and makes the whole round walkable in a test.
//
// THE SCHEDULE IS DRIVEN BY THE VOICE, NOT BY A CLOCK. Anzan can lay a number
// on screen for exactly 800 ms because it owns the pixels; a spoken number
// takes as long as it takes — "seven" and "eight hundred forty-three" are not
// the same length, and pretending otherwise would either cut the caller off or
// leave dead air. So each step SPEAKS, waits for the utterance to report itself
// done, and only then starts the gap. The `voice` port's whole contract is that
// `speak(text, done)` calls `done` exactly once, whatever the speech engine
// does — the view-layer VoiceService is where that promise is kept (browser
// speech drops its end event often enough that it races it against an estimate).
//
// THE GAP IS THE DIFFICULTY. It is not a display speed: it is how long you have
// to hear a number, set it on the beads, and be ready for the next one. It is
// pinned per round (`gapMs_`), so changing the control mid-round cannot rescale
// a round already being called or log a pace that was never actually used.
//
// There is no replay. A caller does not repeat a number, and a trainer that let
// you re-hear one would be training a different thing.
//
// Emitted events (payload.type):
//   started  { levelId, title, teach, terms, digits, minus, gapMs, floor, streak, best, fastest }
//   call     { kind: 'open'|'term'|'close', text, index, total }   // as it is SAID
//   answer   { total }                                             // board it and hand in
//   result   { ok, given, sum, terms, gapMs, streak, floor, justPassed, best, fastest }
//   speed    { gapMs }
//   stopped  {}
// ============================================================================
import { Observable } from '../state/observable.js';
import { levelById, genRound } from './levels.js';
import { scriptFor } from './words.js';

// The beat after the opening call. It is the "clear your board" cue rather than
// a number to set, so it does not get a full working gap.
const OPEN_GAP_MS = 700;

export class YomiageSession extends Observable {
  constructor({ levels = null, rng, log = null, voice,
                timer = { set: () => 0, clear: () => {} } } = {}) {
    super();
    this.levels = levels;
    this.rng = rng;
    this.log = log;
    this.voice = voice;
    this.timer = timer;
    this._reset();
  }

  _reset() {
    this.level = null;
    this.gapMs = 0;      // the pace the NEXT round will use
    this.gapMs_ = 0;     // the pace the round in flight is using
    this.round = null;   // { terms, answer }
    this.script = [];
    this.phase = 'idle'; // idle | calling | answer
    this.index = -1;     // position in the script
    this.streak = 0;
    this._id = null;
    this._token = 0;     // invalidates a done() from an abandoned round
  }

  get active() { return this.phase !== 'idle'; }
  get accepting() { return this.phase === 'answer'; }

  _cancel() {
    if (this._id !== null) { this.timer.clear(this._id); this._id = null; }
    this._token++;
    if (this.voice && this.voice.cancel) this.voice.cancel();
  }

  _after(ms, fn) {
    if (this._id !== null) this.timer.clear(this._id);
    this._id = this.timer.set(() => { this._id = null; fn(); }, ms);
  }

  start(levelId, gapMs = null) {
    const level = levelById(levelId) || (this.levels || []).find(l => l.id === levelId);
    if (!level) return;
    this._cancel();
    this.level = level;
    this.gapMs = gapMs || level.baseGap;
    this.streak = 0;
    this.notify({
      type: 'started', levelId: level.id, title: level.title, teach: level.teach,
      terms: level.terms, digits: level.digits, minus: level.minus,
      gapMs: this.gapMs, floor: level.floor, streak: 0,
      best: this.log ? this.log.best(level.id) : 0,
      fastest: this.log ? this.log.fastest(level.id) : null,
    });
    this.newRound();
  }

  // Change the pace between rounds. Mid-round it lands on the next one, so a
  // click can never rescale a round the learner is already inside.
  setSpeed(gapMs) {
    if (!this.level || !gapMs) return;
    this.gapMs = gapMs;
    this.notify({ type: 'speed', gapMs });
  }

  newRound() {
    if (!this.level) return;
    this._cancel();
    this.gapMs_ = this.gapMs;
    this.round = genRound(this.level, this.rng);
    this.script = scriptFor(this.round.terms);
    this.index = -1;
    this.phase = 'calling';
    this._step();
  }

  // One utterance: say it, and when the voice reports back, wait the gap and go
  // again. The token guards a `done` arriving from a round that has since been
  // stopped — the browser's speech queue is not obliged to be prompt about it.
  _step() {
    this.index++;
    if (this.index >= this.script.length) { this._ask(); return; }
    const item = this.script[this.index];
    const token = this._token;
    this.notify({ type: 'call', kind: item.kind, text: item.text, index: item.index, total: this.round.terms.length });
    this.voice.speak(item.text, () => {
      if (token !== this._token) return;
      const gap = item.kind === 'open' ? Math.min(OPEN_GAP_MS, this.gapMs_) : this.gapMs_;
      if (item.kind === 'close') this._ask();
      else this._after(gap, () => this._step());
    });
  }

  _ask() {
    this.phase = 'answer';
    this.notify({ type: 'answer', total: this.round.terms.length });
  }

  /**
   * Hand in the total. On the page this is the BOARD's value — the beads held
   * the running sum all along, so reading them off is the answer.
   */
  submit(value) {
    if (this.phase !== 'answer') return;
    const given = String(value == null ? '' : value).trim().replace(/[\s,_]/g, '');
    const ok = /^-?\d+$/.test(given) && Number(given) === this.round.answer;
    this.streak = ok ? this.streak + 1 : 0;
    const floor = this.level.floor;
    const justPassed = ok && this.streak === floor;
    if (this.log) {
      this.log.record(this.level.id, { intervalMs: this.gapMs_, ok });
      this.log.setBest(this.level.id, this.streak);
      // Same rule as anzan: the score is the fastest pace ever carried to the
      // rung's floor UNBROKEN. One lucky round at 400 ms is not a record.
      if (justPassed) this.log.setFastest(this.level.id, this.gapMs_);
    }
    this.phase = 'calling';   // between rounds; nothing is being called yet
    this._cancel();
    this.notify({
      type: 'result', ok, given, sum: this.round.answer, terms: this.round.terms.slice(),
      gapMs: this.gapMs_, streak: this.streak, floor, justPassed,
      best: this.log ? this.log.best(this.level.id) : 0,
      fastest: this.log ? this.log.fastest(this.level.id) : null,
    });
  }

  stop() {
    if (!this.active) return;
    this._cancel();
    this._reset();
    this.notify({ type: 'stopped' });
  }
}
