import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  figure, rodGlyph, figDigits, figComplements, figPlaceValue,
  multTableHTML, figLayout, figLadder, figDeckBests, figSessions, figTradeChain,
} from '../src/view/figures.js';
import { buildMultiplication, buildDivision } from '../src/domain/mulDiv.js';
import { planAdd } from '../src/domain/movePlan.js';

const count = (s, re) => (s.match(re) || []).length;

test('figure wraps a plate with numbered caption chrome', () => {
  const f = figure(3, 'A caption.', '<svg></svg>');
  assert.ok(f.includes('Fig. 3'));
  assert.ok(f.includes('A caption.'));
  assert.ok(f.includes('fig-plate'));
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

test('figTradeChain walks 6+7 through every intermediate board state', () => {
  const f = figTradeChain(6, planAdd(6, 7));
  for (const v of ['6', '16', '11', '13']) assert.ok(f.includes(`>${v}</text>`), `frame value ${v}`);
  for (const m of ['+10', '−5', '+2']) assert.ok(f.includes(`>${m}</text>`), `move label ${m}`);
  for (const k of ['I', 'R', 'K']) assert.ok(f.includes(`>${k}</text>`), `key label ${k}`);
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
