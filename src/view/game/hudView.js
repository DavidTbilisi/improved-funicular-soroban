// ============================================================================
// GameHudView — the DOM half of the village game: resource chips, build
// palette, contract board, and the active-contract stage. Observes the
// GameSession and forwards intent through injected callbacks; never mutates
// game state directly (same contract as every other view).
// ============================================================================
import { BUILDINGS, buildingById, RES_EMOJI } from '../../game/buildings.js';
import { CHALLENGE_TIERS, tierById, payout } from '../../game/challenges.js';
import { isUnlocked, canAfford, shrineBonus, upgradeCost, festivalBonus, FESTIVAL_COST } from '../../game/economy.js';
import { nextGoal } from '../../game/goals.js';
import { nextHint, costText } from '../../game/advisor.js';

const REFUSED = {
  busy: 'Finish or abandon the current contract first.',
  locked: 'That building isn’t unlocked yet.',
  occupied: 'That plot is already taken.',
  cost: 'Not enough on hand for that.',
  range: 'That plot is outside the village.',
  empty: 'Nothing there to upgrade.',
  festival: 'A festival is already underway.',
};

export class GameHudView {
  constructor(els, session, { onPickBuilding, onTakeContract, isChaining = () => false }) {
    this.els = els; // { resEl, paletteEl, contractsEl, noticeEl, stageEl, promptEl, subEl, payEl, feedbackEl, abandonBtn, resetBtn, goalEl?, hintEl?, festivalBtn? }
    this.session = session;
    this.onPickBuilding = onPickBuilding;
    this.onTakeContract = onTakeContract;
    this.isChaining = isChaining;
    this.placementId = null;
  }

  build() {
    const { els } = this;
    // Build palette — one button per building, wired once.
    this.buildBtns = new Map();
    for (const def of BUILDINGS) {
      const btn = document.createElement('button');
      btn.className = 'game-build';
      btn.innerHTML = `<span class="b-emoji">${def.emoji}</span><span class="b-name">${def.name}</span><span class="b-cost">${costText(def.cost)}</span>`;
      btn.addEventListener('click', () => this.onPickBuilding(def.id));
      els.paletteEl.appendChild(btn);
      this.buildBtns.set(def.id, btn);
    }
    // Contract board — the whole row is the Take button.
    this.takeBtns = new Map();
    for (const tier of CHALLENGE_TIERS) {
      const btn = document.createElement('button');
      btn.className = 'game-contract';
      btn.title = `${tier.math} — take this contract`;
      btn.innerHTML = `<span class="c-title">${tier.title}</span><span class="c-math">${tier.math}</span><span class="c-pay" id="pay-${tier.id}"></span>`;
      btn.addEventListener('click', () => this.onTakeContract(tier.id));
      els.contractsEl.appendChild(btn);
      this.takeBtns.set(tier.id, btn);
    }
    this.session.subscribe(evt => this._onEvent(evt));
    this._paintAll();
    return this;
  }

  // The page owns the armed-placement state and fans it out here.
  setPlacement(id) {
    this.placementId = id;
    this._paintPalette();
    this._notice(id ? `Placing ${buildingById(id).name} — click an empty plot (click the button again to cancel).` : '');
  }

  _v() { return this.session.village; }
  _notice(html) { this.els.noticeEl.innerHTML = html; }

  _paintAll() {
    this._paintRes();
    this._paintPalette();
    this._paintContracts();
    this._paintGoal();
    this._paintHint();
    this._paintFestival();
  }

  // The idle strip's "do this next" line, re-derived from the live village.
  _paintHint() {
    if (!this.els.hintEl) return;
    this.els.hintEl.textContent = nextHint(this._v()).msg;
  }

  _paintRes() {
    const v = this._v();
    const chip = (label, val, cls = '') => `<span class="game-chip ${cls}"><span>${label}</span><b>${val}</b></span>`;
    this.els.resEl.innerHTML =
      chip(RES_EMOJI.sp, `${v.sp} sp`, 'sp') +
      chip(RES_EMOJI.food, v.res.food) +
      chip(RES_EMOJI.wood, v.res.wood) +
      chip(RES_EMOJI.coin, v.res.coin) +
      chip('📅', `day ${v.day}`) +
      (v.stats.streak >= 2 ? chip('🔥', `×${v.stats.streak}`, 'streak') : '') +
      (v.festival > 0 ? chip('🏮', `${v.festival} left`, 'festival') : '') +
      (v.stats.founded ? chip('⛩️', 'founded', 'founded') : '');
  }

  _paintFestival() {
    const btn = this.els.festivalBtn;
    if (!btn) return;
    const v = this._v();
    btn.disabled = v.festival > 0 || !canAfford(v, FESTIVAL_COST);
    btn.title = v.festival > 0
      ? `The festival burns for ${v.festival} more solve${v.festival > 1 ? 's' : ''}.`
      : 'Feast the village: +50% sp on every contract payout for the next 10 solves.';
  }

  _paintGoal() {
    if (!this.els.goalEl) return;
    const g = nextGoal(this._v());
    this.els.goalEl.innerHTML = g
      ? `⭐ next goal: <b>${g.emoji} ${g.label}</b>`
      : '🏅 every goal met — the village thrives';
  }

  _paintPalette() {
    const v = this._v();
    for (const def of BUILDINGS) {
      const btn = this.buildBtns.get(def.id);
      const unlocked = isUnlocked(v, def);
      btn.classList.toggle('locked', !unlocked);
      btn.classList.toggle('armed', this.placementId === def.id);
      btn.disabled = !unlocked || !canAfford(v, def.cost);
      btn.title = `${def.desc} Yields per day: ${costText(def.yield) || '—'}.` +
        (unlocked ? '' : ` Unlocks after your first ${buildingById(def.unlock.building).name.toLowerCase()}.`);
    }
  }

  _paintContracts() {
    const busy = this.session.active;
    const v = this._v();
    const bonus = shrineBonus(v) + festivalBonus(v);
    for (const tier of CHALLENGE_TIERS) {
      this.takeBtns.get(tier.id).disabled = busy;
      const best = payout(tier, { faults: 0, elapsedMs: 0 }, bonus, v.stats.streak);
      document.getElementById(`pay-${tier.id}`).textContent = `${tier.baseSp}–${best} sp`;
    }
  }

  _onEvent(evt) {
    const { els } = this;
    switch (evt.type) {
      case 'loaded':
      case 'placed':
        this._paintAll();
        if (evt.type === 'placed') this._notice('');
        break;
      case 'challenge': {
        els.stageEl.classList.add('on');
        els.promptEl.innerHTML = evt.prompt;
        els.subEl.textContent = evt.sub;
        els.feedbackEl.innerHTML = '';
        els.abandonBtn.hidden = false;
        this._notice('');
        if (evt.kind === 'upgrade') {
          const cell = this._v().grid[evt.cell];
          const def = buildingById(cell.id);
          els.payEl.innerHTML = `solve to raise the ${def.name} ${def.emoji} to level ${cell.level + 1} · cost held: ${costText(upgradeCost(def, cell.level))}`;
        } else {
          const best = payout({ baseSp: evt.baseSp, timeFloorMs: evt.timeFloorMs }, { faults: 0, elapsedMs: 0 }, shrineBonus(this._v()) + festivalBonus(this._v()), this._v().stats.streak);
          els.payEl.innerHTML = `worth up to <b>${best} sp</b> — no fumbles for the clean bonus, under ${Math.round(evt.timeFloorMs / 1000)}s for the speed bonus`;
        }
        this._paintContracts();
        break;
      }
      case 'solved': {
        const secs = (evt.elapsedMs / 1000).toFixed(1);
        const tag = evt.verdict === 'clean' ? `<span class="ok">✓ clean</span>`
          : evt.verdict === 'slow' ? `<span class="slow">✓ solved, over the floor</span>`
          : `<span class="bad">✓ solved, ${evt.faults} fumble${evt.faults > 1 ? 's' : ''}</span>`;
        const p = evt.parts;
        const what = evt.kind === 'earn'
          ? `+<b>${evt.payout} sp</b> <span class="detail">(${p.base} base${p.cleanBonus ? ` + ${p.cleanBonus} clean` : ''}${p.fastBonus ? ` + ${p.fastBonus} fast` : ''}${p.streakBonus ? ` + ${p.streakBonus} streak` : ''})</span>`
          : `${buildingById(this._v().grid[evt.cell].id).emoji} now level ${this._v().grid[evt.cell].level}`;
        const y = Object.entries(evt.yields).filter(([, n]) => n)
          .map(([k, n]) => `+${n} ${RES_EMOJI[k]}`).join(' ');
        const next = evt.kind === 'earn' && this.isChaining()
          ? `<span class="detail">next ${tierById(evt.tierId)?.title || 'contract'} coming up…</span>` : '';
        els.feedbackEl.innerHTML = [
          `${tag} in ${secs}s — ${what}`,
          `<span class="detail">day ${evt.day}${y ? `: yields ${y}` : ''}</span>`,
          evt.streak >= 2 ? `<span class="streak">🔥 ${evt.streak} clean in a row</span>` : '',
          evt.milestone === 'founded' ? '<span class="ok">⛩️ The shrine is complete — the village is founded!</span>' : '',
          next,
        ].filter(Boolean).join('<span class="sep"> · </span>');
        els.abandonBtn.hidden = true;
        els.payEl.innerHTML = '';
        this._paintAll();
        break;
      }
      case 'festival':
        this._notice('🏮 The festival is lit — +50% sp on every payout for the next 10 solves!');
        this._paintAll();
        break;
      case 'refused':
        this._notice(`<span class="bad">${REFUSED[evt.reason] || evt.reason}</span>`);
        break;
      case 'abandoned':
        els.stageEl.classList.remove('on');
        this._notice('Contract abandoned — any held cost was refunded.');
        this._paintAll();
        break;
      case 'reset':
        els.stageEl.classList.remove('on');
        this._notice('A fresh village.');
        this._paintAll();
        break;
    }
  }
}
