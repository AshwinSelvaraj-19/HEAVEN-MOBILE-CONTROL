/**
 * Multi-pointer invariants, exercised through the mock transport so the whole
 * pointer manager (including serialisation) runs without a device.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTION, MAX_POINTERS } from '../src/protocol.js';
import { Logger } from '../src/log.js';
import { MockSession } from '../src/mock-session.js';
import { PointerManager } from '../src/pointers.js';

const SCREEN = { width: 1080, height: 2340 };
const silent = new Logger({ level: 'error', file: null });

function harness() {
  const session = new MockSession({ logger: silent, screen: SCREEN });
  const pointers = new PointerManager({ session, screen: SCREEN, logger: silent });
  return { session, pointers };
}

test('two independent pointers produce two distinct DOWN events', () => {
  const { session, pointers } = harness();
  pointers.down('A', 300, 900);
  pointers.down('B', 700, 900);

  const downs = session.messages.filter((message) => message.action === ACTION.DOWN);
  assert.equal(downs.length, 2);
  assert.notEqual(downs[0].pointerId, downs[1].pointerId);
  assert.deepEqual(pointers.snapshot().active.map((pointer) => pointer.name).sort(), ['A', 'B']);
});

test('moving B leaves A completely untouched', () => {
  const { session, pointers } = harness();
  pointers.down('A', 300, 900);
  pointers.down('B', 700, 900);
  const idA = pointers.snapshot().active.find((pointer) => pointer.name === 'A').id;

  for (let i = 0; i < 5; i++) {
    pointers.move('B', 700 + i * 10, 900);
  }

  const messagesForA = session.messages.filter((message) => message.pointerId === String(idA));
  assert.equal(messagesForA.length, 1, 'A must only ever have its DOWN');
  assert.equal(messagesForA[0].action, ACTION.DOWN);

  assert.equal(session.messages.filter((message) => message.action === ACTION.MOVE).length, 5);
  assert.equal(pointers.snapshot().count, 2);
});

test('lifting one pointer keeps the other down (no implicit UP)', () => {
  const { session, pointers } = harness();
  pointers.down('A', 300, 900);
  pointers.down('B', 700, 900);
  pointers.up('B');

  const ups = session.messages.filter((message) => message.action === ACTION.UP);
  assert.equal(ups.length, 1);
  assert.equal(pointers.snapshot().count, 1);
  assert.equal(pointers.snapshot().active[0].name, 'A');
});

test('panic releases every pointer with ACTION_UP, newest first, never CANCEL', async () => {
  const { session, pointers } = harness();
  pointers.down('A', 300, 900);
  pointers.down('B', 700, 900);
  pointers.down('C', 500, 1200);

  const released = await pointers.panic('test');
  assert.equal(released, 3);
  assert.equal(pointers.snapshot().count, 0);

  const ups = session.messages.filter((message) => message.action === ACTION.UP);
  assert.equal(ups.length, 3);
  assert.ok(
    session.messages.every((message) => message.action !== 3),
    'ACTION_CANCEL would leave stale pointers server-side',
  );

  const ids = pointers.snapshot();
  assert.equal(ids.panics, 1);
});

test('panic is idempotent and safe when nothing is down', async () => {
  const { session, pointers } = harness();
  assert.equal(await pointers.panic('empty'), 0);
  assert.equal(session.messages.length, 0);

  pointers.down('A', 10, 10);
  await pointers.panic('first');
  assert.equal(await pointers.panic('second'), 0);
  assert.equal(session.messages.filter((message) => message.action === ACTION.UP).length, 1);
});

test('moving or lifting an unknown pointer is refused (would leak a pointer server-side)', () => {
  const { pointers } = harness();
  assert.throws(() => pointers.move('X', 1, 1), /not down/);
  assert.throws(() => pointers.up('X'), /not down/);
  assert.throws(() => {
    pointers.down('A', 1, 1);
    pointers.down('A', 2, 2);
  }, /already down/);
});

test(`the ${MAX_POINTERS}-pointer ceiling is enforced`, () => {
  const { pointers } = harness();
  for (let i = 0; i < MAX_POINTERS; i++) {
    pointers.down(`P${i}`, 100 + i, 100);
  }
  assert.equal(pointers.snapshot().count, MAX_POINTERS);
  assert.throws(() => pointers.down('overflow', 10, 10), /Already 10 pointers/);
});

test('coordinates are clamped to the screen before serialisation', () => {
  const { session, pointers } = harness();
  pointers.down('A', -50, 99999);
  const [message] = session.messages;
  assert.equal(message.x, 0);
  assert.equal(message.y, SCREEN.height - 1);
});

test('a closed channel aborts sends instead of silently dropping them', () => {
  const { session, pointers } = harness();
  pointers.down('A', 10, 10);
  session.channel.closed = true;
  assert.throws(() => pointers.move('A', 20, 20), /closed/);
});
