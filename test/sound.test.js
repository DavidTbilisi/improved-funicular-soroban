import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SoundService } from '../src/view/soundService.js';

// SoundService is browser-only (Web Audio). Under node there is no AudioContext,
// so every method must be a safe no-op — never throw — and the mute flag must
// still toggle. This guards the import-safety the app relies on.

test('defaults to enabled and toggles', () => {
  const s = new SoundService();
  assert.equal(s.enabled, true);
  s.setEnabled(false);
  assert.equal(s.enabled, false);
  s.setEnabled(true);
  assert.equal(s.enabled, true);
});

test('respects an explicit disabled start', () => {
  assert.equal(new SoundService({ enabled: false }).enabled, false);
});

test('all sound methods are no-ops without an AudioContext', () => {
  const s = new SoundService();
  assert.doesNotThrow(() => {
    s.bead(); s.bead(-1);
    s.digit(3); s.digit(7, -1); s.digit(0);
    s.carry(); s.carry(-1);
    s.reject(); s.reset();
    s.solve(); s.levelUp();
  });
  assert.equal(s.ctx, null); // no context ever created under node
});
