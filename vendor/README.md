# Vendored libraries

- `phaser.esm.js` — Phaser **3.87.0**, the single-file ESM build, downloaded from
  `https://cdn.jsdelivr.net/npm/phaser@3.87.0/dist/phaser.esm.min.js` (MIT license).
  The bundle has **named exports only** (no default), so import it as
  `import * as Phaser from '../../vendor/phaser.esm.js'`. It touches `window` at
  import time — browser-only, never import it from `src/game/`, `src/domain/`, or
  tests. Upgrades are deliberate: replace the file with another pinned version and
  update this note.
