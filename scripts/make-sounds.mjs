// ============================================================================
// make-sounds.mjs — render the Roblox port's audio samples as WAV files, with
// node's own APIs only (the zero-dependency toolchain survives: no DAW, no
// asset pipeline). The web app synthesizes these live in soundService.js;
// Roblox cannot synthesize, but it CAN pitch-shift one uploaded sample via
// Sound.PlaybackSpeed — so five samples cover the whole palette:
//
//   tone-c5.wav       triangle C5 (523.25 Hz) — pitch-shifted for the digit
//                     scale, carry/borrow pairs, solve/level-up arpeggios
//   tone-c5-down.wav  same note gliding to ×0.94 — the subtract variant
//   bead.wav          triangle 520 Hz, 55 ms — a bead seating against the bar
//   reject.wav        sawtooth 150→108 Hz glide — the "illegal move" buzz
//   reset.wav         sine 620→190 Hz glide — the board clearing
//
// Envelopes match the web exactly: 6 ms exponential attack from 1e-4, then
// exponential decay back to 1e-4 at the nominal duration.
//
//   node scripts/make-sounds.mjs      → writes roblox/sounds/*.wav
//
// Upload the five files once in Studio (Asset Manager → Audio) and paste the
// asset ids into roblox/src/client/SoundFx.luau.
// ============================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'roblox', 'sounds');

// value(t) along an exponential ramp v0→v1 over [0,1] — Web Audio's curve.
const expRamp = (v0, v1, u) => v0 * Math.pow(v1 / v0, Math.min(1, Math.max(0, u)));

const wave = {
  triangle: p => 4 * Math.abs(p - Math.floor(p + 0.5)) - 1,
  sawtooth: p => 2 * (p - Math.floor(p + 0.5)),
  sine: p => Math.sin(2 * Math.PI * p),
};

// One enveloped, optionally gliding oscillator note (the web's _tone).
function render({ type, freq, glideTo = null, dur, gain }) {
  const tail = 0.02; // the web stops the oscillator 20 ms after the decay
  const n = Math.round((dur + tail) * RATE);
  const samples = new Float64Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    // frequency: exponential glide over the nominal duration, like the web
    const f = glideTo ? expRamp(freq, glideTo, t / dur) : freq;
    phase += f / RATE;
    // envelope: 1e-4 → gain by 6 ms, then decay to 1e-4 at dur, silence after
    const env = t < 0.006
      ? expRamp(0.0001, gain, t / 0.006)
      : expRamp(gain, 0.0001, (t - 0.006) / (dur - 0.006));
    samples[i] = wave[type](phase) * (t < dur ? env : 0);
  }
  return samples;
}

function writeWav(name, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  }
  writeFileSync(join(OUT, name), buf);
  console.log(`  ${name}  (${(buf.length / 1024).toFixed(1)} KB)`);
}

mkdirSync(OUT, { recursive: true });
console.log('rendering →', OUT);
// gains ×2 vs the web (Sound.Volume rescales in SoundFx; headroom stays safe)
writeWav('tone-c5.wav', render({ type: 'triangle', freq: 523.25, dur: 0.13, gain: 0.4 }));
writeWav('tone-c5-down.wav', render({ type: 'triangle', freq: 523.25, glideTo: 523.25 * 0.94, dur: 0.13, gain: 0.4 }));
writeWav('bead.wav', render({ type: 'triangle', freq: 520, dur: 0.055, gain: 0.35 }));
writeWav('reject.wav', render({ type: 'sawtooth', freq: 150, glideTo: 108, dur: 0.17, gain: 0.3 }));
writeWav('reset.wav', render({ type: 'sine', freq: 620, glideTo: 190, dur: 0.2, gain: 0.28 }));
console.log('done — upload these in Studio (Asset Manager → Audio), then fill');
console.log('the ids in roblox/src/client/SoundFx.luau');
