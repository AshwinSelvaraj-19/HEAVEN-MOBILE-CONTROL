/**
 * Multi-pointer bookkeeping.
 *
 * The server owns the Android MotionEvent: it rewrites our DOWN into
 * ACTION_POINTER_DOWN (with the right index) whenever other pointers are
 * present. So the client's whole job is to keep an accurate list of ids that
 * are down and to send DOWN / MOVE / UP for them.
 *
 * Invariants this class enforces (all of them matter, see protocol.js):
 *   1. Never MOVE or UP an id that is not down  -> the server would allocate a
 *      phantom pointer that never lifts.
 *   2. Never exceed 10 simultaneous pointers    -> PointersState.MAX_POINTERS.
 *   3. Panic release is N sequential ACTION_UP  -> CANCEL does not clear state.
 */

import { AppError, ErrorCode } from './errors.js';
import { ACTION, MAX_POINTERS, serializeTouchEvent } from './protocol.js';

/** How long UP events may take to flush on the panic path. */
const PANIC_FLUSH_MS = 500;

export class PointerManager {
  /**
   * @param {object} options
   * @param {import('./session.js').ScrcpySession} options.session
   * @param {{width: number, height: number}} options.screen
   * @param {import('./log.js').Logger} options.logger
   */
  constructor(options) {
    this.session = options.session;
    this.screen = options.screen;
    this.logger = options.logger;

    /**
     * @type {Map<string, {id: number, x: number, y: number, downAt: number, moves: number, lastSentAt: number}>}
     */
    this.active = new Map();
    this.nextId = 1;
    this.panicCount = 0;
    this.totalMessages = 0;
    /** @type {((name: string, action: string, x: number, y: number) => void)[]} */
    this.listeners = [];
  }

  /** @param {(name: string, action: string, x: number, y: number) => void} listener */
  onEvent(listener) {
    this.listeners.push(listener);
  }

  /**
   * @param {string} name logical slot name, e.g. 'A'
   * @param {number} x
   * @param {number} y
   */
  down(name, x, y) {
    if (this.active.has(name)) {
      throw new AppError(ErrorCode.POINTER_STATE, `Pointer ${name} is already down`);
    }
    if (this.active.size >= MAX_POINTERS) {
      throw new AppError(ErrorCode.POINTER_LIMIT, `Already ${MAX_POINTERS} pointers down`);
    }

    const point = this.#clamp(x, y);
    const pointer = {
      id: this.nextId++,
      x: point.x,
      y: point.y,
      downAt: Date.now(),
      moves: 0,
      lastSentAt: Date.now(),
    };
    this.active.set(name, pointer);
    this.#send(ACTION.DOWN, pointer, point.x, point.y);
    this.#emit(name, 'down', point.x, point.y);
    return pointer;
  }

  /**
   * @param {string} name
   * @param {number} x
   * @param {number} y
   */
  move(name, x, y) {
    const pointer = this.active.get(name);
    if (!pointer) {
      throw new AppError(ErrorCode.POINTER_STATE, `Cannot move pointer ${name}: it is not down`);
    }
    const point = this.#clamp(x, y);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.moves++;
    this.#send(ACTION.MOVE, pointer, point.x, point.y);
    this.#emit(name, 'move', point.x, point.y);
  }

  /**
   * @param {string} name
   */
  up(name) {
    const pointer = this.active.get(name);
    if (!pointer) {
      throw new AppError(ErrorCode.POINTER_STATE, `Cannot lift pointer ${name}: it is not down`);
    }
    this.active.delete(name);
    this.#send(ACTION.UP, pointer, pointer.x, pointer.y);
    this.#emit(name, 'up', pointer.x, pointer.y);
    return pointer;
  }

  /**
   * Release every pointer that is down. Safe to call repeatedly and from any
   * exit path; returns how many pointers were released.
   * @param {string} reason
   * @returns {Promise<number>}
   */
  async panic(reason) {
    if (this.active.size === 0) {
      return 0;
    }
    const entries = [...this.active.entries()].sort((a, b) => b[1].downAt - a[1].downAt);
    this.logger.warn('panic release', { reason, pointers: entries.map(([name]) => name) });

    let released = 0;
    for (const [name, pointer] of entries) {
      try {
        this.active.delete(name);
        this.#send(ACTION.UP, pointer, pointer.x, pointer.y);
        this.#emit(name, 'panic-up', pointer.x, pointer.y);
        released++;
      } catch (error) {
        this.logger.error('panic release failed', {
          pointer: name,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.active.clear();
    this.panicCount++;

    try {
      await this.session.requireChannel().flush(PANIC_FLUSH_MS);
    } catch (error) {
      this.logger.warn('panic flush failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return released;
  }

  snapshot() {
    return {
      active: [...this.active.entries()].map(([name, pointer]) => ({
        name,
        id: pointer.id,
        x: pointer.x,
        y: pointer.y,
        moves: pointer.moves,
        heldMs: Date.now() - pointer.downAt,
      })),
      count: this.active.size,
      totalMessages: this.totalMessages,
      panics: this.panicCount,
      screen: this.screen,
    };
  }

  /**
   * @param {number} action
   * @param {{id: number}} pointer
   * @param {number} x
   * @param {number} y
   */
  #send(action, pointer, x, y) {
    const channel = this.session.requireChannel();
    const buffer = serializeTouchEvent({
      action,
      pointerId: pointer.id,
      x,
      y,
      screenWidth: this.screen.width,
      screenHeight: this.screen.height,
      pressure: action === ACTION.UP ? 0 : 1,
    });
    channel.send(buffer);
    this.totalMessages++;
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  #clamp(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new AppError(ErrorCode.PROTOCOL, `Invalid coordinates: ${x},${y}`);
    }
    return {
      x: Math.min(this.screen.width - 1, Math.max(0, Math.round(x))),
      y: Math.min(this.screen.height - 1, Math.max(0, Math.round(y))),
    };
  }

  /**
   * @param {string} name
   * @param {string} action
   * @param {number} x
   * @param {number} y
   */
  #emit(name, action, x, y) {
    for (const listener of this.listeners) {
      listener(name, action, x, y);
    }
  }
}
