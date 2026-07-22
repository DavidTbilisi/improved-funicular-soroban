// ============================================================================
// ExamView — the paper, the clock, and the mark sheet.
//
// It renders what the session tells it and nothing else. In particular it has
// no idea whether an answer was right: the session does not say until the paper
// is down, and a view that could tell would be a view that eventually did.
//
// The one thing it owns outright is the CLOCK'S manner. It goes shu under a
// minute and pulses under ten seconds, because a section clock that only ever
// looks the same is a clock nobody reads until it has already run out — and it
// is a wall, not a suggestion.
// ============================================================================

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const group = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const signed = n => (n < 0 ? `− ${group(Math.abs(n))}` : `+ ${group(n)}`);

export function clockText(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// A question as the paper prints it. Mitori is a COLUMN — right-aligned, one
// term per line, signs in the margin — because that is the thing being read,
// and reformatting it as "12 + 34 − 5" would be teaching a different exercise.
export function questionHTML(q) {
  if (!q) return '';
  // 暗算 is the same column as 見取算 — it is printed the same because it IS the
  // same question; what differs is that the board is faded while it runs.
  if (q.kind === 'mitori' || q.kind === 'anzan') {
    return `<ol class="ex-col">${q.terms.map((t, i) =>
      `<li><span class="ex-sign">${i === 0 ? '' : t < 0 ? '−' : '+'}</span><span class="ex-term">${group(Math.abs(t))}</span></li>`).join('')}</ol>`;
  }
  if (q.kind === 'kake') return `<div class="ex-sum">${group(q.a)} <span class="ex-op">×</span> ${group(q.b)}</div>`;
  if (q.kind === 'wari') return `<div class="ex-sum">${group(q.a)} <span class="ex-op">÷</span> ${group(q.b)}</div>`;
  if (q.kind === 'kaihei') return `<div class="ex-sum"><span class="ex-op">√</span> ${group(q.a)}</div>`;
  return '';
}

export class ExamView {
  constructor(els, session, { onStart, onSubmit, onSkip, onAbandon } = {}) {
    this.els = els;
    this.session = session;
    this.on = { onStart, onSubmit, onSkip, onAbandon };
    this.sections = [];
  }

  build() {
    const E = this.els;
    E.gradesEl.addEventListener('click', e => {
      const btn = e.target.closest('button[data-id]');
      if (btn) this.on.onStart(btn.dataset.id);
    });
    E.submitBtn.addEventListener('click', () => this.on.onSubmit());
    E.skipBtn.addEventListener('click', () => this.on.onSkip());
    E.abandonBtn.addEventListener('click', () => this.on.onAbandon());
    this.session.subscribe(e => this.onEvent(e));
    return this;
  }

  // --- The picker ------------------------------------------------------------
  renderGrades(rows, nextId) {
    this.els.gradesEl.innerHTML = rows.map(r =>
      `<button data-id="${esc(r.id)}" class="${r.passed ? 'passed' : ''}${r.id === nextId ? ' next' : ''}"` +
      ` title="${esc(r.desc)}">` +
      `<b>${esc(r.name)}</b>` +
      `<span class="ex-best">${r.passed ? '✓ held' : r.best != null ? `best ${r.best}` : '—'}</span>` +
      `</button>`).join('');
  }

  // --- Sitting the paper -----------------------------------------------------
  onEvent(e) {
    const E = this.els;
    if (e.type === 'started') {
      this.sections = e.sections;
      E.stageEl.hidden = false;
      E.sheetEl.hidden = true;
      E.paperEl.hidden = false;
      document.body.classList.add('ex-sitting');
      E.titleEl.textContent = `${e.name} — ${e.questions} questions, ${Math.round(e.seconds / 60)} minutes`;
      E.expiredEl.hidden = true;
      E.sectionEl.hidden = false;
      E.descEl.hidden = false;
      E.abandonBtn.hidden = false;
      E.stageEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    if (e.type === 'section') {
      E.sectionEl.innerHTML = this.sections.map((s, i) =>
        `<span class="${i === e.si ? 'on' : i < e.si ? 'done' : ''}">${esc(s.title.split(' · ')[0])}</span>`).join('');
      E.descEl.textContent = `${e.title.split(' · ')[1] || e.title} — ${e.desc}`;
      E.expiredEl.hidden = true;
      // The mental section says so where the learner is looking, because the
      // board going quiet is otherwise indistinguishable from the board breaking.
      E.stageEl.classList.toggle('ex-mental', e.kind === 'anzan');
      if (E.mentalEl) {
        E.mentalEl.hidden = e.kind !== 'anzan';
        E.mentalEl.textContent = e.kind === 'anzan'
          ? '暗算 — the board is faded out. The rods are still there and your keys still move them; you just cannot read them.'
          : '';
      }
    }
    if (e.type === 'question') {
      E.counterEl.textContent = `${e.qi + 1} / ${e.count}`;
      E.questionEl.innerHTML = questionHTML(e.question);
      this.setClock(e.remainingMs);
    }
    if (e.type === 'tick') this.setClock(e.remainingMs);
    if (e.type === 'expired') {
      E.expiredEl.hidden = false;
      E.expiredEl.textContent = e.unanswered
        ? `Time — ${e.unanswered} question${e.unanswered === 1 ? '' : 's'} left unanswered.`
        : 'Time.';
    }
    if (e.type === 'finished') this.renderSheet(e.report);
    if (e.type === 'abandoned') this.close();
  }

  setClock(ms) {
    const E = this.els;
    E.clockEl.textContent = clockText(ms);
    E.clockEl.classList.toggle('low', ms <= 60_000);
    E.clockEl.classList.toggle('out', ms <= 10_000);
  }

  // The board's current value, shown as the answer about to be handed in — the
  // abacus IS the answer sheet here, so it needs to be visible as one.
  setAnswer(text) { this.els.answerEl.textContent = text; }

  // --- The mark sheet --------------------------------------------------------
  renderSheet(report) {
    const E = this.els;
    E.paperEl.hidden = true;
    E.sheetEl.hidden = false;
    document.body.classList.remove('ex-sitting');
    // The paper is down: the section chips, the counter and above all the clock
    // are about a paper in flight, and leaving them over a mark sheet reads as a
    // paper still running.
    E.sectionEl.hidden = true;
    E.descEl.hidden = true;
    E.expiredEl.hidden = true;
    E.abandonBtn.hidden = true;
    E.counterEl.textContent = '';
    E.clockEl.textContent = '';
    E.clockEl.className = 'ex-clock';
    const mins = Math.round(report.ms / 60000);
    E.sheetEl.innerHTML =
      `<div class="ex-verdict ${report.passed ? 'pass' : 'fail'}">` +
        `<b>${report.passed ? `合格 — ${esc(report.name)} passed` : `不合格 — ${esc(report.name)} not passed`}</b>` +
        `<span>${report.correct}/${report.count} correct · ${report.score}/100 overall · ${mins} min</span>` +
      `</div>` +
      `<p class="ex-rule">Every section must reach 70 on its own.</p>` +
      report.sections.map(s =>
        `<div class="ex-sec">` +
          `<div class="ex-sec-head"><b>${esc(s.title)}</b>` +
            `<span class="${s.passed ? 'ok' : 'bad'}">${s.score}/100 · ${s.correct}/${s.count}${s.passed ? '' : ' — short'}</span></div>` +
          `<ol class="ex-marks">${s.marks.map((m, i) =>
            `<li class="${m.ok ? 'ok' : m.given === null ? 'blank' : 'bad'}">` +
              `<span class="ex-m-no">${i + 1}</span>` +
              `<span class="ex-m-q">${this.markQuestion(m.q)}</span>` +
              `<span class="ex-m-a">${m.ok ? '✓' : m.given === null ? '— blank' : `✗ ${esc(group(Number(m.given)))}`}</span>` +
              `<span class="ex-m-right">${esc(group(m.answer))}</span>` +
            `</li>`).join('')}</ol>` +
        `</div>`).join('');
  }

  // A one-line form of the question for the mark sheet, where the full column
  // would bury the scores it is there to explain.
  markQuestion(q) {
    if (!q) return '';
    if (q.terms) return q.terms.map((t, i) => (i === 0 ? group(t) : signed(t))).join(' ');
    if (q.kind === 'kake') return `${group(q.a)} × ${group(q.b)}`;
    if (q.kind === 'wari') return `${group(q.a)} ÷ ${group(q.b)}`;
    if (q.kind === 'kaihei') return `√${group(q.a)}`;
    return '';
  }

  close() {
    this.els.stageEl.hidden = true;
    document.body.classList.remove('ex-sitting');
  }
}
