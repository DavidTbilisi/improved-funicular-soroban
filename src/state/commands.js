// ============================================================================
// Command pattern. Every user intent that mutates the abacus is a Command with
// execute()/undo(). A CommandBus (the Invoker) runs them and keeps history so
// the UI can offer Undo. Undo is implemented via a store snapshot captured at
// execute time (a lightweight Memento), which keeps each command trivial.
// ============================================================================
import { parseDecimal } from '../domain/number.js';
import { intValOf } from '../domain/rod.js';

class Command {
  constructor(store) { this.store = store; this._before = null; }
  execute() {
    this._before = this.store.snapshot();
    this.apply();
  }
  undo() { if (this._before) this.store.restore(this._before); }
  apply() { throw new Error('abstract'); }
}

export class SetValueCommand extends Command {
  constructor(store, str) { super(store); this.str = str; }
  apply() {
    const { intVal, fracStr } = parseDecimal(this.str);
    this.store.setFromParts(intVal, fracStr);
  }
}

export class StepIntCommand extends Command {
  constructor(store, delta) { super(store); this.delta = delta; }
  apply() { this.store.setIntValue(this.store.intValue() + this.delta); }
}

export class ToggleSkyCommand extends Command {
  constructor(store, kind, idx) { super(store); this.kind = kind; this.idx = idx; }
  apply() {
    const rods = this.store.rodsOf(this.kind);
    rods[this.idx].sky = !rods[this.idx].sky;
    this.store.notify(this.store);
  }
}

export class ClickEarthCommand extends Command {
  constructor(store, kind, idx, bead) { super(store); this.kind = kind; this.idx = idx; this.bead = bead; }
  apply() {
    const rod = this.store.rodsOf(this.kind)[this.idx];
    rod.earth = (this.bead + 1 <= rod.earth) ? this.bead : this.bead + 1;
    this.store.notify(this.store);
  }
}

// Invoker. Runs commands and retains an undo history.
export class CommandBus {
  constructor() { this._history = []; }
  get canUndo() { return this._history.length > 0; }
  run(command) {
    command.execute();
    this._history.push(command);
    return command;
  }
  undo() {
    const command = this._history.pop();
    if (command) command.undo();
    return command;
  }
}
