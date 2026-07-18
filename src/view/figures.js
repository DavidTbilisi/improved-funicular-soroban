// ============================================================================
// Figures — the textbook plates. Every function here is a PURE string builder
// (no document, no globals) that returns inline SVG/HTML in the ink-on-paper
// mark language: hairline solid grids, 2px lines, dots with paper rings, ink
// for data, shu strictly for attention (targets, floors, the current thing).
// Pages drop the strings into a mount and re-render on store/session events —
// that is what makes the figures "live". Being pure strings, they are unit-
// tested like the domain (see test/figures.test.js).
//
// Chart forms follow the data's job: magnitude grid → heatmap; magnitude across
// decades → lollipop on a labelled log axis; progress vs requirement → bar with
// a target tick; trend → line + dots. All single-series monochrome: identity
// never rides on color.
// ============================================================================

import { MOVE_KEYS } from '../domain/movePlan.js';
import { CUBE_FACES } from '../domain/pegs.js';
import { CUBE_LAYOUT, cubeFaceValues, cubeName } from '../domain/faces.js';
import { fingerPlan, nineFoldPlan } from '../domain/fingers.js';
import { chisanbopAdd, chisanbopSub, handOf, actionValue } from '../domain/chisanbop.js';

// A digit as a die face: each face-emoji in its fixed cell (taxi center, alien
// top, tangerine left, rose right, wave bottom), lit when the digit contains it
// (6-9 = rose + earth). Empty cells keep the plus-frame visible, so the same
// slots always read the same face — the whole point of a spatial percept.
export function cubeFaceGrid(d) {
  const on = new Set(cubeFaceValues(d));
  const cells = CUBE_LAYOUT.map(({ pos, value }) => {
    const active = on.has(value);
    const f = CUBE_FACES[value];
    return `<span class="cg-cell cg-${pos}${active ? ' on' : ''}"${active ? ` title="${f.word}"` : ''}>${active ? f.emoji : ''}</span>`;
  }).join('');
  return `<span class="die-face" role="img" aria-label="${cubeName(d)}">${cells}</span>`;
}

const INK = 'var(--ink)';
const DATA = 'var(--data)';     // indigo — every chart mark
const VIOLET = 'var(--violet)'; // decimal identity
const SHU = 'var(--shu)';       // attention only
const STONE = 'var(--stone)';
const FAINT = 'var(--faint)';
const LINE = 'var(--line)';
const LINE2 = 'var(--line-2)';
const PAPER2 = 'var(--paper-2)';
const BEAD = 'var(--bead)';

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = n => String(n).split('').map(c => SUP[c] || c).join('');

const svg = (w, h, title, body) =>
  `<svg class="figsvg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}" preserveAspectRatio="xMidYMid meet" style="max-width:${Math.round(w * 1.25)}px">` +
  `<title>${title}</title>${body}</svg>`;
const txt = (x, y, s, { size = 10, fill = STONE, anchor = 'middle', weight = 400 } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${s}</text>`;
const hline = (x1, x2, y, stroke = LINE, w = 1) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${stroke}" stroke-width="${w}"/>`;
const vline = (x, y1, y2, stroke = LINE, w = 1) => `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${stroke}" stroke-width="${w}"/>`;

// A horizontal bar with a 4px-rounded data end and a square baseline end.
function bar(x0, y, len, h, fill) {
  if (len <= 0) return '';
  const r = Math.min(4, len, h / 2);
  return `<path d="M${x0} ${y} h${len - r} a${r} ${r} 0 0 1 ${r} ${r} v${h - 2 * r} a${r} ${r} 0 0 1 ${-r} ${r} h${-(len - r)} z" fill="${fill}"/>`;
}

// Wrap a plate in the textbook figure chrome. `no` is the per-page figure number.
export function figure(no, caption, plate, cls = '') {
  return `<figure class="fig ${cls}"><div class="fig-plate">${plate}</div>` +
    `<figcaption><span class="fig-no">Fig. ${no}</span> ${caption}</figcaption></figure>`;
}

// --- Bead-state glyphs -------------------------------------------------------
// One rod drawn as the instrument draws it: bar, sky bead above, four earth
// beads below; a bead counts when pushed toward the bar.
export function rodGlyph(d, ox = 0, oy = 0) {
  const cx = ox + 16, bary = oy + 24;
  let s = vline(cx, oy + 4, oy + 96, LINE2) + hline(ox + 4, ox + 28, bary, INK, 2);
  const skyOn = d >= 5;
  s += `<ellipse cx="${cx}" cy="${oy + (skyOn ? 18 : 9)}" rx="10" ry="5.5" fill="${skyOn ? INK : BEAD}"/>`;
  const k = d % 5;
  for (let i = 0; i < 4; i++) {
    const on = i < k;
    const cy = on ? oy + 31 + i * 11 : oy + 90 - (3 - i) * 11;
    s += `<ellipse cx="${cx}" cy="${cy}" rx="10" ry="5.5" fill="${on ? INK : BEAD}"/>`;
  }
  return s;
}

// Fig — the ten digits as bead states (the handbook's "how to form numbers").
export function figDigits() {
  let body = '';
  for (let d = 0; d <= 9; d++) {
    const ox = d * 33;
    body += rodGlyph(d, ox, 0);
    body += txt(ox + 16, 116, String(d), { size: 13, fill: INK, weight: 600 });
  }
  return svg(330, 124, 'The ten digits 0–9 as bead states', body);
}

// --- Complement pairing diagrams ---------------------------------------------
// The "friends": pairs that sum to 5 (small-friend moves) or 10 (carry/borrow).
export function figComplements(base) {
  const digits = base === 5 ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const step = base === 5 ? 64 : 46, x0 = base === 5 ? 64 : 40, cy = base === 5 ? 78 : 88;
  const w = x0 * 2 + step * (digits.length - 1);
  const X = d => x0 + (d - 1) * step;
  let body = '';
  // arcs first (under the nodes' stroke order)
  const pairs = [];
  for (let a = 1; a < base - a; a++) if (digits.includes(a)) pairs.push([a, base - a]);
  // nest the arcs — the widest pair rises highest, so nothing crosses; the
  // caption states the sum, so the arcs need no labels of their own.
  pairs.forEach(([a, b], i) => {
    const peak = cy - 32 - (pairs.length - 1 - i) * 14;
    body += `<path d="M${X(a)} ${cy - 18} Q ${(X(a) + X(b)) / 2} ${peak} ${X(b)} ${cy - 18}" fill="none" stroke="${DATA}" stroke-width="1.5"/>`;
  });
  for (const d of digits) {
    const self = base === 10 && d === 5; // 5 is its own ten-complement
    body += `<circle cx="${X(d)}" cy="${cy}" r="14" fill="${PAPER2}" stroke="${self ? SHU : INK}" stroke-width="1.5"${self ? ' stroke-dasharray="3 3"' : ''}/>`;
    body += txt(X(d), cy + 4, String(d), { size: 12, fill: INK, weight: 600 });
  }
  return svg(w, cy + 22, `Pairs of digits that sum to ${base}`, body);
}

// --- Compound-trade walkthrough ------------------------------------------------
// One worked example as a film strip of bead frames (tens + ones rod): each
// arrow is ONE key, each frame the board it leaves behind. `c` is the starting
// ones digit, `plan` comes from planAdd/planSub — deriving the frames from the
// real plan keeps figure and engine from ever drifting apart.
export function figTradeChain(c, plan) {
  let tens = 0, ones = c;
  const frames = [{ tens, ones, move: null }];
  for (const s of plan.steps) {
    const n = parseInt(s, 10);
    if (Math.abs(n) === 10) tens += Math.sign(n); else ones += n;
    frames.push({ tens, ones, move: s });
  }
  const FW = 65, GAP = 58, M = 8;
  const W = M * 2 + frames.length * FW + (frames.length - 1) * GAP;
  let body = '';
  frames.forEach((f, i) => {
    const ox = M + i * (FW + GAP);
    body += rodGlyph(f.tens, ox, 0) + rodGlyph(f.ones, ox + 33, 0);
    body += txt(ox + FW / 2, 118, String(f.tens * 10 + f.ones), { size: 13, fill: INK, weight: 600 });
    if (i > 0) { // the move that produced this frame, over an arrow from the last
      const x1 = ox - GAP + 6, x2 = ox - 6, ym = 58;
      body += `<line x1="${x1}" y1="${ym}" x2="${x2}" y2="${ym}" stroke="${LINE2}" stroke-width="1.5"/>`;
      body += `<path d="M${x2 - 5} ${ym - 3.5} L${x2} ${ym} L${x2 - 5} ${ym + 3.5}" fill="none" stroke="${LINE2}" stroke-width="1.5"/>`;
      body += txt((x1 + x2) / 2, ym - 8, f.move.replace('-', '−'), { size: 11, fill: DATA, weight: 600 });
      body += txt((x1 + x2) / 2, ym + 15, MOVE_KEYS[f.move] || '', { size: 9, fill: STONE });
    }
  });
  return svg(W, 128, 'A compound trade walked bead by bead', body);
}

// --- Place-value contribution chart (live) -----------------------------------
// Lollipop on a log axis. The trick that makes it teach: the stem height is
// log10(d·10^p) = p + log10(d) — the PLACE sets the decade, the DIGIT only
// nudges within it. places = [{ label, exp, digit, frac }] left→right.
export function figPlaceValue(places) {
  const W = 640, H = 216, L = 46, R = 10, T = 14, B = 34;
  const plotW = W - L - R, plotH = H - T - B;
  const lo = -4, hi = 11; // decades spanned by the board
  const yFor = v => T + ((hi - v) / (hi - lo)) * plotH;
  const xFor = i => L + (i + 0.5) * (plotW / places.length);
  let body = '';
  for (const v of [-3, 0, 3, 6, 9]) {
    body += hline(L, W - R, yFor(v), LINE) + txt(L - 5, yFor(v) + 3, `10${sup(v)}`, { size: 8.5, anchor: 'end', fill: FAINT });
  }
  body += hline(L, W - R, yFor(lo), LINE2); // baseline
  let maxI = -1, maxV = -Infinity;
  places.forEach((p, i) => { if (p.digit > 0) { const v = p.exp + Math.log10(p.digit); if (v > maxV) { maxV = v; maxI = i; } } });
  places.forEach((p, i) => {
    const x = xFor(i);
    if (p.digit > 0) {
      const y = yFor(p.exp + Math.log10(p.digit));
      body += vline(x, yFor(lo), y, DATA, 2);
      body += `<circle cx="${x}" cy="${y}" r="4.5" fill="${DATA}" stroke="${PAPER2}" stroke-width="2"><title>${p.label}: ${p.digit}×10${sup(p.exp)}</title></circle>`;
      if (i === maxI) { // selective label: the dominant rod only
        const val = p.digit * Math.pow(10, p.exp);
        const lab = p.exp >= 6 ? `${p.digit}×10${sup(p.exp)}` : val.toLocaleString('en-US', { maximumFractionDigits: 4 });
        body += txt(x, y - 9, lab, { size: 9, fill: INK, weight: 600 });
      }
    } else {
      body += `<circle cx="${x}" cy="${yFor(lo)}" r="2.5" fill="${PAPER2}" stroke="${LINE2}" stroke-width="1.5"/>`;
    }
    body += txt(x, H - B + 14, p.label, { size: 9, fill: p.frac ? VIOLET : STONE, weight: 600 });
    if (p.dp) body += vline(x - (plotW / places.length) / 2, T, H - B + 16, VIOLET, 1.5); // the decimal boundary
  });
  return svg(W, H, 'What each rod contributes to the number (log scale)', body);
}

// --- Multiplication table heatmap (HTML — it is, after all, a table) ---------
// Sequential glow by product; cell text flips to paper on bright fills.
// Cells carry id="mt-a-b" so the trainer can mark the live cell with .hot.
export function multTableHTML() {
  let rows = `<tr><th></th>${Array.from({ length: 9 }, (_, j) => `<th>${j + 1}</th>`).join('')}</tr>`;
  for (let a = 1; a <= 9; a++) {
    let cells = `<th>${a}</th>`;
    for (let b = 1; b <= 9; b++) {
      const p = a * b;
      // single-hue sequential out of the dark: well (#1a1826) → bright asagi
      // (#8fa0ff), brighter = larger; bright cells flip to dark (paper) text.
      const t = 0.05 + 0.95 * (p - 1) / 80;
      const lo = [26, 24, 38], hi = [143, 160, 255];
      const rgb = lo.map((c, k) => Math.round((1 - t) * c + t * hi[k]));
      const bright = t > 0.55;
      cells += `<td id="mt-${a}-${b}" style="background:rgb(${rgb.join(',')});color:${bright ? 'var(--paper)' : 'var(--ink)'}" title="${a} × ${b} = ${p}">${p}</td>`;
    }
    rows += `<tr>${cells}</tr>`;
  }
  return `<table class="multab" aria-label="Multiplication table, shaded by product">${rows}</table>`;
}

// --- Finger multiplication (the hands method, 6–10) --------------------------
// One worked example as a plate: each hand is five finger-circles, pinky→thumb
// numbered 6..10; fingers up to the operand are raised (lifted and inked, the
// bead-state convention: pushed = counts). The two hands MIRROR like real hands
// raised toward you — thumbs meet in the middle — so the plate teaches the
// physical gesture, not a diagram of it. The arithmetic lines below derive
// from the same fingerPlan the drill deck reveals, so plate and deck agree.
export function figFingerTrick(a = 7, b = 8) {
  const p = fingerPlan(a, b);
  const hand = (x0, up, mirror) => {
    let s = '';
    for (let i = 0; i < 5; i++) { // i = 0 is the pinky, finger value 6+i
      const raised = i < up;
      const cx = x0 + (mirror ? 4 - i : i) * 28, cy = raised ? 30 : 44;
      s += `<circle cx="${cx}" cy="${cy}" r="10" fill="${raised ? INK : BEAD}" stroke="${INK}" stroke-width="1"/>`;
      s += txt(cx, 70, String(6 + i), { size: 9 });
    }
    return s;
  };
  let body = hand(26, p.upA, false) + hand(202, p.upB, true);
  body += txt(170, 44, '×', { size: 14, fill: INK, weight: 600 });
  body += txt(82, 86, `${a}: raised ${p.upA} · folded ${p.downA}`, { size: 9 });
  body += txt(258, 86, `${b}: raised ${p.upB} · folded ${p.downB}`, { size: 9 });
  body += txt(170, 108, `tens — raised ${p.upA} + ${p.upB} = ${p.upA + p.upB} → ${p.tens}`, { size: 10, fill: INK });
  body += txt(170, 123, `units — folded ${p.downA} × ${p.downB} = ${p.units}`, { size: 10, fill: INK });
  body += txt(170, 141, `${a} × ${b} = ${p.tens} + ${p.units} = ${p.product}`, { size: 12, fill: INK, weight: 600 });
  return svg(340, 150, `Finger multiplication: ${a} × ${b}`, body);
}

// --- Nine-fold (the 9s-row hands method) --------------------------------------
// Ten fingers numbered 1..10; the folded one drops (hollow, the bead-state
// convention: withdrawn = doesn't count). Tens read left of the fold, units
// right of it — derived from the same nineFoldPlan the drill deck reveals.
export function figNineFold(n = 3) {
  const p = nineFoldPlan(n);
  const X = i => 26 + i * 32; // finger i (0-based, value i+1)
  let body = '';
  for (let i = 0; i < 10; i++) {
    const folded = i + 1 === n;
    body += `<circle cx="${X(i)}" cy="${folded ? 44 : 30}" r="10" fill="${folded ? BEAD : INK}" stroke="${INK}" stroke-width="1"/>`;
    body += txt(X(i), 70, String(i + 1), { size: 9 });
  }
  // The two sides of the fold, bracketed under the labels.
  const bracket = (lo, hi, label, color) => {
    const x1 = X(lo) - 10, x2 = X(hi) + 10, y = 82;
    return hline(x1, x2, y, color, 1.5) + vline(x1, y - 4, y, color, 1.5) + vline(x2, y - 4, y, color, 1.5) +
      txt((x1 + x2) / 2, y + 14, label, { size: 9.5, fill: color, weight: 600 });
  };
  body += bracket(0, n - 2, `${p.left} left → ${p.left * 10}`, DATA);
  body += bracket(n, 9, `${p.right} right → ${p.right}`, DATA);
  body += txt(170, 122, `9 × ${n} = ${p.product}`, { size: 12, fill: INK, weight: 600 });
  return svg(340, 132, `Nine-fold: 9 × ${n}`, body);
}

// --- Chisanbop trade, walked on the hands -------------------------------------
// The hand analog of figTradeChain: a chisanbop hand IS a rod (thumb = the
// 5-bead, four fingers = the earth beads), so the SAME friend trade replays as
// a film strip of ones-hand frames. Inked = pressed (counts), hollow = raised;
// the thumb is ringed and marked "5". A ±10 step is the carry — one press/lift
// on the LEFT (tens) hand — shown as the running value jumping a decade and the
// arrow reading "left hand". Frames come from chisanbop{Add,Sub}, so plate and
// drill can't drift.
function chisanHand(cx0, cy, h) {
  const R = 8, SP = 17, TG = 11;              // thumb, gap, then four fingers
  const slot = k => cx0 + (k === 0 ? 0 : TG + SP * k); // k=0 thumb, 1..4 fingers
  const dot = (x, on, ring) =>
    `<circle cx="${x}" cy="${cy}" r="${R}" fill="${on ? INK : BEAD}" stroke="${INK}" stroke-width="1"/>` +
    (ring ? `<circle cx="${x}" cy="${cy}" r="${R + 3}" fill="none" stroke="${INK}" stroke-width="1"/>` : '');
  let s = dot(slot(0), h.thumb, true) + txt(slot(0), cy + R + 14, '5', { size: 8, fill: FAINT });
  for (let k = 1; k <= 4; k++) s += dot(slot(k), k <= h.fingers, false);
  return { s, w: TG + SP * 4 + R };           // right edge from cx0
}

// c = starting ones digit, sign '+'/'-', d = digit to add/subtract (1..9).
export function figChisanbop(c, sign = '+', d = 1) {
  const m = sign === '-' ? chisanbopSub(c, d) : chisanbopAdd(c, d);
  // A borrow needs a ten already in play to take, so seed the left hand for it;
  // an add's carry lands on an empty left hand. This keeps the running value in
  // range (a bare ones digit can't go below zero).
  let tens = sign === '-' ? m.borrow : 0, ones = c;
  const start = tens * 10 + ones;
  const frames = [{ tens, ones, act: null }];
  for (const a of m.actions) {
    if (a.part === 'carry') tens += a.dir === 'press' ? 1 : -1;
    else ones += actionValue(a);
    frames.push({ tens, ones, act: a });
  }
  const R = 8, FW = 8 + (11 + 17 * 4 + 8) + 8, GAP = 48, M = 10, cy = 42;
  const W = M * 2 + frames.length * FW + (frames.length - 1) * GAP;
  const part = a => a.part === 'carry' ? 'left hand' : a.part; // thumb / fingers / left hand
  let body = '';
  frames.forEach((f, i) => {
    const ox = M + i * (FW + GAP);
    body += chisanHand(ox + R + 2, cy, handOf(f.ones)).s;
    const val = f.tens * 10 + f.ones;
    body += txt(ox + FW / 2, 92, String(val), { size: 13, fill: INK, weight: 600 });
    if (f.tens > 0) body += txt(ox + FW / 2, 106, `${f.tens} on the left hand`, { size: 8, fill: DATA });
    if (i > 0) { // the action that produced this frame, over an arrow from the last
      const x1 = ox - GAP + 6, x2 = ox - 6, ym = cy;
      body += `<line x1="${x1}" y1="${ym}" x2="${x2}" y2="${ym}" stroke="${LINE2}" stroke-width="1.5"/>`;
      body += `<path d="M${x2 - 5} ${ym - 3.5} L${x2} ${ym} L${x2 - 5} ${ym + 3.5}" fill="none" stroke="${LINE2}" stroke-width="1.5"/>`;
      body += txt((x1 + x2) / 2, ym - 8, f.act.step.replace('-', '−'), { size: 11, fill: DATA, weight: 600 });
      body += txt((x1 + x2) / 2, ym + 15, part(f.act), { size: 8.5, fill: STONE });
    }
  });
  return svg(W, 118, `Chisanbop: ${start} ${sign} ${d} walked on the hands`, body);
}

// --- Finger-facts heatmap (HTML, like the multiplication table) ---------------
// The 6–9 corner shaded by what still needs the hands: BRIGHT = low recall
// (share of lifetime reps landed correct-and-under-floor), dark = automatic.
// facts = a stats-service lifetime map { '7x8': { n, miss, sumMs, floorPass } }.
export function figFingerFacts(facts = {}) {
  if (!Object.keys(facts).length) {
    return `<div class="fig-empty">No Finger × reps saved yet — the 6–9 corner heats up here, bright where recall still needs the hands.</div>`;
  }
  let rows = `<tr><th></th>${[6, 7, 8, 9].map(b => `<th>${b}</th>`).join('')}</tr>`;
  for (let a = 6; a <= 9; a++) {
    let cells = `<th>${a}</th>`;
    for (let b = 6; b <= 9; b++) {
      const s = facts[`${a}x${b}`];
      if (!s || !s.n) {
        cells += `<td id="ff-${a}-${b}" title="${a} × ${b} — not drilled yet">—</td>`;
        continue;
      }
      const recall = s.floorPass / s.n;
      // Same single-hue ramp as the multiplication table, but keyed to the
      // automaticity GAP: well (#1a1826, recall 100%) → bright asagi (#8fa0ff,
      // recall 0%); bright cells flip to dark (paper) text.
      const t = 0.05 + 0.95 * (1 - recall);
      const lo = [26, 24, 38], hi = [143, 160, 255];
      const rgb = lo.map((c, k) => Math.round((1 - t) * c + t * hi[k]));
      const bright = t > 0.55;
      const title = `${a} × ${b} — ${s.n} rep${s.n === 1 ? '' : 's'} · ${s.miss} miss${s.miss === 1 ? '' : 'es'}` +
        ` · mean ${(s.sumMs / s.n / 1000).toFixed(1)}s · ${Math.round(recall * 100)}% under floor`;
      cells += `<td id="ff-${a}-${b}" style="background:rgb(${rgb.join(',')});color:${bright ? 'var(--paper)' : 'var(--ink)'}" title="${title}">${Math.round(recall * 100)}%</td>`;
    }
    rows += `<tr>${cells}</tr>`;
  }
  return `<table class="multab" aria-label="Finger-times facts, bright where recall still needs the hands">${rows}</table>`;
}

// --- Rod-layout band for a trainer problem (live) ----------------------------
// The handbook's bracket diagrams: which rods hold which operand, and where the
// answer forms (shu — that is where your attention goes).
export function figLayout(problem) {
  const L = String.fromCharCode; // place p -> letter A+p
  const n = problem.topRod + 1, cw = 27, W = 16 + n * cw, x = p => 8 + (problem.topRod - p) * cw;
  let body = '';
  for (let p = problem.topRod; p >= 0; p--) {
    body += `<rect x="${x(p)}" y="8" width="${cw - 4}" height="24" fill="${PAPER2}" stroke="${LINE2}"/>`;
    body += txt(x(p) + (cw - 4) / 2, 24, L(65 + p), { size: 11, fill: INK, weight: 600 });
  }
  const bracket = (rods, label, y, color) => {
    const hi = Math.max(...rods), lo = Math.min(...rods);
    const x1 = x(hi), x2 = x(lo) + cw - 4;
    return hline(x1, x2, y, color, 1.5) + vline(x1, y - 4, y, color, 1.5) + vline(x2, y - 4, y, color, 1.5) +
      txt((x1 + x2) / 2, y + 12, label, { size: 9, fill: color, weight: 600 });
  };
  // Short value labels only — the setup line above the figure names the roles,
  // and a one-rod bracket can't carry a word without colliding with its neighbor.
  const lay = problem.layout;
  if (problem.op === '×') {
    body += bracket(lay.multiplier, `×${problem.b}`, 42, STONE);
    body += bracket(lay.multiplicand, String(problem.a), 42, STONE);
    body += bracket(lay.product, 'product', 70, SHU);
  } else {
    body += bracket(lay.divisor, `÷${problem.b}`, 42, STONE);
    body += bracket(lay.dividend, String(problem.a), 42, STONE);
    body += bracket(lay.quotient, 'quotient', 70, SHU);
  }
  return svg(W, 92, `Rod layout for ${problem.prompt}`, body);
}

// --- Practice-ladder progress (live) -----------------------------------------
// Bars = best clean streak per level; shu tick = the streak the level demands;
// a shu seal-dot marks a cleared level. infos = session.levelInfos().
export function figLadder(infos) {
  const rowH = 24, LM = 186, W = 520, T = 8, trackW = W - LM - 44;
  const H = T + infos.length * rowH + 22;
  const xmax = Math.max(8, ...infos.map(l => Math.max(l.floor, l.best)));
  const xw = v => (v / xmax) * trackW;
  let body = '';
  for (let v = 0; v <= xmax; v += 2) {
    body += vline(LM + xw(v), T, T + infos.length * rowH - 6, LINE);
    body += txt(LM + xw(v), H - 6, String(v), { size: 8.5, fill: FAINT });
  }
  infos.forEach((l, i) => {
    const y = T + i * rowH, cy = y + rowH / 2;
    const dim = !l.unlocked;
    body += `<g${dim ? ' opacity="0.42"' : ''}>`;
    body += txt(LM - 10, cy + 3, `${dim ? '🔒 ' : ''}${l.idx + 1} · ${l.title}`, { size: 9.5, fill: INK, anchor: 'end' });
    body += hline(LM, LM + trackW, cy, LINE2);
    if (l.best > 0) body += bar(LM, cy - 4, xw(l.best), 8, DATA);
    body += vline(LM + xw(l.floor), cy - 7, cy + 7, SHU, 2); // the demanded streak
    if (l.best >= l.floor) body += `<circle cx="${LM + xw(l.best)}" cy="${cy}" r="4.5" fill="${SHU}" stroke="${PAPER2}" stroke-width="2"/>`;
    else if (l.best > 0) body += txt(LM + xw(l.best) + 7, cy + 3, String(l.best), { size: 8.5, fill: STONE, anchor: 'start' });
    body += '</g>';
  });
  return svg(W, H, 'Best clean streak per level vs the streak each level demands', body);
}

// --- Drill results: best session per deck (live) -----------------------------
// rows = [{ label, best: {floorPct, meanMs, t} | null }] in deck (tier) order.
export function figDeckBests(rows) {
  if (rows.every(r => !r.best)) return `<div class="fig-empty">No decks drilled yet — each deck's best session lands here, in tier order.</div>`;
  const rowH = 22, LM = 176, W = 520, T = 8, trackW = W - LM - 46;
  const H = T + rows.length * rowH + 24;
  const xw = pct => (pct / 100) * trackW;
  let body = '';
  for (const v of [0, 50, 100]) {
    body += vline(LM + xw(v), T, T + rows.length * rowH - 4, LINE);
    body += txt(LM + xw(v), H - 6, `${v}%`, { size: 8.5, fill: FAINT });
  }
  rows.forEach((r, i) => {
    const y = T + i * rowH, cy = y + rowH / 2;
    body += txt(LM - 10, cy + 3, r.label, { size: 9.5, fill: INK, anchor: 'end' });
    body += hline(LM, LM + trackW, cy, LINE2);
    if (r.best) {
      body += bar(LM, cy - 4, xw(r.best.floorPct), 8, DATA);
      body += txt(LM + xw(r.best.floorPct) + 7, cy + 3, `${r.best.floorPct}%`, { size: 8.5, fill: STONE, anchor: 'start' });
      if (r.best.floorPct === 100) body += `<circle cx="${LM + trackW}" cy="${cy}" r="4.5" fill="${SHU}" stroke="${PAPER2}" stroke-width="2"/>`;
    } else {
      body += txt(LM + 4, cy + 3, '—', { size: 9, fill: FAINT, anchor: 'start' });
    }
  });
  return svg(W, H, 'Best drill session per deck: share of reps under the pass-floor', body);
}

// --- Solve-time trend for one level / trainer mode (live) --------------------
// The automaticity curve made visible: y = seconds per solve, oldest → newest.
// The shu rule is the pace floor the gate demands; solid dots are clean solves,
// hollow dots slow/fumbled/assisted ones (shape, not color, carries identity).
export function figSolveTimes(solves, floorMs) {
  const W = 520, H = 168, L = 44, R = 16, T = 16, B = 26;
  const plotW = W - L - R, plotH = H - T - B;
  const n = solves.length;
  if (n === 0) return `<div class="fig-empty">No solves recorded yet — clear a few problems and the pace trend charts here.</div>`;
  const maxMs = Math.max(floorMs || 0, ...solves.map(s => s.ms)) * 1.15;
  const xFor = i => n === 1 ? L + plotW / 2 : L + (i / (n - 1)) * plotW;
  const yFor = ms => T + (1 - ms / maxMs) * plotH;
  const secs = ms => ms >= 10000 ? `${Math.round(ms / 1000)}s` : `${(ms / 1000).toFixed(1)}s`;
  let body = hline(L, W - R, yFor(0), LINE2) + txt(L - 5, yFor(0) + 3, '0', { size: 8.5, anchor: 'end', fill: FAINT });
  if (floorMs) {
    body += hline(L, W - R, yFor(floorMs), SHU, 1.5);
    body += txt(L - 5, yFor(floorMs) + 3, secs(floorMs), { size: 8.5, anchor: 'end', fill: SHU });
  }
  if (n > 1) {
    const d = solves.map((s, i) => `${i ? 'L' : 'M'}${xFor(i).toFixed(1)} ${yFor(s.ms).toFixed(1)}`).join(' ');
    body += `<path d="${d}" fill="none" stroke="${DATA}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  solves.forEach((s, i) => {
    const last = i === n - 1;
    body += `<circle cx="${xFor(i)}" cy="${yFor(s.ms)}" r="${last ? 5 : 4}" fill="${s.clean ? DATA : PAPER2}" stroke="${s.clean ? PAPER2 : DATA}" stroke-width="2">` +
      `<title>${s.t} — ${secs(s.ms)} · ${s.clean ? 'clean' : 'not clean'}</title></circle>`;
  });
  const lastS = solves[n - 1];
  body += txt(xFor(n - 1), yFor(lastS.ms) - 10, secs(lastS.ms), { size: 9.5, fill: INK, weight: 600 });
  body += txt(L, H - 6, solves[0].t.slice(0, 10), { size: 8.5, fill: FAINT, anchor: 'start' });
  if (n > 1) body += txt(W - R, H - 6, lastS.t.slice(0, 10), { size: 8.5, fill: FAINT, anchor: 'end' });
  return svg(W, H, 'Seconds per solve against the pace floor', body);
}

// --- Fumble diagnosis (live) ---------------------------------------------------
// Rejected moves counted by the complement pair their trade needed, in fixed
// pair order (rows = fumbleRows(faultLog.counts())). Counts, not rates — see
// faultLog.js for why. Resets ride along as a footnote.
export function figFumbles(rows, resets = 0) {
  const total = rows.reduce((s, r) => s + r.count, 0) + resets;
  if (total === 0) return `<div class="fig-empty">No fumbles logged yet — rejected moves chart here by the trade they demanded.</div>`;
  const rowH = 22, LM = 104, W = 520, T = 8, trackW = W - LM - 46;
  const H = T + rows.length * rowH + 40;
  const xmax = Math.max(4, ...rows.map(r => r.count));
  const xw = v => (v / xmax) * trackW;
  let body = '';
  for (const v of [0, Math.ceil(xmax / 2), xmax]) {
    body += vline(LM + xw(v), T, T + rows.length * rowH - 4, LINE);
    body += txt(LM + xw(v), T + rows.length * rowH + 10, String(v), { size: 8.5, fill: FAINT });
  }
  rows.forEach((r, i) => {
    const cy = T + i * rowH + rowH / 2;
    body += txt(LM - 10, cy + 3, r.label, { size: 9.5, fill: INK, anchor: 'end' });
    body += hline(LM, LM + trackW, cy, LINE2);
    if (r.count > 0) {
      body += bar(LM, cy - 4, xw(r.count), 8, DATA);
      body += txt(LM + xw(r.count) + 7, cy + 3, String(r.count), { size: 8.5, fill: STONE, anchor: 'start' });
    }
  });
  body += txt(LM, H - 8, `resets (Q): ${resets}`, { size: 9, fill: STONE, anchor: 'start' });
  return svg(W, H, 'Rejected moves by the complement pair their trade needed', body);
}

// --- Drill session trend for one deck (live) ---------------------------------
// sessions = the persisted history (oldest→newest), y = % of reps under floor.
export function figSessions(sessions) {
  const W = 520, H = 152, L = 38, R = 16, T = 16, B = 26;
  const plotW = W - L - R, plotH = H - T - B;
  const n = sessions.length;
  if (n === 0) return `<div class="fig-empty">No saved sessions yet — run a drill and stop it to record one.</div>`;
  const xFor = i => n === 1 ? L + plotW / 2 : L + (i / (n - 1)) * plotW;
  const yFor = pct => T + (1 - pct / 100) * plotH;
  let body = '';
  for (const v of [0, 50, 100]) {
    body += hline(L, W - R, yFor(v), LINE) + txt(L - 5, yFor(v) + 3, `${v}%`, { size: 8.5, anchor: 'end', fill: FAINT });
  }
  if (n > 1) {
    const d = sessions.map((s, i) => `${i ? 'L' : 'M'}${xFor(i).toFixed(1)} ${yFor(s.floorPct).toFixed(1)}`).join(' ');
    body += `<path d="${d}" fill="none" stroke="${DATA}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  sessions.forEach((s, i) => {
    const last = i === n - 1;
    body += `<circle cx="${xFor(i)}" cy="${yFor(s.floorPct)}" r="${last ? 5 : 4}" fill="${last ? SHU : DATA}" stroke="${PAPER2}" stroke-width="2">` +
      `<title>${s.t} — ${s.floorPct}% under floor · ${s.acc}% correct · mean ${s.meanMs}ms · ${s.n} reps</title></circle>`;
  });
  const lastS = sessions[n - 1];
  body += txt(xFor(n - 1), yFor(lastS.floorPct) - 10, `${lastS.floorPct}%`, { size: 9.5, fill: INK, weight: 600 });
  body += txt(L, H - 6, sessions[0].t.slice(0, 10), { size: 8.5, fill: FAINT, anchor: 'start' });
  if (n > 1) body += txt(W - R, H - 6, lastS.t.slice(0, 10), { size: 8.5, fill: FAINT, anchor: 'end' });
  return svg(W, H, 'Reps under the pass-floor across saved sessions', body);
}

// --- Mental-readiness prognosis (live) ---------------------------------------
// The forecast from prognose(): a three-station runway (Beads → Percept →
// Mental) with a readiness fill from the current station toward the next, a
// readiness gauge with the drop-threshold tick, and the headline ETA in minutes
// and solves. Shu marks the target — where you're headed, and the pass line.
const STATIONS = ['Beads', 'Percept', 'Mental'];
const roundMin = m => (m == null ? '—' : m < 1 ? '<1' : String(Math.round(m)));

export function figPrognosis(prog) {
  const W = 520, H = 182;
  if (!prog || (!prog.enoughData && prog.n === 0 && !prog.atMental)) {
    return `<div class="fig-empty">${prog ? prog.message : 'No solves yet — your time-to-mental charts here.'}</div>`;
  }
  const NX = [76, 260, 444], NY = 120, ready = prog.support / 2; // stations at 0,1,2
  // Runway: base track, then a solid fill for crossed segments and a partial
  // fill for the current one (readiness/READY, or full when ready to drop).
  let body = hline(NX[0], NX[2], NY, LINE2, 3);
  const frac = prog.ready ? 1 : Math.max(0, Math.min(1, prog.readiness / 0.8));
  for (let seg = 0; seg < 2; seg++) {
    const f = prog.support > seg ? 1 : prog.support === seg ? frac : 0;
    if (f > 0) body += hline(NX[seg], NX[seg] + f * (NX[seg + 1] - NX[seg]), NY, prog.support > seg ? DATA : SHU, 3);
  }
  STATIONS.forEach((name, i) => {
    const cur = i === prog.support, passed = i < prog.support;
    const fill = passed ? DATA : cur ? PAPER2 : PAPER2;
    const stroke = passed ? DATA : cur ? SHU : LINE2;
    body += `<circle cx="${NX[i]}" cy="${NY}" r="${cur ? 9 : 7}" fill="${fill}" stroke="${stroke}" stroke-width="${cur ? 3 : 2}"/>`;
    if (i === prog.support + 1) body += `<circle cx="${NX[i]}" cy="${NY}" r="13" fill="none" stroke="${SHU}" stroke-width="1" opacity="0.5"/>`; // the target
    body += txt(NX[i], NY + 28, name, { size: 10.5, fill: cur ? INK : STONE, weight: cur ? 700 : 400 });
  });
  body += txt(NX[prog.support], NY - 16, 'you are here', { size: 8.5, fill: SHU });

  // Readiness gauge (top-right): a 0→100% bar with the 80% drop tick in shu.
  const GX0 = 300, GX1 = 500, GY = 34, pctR = Math.round(prog.readiness * 100);
  body += txt(GX1, GY - 12, `readiness ${pctR}%`, { size: 10, fill: INK, anchor: 'end', weight: 600 });
  body += `<rect x="${GX0}" y="${GY}" width="${GX1 - GX0}" height="9" rx="4.5" fill="${PAPER2}" stroke="${LINE2}" stroke-width="1"/>`;
  const gw = (prog.readiness) * (GX1 - GX0);
  if (gw > 0) body += `<rect x="${GX0}" y="${GY}" width="${gw.toFixed(1)}" height="9" rx="4.5" fill="${prog.ready ? DATA : STONE}"/>`;
  const tickX = GX0 + 0.8 * (GX1 - GX0);
  body += vline(tickX, GY - 4, GY + 13, SHU, 1.5) + txt(tickX, GY + 26, 'drop @80%', { size: 8, fill: SHU });

  // Headline (top-left), stacked so nothing collides with the number.
  if (prog.atMental) {
    body += txt(16, 40, '🧠 Mental', { size: 24, fill: INK, anchor: 'start', weight: 700 });
    body += txt(18, 60, 'solving without the beads', { size: 11, fill: STONE, anchor: 'start' });
  } else if (!prog.enoughData) {
    body += txt(16, 40, 'Warming up', { size: 22, fill: STONE, anchor: 'start', weight: 700 });
    body += txt(18, 60, `${prog.n} ${prog.stageName} solve${prog.n === 1 ? '' : 's'} — a few more to forecast`, { size: 10.5, fill: STONE, anchor: 'start' });
  } else if (prog.ready) {
    body += txt(16, 40, 'Ready', { size: 30, fill: DATA, anchor: 'start', weight: 700 });
    body += txt(18, 60, `drop to ${prog.nextName} now`, { size: 12, fill: DATA, anchor: 'start', weight: 600 });
    if (prog.stagesRemaining > 1) body += txt(18, 78, `≈${roundMin(prog.minutesToMental)} min more to fully mental`, { size: 10.5, fill: STONE, anchor: 'start' });
  } else if (prog.minutesToMental != null) {
    body += txt(16, 42, `≈ ${roundMin(prog.minutesToMental)} min`, { size: 30, fill: INK, anchor: 'start', weight: 700 });
    body += txt(18, 62, `to Mental · ${prog.stagesRemaining} drop${prog.stagesRemaining === 1 ? '' : 's'} to go`, { size: 11, fill: STONE, anchor: 'start' });
    body += txt(18, 80, `${prog.solvesToMental} more solves · pace ${prog.trend}`, { size: 11, fill: DATA, anchor: 'start', weight: 600 });
  } else {
    body += txt(16, 40, 'Not climbing', { size: 22, fill: STONE, anchor: 'start', weight: 700 });
    body += txt(18, 60, `readiness ${pctR}% — hold and drill your fumble pairs`, { size: 10.5, fill: STONE, anchor: 'start' });
  }
  return svg(W, H, 'Estimated practice time until you can work mentally', body);
}
