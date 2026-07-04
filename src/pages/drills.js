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
