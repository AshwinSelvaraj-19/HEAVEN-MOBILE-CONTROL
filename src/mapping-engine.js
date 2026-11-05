/**
 * Keyboard and mouse mapping engine for HEAVEN MOBILE CONTROL — Phase 3A.
 *
 * Responsibilities:
 *  - Track key states (WASD, modifiers) and mouse deltas.
 *  - Delegate ALL pointer allocation/lifecycle to PointerManager (authoritative).
 *  - Persistent virtual joystick pointer for WASD (stays down until all movement keys released).
 *  - Relative mouse camera movement with configurable sensitivity and anchor.
 *  - Emergency release of all locally tracked active pointers.
 *  - Proper cleanup of pending timers and event state.
 *
 * CRITICAL ARCHITECTURE RULES (enforced by design, not just commentary):
 *  - PointerManager is the ONLY component responsible for pointer allocation and lifecycle.
 *  - MappingEngine never constructs pointer IDs manually.
 *  - MappingEngine never calls session.requireChannel() or serializeTouchEvent() directly.
 *  - Pointer ID collisions are prevented by PointerManager invariants (down-throws-if-active, etc.).
 *  - Pointer state is NOT duplicated outside PointerManager; MappingEngine tracks only derived state.
 *  - Emergency release does NOT claim remote success if connection is already lost; it only cancels local tracking.
 */

import { AppError, ErrorCode } from './errors.js';
import { ACTION, MAX_POINTERS } from './protocol.js';

/**
 * @typedef {object} JoystickConfig
 * @property {number} centerX  X coordinate as screen percentage (0.0 - 1.0), default 0.5
 * @property {number} centerY  Y coordinate as screen percentage (0.0 - 1.0), default 0.5
 * @property {number} radiusX  Horizontal radius as screen percentage, default 0.3
 * @property {number} radiusY  Vertical radius as screen percentage, default 0.3
 */

/**
 * @typedef {object} MouseConfig
 * @property {number} sensitivity  Multiplier for relative mouse movement, default 1.0
 * @property {number} anchorX      X anchor as screen percentage (0.0 - 1.0), default 0.5
 * @property {number} anchorY      Y anchor as screen percentage (0.0 - 1.0), default 0.5
 */

/**
 * MappingEngine — converts keyboard and mouse events into controlled pointer
 * operations via the authoritative PointerManager.  Does NOT duplicate pointer
 * state; all pointer allocation/lifecycle passes through PointerManager.
 */
export class MappingEngine {
  /**
   * @param {import('./pointers.js').PointerManager} pm  Authoritative pointer-state manager.
   * @param {{width: number, height: number}} screen                                       Screen geometry.
   * @param {object} [options]                                                         Optional configuration.
   */
  constructor(pm, screen, options = {}) {
    if (typeof pm !== 'object' || typeof pm.down !== 'function') {
      throw new TypeError('MappingEngine requires a valid PointerManager instance');
    }
    this.pm = pm;
    this.screen = screen;

    // ---- WASD / persistent virtual joystick ----
    this.keyState = Object.fromEntries(
      ['w', 'a', 's', 'd'].map(k => [k, false])
    );
    this.wasdPressed = false;           // true after first movement key down
    this.joystickPointerDown = false;   // tracks if PointerManager has 'joystick' down
    this.joystickCenter = { x: 0.5, y: 0.5 };     // percentages
    this.joystickRadius = { x: 0.3, y: 0.3 };     // percentages of screen

    // ---- Relative mouse camera ----
    this.mouseDelta = { x: 0, y: 0 };
    this.mouseSensitivity = options.mouseSensitivity !== undefined
      ? Math.max(0, options.mouseSensitivity)
      : 1.0;
    this.mouseAnchor = {
      x: options.mouseAnchorX !== undefined ? Math.max(0, Math.min(1, options.mouseAnchorX)) : 0.5,
      y: options.mouseAnchorY !== undefined ? Math.max(0, Math.min(1, options.mouseAnchorY)) : 0.5,
    };
    this.mousePressed = false;          // true when mouse button held for camera
    this.cameraPointerDown = false;     // tracks if PointerManager has 'camera' pointer down

    // ---- Timers / event state cleanup ----
    this._cleanupTimers = new Map(); // name -> timeoutId
  }

  /** -------------------------------------------------------------
   *  KEY STATE TRACKING (WASD + combined direction)
   *  ------------------------------------------------------------- */

  /**
   * Called when a key is pressed down.  Movement keys (W A S D) start the
   * persistent virtual joystick pointer if this is the first one.
   * @param {string} key - lower-case key identifier: 'w'|'a'|'s'|'d'
   */
  keyDown(key) {
    if (!this.keyState.hasOwnProperty(key)) {
      throw new Error(`Unrecognized key: ${key}`);
    }
    this.keyState[key] = true;

    if (this._isMovementKey(key)) {
      if (!this.wasdPressed) {
        this.wasdPressed = true;
        this._startJoystickPointer();
      }
      this._updateJoystickDirection();
    }
  }

  /**
   * Called when a key is released.  If this was the last movement key,
   * the persistent joystick pointer is released.
   * @param {string} key - lower-case key identifier
   */
  keyUp(key) {
    if (!this.keyState.hasOwnProperty(key)) {
      throw new Error(`Unrecognized key: ${key}`);
    }
    this.keyState[key] = false;

    if (this._isMovementKey(key)) {
      if (this._noMovementKeysDown()) {
        // Last movement key released — release the joystick pointer
        this._releaseJoystickPointer();
        this.wasdPressed = false;
      } else {
        // Other movement keys still down — update direction
        this._updateJoystickDirection();
      }
    }
  }

  /**
   * Returns true if the given key is one of the four movement keys.
   * @private
   */
  _isMovementKey(key) {
    return key === 'w' || key === 'a' || key === 's' || key === 'd';
  }

  /**
   * Returns true if NO movement key is currently down.
   * @private
   */
  _noMovementKeysDown() {
    return !Object.keys(this.keyState).some(k => this._isMovementKey(k) && this.keyState[k]);
  }

  /** -------------------------------------------------------------
   *  CALCULATE COMBINED DIRECTION FROM PRESSED KEYS
   *  ------------------------------------------------------------- */

  /**
   * Calculate the combined direction from all currently pressed movement keys.
   * - Opposing keys (W+S or A+D) cancel each other out (net zero).
   * - Diagonal movement is normalized (divide by hypot(dirX, dirY)) so speed
   *   is consistent whether moving cardinal or diagonal.
   * - The resulting direction is applied within the configured joystick radius.
   * @private
   */
  _updateJoystickDirection() {
    // Gather directional components from pressed keys
    let dirX = 0, dirY = 0;
    const pressed = Object.keys(this.keyState).filter(k => this._isMovementKey(k) && this.keyState[k]);

    for (const k of pressed) {
      if (k === 'w') dirY -= 1;   // forward subtracts from Y (screen coords)
      if (k === 's') dirY += 1;   // backward adds to Y
      if (k === 'a') dirX -= 1;   // left subtracts from X
      if (k === 'd') dirX += 1;   // right adds to X
    }

    // Normalize: if both X and Y have non-zero components, divide by length.
    // This prevents diagonal movement from being faster than cardinal.
    const norm = Math.hypot(dirX, dirY);
    if (norm > 0) {
      dirX /= norm;
      dirY /= norm;
    }

    // Apply radius and center, then clamp to screen boundaries
    const cx = this.joystickCenter.x * this.screen.width;
    const cy = this.joystickCenter.y * this.screen.height;
    const rx = this.joystickRadius.x * this.screen.width;
    const ry = this.joystickRadius.y * this.screen.height;

    const ox = dirX * rx;
    const oy = dirY * ry;
    const nx = cx + ox;
    const ny = cy + oy;

    const clamped = {
      x: Math.max(0, Math.min(this.screen.width - 1, Math.round(nx))),
      y: Math.max(0, Math.min(this.screen.height - 1, Math.round(ny)))
    };

    // Delegate to PointerManager — it owns pointer lifecycle.
    // If the 'joystick' name is already down, PointerManager will throw;
    // that is intentional enforcement, not a MappingEngine bug.
    if (this.joystickPointerDown) {
      this.pm.move('joystick', nx, ny);
    } else {
      // First move after start — down() was already called in _startJoystickPointer()
      // but we re-apply the position here so the pointer lands correctly.
      // This branch is technically unreachable if _startJoystickPointer() ran,
      // but we keep it for defense-in-depth.
      if (!this.joystickPointerDown && this.pm.active.has('joystick')) {
        this.pm.move('joystick', nx, ny);
      }
    }
  }

  /** -------------------------------------------------------------
   *  PERSISTENT VIRTUAL JOYSTICK POINTER
   *  ------------------------------------------------------------- */

  /**
   * Start the persistent virtual joystick pointer via PointerManager.
   * The pointer stays down until the last movement key is released.
   * @private
   */
  _startJoystickPointer() {
    const centerX = this.screen.width * this.joystickCenter.x;
    const centerY = this.screen.height * this.joystickCenter.y;
    try {
      this.pm.down('joystick', centerX, centerY);
      this.joystickPointerDown = true;
    } catch (e) {
      // PointerManager may throw if 'joystick' is already down (should not happen
      // if logic is correct, but we guard against it).
      this.loggerWarn('_startJoystickPointer', e);
    }
  }

  /**
   * Release the persistent joystick pointer via PointerManager.
   * Called only when the last movement key has been released.
   * @private
   */
  _releaseJoystickPointer() {
    if (this.joystickPointerDown) {
      try {
        this.pm.up('joystick');
      } catch (e) {
        this.loggerWarn('_releaseJoystickPointer', e);
      }
      this.joystickPointerDown = false;
    }
  }

  /** -------------------------------------------------------------
   *  MOUSE CAMERA (relative deltas, configurable anchor & sensitivity)
   *  ------------------------------------------------------------- */

  /**
   * Accumulate relative mouse deltas.  When the mouse button is held
   * (camera mode), the accumulated delta is sent to PointerManager as a MOVE.
   * @param {number} dx - relative X movement (pixels or UI units)
   * @param {number} dy - relative Y movement (pixels or UI units)
   */
  mouseMove(dx, dy) {
    this.mouseDelta.x += dx;
    this.mouseDelta.y += dy;

    if (!this.mousePressed) {
      // Camera not active; just accumulate delta for potential future use.
      return;
    }

    // Apply sensitivity scaling
    const sx = this.mouseDelta.x * this.mouseSensitivity;
    const sy = this.mouseDelta.y * this.mouseSensitivity;

    // Calculate raw position relative to the configured anchor
    const ax = this.mouseAnchor.x * this.screen.width;
    const ay = this.mouseAnchor.y * this.screen.height;
    let x = ax + sx;
    let y = ay + sy;

    // Clamp to screen boundaries and detect edge hits
    const rawX = Math.round(x);
    const rawY = Math.round(y);
    const xClamped = Math.max(0, Math.min(this.screen.width - 1, rawX));
    const yClamped = Math.max(0, Math.min(this.screen.height - 1, rawY));

    // Boundary rebasing: if the raw position was clamped to a screen edge,
    // shift the anchor so continued relative movement in the same direction
    // continues from the opposite side, enabling unbounded camera control.
    // Also reset mouseDelta so relative movement starts fresh from the new anchor.
    const hitLeft = rawX < 0;
    const hitRight = rawX > this.screen.width - 1;
    const hitTop = rawY < 0;
    const hitBottom = rawY > this.screen.height - 1;

    if (hitLeft) {
      // Moved past left edge — shift anchor right to allow continued leftward movement
      this.mouseAnchor.x = Math.min(1.0, this.mouseAnchor.x + 0.1);
    }
    if (hitRight) {
      // Moved past right edge — shift anchor left to allow continued rightward movement
      this.mouseAnchor.x = Math.max(0.0, this.mouseAnchor.x - 0.1);
    }
    if (hitTop) {
      // Moved past top edge — shift anchor down to allow continued upward movement
      this.mouseAnchor.y = Math.min(1.0, this.mouseAnchor.y + 0.1);
    }
    if (hitBottom) {
      // Moved past bottom edge — shift anchor up to allow continued downward movement
      this.mouseAnchor.y = Math.max(0.0, this.mouseAnchor.y - 0.1);
    }

    // Reset accumulated delta after boundary rebasing so relative movement
    // continues correctly from the new anchor position
    this.mouseDelta = { x: 0, y: 0 };

    // Use clamped position for pointer (guaranteed within screen bounds)
    const cx = xClamped;
    const cy = yClamped;

    // Delegate to PointerManager — it owns pointer lifecycle.
    if (this.cameraPointerDown) {
      this.pm.move("camera", cx, cy);
    }
  }

  /**
   * Mouse button pressed — starts the camera pointer lifecycle (DOWN).
   * After this, mouseMove() will send MOVE events; mouseUp() will send UP.
   */
  mouseDown() {
    this.mousePressed = true;
    this.mouseDelta = { x: 0, y: 0 }; // reset accumulation at press

    const x = this.mouseAnchor.x * this.screen.width;
    const y = this.mouseAnchor.y * this.screen.height;
    try {
      this.pm.down('camera', x, y);
      this.cameraPointerDown = true;
    } catch (e) {
      this.loggerWarn('mouseDown', e);
    }
  }

  /**
   * Mouse button released — ends the camera pointer lifecycle (UP).
   * After this, mouseMove() stops sending MOVE events.
   */
  mouseUp() {
    this.mousePressed = false;

    if (this.cameraPointerDown) {
      try {
        this.pm.up('camera');
      } catch (e) {
        this.loggerWarn('mouseUp', e);
      }
      this.cameraPointerDown = false;
    }
    // Reset accumulated delta so a new press starts cleanly
    this.mouseDelta = { x: 0, y: 0 };
  }

  /** -------------------------------------------------------------
   *  CONFIGURATION ACCESSORS
   *  ------------------------------------------------------------- */

  setJoystickCenter(center) {
    // center: { x: number, y: number } percentages (0.0 - 1.0)
    if (typeof center !== 'object' || center === null) {
      throw new TypeError('setJoystickCenter expects { x: number, y: number }');
    }
    this.joystickCenter = {
      x: Math.max(0, Math.min(1, center.x)),
      y: Math.max(0, Math.min(1, center.y)),
    };
  }

  setJoystickRadius(radius) {
    // radius: { x: number, y: number } percentages (0.0 - 1.0)
    if (typeof radius !== 'object' || radius === null) {
      throw new TypeError('setJoystickRadius expects { x: number, y: number }');
    }
    this.joystickRadius = {
      x: Math.max(0, Math.min(1, radius.x)),
      y: Math.max(0, Math.min(1, radius.y)),
    };
  }

  setSensitivity(sensitivity) {
    this.mouseSensitivity = Math.max(0, sensitivity);
  }

  setMouseAnchor(anchor) {
    if (typeof anchor !== 'object' || anchor === null) {
      throw new TypeError('setMouseAnchor expects { x: number, y: number }');
    }
    this.mouseAnchor = {
      x: Math.max(0, Math.min(1, anchor.x)),
      y: Math.max(0, Math.min(1, anchor.y)),
    };
  }

  /** -------------------------------------------------------------
   *  EMERGENCY RELEASE & CLEANUP
   *  ------------------------------------------------------------- */

  /**
   * Release ALL locally tracked active pointers.
   * - Calls PointerManager.panic() which sends N × ACTION_UP.
   * - Does NOT claim the remote release succeeded if the device connection
   *   has already been lost; it only cancels local tracking.
   * - Clears all pending timers.
   * @param {string} [reason] - optional label for the panic log
   */
  emergencyRelease(reason) {
    // PointerManager.panic() handles N × ACTION_UP and session flush.
    try {
      this.pm.panic(reason ?? 'emergency-release');
    } catch (e) {
      this.loggerWarn('emergencyRelease panic', e);
    }

    // Clean up our internal state regardless of remote outcome.
    this.wasdPressed = false;
    this.joystickPointerDown = false;
    this.cameraPointerDown = false;
    this.mousePressed = false;
    this.mouseDelta = { x: 0, y: 0 };
    // Reset all four movement key states
    this.keyState.w = false;
    this.keyState.a = false;
    this.keyState.s = false;
    this.keyState.d = false;

    // Clear any pending timers
    this._clearAllTimers();
  }

  _clearAllTimers() {
    this._cleanupTimers.forEach((id, name) => {
      clearTimeout(id);
    });
    this._cleanupTimers.clear();
  }

  /** -------------------------------------------------------------
   *  UTILITY: logger sink (minimal, no external deps)
   *  ------------------------------------------------------------- */
  loggerWarn(context, error) {
    // Minimal console warning; callers may replace with their own logger.
    console.warn(`[MappingEngine ${context}] ${error instanceof Error ? error.message : String(error)}`);
  }
}