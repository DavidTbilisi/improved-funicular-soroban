// ============================================================================
// FaultLog — turns rejected keyboard moves into diagnosis. The board shell
// reports each fumble with the trade it demanded ({rule, amount}); this
// aggregates counts by complement PAIR, because that is the unit the learner
// actually drills ("you trip on the 2↔3 five-trade"). Same Adapter/Repository
// split as the other stores: any JSON-blob port (LocalStorage in the app,
// Memory in tests).
//   blob = { pairs: { 'small:1-4': n, ... 'big:5-5': n }, resets: n }
// Counts, not rates — the engine can't see how often a trade was done RIGHT
// (a legal +5 then −2 is just two legal moves), so we don't pretend to.
// ============================================================================

export class FaultLog {
  constructor(store) { this.store = store; }

  _data() {
    const d = this.store.load();
    if (!d.pairs) d.pairs = {};
    if (typeof d.resets !== 'number') d.resets = 0;
    return d;
  }

  // A rejected single-key move that needed a trade: rule 'small'|'big',
  // amount = the digit the key meant (1..5). Pair order is normalized so
  // +2 and −3 fumbles land in the same 2↔3 bucket.
  recordIllegal(rule, amount) {
    if (rule !== 'small' && rule !== 'big') return;
    const base = rule === 'small' ? 5 : 10;
    const [lo, hi] = [amount, base - amount].sort((x, y) => x - y);
    const d = this._data();
    const key = `${rule}:${lo}-${hi}`;
    d.pairs[key] = (d.pairs[key] || 0) + 1;
    this.store.save(d);
  }

  recordReset() { const d = this._data(); d.resets++; this.store.save(d); }

  counts() { const d = this._data(); return { pairs: { ...d.pairs }, resets: d.resets }; }
}

// The chartable rows in fixed order (identity never rides on rank): the two
// five-pairs, then the five ten-pairs, each with its count (0 when clean).
export function fumbleRows(counts) {
  const rows = [];
  for (const [a, b] of [[1, 4], [2, 3]]) {
    rows.push({ key: `small:${a}-${b}`, label: `${a} ↔ ${b} · five`, count: counts.pairs[`small:${a}-${b}`] || 0 });
  }
  for (const [a, b] of [[1, 9], [2, 8], [3, 7], [4, 6], [5, 5]]) {
    rows.push({ key: `big:${a}-${b}`, label: `${a} ↔ ${b} · ten`, count: counts.pairs[`big:${a}-${b}`] || 0 });
  }
  return rows;
}
