#!/usr/bin/env node
// ============================================================================
// check-glyphs — fail the suite when a Luau source uses an emoji Roblox cannot
// draw.
//
// Roblox ships its own emoji font and it stops at **Emoji 11.0** (Unicode 11,
// 2018). Anything newer renders as a tofu box — a literal empty rectangle in
// the HUD, the build palette and the goal line. The web app has no such limit
// (browsers use the OS font), so every emoji copied straight across from
// `src/game/*.js` is a candidate: 🪵 🪙 🛖 🪓 🫐 all shipped as boxes before
// this check existed, and the next sync would have reintroduced them, because
// nothing in the source says which glyphs are safe.
//
// So the rule lives here rather than in a comment: the port may diverge from
// the web's emoji, and this is the thing that tells you when it must.
//
// The specs can't do this themselves — Luau's standard library has no `io`, so
// a `*.spec.luau` cannot read a file. Hence a node script, zero-dependency
// like everything else in `scripts/`.
//
//   node roblox/scripts/check-glyphs.mjs
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';

// Blocks and codepoints that received emoji in Unicode 12.0 or later. Every
// emoji added since 12.0 lands in one of these, so the ranges are the whole
// rule rather than a sample of it.
const POST_11 = [
  [0x1fa70, 0x1faff], // Symbols & Pictographs Extended-A — 12.0 and everything after
  [0x1f6d5, 0x1f6df], // 🛕 12.0, 🛖 🛗 13.0, 🛜–🛟 15.0
  [0x1f6fa, 0x1f6ff], // 🛺 12.0, 🛻 🛼 13.0
  [0x1f7e0, 0x1f7eb], // coloured circles and squares, 12.0
  [0x1f90c, 0x1f90f], // 🤌 13.0, 🤍 🤎 12.0, 🤏 12.0
  [0x1f93f, 0x1f93f], // 🤿 12.0
  [0x1f94d, 0x1f94f], // 🥍 🥎 🥏 12.0
  [0x1f971, 0x1f972], // 🥱 12.0, 🥲 13.0
  [0x1f977, 0x1f979], // 🥷 🥸 13.0, 🥹 14.0
  [0x1f97b, 0x1f97b], // 🥻 12.0
  [0x1f9a3, 0x1f9ad], // 🦣 🦤 13.0, 🦥–🦪 12.0, 🦫–🦭 13.0
  [0x1f9ba, 0x1f9bf], // 🦺–🦿 12.0
  [0x1f9c3, 0x1f9cf], // 🧃–🧊 12.0, 🧋 13.0, 🧍–🧏 12.0
];

const isPost11 = (cp) => POST_11.some(([lo, hi]) => cp >= lo && cp <= hi);

const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const root = path.join(here, '..', 'src');

// --- the one exemption ------------------------------------------------------
// `domain/Pegs.luau` is a FROZEN contract: its emoji/word pairs match
// `src/domain/pegs.js` character for character, and swapping one silently
// breaks numbers a learner has already memorised (CLAUDE.md). Two of the food
// pegs are post-11 (🧅 = O, 🧇 = W) — but this board has 11 integer rods, so
// `BoardView` only ever asks for letters A–K. They cannot reach a screen.
//
// That exemption is only true while the board stays short, so it is verified
// rather than asserted: read the rod counts out of Config.luau, work out the
// highest peg letter a rod can ask for, and fail if an exempted peg has come
// into range.
function pegExemptions() {
  const src = fs.readFileSync(path.join(root, 'shared', 'domain', 'Pegs.luau'), 'utf8');
  const cfg = fs.readFileSync(path.join(root, 'shared', 'domain', 'Config.luau'), 'utf8');
  const num = (key) => Number(cfg.match(new RegExp(`Config\\.${key}\\s*=\\s*(\\d+)`))?.[1]);
  // BoardView labels integer and fraction rods from the same A-first alphabet,
  // so the widest of the two is what the board can reach.
  const reach = Math.max(num('INT_COLS'), num('FRAC_COLS'));

  const exempt = new Map(); // char -> peg letter
  // Bound the slice on the assignments, not the words — the file's header
  // comment names both tables and would otherwise cut the slice to nothing.
  const alphabet = src.slice(src.indexOf('Pegs.ALPHABET_PEGS ='), src.indexOf('Pegs.CUBE_FACES ='));
  for (const [, letter, emoji] of alphabet.matchAll(/^\s*([A-Z])\s*=\s*table\.freeze\(\{\s*emoji\s*=\s*"([^"]+)"/gm)) {
    if ([...emoji].some((ch) => isPost11(ch.codePointAt(0)))) exempt.set(emoji, letter);
  }
  const reachable = [...exempt].filter(([, letter]) => letter.charCodeAt(0) - 65 < reach);
  return { exempt, reachable, reach };
}

const { exempt, reachable, reach } = pegExemptions();
if (reachable.length > 0) {
  console.error('glyphs: a frozen food peg Roblox cannot draw is now on the board.\n');
  for (const [emoji, letter] of reachable) {
    console.error(`  peg ${letter} = ${emoji} — the board reaches ${String.fromCharCode(64 + reach)}`);
  }
  console.error('\nThe peg table is a contract and must not be edited to fix this. Either the');
  console.error('rod count grew past what this port can draw, or BoardView needs a fallback.');
  process.exit(1);
}
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.luau')) files.push(p);
  }
})(root);

// Only a STRING can reach a screen, so only strings are checked — otherwise the
// comment explaining which glyphs are banned trips the check that bans them.
// A single pass per line is enough for this codebase's Luau: quoted strings,
// `--` comments, no long-bracket strings carrying emoji.
function stringSpansOf(line) {
  const spans = [];
  let quote = null;
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) { spans.push(line.slice(start, i)); quote = null; }
    } else if (c === '"' || c === "'") {
      quote = c;
      start = i + 1;
    } else if (c === '-' && line[i + 1] === '-') {
      break; // comment: never drawn
    }
  }
  return spans;
}

const offences = [];
for (const file of files) {
  // Exempt only inside the frozen table itself — the same glyph pasted into a
  // building or a goal line is a real box on a real screen.
  const isPegs = file.endsWith(`${path.sep}Pegs.luau`);
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    for (const span of stringSpansOf(line)) {
      for (const ch of span) {
        const cp = ch.codePointAt(0);
        if (isPost11(cp) && !(isPegs && exempt.has(ch))) {
          offences.push({ file: path.relative(process.cwd(), file), line: i + 1, ch, cp });
        }
      }
    }
  });
}

if (offences.length === 0) {
  const pegs = [...exempt].map(([e, l]) => `${l}=${e}`).join(' ');
  console.log(`glyphs: ${files.length} Luau files clean` + (pegs ? ` (frozen pegs off-board: ${pegs})` : ''));
  process.exit(0);
}

console.error(`glyphs: ${offences.length} character(s) Roblox will draw as an empty box\n`);
for (const o of offences) {
  const hex = 'U+' + o.cp.toString(16).toUpperCase().padStart(4, '0');
  console.error(`  ${o.file}:${o.line}  ${o.ch}  ${hex}`);
}
console.error('\nPick a replacement from Emoji 11.0 or earlier. This is a deliberate');
console.error('divergence from the web app — see roblox/README.md, "Notable port decisions".');
process.exit(1);
