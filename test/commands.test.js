import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AbacusStore } from '../src/state/abacusStore.js';
import { CommandBus, SetValueCommand, StepIntCommand, ToggleSkyCommand, ClickEarthCommand } from '../src/state/commands.js';

test('SetValueCommand sets the store from a string', () => {
  const store = new AbacusStore(0, '');
  const bus = new CommandBus();
  bus.run(new SetValueCommand(store, '42.5'));
  assert.equal(store.intValue(), 42);
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
  assert.equal(store.intValue(), 15);
  assert.equal(bus.canUndo, true);
  bus.undo();
  assert.equal(store.intValue(), 10);
  assert.equal(bus.canUndo, false);
});

test('StepIntCommand clamps at 0', () => {
  const store = new AbacusStore(0, '');
  new CommandBus().run(new StepIntCommand(store, -1));
  assert.equal(store.intValue(), 0);
});

test('ToggleSkyCommand and ClickEarthCommand mutate a rod and undo cleanly', () => {
  const store = new AbacusStore(0, '');
  const bus = new CommandBus();
  bus.run(new ToggleSkyCommand(store, 'int', 0));   // ones sky bead -> +5
  assert.equal(store.intValue(), 5);
  bus.run(new ClickEarthCommand(store, 'int', 0, 2)); // push 3 earth beads -> +3
  assert.equal(store.intValue(), 8);
  bus.undo();
  assert.equal(store.intValue(), 5);
  bus.undo();
  assert.equal(store.intValue(), 0);
});
