// ============================================================================
// The touch pad — the die cross for a thumb.
//
// The app now installs on a phone, and until this there was nothing to do with
// it there: every bead move is a home-row key, and a phone has no home row.
// Tapping the beads themselves works and is authentic, but it is a 23-rod board
// scaled to 400 px — the beads are 4 mm apart, which is a fine way to read a
// number and a hopeless way to add one.
//
// So the pad is the SAME MENTAL OBJECT as the keyboard, not a second interface:
// the die cross, one hand each side, right adds and left subtracts, each cell
// in its fixed position (center 1, left 2, top 3, bottom 4, right 5 = the
// rose/heaven bead). Nothing new to learn, and a learner who moves between a
// desk and a train is drilling one layout, not two.
//
// THE ONE PLACE IT CANNOT FOLLOW THE KEYBOARD is the compound digits. On keys,
// 6-9 are CHORDS — the rose held together with an earth cell — and a finger
// cannot hold two cells at once. Rather than invent a gesture, they get their
// own row, labelled with the two faces they are made of, so the chord is still
// visible as a chord.
//
// The cells come from CUBE_LAYOUT via `padCells()` below — the same table the
// board's die faces and `digitFromFaces` read, so the pad cannot drift from the
// keyboard it mirrors (asserted in test/touchPad.test.js). `padCells` and
// `compoundCells` are pure and unit-tested; only `mountTouchPad` touches DOM.
// ============================================================================
import { CUBE_LAYOUT, cubeFaceValues } from '../domain/faces.js';
import { CUBE_FACES } from '../domain/pegs.js';

// The five die cells, in DOM order for a 3×3 grid (top row, middle row, bottom).
export function padCells() {
  const byPos = Object.fromEntries(CUBE_LAYOUT.map(f => [f.pos, f.value]));
  return ['top', 'left', 'center', 'right', 'bottom'].map(pos => {
    const digit = byPos[pos];
    const face = CUBE_FACES[digit];
    return { pos, digit, emoji: face.emoji, word: face.word };
  });
}

// 6-9: the rose plus one earth face. Returned as the pair of faces they light,
// because that is what the digit IS on this board — a compound, not a symbol.
export function compoundCells() {
  return [6, 7, 8, 9].map(digit => ({
    digit,
    faces: cubeFaceValues(digit).map(v => CUBE_FACES[v].emoji),
  }));
}

const HAND = {
  add: { sign: +1, label: '+ add', cls: 'add' },
  sub: { sign: -1, label: '− subtract', cls: 'sub' },
};

function handHTML(kind) {
  const h = HAND[kind];
  const cells = padCells().map(c =>
    `<button type="button" class="tp-cell tp-${c.pos}" data-sign="${h.sign}" data-digit="${c.digit}" ` +
    `title="${h.label.slice(2)} ${c.digit} — ${c.word}"><b>${c.digit}</b><i>${c.emoji}</i></button>`).join('');
  const compounds = compoundCells().map(c =>
    `<button type="button" class="tp-comp" data-sign="${h.sign}" data-digit="${c.digit}" ` +
    `title="${c.digit} = ${c.faces.join(' + ')}"><b>${c.digit}</b><i>${c.faces.join('')}</i></button>`).join('');
  return `<div class="tp-hand ${h.cls}">` +
    `<div class="tp-label">${h.label}</div>` +
    `<div class="tp-cross">${cells}</div>` +
    `<div class="tp-comps">${compounds}</div>` +
    `<button type="button" class="tp-ten" data-sign="${h.sign}" data-carry="1">` +
      `${h.sign > 0 ? '+10 carry' : '−10 borrow'}</button>` +
    `</div>`;
}

const PAD_HTML =
  `<div class="tp-rods">` +
    `<button type="button" class="tp-rod" data-col="1" title="Focus the rod to the left">◀</button>` +
    `<span class="tp-focus" id="tpFocus">ones</span>` +
    `<button type="button" class="tp-rod" data-col="-1" title="Focus the rod to the right">▶</button>` +
    `<button type="button" class="tp-reset" data-reset="1" title="Clear the board">reset</button>` +
  `</div>` +
  `<div class="tp-hands">${handHTML('sub')}${handHTML('add')}</div>`;

/**
 * Mount the pad into `el` and wire it to the board shell's own move handlers —
 * the very same ones the keyboard calls, so a tap is a keypress in every way
 * that matters, including being rejected with the complement to compose when
 * the move does not fit the rod.
 * @param api { applyDigit(sign, digit), applyCarry(sign), stepFocus(dir), reset() }
 */
export function mountTouchPad(el, api) {
  if (!el) return null;
  el.className = 'touchpad';
  el.innerHTML = PAD_HTML;

  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.col) { api.stepFocus(Number(b.dataset.col)); return; }
    if (b.dataset.reset) { api.reset(); return; }
    const sign = Number(b.dataset.sign);
    if (b.dataset.carry) { api.applyCarry(sign); return; }
    if (b.dataset.digit) api.applyDigit(sign, Number(b.dataset.digit));
  });

  // Which rod the taps land on. The keyboard user reads this off the board's
  // highlight; a thumb covering the board needs it in words.
  const focusEl = el.querySelector('#tpFocus');
  return { setFocusLabel(text) { if (focusEl) focusEl.textContent = text; } };
}
