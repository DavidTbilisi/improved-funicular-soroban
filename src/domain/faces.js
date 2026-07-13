// ============================================================================
// Cube-face grammar — derives the digit → face percept (vertical axis).
// Pure, DOM-free, deterministic. (wiki: soroban-learning-method §Cube Digit Faces)
// ============================================================================
import { CUBE_FACES } from './pegs.js';

// The face objects that spell a digit: [] for 0, one earth face for 1-4,
// the rose for 5, and rose + earth face for 6-9.
export function cubeFacesForDigit(d) {
  if (d === 0) return [];
  if (d <= 5) return [CUBE_FACES[d]];
  return [CUBE_FACES[5], CUBE_FACES[d - 5]]; // 6-9 = rose + earth face
}

export function cubeEmojis(d) {
  return cubeFacesForDigit(d).map(f => f.emoji).join('');
}

export function cubeName(d) {
  const f = cubeFacesForDigit(d);
  return f.length ? f.map(x => x.word).join(' + ') : 'bare column';
}

// The die-face layout (observer inside the cube): each face keeps a fixed cell,
// and opposite faces sum to 7 — center 1 (taxi) faces you, its hidden back is 6
// (angel); top 3 (alien) ↔ bottom 4 (wave); left 2 (tangerine) ↔ right 5 (rose).
export const CUBE_LAYOUT = [
  { pos: 'top',    value: 3 },
  { pos: 'left',   value: 2 },
  { pos: 'center', value: 1 },
  { pos: 'right',  value: 5 },
  { pos: 'bottom', value: 4 },
];

// The face VALUES a digit lights up (not the objects): [] for 0, the earth face
// for 1-4, rose (5) for 5, rose + earth for 6-9. Feeds the die-face grid.
export function cubeFaceValues(d) {
  if (d === 0) return [];
  if (d <= 5) return [d];
  return [5, d - 5];
}

// Position → value, inverted from CUBE_LAYOUT (the single source for the die grid).
const FACE_VALUE = Object.freeze(Object.fromEntries(CUBE_LAYOUT.map(f => [f.pos, f.value])));

// The inverse of cubeFaceValues: which digit is spelled by a set of lit die cells.
// A digit is at most one earth cell (center 1 / left 2 / top 3 / bottom 4) plus the
// rose (right 5), so 6-9 = right + earth. The center (1) has no arrow of its own, so
// pressing top+bottom together stands in for it (the two vertical arms meeting in the
// middle) — the chord keyboard's way to reach the center cell. Returns 0 for the empty
// set and null for anything that isn't a real die face (e.g. two earth cells at once).
export function digitFromFaces(positions) {
  const set = new Set(positions);
  if (set.has('top') && set.has('bottom')) { set.delete('top'); set.delete('bottom'); set.add('center'); }
  const earth = [...set].filter(p => p !== 'right');
  if (earth.length > 1 || earth.some(p => FACE_VALUE[p] === undefined)) return null;
  return (set.has('right') ? 5 : 0) + (earth.length ? FACE_VALUE[earth[0]] : 0);
}
