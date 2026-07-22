import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AnzanSession } from '../src/anzan/anzanSession.js';
import { ANZAN_LEVELS, levelById, LIT_SHARE } from '../src/anzan/levels.js';
import { AnzanLog } from '../src/anzan/anzanLog.js';
import { MemoryProgressStore } from '../src/tutorial/progressStore.js';
import { SequenceRng } from '../src/drill/rng.js';

// The session books exactly one timeout at a time, so a fake timer only has to
// hold a single pending callback — which is what makes the whole flash schedule
// walkable tick by tick without a browser.
class FakeTimer {
  constructor() { this.pending = null; this.delays = []; this.cleared = 0; }
  set(fn, ms) { this.pending = fn; this.delays.push(ms); return this.delays.length; }
  clear() { this.pending = null; this.cleared++; }
  tick() {
    const fn = this.pending;
    assert.ok(fn, 'expected a pending timeout');
    this.pending = null;
    fn();
  }
  // Run the schedule to completion (or until it stops booking timeouts).
  drain(limit = 500) {
    let n = 0;
    while (this.pending && n++ < limit) this.tick();
    return n;
  }
}

const setup = ({ levelId = 'warm', seq = [0, 4, 8], intervalMs = null, times = [] } = {}) => {
  const timer = new FakeTimer();
  const events = [];
  let i = 0;
  const log = new AnzanLog(new MemoryProgressStore(), { nowIso: () => '2026-07-22T10:00' });
  const s = new AnzanSession({
    levels: ANZAN_LEVELS, rng: new SequenceRng(seq), log, timer,
    clock: { now: () => (times.length ? times[Math.min(i++, times.length - 1)] : 0) },
  });
  s.subscribe(e => events.push(e));
  s.start(levelId, intervalMs);
  return { s, timer, events, log, types: () => events.map(e => e.type) };
};

test('starting announces the level, its pace and its screen time', () => {
  const { events } = setup({ levelId: 'ten2', intervalMs: 900 });
  const started = events[0];
  assert.equal(started.type, 'started');
  assert.equal(started.levelId, 'ten2');
  assert.equal(started.terms, 10);
  assert.equal(started.digits, 2);
  assert.equal(started.intervalMs, 900);
  assert.equal(started.roundMs, 9000);
  assert.equal(started.floor, levelById('ten2').floor);
  assert.equal(started.streak, 0);
});

test('a round flashes every term, blanks between each, then asks', () => {
  const { timer, events, types } = setup({ seq: [0, 4, 8] }); // warm: 3 × 1 digit
  timer.drain();

  assert.deepEqual(types(), [
    'started',
    'flash', 'blank',
    'flash', 'blank',
    'flash', 'blank',
    'answer',
  ]);

  const flashes = events.filter(e => e.type === 'flash');
  assert.deepEqual(flashes.map(f => f.value), [1, 5, 9]);
  assert.deepEqual(flashes.map(f => f.index), [0, 1, 2]);
  for (const f of flashes) assert.equal(f.total, 3);
  assert.equal(events[events.length - 1].total, 3);
});

// The blank is the whole reason a repeated number is still countable.
test('every flash is separated by a blank, so two equal terms cannot merge', () => {
  const { timer, types } = setup({ seq: [6, 6, 6] }); // 7, 7, 7
  timer.drain();
  const t = types().slice(1, -1); // drop started / answer
  for (let i = 0; i < t.length; i += 2) {
    assert.equal(t[i], 'flash');
    assert.equal(t[i + 1], 'blank', 'a flash is always followed by a blank');
  }
});

test('the lit and blank spans split the interval, and the blank is never zero', () => {
  const { timer } = setup({ intervalMs: 1000 });
  timer.drain();
  const lit = Math.round(1000 * LIT_SHARE);
  const gap = 1000 - lit;
  // warm = 3 terms → lit, gap, lit, gap, lit, gap
  assert.deepEqual(timer.delays, [lit, gap, lit, gap, lit, gap]);
  assert.ok(gap > 0);
});

test('even at the fastest pace the number stays lit and the gap survives', () => {
  const { timer } = setup({ intervalMs: 200 });
  timer.drain();
  for (const d of timer.delays) assert.ok(d >= 20, `delay ${d} is still perceptible`);
  assert.ok(timer.delays.some(d => d >= 40), 'the lit span has a floor');
});

test('the session only accepts an answer once every term has been shown', () => {
  const { s, timer } = setup();
  assert.equal(s.accepting, false);
  assert.equal(s.submit(15), null, 'mid-flash submissions are ignored, not scored');
  timer.drain();
  assert.equal(s.accepting, true);
  assert.ok(s.submit(15));
});

test('a correct sum scores, advances the streak and reports the terms back', () => {
  const { s, timer, times } = setup({ seq: [0, 4, 8], times: [0, 2500] });
  timer.drain();
  const r = s.submit('15');
  assert.equal(r.ok, true);
  assert.equal(r.given, 15);
  assert.equal(r.sum, 15);
  assert.deepEqual(r.terms, [1, 5, 9]);
  assert.equal(r.streak, 1);
  assert.equal(r.best, 1);
});

test('a wrong sum breaks the streak but still hands back the terms to learn from', () => {
  const { s, timer } = setup({ seq: [0, 4, 8] });
  timer.drain();
  const r = s.submit(14);
  assert.equal(r.ok, false);
  assert.equal(r.given, 14);
  assert.equal(r.sum, 15);
  assert.deepEqual(r.terms, [1, 5, 9], 'the round is shown so the miss is teachable');
  assert.equal(r.streak, 0);
});

test('unparseable input counts as wrong rather than being swallowed', () => {
  for (const junk of ['', '   ', 'abc', null, undefined]) {
    const { s, timer } = setup({ seq: [0, 4, 8] });
    timer.drain();
    const r = s.submit(junk);
    assert.equal(r.ok, false, `${JSON.stringify(junk)} must not pass`);
    assert.equal(r.given, null);
    assert.equal(r.streak, 0);
  }
});

test('spaces and thousands separators in a typed answer are tolerated', () => {
  const { s, timer } = setup({ levelId: 'three3', seq: [0, 0, 0] }); // 100 + 100 + 100
  timer.drain();
  assert.equal(s.submit(' 3 00 ').ok, true);
  const b = setup({ levelId: 'three3', seq: [0, 0, 0] });
  b.timer.drain();
  assert.equal(b.s.submit('3,00').ok, true);
});

test('carrying the floor marks the level cleared at that pace', () => {
  const level = levelById('warm');
  const { s, timer, log } = setup({ seq: [0, 4, 8], intervalMs: 800 });
  let passed = null;
  s.subscribe(e => { if (e.type === 'result' && e.justPassed) passed = e; });

  for (let i = 0; i < level.floor; i++) {
    timer.drain();
    s.submit(15);
    if (i < level.floor - 1) s.newRound();
  }
  assert.ok(passed, 'justPassed fires exactly on reaching the floor');
  assert.equal(passed.streak, level.floor);
  assert.equal(log.best('warm'), level.floor);
  assert.equal(log.fastest('warm'), 800, 'the pace it was carried at is banked');
});

test('one lucky fast round does NOT bank a personal best', () => {
  const { s, timer, log } = setup({ seq: [0, 4, 8], intervalMs: 200 });
  timer.drain();
  s.submit(15);
  assert.equal(log.fastest('warm'), null, 'the whole floor has to be carried');
  assert.equal(log.best('warm'), 1);
});

test('a miss part-way resets the streak, so the floor must be carried unbroken', () => {
  const { s, timer, log } = setup({ seq: [0, 4, 8], intervalMs: 800 });
  timer.drain(); s.submit(15);
  s.newRound(); timer.drain(); s.submit(0);      // miss
  s.newRound(); timer.drain();
  const r = s.submit(15);
  assert.equal(r.streak, 1, 'counting restarted');
  assert.equal(log.fastest('warm'), null);
});

test('every round is logged with the interval it was answered at', () => {
  const { s, timer, log } = setup({ seq: [0, 4, 8], intervalMs: 1300 });
  timer.drain(); s.submit(15);
  s.setSpeed(650);
  s.newRound(); timer.drain(); s.submit(0);
  assert.deepEqual(log.rounds('warm').map(r => [r.ms, r.ok]), [[1300, true], [650, false]]);
  assert.equal(log.accuracy('warm'), 0.5);
});

test('a speed change lands on the NEXT round, never rescaling a live flash', () => {
  const { s, timer, events } = setup({ intervalMs: 1000 });
  timer.tick(); // one flash in
  s.setSpeed(400);
  const before = timer.delays.length;
  timer.drain();
  // The remainder of the live round still used the 1000 ms split.
  const lit = Math.round(1000 * LIT_SHARE);
  for (const d of timer.delays.slice(before)) assert.ok(d === lit || d === 1000 - lit, `${d}`);
  assert.ok(events.some(e => e.type === 'speed' && e.intervalMs === 400));

  // newRound() lights the first number immediately, booking the lit span; the
  // next tick books the gap. Both must now be at the NEW pace.
  s.submit(0);
  s.newRound();
  assert.equal(timer.delays[timer.delays.length - 1], Math.round(400 * LIT_SHARE), 'the new pace applies now');
  timer.tick();
  assert.equal(timer.delays[timer.delays.length - 1], 400 - Math.round(400 * LIT_SHARE), 'gap too');
});

test('stopping cancels the pending flash — no stray number lands later', () => {
  const { s, timer, types } = setup();
  timer.tick();
  s.stop();
  assert.equal(timer.pending, null, 'the booked timeout was cleared');
  assert.ok(timer.cleared > 0);
  assert.equal(s.active, false);
  assert.equal(types()[types().length - 1], 'stopped');
  assert.equal(s.submit(15), null, 'and nothing can be scored after a stop');
});

test('starting a new level cancels the round already running', () => {
  const { s, timer, events } = setup({ levelId: 'warm' });
  timer.tick();
  s.start('ten2', 900);
  const started = events.filter(e => e.type === 'started');
  assert.equal(started.length, 2);
  assert.equal(started[1].levelId, 'ten2');
  assert.equal(s.streak, 0, 'the streak does not carry across levels');
});

test('starting an unknown level is a no-op', () => {
  const { s, events } = setup();
  const before = events.length;
  s.start('does-not-exist');
  assert.equal(events.length, before);
  assert.equal(s.level.id, 'warm');
});

test('a session with no log still runs and scores', () => {
  const timer = new FakeTimer();
  const s = new AnzanSession({ levels: ANZAN_LEVELS, rng: new SequenceRng([0, 4, 8]), timer });
  s.start('warm');
  timer.drain();
  const r = s.submit(15);
  assert.equal(r.ok, true);
  assert.equal(r.best, 0);
  assert.equal(r.fastest, null);
});

test('a ten-term level really flashes ten numbers', () => {
  const { timer, events } = setup({ levelId: 'ten3', seq: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] });
  timer.drain();
  const flashes = events.filter(e => e.type === 'flash');
  assert.equal(flashes.length, 10);
  assert.equal(events.filter(e => e.type === 'blank').length, 10);
  for (const f of flashes) assert.equal(String(f.value).length, 3);
});
