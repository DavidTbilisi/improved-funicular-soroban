// ============================================================================
// The kyu ladder — the one yardstick in this app that it did not invent.
//
// Every other rank here is the app's own: the tutorial unlocks on a streak it
// chose, the anzan rungs are its own ladder, the village rank is fiction. Real
// soroban has had an external standard for a century — the 珠算検定 grading
// exam, sat at a desk with a paper and a clock, in three sections:
//
//   見取算 mitori-zan  a COLUMN of terms, added and subtracted in order
//   掛算   kake-zan    multiplication
//   割算   wari-zan    division
//
// Mitori-zan is the reason this page exists at all. It is what soroban practice
// IS — ten numbers down a column, one pass, no re-reading — and nothing in the
// app has ever asked for it: the guided-practice ladder tops out at TWO
// operands, and flash anzan does the many-term column with no board to do it
// on. This is the board version, which is the original.
//
// HONESTY ABOUT WHAT THIS IS. Nothing here certifies anything: the app is not
// the Japan Chamber of Commerce & Industry, and passing 3級 in a browser is not
// 3級. The ladder is *modelled on* the published kyu shapes — the term count,
// the digit widths, the point at which minus terms and division appear — with
// SHORTER papers (5 questions a section rather than the real 10-20) and the
// section clock scaled to match. What transfers is the shape of the work and
// the standard: 100 points a section, 70 to pass, and every section must pass.
// A grade you can only half do is not a grade you hold.
//
// `needs` names the guided-practice level whose clearing means the board rules
// this grade leans on are in hand. It is a plain string, not an import: the
// join is read by the Today plan (which has both ladders in front of it), the
// same way src/anzan/bridge.js owns LEVEL_RUNG rather than putting it in
// src/tutorial/. Frozen data only. Unit-tested in test/examGrades.test.js.
// ============================================================================

// Points per section, and the mark every section must reach. Both are the real
// exam's, and the second is the load-bearing one: an exam that averaged the
// sections would let a 100 in mitori carry a 20 in division.
export const SECTION_POINTS = 100;
export const PASS_MARK = 70;

const mitori = (count, seconds, terms, digits, minus) =>
  ({ kind: 'mitori', title: '見取算 · column', count, seconds, terms, digits, minus });
const kake = (count, seconds, a, b) =>
  ({ kind: 'kake', title: '掛算 · multiplication', count, seconds, a, b });
const wari = (count, seconds, a, b) =>
  ({ kind: 'wari', title: '割算 · division', count, seconds, a, b });

// Easiest first (10級 → 1級), so index order is ladder order everywhere.
export const EXAM_GRADES = Object.freeze([
  {
    id: 'kyu10', kyu: 10, name: '10級', needs: 'small-add',
    teach: 'Five single digits down a column, added. No minus terms and no division yet — this grade is here to teach you how a paper is sat: read once, add as you go, clear the board between questions.',
    sections: [mitori(5, 180, 5, 1, false), kake(5, 150, 1, 1)],
  },
  {
    id: 'kyu9', kyu: 9, name: '9級', needs: 'big-add',
    teach: 'Two-digit terms, so the ones rod overflows and carries into the tens — and division arrives, at its smallest.',
    sections: [mitori(5, 200, 5, 2, false), kake(5, 160, 2, 1), wari(5, 160, 2, 1)],
  },
  {
    id: 'kyu8', kyu: 8, name: '8級', needs: 'big-sub',
    teach: 'The first paper with <b>minus terms</b>. A column that goes down as well as up is a different exercise: the running total is the only thing on the board, and a borrow you get wrong is invisible until the answer is.',
    sections: [mitori(5, 220, 5, 2, true), kake(5, 170, 2, 1), wari(5, 170, 2, 1)],
  },
  {
    id: 'kyu7', kyu: 7, name: '7級', needs: 'compound',
    teach: 'Ten terms. Twice the column with the same clock — this is where holding the board while the next number lands starts to cost you.',
    sections: [mitori(5, 300, 10, 2, true), kake(5, 180, 2, 2), wari(5, 180, 3, 1)],
  },
  {
    id: 'kyu6', kyu: 6, name: '6級', needs: 'multi',
    teach: 'Three-digit terms over ten rows. Carries now propagate two rods, and a compound trade — a carry whose payback is itself blocked — will appear in most questions.',
    sections: [mitori(5, 320, 10, 3, true), kake(5, 200, 3, 2), wari(5, 200, 3, 2)],
  },
  {
    id: 'kyu5', kyu: 5, name: '5級', needs: 'multi',
    teach: 'The same column, a tighter clock, and a wider product. From here the arithmetic stops changing and only the pace does.',
    sections: [mitori(5, 300, 10, 3, true), kake(5, 210, 3, 2), wari(5, 210, 4, 2)],
  },
  {
    id: 'kyu4', kyu: 4, name: '4級', needs: 'mult',
    teach: 'Three-by-three multiplication: the rod-placement method earns its keep here, because holding partial products in your head does not scale.',
    sections: [mitori(5, 300, 10, 4, true), kake(5, 240, 3, 3), wari(5, 240, 4, 2)],
  },
  {
    id: 'kyu3', kyu: 3, name: '3級', needs: 'divide',
    teach: 'Four-digit terms and a three-digit divisor. 3級 is the grade most schools treat as the practical line — past it, the board is faster than a calculator for anyone who can be bothered to reach for it.',
    sections: [mitori(5, 330, 10, 4, true), kake(5, 250, 3, 3), wari(5, 250, 5, 3)],
  },
  {
    id: 'kyu2', kyu: 2, name: '2級', needs: 'divide',
    teach: 'Five-digit terms. The column is now wider than most people can read in one glance, which is the point: you set rods, you do not read numbers.',
    sections: [mitori(5, 360, 10, 5, true), kake(5, 280, 4, 3), wari(5, 280, 6, 3)],
  },
  {
    id: 'kyu1', kyu: 1, name: '1級', needs: 'divide',
    teach: 'Six-digit terms, four-by-four products, seven-by-three division. At this shape the paper is no longer testing whether you know the rules.',
    sections: [mitori(5, 400, 10, 6, true), kake(5, 300, 4, 4), wari(5, 300, 7, 3)],
  },
].map(g => Object.freeze({ ...g, sections: Object.freeze(g.sections.map(Object.freeze)) })));

export const gradeById = id => EXAM_GRADES.find(g => g.id === id) || null;
export const gradeIndex = id => EXAM_GRADES.findIndex(g => g.id === id);

export const totalQuestions = grade =>
  (grade ? grade.sections : []).reduce((n, s) => n + s.count, 0);
export const totalSeconds = grade =>
  (grade ? grade.sections : []).reduce((n, s) => n + s.seconds, 0);

// The lowest grade not yet passed — the one the ladder is on. Everything
// passed → null, which is the "nothing left to sit" case the page prints.
export function nextGrade(passedIds = []) {
  const passed = new Set(passedIds);
  return EXAM_GRADES.find(g => !passed.has(g.id)) || null;
}

// The highest grade passed = the SMALLEST kyu number, since the ladder counts
// down. Returns null when none are.
export function highestPassed(passedIds = []) {
  const passed = new Set(passedIds);
  const held = EXAM_GRADES.filter(g => passed.has(g.id));
  return held.length ? held[held.length - 1] : null;
}

// One line naming a section's shape, for the paper header and the plan's
// reason line. Pure text — the view formats, it does not decide.
export function describeSection(s) {
  if (!s) return '';
  if (s.kind === 'mitori') {
    return `${s.terms} terms × ${s.digits} digit${s.digits === 1 ? '' : 's'}` +
      (s.minus ? ', with subtraction' : ', addition only');
  }
  if (s.kind === 'kake') return `${s.a} digit${s.a === 1 ? '' : 's'} × ${s.b} digit${s.b === 1 ? '' : 's'}`;
  if (s.kind === 'wari') return `${s.a} digits ÷ ${s.b} digit${s.b === 1 ? '' : 's'}, exact`;
  return '';
}

export const describeGrade = grade =>
  (grade ? grade.sections : []).map(s => `${s.title.split(' · ')[0]} ${describeSection(s)}`).join(' · ');
