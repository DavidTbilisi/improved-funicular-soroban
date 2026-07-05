// ============================================================================
// Reference page — the static tables (cube faces, hex pegs, A–Z food pegs).
// Composition root for reference.html.
// ============================================================================
import { mountNav } from '../nav.js';
import { ReferenceView } from '../view/referenceView.js';

const $ = id => document.getElementById(id);
mountNav('reference');
new ReferenceView({ pegGridEl: $('pegGrid'), cubeGridEl: $('cubeGrid'), hexPegGridEl: $('hexPegGrid') }, { onPreset: () => {} }).build();
