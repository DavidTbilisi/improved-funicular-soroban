// ============================================================================
// VillageScene — the Phaser diorama of the village. A pure renderer + pointer
// surface: it receives village snapshots via renderVillage() and reports cell
// taps through the injected onCellTap callback; it never owns or mutates game
// state. Sprites are emoji text objects (the app's emoji-as-data convention —
// zero image assets); all tweens here are cosmetic, real time only.
// Ambience is cosmetic too and derives from the same snapshots: a seeded decor
// ring (stable across loads), drifting clouds, and one wandering villager per
// hut (plus a founder). Colors mirror styles.css tokens: gold (--gold) marks
// the hovered/armed plot, --green/--amber tint payout text; the dusk-grass
// checker matches the .game-canvas gradient.
//
// Painterly night-festival lighting pass (Sword-of-Ditto mood, no new art):
// a camera-level dusk grade + vignette, a warm additive glow pool behind the
// grid, speckled grass tile textures, soft radial shadows under buildings, a
// glow halo on shrines, and low ambient dust motes + falling sakura petals.
// Everything is generated once via Canvas textures / Phaser's postFX + a
// couple of manual tween-chain "drift" loops (same recipe as _driftClouds) —
// still zero image assets, still purely cosmetic.
// ============================================================================
import * as Phaser from '../../../vendor/phaser.esm.js';
import { GRID_COLS, GRID_ROWS, GRID_CELLS, buildingById, RES_EMOJI } from '../../game/buildings.js';

const TILE = 88;
const DPR = () => window.devicePixelRatio || 1;
const VILLAGER_GLYPHS = ['🧑‍🌾', '👩‍🌾', '🧒', '👴', '🧑‍🍳', '👧', '🧑‍🔧', '👵'];
const DECOR_GLYPHS = ['🌲', '🌳', '🌳', '🌲', '🌾', '🌸', '🪨'];
const GLOW_GOLD = 0xf2bd4e;

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
    this._generateTextures();
    this._lightMood();
    // A warm glow pool behind the whole grid — the festival's ambient light
    // bleeding onto the grass, additive so it only ever brightens.
    this.add.image(this.ox + (GRID_COLS * TILE) / 2, this.oy + (GRID_ROWS * TILE) / 2, 'vGlow')
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(-2);
    for (let i = 0; i < GRID_CELLS; i++) {
      const { x, y } = this.cellXY(i);
      const c = i % GRID_COLS, r = Math.floor(i / GRID_COLS);
      // Speckled grass texture under the plate — purely visual, sits behind
      // the interactive rect below so hover/tap hit-testing is untouched.
      this.add.image(x, y, (c + r) % 2 ? 'vTile1' : 'vTile0').setDepth(-1);
      // A dark sliver under each plate so the plot reads raised off the grass.
      this.add.rectangle(x, y + 3, TILE - 4, TILE - 4, 0x000000, 0.22);
      const tile = this.add.rectangle(x, y, TILE - 4, TILE - 4, 0xffe9c0, (c + r) % 2 ? 0.05 : 0.10)
        .setStrokeStyle(1, 0x3f4a33);
      tile.baseAlpha = tile.fillAlpha;
      tile.setInteractive({ useHandCursor: true });
      tile.on('pointerover', () => this._hover(i, true));
      tile.on('pointerout', () => this._hover(i, false));
      tile.on('pointerdown', () => this.onCellTap(i));
      this.tiles[i] = tile;
    }
    this._plantDecor();
    this._driftClouds();
    this._driftMotes();
    this._driftPetals();
    if (this.onReady) this.onReady();
  }

  // Camera-level dusk grade: a soft vignette framing the diorama plus a touch
  // more saturation/contrast for a richer, less flat night-festival mood.
  // WebGL-only (postFX no-ops under the Canvas renderer fallback) — guarded
  // so an unsupported renderer just skips the grade instead of throwing.
  _lightMood() {
    try {
      const cam = this.cameras.main;
      cam.postFX.addVignette(0.5, 0.5, 0.82, 0.35);
      const cm = cam.postFX.addColorMatrix();
      cm.saturate(0.12);
      cm.contrast(1.05);
      cm.brightness(1.02);
    } catch { /* Canvas-renderer fallback: no postFX pipeline, skip the grade */ }
  }

  // One-time Canvas-drawn textures: a big soft radial glow, a small soft
  // shadow puddle, a tiny glow-dot for the ambient dust motes, and two
  // checker-parity speckled grass tiles. Generated once at boot; everything
  // downstream just stamps these as ordinary (non-interactive) images.
  _generateTextures() {
    const radial = (key, w, h, stops) => {
      const tex = this.textures.createCanvas(key, w, h);
      const ctx = tex.getContext();
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) / 2);
      for (const [at, color] of stops) g.addColorStop(at, color);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      tex.refresh();
    };
    radial('vGlow', 900, 620, [
      [0, 'rgba(242,189,78,0.30)'], [0.55, 'rgba(242,189,78,0.10)'], [1, 'rgba(242,189,78,0)'],
    ]);
    radial('vShadow', 70, 34, [
      [0, 'rgba(0,0,0,0.40)'], [0.7, 'rgba(0,0,0,0.16)'], [1, 'rgba(0,0,0,0)'],
    ]);
    radial('vMote', 14, 14, [
      [0, 'rgba(255,224,160,0.9)'], [1, 'rgba(255,224,160,0)'],
    ]);
    const rnd = seededRng(0xa11ce);
    for (const parity of [0, 1]) {
      const tex = this.textures.createCanvas(`vTile${parity}`, TILE, TILE);
      const ctx = tex.getContext();
      ctx.fillStyle = parity ? 'rgba(255,233,192,0.05)' : 'rgba(255,233,192,0.09)';
      ctx.fillRect(0, 0, TILE, TILE);
      for (let k = 0; k < 60; k++) {
        const x = rnd() * TILE, y = rnd() * TILE, r = 1 + rnd() * 2.2;
        ctx.fillStyle = rnd() > 0.85 ? 'rgba(242,189,78,0.10)' : `rgba(255,233,192,${(0.03 + rnd() * 0.05).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      tex.refresh();
    }
  }

  // A ring of greenery just outside the plots — seeded, so the same forest
  // greets the player every session. The side flanks are proper woods now:
  // they scatter across the whole band between world edge and grid, so a wide
  // canvas reads as countryside instead of empty green.
  _plantDecor() {
    const rnd = seededRng(0x50f0ba);
    const jitter = k => (rnd() - 0.5) * k;
    const spots = [];
    const top = this.oy - 12, bottom = this.oy + GRID_ROWS * TILE + 16;
    for (let k = 0; k < 9; k++) {
      spots.push({ x: this.ox + 20 + (k / 8) * (GRID_COLS * TILE - 40) + jitter(26), y: top + jitter(10) });
      spots.push({ x: this.ox + 20 + ((k + 0.5) / 8) * (GRID_COLS * TILE - 40) + jitter(26), y: bottom + jitter(10) });
    }
    const bandW = Math.max(this.ox - 24, 24);
    const rightX = this.ox + GRID_COLS * TILE;
    for (let k = 0; k < 12; k++) {
      spots.push({ x: 12 + rnd() * bandW, y: this.oy + rnd() * GRID_ROWS * TILE });
      spots.push({ x: rightX + 12 + rnd() * bandW, y: this.oy + rnd() * GRID_ROWS * TILE });
    }
    for (const s of spots) {
      const glyph = DECOR_GLYPHS[Math.floor(rnd() * DECOR_GLYPHS.length)];
      this.add.text(s.x, s.y, glyph, { fontSize: `${16 + Math.floor(rnd() * 10)}px`, padding: { x: 4, y: 4 } })
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

  // A trickle of warm dust motes drifting up out of the grid — ambient
  // festival-light atmosphere, always on, well below the cloud layer.
  _driftMotes() {
    const spawn = () => {
      const x = this.ox + Math.random() * GRID_COLS * TILE;
      const y = this.oy + GRID_ROWS * TILE - Math.random() * 60;
      const mote = this.add.image(x, y, 'vMote').setAlpha(0).setDepth(7)
        .setBlendMode(Phaser.BlendModes.ADD).setScale(0.5 + Math.random() * 0.7);
      const rise = 90 + Math.random() * 70, sway = (Math.random() - 0.5) * 40;
      const dur = 4200 + Math.random() * 2400;
      this.tweens.add({ targets: mote, alpha: 0.5, duration: 900 });
      this.tweens.add({ targets: mote, alpha: 0, delay: Math.max(0, dur - 1200), duration: 1200 });
      this.tweens.add({
        targets: mote, x: x + sway, y: y - rise, duration: dur, ease: 'Sine.easeInOut',
        onComplete: () => mote.destroy(),
      });
      this.time.delayedCall(450 + Math.random() * 650, spawn);
    };
    spawn();
  }

  // Sakura petals fall through the scene now and then, swaying as they go —
  // an echo of the static 🌸 decor ring, just given a little life.
  _driftPetals() {
    const spawn = () => {
      const x0 = this.ox + Math.random() * GRID_COLS * TILE;
      const petal = this._emojiText(x0, this.oy - 24, '🌸', 12 + Math.random() * 6)
        .setAlpha(0).setDepth(7);
      const dur = 5200 + Math.random() * 3000;
      this.tweens.add({ targets: petal, alpha: 0.85, duration: 500 });
      this.tweens.add({ targets: petal, alpha: 0, delay: Math.max(0, dur - 800), duration: 800 });
      this.tweens.add({
        targets: petal, y: this.oy + GRID_ROWS * TILE + 24, angle: 140, duration: dur, ease: 'Sine.easeInOut',
        onUpdate: tw => { petal.x = x0 + Math.sin(tw.progress * Math.PI * 4) * 22; },
        onComplete: () => petal.destroy(),
      });
      this.time.delayedCall(3200 + Math.random() * 3600, spawn);
    };
    this.time.delayedCall(1800, spawn);
  }

  _hover(i, on) {
    this.hoverIdx = on ? i : -1;
    this.tiles[i].setFillStyle(on ? 0xf2bd4e : 0xffe9c0, on ? 0.22 : this.tiles[i].baseAlpha);
    this.tiles[i].setStrokeStyle(on ? 1.5 : 1, on ? 0xf2bd4e : 0x3f4a33);
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
        if (cur) { cur.emoji.destroy(); cur.badge.destroy(); cur.shadow.destroy(); this.sprites.delete(i); }
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
        // A soft radial puddle grounds the building instead of a hard-edged
        // rect — cheap volumetric depth without any new art.
        const shadow = this.add.image(x, y + 21, 'vShadow').setDepth(2);
        const emoji = this._emojiText(x, y - 2, def.emoji, 42).setDepth(4);
        const badge = this.add.text(x + 27, y + 25, badgeText, {
          fontSize: '14px', fontFamily: 'monospace', fontStyle: 'bold', color: '#ffd984',
        }).setOrigin(0.5).setResolution(DPR()).setDepth(4);
        // The shrine is the festival's light source — give it a warm halo.
        if (cell.id === 'shrine') {
          try { emoji.postFX.addGlow(GLOW_GOLD, 0.6, 0, false, 0.4, 10); } catch { /* Canvas fallback */ }
        }
        this.sprites.set(i, { id: cell.id, level: cell.level, emoji, badge, shadow });
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
      color: ok ? '#6fd394' : '#eda14e', padding: { x: 8, y: 8 },
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

  // A lit festival: lanterns rise from the plots with a few sparkles between.
  festivalBurst() {
    for (let k = 0; k < 14; k++) {
      const { x, y } = this._randomSpot();
      const glyph = k % 3 === 2 ? '✨' : '🏮';
      const t = this._emojiText(x, y + 20, glyph, 16 + Math.floor(Math.random() * 10)).setAlpha(0).setDepth(10);
      this.tweens.add({
        targets: t, alpha: 0.95, y: y - 40 - Math.random() * 60, delay: 90 * k, duration: 500, ease: 'Cubic.easeOut',
        onComplete: () => this.tweens.add({ targets: t, alpha: 0, y: '-=40', duration: 700, onComplete: () => t.destroy() }),
      });
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
