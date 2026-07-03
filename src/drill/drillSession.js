// ============================================================================
// DrillSession — the drill state machine, DOM-free and Observable. Views
// subscribe and render from the events it emits; it never touches the DOM.
// Timing comes from an injected clock (performance.now in the browser, a fake
// in tests). Deck items come from an injected rng. Persistence goes through the
// injected DrillStatsService. This is the composition seam that makes the whole
// drill flow unit-testable.
//
// Emitted events (payload.type):
//   started  { deckId, label, floorMs, best }
//   item     { deckId, item, isTyped }
//   result   { result, item }
//   revealed { item }
//   stopped  {}
// ============================================================================
import { Observable } from '../state/observable.js';

export class DrillSession extends Observable {
  constructor({ decks, modes, stats, rng, clock }) {
    super();
    this.decks = decks;
    this.modes = modes;
    this.stats = stats;
    this.rng = rng;
    this.clock = clock;
    this._reset(null);
  }

  _reset(deckId) {
    this.deckId = deckId;
    this.item = null;
    this.mode = null;
    this.t0 = 0;
    this.elapsed = 0;
    this.revealed = false;
    this.counters = { n: 0, correct: 0, sumMs: 0, floorPass: 0 };
  }

  get activeDeckId() { return this.deckId; }

  start(deckId) {
    if (this.deckId) this._save();
    this._reset(deckId);
    const deck = this.decks[deckId];
    this.notify({ type: 'started', deckId, label: deck.label, floorMs: deck.floorMs, best: this.stats.best(deckId) });
    this.next();
  }

  next() {
    const deck = this.decks[this.deckId];
    this.mode = this.modes[deck.mode];
    this.item = deck.gen(this.rng);
    this.revealed = false;
    this.t0 = this.clock.now();
    this.notify({ type: 'item', deckId: this.deckId, item: this.item, isTyped: this.mode.isTyped });
  }

  submitTyped(value) {
    if (!this.deckId || !this.mode.isTyped) return null;
    const elapsed = this.clock.now() - this.t0;
    const ok = this.mode.check(this.item, value);
    if (ok === null) return null; // empty input
    return this._record(ok, elapsed);
  }

  reveal() {
    if (!this.deckId || this.mode.isTyped || this.revealed) return;
    this.elapsed = this.clock.now() - this.t0;
    this.revealed = true;
    this.notify({ type: 'revealed', item: this.item });
  }

  grade(ok) {
    if (!this.revealed) return null;
    return this._record(ok, this.elapsed);
  }

  stop() {
    this._save();
    this.deckId = null;
    this.notify({ type: 'stopped' });
  }

  // Fixed rep-recording skeleton shared by both modes (Template Method).
  _record(correct, elapsed) {
    const deck = this.decks[this.deckId];
    const c = this.counters;
    c.n++; if (correct) c.correct++;
    c.sumMs += elapsed;
    const underFloor = correct && elapsed <= deck.floorMs;
    if (underFloor) c.floorPass++;
    const result = {
      correct, underFloor, elapsedMs: elapsed,
      cls: correct ? (underFloor ? 'ok' : 'slow') : 'bad',
      verdict: correct ? (underFloor ? '✓ pass' : '✓ correct, over floor') : '✗ miss',
      reveal: this.item.reveal,
      nextDelayMs: (correct && !this.item.small && underFloor) ? 650 : 1400,
      stats: {
        n: c.n,
        accuracy: Math.round(100 * c.correct / c.n),
        meanMs: Math.round(c.sumMs / c.n),
        floorPct: Math.round(100 * c.floorPass / c.n),
      },
    };
    this.notify({ type: 'result', result, item: this.item });
    return result;
  }

  _save() {
    if (this.deckId && this.counters.n > 0) this.stats.saveSession(this.deckId, this.counters);
  }
}
