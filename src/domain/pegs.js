// ============================================================================
// Frozen peg data tables — the single source of truth for every percept.
// SRP: this module holds DATA only. Grammar/derivation lives in faces.js and
// the codec modules. Treat these tables as fixed contracts (see CLAUDE.md):
// changing a peg silently breaks numbers users have already memorized.
// ============================================================================

// A–Z food peg system — horizontal axis (which place). Same set as
// tools/soroban-stepper.html.
export const ALPHABET_PEGS = {
  A: { emoji: '🍎', word: 'Apple' },
  B: { emoji: '🍌', word: 'Banana' },
  C: { emoji: '🥐', word: 'Croissant' },
  D: { emoji: '🍩', word: 'Donut' },
  E: { emoji: '🥚', word: 'Egg' },
  F: { emoji: '🍟', word: 'Fries' },
  G: { emoji: '🍇', word: 'Grapes' },
  H: { emoji: '🍯', word: 'Honey' },
  I: { emoji: '🍦', word: 'Ice cream' },
  J: { emoji: '🍮', word: 'Jelly' },
  K: { emoji: '🥝', word: 'Kiwi' },
  L: { emoji: '🍋', word: 'Lemon' },
  M: { emoji: '🥭', word: 'Mango' },
  N: { emoji: '🍜', word: 'Noodles' },
  O: { emoji: '🧅', word: 'Onion' },
  P: { emoji: '🍕', word: 'Pizza' },
  Q: { emoji: '🥧', word: 'Quiche' },
  R: { emoji: '🍚', word: 'Rice' },
  S: { emoji: '🍝', word: 'Spaghetti' },
  T: { emoji: '🌮', word: 'Taco' },
  U: { emoji: '🍲', word: 'Udon' },
  V: { emoji: '🍰', word: 'Vanilla cake' },
  W: { emoji: '🧇', word: 'Waffles' },
  X: { emoji: '🍛', word: 'Xacuti curry' },
  Y: { emoji: '🥣', word: 'Yogurt' },
  Z: { emoji: '🥒', word: 'Zucchini' },
};

// Cube digit faces — vertical axis (which value).
// Grammar A: 0 = bare column, 1-4 = earth face, 5 = rose alone (sky bead),
// 6-9 = rose + earth face. Angel (die-face 6) is retired from digit duty.
export const CUBE_FACES = {
  1: { emoji: '🚕', word: 'Taxi',      color: '#e8c832' },
  2: { emoji: '🍊', word: 'Tangerine', color: '#e8842c' },
  3: { emoji: '👽', word: 'Alien',     color: '#3fa34d' },
  4: { emoji: '🌊', word: 'Wave',      color: '#3b7dd8' },
  5: { emoji: '🌹', word: 'Rose',      color: '#d43d3d' }, // sky bead
  6: { emoji: '😇', word: 'Angel',     color: '#e6e6e6' }, // retired — reserved icon
};

// Deep-pack matrix pegs. Indices 0-9 are the decimal pegs; 10-15 (A-F) are the
// hex extension (frozen 2026-07-02). Audio peg = tens digit, visual = units.
export const AUDIO_PEGS = [ // tens digit 0-9 (rhyme peg) + hex A-F (NATO phonetic)
  { word: 'Hero',   emoji: '🦸' }, { word: 'Sun',    emoji: '☀️' },
  { word: 'Shoe',   emoji: '👟' }, { word: 'Tree',   emoji: '🌳' },
  { word: 'Door',   emoji: '🚪' }, { word: 'Hive',   emoji: '🐝' },
  { word: 'Sticks', emoji: '🪵' }, { word: 'Heaven', emoji: '☁️' },
  { word: 'Gate',   emoji: '⛩️' }, { word: 'Vine',   emoji: '🌿' },
  { word: 'Alpha',   emoji: '🐺', hex: true, note: 'gray wolf, howling' },
  { word: 'Bravo',   emoji: '👏', hex: true, note: 'thunderous applause' },
  { word: 'Charlie', emoji: '🎩', hex: true, note: 'generic silent-film tramp (bowler + cane)' },
  { word: 'Delta',   emoji: '🔺', hex: true, note: 'river delta from above' },
  { word: 'Echo',    emoji: '🦇', hex: true, note: 'bat (echolocation)' },
  { word: 'Foxtrot', emoji: '🦊', hex: true, note: 'fox, dancing' },
];
export const VISUAL_PEGS = [ // units digit 0-9 (shape peg) + hex A-F (letterforms)
  { word: 'Donut',          emoji: '🍩' }, { word: 'Magic Wand',    emoji: '🪄' },
  { word: 'Swan',           emoji: '🦢' }, { word: 'Sideways Heart', emoji: '❤️', rot: true },
  { word: 'Sail',           emoji: '⛵' }, { word: 'Hook',          emoji: '🪝' },
  { word: 'Cartoon Bomb',   emoji: '💣' }, { word: 'Axe',           emoji: '🪓' },
  { word: 'Hourglass',      emoji: '⌛' }, { word: 'Balloon',       emoji: '🎈' },
  { word: 'Tent',      emoji: '⛺', hex: true, note: 'A-frame' },
  { word: 'Butterfly', emoji: '🦋', hex: true, note: 'wings folded = stacked loops' },
  { word: 'Moon',      emoji: '🌙', hex: true, note: 'crescent — glows (croissant is baked)' },
  { word: 'Bow',       emoji: '🏹', hex: true, note: 'string = the straight stroke' },
  { word: 'Trident',   emoji: '🔱', hex: true, note: 'E rotated' },
  { word: 'Flag',      emoji: '🚩', hex: true, note: 'the generic red flag' },
];

export const ACTION_BASES = ['static contact', 'drive-through', 'splatter', 'abduct', 'drench', 'thorn-wrap'];
export const ACTION_PARTICIPLES = ['rests against', 'is driven through', 'is splattered', 'is abducted', 'is drenched', 'is thorn-wrapped'];

export const HEX_SYMS = '0123456789ABCDEF';
