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

// --- Fact decks: bag dealing, miss requeue, per-fact stats -------------------

// Answer the current item correctly and deal the next one.
const passRep = session => { session.submitTyped(session.item.answers[0]); session.next(); };

test('a fact deck deals every fact exactly once per round', () => {
  const { session } = makeSession([0]);
  session.start('fingerTimes');
  const prompts = [];
  for (let i = 0; i < 16; i++) { prompts.push(session.item.prompt); passRep(session); }
  assert.equal(new Set(prompts).size, 16, 'all 16 facts, no repeats within the round');
  assert.ok(prompts.includes('6 × 6') && prompts.includes('9 × 9'));
});

test('a missed fact is re-dealt two items later, with a longer dwell', () => {
  const { session } = makeSession([0]);
  session.start('fingerTimes');
  const missed = session.item.prompt;
  const res = session.submitTyped(String(Number(session.item.answers[0]) + 1)); // wrong
  assert.equal(res.correct, false);
  assert.equal(res.nextDelayMs, 3200, 'fact-deck misses linger for the redrawn method');
  session.next();
  const after = [];
  for (let i = 0; i < 3; i++) { after.push(session.item.prompt); passRep(session); }
  assert.notEqual(after[0], missed);
  assert.notEqual(after[1], missed);
  assert.equal(after[2], missed, 'the miss comes back after two other items');
});

test('per-fact tallies persist through the stats service on stop', () => {
  const { session, mem, clock } = makeSession([0]);
  session.start('fingerTimes');
  const key = session.item.fact.key;
  clock.set(500); // under the 2500ms floor
  session.submitTyped(String(Number(session.item.answers[0]) + 1)); // miss
  session.next();
  const key2 = session.item.fact.key;
  session.submitTyped(session.item.answers[0]); // pass
  session.stop();
  const facts = mem.load().fingerTimes.facts;
  assert.deepEqual(facts[key], { n: 1, miss: 1, sumMs: 500, floorPass: 0 });
  assert.equal(facts[key2].n, 1);
  assert.equal(facts[key2].miss, 0);
  assert.equal(facts[key2].floorPass, 1);
});

test('lifetime-weak facts are dealt twice in a round', () => {
  const mem = new MemoryStatsStore({
    fingerTimes: { sessions: [], facts: { '6x6': { n: 4, miss: 3, sumMs: 9000, floorPass: 0 } } },
  });
  const { session } = makeSession([0], { mem });
  session.start('fingerTimes');
  const prompts = [];
  for (let i = 0; i < 17; i++) { prompts.push(session.item.prompt); passRep(session); }
  assert.equal(prompts.filter(p => p === '6 × 6').length, 2, 'the weak fact rides twice');
  assert.equal(new Set(prompts).size, 16, 'everything else still exactly once');
});
