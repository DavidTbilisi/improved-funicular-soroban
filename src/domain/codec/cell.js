// ============================================================================
// Factories for the deep-pack value objects: matrix cells, byte cells, and
// actions. Each produces an immutable descriptor consumed by scenes/views.
// (Factory pattern — a cell/action is built one way, from one place.)
// ============================================================================
import { AUDIO_PEGS, VISUAL_PEGS, ACTION_BASES, ACTION_PARTICIPLES, CUBE_FACES, HEX_SYMS } from '../pegs.js';

// Decimal matrix cell: a two-digit number 00-99 as (audio=tens, visual=units).
export function matrixCell(nn) {
  const tens = Math.floor(nn / 10), units = nn % 10;
  return {
    nn, tens, units,
    audio: AUDIO_PEGS[tens], visual: VISUAL_PEGS[units],
    name: AUDIO_PEGS[tens].word + '-' + VISUAL_PEGS[units].word,
  };
}

// Hex byte cell: a byte 0x00-0xFF as (audio=high nibble, visual=low nibble).
export function hexCell(hi, lo) {
  return {
    hi, lo,
    audio: AUDIO_PEGS[hi], visual: VISUAL_PEGS[lo],
    name: AUDIO_PEGS[hi].word + '-' + VISUAL_PEGS[lo].word,
    hexStr: HEX_SYMS[hi] + HEX_SYMS[lo],
  };
}

// The verb slot of a scene. 0 = static contact (🤝), 1-4 = earth-face actions,
// 5 = thorn-wrap (rose stays an actor), 6-9 = the same four but flaming (+5).
export function packAction(d) {
  if (d <= 5) return { d, name: ACTION_BASES[d], flaming: false, emoji: d === 0 ? '🤝' : CUBE_FACES[d].emoji };
  return { d, name: 'flaming ' + ACTION_BASES[d - 5], flaming: true, emoji: '🔥' + CUBE_FACES[d - 5].emoji };
}

export function actionParticiple(d) {
  return d <= 5 ? ACTION_PARTICIPLES[d] : ACTION_PARTICIPLES[d - 5].replace('is ', 'is flaming-');
}
