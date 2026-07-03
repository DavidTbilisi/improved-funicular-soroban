import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DrillSession } from '../src/drill/drillSession.js';
import { DRILL_DECKS } from '../src/drill/decks.js';
import { MODES } from '../src/drill/drillMode.js';
import { SequenceRng } from '../src/drill/rng.js';
import { MemoryStatsStore, DrillStatsService } from '../src/drill/statsStore.js';

function fakeClock() {
  let t = 0;
  return { now: () => t, set: v => { t = v; } };
}

function makeSession(deckSeq, { mem = new MemoryStatsStore(), clock = fakeClock() } = {}) {
  const stats = new DrillStatsService(mem, () => '2026-07-03T12:00');
  const session = new DrillSession({
    decks: DRILL_DECKS, modes: MODES, stats,
    rng: new SequenceRng(deckSeq), clock,
  });
  return { session, stats, mem, clock };
}

test('typed rep under floor is a pass', () => {
  const { session, clock } = makeSession([3, 3, 3, 3]);
  const events = [];
  session.subscribe(e => events.push(e.type));
  session.start('faceToDigit'); // item d=3, prompt 👽
  clock.set(500);
  const res = session.submitTyped('3');
  assert.equal(res.correct, true);
  assert.equal(res.underFloor, true);
  assert.equal(res.cls, 'ok');
  assert.equal(res.nextDelayMs, 650);
  assert.deepEqual(res.stats, { n: 1, accuracy: 100, meanMs: 500, floorPct: 100 });
  assert.deepEqual(events, ['started', 'item', 'result']);
});

test('typed rep correct but over floor is "slow"', () => {
  const { session, clock } = makeSession([3, 3]);
  session.start('faceToDigit');
  clock.set(2000); // floor is 1000ms
  const res = session.submitTyped('3');
  assert.equal(res.correct, true);
  assert.equal(res.underFloor, false);
  assert.equal(res.cls, 'slow');
  assert.equal(res.verdict, '✓ correct, over floor');
  assert.equal(res.nextDelayMs, 1400);
});

test('wrong answer is a miss', () => {
  const { session, clock } = makeSession([3, 3]);
  session.start('faceToDigit');
  clock.set(400);
  const res = session.submitTyped('0');
  assert.equal(res.correct, false);
  assert.equal(res.cls, 'bad');
  assert.equal(res.stats.accuracy, 0);
});

test('empty typed input records nothing', () => {
  const { session } = makeSession([3, 3]);
  session.start('faceToDigit');
  assert.equal(session.submitTyped('   '), null);
  assert.equal(session.counters.n, 0);
});

test('reveal-mode: reveal then self-grade records a rep', () => {
  const { session, clock } = makeSession([4, 4]);
  const events = [];
  session.subscribe(e => events.push(e.type));
  session.start('digitToFace'); // reveal mode
  assert.equal(session.submitTyped('x'), null); // typed path is inert in reveal mode
  clock.set(300);
  session.reveal();
  const res = session.grade(true);
  assert.equal(res.correct, true);
  assert.equal(res.underFloor, true);
  assert.deepEqual(events, ['started', 'item', 'revealed', 'result']);
});

test('stop() persists the session via the stats service', () => {
  const { session, mem, clock } = makeSession([3, 3, 3, 3]);
  session.start('faceToDigit');
  clock.set(200);
  session.submitTyped('3');
  session.stop();
  const saved = mem.load().faceToDigit;
  assert.equal(saved.sessions.length, 1);
  assert.equal(saved.best.acc, 100);
});

test('starting a new deck auto-saves the previous one', () => {
  const { session, mem, clock } = makeSession([3, 3, 3, 3, 3, 3]);
  session.start('faceToDigit');
  clock.set(200);
  session.submitTyped('3');
  session.start('audioPeg'); // should flush faceToDigit
  assert.ok(mem.load().faceToDigit);
});
