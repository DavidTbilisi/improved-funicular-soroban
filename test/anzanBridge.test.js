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

// --- the reverse direction: a stalling rung → the board work that fixes it ---
import { RUNG_LEVELS, isStalling, diagnoseRung } from '../src/anzan/bridge.js';
import { fumbleRows } from '../src/tutorial/faultLog.js';

const allLevels = (over = {}) => TUTORIAL_LEVELS.map(l => ({
  id: l.id, title: l.title, unlocked: true, cleared: false, ...(over[l.id] || {}),
}));
const faultsFor = pairs => fumbleRows({ pairs, resets: 0 });

test('RUNG_LEVELS is exactly LEVEL_RUNG inverted — the two directions cannot drift', () => {
  for (const [levelId, rungId] of Object.entries(LEVEL_RUNG)) {
    assert.ok(RUNG_LEVELS[rungId].includes(levelId), `${rungId} → ${levelId}`);
  }
  for (const [rungId, ids] of Object.entries(RUNG_LEVELS)) {
    for (const id of ids) assert.equal(LEVEL_RUNG[id], rungId);
  }
});

test('a rung only reads as stalling with enough evidence AND bad evidence', () => {
  assert.equal(isStalling({ rounds: 10, accuracy: 0.3 }), true);
  assert.equal(isStalling({ rounds: 10, accuracy: 0.9 }), false, 'doing fine');
  assert.equal(isStalling({ rounds: 2, accuracy: 0.0 }), false, 'two bad rounds is noise');
  assert.equal(isStalling({ rounds: 10, accuracy: null }), false, 'no data is not bad data');
  assert.equal(isStalling(), false);
});

test('a healthy or barely-tried rung is diagnosed as nothing — no nagging', () => {
  const args = { rungId: 'five1', faults: faultsFor({ 'big:3-7': 9 }), levels: allLevels() };
  assert.equal(diagnoseRung({ ...args, rounds: 10, accuracy: 0.9 }), null);
  assert.equal(diagnoseRung({ ...args, rounds: 2, accuracy: 0 }), null);
  assert.equal(diagnoseRung(), null);
});

test('a stalling rung names the pair its own trades belong to', () => {
  const d = diagnoseRung({
    rungId: 'five1', rounds: 10, accuracy: 0.3,
    faults: faultsFor({ 'big:3-7': 9, 'small:1-4': 4 }), levels: allLevels(),
  });
  assert.equal(d.levelId, 'big-add');
  assert.equal(d.pair, 'big:3-7');
  assert.equal(d.pairLabel, '3 ↔ 7');
  assert.equal(d.count, 9);
  assert.match(d.why, /ten-trades/);
});

// The honesty constraint: anzan has no board, so a miss produces no fault entry.
// The wording must claim a standing weakness, never a cause.
test('the wording claims a standing weakness, not a cause of the miss', () => {
  const d = diagnoseRung({
    rungId: 'five1', rounds: 10, accuracy: 0.3,
    faults: faultsFor({ 'big:3-7': 9 }), levels: allLevels(),
  });
  assert.match(d.why, /this rung leans on/, 'it describes what the rung exercises');
  assert.match(d.why, /your board record/, 'and where the evidence came from');
  assert.ok(!/caused|because of|due to/i.test(d.why), 'and never asserts causation');
});

test('a pair the rung does not drill is not pinned on it', () => {
  // warm is a 3-term 1-digit rung: ten-crossings are rare, so a ten-pair fumble
  // is not what is going wrong here.
  const d = diagnoseRung({
    rungId: 'warm', rounds: 10, accuracy: 0.3,
    faults: faultsFor({ 'big:3-7': 9 }), levels: allLevels(),
  });
  assert.equal(d.pair, null);
  assert.match(d.why, /trades this rung does not lean on/);
});

test('no fault record at all says so, rather than inventing a pair', () => {
  const d = diagnoseRung({ rungId: 'five1', rounds: 10, accuracy: 0.3, faults: faultsFor({}), levels: allLevels() });
  assert.equal(d.pair, null);
  assert.equal(d.levelId, 'big-add');
  assert.match(d.why, /no fumble pattern on record/);
});

test('a fumble count below the noise floor is not a pattern', () => {
  const d = diagnoseRung({
    rungId: 'five1', rounds: 10, accuracy: 0.3,
    faults: faultsFor({ 'big:3-7': 2 }), levels: allLevels(),
  });
  assert.equal(d.pair, null);
});

test('every rung resolves to a level, including the ones nothing maps to', () => {
  for (const l of ANZAN_LEVELS) {
    const d = diagnoseRung({
      rungId: l.id, rounds: 10, accuracy: 0.3,
      faults: faultsFor({ 'big:3-7': 9 }), levels: allLevels(),
    });
    assert.ok(d, `${l.id} produced no diagnosis`);
    assert.ok(TUTORIAL_LEVELS.some(t => t.id === d.levelId), `${l.id} → ${d.levelId} is a real level`);
  }
});

test('the 3-digit rungs fall back to the nearest mapped rung, not to nothing', () => {
  // Nothing maps to three3/five3/ten3 — the board ladder runs out first.
  assert.ok(!RUNG_LEVELS.ten3);
  const d = diagnoseRung({
    rungId: 'ten3', rounds: 10, accuracy: 0.3,
    faults: faultsFor({ 'big:3-7': 9 }), levels: allLevels(),
  });
  assert.equal(d.levelId, 'divide', 'the highest mapped board level');
});

test('a locked level is never proposed', () => {
  const locked = allLevels({ 'big-add': { unlocked: false }, 'big-sub': { unlocked: false } });
  const d = diagnoseRung({
    rungId: 'five1', rounds: 10, accuracy: 0.3,
    faults: faultsFor({ 'big:3-7': 9 }), levels: locked,
  });
  // five1's own levels are locked, so it walks down to warm's.
  assert.ok(['read', 'direct', 'small-add', 'small-sub'].includes(d.levelId), d.levelId);
});

test('with no level state at all there is nothing to propose', () => {
  assert.equal(diagnoseRung({ rungId: 'five1', rounds: 10, accuracy: 0.3, faults: faultsFor({ 'big:3-7': 9 }), levels: [] }), null);
});

test('an uncleared candidate is preferred over a cleared one', () => {
  const d = diagnoseRung({
    rungId: 'warm', rounds: 10, accuracy: 0.3, faults: faultsFor({}),
    levels: allLevels({ read: { cleared: true }, direct: { cleared: true } }),
  });
  assert.equal(d.levelId, 'small-add', 'read and direct are done; small-add is not');
});
