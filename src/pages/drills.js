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
import { DrillView } from '../view/drillView.js';
import { figure, figDeckBests, figSessions } from '../view/figures.js';

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
}, session).build();

// --- Figures: session trend for the deck in focus + best session per deck ---
// Stats persist when a session stops, so both charts refresh on 'stopped'.
const deckIds = Object.keys(DRILL_DECKS);
// Default the trend to the most-drilled deck; switch it as decks are started.
let trendDeck = deckIds.reduce((a, b) => statsService.history(b).length > statsService.history(a).length ? b : a, deckIds[0]);
const renderTrend = () => {
  const h = statsService.history(trendDeck);
  $('figSessions').innerHTML = figure(1,
    `${DRILL_DECKS[trendDeck].label} — share of reps under the pass-floor across the last ${h.length || 0} saved sessions (a session is saved when you stop it). Hover a point for its date, accuracy, and mean time.`,
    figSessions(h));
};
const renderBests = () => {
  $('figBests').innerHTML = figure(2,
    'Best saved session per deck, in the tier order of the drill discipline (atomics → cells → scenes → seals). A red seal marks a perfect session; an em-dash a deck not yet drilled.',
    figDeckBests(deckIds.map(id => ({ label: DRILL_DECKS[id].label, best: statsService.best(id) }))));
};
renderTrend();
renderBests();
session.subscribe(evt => {
  if (evt.type === 'started') { trendDeck = evt.deckId; renderTrend(); }
  if (evt.type === 'stopped') { renderTrend(); renderBests(); }
});
