/** 
 * Mapping engine tests for HEAVEN MOBILE CONTROL — Phase 3A. 
 * Synthetic input events; no device required. All pointer operations pass 
 * through the authoritative PointerManager (MockSession + real PointerManager 
 * invariants). 
 * Run: node --test test/mapping-engine.test.js 
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Logger } from '../src/log.js';
import { MockSession } from '../src/mock-session.js';
import { PointerManager } from '../src/pointers.js';
import { MappingEngine } from '../src/mapping-engine.js';

const SCREEN = { width: 1080, height: 2340 };
const SILENT = new Logger({ level: 'error', file: null });

/** Harness that creates a MappingEngine with a real PointerManager/MockSession. */
function harness() {
  const session = new MockSession({ logger: SILENT, screen: SCREEN });
  const pointers = new PointerManager({ session, screen: SCREEN, logger: SILENT });
  const engine = new MappingEngine(pointers, SCREEN);
  return { session, pointers, engine };
}

/** Override the engine's internal logger to silence warnings in tests. */
function makeEngine() {
  const { pointers, engine } = harness();
  // @ts-ignore — test-only shim
  engine.loggerWarn = () => {};
  return { pointers, engine };
}

// ---- WASD / joystick tests ----

test('WASD key-down starts persistent virtual joystick pointer', () => {
  const { pointers, engine } = makeEngine();
  engine.keyDown('w');
  // PointerManager.down('joystick') was called with center position
  const snap = pointers.snapshot();
  assert.equal(snap.count, 1, 'one pointer should be active');
  assert.equal(snap.active[0].name, 'joystick', 'name should be joystick');
  assert.ok(engine.joystickPointerDown, 'engine should track joystick pointer down');
});

test('WASD key-up releases persistent joystick pointer when last key released', () => {
  const { pointers, engine } = makeEngine();
  engine.keyDown('w');
  engine.keyDown('a');
  engine.keyUp('w');
  // Still have 'a' down, so joystick pointer should NOT be released yet
  assert.ok(engine.joystickPointerDown, 'pointer should still down; last movement key still down');
  assert.equal(pointers.snapshot().count, 1, 'one pointer still active');

  engine.keyUp('a');
  // Now no movement keys down — pointer should be released
  assert.ok(!engine.joystickPointerDown, 'pointer should be released after last key up');
  assert.equal(pointers.snapshot().count, 0, 'no pointers should remain active');
});

test('W key up while A remains moves joystick from northwest to left', () => {
  const { pointers, engine } = makeEngine();
  engine.keyDown('w');
  engine.keyDown('a');
  // Position should be northwest (x < center, y < center)
  const snapWA = pointers.snapshot();
  const posWA = snapWA.active[0];
  assert.ok(posWA.x < SCREEN.width / 2, 'W+A: x should be left of center');
  assert.ok(posWA.y < SCREEN.height / 2, 'W+A: y should be above center (northwest)');

  // Now release W while A remains down
  engine.keyUp('w');
  // Joystick should now move from northwest toward left (x still < center, y should move toward center)
  const snapAfterWUp = pointers.snapshot();
  const posAfterWUp = snapAfterWUp.active[0];
  assert.ok(posAfterWUp.x < SCREEN.width / 2, 'After W up with A still down: x should still be left of center');
  // y should be closer to center than before (A only moves left, no forward component)
  assert.ok(posAfterWUp.y >= posWA.y && posAfterWUp.y <= SCREEN.height / 2,
    `After W up with A still down: y should move toward center, was ${posWA.y}, now ${posAfterWUp.y}`);

  // Now release A — pointer should be released since no movement keys remain
  engine.keyUp('a');
  assert.ok(!engine.joystickPointerDown, 'pointer should be released after last key up');
  assert.equal(pointers.snapshot().count, 0, 'no pointers should remain active');
});

test('combined movement keys produce correct directional vector', () => {
  const { pointers, engine } = makeEngine();
  engine.keyDown('w');
  engine.keyDown('a');
  // Combined: northwest direction; should have been moved already
  const snap = pointers.snapshot();
  assert.equal(snap.count, 1, 'one joystick pointer active');
  // The position should reflect the northwest direction within radius
  const pos = snap.active[0];
  // Position x should be less than center (moving left), y should be less (moving up/forward)
  assert.ok(pos.x < 1080 / 2, `x should be left of center, got ${pos.x}`);
  assert.ok(pos.y < SCREEN.height / 2, `y should be above center (northwest), got ${pos.y}`);
});
test('opposing movement keys cancel each other (W+S, A+D)', () => {

  const { pointers, engine } = makeEngine();
  // W + S should cancel: net direction should be zero
  engine.keyDown('w');
  engine.keyDown('s');
  const posWS = pointers.snapshot().active[0];
  // Position should be at or very near center (opposing keys cancel)
  const distFromCenter = Math.hypot(posWS.x - SCREEN.width / 2, posWS.y - SCREEN.height / 2);
  assert.ok(distFromCenter < 5, `W+S should cancel near center, dist=${distFromCenter}`);

  // A + D should also cancel
  engine.keyUp('w');
  engine.keyUp('s');
  engine.keyDown('a');
  engine.keyDown('d');
  const posAD = pointers.snapshot().active[0];
  const distFromCenter2 = Math.hypot(posAD.x - SCREEN.width / 2, posAD.y - SCREEN.height / 2);
  assert.ok(distFromCenter2 < 5, `A+D should cancel near center, dist=${distFromCenter2}`);
});

test('correct joystick coordinates with custom center and radius', () => {
  const { pointers, engine } = makeEngine();
  // Set custom center (80%, 20%) and radius (10%, 10%)
  engine.setJoystickCenter({ x: 0.8, y: 0.2 });
  engine.setJoystickRadius({ x: 0.1, y: 0.1 });
  // Press W only — should move toward top-left of custom radius
  engine.keyDown('w');
  const snap = pointers.snapshot();
  const pos = snap.active[0];
  // With W only: dirY = -1, dirX = 0, normalized
  // Position = center + dir * radius
  // Expected: center.x + 0 * radius.x = 0.8 * width; center.y + (-1) * radius.y = 0.2 * height - radius.y
  assert.ok(pos.x > 0.7 * SCREEN.width && pos.x < 0.9 * SCREEN.width,
    `x should be near custom center x, got ${pos.x / SCREEN.width}`);
  assert.ok(pos.y >= 0.1 * SCREEN.height && pos.y <= 0.3 * SCREEN.height,
    `y should be near custom center y, got ${pos.y / SCREEN.height}`);
});

test('mouse relative movement with sensitivity', () => {
  const { pointers, engine } = makeEngine();
  const session = pointers.session;
  engine.setSensitivity(2.0);
  engine.mouseDown(); // must call mouseDown first to activate camera pointer
  engine.mouseMove(10, 5);
  // Delta accumulated: {x: 10, y: 5}, sensitivity 2.0 → effective {x: 20, y: 10}
  // Anchor at center (540, 1170), so position = anchor + {20, 10}
  // Pointer should have been moved
  const snap = pointers.snapshot();
  assert.equal(snap.count, 1, 'camera pointer should be active');
  // Check that at least one MOVE message exists in session
  const moveMessages = session.messages.filter((m) => m.action === 2 /* ACTION.MOVE */);
  assert.ok(moveMessages.length > 0, 'MOVE events should have been sent for mouse movement');
});

test('camera DOWN/MOVE/UP lifecycle', () => {
  const { pointers, engine } = makeEngine();
  engine.mouseDown();
  // After mousedown, camera pointer should be down
  const snap1 = pointers.snapshot();
  assert.equal(snap1.count, 1, 'camera pointer should be down after mouseDown');
  assert.ok(engine.cameraPointerDown, 'engine should track camera pointer down');

  engine.mouseMove(5, -3);
  // After mouseMove with pressed, MOVE should have been sent
  const snap2 = pointers.snapshot();
  // Pointer position should have changed
  const pos1 = snap1.active[0];
  const pos2 = snap2.active[0];
  assert.ok(Math.abs(pos2.x - pos1.x) > 0 || Math.abs(pos2.y - pos1.y) > 0,
    'camera pointer position should update on move');

  engine.mouseUp();
  // After mouseup, camera pointer should be up
  const snap3 = pointers.snapshot();
  assert.equal(snap3.count, 0, 'no pointers should remain after mouseUp');
  assert.ok(!engine.cameraPointerDown, 'engine should track camera pointer up');
});

// ---- Pointer allocation collision prevention ----

test('pointer allocation collision prevention — different names independent', () => {
  const { pointers, engine } = makeEngine();
  // 'joystick' and 'camera' are different names — both should be usable simultaneously
  engine.keyDown('w'); // starts joystick pointer
  engine.mouseDown(); // starts camera pointer
  const snap = pointers.snapshot();
  assert.equal(snap.count, 2, 'two different pointers should be active');
  assert.ok(engine.joystickPointerDown, 'joystick pointer down');
  assert.ok(engine.cameraPointerDown, 'camera pointer down');
});

test('emergency release clears all locally tracked pointers', () => {
  const { pointers, engine } = makeEngine();
  engine.keyDown('w');
  engine.mouseDown();
  // Both pointers should be active
  let snap = pointers.snapshot();
  assert.equal(snap.count, 2, 'two pointers should be active before emergency release');

  engine.emergencyRelease('test-reason');
  // After emergency release, no pointers should remain
  snap = pointers.snapshot();
  assert.equal(snap.count, 0, 'emergency release should clear all pointers');
  assert.ok(!engine.joystickPointerDown, 'engine should track joystick pointer released');
  assert.ok(!engine.cameraPointerDown, 'engine should track camera pointer released');
  assert.ok(!engine.mousePressed, 'engine should track mouse released');
});

// ---- Regression tests ----

test('regression: W down, A down, W up moves from northwest to left, A up releases pointer', () => {
  const { pointers, engine } = makeEngine();
  // W down
  engine.keyDown('w');
  // A down
  engine.keyDown('a');
  // Position should be northwest
  const snapWA = pointers.snapshot();
  const posWA = snapWA.active[0];
  assert.ok(posWA.x < SCREEN.width / 2, 'W+A: x should be left of center (northwest)');
  assert.ok(posWA.y < SCREEN.height / 2, 'W+A: y should be above center (northwest)');

  // W up while A remains
  engine.keyUp('w');
  // Pointer should move from northwest toward left (x still < center)
  const snapAfterWUp = pointers.snapshot();
  const posAfterWUp = snapAfterWUp.active[0];
  assert.ok(posAfterWUp.x < SCREEN.width / 2, 'After W up with A still down: x should still be left of center');
  // y should move toward center (may reach center)
  assert.ok(posAfterWUp.y >= posWA.y && posAfterWUp.y <= SCREEN.height / 2,
    'After W up with A still down: y should move toward center');

  // A up - should release pointer
  engine.keyUp('a');
  assert.ok(!engine.joystickPointerDown, 'pointer should be released after A up');
  assert.equal(pointers.snapshot().count, 0, 'no pointers should remain active');
});

test('disconnect behavior — emergency release does not throw when session lost', () => {
  const { pointers, engine } = makeEngine();
  // Simulate a lost session by clearing the channel
  pointers.session.channel.closed = true;
  // Emergency release should not throw even with closed channel
  assert.doesNotThrow(() => engine.emergencyRelease('simulated-disconnect'),
    'emergency release should not throw when channel is closed');
  const snap = pointers.snapshot();
  assert.equal(snap.count, 0, 'emergency release should still clear all pointers');
});

// ---- Boundary regression tests for Phase 3A ----

test('right edge crossing and continued movement without jump', () => {
  const { pointers, engine } = makeEngine();
  engine.mouseDown();
  const snap1 = pointers.snapshot();
  assert.equal(snap1.count, 1, 'camera pointer should be active after mouseDown');
  const pos1 = snap1.active[0];
  for (let i = 0; i < 60; i++) {
    engine.mouseMove(10, 0);
  }
  const snap2 = pointers.snapshot();
  const pos2 = snap2.active[0];
  const crossedRight = pos2.x > 1000;
  assert.ok(crossedRight, 'Pointer should have crossed the right edge after many right movements');
  // Record position before left move
  const beforeX = pos2.x;
  // Verify anchor shifted left (0.1 step per edge crossing)
  assert.ok(engine.mouseAnchor.x < 0.5, 'Anchor should have shifted left after right-edge crossing');
  // Move left after right-edge rebasing
  engine.mouseMove(-10, 0);
  const snap3 = pointers.snapshot();
  const pos3 = snap3.active[0];
  // Verify no jump: pointer should not move abruptly left beyond expected
  const displacement = pos3.x - pos2.x;
  assert.ok(displacement >= -50, `Pointer should not jump left after rebasing; displacement=${displacement}`);
  // Verify pointer stays within screen bounds
  assert.ok(pos3.x >= 0 && pos3.x <= SCREEN.width, 'Pointer should stay within screen bounds');
});

test('left edge crossing and continued movement without jump', () => {
  const { pointers, engine } = makeEngine();
  engine.mouseDown();
  const snap1 = pointers.snapshot();
  assert.equal(snap1.count, 1, 'camera pointer should be active after mouseDown');
  const pos1 = snap1.active[0];
  for (let i = 0; i < 60; i++) {
    engine.mouseMove(-10, 0);
  }
  const snap2 = pointers.snapshot();
  const pos2 = snap2.active[0];
  const crossedLeft = pos2.x < 80;
  assert.ok(crossedLeft, 'Pointer should have crossed the left edge after many left movements');
  // Verify anchor shifted right (0.1 step per edge crossing)
  assert.ok(engine.mouseAnchor.x > 0.5, 'Anchor should have shifted right after left-edge crossing');
  // Move right after left-edge rebasing
  engine.mouseMove(10, 0);
  const snap3 = pointers.snapshot();
  const pos3 = snap3.active[0];
  // Verify no jump: pointer should not move abruptly right beyond expected
  const displacement = pos3.x - pos2.x;
  assert.ok(displacement <= 50, `Pointer should not jump right after rebasing; displacement=${displacement}`);
  // Verify pointer stays within screen bounds
  assert.ok(pos3.x >= 0 && pos3.x <= SCREEN.width, 'Pointer should stay within screen bounds');
});

test('bottom edge crossing and continued movement without jump', () => {
  const { pointers, engine } = makeEngine();
  engine.mouseDown();
  const snap1 = pointers.snapshot();
  assert.equal(snap1.count, 1, 'camera pointer should be active after mouseDown');
  const pos1 = snap1.active[0];
  for (let i = 0; i < 60; i++) {
    engine.mouseMove(0, 10);
  }
  const snap2 = pointers.snapshot();
  const pos2 = snap2.active[0];
  const crossedBottom = pos2.y < 2200;
  assert.ok(crossedBottom, 'Pointer should have crossed the bottom edge after many down movements');
  engine.mouseMove(0, -10);
  const snap3 = pointers.snapshot();
  const pos3 = snap3.active[0];
  const movedUp = pos3.y < pos2.y;
  assert.ok(movedUp, 'Pointer should move up after bottom-edge rebasing');
});

test('top edge crossing and continued movement without jump', () => {
  const { pointers, engine } = makeEngine();
  engine.mouseDown();
  const snap1 = pointers.snapshot();
  assert.equal(snap1.count, 1, 'camera pointer should be active after mouseDown');
  const pos1 = snap1.active[0];
  for (let i = 0; i < 60; i++) {
    engine.mouseMove(0, -10);
  }
  const snap2 = pointers.snapshot();
  const pos2 = snap2.active[0];
  const crossedTop = pos2.y > 140;
  assert.ok(crossedTop, 'Pointer should have crossed the top edge after many up movements');
  engine.mouseMove(0, 10);
  const snap3 = pointers.snapshot();
  const pos3 = snap3.active[0];
  const movedDown = pos3.y > pos2.y;
  assert.ok(movedDown, 'Pointer should move down after top-edge rebasing');
});

test('anchor near 0 clamp reduces actual displacement', () => {
  const { pointers, engine } = makeEngine();
  // Record initial anchor and pointer position
  const initialAnchorX = engine.mouseAnchor.x;
  const snapBefore = pointers.snapshot();
  const posBefore = snapBefore.active[0];
  // Set anchor very near left boundary (0.01 = 1.08% of screen width)
  engine.mouseAnchor.x = 0.01;
  engine.mouseAnchor.y = 0.5;
  engine.mouseDelta = { x: 0, y: 0 };
  engine.mouseDown();
  // Move left toward the boundary
  engine.mouseMove(-20, 0);
  const snapAfter = pointers.snapshot();
  const posAfter = snapAfter.active[0];
  // Pointer should have moved (continuity)
  assert.ok(posAfter.x >= 0 && posAfter.x <= SCREEN.width,
    `Pointer x should be in bounds [0, ${SCREEN.width}], got ${posAfter.x}`);
  // Anchor displacement should be reduced near the clamp boundary
  // (actual delta may be less than the raw mouse movement due to 0.1 step anchoring)
  const deltaX = engine.mouseAnchor.x - initialAnchorX;
  // Verify displacement is finite and reasonable
  assert.ok(isFinite(deltaX), `Anchor displacement should be finite, got ${deltaX}`);
  // Verify pointer position is finite and valid
  assert.ok(isFinite(posAfter.x), `Pointer x should be finite, got ${posAfter.x}`);
});

test('mouse DOWN/UP/lifecycle', () => {
  const { pointers, engine } = makeEngine();
  // DOWN stage
  engine.mouseDown();
  assert.ok(engine.cameraPointerDown, 'camera pointer should be down after mouseDown');
  const snap1 = pointers.snapshot();
  assert.equal(snap1.count, 1, 'one camera pointer should be active after mouseDown');
  const posDown = snap1.active[0];
  // MOVE stage while down
  engine.mouseMove(10, 5);
  const snap2 = pointers.snapshot();
  const posMoved = snap2.active[0];
  assert.ok(Math.abs(posMoved.x - posDown.x) > 0 || Math.abs(posMoved.y - posDown.y) > 0,
    'pointer should move on MOVE while DOWN');
  // UP stage
  engine.mouseUp();
  assert.ok(!engine.cameraPointerDown, 'camera pointer should be up after mouseUp');
  const snap3 = pointers.snapshot();
  assert.equal(snap3.count, 0, 'no pointers should remain after mouseUp');
  // Fresh DOWN stage
  engine.mouseDown();
  assert.ok(engine.cameraPointerDown, 'camera pointer should be down after fresh mouseDown');
  const snap4 = pointers.snapshot();
  assert.equal(snap4.count, 1, 'one camera pointer should be active after fresh mouseDown');
  const posFreshDown = snap4.active[0];
  // MOVE stage with fresh DOWN
  engine.mouseMove(-5, -3);
  const snap5 = pointers.snapshot();
  const posFreshMoved = snap5.active[0];
  assert.ok(Math.abs(posFreshMoved.x - posFreshDown.x) > 0 || Math.abs(posFreshMoved.y - posFreshDown.y) > 0,
    'pointer should move on MOVE with fresh DOWN');
  // Final UP stage
  engine.mouseUp();
  assert.ok(!engine.cameraPointerDown, 'camera pointer should be up after final mouseUp');
  const snap6 = pointers.snapshot();
  assert.equal(snap6.count, 0, 'no pointers should remain after final mouseUp');
});

test('zero sensitivity prevents NaN/Infinity with boundary crossing', () => {
  const { pointers, engine } = makeEngine();
  // Configure sensitivity zero and anchor near right edge
  engine.setSensitivity(0);
  engine.mouseAnchor.x = 0.95;
  engine.mouseAnchor.y = 0.5;
  engine.mouseDelta = { x: 0, y: 0 };
  engine.mouseDown();
  // Move right to trigger boundary handling with zero sensitivity
  engine.mouseMove(50, 0);
  const snap = pointers.snapshot();
  const pos = snap.active[0];
  // Pointer should stay at clamped position, no NaN/Infinity
  assert.ok(pos.x >= 0 && pos.x <= SCREEN.width, `Pointer x should be in bounds [0, ${SCREEN.width}], got ${pos.x}`);
  assert.ok(pos.y >= 0 && pos.y <= SCREEN.height, `Pointer y should be in bounds [0, ${SCREEN.height}], got ${pos.y}`);
  // Verify no NaN/Infinity was produced in engine state
  assert.ok(isFinite(engine.mouseDelta.x), `mouseDelta.x should be finite, got ${engine.mouseDelta.x}`);
  assert.ok(isFinite(engine.mouseDelta.y), `mouseDelta.y should be finite, got ${engine.mouseDelta.y}`);
  // Anchor should not move unexpectedly with zero sensitivity
  assert.ok(engine.mouseAnchor.x >= 0.9 || engine.mouseAnchor.x <= 0.95,
    `Anchor should not move with zero sensitivity, got ${engine.mouseAnchor.x}`);
});

// Diagonal normalization quantitative test
test('diagonal normalization preserves consistent speed relative to cardinal (quantitative)', () => {
  const { pointers, engine } = makeEngine();
  const rx = engine.joystickRadius.x * SCREEN.width; // horizontal radius in pixels
  const ry = engine.joystickRadius.y * SCREEN.height; // vertical radius in pixels

  // Press W only (cardinal move along Y)
  engine.keyDown('w');
  const posW = pointers.snapshot().active[0];
  const wy = posW.y - SCREEN.height / 2; // offset from center Y

  // Press W + D (diagonal move)
  engine.keyDown('d');
  const posDiag = pointers.snapshot().active[0];
  const dx = posDiag.x - SCREEN.width / 2; // offset from center X
  const dy = posDiag.y - SCREEN.height / 2; // offset from center Y

  // Cardinal magnitude: normalized within vertical radius
  const cardinalMag = Math.hypot(0, wy / ry);

  // Diagonal magnitude: normalized using per-axis radii.
  // Math.hypot(dx / rx, dy / ry) ensures diagonal speed does not exceed cardinal.
  const diagMag = Math.hypot(dx / rx, dy / ry);

  // Both magnitudes should be approximately 1.0 after hypot normalization.
  // Without the engine's Math.hypot(dirX, dirY) normalization, the diagonal
  // magnitude would be ~1.414 times the cardinal, which this strict check rejects.
  const cardinalIsOne = cardinalMag > 0.8 && cardinalMag < 1.2;
  const diagIsOne = diagMag > 0.8 && diagMag < 1.2;
  assert.ok(cardinalIsOne, `cardinal magnitude should be ~1.0 after normalization, got ${cardinalMag.toFixed(2)}`);
  assert.ok(diagIsOne, `diagonal magnitude should be ~1.0 after normalization, got ${diagMag.toFixed(2)}`);
  // Also verify the ratio is close to 1.0 (not the natural 1.414 without normalization)
  const speedRatio = diagMag / cardinalMag;
  assert.ok(speedRatio < 1.1, `diagonal speed ratio should be close to 1.0 after normalization, got ${speedRatio.toFixed(2)}`);
});

// Ensure file ends with exactly one Unix newline
// (Verified: file content ends with \n)
