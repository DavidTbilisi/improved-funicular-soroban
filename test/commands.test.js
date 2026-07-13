import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AbacusStore } from '../src/state/abacusStore.js';
import { rodValue } from '../src/domain/rod.js';
import { CommandBus, SetValueCommand, StepIntCommand, ToggleSkyCommand, ClickEarthCommand, AddAtColumnCommand } from '../src/state/commands.js';

test('SetValueCommand sets the store from a string', () => {
  const store = new AbacusStore(0, '');
  const bus = new CommandBus();
  bus.run(new SetValueCommand(store, '42.5'));
  assert.equal(store.intValue(), 42n);  // intValue() is BigInt (values can exceed 2^53)
});

test('commands notify observers', () => {
  const store = new AbacusStore(0, '');
  let hits = 0;
  store.subscribe(() => hits++);
  new CommandBus().run(new SetValueCommand(store, '7'));
  assert.ok(hits >= 1);
});

test('undo restores the prior snapshot', () => {
  const store = new AbacusStore(10, '');
  const bus = new CommandBus();
  bus.run(new StepIntCommand(store, +5));
  assert.equal(store.intValue(), 15n);
  assert.equal(bus.canUndo, true);
  bus.undo();
  assert.equal(store.intValue(), 10n);
  assert.equal(bus.canUndo, false);
});

test('StepIntCommand clamps at 0', () => {
  const store = new AbacusStore(0, '');
  new CommandBus().run(new StepIntCommand(store, -1));
  assert.equal(store.intValue(), 0n);
});

test('AddAtColumnCommand adds at an integer place, carries, and undoes', () => {
  const store = new AbacusStore(0, '');
  const bus = new CommandBus();
  bus.run(new AddAtColumnCommand(store, 0, 9, +1));  // +9 ones
  assert.equal(store.intValue(), 9n);
  bus.run(new AddAtColumnCommand(store, 0, 6, +1));  // +6 ones -> carry to tens
  assert.equal(store.intValue(), 15n);
  bus.run(new AddAtColumnCommand(store, 1, 2, +1));  // +2 tens
  assert.equal(store.intValue(), 35n);
  bus.run(new AddAtColumnCommand(store, 0, 7, -1));  // -7 ones -> borrow
  assert.equal(store.intValue(), 28n);
  bus.undo();
  assert.equal(store.intValue(), 35n);
});

test('AddAtColumnCommand works on fraction columns (negative exponent)', () => {
  const store = new AbacusStore(0, '');
  const bus = new CommandBus();
  bus.run(new AddAtColumnCommand(store, -1, 5, +1));  // +5 tenths -> 0.5
  assert.equal(store.scaledValue(), 5000n);
  assert.equal(rodValue(store.frac[0]), 5);
  bus.run(new AddAtColumnCommand(store, -2, 3, +1));  // +3 hundredths -> 0.53
  assert.equal(rodValue(store.frac[1]), 3);
});

test('a carry out of the tenths crosses the decimal point into the ones', () => {
  const store = new AbacusStore(0, '9'); // 0.9
  const bus = new CommandBus();
  bus.run(new AddAtColumnCommand(store, -1, 1, +1)); // +1 tenth -> 1.0
  assert.equal(store.intValue(), 1n);
  assert.equal(rodValue(store.frac[0]), 0);
  assert.equal(store.scaledValue(), 10000n);
  bus.undo();
  assert.equal(store.scaledValue(), 9000n); // back to 0.9
});

test('ToggleSkyCommand and ClickEarthCommand mutate a rod and undo cleanly', () => {
  const store = new AbacusStore(0, '');
  const bus = new CommandBus();
  bus.run(new ToggleSkyCommand(store, 'int', 0));   // ones sky bead -> +5
  assert.equal(store.intValue(), 5n);
  bus.run(new ClickEarthCommand(store, 'int', 0, 2)); // push 3 earth beads -> +3
  assert.equal(store.intValue(), 8n);
  bus.undo();
  assert.equal(store.intValue(), 5n);
  bus.undo();
  assert.equal(store.intValue(), 0n);
});
