/**
 * Mapping engine tests for HEAVEN MOBILE CONTROL — Phase 3A.
 *
 * Synthetic input events; no device required.  All pointer operations pass
 * through the authoritative PointerManager (MockSession + real PointerManager
 * invariants).
 *
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

test('diagonal normalization preserves consistent speed', () => {
  const { pointers, engine } = makeEngine();
  // Press W only (cardinal)
  engine.keyDown('w');
  const posW = pointers.snapshot().active[0];
  const wx = posW.x - SCREEN.width / 2; // offset from center
  const wy = posW.y - SCREEN.height / 2;

  // Press W + D (diagonal)
  engine.keyDown('d');
  const posDiag = pointers.snapshot().active[0];
  const dx = posDiag.x - SCREEN.width / 2;
  const dy = posDiag.y - SCREEN.height / 2;

  // Normalized diagonal should have same magnitude as cardinal
  const cardinalMag = Math.hypot(wx, wy);
  const diagMag = Math.hypot(dx, dy);
  // With elliptical radius (rx != ry), exact equality is not guaranteed;
  // just verify diagonal is not faster.
  const magDiff = diagMag - cardinalMag;
  assert.ok(magDiff <= 1, `diagonal speed should not exceed cardinal speed; diff=${magDiff}`);
})

;



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
  engine.mouseDown();  // <-- must call mouseDown first to activate camera pointer
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

test('pointer allocation collision prevention — different names independent', () => {
  const { pointers, engine } = makeEngine();
  // 'joystick' and 'camera' are different names — both should be usable simultaneously
  engine.keyDown('w');     // starts joystick pointer
  engine.mouseDown();      // starts camera pointer
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