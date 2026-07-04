// ============================================================================
// Metronome — a steady click to pace bead strokes while training. Speed on the
// soroban is built by making each move on an even beat and ratcheting the tempo
// up, so this is a practice aid, not decoration.
//
// It uses the Web Audio "lookahead scheduler" pattern (Chris Wilson, "A Tale of
// Two Clocks"): a coarse setInterval wakes up often, and each wake-up schedules
// every beat that falls inside a short window *ahead* of the audio clock. The
// beats are placed with sample-accurate AudioContext times, so the tempo never
// drifts even if the timer that drives the loop is jittery.
//
// A browser-only view concern (it touches AudioContext / timers). The tick
// selection is factored into `pull`, a pure function, so the scheduling logic
// is unit-tested without audio or real time. `start()` is a no-op that returns
// false when there is no AudioContext (e.g. under node), keeping it import-safe.
// ============================================================================
import { getAudioContext } from './audioContext.js';

// Pure: advance the scheduling cursor across a window and return the beats to
// fire. `cursor` is { beat, nextTime }; a beat is emitted while its time falls
// before `currentTime + scheduleAhead`. Accent marks every `accent`-th beat (0
// disables accents). Returns the beats and the advanced cursor — no mutation.
export function pull(cursor, currentTime, scheduleAhead, bpm, accent) {
  const spb = 60 / bpm; // seconds per beat
  const beats = [];
  let { beat, nextTime } = cursor;
  while (nextTime < currentTime + scheduleAhead) {
    beats.push({ beat, time: nextTime, accent: accent > 0 && beat % accent === 0 });
    beat += 1;
    nextTime += spb;
  }
  return { beats, cursor: { beat, nextTime } };
}

export class Metronome {
  constructor({ bpm = 60, accent = 4, getContext = getAudioContext } = {}) {
    this.bpm = this._clampBpm(bpm);
    this.accent = Math.max(0, accent | 0); // accent every Nth beat; 0 = none
    this.getContext = getContext;
    this.running = false;
    this.onBeat = null;                    // (beatIndex, isAccent) => void, for visuals
    this._cursor = { beat: 0, nextTime: 0 };
    this._timer = null;
    this._lookaheadMs = 25;                // how often the scheduler wakes up
    this._scheduleAhead = 0.12;            // seconds of audio scheduled per wake-up
  }

  _clampBpm(b) { return Math.max(20, Math.min(300, Math.round(b) || 60)); }
  setBpm(b) { this.bpm = this._clampBpm(b); return this.bpm; }
  setAccent(n) { this.accent = Math.max(0, n | 0); }

  start() {
    if (this.running) return false;
    const ac = this.getContext();
    if (!ac) return false; // no audio (e.g. node) — nothing to run
    this.running = true;
    this._cursor = { beat: 0, nextTime: ac.currentTime + 0.08 };
    this._tick();
    return true;
  }

  stop() {
    this.running = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  toggle() { if (this.running) { this.stop(); return false; } return this.start(); }

  _tick() {
    if (!this.running) return;
    const ac = this.getContext();
    if (!ac) { this.stop(); return; }
    const { beats, cursor } = pull(this._cursor, ac.currentTime, this._scheduleAhead, this.bpm, this.accent);
    this._cursor = cursor;
    for (const b of beats) {
      this._click(ac, b.time, b.accent);
      if (this.onBeat) {
        // Fire the visual pulse close to when its click actually sounds.
        const lead = Math.max(0, (b.time - ac.currentTime) * 1000);
        const beat = b.beat, accent = b.accent;
        setTimeout(() => { if (this.running) this.onBeat(beat, accent); }, lead);
      }
    }
    this._timer = setTimeout(() => this._tick(), this._lookaheadMs);
  }

  // A short enveloped click — a brighter, louder blip on the accented beat.
  _click(ac, when, accent) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(accent ? 2000 : 1250, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(accent ? 0.4 : 0.24, when + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.035);
    osc.connect(g).connect(ac.destination);
    osc.start(when);
    osc.stop(when + 0.05);
  }
}
