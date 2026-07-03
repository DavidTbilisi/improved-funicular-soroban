// ============================================================================
// Observable — the Subject half of the Observer pattern. Subjects notify
// subscribed observers on change; observers decouple from what mutates state.
// Used by AbacusStore (→ views) and DrillSession (→ drill view).
// ============================================================================
export class Observable {
  constructor() { this._observers = new Set(); }

  // subscribe(fn) -> unsubscribe(). fn receives the payload passed to notify().
  subscribe(fn) {
    this._observers.add(fn);
    return () => this._observers.delete(fn);
  }

  notify(payload) {
    for (const fn of this._observers) fn(payload);
  }
}
