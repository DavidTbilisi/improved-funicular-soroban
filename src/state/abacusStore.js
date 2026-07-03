// ============================================================================
// AbacusStore — the single source of truth for bead positions. It is an
// Observable Subject: any mutation notifies subscribed views. It exposes only
// low-level mutators; higher-level intent (set a value, step, toggle a bead)
// lives in Commands, which call these. Views never mutate the store directly.
// ============================================================================
import { Observable } from './observable.js';
import { intRodsFromVal, fracRodsFromStr, intValOf } from '../domain/rod.js';
import { MAXINT } from '../domain/config.js';

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

  rodsOf(kind) { return kind === 'int' ? this._int : this._frac; }
}
