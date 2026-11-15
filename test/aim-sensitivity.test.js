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
  engine.loggerWarn = () => {};
  return { pointers, engine };
}

test('Aim sensitivityX and sensitivityY are applied separately', () => {
  const { pointers, engine } = makeEngine();
  engine.setMouseAnchor({ x: 0.5, y: 0.5 });
  engine.setSensitivityX(2.0);
  engine.setSensitivityY(0.5);
  engine.mouseDown();
  const start = pointers.snapshot().active[0];
  engine.mouseMove(10, 10);
  const moved = pointers.snapshot().active[0];
  const dx = moved.x - start.x;
  const dy = moved.y - start.y;
  assert.equal(dx, 20, `horizontal delta should use sensitivityX (got ${dx})`);
  assert.equal(dy, 5, `vertical delta should use sensitivityY (got ${dy})`);
});

test('one-arg setSensitivity keeps legacy behavior for both axes', () => {
  const { pointers, engine } = makeEngine();
  engine.setSensitivity(1.5);
  engine.mouseDown();
  const start = pointers.snapshot().active[0];
  engine.mouseMove(10, 10);
  const moved = pointers.snapshot().active[0];
  assert.equal(moved.x - start.x, 15);
  assert.equal(moved.y - start.y, 15);
});
