// ============================================================================
// Scene assembly + narration. A scene is a small grammar of parts:
//   [cell][action][cell] (5 digits), with partial-tail grammars for 1-4.
// Hex scenes are [byte-cell][contact binder][byte-cell] (2 bytes).
// sceneStory() narrates any scene back to prose. All pure/testable.
// ============================================================================
import { matrixCell, hexCell, packAction, actionParticiple } from './cell.js';
import { cubeName, cubeEmojis } from '../faces.js';
import { HEX_SYMS, VISUAL_PEGS } from '../pegs.js';

// Chunk a digit string into deep-pack scenes, 5 digits per full scene.
// Partial tail grammar: 4 = [cell][action][face], 3 = [cell][action],
// 2 = [cell], 1 = [face].
export function deepPackScenes(digitStr) {
  const scenes = [];
  for (let i = 0; i < digitStr.length; i += 5) {
    const chunk = digitStr.slice(i, i + 5);
    const parts = [];
    if (chunk.length >= 2) parts.push({ type: 'cell', cell: matrixCell(+chunk.slice(0, 2)) });
    else parts.push({ type: 'face', digit: +chunk[0] });
    if (chunk.length >= 3) parts.push({ type: 'action', action: packAction(+chunk[2]) });
    if (chunk.length === 4) parts.push({ type: 'face', digit: +chunk[3] });
    if (chunk.length === 5) parts.push({ type: 'cell', cell: matrixCell(+chunk.slice(3, 5)) });
    scenes.push({ digits: chunk, parts, partial: chunk.length < 5 });
  }
  return scenes;
}

export function padHex(hexStr) { return hexStr.length % 2 ? '0' + hexStr : hexStr; }

// Hex scene = [byte-cell][contact binder][byte-cell] = 2 bytes.
export function deepPackScenesHex(hexStr) {
  const s = padHex(hexStr.toUpperCase());
  const bytes = [];
  for (let i = 0; i < s.length; i += 2) bytes.push(hexCell(HEX_SYMS.indexOf(s[i]), HEX_SYMS.indexOf(s[i + 1])));
  const scenes = [];
  for (let i = 0; i < bytes.length; i += 2) {
    const pair = bytes.slice(i, i + 2);
    const parts = pair.length === 2
      ? [{ type: 'hexcell', cell: pair[0] }, { type: 'action', action: packAction(0), binder: true }, { type: 'hexcell', cell: pair[1] }]
      : [{ type: 'hexcell', cell: pair[0] }];
    scenes.push({ digits: pair.map(b => b.hexStr).join(''), parts, partial: pair.length < 2 });
  }
  return scenes;
}

// Narrate a scene to prose, e.g. "the Sun-Swan (12) is splattered (2) into …".
export function sceneStory(scene) {
  const p = scene.parts;
  const label = x => x.type === 'cell' ? `the ${x.cell.name} (${String(x.cell.nn).padStart(2, '0')})`
    : x.type === 'hexcell' ? `the ${x.cell.name} (0x${x.cell.hexStr})`
    : `${cubeName(x.digit)} (${x.digit})`;
  if (p.length === 3 && p[1].type === 'action') {
    if (p[1].binder) return `${label(p[0])} rests against (·) ${label(p[2])}`;
    const d = p[1].action.d;
    return `${label(p[0])} ${actionParticiple(d)} (${d})${d === 0 ? '' : ' into'} ${label(p[2])}`;
  }
  if (p.length === 2) return `${label(p[0])} ${actionParticiple(p[1].action.d)} (${p[1].action.d})`;
  return label(p[0]);
}

// Emoji used to render a hex seal value: 0-9 use cube faces, A-F the letterforms.
export function sealPerceptHex(v) {
  return v <= 9 ? cubeEmojis(v) : VISUAL_PEGS[v].emoji;
}
