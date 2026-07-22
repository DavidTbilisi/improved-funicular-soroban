// ============================================================================
// VoiceService — the caller's voice, via the Web Speech API. A browser-only
// view concern (it touches window.speechSynthesis), so it lives here rather
// than in the DOM-free core, exactly like SoundService.
//
// ITS ONE PROMISE IS THAT `done` FIRES EXACTLY ONCE, and keeping that promise
// is the entire reason this class exists. Browser speech is not dependable:
//   • with no voice installed (a bare Linux box, most CI containers) `speak()`
//     resolves nothing and `onend` never comes;
//   • Chrome drops `onend` when the tab loses focus mid-utterance;
//   • `cancel()` fires `onend` for the utterance it just killed.
// A dictation trainer that waits forever on a missing event is broken, and one
// that advances twice loses a number. So every utterance RACES its own `onend`
// against an estimated duration, whichever lands first wins, and a generation
// counter makes anything from a cancelled utterance a no-op.
//
// With no speech engine at all it degrades to SILENT MODE: nothing is said, the
// timings are the estimates, and the page turns its captions on and says why —
// a soundless caller is still a usable exercise, an invisible frozen one is not.
// ============================================================================
import { estimateMs } from '../yomiage/words.js';

// Slack over the estimate before the backstop gives up on `onend`. Generous:
// cutting a caller off loses the term, waiting an extra beat costs nothing.
const BACKSTOP_SLACK_MS = 1800;

export class VoiceService {
  constructor({ synth, rate = 1, pitch = 1, lang = 'en-US', enabled = true } = {}) {
    this.synth = synth !== undefined
      ? synth
      : (typeof window !== 'undefined' && window.speechSynthesis) || null;
    this.rate = rate;
    this.pitch = pitch;
    this.lang = lang;
    this.enabled = enabled;
    this.gen = 0;          // bumped by cancel(); stale callbacks check it
    this._timer = null;
  }

  // Whether anything will actually be HEARD — which is not the same as whether
  // the API exists. A headless browser, a bare Linux box and most CI containers
  // all have `window.speechSynthesis` and no voice behind it: speak() then
  // resolves nothing at all. So availability is "there is a voice", and because
  // Chrome loads the list asynchronously, a page can ask to be told when that
  // changes rather than deciding once at load and being wrong.
  get available() { return !!(this.synth && this.enabled && this.voiceCount > 0); }

  get voiceCount() {
    try { return this.synth && this.synth.getVoices ? this.synth.getVoices().length : 0; }
    catch { return 0; }
  }

  onVoicesReady(fn) {
    if (!this.synth || !this.synth.addEventListener) return;
    try { this.synth.addEventListener('voiceschanged', () => fn(this.available)); } catch { /* ignore */ }
  }

  setRate(r) { this.rate = Math.max(0.5, Math.min(2, Number(r) || 1)); return this.rate; }
  setEnabled(on) { this.enabled = !!on; if (!this.enabled) this.cancel(); }

  // Prefer a voice in our language; fall back to whatever the engine defaults
  // to. Voices load asynchronously in Chrome, so this is asked every time
  // rather than cached at construction (when the list is usually empty).
  _voice() {
    try {
      const all = this.synth.getVoices ? this.synth.getVoices() : [];
      const want = this.lang.toLowerCase().slice(0, 2);
      return all.find(v => v.lang && v.lang.toLowerCase().startsWith(want)) || null;
    } catch { return null; }
  }

  /**
   * Say `text`, then call `done` — once, whatever happens.
   * @returns a cancel function for this utterance alone.
   */
  speak(text, done = () => {}) {
    const gen = this.gen;
    let fired = false;
    const finish = () => {
      if (fired || gen !== this.gen) return;
      fired = true;
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
      done();
    };

    const est = estimateMs(text, this.rate);
    if (!this.available) {                     // silent mode: keep the pacing
      this._timer = setTimeout(finish, est);
      return finish;
    }

    try {
      const u = new SpeechSynthesisUtterance(String(text));
      u.rate = this.rate;
      u.pitch = this.pitch;
      u.lang = this.lang;
      const v = this._voice();
      if (v) u.voice = v;
      u.onend = finish;
      u.onerror = finish;
      // The backstop. It is not a fallback for slow speech — it is the only
      // thing that runs when the engine has no voice to speak with.
      this._timer = setTimeout(finish, est + BACKSTOP_SLACK_MS);
      this.synth.speak(u);
    } catch {
      this._timer = setTimeout(finish, est);
    }
    return finish;
  }

  // Silence the queue and invalidate every callback still outstanding, so the
  // `onend` that cancel() itself provokes cannot advance an abandoned round.
  cancel() {
    this.gen++;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    try { if (this.synth && this.synth.cancel) this.synth.cancel(); } catch { /* ignore */ }
  }
}
