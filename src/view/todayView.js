// ============================================================================
// TodayView — the front-door card: streak header, today's plan with tick boxes,
// the mental line, the fumble pairs to drill, and the save transfer controls.
//
// Like every other view here it OWNS NO STATE: it renders a { profile, plan }
// snapshot and reports intent through injected callbacks (onToggle, onExport,
// onImport). The page decides what any of that means.
// ============================================================================
import { RES_EMOJI } from '../game/buildings.js';

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const KIND_EMOJI = { practice: '🧮', drill: '🎴', trainer: '✖️', anzan: '⚡', yomiage: '👂', exam: '📜', vault: '🔐', game: '🏮' };

export class TodayView {
  constructor(els, { onToggle, onExport, onImport } = {}) {
    this.els = els;
    this.onToggle = onToggle || (() => {});
    this.onExport = onExport || (() => {});
    this.onImport = onImport || (() => {});
    this.plan = null;
  }

  build() {
    this.els.planEl.addEventListener('click', e => {
      const row = e.target.closest('[data-task]');
      if (!row) return;
      // A click on the link itself navigates; the rest of the row ticks.
      if (e.target.closest('a')) return;
      this.onToggle(row.dataset.task);
    });
    this.els.exportBtn.addEventListener('click', () => this.onExport());
    this.els.importBtn.addEventListener('click', () => {
      const text = this.els.importEl.value.trim();
      if (text) this.onImport(text);
    });
    this.els.importFile.addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      file.text().then(t => this.onImport(t)).catch(() => this.status('Could not read that file.', 'bad'));
      e.target.value = '';
    });
    return this;
  }

  status(msg, kind = '') {
    this.els.statusEl.textContent = msg;
    this.els.statusEl.className = `today-status${kind ? ` ${kind}` : ''}`;
  }

  render({ profile, plan, done, retention = null }) {
    this.plan = plan;
    this._renderHead(profile, plan, done);
    this._renderPlan(plan, done);
    this._renderNotes(profile, retention);
  }

  _renderHead(p, plan, done) {
    const s = p.streak;
    const flame = s.current > 0 ? '🔥' : '·';
    const streakText = s.current > 0
      ? `${s.current}-day streak${s.activeToday ? '' : ' · not yet fed today'}`
      : (s.total ? 'streak broken — today restarts it' : 'no streak yet');
    const rank = p.village && p.village.rank;
    this.els.headEl.innerHTML =
      `<span class="td-streak${s.activeToday ? ' fed' : ''}"><span class="td-flame">${flame}</span>${esc(streakText)}</span>` +
      (rank ? `<span class="td-rank" title="Village rank — total building levels plus sp minted">🏘 ${esc(rank.title)}` +
        `<span class="td-rank-bar"><i style="width:${Math.round(100 * rank.cur / rank.next)}%"></i></span></span>` : '') +
      (p.village ? `<span class="td-sp">${p.village.sp} sp</span>` : '') +
      // The kyu grade is the app's one external rank, so it belongs on the spine
      // beside the invented one. Silent until a paper has actually been passed.
      (p.exam && p.exam.highest
        ? `<span class="td-kyu" title="Highest kyu grade passed">📜 ${esc(p.exam.highest.name)}</span>` : '') +
      `<span class="td-done">${done}/${plan.tasks.length} done today</span>`;
  }

  _renderPlan(plan, done) {
    this.els.planMsgEl.textContent = plan.message;
    this.els.planEl.innerHTML = plan.tasks.map((t, i) => {
      const isDone = t.done;
      return `<li class="today-task${isDone ? ' done' : ''}" data-task="${esc(t.id)}" title="Click to tick off">` +
        `<span class="tt-box" role="checkbox" aria-checked="${isDone}">${isDone ? '✓' : ''}</span>` +
        `<span class="tt-n">${i + 1}</span>` +
        `<span class="tt-body">` +
          `<a class="tt-title" href="${esc(t.href)}">${KIND_EMOJI[t.kind] || '•'} ${esc(t.title)}</a>` +
          `<span class="tt-why">${esc(t.why)}</span>` +
        `</span>` +
        `<span class="tt-mins">~${t.minutes} min</span>` +
      `</li>`;
    }).join('') || '<li class="today-task empty">Nothing queued — open any page and practise.</li>';
    this.els.planTotalEl.textContent = plan.tasks.length
      ? `${done}/${plan.tasks.length} · about ${plan.totalMin} min in total`
      : '';
  }

  _renderNotes(p, retention) {
    // What is fading, before anything else in the notes: it is the one line that
    // says what today's plan is reacting to.
    if (this.els.retentionEl) {
      const r = retention;
      this.els.retentionEl.innerHTML = r && r.total
        ? `<span class="td-note-k">Retention</span>` +
          `<span class="td-note-v"><strong>${r.mean}%</strong> held across ${r.total} track${r.total === 1 ? '' : 's'}` +
          (r.due
            ? ` — <em>${r.due} due</em>, weakest ${esc(r.worst.title)} at ${Math.round(r.worst.retention * 100)}%`
            : ' — nothing due; all of it is holding') +
          `</span>`
        : '';
    }
    const pr = p.mental.prognosis;
    this.els.mentalEl.innerHTML =
      `<span class="td-note-k">Mental track</span>` +
      `<span class="td-note-v"><strong>${esc(p.mental.stageName)}</strong> — ${esc(pr.message)}</span>`;

    const top = p.faults.top;
    this.els.faultsEl.innerHTML =
      `<span class="td-note-k">Fumble pairs</span>` +
      `<span class="td-note-v">${top.length
        ? top.map(r => `<code>${esc(r.label.split(' · ')[0])}</code> <em>×${r.count}</em>`).join(' · ')
        : 'None recorded — no rejected moves yet.'}</span>`;

    const v = p.village;
    this.els.villageEl.innerHTML = v
      ? `<span class="td-note-k">Village</span>` +
        `<span class="td-note-v">${esc(v.goal ? `${v.goal.emoji} ${v.goal.label}` : '🎌 Ladder complete')} — day ${v.day} · ` +
        Object.entries(v.village.res).map(([k, n]) => `${n} ${RES_EMOJI[k] || k}`).join(' · ') +
        (v.hint ? `<br><span class="td-hint">${esc(v.hint.msg)}</span>` : '') +
        `</span>`
      : '';
  }
}
