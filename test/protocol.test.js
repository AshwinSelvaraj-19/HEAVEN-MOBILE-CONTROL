/**
 * Byte-level contract tests for INJECT_TOUCH_EVENT.
 *
 * The expected offsets come from scrcpy 4.1 source:
 *   app/src/control_msg.c  sc_control_msg_serialize() + write_position()
 *   server/.../ControlMessageReader.java parseInjectTouchEvent() + parsePosition()
 * If any of these fail, the wire format is wrong and nothing will work.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTION,
  CONTROL_TYPE,
  MAX_POINTERS,
  TOUCH_EVENT_LENGTH,
  describeTouch,
  quantizePressure,
  serializeTouchEvent,
} from '../src/protocol.js';

test('touch event is 32 bytes with the documented big-endian layout', () => {
  const buffer = serializeTouchEvent({
    action: ACTION.DOWN,
    pointerId: 7,
    x: 100,
    y: 200,
    screenWidth: 1080,
    screenHeight: 2340,
    pressure: 1,
  });

  assert.equal(buffer.length, TOUCH_EVENT_LENGTH);
  assert.equal(buffer.length, 32);

  assert.equal(buffer[0], CONTROL_TYPE.INJECT_TOUCH_EVENT, 'type must be 2');
  assert.equal(buffer[1], ACTION.DOWN);
  assert.equal(buffer.readBigUInt64BE(2), 7n, 'pointer id at offset 2');
  assert.equal(buffer.readInt32BE(10), 100, 'x at offset 10');
  assert.equal(buffer.readInt32BE(14), 200, 'y at offset 14');
  assert.equal(buffer.readUInt16BE(18), 1080, 'width at offset 18');
  assert.equal(buffer.readUInt16BE(20), 2340, 'height at offset 20');
  assert.equal(buffer.readUInt16BE(22), 0xffff, 'pressure at offset 22');
  assert.equal(buffer.readUInt32BE(24), 0, 'actionButton at offset 24');
  assert.equal(buffer.readUInt32BE(28), 0, 'buttons at offset 28');
});

test('pressure is quantised to u16 fixed point and clamped', () => {
  assert.equal(quantizePressure(0), 0);
  assert.equal(quantizePressure(1), 65535);
  assert.equal(quantizePressure(0.5), 32768);
  assert.equal(quantizePressure(-3), 0);
  assert.equal(quantizePressure(9), 65535);
  assert.equal(quantizePressure(Number.NaN), 0);
});

test('ACTION_UP defaults to zero pressure without an explicit value', () => {
  const buffer = serializeTouchEvent({
    action: ACTION.UP,
    pointerId: 1,
    x: 0,
    y: 0,
    screenWidth: 1080,
    screenHeight: 2340,
  });
  assert.equal(buffer.readUInt16BE(22), 0);
});

test('ACTION_MOVE keeps full pressure by default', () => {
  const buffer = serializeTouchEvent({
    action: ACTION.MOVE,
    pointerId: 2,
    x: 5,
    y: 6,
    screenWidth: 1080,
    screenHeight: 2340,
  });
  assert.equal(buffer.readUInt16BE(22), 0xffff);
});

test('ACTION_CANCEL is rejected: the server would leak stale pointers', () => {
  assert.throws(
    () =>
      serializeTouchEvent({
        action: 3,
        pointerId: 1,
        x: 0,
        y: 0,
        screenWidth: 1080,
        screenHeight: 2340,
      }),
    /Unsupported motion action/,
  );
});

test('invalid pointer ids and coordinates are rejected before they hit the socket', () => {
  const base = { action: ACTION.DOWN, x: 10, y: 10, screenWidth: 1080, screenHeight: 2340 };

  assert.throws(() => serializeTouchEvent({ ...base, pointerId: -1 }), /non-negative/);
  assert.throws(() => serializeTouchEvent({ ...base, pointerId: 1.5 }), /non-negative/);
  assert.throws(() => serializeTouchEvent({ ...base, pointerId: 1, x: 1.5 }), /integer/);
  assert.throws(
    () => serializeTouchEvent({ ...base, pointerId: 1, screenWidth: 70000 }),
    /uint16/,
  );
});

test('describeTouch matches the fields scrcpy logs', () => {
  const buffer = serializeTouchEvent({
    action: ACTION.DOWN,
    pointerId: 42,
    x: 12,
    y: 34,
    screenWidth: 1080,
    screenHeight: 2340,
  });
  assert.deepEqual(describeTouch(buffer), {
    action: 'DOWN',
    pointerId: '42',
    x: 12,
    y: 34,
    pressure: '1.000',
  });
});

test('the pointer ceiling matches scrcpy PointersState.MAX_POINTERS', () => {
  assert.equal(MAX_POINTERS, 10);
});
