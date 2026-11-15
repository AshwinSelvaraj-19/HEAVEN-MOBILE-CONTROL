/** Aim behaviour tests: press-on-move (MSI Pan style) and idle release. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Logger } from '../src/log.js';
import { MockSession } from '../src/mock-session.js';
import { PointerManager } from '../src/pointers.js';
import { MappingEngine } from '../src/mapping-engine.js';

const SCREEN = { width: 1080, height: 2340 };
const SILENT = new Logger({ level: 'error', file: null });

function makeEngine() {
  const session = new MockSession({ logger: SILENT, screen: SCREEN });
  const pointers = new PointerManager({ session, screen: SCREEN, logger: SILENT });
  const engine = new MappingEngine(pointers, SCREEN);
  // @ts-ignore — test-only shim
  engine.loggerWarn = () => {};
  return { session, pointers, engine };
}

test('aiming presses the camera finger only when the mouse moves', () => {
  const { pointers, engine } = makeEngine();
  assert.equal(pointers.snapshot().count, 0, 'nothing is held before aiming');

  engine.mouseMove(20, 0);
  assert.equal(pointers.snapshot().count, 1, 'the first movement presses the camera finger');
  assert.ok(engine.cameraPointerDown, 'engine should track the camera pointer');
  assert.ok(engine.mousePressed, 'camera should be active while aiming');
});

test('camera finger lifts after the aim idle timeout', async () => {
  const { pointers, engine } = makeEngine();
  engine.aimIdleMs = 25;
  engine.mouseMove(10, 0);
  assert.equal(pointers.snapshot().count, 1);

  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(pointers.snapshot().count, 0, 'idle aiming releases the finger');
  assert.ok(!engine.cameraPointerDown);
});

test('disabled aim ignores mouse movement and releases a held finger', () => {
  const { pointers, engine } = makeEngine();
  engine.mouseMove(15, 0);
  assert.equal(pointers.snapshot().count, 1);

  engine.setCameraEnabled(false);
  assert.equal(pointers.snapshot().count, 0, 'disabling aim releases the finger');

  engine.mouseMove(15, 0);
  assert.equal(pointers.snapshot().count, 0, 'movement does nothing while aim is disabled');
});
