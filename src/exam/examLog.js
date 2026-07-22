// ============================================================================
// ExamLog — sat papers, on the ProgressStore port (key 'npv-exam' in the app,
// Memory in tests).
//
//   blob = { attempts: [{ t, gradeId, kyu, score, passed, ms,
//                         sections: [{ kind, score, passed }] }] }
//
// It keeps ATTEMPTS, not a grade list, and derives "passed" from them. A stored
// "highest grade" would be a second source of truth that could disagree with
// the record that produced it — and the attempt row is the interesting thing
// anyway: 68 in the column and 100 in the other two says something a bare
// FAILED does not.
//
// What it does NOT keep is the paper. The questions were random and are of no
// further use; the per-section scores are the whole signal, and a blob that
// grew by a hundred numbers per attempt would be the largest thing in the save
// file within a week. Attempts are capped at the most recent 40.
//
// DOM-free; the clock is injected. Unit-tested in test/examLog.test.js.
// ============================================================================

const CAP = 40;

export class ExamLog {
  constructor(store, { nowIso = () => new Date().toISOString().slice(0, 16), cap = CAP } = {}) {
    this.store = store;
    this.nowIso = nowIso;
    this.cap = cap;
  }

  _data() {
    const raw = this.store.load();
    const d = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    if (!Array.isArray(d.attempts)) d.attempts = [];
    return d;
  }

  // Takes a gradePaper() report; stores the summary rows only.
  record(report) {
    if (!report || !report.gradeId) return null;
    const d = this._data();
    const row = {
      t: this.nowIso(),
      gradeId: report.gradeId,
      kyu: report.kyu,
      score: report.score | 0,
      passed: !!report.passed,
      ms: Math.max(0, Math.round(report.ms || 0)),
      sections: (report.sections || []).map(s => ({ kind: s.kind, score: s.score | 0, passed: !!s.passed })),
    };
    d.attempts = d.attempts.slice(-(this.cap - 1)).concat([row]);
    this.store.save(d);
    return row;
  }

  attempts(gradeId = null) {
    const all = this._data().attempts.filter(a => a && a.gradeId);
    return gradeId ? all.filter(a => a.gradeId === gradeId) : all.slice();
  }

  // Best score ever scored on a grade, or null if never sat.
  best(gradeId) {
    const rows = this.attempts(gradeId);
    return rows.length ? Math.max(...rows.map(a => a.score | 0)) : null;
  }

  passed(gradeId) { return this.attempts(gradeId).some(a => a.passed); }

  // Every grade ever passed, in the order they were first passed.
  passedIds() {
    const seen = [];
    for (const a of this.attempts()) if (a.passed && !seen.includes(a.gradeId)) seen.push(a.gradeId);
    return seen;
  }

  lastAttempt(gradeId = null) {
    const rows = this.attempts(gradeId);
    return rows.length ? rows[rows.length - 1] : null;
  }
}
