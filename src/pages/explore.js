// ============================================================================
// Explore page — the live board with number entry and the L3 Deep Pack codec
// scenes for the current number. Composition root for index.html.
// ============================================================================
import { mountNav } from '../nav.js';
import { mountBoardShell } from '../boardShell.js';
import { DeepPackView } from '../view/deepPackView.js';
import { ReferenceView } from '../view/referenceView.js';
import { SetValueCommand } from '../state/commands.js';
import { figure, figDigits, figPlaceValue } from '../view/figures.js';
import { INT_COLS, FRAC_COLS, columnLetter } from '../domain/config.js';
import { rodValue } from '../domain/rod.js';

const $ = id => document.getElementById(id);
mountNav('explore');
const shell = mountBoardShell($('boardMount'));

// --- Figures: the live place-value chart + the ten digits plate -------------
// Fig. 1 re-renders on every bead move: each rod's contribution d·10^p on a log
// axis, so the stem height is p + log10(d) — the place sets the decade, the
// digit only nudges within it.
const placesOf = store => {
  const out = [];
  for (let i = INT_COLS - 1; i >= 0; i--) out.push({ label: columnLetter(i), exp: i, digit: rodValue(store.int[i]), frac: false });
  for (let j = 0; j < FRAC_COLS; j++) out.push({ label: columnLetter(j).toLowerCase(), exp: -(j + 1), digit: rodValue(store.frac[j]), frac: true, dp: j === 0 });
  return out;
};
const renderPlace = store => {
  $('figPlace').innerHTML = figure(1,
    'What each rod contributes to the number, on a log scale — live. The place sets the decade; the digit only moves you within it. Hollow marks on the baseline are empty rods; the violet rule is the decimal boundary.',
    figPlaceValue(placesOf(store)));
};
shell.store.subscribe(renderPlace);
$('figDigits').innerHTML = figure(2,
  'The ten digits as bead states. A bead counts when pushed toward the bar: the sky bead carries five, each earth bead one — so a digit is at most one sky move and four earth moves.',
  figDigits());

// Preset buttons live in the board shell's set-number panel.
new ReferenceView({ presetsEl: $('presets') }, { onPreset: v => shell.dispatch(new SetValueCommand(shell.store, v)) }).build();

// Deep Pack reflects the current board number.
const deepPack = new DeepPackView({ lineEl: $('packDigitsLine'), lociEl: $('packLoci'), decBtn: $('radixDec'), hexBtn: $('radixHex') }, 10);
shell.store.subscribe(s => deepPack.update(s));
$('radixDec').addEventListener('click', () => deepPack.setRadix(10));
$('radixHex').addEventListener('click', () => deepPack.setRadix(16));

shell.start();
