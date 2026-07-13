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
