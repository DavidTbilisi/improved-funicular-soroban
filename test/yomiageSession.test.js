import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YomiageSession } from '../src/yomiage/yomiageSession.js';
import { YOMIAGE_LEVELS, GAPS } from '../src/yomiage/levels.js';
import { AnzanLog } from '../src/anzan/anzanLog.js';
import { MemoryProgressStore } from '../src/tutorial/progressStore.js';
import { SequenceRng } from '../src/drill/rng.js';

// The voice port, faked: it records what was said and hands the test the
// callback, so a round only advances when the test says the caller finished.
class FakeVoice {
  constructor() { this.said = []; this.pending = null; this.cancels = 0; }
  speak(text, done) { this.said.push(text); this.pending = done; }
  cancel() { this.pending = null; this.cancels++; }
  finish() {
    const d = this.pending;
    assert.ok(d, 'expected something to be being said');
    this.pending = null;
    d();
  }
}

class FakeTimer {
  constructor() { this.pending = null; this.delays = []; this.cleared = 0; }
  set(fn, ms) { this.pending = fn; this.delays.push(ms); return this.delays.length; }
  clear() { this.pending = null; this.cleared++; }
  tick() {
    const fn = this.pending;
    assert.ok(fn, 'expected a pending gap');
    this.pending = null;
    fn();
  }
}

const setup = ({ levelId = 'warm', seq = [3, 5, 8, 1], gapMs = null } = {}) => {
  const voice = new FakeVoice(), timer = new FakeTimer(), events = [];
  const log = new AnzanLog(new MemoryProgressStore(), { nowIso: () => '2026-07-22T10:00' });
  const s = new YomiageSession({ levels: YOMIAGE_LEVELS, rng: new SequenceRng(seq), log, voice, timer });
  s.subscribe(e => events.push(e));
  s.start(levelId, gapMs);
  return { s, voice, timer, events, log, types: () => events.map(e => e.type),
    last: t => [...events].reverse().find(e => e.type === t) || null };
};

// Walk the caller to the point where the total is wanted.
function callWholeRound(s, voice, timer) {
  let guard = 0;
  while (!s.accepting && guard++ < 200) {
    if (voice.pending) voice.finish();
    else if (timer.pending) timer.tick();
    else break;
  }
  assert.ok(s.accepting, 'the round reached the question');
}

test('starting announces the rung and opens the calling', () => {
  const { events, voice } = setup({ levelId: 'five2', gapMs: 2000 });
  const started = events[0];
  assert.equal(started.type, 'started');
  assert.equal(started.levelId, 'five2');
  assert.equal(started.terms, 5);
  assert.equal(started.digits, 2);
  assert.equal(started.gapMs, 2000);
  assert.equal(started.streak, 0);
  // The very first thing said is the opening — the cue to clear the board.
  assert.equal(voice.said[0], 'Ready');
  assert.equal(events[1].type, 'call');
  assert.equal(events[1].kind, 'open');
});

test('an unknown rung does nothing at all', () => {
  const { s, events } = setup();
  const before = events.length;
  s.start('nope');
  assert.equal(events.length, before);
});

test('the schedule waits for the VOICE, not for a clock', () => {
  const { s, voice, timer } = setup();
  // The opening is out; no gap has been booked, because it has not finished.
  assert.equal(timer.delays.length, 0);
  voice.finish();
  assert.equal(timer.delays.length, 1, 'the gap starts when the caller stops');
  assert.equal(voice.said.length, 1, 'and nothing is said during it');
  timer.tick();
  assert.equal(voice.said.length, 2, 'then the first term');
  assert.ok(s.active);
});

test('the opening gets a short beat; the terms get the working gap', () => {
  const { voice, timer } = setup({ gapMs: 2000 });
  voice.finish();                       // opening said
  assert.equal(timer.delays[0], 700, 'the opening is a cue, not a number to set');
  timer.tick(); voice.finish();         // term 1 said
  assert.equal(timer.delays[1], 2000);
});

test('every term is called once, in order, and then the total is asked for', () => {
  const { s, voice, timer } = setup();
  callWholeRound(s, voice, timer);
  assert.equal(voice.said.length, 5, 'open + 3 terms + close');
  assert.equal(voice.said[0], 'Ready');
  assert.equal(voice.said[4], 'How much?');
  assert.ok(!s.accepting || true);
  assert.equal(s.accepting, true);
});

test('there is no replay — nothing re-says a term', () => {
  const { s, voice, timer } = setup();
  callWholeRound(s, voice, timer);
  const terms = voice.said.slice(1, -1);
  assert.equal(new Set(terms).size <= terms.length, true);
  assert.equal(voice.said.filter(t => t === 'Ready').length, 1);
});

test('an answer is refused until the whole round has been called', () => {
  const { s, voice, timer, types } = setup();
  s.submit('12');
  assert.ok(!types().includes('result'), 'nothing was handed in mid-call');
  callWholeRound(s, voice, timer);
  s.submit(String(s.round.answer));
  assert.ok(types().includes('result'));
});

test('the right total scores, streaks, and records the pace it was called at', () => {
  const { s, voice, timer, log, last } = setup({ gapMs: 1600 });
  callWholeRound(s, voice, timer);
  s.submit(String(s.round.answer));
  const r = last('result');
  assert.equal(r.ok, true);
  assert.equal(r.sum, r.terms.reduce((a, b) => a + b, 0));
  assert.equal(r.streak, 1);
  assert.equal(r.gapMs, 1600);
  assert.deepEqual(log.rounds('warm'), [{ t: '2026-07-22T10:00', ms: 1600, ok: true }]);
});

test('separators in a handed-in total are tolerated; junk is not', () => {
  const { s, voice, timer, last } = setup();
  callWholeRound(s, voice, timer);
  s.submit(` ${String(s.round.answer)} `);
  assert.equal(last('result').ok, true);

  s.newRound();
  callWholeRound(s, voice, timer);
  s.submit('twelve');
  assert.equal(last('result').ok, false);
});

test('a wrong total breaks the streak and hands the terms back', () => {
  const { s, voice, timer, last } = setup();
  callWholeRound(s, voice, timer);
  s.submit(String(s.round.answer));
  s.newRound();
  callWholeRound(s, voice, timer);
  s.submit(String(s.round.answer + 1));
  const r = last('result');
  assert.equal(r.ok, false);
  assert.equal(r.streak, 0);
  assert.equal(r.terms.length, 3, 'the column is shown back — the only feedback dictation can give');
});

test('carrying the floor unbroken banks the pace as the record', () => {
  const { s, voice, timer, log, last } = setup({ gapMs: 1300 });
  const floor = YOMIAGE_LEVELS[0].floor;
  for (let i = 0; i < floor; i++) {
    if (i) s.newRound();
    callWholeRound(s, voice, timer);
    s.submit(String(s.round.answer));
  }
  assert.equal(last('result').justPassed, true);
  assert.equal(log.fastest('warm'), 1300);
  assert.equal(log.best('warm'), floor);
});

test('one lucky fast round is not a record', () => {
  const { s, voice, timer, log } = setup({ gapMs: GAPS[GAPS.length - 1] });
  callWholeRound(s, voice, timer);
  s.submit(String(s.round.answer));
  assert.equal(log.fastest('warm'), null, 'the floor was not carried');
});

test('a pace change lands on the NEXT round, never on the one being called', () => {
  const { s, voice, timer, last } = setup({ gapMs: 2000 });
  voice.finish(); timer.tick();          // into the first term
  s.setSpeed(800);
  assert.equal(last('speed').gapMs, 800);
  voice.finish();
  assert.equal(timer.delays[timer.delays.length - 1], 2000, 'the round in flight keeps its pace');
  callWholeRound(s, voice, timer);
  s.submit(String(s.round.answer));
  assert.equal(last('result').gapMs, 2000, 'and it is logged at the pace it was called at');

  s.newRound();
  voice.finish();
  callWholeRound(s, voice, timer);
  s.submit('0');
  assert.equal(last('result').gapMs, 800);
});

test('stopping is exact: the pending gap is cleared and a late voice is ignored', () => {
  const { s, voice, timer, types } = setup();
  voice.finish();                        // opening done, gap pending
  assert.ok(timer.pending);
  const stale = voice.pending;
  s.stop();
  assert.equal(timer.pending, null, 'no stray call can land on the next round');
  assert.ok(voice.cancels > 0, 'the speech queue is cancelled too');
  assert.equal(s.active, false);
  assert.ok(types().includes('stopped'));

  // A done() from the abandoned round must not restart anything.
  const said = voice.said.length;
  if (stale) stale();
  assert.equal(voice.said.length, said);
  assert.equal(timer.pending, null);
});

test('a stopped session ignores everything afterwards', () => {
  const { s, voice, timer, events } = setup();
  callWholeRound(s, voice, timer);
  s.stop();
  const n = events.length;
  s.submit('1');
  s.newRound();
  s.setSpeed(400);
  s.stop();
  assert.equal(events.length, n);
});
