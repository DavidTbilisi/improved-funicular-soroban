// ============================================================================
// Shared lazy AudioContext for the view-layer audio features (SoundService and
// the Metronome). One context per page keeps every synthesized sound on the
// same clock and within the browser's context budget. Returns null when there
// is no AudioContext (e.g. under node in tests), so importers stay safe. The
// context is resumed on demand — callers invoke it from inside a user gesture
// (keydown / click), which satisfies the autoplay policy without extra plumbing.
// ============================================================================
const root = typeof globalThis !== 'undefined' ? globalThis : {};
let ctx = null;

export function getAudioContext() {
  const AC = root.AudioContext || root.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Test seam: drop the cached singleton so a fresh probe runs next call.
export function _resetAudioContext() { ctx = null; }
