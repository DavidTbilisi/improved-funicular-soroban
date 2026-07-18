// ============================================================================
// Codec drills page — the timed recall/typed drills (own session, no board).
// Composition root for drills.html.
// ============================================================================
import { mountNav } from '../nav.js';
import { DRILL_DECKS } from '../drill/decks.js';
import { MODES } from '../drill/drillMode.js';
import { MathRng } from '../drill/rng.js';
import { LocalStorageStatsStore, DrillStatsService } from '../drill/statsStore.js';
import { DrillSession } from '../drill/drillSession.js';
import { automaticityForecast } from '../drill/forecast.js';
import { DrillView } from '../view/drillView.js';
import {
  figure, figDeckBests, figSessions, figFingerTrick, figNineFold, figFingerFacts, figChisanbop,
} from '../view/figures.js';

const $ = id => document.getElementById(id);
mountNav('drills');

const statsService = new DrillStatsService(new LocalStorageStatsStore(window.localStorage));
const session = new DrillSession({
  decks: DRILL_DECKS, modes: MODES, stats: statsService,
  rng: new MathRng(), clock: { now: () => performance.now() },
});
new DrillView({
  decksEl: $('drillDecks'), stageEl: $('drillStage'), floorEl: $('drillFloor'),
  promptEl: $('drillPrompt'), subEl: $('drillSub'),
  typeRow: $('drillTypeRow'), revealRow: $('drillRevealRow'), inputEl: $('drillInput'),
  revealBtn: $('drillRevealBtn'), gotItBtn: $('drillGotIt'), missedBtn: $('drillMissed'),
  feedbackEl: $('drillFeedback'), statsEl: $('drillStats'), bestEl: $('drillBest'),
  stopBtn: $('drillStop'),
}, session, {
  // A missed finger fact redraws its method as the actual plate — the picture
  // IS the correction. Injected here so the view stays figure-agnostic.
  revealFigFor: item => item.fact
    ? (item.fact.kind === 'fold' ? figNineFold(item.fact.n) : figFingerTrick(item.fact.a, item.fact.b))
    : null,
}).build();

// --- Figures: the two method plates + session trend + bests + facts heatmap ---
// Figs 1–2 are static teaching material; the rest persist when a session
// stops, so they refresh on 'stopped'.
$('figFinger').innerHTML = figure(1,
  'The finger method for the 6–9 corner of the times table. Number each hand\'s fingers 6–10 from pinky to thumb (the hands mirror — thumbs meet in the middle) and raise them up to the operand: raised fingers count tens, folded fingers multiply into units. Worked here: 7 × 8.',
  figFingerTrick());
$('figNineFold').innerHTML = figure(2,
  'The nine-fold method for the 9s row. Hold all ten fingers up, numbered 1–10 left to right, and fold the finger you are multiplying 9 by: fingers left of the fold are the tens, fingers right of it the units. Worked here: 9 × 3.',
  figNineFold());
// The third hands-method: the soroban's ± friend rules, off the abacus. A hand
// IS a rod — thumb the 5-bead, four fingers the earth beads — so the direct /
// small-friend / big-friend moves you drill on the board replay as finger
// presses. Static teaching material, like the two above.
$('figChisanbop').innerHTML = figure(3,
  'The friend rules on the hands — chisanbop. A hand is a rod: the thumb is the 5-bead, the four fingers the earth beads, so two hands read a number 0–99 and inked beads are pressed down. The same complement moves drill on the board here as presses: blocked from adding straight, press the thumb (+5) and lift the difference (small friend), or carry a ten to the left hand (big friend) and pay it back. Worked here: 6 + 7.',
  figChisanbop(6, '+', 7));

const deckIds = Object.keys(DRILL_DECKS);
// Default the trend to the most-drilled deck; switch it as decks are started.
let trendDeck = deckIds.reduce((a, b) => statsService.history(b).length > statsService.history(a).length ? b : a, deckIds[0]);
const renderTrend = () => {
  const h = statsService.history(trendDeck);
  const fc = automaticityForecast(h);
  $('figSessions').innerHTML = figure(4,
    `${DRILL_DECKS[trendDeck].label} — share of reps under the pass-floor across the last ${h.length || 0} saved sessions (a session is saved when you stop it). Hover a point for its date, accuracy, and mean time.`,
    figSessions(h)) +
    (fc.message ? `<p class="help drill-forecast">${fc.message}</p>` : '');
};
const renderBests = () => {
  $('figBests').innerHTML = figure(5,
    'Best saved session per deck, in the tier order of the drill discipline (atomics → cells → scenes → seals, then the finger track). A red seal marks a perfect session; an em-dash a deck not yet drilled.',
    figDeckBests(deckIds.map(id => ({ label: DRILL_DECKS[id].label, best: statsService.best(id) }))));
};
const renderFacts = () => {
  $('figFacts').innerHTML = figure(6,
    'The Finger × corner by lifetime recall: each cell is the share of saved reps landed correct and under the floor. Bright cells still lean on the hands — they are dealt twice per round until they darken. Hover a cell for reps, misses, and mean time.',
    figFingerFacts(statsService.facts('fingerTimes')));
};
renderTrend();
renderBests();
renderFacts();
session.subscribe(evt => {
  if (evt.type === 'started') { trendDeck = evt.deckId; renderTrend(); }
  if (evt.type === 'stopped') { renderTrend(); renderBests(); renderFacts(); }
});
