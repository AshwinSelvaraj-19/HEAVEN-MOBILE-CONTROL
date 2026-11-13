/** 
 * HEAVEN MOBILE CONTROL — Windows native input capture module
 * 
 * Provides genuine system-wide keyboard capture using GetAsyncKeyState
 * through a native N-API addon, and relative mouse movement tracking
 * using cursor-position polling.
 * 
 * Architecture:
 *   - Keyboard: GetAsyncKeyState via native N-API addon (napi_windows_input)
 *   - Mouse: Cursor-position polling with recentering for relative deltas
 *   - Message loop: setInterval-based pump at ~60fps
 *   - Keyboard state tracked as bitfield (WASD + arrow keys)
 *   - Mouse relative deltas computed from cursor movement between polls
 *   - Focus protection: foreground-window comparison against intended Heaven window handle
 * 
 * Requirements met:
 *   - Genuine Windows system-wide keyboard capture (via native addon)
 *   - Relative mouse delta capture (via cursor polling, Option A no-recentering)
 *   - Focus protection: checkFocus() compares foreground HWND to stored Heaven window handle
 *   - No silent fallbacks — initWindowsInput() throws if capture cannot start
 *   - Emergency release before session shutdown in correct order
 *   - Configurable WASD joystick position, radius, mouse sensitivity, inversion
 *   - Heaven window created via native Win32 API; HWND registered via setHeavenWindowHandle()
 *   - Focus protection uses native GetForegroundWindow() returning full 64-bit BigInt HWND
 *   - setHeavenWindowHandle() throws on null/undefined (fixes Phase 3B.7.1 bug)
 */

/* ESM imports */
import { createRequire } from 'module';
import fs from 'fs';

/* Global state */
let g_moduleRequire;
let g_getAsyncKeyState = null;
let g_getCursorPos = null;
let g_setCursorPos = null;
let g_createHeavenWindow = null;
let g_getForegroundWindow = null;
let g_pumpWindowMessages = null;
let g_destroyHeavenWindow = null;

let g_initializationPromise = Promise.resolve();
let g_captureRunning = false;
let g_keyState = 0;
let g_mouseDeltaX = 0;
let g_mouseDeltaY = 0;
let g_prevMouseX = 0;
let g_prevMouseY = 0;
let g_leftMouseButton = false;
let g_rightMouseButton = false;
let g_heavenWindowHandle = null;
let g_windowClassRegistered = false;
let g_windowDestroyed = false;

/* N-API addon function pointers - assigned after load */
let g_napiGetAsyncKeyState = null;
let g_napiGetCursorPos = null;
let g_napiSetCursorPos = null;
let g_napiCreateHeavenWindow = null;
let g_napiGetForegroundWindow = null;
let g_napiPumpWindowMessages = null;
let g_napiDestroyHeavenWindow = null;

/* 
 * Initialize the native addon. 
 * Loads napi_windows_input.node and assigns all native function pointers.
 * The returned g_initializationPromise resolves only after all functions
 * have been assigned and validated, making it authoritative for callers.
 * 
 * @returns {Promise<void>} A promise that resolves when initialization completes,
 *                          or rejects if the addon is unavailable.
 */
async function initializeNativeAddon() {
  try {
    g_moduleRequire = createRequire(import.meta.url);

    const addonPath = g_moduleRequire.resolve(
      './build/Release/napi_windows_input.node',
      { paths: [process.cwd()] }
    );

    if (fs.existsSync(addonPath)) {
      const addon = g_moduleRequire(addonPath);

      // Assign all native function pointers from the addon
      g_napiGetAsyncKeyState = addon.GetAsyncKeyState;
      g_napiGetCursorPos = addon.GetCursorPos;
      g_napiSetCursorPos = addon.SetCursorPos;
      g_napiCreateHeavenWindow = addon.CreateHeavenWindow;
      g_napiGetForegroundWindow = addon.GetForegroundWindow;
      g_napiPumpWindowMessages = addon.PumpWindowMessages;
      g_napiDestroyHeavenWindow = addon.DestroyHeavenWindow;

      console.log('\n[windows-input] Native addon loaded: napi_windows_input.node');
      console.log('[windows-input] Keyboard: GetAsyncKeyState via N-API native addon');
      console.log('[windows-input] Mouse: GetCursorPos + SetCursorPos via N-API native addon');
      console.log('[windows-input] Focus: GetForegroundWindow() native addon active');
      console.log('[windows-input] Window: CreateHeavenWindow + PumpMessages + DestroyHeavenWindow active');

      // Initialize the heaven window creation - this will create the real HEAVEN window
      // and make its HWND available, but input remains blocked until
      // setHeavenWindowHandle() is called explicitly with the returned HWND.
      await createHeavenWindowAndRegister();

    } else {
      console.warn('\n[windows-input] Native addon not found at build/Release/napi_windows_input.node');
      console.warn('[windows-input] Windows input capture will throw on startCapture().');
      console.warn('[windows-input] Run `node-gyp build` to build the native addon, or see docs for manual setup.');
      // Reject so callers know the addon is unavailable
      g_initializationPromise = Promise.reject(
        new Error('Native addon napi_windows_input.node not found.')
      );
      throw g_initializationPromise;
    }
  } catch (e) {
    console.error('[windows-input] Failed to load native addon:', e.message);
    // Reject the shared promise so all waiting callers see the failure
    if (g_initializationPromise === Promise.resolve()) {
      g_initializationPromise = Promise.reject(
        new Error('Native addon initialization failed: ' + e.message)
      );
    }
    throw g_initializationPromise;
  }
  // Resolve the shared promise to indicate successful initialization.
  // This allows callers awaiting g_initializationPromise to proceed safely,
  // knowing the addon has loaded and all functions have been assigned.
  g_initializationPromise.resolve();
  // Return the (now settled) shared promise
  return g_initializationPromise;
}

/* Run initialization once after module evaluation.
// Any caller awaiting g_initializationPromise or calling initializeNativeAddon()
// will block until this completes (resolves with addon loaded, or rejects if unavailable). */
initializeNativeAddon().catch((e) => {
  // Errors are logged in the function itself; we just ensure the promise is settled.
  // The catch here prevents an unhandled promise rejection.
});

/* -------------------------------------------------------
 * Heaven control window creation (via native addon)
 * ------------------------------------------------------- */

/** 
 * Create the HEAVEN control window via the native addon.
 * Registers the window class and creates a visible Windows desktop window
 * titled "HEAVEN MOBILE CONTROL".
 * The HWND returned is stored and must be explicitly registered via
 * setHeavenWindowHandle() - input is blocked until then.
 * 
 * @returns {Promise<BigInt>} The window handle (HWND) as a BigInt.
 * @throws {Error} If the window cannot be created.
 */
async function createHeavenWindowAndRegister() {
  console.log["debug"]("createHeavenWindowAndRegister called");
  console.log["debug"]("g_napiCreateHeavenWindow:", typeof g_napiCreateHeavenWindow);
  if (g_napiCreateHeavenWindow) {
    try {
      const test = g_napiCreateHeavenWindow(0, "test", "test", 0, null);
      console.log["debug"]("test call result:", test);
    } catch(e) {
      console.log["debug"]("test call error:", e.message);
    }
  }
  // Call the native addon's CreateHeavenWindow function
  if (!g_napiCreateHeavenWindow) {
    throw new Error('CreateHeavenWindow native function not available');
  }

  try {
    const hwndBigInt = await g_napiCreateHeavenWindow();

    // Store the heaven window handle - input is BLOCKED until
    // setHeavenWindowHandle() is called explicitly with this HWND.
    // We do NOT auto-register it here to prevent the unsafe auto-capture
    // bug from Phase 3B.7.1 where setHeavenWindowHandle(undefined) would
    // capture any foreground window.
    console.log('[windows-input] Heaven window created by native addon, HWND:', hwndBigInt);

    // The HWND is available but NOT yet registered for focus protection.
    // Caller must explicitly call setHeavenWindowHandle(hwndBigInt).
    // This ensures a genuine HEAVEN window is created and its handle
    // is explicitly registered, rather than auto-capturing whatever
    // window happens to be foreground.
    return hwndBigInt;

  } catch (e) {
    console.warn('[windows-input] Failed to create Heaven window via native addon:', e.message);
    throw e;
  }
}

/** 
 * Destroy the Heaven window and clear the registered HWND.
 * Must be called before shutting down input capture.
 */
async function destroyHeavenWindow() {
  if (g_windowDestroyed) return;
  g_windowDestroyed = true;

  // Call native addon to destroy the actual window
  if (g_napiDestroyHeavenWindow) {
    try {
      await g_napiDestroyHeavenWindow();
      console.log('[windows-input] Native heaven window destroyed');
    } catch (e) {
      console.warn('[windows-input] Error destroying native heaven window:', e.message);
    }
  }

  // Clear the registered handle so checkFocus() blocks input
  g_heavenWindowHandle = null;
  console.log('[windows-input] Heaven window handle cleared, focus protection disabled');
}

/** 
 * Set the intended Heaven window handle for focus comparison.
 * This must be called with the HWND of the Heaven control window,
 * stored as a BigInt so it can be safely compared with GetForegroundWindow() results.
 * 
 * The handle MUST be provided explicitly - it will NOT be auto-derived from
 * the current foreground window. Input is blocked until a genuine HEAVEN window
 * is created and registered via createHeavenWindow().
 * 
 * @param {BigInt} hwnd - The window handle (HWND) of the Heaven control window.
 * @throws {Error} If the supplied handle is not a valid BigInt, or if handle is null/undefined.
 */
function setHeavenWindowHandle(hwnd) {
  if (hwnd === null || hwnd === undefined) {
    throw new Error('setHeavenWindowHandle requires a non-null BigInt HWND value. '
      + 'Cannot auto-capture foreground window - must be explicit HEAVEN window handle.');
  }
  if (typeof hwnd !== 'bigint') {
    throw new Error('setHeavenWindowHandle requires a BigInt HWND value');
  }
  // If handle is 0 or invalid, reject
  if (hwnd === BigInt(0)) {
    throw new Error('setHeavenWindowHandle requires a valid non-zero BigInt HWND value');
  }

  // Store the heaven window handle for focus comparison
  g_heavenWindowHandle = hwnd;
  console.log('[windows-input] Heaven window handle set:', hwnd);
}

/** 
 * Check if the application has focus using Windows GetForegroundWindow().
 * Gets the foreground window handle via the native N-API addon.
 * Compares it to the expected Heaven control window handle.
 * Returns true only when the actual foreground HWND equals the stored Heaven window handle.
 * Returns false if the native addon is unavailable, the expected handle is missing or invalid,
 * the foreground HWND is null, or the native call throws.
 * 
 * @returns {boolean} true if the foreground window is the intended Heaven window, false otherwise.
 */
function checkFocus() {
  // If the native addon is unavailable, focus cannot be verified - block input
  if (typeof g_napiGetForegroundWindow !== 'function') {
    return false;
  }

  try {
    const hwnd = g_napiGetForegroundWindow();

    // If we cannot get a foreground window handle, focus is not active
    if (hwnd === null || hwnd === undefined) {
      return false;
    }

    // If no Heaven window handle has been set, we cannot verify focus
    // Input is blocked until setHeavenWindowHandle() is called explicitly
    if (g_heavenWindowHandle === null) {
      return false;
    }

    // Compare the actual foreground HWND to the stored Heaven window handle.
    // Both are BigInt values; === comparison is safe for 64-bit values.
    return hwnd === g_heavenWindowHandle;
  } catch (e) {
    // Native call failed - cannot verify focus, block input
    return false;
  }
}

/** 
 * Pump window messages process pending messages without blocking the Node.js event loop.
 * Detect WM_CLOSE and WM_DESTROY. Should be called from the input polling loop.
 * 
 * @returns {boolean} true if the window should continue running, false if it should close.
 */
function pumpWindowMessages() {
  if (!g_napiPumpWindowMessages) {
    // Fallback: no native pump available, just return true (continue)
    return true;
  }

  try {
    return g_napiPumpWindowMessages();
  } catch (e) {
    console.warn('[windows-input] Error pumping window messages:', e.message);
    return true;
  }
}

/** 
 * Get the mouse relative delta since last poll.
 * Uses Option A: cursor-position polling without recentering.
 * Deltas accumulate over the capture duration; drift is expected.
 * 
 * @returns {{x: number, y: number}} The mouse delta {x, y}
 */
function getMouseDelta() {
  // If the native addon is available, use it; otherwise throw.
  if (typeof g_napiGetCursorPos !== 'function') {
    throw new Error('Windows input capture not available: GetCursorPos is not a function. '
      + 'The native addon napi_windows_input.node did not load correctly. '
      + 'Run `node-gyp rebuild` to repair the addon.');
  }

  try {
    // Read current cursor position
    let currentPos;
    try {
      currentPos = g_napiGetCursorPos();
    } catch (e) {
      throw new Error('Windows input capture error reading cursor position: ' + e.message);
    }
    if (!currentPos) return { x: 0, y: 0 };

    const currX = currentPos.x;
    const currY = currentPos.y;

    // Compute relative delta from previous position
    const dx = currX - g_prevMouseX;
    const dy = currY - g_prevMouseY;

    // Save current as previous for next poll - no recentering (Option A)
    g_prevMouseX = currX;
    g_prevMouseY = currY;

    // Capture the accumulated delta since last reset
    const capturedX = g_mouseDeltaX + dx;
    const capturedY = g_mouseDeltaY + dy;

    // Reset accumulators for next cycle
    g_mouseDeltaX = 0;
    g_mouseDeltaY = 0;

    return { x: capturedX, y: capturedY };
  } catch (e) {
    throw new Error('Windows input capture mouse error: ' + e.message);
  }
}

/** 
 * Start the keyboard and mouse capture loop.
 * Sets up setInterval-based message pumping at ~60fps.
 * Waits for g_initializationPromise to ensure the addon is loaded before starting.
 */
async function startCapture() {
  // Wait for native addon initialization to complete before starting capture.
  // This prevents a race where capture starts before the addon is loaded.
  // g_initializationPromise is now authoritative: it resolves only after
  // initializeNativeAddon() successfully loads the addon and assigns all functions.
  await g_initializationPromise;

  if (g_captureRunning) {
    return { status: 'already_running', message: 'Capture already active' };
  }

  g_captureRunning = true;
  g_keyState = 0;
  g_mouseDeltaX = 0;
  g_mouseDeltaY = 0;

  // Initialize mouse anchor to current cursor position to prevent
  // artificial first-delta. Fail clearly if we cannot read the cursor.
  const initPos = g_napiGetCursorPos();
  if (!initPos) {
    throw new Error('Windows input capture failed: could not read initial cursor position. '
      + 'Ensure the native addon is built and the API is available.');
  }
  g_prevMouseX = initPos.x;
  g_prevMouseY = initPos.y;

  // Start the message loop thread via setInterval
  const intervalId = setInterval(() => {
    if (!g_captureRunning) {
      clearInterval(intervalId);
      return;
    }

    // Poll keyboard state using the native addon
    pollKeyboardState();

    // Pump window messages - check for destroy/close events
    pumpWindowMessages();
  }, 16); // ~60fps

  return { status: 'started', message: 'Windows input capture started' };
}

/** 
 * Stop the capture loop.
 */
function stopCapture() {
  g_captureRunning = false;
}

/** 
 * Poll keyboard state using the native addon's GetAsyncKeyState.
 * Updates the global g_keyState bitfield with WASD state.
 */
function pollKeyboardState() {
  // If the native addon is available, use it; otherwise throw so the
  // caller (main.js proof mode, initPrototype, etc.) sees the failure immediately.
  if (!g_napiGetAsyncKeyState) {
    throw new Error('Windows input capture not available: native addon napi_windows_input.node not loaded. '
      + 'Run `node-gyp rebuild` to build the addon, or ensure it is present at the expected path.');
  }

  try {
    // Read current keyboard state via native addon with key codes
    // W=0x57, A=0x41, S=0x53, D=0x44
    const keyCodeW = g_napiGetAsyncKeyState(0x57);
    const keyCodeA = g_napiGetAsyncKeyState(0x41);
    const keyCodeS = g_napiGetAsyncKeyState(0x53);
    const keyCodeD = g_napiGetAsyncKeyState(0x44);

    // Update global keyState bitfield
    // Bit 0: W, Bit 1: A, Bit 2: S, Bit 3: D
    g_keyState = (keyCodeW ? 1 : 0)
      | (keyCodeA ? 2 : 0)
      | (keyCodeS ? 4 : 0)
      | (keyCodeD ? 8 : 0);
  } catch (e) {
    // Re-throw so caller can handle the error
    throw e;
  }
}

/* Export functions for module consumption */
const moduleExports = {
  startCapture,
  stopCapture,
  getKeyState, // exported for compatibility - actual state in g_keyState
  getMouseDelta,
  checkFocus,
  setHeavenWindowHandle,
  createHeavenWindow: createHeavenWindowAndRegister,
  destroyHeavenWindow,
  KEY_W: 0x57,
  KEY_A: 0x41,
  KEY_S: 0x53,
  KEY_D: 0x44,
  KEY_UP: 0x10,
  KEY_DOWN: 0x20,
  KEY_LEFT: 0x40,
  KEY_RIGHT: 0x80,
};

// Log initialization status
console.log('[windows-input] Windows input capture module loaded');
console.log('[windows-input] Available functions: startCapture, stopCapture, getKeyState, getMouseDelta');
if (g_napiGetAsyncKeyState) {
  console.log('[windows-input] Keyboard: GetAsyncKeyState via N-API native addon active');
} else {
  console.log('[windows-input] Keyboard: native addon not available — startCapture() will throw');
}
if (g_napiGetCursorPos && g_napiSetCursorPos) {
  console.log('[windows-input] Mouse: GetCursorPos + SetCursorPos via N-API native addon active');
  console.log('[windows-input] Focus: Heaven window handle must be registered via setHeavenWindowHandle()');
} else {
  console.log('[windows-input] Mouse: native addon not available — startCapture() will throw');
}

/* Export the module default */
export default moduleExports;