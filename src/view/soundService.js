// ============================================================================
// SoundService — synthesized audio feedback via the Web Audio API (no asset
// files, so the zero-dependency toolchain is preserved). A browser-only view
// concern: it touches window/AudioContext, so it lives in the view layer, not
// in the DOM-free core. All methods are no-ops when audio is muted or when
// there is no AudioContext (e.g. under node in tests), so it is import-safe.
//
// The AudioContext is created lazily and resumed on demand — every sound is
// triggered from inside a user gesture (keydown / click), which satisfies the
// browser autoplay policy without extra plumbing.
// ============================================================================
const root = typeof globalThis !== 'undefined' ? globalThis : {};

export class SoundService {
  constructor({ enabled = true } = {}) {
    this.enabled = enabled;
    this.ctx = null;
  }

  _ac() {
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    if (!this.ctx) this.ctx = new AC();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setEnabled(on) { this.enabled = on; if (on) this._ac(); }

  // One enveloped oscillator note. Gains ramp to a small epsilon (never 0, which
  // exponentialRamp forbids) for a clean click without pops.
  _tone(freq, t0, dur, { type = 'triangle', gain = 0.2, glideTo = null } = {}) {
    const ac = this.ctx;
    if (!ac) return;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _seq(notes, { type = 'triangle', gain = 0.18, step = 0.09, dur = 0.13 } = {}) {
    if (!this.enabled) return;
    const ac = this._ac();
    if (!ac) return;
    const t = ac.currentTime;
    notes.forEach((f, i) => this._tone(f, t + i * step, dur, { type, gain }));
  }

  // A single bead seating against the bar. Add rings a touch higher than subtract.
  bead(sign = 1) {
    if (!this.enabled) return;
    const ac = this._ac();
    if (!ac) return;
    this._tone(sign > 0 ? 520 : 430, ac.currentTime, 0.055, { type: 'triangle', gain: 0.16 });
  }

  // Carry (+10) / borrow (−10): two notes, rising to carry, falling to borrow —
  // you hear the value cross into the neighbouring column.
  carry(sign = 1) {
    this._seq(sign > 0 ? [392, 588] : [588, 392], { gain: 0.16, step: 0.06, dur: 0.075 });
  }

  reject() {
    if (!this.enabled) return;
    const ac = this._ac();
    if (!ac) return;
    this._tone(150, ac.currentTime, 0.17, { type: 'sawtooth', gain: 0.15, glideTo: 108 });
  }

  reset() {
    if (!this.enabled) return;
    const ac = this._ac();
    if (!ac) return;
    this._tone(620, ac.currentTime, 0.2, { type: 'sine', gain: 0.13, glideTo: 190 });
  }

  solve() { this._seq([523, 659, 784], { gain: 0.15, step: 0.08, dur: 0.12 }); }

  levelUp() { this._seq([523, 659, 784, 1047], { gain: 0.18, step: 0.1, dur: 0.16 }); }
}
