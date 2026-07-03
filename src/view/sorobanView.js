// ============================================================================
// SorobanView — renders the bead frame and reflects store changes. It is an
// observer of AbacusStore (its update() is subscribed) and emits user intent
// through injected callbacks (onToggleSky / onClickEarth) rather than mutating
// the store itself — so the view depends on abstractions, not on the commands.
// ============================================================================
import { INT_COLS, FRAC_COLS, INT_PLACES, FRAC_PLACES, columnLetter } from '../domain/config.js';
import { rodValue } from '../domain/rod.js';
import { ALPHABET_PEGS } from '../domain/pegs.js';
import { cubeEmojis, cubeName } from '../domain/faces.js';

export class SorobanView {
  constructor(containerEl, { onToggleSky, onClickEarth }) {
    this.el = containerEl;
    this.onToggleSky = onToggleSky;
    this.onClickEarth = onClickEarth;
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
    const rodEl = document.createElement('div');
    rodEl.className = 'rod' + (kind === 'frac' ? ' frac' : '');
    let earthHTML = '';
    for (let b = 0; b < 4; b++) earthHTML += `<div class="bead earth" id="bead-${kind}-earth-${idx}-${b}" data-kind="${kind}" data-idx="${idx}" data-earth="${b}"></div>`;
    rodEl.innerHTML = `
      <div class="rod-frame" data-kind="${kind}" data-idx="${idx}">
        <div class="bar"></div>
        <div class="bead sky" id="bead-${kind}-sky-${idx}" data-kind="${kind}" data-idx="${idx}"></div>
        ${earthHTML}
      </div>
      <div class="rod-value" id="rod-${kind}-value-${idx}">0</div>
      <div class="rod-cube bare" id="rod-${kind}-cube-${idx}">·</div>
      <div class="rod-peg">${peg.emoji}</div>
      <div class="rod-letter">${L}</div>
      <div class="rod-word">${peg.word}</div>
      <div class="rod-place">${place}</div>`;
    return rodEl;
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
        document.getElementById(`rod-${kind}-value-${i}`).textContent = d;
        const cubeEl = document.getElementById(`rod-${kind}-cube-${i}`);
        cubeEl.textContent = d === 0 ? '·' : cubeEmojis(d);
        cubeEl.className = 'rod-cube' + (d === 0 ? ' bare' : '');
        cubeEl.title = cubeName(d);
      }
    });
  }
}
