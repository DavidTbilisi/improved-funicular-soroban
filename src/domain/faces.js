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
