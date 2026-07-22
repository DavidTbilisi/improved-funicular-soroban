// ============================================================================
// Game canvas mount — boots Phaser into a DOM element and hides its async
// scene lifecycle behind a small imperative API (calls made before the scene
// finishes create() are queued). Two config lines are load-bearing:
//   input: { keyboard: false } — Phaser attaches no key listeners, so the
//     board shell's document-level home-row arithmetic keeps working even
//     while the pointer is on the canvas;
//   audio: { noAudio: true }   — the app's SoundService owns all audio.
// ============================================================================
import * as Phaser from '../../../vendor/phaser.esm.js';
import { VillageScene } from './villageScene.js';

export function mountGameCanvas(parentEl, { onCellTap }) {
  let ready = false;
  const queue = [];
  const call = fn => { if (ready) fn(); else queue.push(fn); };
  const scene = new VillageScene({
    onCellTap,
    onReady: () => { ready = true; for (const fn of queue.splice(0)) fn(); },
  });
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: parentEl,
    /* World aspect ≈ the cockpit's wide canvas panel, so Scale.FIT letterboxes
       less and the grid displays larger; the flanks hold the decor forest. */
    width: 1160,
    height: 588,
    transparent: true,
    banner: false,
    audio: { noAudio: true },
    input: { keyboard: false },
    // expandParent is ON by default and writes the game's own width onto the
    // parent element — which on a phone stretches the cockpit's canvas cell to
    // 1160-scaled px and pushes the whole page sideways. The panel's size is the
    // layout's business; Phaser only fits into it.
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, expandParent: false },
    scene: [scene],
  });
  // Phaser measures the parent ONCE at boot, and on a phone that happens before
  // the cockpit's narrow layout has settled — leaving a FIT canvas sized to a
  // container it no longer has, wider than the screen. Watching the parent
  // instead of trusting the first measurement also covers rotation and the
  // desktop sidebar changing width.
  const ro = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => { try { game.scale.refresh(); } catch { /* pre-boot */ } })
    : null;
  if (ro) ro.observe(parentEl);

  return {
    setVillage: v => call(() => scene.renderVillage(v)),
    setPlacement: def => call(() => scene.setPlacement(def)),
    flashPayout: (text, ok) => call(() => scene.flashPayout(text, ok)),
    pulseDay: () => call(() => scene.pulseDay()),
    celebrate: () => call(() => scene.celebrate()),
    achievementBurst: () => call(() => scene.achievementBurst()),
    festival: () => call(() => scene.festivalBurst()),
    destroy: () => { if (ro) ro.disconnect(); game.destroy(true); },
  };
}
