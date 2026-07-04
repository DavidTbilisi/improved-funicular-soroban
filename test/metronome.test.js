import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pull, Metronome } from '../src/view/metronome.js';

// `pull` is the drift-free scheduling core: given a cursor and the current audio
// time, it returns the beats whose time falls inside the lookahead window and
// the advanced cursor. It is pure — no audio, no timers — so it is fully tested.

test('pull emits every beat inside the window and advances the cursor', () => {
  // 60 BPM = 1s/beat. Window [0, 0.5) at t=0 catches only the beat already due.
  const { beats, cursor } = pull({ beat: 0, nextTime: 0 }, 0, 0.5, 60, 4);
  assert.equal(beats.length, 1);
  assert.equal(beats[0].beat, 0);
  assert.equal(beats[0].time, 0);
  assert.equal(cursor.beat, 1);
  assert.equal(cursor.nextTime, 1); // next beat one second later
});

test('pull emits nothing when the next beat is beyond the window', () => {
  const { beats, cursor } = pull({ beat: 3, nextTime: 3 }, 2, 0.5, 60, 4);
  assert.equal(beats.length, 0);
  assert.deepEqual(cursor, { beat: 3, nextTime: 3 }); // cursor unchanged
});

test('pull catches up multiple beats after a scheduler stall', () => {
  // 120 BPM = 0.5s/beat. From t=0, a wide 2.1s window sweeps beats 0..4.
  const { beats, cursor } = pull({ beat: 0, nextTime: 0 }, 0, 2.1, 120, 4);
  assert.deepEqual(beats.map(b => b.beat), [0, 1, 2, 3, 4]);
  assert.deepEqual(beats.map(b => b.time), [0, 0.5, 1, 1.5, 2]);
  assert.equal(cursor.beat, 5);
});

test('accent marks every Nth beat; 0 disables accents', () => {
  const { beats } = pull({ beat: 0, nextTime: 0 }, 0, 4.1, 120, 4);
  assert.deepEqual(beats.filter(b => b.accent).map(b => b.beat), [0, 4, 8]); // downbeats
  const { beats: none } = pull({ beat: 0, nextTime: 0 }, 0, 4.1, 120, 0);
  assert.equal(none.some(b => b.accent), false);
});

test('accents track the absolute beat index, not the window offset', () => {
  // Starting mid-run at beat 6 with accent 4: beat 8 is the next downbeat.
  const { beats } = pull({ beat: 6, nextTime: 6 }, 6, 2.1, 60, 4);
  assert.deepEqual(beats.map(b => b.beat), [6, 7, 8]);
  assert.deepEqual(beats.filter(b => b.accent).map(b => b.beat), [8]);
});

// The class stays import-safe and inert without an AudioContext (node/tests):
// start() no-ops and reports it, so the app can construct one unconditionally.

test('Metronome is inert without an AudioContext', () => {
  const m = new Metronome({ bpm: 90 });        // getContext -> null under node
  assert.equal(m.start(), false);
  assert.equal(m.running, false);
  assert.equal(m.toggle(), false);
});

test('Metronome clamps and rounds BPM into a sane range', () => {
  const m = new Metronome({ bpm: 60 });
  assert.equal(m.setBpm(1000), 300);
  assert.equal(m.setBpm(5), 20);
  assert.equal(m.setBpm(72.4), 72);
});

test('Metronome runs its scheduler against an injected fake context', () => {
  // Fake audio clock + oscillator spy: exercise start()/_tick without real audio.
  let now = 0, clicks = 0;
  const node = () => ({ frequency: { setValueAtTime() {} }, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, type: '', connect() { return this; }, start() {}, stop() {} });
  const ac = {
    get currentTime() { return now; },
    createOscillator() { clicks++; return node(); },
    createGain() { return node(); },
    destination: {},
  };
  const m = new Metronome({ bpm: 120, getContext: () => ac });
  assert.equal(m.start(), true);
  // start scheduled beat 0 at now+0.08 into the 0.12s window; cursor advanced.
  assert.ok(clicks >= 1, 'at least the first beat was scheduled');
  assert.ok(m._cursor.beat >= 1);
  m.stop();
  assert.equal(m.running, false);
});
