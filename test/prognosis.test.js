import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prognose, STAGE_NAMES } from '../src/tutorial/prognosis.js';

const FLOOR = 4000;               // COMFORT×floor = 3000ms
// a solve record; ms defaults comfortable, clean by default
const s = (over = {}) => ({ t: '2026-01-01T00:00', ms: 2000, clean: true, support: 0, ...over });
const many = (k, over = {}) => Array.from({ length: k }, () => s(over));
const P = (solves, support = 0, floorMs = FLOOR) => prognose(solves, { floorMs, support });

test('empty history reports the no-data message and forecasts nothing', () => {
  const p = P([]);
  assert.equal(p.n, 0);
  assert.equal(p.enoughData, false);
  assert.equal(p.solvesToMental, null);
  assert.equal(p.minutesToMental, null);
  assert.match(p.message, /No Beads solves/i);
});

test('fewer than the minimum solves at a stage is "not enough data"', () => {
  const p = P(many(3, { ms: 2000, clean: true }));
  assert.equal(p.n, 3);
  assert.equal(p.enoughData, false);
  assert.match(p.message, /solve ~1 more/i);
});

test('only solves at the CURRENT support level count toward readiness', () => {
  const mixed = [...many(6, { support: 0, ms: 2000 }), ...many(2, { support: 1, ms: 2000 })];
  const beads = P(mixed, 0);
  assert.equal(beads.n, 6, 'six Beads solves seen at support 0');
  const percept = P(mixed, 1);
  assert.equal(percept.n, 2, 'only the two Percept solves seen at support 1');
  assert.equal(percept.enoughData, false);
});

test('legacy records with no support field read as Beads (0)', () => {
  const legacy = Array.from({ length: 6 }, () => ({ t: 't', ms: 2000, clean: true })); // no support key
  const p = P(legacy, 0);
  assert.equal(p.n, 6);
  assert.equal(p.readiness, 1);
});

test('a run of clean, comfortably-fast solves is "ready" — readiness 1, zero to drop', () => {
  const p = P(many(6, { ms: 2000, clean: true }), 0); // 2000 <= 3000 comfort
  assert.equal(p.readiness, 1);
  assert.equal(p.ready, true);
  assert.equal(p.solvesToNextDrop, 0);
  assert.match(p.message, /Ready/i);
  assert.match(p.message, /Percept/); // two stages remain from Beads
});

test('clean-but-slow (under floor, over comfort) scores half — not yet ready', () => {
  const p = P(many(6, { ms: 3500, clean: true }), 0); // 3000 < 3500 <= 4000
  assert.equal(p.readiness, 0.5);
  assert.equal(p.ready, false);
  assert.equal(p.trend, 'flat');
  assert.equal(p.solvesToNextDrop, null, 'flat readiness gives no honest ETA');
  assert.equal(p.solvesToMental, null);
});

test('non-clean solves score zero; a stalled learner gets a "drill, don\'t advance" message', () => {
  const p = P(many(6, { clean: false, ms: 5000 }), 0);
  assert.equal(p.readiness, 0);
  assert.equal(p.trend, 'flat');
  assert.equal(p.solvesToMental, null);
  assert.match(p.message, /not climbing/i);
});

test('an improving trend yields a finite ETA in solves and minutes', () => {
  // five non-clean, then five clean-comfortable: readiness climbing
  const solves = [...many(5, { clean: false, ms: 5000 }), ...many(5, { clean: true, ms: 2000 })];
  const p = P(solves, 0);
  assert.equal(p.trend, 'improving');
  assert.ok(p.readiness > 0 && p.readiness < 0.8);
  assert.ok(Number.isInteger(p.solvesToNextDrop) && p.solvesToNextDrop > 0);
  assert.ok(p.solvesToMental >= p.solvesToNextDrop, 'mental is at least the next drop away');
  assert.ok(p.minutesToMental > 0);
  assert.match(p.message, /to reach Mental/i);
});

test('the roll-up spans the remaining stages: Beads adds a fresh stage, Percept does not', () => {
  const solves = [...many(4, { clean: false, ms: 5000 }), ...many(6, { clean: true, ms: 2000 })];
  const beads = P(solves, 0);   // two stages remain (Beads→Percept→Mental)
  const percept = P(solves.map(x => ({ ...x, support: 1 })), 1); // one stage remains
  assert.ok(beads.solvesToMental > beads.solvesToNextDrop, 'Beads rolls in the Percept stage');
  assert.equal(percept.solvesToMental, percept.solvesToNextDrop, 'from Percept, next drop IS mental');
  assert.equal(beads.stagesRemaining, 2);
  assert.equal(percept.stagesRemaining, 1);
});

test('already at Mental: celebratory, ready, and counts banked clean solves', () => {
  const p = P([...many(3, { support: 2, clean: true }), s({ support: 2, clean: false })], 2);
  assert.equal(p.atMental, true);
  assert.equal(p.ready, true);
  assert.equal(p.stageName, 'Mental');
  assert.match(p.message, /3 clean mental solves/i);
});

test('ready at Percept points straight at Mental with ~no time left', () => {
  const p = P(many(6, { support: 1, ms: 2000, clean: true }), 1);
  assert.equal(p.ready, true);
  assert.equal(p.solvesToMental, 0);
  assert.equal(p.minutesToMental, 0);
  assert.match(p.message, /drop to Mental now/i);
});

test('invariants hold across many shapes (bounds, monotonic roll-up, minutes⇔solves)', () => {
  const shapes = [];
  for (let clean = 0; clean <= 12; clean++) {
    for (const cut of [0, 4, 8, 12]) { // where the clean run starts
      const arr = Array.from({ length: 12 }, (_, i) => s({
        clean: i >= cut && i < cut + clean,
        ms: (i >= cut && i < cut + clean) ? 2000 : 5000,
      }));
      shapes.push(arr);
    }
  }
  for (const support of [0, 1]) {
    for (const arr of shapes) {
      const p = P(arr, support);
      assert.ok(p.readiness >= 0 && p.readiness <= 1, 'readiness in [0,1]');
      assert.ok(['improving', 'flat', 'declining', 'unknown'].includes(p.trend));
      if (p.solvesToNextDrop !== null) {
        assert.ok(Number.isInteger(p.solvesToNextDrop) && p.solvesToNextDrop >= 0 && p.solvesToNextDrop <= 80);
      }
      if (p.ready) assert.equal(p.solvesToNextDrop, 0);
      if (p.solvesToMental !== null && p.solvesToNextDrop !== null) {
        assert.ok(p.solvesToMental >= p.solvesToNextDrop);
      }
      assert.equal(p.minutesToMental === null, p.solvesToMental === null, 'minutes null iff solves null');
    }
  }
});

test('STAGE_NAMES is the Beads→Percept→Mental ladder', () => {
  assert.deepEqual(STAGE_NAMES, ['Beads', 'Percept', 'Mental']);
});
