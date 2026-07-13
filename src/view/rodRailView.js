// ============================================================================
// RodRailView — a place-value rail for the focused rod, echoing the perpetual-
// calendar "lift the active tab" mechanism. Icons only: one slot per rod showing
// its food-peg emoji (the place); the focused rod lifts out like the month tab,
// and a small panel below shows its digit as a die face. No letters, no numbers.
//
// The slots are positioned to sit DIRECTLY OVER the live board's columns —
// measured from the board rods each layout, so the rail tracks the board's
// zoom-fit and every peg lines up with the rod beneath it. It observes the store
// for the digit and takes focus via setFocus(); DOM-only, like the other views.
// Especially useful under the mnemonic-mental fade: when the beads are hidden it
// is the only "which rod am I on?" anchor left.
// ============================================================================
import { INT_COLS, FRAC_COLS, columnLetter } from '../domain/config.js';
import { rodValue } from '../domain/rod.js';
import { ALPHABET_PEGS } from '../domain/pegs.js';
import { cubeName } from '../domain/faces.js';
import { cubeFaceGrid } from './figures.js';

export class RodRailView {
  constructor(containerEl, boardEl) {
    this.el = containerEl;
    this.boardEl = boardEl;          // the live board (#soroban) to align columns to
    this.focus = 0;                  // exponent of the focused rod (>=0 int, <0 frac)
    this.store = null;
  }

  build() {
    // Each slot is the rod's food peg (fraction pegs are flipped, per the board).
    const slot = (exp, idx, kind) =>
      `<div class="rr-slot ${kind}" data-exp="${exp}"><span class="rr-peg">${ALPHABET_PEGS[columnLetter(idx)].emoji}</span></div>`;
    let cells = '';
    for (let i = INT_COLS - 1; i >= 0; i--) cells += slot(i, i, 'int');          // high place → ones
    cells += `<div class="rr-dp" aria-hidden="true"></div>`;
    for (let j = 0; j < FRAC_COLS; j++) cells += slot(-(j + 1), j, 'frac');       // tenths → …
    this.el.innerHTML =
      `<div class="rr-track">${cells}<div class="rr-panel"><span class="rr-grid"></span></div></div>`;
    this.track = this.el.querySelector('.rr-track');
    this.panel = this.el.querySelector('.rr-panel');
    this._render();
    // Re-align whenever the board re-fits (resize / zoom change).
    if (this.boardEl && typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.align());
      this._ro.observe(this.boardEl);
    }
    this.align();
    return this;
  }

  setFocus(exp) { this.focus = exp; this._render(); }
  update(store) { this.store = store; this._render(); }

  // Overlay each slot on the board column with the same exponent, so the rail
  // reads as a header for the beads. Measured rects already include the board's
  // zoom, so this survives the fit-to-width scaling.
  align() {
    if (!this.boardEl || !this.track) return;
    const base = this.track.getBoundingClientRect();
    if (!base.width) return;
    const place = (el, rod) => {
      if (!el || !rod) return;
      const r = rod.getBoundingClientRect();
      if (!r.width) return;
      el.style.left = (r.left - base.left) + 'px';
      el.style.width = r.width + 'px';
    };
    this.track.querySelectorAll('.rr-slot').forEach(s => {
      const e = +s.dataset.exp;
      const sel = e >= 0 ? `.rod[data-kind="int"][data-place="${e}"]`
                         : `.rod[data-kind="frac"][data-place="${-e - 1}"]`;
      place(s, this.boardEl.querySelector(sel));
    });
    place(this.track.querySelector('.rr-dp'), this.boardEl.querySelector('.dp-col'));
    this._placePanel();
  }

  _digitAt(exp) {
    if (!this.store) return 0;
    return exp >= 0 ? rodValue(this.store.int[exp]) : rodValue(this.store.frac[-exp - 1]);
  }

  _placePanel() {
    const focusedEl = this.track.querySelector('.rr-slot.on');
    if (!focusedEl || !this.panel) return;
    const center = focusedEl.offsetLeft + focusedEl.offsetWidth / 2;
    const half = this.panel.offsetWidth / 2;
    const max = this.track.offsetWidth - half;
    this.panel.style.left = Math.max(half, Math.min(max, center)) + 'px';
  }

  _render() {
    if (!this.track) return;
    const e = this.focus;
    const digit = this._digitAt(e);

    // Lift the focused peg like the calendar's month tab; calm the rest.
    this.track.querySelectorAll('.rr-slot').forEach(s => {
      const on = +s.dataset.exp === e;
      s.classList.toggle('on', on);
      if (on) s.title = cubeName(digit);
    });

    // The panel: the digit as a die face — icons only.
    this.panel.querySelector('.rr-grid').innerHTML = cubeFaceGrid(digit);
    this._placePanel();
  }
}
