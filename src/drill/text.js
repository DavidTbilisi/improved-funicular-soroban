// ============================================================================
// Small pure text helpers shared by decks and grading.
// ============================================================================

// Remove the "(123)" / "(0x4F)" / "(·)" digit annotations from a scene story so
// the drill prompt shows only the prose.
export function stripStoryDigits(story) {
  return story.replace(/\s*\((?:0x)?[0-9A-F·]+\)/g, '');
}

// Case-insensitive, 0x-optional normalization for answer comparison.
export function normalizeAnswer(s) {
  return String(s).trim().toUpperCase().replace(/^0X/, '');
}
