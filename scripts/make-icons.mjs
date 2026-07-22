// ============================================================================
// The app icons — drawn, not drawn-in-an-editor.
//
// An installed web app needs raster icons, and this repo has no image pipeline
// and no dependencies. Rather than commit a binary nobody can edit, the icon is
// a few dozen lines of arithmetic — a soroban rod pair in the app's own palette
// — encoded as PNG with node's built-in zlib. Run `npm run icons` to rebuild
// them; the output is committed so the site stays a static checkout.
//
// The PNG here is the simplest legal one: 8-bit RGBA, no interlacing, filter 0
// on every row. That is a few percent larger than an optimised encoder would
// manage on a 512×512 icon, and it costs nothing anyone will notice.
// ============================================================================
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const PAPER = hex('#16141f');   // lacquer black with an indigo cast
const GOLD = hex('#f2bd4e');    // a counted bead is a lit lantern
const ROD = hex('#8a6a1d');
const INK = hex('#f0e9d8');
const DIM = hex('#494455');

// --- a tiny canvas ----------------------------------------------------------
function canvas(size) {
  const px = new Uint8Array(size * size * 4);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3];
  };
  return {
    px, size, set,
    fill(c) { for (let i = 0; i < px.length; i += 4) { px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3]; } },
    rect(x0, y0, w, h, c) {
      for (let y = Math.round(y0); y < Math.round(y0 + h); y++) {
        for (let x = Math.round(x0); x < Math.round(x0 + w); x++) set(x, y, c);
      }
    },
    // A bead: a filled ellipse, which is what a soroban bead is in profile.
    bead(cx, cy, rx, ry, c) {
      for (let y = Math.round(cy - ry); y <= cy + ry; y++) {
        for (let x = Math.round(cx - rx); x <= cx + rx; x++) {
          const dx = (x - cx) / rx, dy = (y - cy) / ry;
          if (dx * dx + dy * dy <= 1) set(x, y, c);
        }
      }
    },
  };
}

// --- PNG --------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodePng(px, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // colour type: RGBA
  // 10..12 = compression, filter, interlace — all 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;                       // filter: none
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- the icon ---------------------------------------------------------------
// Two rods of a soroban, seen straight on: the reckoning bar across the middle,
// a heaven bead above it on each rod and four earth beads below — the left rod
// counted (beads pushed TOWARD the bar, lit gold), the right one at rest.
export function drawIcon(size) {
  const c = canvas(size);
  const u = size / 64;                       // one design unit
  c.fill(PAPER);

  const rods = [size * 0.36, size * 0.64];
  const barY = size * 0.42;
  const rx = 7.5 * u, ry = 3.6 * u;

  for (const x of rods) c.rect(x - 0.7 * u, size * 0.12, 1.4 * u, size * 0.76, ROD);
  c.rect(size * 0.14, barY - 1.4 * u, size * 0.72, 2.8 * u, INK);

  // Left rod: heaven bead down against the bar, two earth beads up against it.
  c.bead(rods[0], barY - 4.6 * u, rx, ry, GOLD);
  c.bead(rods[0], barY + 4.6 * u, rx, ry, GOLD);
  c.bead(rods[0], barY + 12.2 * u, rx, ry, GOLD);
  c.bead(rods[0], barY + 22.5 * u, rx, ry, DIM);

  // Right rod: everything at rest, away from the bar.
  c.bead(rods[1], barY - 12.5 * u, rx, ry, DIM);
  c.bead(rods[1], barY + 14 * u, rx, ry, DIM);
  c.bead(rods[1], barY + 21.6 * u, rx, ry, DIM);

  return c;
}

if (process.argv[1] && process.argv[1].endsWith('make-icons.mjs')) {
  mkdirSync(join(ROOT, 'icons'), { recursive: true });
  for (const size of [192, 512]) {
    const c = drawIcon(size);
    const out = join(ROOT, 'icons', `soroban-${size}.png`);
    writeFileSync(out, encodePng(c.px, size));
    console.log(`icons/soroban-${size}.png`);
  }
}
