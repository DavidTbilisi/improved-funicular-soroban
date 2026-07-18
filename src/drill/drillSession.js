// ============================================================================
// DrillSession — the drill state machine, DOM-free and Observable. Views
// subscribe and render from the events it emits; it never touches the DOM.
// Timing comes from an injected clock (performance.now in the browser, a fake
// in tests). Deck items come from an injected rng. Persistence goes through the
// injected DrillStatsService. This is the composition seam that makes the whole
// drill flow unit-testable.
//
// Decks that declare a finite fact space ({ facts, genFact } — see decks.js)
// are dealt from a shuffled BAG instead of i.i.d. gen() draws: every fact
// appears once per round (facts the lifetime stats show as weak appear twice),
// and a missed fact is re-inserted a couple of items ahead — the spaced
// re-test that turns a correction into recall. Per-fact tallies ride in
// counters.facts and persist through the stats service on save.
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
    this.bag = []; // pending facts of the current round (fact decks only)
    this.counters = { n: 0, correct: 0, sumMs: 0, floorPass: 0, facts: {} };
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
    if (deck.facts) {
      if (this.bag.length === 0) this.bag = this._dealBag(deck);
      this.item = deck.genFact(this.bag.shift(), this.rng);
    } else {
      this.item = deck.gen(this.rng);
    }
    this.revealed = false;
    this.t0 = this.clock.now();
    this.notify({ type: 'item', deckId: this.deckId, item: this.item, isTyped: this.mode.isTyped });
  }

  // One full round over the deck's fact space, Fisher–Yates-shuffled off the
  // injected rng (so tests stay deterministic). Facts whose lifetime record is
  // weak — enough reps to judge, under half of them passing the floor — are
  // dealt twice, biasing the round toward what still needs the hands.
  _dealBag(deck) {
    const lifetime = this.stats.facts(this.deckId);
    const bag = [];
    for (const fact of deck.facts) {
      bag.push(fact);
      const s = lifetime[fact.key];
      if (s && s.n >= 3 && s.floorPass / s.n < 0.5) bag.push(fact);
    }
    for (let i = bag.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1);
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag;
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
    const fact = this.item.fact;
    if (fact) {
      const f = c.facts[fact.key] || (c.facts[fact.key] = { n: 0, miss: 0, sumMs: 0, floorPass: 0 });
      f.n++; if (!correct) f.miss++;
      f.sumMs += elapsed;
      if (underFloor) f.floorPass++;
      // A missed fact goes back into the bag a couple of items ahead.
      if (!correct) this.bag.splice(Math.min(2, this.bag.length), 0, fact);
    }
    const result = {
      correct, underFloor, elapsedMs: elapsed,
      cls: correct ? (underFloor ? 'ok' : 'slow') : 'bad',
      verdict: correct ? (underFloor ? '✓ pass' : '✓ correct, over floor') : '✗ miss',
      reveal: this.item.reveal,
      // A miss on a fact deck lingers longer: its reveal redraws the method
      // (see the page's revealFigFor) and deserves a read before the next deal.
      nextDelayMs: correct ? ((!this.item.small && underFloor) ? 650 : 1400) : (fact ? 3200 : 1400),
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
