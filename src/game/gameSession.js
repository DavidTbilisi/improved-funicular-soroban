// ============================================================================
// GameSession — the village game's state machine, DOM-free and Observable
// (sibling of TutorialSession, whose solve-detection skeleton it copies: seed
// the shared AbacusStore while disarmed, then watch it — reaching targetScaled
// IS the solve, because the bead engine already rejects illegal moves).
//
// Two kinds of contract:
//   earn    — pick any tier, solve it, get paid (payout × shrine blessing)
//   upgrade — click a building; its resource cost is DEDUCTED UP FRONT
//             (refunded on abandon) and the solve raises the building a level
//             instead of paying sp. Levels are endless; the contract tier
//             escalates with the building, min(top, def.tier - 1 + level).
// Either kind, solved, advances the village exactly ONE day (advanceDay) —
// arithmetic is the game's clock as well as its mint.
//
// Emitted events (payload.type):
//   loaded    { village }
//   challenge { kind, tierId, title, prompt, sub, baseSp, timeFloorMs, cell }
//   solved    { kind, tierId, clean, verdict, elapsedMs, timeFloorMs, faults,
//               payout, parts, yields, day, village, cell, milestone, streak }
//   placed    { cellIdx, buildingId, village }
//   refused   { reason: 'busy'|'locked'|'occupied'|'cost'|'range'|'empty' }
//   abandoned { village }
//   reset     { village }
// ============================================================================
import { Observable } from '../state/observable.js';
import { BUILDINGS, buildingById, GRID_CELLS, FOUNDING_LEVEL } from './buildings.js';
import { CHALLENGE_TIERS, payout, payoutParts } from './challenges.js';
import { canPlace, place, canAfford, spend, refund, advanceDay, shrineBonus, upgradeCost } from './economy.js';

export class GameSession extends Observable {
  constructor({ buildings = BUILDINGS, tiers = CHALLENGE_TIERS, save, rng, store, clock = { now: () => 0 } }) {
    super();
    this.buildings = buildings;
    this.tiers = tiers;
    this.save = save;
    this.rng = rng;
    this.store = store;
    this.clock = clock;
    this.village = save.load();
    this.challenge = null; // { tier, problem, kind, faults, t0, cell?, cost? }
    this.armed = false;    // ignore store notifications while seeding
    store.subscribe(() => this._onStore());
  }

  get active() { return this.challenge !== null; }

  // Announce the loaded village so views paint; call before shell.start().
  start() { this.notify({ type: 'loaded', village: this.village }); }

  startChallenge(tierId) {
    if (this.active) return this._refuse('busy');
    const tier = this.tiers.find(t => t.id === tierId);
    if (!tier) return;
    this._begin(tier, { kind: 'earn', cell: null });
  }

  // Upgrade contract: pay the resource cost now, earn the level by solving.
  startUpgrade(cellIdx) {
    if (this.active) return this._refuse('busy');
    if (!Number.isInteger(cellIdx) || cellIdx < 0 || cellIdx >= GRID_CELLS) return this._refuse('range');
    const cell = this.village.grid[cellIdx];
    if (!cell) return this._refuse('empty');
    const def = buildingById(cell.id);
    const cost = upgradeCost(def, cell.level);
    if (!canAfford(this.village, cost)) return this._refuse('cost');
    spend(this.village, cost);
    this.save.save(this.village);
    const tier = this.tiers[Math.min(this.tiers.length - 1, def.tier - 1 + cell.level)];
    this._begin(tier, { kind: 'upgrade', cell: cellIdx, cost });
  }

  _begin(tier, extra) {
    const problem = tier.gen(this.rng);
    this.challenge = { tier, problem, faults: 0, t0: 0, ...extra };
    this.armed = false;
    this.store.setScaled(problem.startScaled); // notify fires while disarmed
    this.armed = true;
    this.challenge.t0 = this.clock.now();
    this.notify({
      type: 'challenge', kind: extra.kind, tierId: tier.id, title: tier.title,
      prompt: problem.prompt, sub: problem.sub, baseSp: tier.baseSp,
      timeFloorMs: tier.timeFloorMs, cell: extra.cell,
    });
  }

  abandonChallenge() {
    if (!this.active) return;
    const ch = this.challenge;
    this.challenge = null;
    this.armed = false;
    if (ch.kind === 'upgrade') { refund(this.village, ch.cost); this.save.save(this.village); }
    this.notify({ type: 'abandoned', village: this.village });
  }

  // The app reports a fumble (illegal/rejected move or a reset) during the
  // active contract — it spoils the clean bonus, exactly as in practice.
  fault() {
    if (this.active) this.challenge.faults++;
  }

  // Placing costs only resources on hand and never touches the board, so it is
  // allowed mid-contract.
  placeBuilding(buildingId, cellIdx) {
    const def = buildingById(buildingId);
    if (!def) return;
    const chk = canPlace(this.village, def, cellIdx);
    if (!chk.ok) return this._refuse(chk.reason);
    place(this.village, def, cellIdx);
    this.save.save(this.village);
    this.notify({ type: 'placed', cellIdx, buildingId, village: this.village });
  }

  resetSave() {
    this.challenge = null;
    this.armed = false;
    this.village = this.save.reset();
    this.notify({ type: 'reset', village: this.village });
  }

  _onStore() {
    if (!this.armed || !this.challenge) return;
    if (this.store.scaledValue() === this.challenge.problem.targetScaled) this._solve();
  }

  _solve() {
    const ch = this.challenge;
    this.challenge = null;
    this.armed = false;
    const elapsedMs = this.clock.now() - ch.t0;
    const overTime = elapsedMs > ch.tier.timeFloorMs;
    const clean = !overTime && ch.faults === 0;
    const verdict = clean ? 'clean' : (ch.faults > 0 ? 'fumbled' : 'slow');

    const v = this.village;
    let pay = 0, parts = null, milestone = null;
    if (ch.kind === 'earn') {
      const judge = { faults: ch.faults, elapsedMs };
      parts = payoutParts(ch.tier, judge, v.stats.streak);
      pay = payout(ch.tier, judge, shrineBonus(v), v.stats.streak);
      v.sp += pay;
      v.stats.spEarned += pay;
      if (pay > v.stats.bestPayout) v.stats.bestPayout = pay;
    } else {
      const cell = v.grid[ch.cell];
      cell.level++;
      if (cell.id === 'shrine' && cell.level >= FOUNDING_LEVEL && !v.stats.founded) {
        v.stats.founded = true;
        milestone = 'founded';
      }
    }
    v.stats.solves++;
    if (clean) v.stats.clean++;
    // The streak counts consecutive clean solves; the bonus a solve just paid
    // used the streak as it stood BEFORE (see payoutParts), then it moves.
    v.stats.streak = clean ? v.stats.streak + 1 : 0;
    if (v.stats.streak > v.stats.bestStreak) v.stats.bestStreak = v.stats.streak;
    const yields = advanceDay(v); // the day tick: one day per solved contract
    this.save.save(v);
    this.notify({
      type: 'solved', kind: ch.kind, tierId: ch.tier.id, clean, verdict, elapsedMs,
      timeFloorMs: ch.tier.timeFloorMs, faults: ch.faults,
      payout: pay, parts, yields, day: v.day, village: v, cell: ch.cell, milestone,
      streak: v.stats.streak,
    });
  }

  _refuse(reason) { this.notify({ type: 'refused', reason }); }
}
