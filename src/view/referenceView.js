// ============================================================================
// ReferenceView — builds the static reference sections (A–Z pegs, cube faces,
// hex pegs) and the preset buttons. Built once; presets emit an onPreset intent.
// ============================================================================
import { ALPHABET_PEGS, CUBE_FACES, AUDIO_PEGS, VISUAL_PEGS, HEX_SYMS } from '../domain/pegs.js';
import { cubeFacesForDigit, cubeEmojis, cubeName } from '../domain/faces.js';
import { INT_COLS, FRAC_COLS, INT_PLACES, FRAC_PLACES } from '../domain/config.js';

const PRESETS = ['7', '42', '15.98', '3.14', '0.5', '1000.25', '90909', '8.0625', '4217583906', '3735928559'];

export class ReferenceView {
  constructor({ pegGridEl, cubeGridEl, hexPegGridEl, presetsEl }, { onPreset }) {
    this.pegGridEl = pegGridEl;
    this.cubeGridEl = cubeGridEl;
    this.hexPegGridEl = hexPegGridEl;
    this.presetsEl = presetsEl;
    this.onPreset = onPreset;
  }

  build() {
    this._buildPegGrid();
    this._buildCubeGrid();
    this._buildHexPegGrid();
    this._buildPresets();
  }

  _buildPegGrid() {
    this.pegGridEl.innerHTML = Object.keys(ALPHABET_PEGS).map((L, i) => {
      const p = ALPHABET_PEGS[L];
      const role = i < INT_COLS
        ? (INT_PLACES[i] || '') + (i < FRAC_COLS ? ' · flip=' + FRAC_PLACES[i] : '')
        : '—';
      return `<div class="peg-chip"><span class="letter">${L}</span><span class="emoji">${p.emoji}</span><span class="pword">${p.word}</span><span class="ppl">${role}</span></div>`;
    }).join('');
  }

  _buildCubeGrid() {
    let html = '';
    for (let d = 0; d <= 9; d++) {
      const faces = cubeFacesForDigit(d);
      const emojis = faces.length ? cubeEmojis(d) : 'bare';
      const swatches = faces.map(f => `<i style="background:${f.color}"></i>`).join('');
      html += `<div class="cube-chip">
          <span class="digit">${d}</span>
          <span class="faces${faces.length ? '' : ' bare'}">${emojis}</span>
          <span class="cname">${cubeName(d)}</span>
          <span class="swatch">${swatches}</span>
        </div>`;
    }
    html += `<div class="cube-chip" style="opacity:0.45">
        <span class="digit">—</span>
        <span class="faces">😇</span>
        <span class="cname">Angel — retired, reserved icon</span>
        <span class="swatch"><i style="background:${CUBE_FACES[6].color}"></i></span>
      </div>`;
    this.cubeGridEl.innerHTML = html;
  }

  _buildHexPegGrid() {
    let html = '';
    for (let i = 10; i <= 15; i++) {
      const p = AUDIO_PEGS[i];
      html += `<div class="peg-chip" title="${p.note}"><span class="letter">${HEX_SYMS[i]}</span><span class="emoji">${p.emoji}</span><span class="pword">${p.word}</span><span class="ppl">audio · NATO</span></div>`;
    }
    for (let i = 10; i <= 15; i++) {
      const p = VISUAL_PEGS[i];
      html += `<div class="peg-chip" title="${p.note}"><span class="letter">${HEX_SYMS[i]}</span><span class="emoji">${p.emoji}</span><span class="pword">${p.word}</span><span class="ppl">visual · letterform</span></div>`;
    }
    this.hexPegGridEl.innerHTML = html;
  }

  _buildPresets() {
    this.presetsEl.innerHTML = PRESETS.map(p => `<button data-v="${p}">${p}</button>`).join('');
    this.presetsEl.querySelectorAll('button').forEach(b =>
      b.addEventListener('click', () => this.onPreset(b.dataset.v)));
  }
}
