// ============================================================================
// SorobanView — renders the bead frame and reflects store changes. It is an
// observer of AbacusStore (its update() is subscribed) and emits user intent
// through injected callbacks (onToggleSky / onClickEarth) rather than mutating
// the store itself — so the view depends on abstractions, not on the commands.
// ============================================================================
import { INT_COLS, FRAC_COLS, INT_PLACES, FRAC_PLACES, columnLetter } from '../domain/config.js';
import { rodValue } from '../domain/rod.js';
import { ALPHABET_PEGS } from '../domain/pegs.js';
import { cubeName } from '../domain/faces.js';
import { cubeFaceGrid } from './figures.js';
import { placeName, beadPhrase } from '../a11y/boardSpeech.js';

export class SorobanView {
  constructor(containerEl, { onToggleSky, onClickEarth }) {
    this.el = containerEl;
    this.onToggleSky = onToggleSky;
    this.onClickEarth = onClickEarth;
    this.support = 0;      // mnemonic-mental fade level: 0 beads, 1 percept, 2 mental
    this._peekTimer = null;
  }

  init() {
    const el = this.el;
    el.innerHTML = '';
    // integer columns: highest place (left) -> ones (right)
    for (let i = INT_COLS - 1; i >= 0; i--) el.appendChild(this._makeRod('int', i));
    // decimal point marker
    const dp = document.createElement('div');
    dp.className = 'dp-col';
    dp.innerHTML = `<div class="dp-line"></div><div class="dp-mark">•</div><div class="dp-word">point</div>`;
    el.appendChild(dp);
    // fraction columns: tenths (left) -> ten-thousandths (right)
    for (let j = 0; j < FRAC_COLS; j++) el.appendChild(this._makeRod('frac', j));

    el.querySelectorAll('.bead.sky').forEach(b =>
      b.addEventListener('click', () => this.onToggleSky(b.dataset.kind, +b.dataset.idx)));
    el.querySelectorAll('.bead.earth').forEach(b =>
      b.addEventListener('click', () => this.onClickEarth(b.dataset.kind, +b.dataset.idx, +b.dataset.earth)));
  }

  _makeRod(kind, idx) {
    const L = columnLetter(idx);
    const peg = ALPHABET_PEGS[L];
    const place = kind === 'int' ? (INT_PLACES[idx] || ('10^' + idx)) : (FRAC_PLACES[idx] || ('10^-' + (idx + 1)));
    // Unit-point rods: a marker on the reckoning bar at every power of 1000,
    // like a standard soroban — ones/thousands/millions… on the integer side and
    // the thousandths on the fraction side — so long numbers read in groups of 3.
    const isUnit = kind === 'int' ? (idx % 3 === 0) : (idx === 2);
    const exp = kind === 'int' ? idx : -(idx + 1);       // the rod's power of ten
    const rodEl = document.createElement('div');
    rodEl.className = 'rod' + (kind === 'frac' ? ' frac' : '') + (isUnit ? ' unit' : '');
    rodEl.dataset.kind = kind;
    rodEl.dataset.place = idx;
    let earthHTML = '';
    for (let b = 0; b < 4; b++) earthHTML += `<div class="bead earth" id="bead-${kind}-earth-${idx}-${b}" data-kind="${kind}" data-idx="${idx}" data-earth="${b}"></div>`;
    // The beads are a picture of a number, so the frame carries ONE label
    // rather than letting a screen reader walk five positioned <div>s that say
    // nothing. Everything under the frame — the digit, the die face, the peg,
    // the place — is the same fact drawn again for the eye, so it is hidden
    // from the reader instead of repeated four times per rod.
    rodEl.innerHTML = `
      <div class="rod-frame" role="img" data-kind="${kind}" data-idx="${idx}"
           aria-label="${placeName(exp)} rod, 0, clear">
        <div class="bar"></div>
        ${isUnit ? '<div class="unit-dot"></div>' : ''}
        <div class="bead sky" id="bead-${kind}-sky-${idx}" data-kind="${kind}" data-idx="${idx}"></div>
        ${earthHTML}
      </div>
      <div class="rod-value" id="rod-${kind}-value-${idx}" aria-hidden="true">0</div>
      <div class="rod-cube bare" id="rod-${kind}-cube-${idx}" aria-hidden="true">·</div>
      <div class="rod-peg" aria-hidden="true">${peg.emoji}</div>
      <div class="rod-letter" aria-hidden="true">${L}</div>
      <div class="rod-word" aria-hidden="true">${peg.word}</div>
      <div class="rod-place" aria-hidden="true">${place}</div>`;
    return rodEl;
  }

  // Highlight the focused column by power-of-ten exponent (>=0 = integer place,
  // <0 = fraction place; -1 = tenths).
  highlightColumn(exponent) {
    const kind = exponent >= 0 ? 'int' : 'frac';
    const place = exponent >= 0 ? exponent : (-exponent - 1);
    this.el.querySelectorAll('.rod').forEach(r =>
      r.classList.toggle('focused', r.dataset.kind === kind && +r.dataset.place === place));
  }

  // Mark a set of integer rods as the current step's targets (used by the
  // rod-placement trainer to point at where the next digit goes). Independent
  // of the keyboard's single-column `focused` highlight.
  markTargets(exponents = []) {
    const set = new Set(exponents);
    this.el.querySelectorAll('.rod').forEach(r =>
      r.classList.toggle('target', r.dataset.kind === 'int' && set.has(+r.dataset.place)));
  }

  // ── Mnemonic-mental track ────────────────────────────────────────────────
  // Support-fade ladder on the board (soroban-gym's Full Support → Mental Only):
  //   0 = Beads   — everything visible (the physical soroban)
  //   1 = Percept — beads + digit hidden; the cube-face percept is the read
  //   2 = Mental  — cube also hidden; only the faint column pegs remain (imagined
  //                 rods). Moves still land on the store, so the solve still
  //                 verifies — a mental solve is a solve you couldn't see.
  // The fade itself is CSS (`.sup-1`/`.sup-2` on the board, by `visibility`), so
  // every column keeps its footprint and nothing reflows on a switch.
  setSupport(level) {
    this.support = Math.max(0, Math.min(2, level | 0));
    this.el.classList.toggle('sup-1', this.support === 1);
    this.el.classList.toggle('sup-2', this.support === 2);
    return this.support;
  }

  // Flash the true board back for `ms` from any faded mode, then restore — the
  // "reset with the physical frame if the image blurs" move, and the reveal that
  // lets a mental solve still land in view.
  peek(ms = 1300) {
    this.el.classList.add('peek');
    clearTimeout(this._peekTimer);
    this._peekTimer = setTimeout(() => this.el.classList.remove('peek'), ms);
  }

  update(store) {
    [['int', store.int, INT_COLS], ['frac', store.frac, FRAC_COLS]].forEach(([kind, rods, cols]) => {
      for (let i = 0; i < cols; i++) {
        const rod = rods[i];
        const skyEl = document.getElementById(`bead-${kind}-sky-${i}`);
        skyEl.style.top = (rod.sky ? 70 : 8) + 'px';
        skyEl.className = `bead sky${rod.sky ? ' active' : ''}`;
        for (let b = 0; b < 4; b++) {
          const bEl = document.getElementById(`bead-${kind}-earth-${i}-${b}`);
          const isActive = b < rod.earth;
          bEl.style.top = (isActive ? 104 + b * 24 : 246 + b * 24) + 'px';
          bEl.className = `bead earth${isActive ? ' active' : ''}`;
        }
        const d = rodValue(rod);
        // The label is the rod in words — the same sentence the "say the board"
        // key speaks, so what is read and what is heard cannot disagree.
        const frame = this.el.querySelector(`.rod-frame[data-kind="${kind}"][data-idx="${i}"]`);
        if (frame) frame.setAttribute('aria-label', `${placeName(kind === 'int' ? i : -(i + 1))} rod, ${d}, ${beadPhrase(d)}`);
        document.getElementById(`rod-${kind}-value-${i}`).textContent = d;
        const cubeEl = document.getElementById(`rod-${kind}-cube-${i}`);
        cubeEl.innerHTML = d === 0 ? '·' : cubeFaceGrid(d); // die face: each emoji in its fixed cell
        cubeEl.className = 'rod-cube' + (d === 0 ? ' bare' : '');
        cubeEl.title = cubeName(d);
      }
    });
  }
}
