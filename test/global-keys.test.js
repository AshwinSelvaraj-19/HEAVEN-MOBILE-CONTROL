/** System-wide key capture helpers: key translation and poller bookkeeping. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { GlobalKeyPoller, virtualKeyFor } from '../src/global-keys.js';

test('key names translate to Windows virtual-key codes', () => {
  assert.equal(virtualKeyFor('w'), 0x57);
  assert.equal(virtualKeyFor('a'), 0x41);
  assert.equal(virtualKeyFor('7'), 0x37);
  assert.equal(virtualKeyFor('space'), 0x20);
  assert.equal(virtualKeyFor('shift'), 0x10);
  assert.equal(virtualKeyFor('arrowup'), 0x26);
  assert.equal(virtualKeyFor('wheelup'), null, 'wheel is produced by the page, not the keyboard');
  assert.equal(virtualKeyFor('escape'), null, 'Escape is polled separately');
});

test('the poller watches each physical key once and stays inert without the addon', () => {
  const poller = new GlobalKeyPoller({ keys: ['w', 'W', 'space', 'wheelup'], onKey: () => {} });
  assert.deepEqual(poller.keyList, ['w', 'space']);
  assert.equal(poller.active, false);
  assert.equal(poller.read(0x57), false, 'reading without an addon is a no-op, not a crash');
  poller.stop();
});
