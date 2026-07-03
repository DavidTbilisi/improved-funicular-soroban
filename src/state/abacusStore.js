// ============================================================================
// AbacusStore — the single source of truth for bead positions. It is an
// Observable Subject: any mutation notifies subscribed views. It exposes only
// low-level mutators; higher-level intent (set a value, step, toggle a bead)
// lives in Commands, which call these. Views never mutate the store directly.
// ============================================================================
import { Observable } from './observable.js';
import { intRodsFromVal, fracRodsFromStr, intValOf, rodValue } from '../domain/rod.js';
import { MAXINT, FRAC_COLS } from '../domain/config.js';

const FRAC_SCALE = Math.pow(10, FRAC_COLS); // 10^4 — the fraction as an integer
const MAX_SCALED = MAXINT * FRAC_SCALE + (FRAC_SCALE - 1);

export class AbacusStore extends Observable {
  constructor(intVal = 0, fracStr = '') {
    super();
    this._int = intRodsFromVal(intVal);
    this._frac = fracRodsFromStr(fracStr);
  }

  get int() { return this._int; }
  get frac() { return this._frac; }

  // A cloneable snapshot for Memento-style undo in commands.
  snapshot() {
    return {
      int: this._int.map(r => ({ ...r })),
      frac: this._frac.map(r => ({ ...r })),
    };
  }

  restore(snap) {
    this._int = snap.int.map(r => ({ ...r }));
    this._frac = snap.frac.map(r => ({ ...r }));
    this.notify(this);
  }

  setInt(rods) { this._int = rods; this.notify(this); }
  setFrac(rods) { this._frac = rods; this.notify(this); }

  setFromParts(intVal, fracStr) {
    this._int = intRodsFromVal(intVal);
    this._frac = fracRodsFromStr(fracStr);
    this.notify(this);
  }

  setIntValue(iv) {
    const n = Math.max(0, Math.min(MAXINT, iv));
    this._int = intRodsFromVal(n);
    this.notify(this);
  }

  intValue() { return intValOf(this._int); }

  // The whole number (integer + fraction) as one integer, value × 10^FRAC_COLS.
  // Lets column arithmetic carry/borrow across the decimal point with no float
  // error. Fraction rods are most-significant-first (frac[0] = tenths).
  scaledValue() {
    const fracInt = this._frac.reduce((s, r, j) => s + rodValue(r) * Math.pow(10, FRAC_COLS - 1 - j), 0);
    return this.intValue() * FRAC_SCALE + fracInt;
  }

  setScaled(v) {
    v = Math.max(0, Math.min(MAX_SCALED, Math.round(v)));
    this._int = intRodsFromVal(Math.floor(v / FRAC_SCALE));
    this._frac = fracRodsFromStr(String(v % FRAC_SCALE).padStart(FRAC_COLS, '0'));
    this.notify(this);
  }

  rodsOf(kind) { return kind === 'int' ? this._int : this._frac; }
}
