// ============================================================================
// ReadoutView — the big number + the ordered "decode" chips and prose reading.
// Pure observer of the store; formats decodeChips() output into DOM.
// ============================================================================
import { displayString, decodeChips } from '../domain/number.js';
import { intValOf } from '../domain/rod.js';
import { MAXINT } from '../domain/config.js';
import { ALPHABET_PEGS } from '../domain/pegs.js';
import { cubeEmojis, cubeName, cubeFacesForDigit } from '../domain/faces.js';

export class ReadoutView {
  constructor({ valueEl, inputEl, incBtn, decBtn, decodeEl }) {
    this.valueEl = valueEl;
    this.inputEl = inputEl;
    this.incBtn = incBtn;
    this.decBtn = decBtn;
    this.decodeEl = decodeEl;
  }

  update(store) {
    const display = displayString(store.int, store.frac);
    this.valueEl.textContent = display;
    this.inputEl.value = display.replace(/,/g, '');
    const n = intValOf(store.int);
    this.incBtn.disabled = n >= MAXINT;
    this.decBtn.disabled = n <= 0;

    const chips = decodeChips(store.int, store.frac, ALPHABET_PEGS);
    if (!chips.length) {
      this.decodeEl.innerHTML = '<span class="decode-empty">zero — set a number or click beads</span>';
      return;
    }
    const chipHTML = chips.map(c => {
      if (c.side === 'point') return '<span class="decode-point">•</span>';
      const cube = c.digit === 0 ? '·' : cubeEmojis(c.digit);
      return `<div class="decode-chip ${c.side}${c.digit === 0 ? ' zero' : ''}">
          <span class="c-emoji">${c.peg.emoji}</span>
          <span class="c-cube${c.digit === 0 ? ' bare' : ''}" title="${cubeName(c.digit)}">${cube}</span>
          <span class="c-digit">${c.digit}</span>
          <span class="c-meta">${c.letter} · ${c.peg.word}</span>
        </div>`;
    }).join('');
    const story = chips.map(c => {
      if (c.side === 'point') return '<span class="decode-point" style="font-size:1rem">•</span>';
      const cls = c.side === 'frac' ? 'fr' : '';
      const tag = c.side === 'frac' ? 'flip-' + c.peg.word : c.peg.word;
      const cube = c.digit === 0 ? '' : '+' + cubeFacesForDigit(c.digit).map(f => f.word).join('+');
      return `<strong class="${cls}">${tag}${cube} ${c.digit}</strong>`;
    }).join(' ');
    this.decodeEl.innerHTML = chipHTML + `<div class="decode-story">Read it as: ${story}</div>`;
  }
}
