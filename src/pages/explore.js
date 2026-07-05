// ============================================================================
// Explore page — the live board with number entry and the L3 Deep Pack codec
// scenes for the current number. Composition root for index.html.
// ============================================================================
import { mountNav } from '../nav.js';
import { mountBoardShell } from '../boardShell.js';
import { DeepPackView } from '../view/deepPackView.js';
import { ReferenceView } from '../view/referenceView.js';
import { SetValueCommand } from '../state/commands.js';

const $ = id => document.getElementById(id);
mountNav('explore');
const shell = mountBoardShell($('boardMount'));

// Preset buttons live in the board shell's set-number panel.
new ReferenceView({ presetsEl: $('presets') }, { onPreset: v => shell.dispatch(new SetValueCommand(shell.store, v)) }).build();

// Deep Pack reflects the current board number.
const deepPack = new DeepPackView({ lineEl: $('packDigitsLine'), lociEl: $('packLoci'), decBtn: $('radixDec'), hexBtn: $('radixHex') }, 10);
shell.store.subscribe(s => deepPack.update(s));
$('radixDec').addEventListener('click', () => deepPack.setRadix(10));
$('radixHex').addEventListener('click', () => deepPack.setRadix(16));

shell.start();
