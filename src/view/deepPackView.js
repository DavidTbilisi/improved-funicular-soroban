// ============================================================================
// DeepPackView — renders the L3 deep-pack scenes for the current number. It
// holds a Codec (Strategy) and never branches on radix itself: the radix toggle
// just swaps which Codec is active and re-renders. Adding a base = adding a
// Codec, with no change here (Open/Closed).
// ============================================================================
import { intValOf, fracStrOf } from '../domain/rod.js';
import { cubeEmojis, cubeName } from '../domain/faces.js';
import { sceneStory } from '../domain/codec/scene.js';
import { codecForRadix } from '../domain/codec/codec.js';

export class DeepPackView {
  constructor({ lineEl, lociEl, decBtn, hexBtn }, radix = 10) {
    this.lineEl = lineEl;
    this.lociEl = lociEl;
    this.decBtn = decBtn;
    this.hexBtn = hexBtn;
    this.codec = codecForRadix(radix);
    this.store = null;
    this._syncButtons();
  }

  setRadix(radix) {
    this.codec = codecForRadix(radix);
    this._syncButtons();
    if (this.store) this.update(this.store);
  }

  _syncButtons() {
    const r = this.codec.radix;
    this.decBtn.className = r === 10 ? 'primary' : '';
    this.hexBtn.className = r === 16 ? 'primary' : '';
  }

  update(store) {
    this.store = store;
    const iv = intValOf(store.int), fs = fracStrOf(store.frac);
    const { code, unitCount, unitNoun, fractionIgnored, loci } = this.codec.prepare(iv, fs);

    if (!code) {
      this.lineEl.innerHTML = '';
      this.lociEl.innerHTML = '<div class="pack-empty">zero — set a number to see its deep-pack scenes</div>';
      return;
    }

    const hex = this.codec.radix === 16;
    const inScope = code.length >= 8;
    const plural = unitCount > 1 ? 's' : '';
    const codeLabel = hex ? `0x${code}` : code;
    let note = '';
    if (hex && fractionIgnored) note = ` <span style="color:#8a929e">(fraction ignored in hex mode)</span>`;
    else if (!hex && fs) note = ` <span style="color:#8a929e">(integer + fraction digits; the point rides the flipped pegs, not the pack)</span>`;
    const noun = hex ? 'Hex string' : 'Digit string';
    this.lineEl.innerHTML = `${noun}: <code>${codeLabel}</code> · ${unitCount} ${unitNoun}${plural}${note}`;

    this.lociEl.innerHTML = loci.map((locus, li) => {
      const scenesHTML = locus.scenes.map(scene => {
        const units = scene.parts.map(p => this._unitHTML(p)).join('<span class="pack-arrow">›</span>');
        const digitsLabel = hex ? '0x' + scene.digits : scene.digits;
        return `<div class="pack-scene">${units}</div>
          <div class="pack-story">${scene.partial ? '<em>partial</em> — ' : ''}${sceneStory(scene)} — <em>${digitsLabel}</em></div>`;
      }).join('');
      return `<div class="locus">
          <div class="locus-tag">locus ${li + 1}</div>
          <div class="locus-body">${scenesHTML}</div>
          <div class="seal-chip${inScope ? '' : ' below-scope'}" title="${this.codec.sealExplain(locus)}">
            <span class="s-emoji">${this.codec.sealPercept(locus.seal)}</span>
            <span class="s-label">seal ${this.codec.sealLabel(locus.seal)}${inScope ? '' : '<br>below scope'}</span>
          </div>
        </div>`;
    }).join('');
  }

  _unitHTML(part) {
    if (part.type === 'cell' || part.type === 'hexcell') {
      const c = part.cell;
      const digits = part.type === 'hexcell' ? '0x' + c.hexStr : String(c.nn).padStart(2, '0');
      return `<div class="pack-unit" title="${c.name}">
          <span class="u-emoji">${c.audio.emoji}${vpEmoji(c.visual)}</span>
          <span class="u-digits">${digits}</span>
          <span class="u-name">${c.name}</span>
        </div>`;
    }
    if (part.type === 'action') {
      const a = part.action;
      return `<div class="pack-unit action" title="${part.binder ? 'binder — carries no information in hex mode' : a.name}"${part.binder ? ' style="opacity:0.55"' : ''}>
          <span class="u-emoji">${a.emoji}</span>
          <span class="u-digits">${part.binder ? '·' : a.d}</span>
          <span class="u-name">${a.name}</span>
        </div>`;
    }
    return `<div class="pack-unit" title="${cubeName(part.digit)}">
        <span class="u-emoji">${cubeEmojis(part.digit) || '·'}</span>
        <span class="u-digits">${part.digit}</span>
        <span class="u-name">${cubeName(part.digit)}</span>
      </div>`;
  }
}

function vpEmoji(vp) { return vp.rot ? `<span class="rot90">${vp.emoji}</span>` : vp.emoji; }
