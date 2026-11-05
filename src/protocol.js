/**
 * scrcpy 4.1 control protocol — touch events only.
 *
 * Every layout below is taken from the scrcpy 4.1 source (tag v4.1), not from
 * memory:
 *
 *   app/src/control_msg.h   enum sc_control_msg_type  -> INJECT_TOUCH_EVENT = 2
 *   app/src/control_msg.c   sc_control_msg_serialize() -> 32-byte payload
 *   server/.../ControlMessageReader.java parseInjectTouchEvent()
 *   server/.../Controller.java           injectTouch()
 *
 * Wire layout of an INJECT_TOUCH_EVENT (big endian, 32 bytes):
 *
 *   offset  size  field
 *   0       1     type            (2)
 *   1       1     action          AMOTION_EVENT_ACTION_*
 *   2       8     pointerId       uint64, our logical pointer id
 *   10      4     x               int32, device pixels
 *   14      4     y               int32, device pixels
 *   18      2     screenWidth     uint16 (unused server-side when video=false)
 *   20      2     screenHeight    uint16 (unused server-side when video=false)
 *   22      2     pressure        uint16 fixed point, 0..65535 == 0.0..1.0
 *   24      4     actionButton    uint32
 *   28      4     buttons         uint32
 *
 * Server-side semantics that constrain the client (see Controller.injectTouch):
 *   - ACTION_DOWN is rewritten to ACTION_POINTER_DOWN|index when other pointers
 *     are already in the MotionEvent.
 *   - ACTION_UP is rewritten to ACTION_POINTER_UP|index when others remain, and
 *     is what removes the pointer from PointersState.
 *   - ACTION_CANCEL does NOT clear PointersState (setUp() only runs for
 *     ACTION_UP), so cancelling would leave stale pointers behind. This PoC
 *     therefore never sends CANCEL: "panic" is N x ACTION_UP.
 *   - Any event carrying an unknown pointerId silently allocates a new pointer,
 *     so a MOVE for a pointer that was never pressed leaks a stuck finger.
 */

import { AppError, ErrorCode } from './errors.js';

export const CONTROL_TYPE = {
  INJECT_TOUCH_EVENT: 2,
};

/** AMOTION_EVENT_ACTION_* values used by this PoC. */
export const ACTION = {
  DOWN: 0,
  UP: 1,
  MOVE: 2,
  // Deliberately no CANCEL / POINTER_* entries: the server derives those itself.
};

export const TOUCH_EVENT_LENGTH = 32;

/** scrcpy's PointersState.MAX_POINTERS (Android's own limit). */
export const MAX_POINTERS = 10;

/** Reserved ids from control_msg.h — never use these for our own pointers. */
export const RESERVED_POINTER_IDS = [-1n, -2n, -3n];

/**
 * @typedef {object} TouchEvent
 * @property {number} action
 * @property {number} pointerId non-negative logical id
 * @property {number} x
 * @property {number} y
 * @property {number} screenWidth
 * @property {number} screenHeight
 * @property {number} [pressure] 0..1
 * @property {number} [actionButton]
 * @property {number} [buttons]
 */

/**
 * @param {TouchEvent} event
 * @returns {Buffer}
 */
export function serializeTouchEvent(event) {
  validate(event);

  const buffer = Buffer.allocUnsafe(TOUCH_EVENT_LENGTH);
  buffer[0] = CONTROL_TYPE.INJECT_TOUCH_EVENT;
  buffer[1] = event.action;
  buffer.writeBigUInt64BE(BigInt(event.pointerId), 2);
  buffer.writeInt32BE(event.x, 10);
  buffer.writeInt32BE(event.y, 14);
  buffer.writeUInt16BE(event.screenWidth, 18);
  buffer.writeUInt16BE(event.screenHeight, 20);
  buffer.writeUInt16BE(quantizePressure(event.pressure ?? (event.action === ACTION.UP ? 0 : 1)), 22);
  buffer.writeUInt32BE(event.actionButton ?? 0, 24);
  buffer.writeUInt32BE(event.buttons ?? 0, 28);
  return buffer;
}

/**
 * float 0..1 -> u16 fixed point, matching sc_float_to_u16fp().
 * @param {number} pressure
 */
export function quantizePressure(pressure) {
  if (!Number.isFinite(pressure)) {
    return 0;
  }
  const clamped = Math.min(1, Math.max(0, pressure));
  return Math.round(clamped * 0xffff);
}

/**
 * @param {TouchEvent} event
 */
function validate(event) {
  if (![ACTION.DOWN, ACTION.UP, ACTION.MOVE].includes(event.action)) {
    throw new AppError(ErrorCode.PROTOCOL, `Unsupported motion action: ${event.action}`, {
      hint: 'The PoC only emits DOWN, MOVE and UP; the server derives POINTER_* actions.',
    });
  }
  if (!Number.isInteger(event.pointerId) || event.pointerId < 0) {
    throw new AppError(ErrorCode.PROTOCOL, `pointerId must be a non-negative integer, got ${event.pointerId}`);
  }
  for (const key of ['x', 'y']) {
    const value = /** @type {number} */ (event[/** @type {'x'|'y'} */ (key)]);
    if (!Number.isInteger(value)) {
      throw new AppError(ErrorCode.PROTOCOL, `${key} must be an integer (device pixels), got ${value}`);
    }
  }
  if (event.screenWidth < 1 || event.screenWidth > 0xffff || event.screenHeight < 1 || event.screenHeight > 0xffff) {
    throw new AppError(
      ErrorCode.PROTOCOL,
      `screen size ${event.screenWidth}x${event.screenHeight} does not fit the protocol's uint16 fields`,
    );
  }
}

/**
 * Human-readable dump used by the log; matches the semantics of scrcpy's own
 * verbose control-message logging so cross-checking is easy.
 * @param {Buffer} buffer
 */
export function describeTouch(buffer) {
  const action = buffer[1];
  const label = action === ACTION.DOWN ? 'DOWN' : action === ACTION.UP ? 'UP' : action === ACTION.MOVE ? 'MOVE' : `?${action}`;
  return {
    action: label,
    pointerId: buffer.readBigUInt64BE(2).toString(),
    x: buffer.readInt32BE(10),
    y: buffer.readInt32BE(14),
    pressure: (buffer.readUInt16BE(22) / 0xffff).toFixed(3),
  };
}
