import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_RUNG, readyForAnzan, suggestRung } from '../src/anzan/bridge.js';
import { ANZAN_LEVELS } from '../src/anzan/levels.js';
import { TUTORIAL_LEVELS } from '../src/tutorial/levels.js';
import { prognose } from '../src/tutorial/prognosis.js';

const rungs = (cleared = [], fastest = {}) => ANZAN_LEVELS.map(l => ({
  id: l.id, cleared: cleared.includes(l.id), fastest: fastest[l.id] ?? null,
}));

const READY = { ready: true, enoughData: true };
const NOT_READY = { ready: false, enoughData: true };

// --- the map is a contract between two ladders ------------------------------
test('every practice level maps to a real anzan rung', () => {
  for (const [levelId, rungId] of Object.entries(LEVEL_RUNG)) {
    assert.ok(TUTORIAL_LEVELS.some(l => l.id === levelId), `${levelId} is a real practice level`);
    assert.ok(ANZAN_LEVELS.some(l => l.id === rungId), `${rungId} is a real anzan rung`);
  }
});

test('every practice level is mapped — none falls through to the default', () => {
  for (const l of TUTORIAL_LEVELS) {
    assert.ok(LEVEL_RUNG[l.id], `${l.id} has no anzan rung`);
  }
});

test('the map never goes backwards down the anzan ladder', () => {
  const order = TUTORIAL_LEVELS.map(l => ANZAN_LEVELS.findIndex(a => a.id === LEVEL_RUNG[l.id]));
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i] >= order[i - 1],
      `${TUTORIAL_LEVELS[i].id} maps below ${TUTORIAL_LEVELS[i - 1].id}`);
  }
});

// --- the gate ---------------------------------------------------------------
test('at Beads there is no suggestion, however good the solves are', () => {
  assert.equal(readyForAnzan({ support: 0, prognosis: READY }), false);
  assert.equal(suggestRung({ levelId: 'big-add', support: 0, prognosis: READY, rungs: rungs() }), null);
});

test('at Percept the suggestion waits for readiness', () => {
  assert.equal(readyForAnzan({ support: 1, prognosis: NOT_READY }), false);
  assert.equal(readyForAnzan({ support: 1, prognosis: READY }), true);
  assert.equal(suggestRung({ levelId: 'read', support: 1, prognosis: NOT_READY, rungs: rungs() }), null);
  assert.ok(suggestRung({ levelId: 'read', support: 1, prognosis: READY, rungs: rungs() }));
});

test('readiness without enough data does not open the gate', () => {
  assert.equal(readyForAnzan({ support: 1, prognosis: { ready: true, enoughData: false } }), false);
});

test('at Mental the suggestion is unconditional — that is what Mental is for', () => {
  assert.equal(readyForAnzan({ support: 2, prognosis: NOT_READY }), true);
  assert.ok(suggestRung({ levelId: 'read', support: 2, prognosis: NOT_READY, rungs: rungs() }));
});

test('the gate accepts a real prognose() result, not just a hand-made one', () => {
  const solves = Array.from({ length: 12 }, () => ({ t: '2026-07-20T10:00', ms: 1500, clean: true, support: 1 }));
  const p = prognose(solves, { floorMs: 4500, support: 1 });
  assert.equal(p.ready && p.enoughData, true, 'fixture really is ready');
  assert.equal(readyForAnzan({ support: 1, prognosis: p }), true);
});

// --- which rung -------------------------------------------------------------
test('an untouched ladder points at the rung matching your level', () => {
  const s = suggestRung({ levelId: 'big-add', support: 2, rungs: rungs() });
  assert.equal(s.id, 'five1');
  assert.equal(s.kind, 'start');
  assert.equal(s.terms, 5);
  assert.equal(s.digits, 1);
  assert.match(s.why, /blind/);
});

test('a carried shape moves you on to the next rung', () => {
  const s = suggestRung({ levelId: 'big-add', support: 2, rungs: rungs(['five1']) });
  assert.equal(s.id, 'ten1');
  assert.equal(s.kind, 'next');
  assert.match(s.why, /next rung/);
});

test('it skips a run of carried rungs, not just one', () => {
  const s = suggestRung({ levelId: 'read', support: 2, rungs: rungs(['warm', 'five1', 'ten1']) });
  assert.equal(s.id, 'three2');
});

test('rungs carried BELOW your level do not pull the suggestion back down', () => {
  // 'warm' is carried but 'multi' maps to three2 — the suggestion starts there.
  const s = suggestRung({ levelId: 'multi', support: 2, rungs: rungs(['warm']) });
  assert.equal(s.id, 'three2');
});

test('an uncarried rung below your level is likewise not offered', () => {
  const s = suggestRung({ levelId: 'divide', support: 2, rungs: rungs() });
  assert.equal(s.id, 'ten2', 'it starts at the mapped floor, not the bottom');
});

test('with everything carried the remaining axis is speed', () => {
  const all = ANZAN_LEVELS.map(l => l.id);
  const s = suggestRung({ levelId: 'read', support: 2, rungs: rungs(all, { ten3: 400 }) });
  assert.equal(s.id, 'ten3');
  assert.equal(s.kind, 'push');
  assert.match(s.why, /below 400 ms/);
});

test('the push message copes with no recorded pace', () => {
  const all = ANZAN_LEVELS.map(l => l.id);
  const s = suggestRung({ levelId: 'read', support: 2, rungs: rungs(all) });
  assert.equal(s.kind, 'push');
  assert.match(s.why, /push the pace/);
});

// --- defaults and junk ------------------------------------------------------
test('an unknown or missing level falls back to the bottom rung', () => {
  for (const levelId of [null, undefined, 'no-such-level']) {
    const s = suggestRung({ levelId, support: 2, rungs: rungs() });
    assert.equal(s.id, ANZAN_LEVELS[0].id, String(levelId));
  }
});

test('no rung state at all still yields a suggestion', () => {
  const s = suggestRung({ levelId: 'big-add', support: 2 });
  assert.equal(s.id, 'five1');
  assert.equal(s.kind, 'start');
});

test('suggestRung called with nothing is null, not a throw', () => {
  assert.equal(suggestRung(), null);
  assert.equal(readyForAnzan(), false);
});

test('the suggestion carries what a link needs to render itself', () => {
  const s = suggestRung({ levelId: 'read', support: 2, rungs: rungs() });
  for (const k of ['id', 'title', 'terms', 'digits', 'baseMs', 'floor', 'kind', 'why']) {
    assert.ok(s[k] !== undefined, `missing ${k}`);
  }
});
