// ============================================================================
// DrillMode — Strategy for how a rep is answered and graded.
//   TypedMode  : prompt → typed answer, checked exactly (case-insensitive).
//   RevealMode : prompt → recall → reveal → self-grade (Anki-style).
// The session's rep lifecycle (present → answer → record → next) is fixed; only
// the answer-capture/grading step varies — that variation is these strategies.
// ============================================================================
import { normalizeAnswer } from './text.js';

class DrillMode {
  get id() { throw new Error('abstract'); }
  get isTyped() { throw new Error('abstract'); }
}

export class TypedMode extends DrillMode {
  get id() { return 'type'; }
  get isTyped() { return true; }
  // exact match against any accepted answer, after normalization.
  check(item, value) {
    const given = normalizeAnswer(value);
    if (!given) return null; // empty input: no rep recorded
    return item.answers.some(a => normalizeAnswer(a) === given);
  }
}

export class RevealMode extends DrillMode {
  get id() { return 'reveal'; }
  get isTyped() { return false; }
}

export const MODES = { type: new TypedMode(), reveal: new RevealMode() };
