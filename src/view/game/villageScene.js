// ============================================================================
// VillageScene — the Phaser diorama of the village. A pure renderer + pointer
// surface: it receives village snapshots via renderVillage() and reports cell
// taps through the injected onCellTap callback; it never owns or mutates game
// state. Sprites are emoji text objects (the app's emoji-as-data convention —
// zero image assets); all tweens here are cosmetic, real time only.
// Ambience is cosmetic too and derives from the same snapshots: a seeded decor
// ring (stable across loads), drifting clouds, and one wandering villager per
// hut (plus a founder). Colors mirror styles.css tokens: --line hairlines,
// --data-wash hover, --green/--amber payout text; the grass checker matches
// the .game-canvas gradient.
// ============================================================================
import * as Phaser from '../../../vendor/phaser.esm.js';
import { GRID_COLS, GRID_ROWS, GRID_CELLS, buildingById } from '../../game/buildings.js';

const TILE = 88;
const RES_EMOJI = { food: '🌾', wood: '🪵', coin: '🪙', sp: '🧮' };
const DPR = () => window.devicePixelRatio || 1;
const VILLAGER_GLYPHS = ['🧑‍🌾', '👩‍🌾', '🧒', '👴', '🧑‍🍳', '👧', '🧑‍🔧', '👵'];
const DECOR_GLYPHS = ['🌲', '🌳', '🌳', '🌲', '🌾', '🌸', '🪨'];

// Tiny seeded PRNG (mulberry32) so the decor ring is identical on every load.
function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class VillageScene extends Phaser.Scene {
  constructor({ onCellTap, onReady }) {
    super('village');
    this.onCellTap = onCellTap;
    this.onReady = onReady;
    this.sprites = new Map(); // cellIdx -> { id, level, emoji, badge }
    this.tiles = [];
    this.ghost = null;
    this.hoverIdx = -1;
    this.villagers = []; // { t, timer }
  }

  cellXY(i) {
    const c = i % GRID_COLS, r = Math.floor(i / GRID_COLS);
    return { x: this.ox + c * TILE + TILE / 2, y: this.oy + r * TILE + TILE / 2 };
  }

  create() {
    const { width, height } = this.scale;
    this.ox = (width - GRID_COLS * TILE) / 2;
    this.oy = (height - GRID_ROWS * TILE) / 2;
    for (let i = 0; i < GRID_CELLS; i++) {
      const { x, y } = this.cellXY(i);
      const c = i % GRID_COLS, r = Math.floor(i / GRID_COLS);
      const tile = this.add.rectangle(x, y, TILE - 4, TILE - 4, 0xffffff, (c + r) % 2 ? 0.28 : 0.44)
        .setStrokeStyle(1, 0xdde4d0);
      tile.baseAlpha = tile.fillAlpha;
      tile.setInteractive({ useHandCursor: true });
      tile.on('pointerover', () => this._hover(i, true));
      tile.on('pointerout', () => this._hover(i, false));
      tile.on('pointerdown', () => this.onCellTap(i));
      this.tiles[i] = tile;
    }
    this._plantDecor();
    this._driftClouds();
    if (this.onReady) this.onReady();
  }

  // A ring of greenery just outside the plots — seeded, so the same forest
  // greets the player every session.
  _plantDecor() {
    const rnd = seededRng(0x50f0ba);
    const jitter = k => (rnd() - 0.5) * k;
    const spots = [];
    const left = this.ox - 30, right = this.ox + GRID_COLS * TILE + 30;
    const top = this.oy - 26, bottom = this.oy + GRID_ROWS * TILE + 26;
    for (let k = 0; k < 9; k++) {
      spots.push({ x: this.ox + 20 + (k / 8) * (GRID_COLS * TILE - 40) + jitter(26), y: top + jitter(14) });
      spots.push({ x: this.ox + 20 + ((k + 0.5) / 8) * (GRID_COLS * TILE - 40) + jitter(26), y: bottom + jitter(14) });
    }
    for (let k = 0; k < 5; k++) {
      spots.push({ x: left + jitter(16), y: this.oy + 20 + (k / 4) * (GRID_ROWS * TILE - 40) + jitter(20) });
      spots.push({ x: right + jitter(16), y: this.oy + 20 + ((k + 0.5) / 4) * (GRID_ROWS * TILE - 40) + jitter(20) });
    }
    for (const s of spots) {
      const glyph = DECOR_GLYPHS[Math.floor(rnd() * DECOR_GLYPHS.length)];
      this.add.text(s.x, s.y, glyph, { fontSize: `${16 + Math.floor(rnd() * 8)}px`, padding: { x: 4, y: 4 } })
        .setOrigin(0.5).setResolution(DPR()).setAlpha(0.9).setDepth(1);
    }
  }

  // Two clouds amble across the sky band forever.
  _driftClouds() {
    const spawn = (x, y, size, speed) => {
      const cloud = this._emojiText(x, y, '☁️', size).setAlpha(0.4).setDepth(8);
      const drift = () => {
        const dist = this.scale.width + 120 - cloud.x;
        this.tweens.add({
          targets: cloud, x: this.scale.width + 60, duration: dist * speed, ease: 'Linear',
          onComplete: () => { cloud.x = -60; cloud.y = 14 + Math.random() * 30; drift(); },
        });
      };
      drift();
    };
    spawn(this.scale.width * 0.25, 22, 30, 320);
    spawn(this.scale.width * 0.7, 36, 22, 430);
  }

  _hover(i, on) {
    this.hoverIdx = on ? i : -1;
    this.tiles[i].setFillStyle(on ? 0xeceffb : 0xffffff, on ? 0.95 : this.tiles[i].baseAlpha);
    this.tiles[i].setStrokeStyle(on ? 1.5 : 1, on ? 0x4353cc : 0xdde4d0);
    if (this.ghost) {
      if (on) { const { x, y } = this.cellXY(i); this.ghost.setPosition(x, y).setVisible(true); }
      else this.ghost.setVisible(false);
    }
  }

  _emojiText(x, y, glyph, size) {
    return this.add.text(x, y, glyph, { fontSize: `${size}px`, padding: { x: 8, y: 8 } })
      .setOrigin(0.5).setResolution(DPR());
  }

  // Reconcile the grid against the village snapshot (placements, upgrades,
  // resets all fall out of the same diff). Population follows the huts.
  renderVillage(village) {
    let huts = 0;
    for (let i = 0; i < GRID_CELLS; i++) {
      const cell = village.grid[i];
      if (cell && cell.id === 'hut') huts++;
      const cur = this.sprites.get(i);
      if (!cell) {
        if (cur) { cur.emoji.destroy(); cur.badge.destroy(); this.sprites.delete(i); }
        continue;
      }
      const def = buildingById(cell.id);
      const badgeText = cell.level > 1 ? `L${cell.level}` : '';
      if (cur) {
        if (cur.id !== cell.id) cur.emoji.setText(def.emoji);
        if (cur.level !== cell.level || cur.id !== cell.id) { cur.badge.setText(badgeText); this._pop(cur.emoji); }
        cur.id = cell.id;
        cur.level = cell.level;
      } else {
        const { x, y } = this.cellXY(i);
        const emoji = this._emojiText(x, y - 2, def.emoji, 42).setDepth(4);
        const badge = this.add.text(x + 27, y + 25, badgeText, {
          fontSize: '14px', fontFamily: 'monospace', fontStyle: 'bold', color: '#4353cc',
        }).setOrigin(0.5).setResolution(DPR()).setDepth(4);
        this.sprites.set(i, { id: cell.id, level: cell.level, emoji, badge });
        this._pop(emoji);
      }
    }
    this._syncVillagers(Math.min(1 + huts, VILLAGER_GLYPHS.length));
  }

  // One founder plus one villager per hut, wandering the plots. They walk
  // behind buildings (depth 3 < 4) and never intercept the pointer.
  _syncVillagers(n) {
    while (this.villagers.length < n) this.villagers.push(this._spawnVillager(this.villagers.length));
    while (this.villagers.length > n) {
      const v = this.villagers.pop();
      if (v.timer) v.timer.remove();
      this.tweens.killTweensOf(v.t);
      this.tweens.add({ targets: v.t, alpha: 0, duration: 400, onComplete: () => v.t.destroy() });
    }
  }

  _randomSpot() {
    return {
      x: this.ox + 16 + Math.random() * (GRID_COLS * TILE - 32),
      y: this.oy + 16 + Math.random() * (GRID_ROWS * TILE - 32),
    };
  }

  _spawnVillager(i) {
    const start = this._randomSpot();
    const t = this._emojiText(start.x, start.y, VILLAGER_GLYPHS[i % VILLAGER_GLYPHS.length], 19)
      .setAlpha(0).setDepth(3);
    this.tweens.add({ targets: t, alpha: 0.95, duration: 400 });
    const v = { t, timer: null };
    const wander = () => {
      const to = this._randomSpot();
      t.setScale(to.x < t.x ? -1 : 1, 1); // face the direction of travel
      const dist = Phaser.Math.Distance.Between(t.x, t.y, to.x, to.y);
      this.tweens.add({
        targets: t, x: to.x, y: to.y, duration: 22 * dist + 500, ease: 'Sine.easeInOut',
        onComplete: () => { v.timer = this.time.delayedCall(800 + Math.random() * 2600, wander); },
      });
    };
    wander();
    return v;
  }

  _pop(obj) {
    obj.setScale(0.2);
    this.tweens.add({ targets: obj, scale: 1, duration: 340, ease: 'Back.easeOut' });
  }

  // Ghost of the armed building following the hovered tile.
  setPlacement(def) {
    if (this.ghost) { this.ghost.destroy(); this.ghost = null; }
    if (!def) return;
    this.ghost = this._emojiText(0, 0, def.emoji, 42).setAlpha(0.45).setDepth(5).setVisible(false);
    if (this.hoverIdx >= 0) {
      const { x, y } = this.cellXY(this.hoverIdx);
      this.ghost.setPosition(x, y).setVisible(true);
    }
  }

  // "+18 sp" rising over the village (green when clean, amber otherwise).
  flashPayout(text, ok = true) {
    const t = this.add.text(this.scale.width / 2, this.oy + 70, text, {
      fontSize: '32px', fontFamily: 'monospace', fontStyle: 'bold',
      color: ok ? '#178a4c' : '#c77414', padding: { x: 8, y: 8 },
    }).setOrigin(0.5).setResolution(DPR()).setAlpha(0).setDepth(10);
    this.tweens.add({
      targets: t, alpha: 1, y: '-=36', duration: 420, ease: 'Cubic.easeOut',
      onComplete: () => this.tweens.add({
        targets: t, alpha: 0, y: '-=28', delay: 650, duration: 480, onComplete: () => t.destroy(),
      }),
    });
  }

  // A new day: a warm dawn washes over the canvas and each producing building
  // exhales its resource emoji.
  pulseDay() {
    const wash = this.add.rectangle(this.scale.width / 2, this.scale.height / 2,
      this.scale.width, this.scale.height, 0xffd9a0, 0).setDepth(9);
    this.tweens.add({
      targets: wash, fillAlpha: 0.16, duration: 260, yoyo: true, ease: 'Sine.easeInOut',
      onComplete: () => wash.destroy(),
    });
    let n = 0;
    for (const [i, spr] of this.sprites) {
      const def = buildingById(spr.id);
      const keys = Object.keys(def.yield);
      if (!keys.length) continue;
      const { x, y } = this.cellXY(i);
      for (const k of keys) {
        const t = this._emojiText(x + (n % 2 ? 14 : -14), y - 20, RES_EMOJI[k], 18).setAlpha(0.9).setDepth(6);
        this.tweens.add({
          targets: t, y: y - 66, alpha: 0, delay: 60 * (n % 5), duration: 900,
          ease: 'Cubic.easeOut', onComplete: () => t.destroy(),
        });
        n++;
      }
    }
  }

  // Milestone burst of sparkles around every shrine.
  celebrate() {
    for (const [i, spr] of this.sprites) {
      if (spr.id !== 'shrine') continue;
      const { x, y } = this.cellXY(i);
      for (let k = 0; k < 8; k++) {
        const a = (Math.PI * 2 * k) / 8;
        const t = this._emojiText(x, y, '✨', 20).setDepth(10);
        this.tweens.add({
          targets: t, x: x + Math.cos(a) * 70, y: y + Math.sin(a) * 70, alpha: 0,
          duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy(),
        });
      }
    }
  }
}
