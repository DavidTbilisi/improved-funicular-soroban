// ============================================================================
// ExamSession — the state machine that sits a paper. DOM-free and Observable,
// the same family as DrillSession / TutorialSession / AnzanSession.
//
// TWO THINGS MAKE IT AN EXAM RATHER THAN ANOTHER DRILL, and both are policy
// held here rather than in the view:
//
//  1. IT DOES NOT MARK AS YOU GO. Every other trainer in the app answers you
//     immediately, because immediate feedback is what practice is for. An exam
//     measures what you can do WITHOUT it — so answers are recorded silently
//     and the mark sheet only exists once the paper is down. (It is also the
//     only honest way to run a timed section: a "wrong" flash mid-column would
//     buy you a re-do the real paper never offers.)
//
//  2. THE CLOCK IS PER SECTION, and it is a wall. Time saved in the column does
//     not carry into the multiplication; when a section's time is out, the
//     remaining questions are recorded UNATTEMPTED and the section closes. An
//     answer submitted after the bell is not taken — checking expiry *before*
//     recording is what makes that true rather than approximately true.
//
// The clock is injected ({ now }) and nothing here schedules anything: the page
// drives `tick()` from its own interval, exactly as AnzanSession takes its
// timer, so the whole paper — including a section timing out mid-question —
// can be walked in the unit suite against a fake clock.
//
// Emitted events (payload.type):
//   started    { gradeId, name, kyu, sections, questions, seconds }
//   section    { si, kind, title, count, seconds, desc }
//   question   { si, qi, kind, count, question, remainingMs }
//   tick       { si, remainingMs }
//   expired    { si, kind, unanswered }
//   finished   { report, ms }
//   abandoned  { gradeId }
// ============================================================================
import { Observable } from '../state/observable.js';
import { gradeById, describeSection } from './grades.js';
import { genPaper, gradePaper } from './paper.js';

export class ExamSession extends Observable {
  constructor({ grades = null, rng, log = null, clock = { now: () => 0 } } = {}) {
    super();
    this.grades = grades;
    this.rng = rng;
    this.log = log;
    this.clock = clock;
    this._reset();
  }

  _reset() {
    this.grade = null;
    this.paper = null;
    this.answers = [];
    this.si = -1;
    this.qi = -1;
    this.sectionStart = 0;
    this.t0 = 0;
    this.report = null;
  }

  get active() { return !!this.paper && this.si >= 0; }
  get section() { return this.active ? this.paper.sections[this.si] : null; }
  get question() {
    const s = this.section;
    return s && this.qi >= 0 && this.qi < s.questions.length ? s.questions[this.qi] : null;
  }

  // Milliseconds left in the section in flight; 0 when there is no section.
  remainingMs() {
    const s = this.section;
    if (!s) return 0;
    return Math.max(0, s.seconds * 1000 - (this.clock.now() - this.sectionStart));
  }

  start(gradeId) {
    const grade = gradeById(gradeId) || (this.grades || []).find(g => g.id === gradeId);
    if (!grade) return;
    this._reset();
    this.grade = grade;
    this.paper = genPaper(grade, this.rng);
    this.answers = this.paper.sections.map(s => new Array(s.count).fill(null));
    this.t0 = this.clock.now();
    this.notify({
      type: 'started', gradeId: grade.id, name: grade.name, kyu: grade.kyu,
      sections: this.paper.sections.map(s => ({ kind: s.kind, title: s.title, count: s.count, seconds: s.seconds, desc: describeSection(s.spec) })),
      questions: this.paper.sections.reduce((n, s) => n + s.count, 0),
      seconds: this.paper.sections.reduce((n, s) => n + s.seconds, 0),
    });
    this._beginSection(0);
  }

  _beginSection(si) {
    this.si = si;
    this.qi = 0;
    this.sectionStart = this.clock.now();
    const s = this.section;
    this.notify({ type: 'section', si, kind: s.kind, title: s.title, count: s.count, seconds: s.seconds, desc: describeSection(s.spec) });
    this._askQuestion();
  }

  _askQuestion() {
    const s = this.section;
    this.notify({
      type: 'question', si: this.si, qi: this.qi, kind: s.kind, count: s.count,
      question: this.question, remainingMs: this.remainingMs(),
    });
  }

  // Close the section in flight. Anything not reached stays null — an
  // unattempted question and a wrong one score the same, but they read
  // differently on the mark sheet, and a learner who ran out of time should see
  // that is what happened.
  _endSection(expired) {
    const s = this.section;
    if (expired) {
      const unanswered = this.answers[this.si].filter(a => a === null).length;
      this.notify({ type: 'expired', si: this.si, kind: s.kind, unanswered });
    }
    if (this.si + 1 < this.paper.sections.length) this._beginSection(this.si + 1);
    else this._finish();
  }

  /**
   * Record an answer for the current question and move on.
   * On the board pages this is the BOARD's value — the abacus is the answer
   * sheet — so it arrives as a string/number/BigInt and is normalised at marking.
   */
  submit(value) {
    if (!this.active) return;
    // The bell first. An answer keyed after time is out belongs to no section.
    if (this.remainingMs() <= 0) { this._endSection(true); return; }
    this.answers[this.si][this.qi] = value == null ? null : String(value);
    this._advance();
  }

  // Leave it blank and move on — the paper's own "come back to it" is a forward
  // pass only, because the board has to be cleared to attempt anything else.
  skip() {
    if (!this.active) return;
    if (this.remainingMs() <= 0) { this._endSection(true); return; }
    this._advance();
  }

  _advance() {
    if (this.qi + 1 < this.section.count) { this.qi++; this._askQuestion(); }
    else this._endSection(false);
  }

  // Called by the page's interval. Returns the remaining ms so a view can
  // repaint the clock without reaching back into the session.
  tick() {
    if (!this.active) return 0;
    const left = this.remainingMs();
    if (left <= 0) { this._endSection(true); return 0; }
    this.notify({ type: 'tick', si: this.si, remainingMs: left });
    return left;
  }

  _finish() {
    const ms = this.clock.now() - this.t0;
    const report = gradePaper(this.paper, this.answers);
    report.ms = ms;
    this.report = report;
    this.si = -1;
    this.qi = -1;
    if (this.log) this.log.record(report);
    this.notify({ type: 'finished', report, ms });
  }

  // Walk out mid-paper. Nothing is recorded: an abandoned attempt is not a
  // failed one, and logging it would make sitting a grade you are not ready for
  // permanently expensive.
  abandon() {
    if (!this.paper) return;
    const gradeId = this.paper.gradeId;
    this._reset();
    this.notify({ type: 'abandoned', gradeId });
  }
}
