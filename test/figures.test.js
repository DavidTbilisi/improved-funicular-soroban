import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  figure, rodGlyph, figDigits, figComplements, figPlaceValue,
  multTableHTML, figLayout, figLadder, figDeckBests, figSessions, figTradeChain,
  figSolveTimes, figFumbles, cubeFaceGrid, figPrognosis,
} from '../src/view/figures.js';
import { prognose } from '../src/tutorial/prognosis.js';
import { fumbleRows } from '../src/tutorial/faultLog.js';
import { buildMultiplication, buildDivision } from '../src/domain/mulDiv.js';
import { planAdd } from '../src/domain/movePlan.js';
import { cubeFaceValues, CUBE_LAYOUT, digitFromFaces } from '../src/domain/faces.js';

const count = (s, re) => (s.match(re) || []).length;

test('figure wraps a plate with numbered caption chrome', () => {
  const f = figure(3, 'A caption.', '<svg></svg>');
  assert.ok(f.includes('Fig. 3'));
  assert.ok(f.includes('A caption.'));
  assert.ok(f.includes('fig-plate'));
});

test('cubeFaceGrid puts each face in its fixed die cell (opposite faces sum to 7)', () => {
  const home = { 1: 'cg-center', 2: 'cg-left', 3: 'cg-top', 4: 'cg-bottom', 5: 'cg-right' };
  const emoji = { 1: '🚕', 2: '🍊', 3: '👽', 4: '🌊', 5: '🌹' };
  for (let d = 1; d <= 5; d++) {
    const g = cubeFaceGrid(d);
    assert.equal(count(g, / on"/g), 1, `digit ${d} lights exactly one face`);
    assert.match(g, new RegExp(`cg-cell ${home[d]} on"[^>]*>${emoji[d]}<`), `digit ${d} in its home cell`);
  }
});

test('cubeFaceGrid lights rose + earth for 6-9 and nothing for 0', () => {
  assert.equal(count(cubeFaceGrid(0), / on"/g), 0);            // bare column
  for (let d = 6; d <= 9; d++) {
    const g = cubeFaceGrid(d);
    assert.equal(count(g, / on"/g), 2, `digit ${d} lights rose + one earth`);
    assert.ok(g.includes('🌹'), `digit ${d} carries the rose`);
  }
  assert.match(cubeFaceGrid(8), /cg-top on"[^>]*>👽</);         // 8 = rose + alien(top)
  assert.match(cubeFaceGrid(6), /cg-center on"[^>]*>🚕</);      // 6 = rose + taxi(center)
});

test('digitFromFaces inverts cubeFaceValues for every digit (the chord round-trip)', () => {
  const posOf = Object.fromEntries(CUBE_LAYOUT.map(f => [f.value, f.pos])); // value → die cell
  for (let d = 1; d <= 9; d++) {
    const positions = cubeFaceValues(d).map(v => posOf[v]);                 // the cells d lights
    assert.equal(digitFromFaces(positions), d, `digit ${d} round-trips through its die cells`);
  }
  assert.equal(digitFromFaces([]), 0, 'no cells → 0 (bare column)');
});

test('digitFromFaces reads top+bottom as the center (1), and rejects non-die combos', () => {
  assert.equal(digitFromFaces(['top', 'bottom']), 1);            // up+down stand in for the center
  assert.equal(digitFromFaces(['top', 'bottom', 'right']), 6);   // center + rose = 6
  assert.equal(digitFromFaces(['left', 'right']), 7);            // 2 + 5
  assert.equal(digitFromFaces(['top', 'left']), null);           // two earth cells: not a die face
  assert.equal(digitFromFaces(['left', 'top', 'right']), null);  // ditto, even with the rose
});

test('rodGlyph encodes the digit in bead fills (5 beads per rod)', () => {
  for (let d = 0; d <= 9; d++) {
    const g = rodGlyph(d);
    assert.equal(count(g, /<ellipse/g), 5, 'sky + 4 earth');
    // counted beads are ink-filled: sky (d>=5) + d%5 earth
    assert.equal(count(g, /fill="var\(--ink\)"/g), (d >= 5 ? 1 : 0) + (d % 5), `digit ${d}`);
  }
});

test('figDigits shows all ten digits', () => {
  const f = figDigits();
  assert.equal(count(f, /<ellipse/g), 50);
  for (let d = 0; d <= 9; d++) assert.ok(f.includes(`>${d}</text>`));
});

test('complement figures pair every digit with its friend', () => {
  const f5 = figComplements(5);
  assert.equal(count(f5, /<path/g), 2, 'arcs 1↔4, 2↔3');
  assert.equal(count(f5, /<circle/g), 4, 'digit nodes 1–4');
  const f10 = figComplements(10);
  assert.equal(count(f10, /<path/g), 4, 'arcs 1↔9 … 4↔6');
  assert.equal(count(f10, /<circle/g), 9, 'digit nodes 1–9');
  assert.ok(f10.includes('stroke-dasharray'), '5 is marked as its own complement');
});

test('figSolveTimes: empty state, floor rule, and clean/hollow dot encoding', () => {
  assert.ok(figSolveTimes([], 1000).includes('fig-empty'));
  const solves = [
    { t: '2026-01-01T09:00', ms: 2000, clean: true },
    { t: '2026-01-02T09:00', ms: 1500, clean: false },
    { t: '2026-01-03T09:00', ms: 900, clean: true },
  ];
  const f = figSolveTimes(solves, 1000);
  assert.ok(f.includes('stroke="var(--shu)"'), 'the pace floor is a shu rule');
  assert.equal(count(f, /fill="var\(--data\)" stroke="var\(--paper-2\)"/g), 2, 'clean solves are solid dots');
  assert.equal(count(f, /fill="var\(--paper-2\)" stroke="var\(--data\)"/g), 1, 'a non-clean solve is hollow');
  assert.ok(f.includes('>0.9s</text>'), 'the latest time is labelled');
  assert.ok(f.includes('2026-01-01'), 'x-axis anchored by first date');
});

test('figFumbles: empty state, bars per pair, and the reset footnote', () => {
  const zero = fumbleRows({ pairs: {}, resets: 0 });
  assert.ok(figFumbles(zero, 0).includes('fig-empty'));
  const rows = fumbleRows({ pairs: { 'small:2-3': 5, 'big:4-6': 2 }, resets: 0 });
  const f = figFumbles(rows, 2);
  assert.equal(count(f, /<path d="M/g), 2, 'one bar per fumbled pair');
  assert.ok(f.includes('2 ↔ 3 · five'));
  assert.ok(f.includes('>5</text>'), 'count labelled at the bar end');
  assert.ok(f.includes('resets (Q): 2'));
});

test('figTradeChain walks 6+7 through every intermediate board state', () => {
  const f = figTradeChain(6, planAdd(6, 7));
  for (const v of ['6', '16', '11', '13']) assert.ok(f.includes(`>${v}</text>`), `frame value ${v}`);
  for (const m of ['+10', '−5', '+2']) assert.ok(f.includes(`>${m}</text>`), `move label ${m}`);
  for (const k of ['U', 'F', 'J']) assert.ok(f.includes(`>${k}</text>`), `key label ${k}`);
  assert.equal(count(f, /<ellipse/g), 4 * 2 * 5, 'four frames of two rods, five beads each');
});

test('place-value chart stems only non-zero digits and labels the dominant rod', () => {
  const places = [
    { label: 'C', exp: 2, digit: 0, frac: false },
    { label: 'B', exp: 1, digit: 1, frac: false },
    { label: 'A', exp: 0, digit: 9, frac: false, dp: false },
    { label: 'a', exp: -1, digit: 5, frac: true, dp: true },
  ];
  const f = figPlaceValue(places);
  // 3 stems (2px data vlines) — the zero digit gets a hollow baseline dot instead
  assert.equal(count(f, /stroke="var\(--data\)" stroke-width="2"/g), 3);
  // dominant contribution is 1×10¹ = 10 > 9 > 0.5 → labelled "10"
  assert.ok(f.includes('>10</text>'));
  // the decimal boundary and frac labels carry the violet decimal identity
  assert.ok(f.includes('var(--violet)'));
});

test('place-value stem height is monotone in contribution', () => {
  const y = digit => {
    const f = figPlaceValue([{ label: 'A', exp: 0, digit, frac: false }]);
    return +f.match(/<circle cx="[\d.]+" cy="([\d.]+)" r="4.5"/)[1];
  };
  assert.ok(y(9) < y(2), 'bigger contribution → higher dot (smaller y)');
});

test('multiplication table has 81 shaded product cells with flip-contrast text', () => {
  const t = multTableHTML();
  assert.equal(count(t, /<td id="mt-/g), 81);
  assert.ok(t.includes('id="mt-7-8"') && t.includes('7 × 8 = 56'));
  assert.ok(t.includes('color:var(--paper)'), 'dark cells flip to paper text');
  assert.ok(t.includes('color:var(--ink)'), 'light cells keep ink text');
});

test('layout band brackets all three regions for × and ÷', () => {
  const m = figLayout(buildMultiplication(76, 3));
  assert.ok(m.includes('>×3</text>') && m.includes('>76</text>') && m.includes('>product</text>'));
  const d = figLayout(buildDivision(144, 3));
  assert.ok(d.includes('>÷3</text>') && d.includes('>144</text>') && d.includes('>quotient</text>'));
});

test('ladder chart draws a floor tick per level and seals cleared ones', () => {
  const infos = [
    { idx: 0, id: 'a', title: 'Read', floor: 6, unlocked: true, best: 7 },   // cleared
    { idx: 1, id: 'b', title: 'Direct', floor: 8, unlocked: true, best: 3 }, // in progress
    { idx: 2, id: 'c', title: 'Small', floor: 8, unlocked: false, best: 0 }, // locked
  ];
  const f = figLadder(infos);
  assert.equal(count(f, /var\(--shu\)" stroke-width="2"/g), 3, 'one floor tick per level');
  assert.equal(count(f, /fill="var\(--shu\)"/g), 1, 'one seal dot (cleared level)');
  assert.ok(f.includes('🔒'), 'locked level marked');
});

test('deck-bests chart draws bars only for drilled decks', () => {
  const f = figDeckBests([
    { label: 'Face → digit', best: { floorPct: 80, meanMs: 900, t: '2026-07-01T10:00' } },
    { label: 'Digit → face', best: null },
  ]);
  assert.equal(count(f, /<path d="M/g), 1, 'one bar');
  assert.ok(f.includes('80%'));
  assert.ok(f.includes('>—</text>'), 'undrilled deck shows an em-dash');
  assert.ok(figDeckBests([{ label: 'Face → digit', best: null }]).includes('fig-empty'),
    'all-undrilled decks collapse to the empty message, not an empty chart');
});

test('session trend: empty message, single dot, and a 2px line for a history', () => {
  assert.ok(figSessions([]).includes('fig-empty'));
  const one = figSessions([{ t: '2026-07-01T10:00', floorPct: 50, acc: 90, meanMs: 800, n: 10 }]);
  assert.equal(count(one, /<circle/g), 1);
  assert.ok(!one.includes('<path'), 'no line through a single point');
  const many = figSessions([
    { t: '2026-07-01T10:00', floorPct: 40, acc: 80, meanMs: 900, n: 10 },
    { t: '2026-07-02T10:00', floorPct: 60, acc: 85, meanMs: 850, n: 12 },
    { t: '2026-07-03T10:00', floorPct: 75, acc: 92, meanMs: 700, n: 15 },
  ]);
  assert.equal(count(many, /<circle/g), 3);
  assert.ok(many.includes('stroke-width="2"'));
  assert.ok(many.includes('>75%</text>'), 'endpoint labelled');
  assert.equal(count(many, /fill="var\(--shu\)"/g), 1, 'only the latest dot is shu');
});

test('prognosis figure: empty state, an ETA plate, and the Mental celebration', () => {
  const s = (over = {}) => ({ t: '2026-01-01T00:00', ms: 2000, clean: true, support: 0, ...over });
  const opt = { floorMs: 4000, support: 0 };

  // no data -> the empty message, no svg
  const empty = figPrognosis(prognose([], opt));
  assert.ok(empty.includes('fig-empty'));
  assert.ok(!empty.includes('<svg'));

  // improving history -> an svg runway with the three stations and an ETA
  const improving = prognose(
    [...Array(5).fill(s({ clean: false, ms: 5000 })), ...Array(5).fill(s({ ms: 2000 }))], opt);
  const plate = figPrognosis(improving);
  assert.ok(plate.includes('<svg'));
  ['Beads', 'Percept', 'Mental'].forEach(n => assert.ok(plate.includes(`>${n}</text>`), `station ${n} labelled`));
  assert.ok(/≈ [^<]+ min/.test(plate), 'headline ETA in minutes');
  assert.ok(plate.includes('drops to go'), 'names the remaining support drops');
  assert.ok(plate.includes('pace improving'));
  assert.ok(plate.includes('you are here'));
  assert.ok(plate.includes('drop @80%'), 'the readiness gauge marks the drop threshold');

  // at Mental -> celebration, no ETA runway headline
  const mental = figPrognosis(prognose([s({ support: 2 })], { floorMs: 4000, support: 2 }));
  assert.ok(mental.includes('🧠 Mental'));
  assert.ok(!mental.includes('drops to go'));
});
