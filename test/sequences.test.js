/**
 * Sequence-level proof, on the mock transport: the exact shape the hardware run
 * must produce.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTION } from '../src/protocol.js';
import { Logger } from '../src/log.js';
import { MockSession } from '../src/mock-session.js';
import { PointerManager } from '../src/pointers.js';
import { runTwoPointerProof, sweepCircle } from '../src/sequences.js';

const SCREEN = { width: 1080, height: 2340 };
const silent = new Logger({ level: 'error', file: null });

test('proof: A held with a single event while B moves continuously', async () => {
  const session = new MockSession({ logger: silent, screen: SCREEN });
  const pointers = new PointerManager({ session, screen: SCREEN, logger: silent });

  const report = await runTwoPointerProof(pointers, {
    screen: SCREEN,
    sweepMs: 260,
    hz: 120,
    logger: silent,
  });

  assert.equal(report.ok, true);
  assert.equal(report.pointersRemaining, 0);

  const phases = report.phases.map((phase) => phase.name);
  for (const expected of ['press-A', 'press-B', 'both-held', 'sweep-B', 'lift-B', 'lift-A']) {
    assert.ok(phases.includes(expected), `missing phase ${expected}`);
  }

  const counts = session.countsByPointer();
  const entries = Object.values(counts);
  assert.equal(entries.length, 2, 'exactly two pointers were used');

  const held = entries.find((entry) => entry.down === 1 && entry.up === 1 && entry.move === 0);
  const moved = entries.find((entry) => entry.down === 1 && entry.up === 1 && entry.move > 0);
  assert.ok(held, 'one pointer must be down/up only (never re-sent)');
  assert.ok(moved, 'one pointer must move continuously');

  assert.ok(report.sweep.sent > 10, `expected many MOVE events, got ${report.sweep.sent}`);
  assert.ok(report.sweep.achievedHz > 10);
  assert.equal(
    session.messages.filter((message) => message.action === ACTION.UP).length,
    2,
  );
});

test('sweep refuses to move a pointer that is not down', async () => {
  const session = new MockSession({ logger: silent, screen: SCREEN });
  const pointers = new PointerManager({ session, screen: SCREEN, logger: silent });
  await assert.rejects(
    () => sweepCircle(pointers, 'A', { durationMs: 50, hz: 60 }),
    /not down/,
  );
});

test('sweep stays inside the screen bounds even near an edge', async () => {
  const session = new MockSession({ logger: silent, screen: SCREEN });
  const pointers = new PointerManager({ session, screen: SCREEN, logger: silent });
  pointers.down('A', 5, 5);
  await sweepCircle(pointers, 'A', { durationMs: 120, hz: 60, radius: 200 });

  for (const message of session.messages.filter((entry) => entry.action === ACTION.MOVE)) {
    assert.ok(message.x >= 0 && message.x < SCREEN.width, `x out of range: ${message.x}`);
    assert.ok(message.y >= 0 && message.y < SCREEN.height, `y out of range: ${message.y}`);
  }
});
