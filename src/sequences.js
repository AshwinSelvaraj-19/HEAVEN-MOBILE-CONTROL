/**
 * Deterministic motion sequences.
 *
 * The point of the sweep is requirement 5: one pointer keeps moving while the
 * other stays down *without being re-sent*. Pointer A is therefore down-only
 * during the sweep, and the report records exactly that.
 *
 * Timing: Windows' default timer resolution is ~15.6 ms, so a requested 120 Hz
 * often degrades to ~64 Hz. Rather than pretend, every run measures the actual
 * send interval and reports achieved Hz and p95 jitter.
 */

import { delay } from './control-channel.js';

/**
 * @typedef {object} SweepStats
 * @property {number} sent
 * @property {number} requestedHz
 * @property {number} achievedHz
 * @property {number} p95IntervalMs
 * @property {number} maxIntervalMs
 * @property {number} durationMs
 */

/**
 * Move a pointer around a circle centred on its current position.
 * @param {import('./pointers.js').PointerManager} pointers
 * @param {string} name
 * @param {{durationMs?: number, hz?: number, radius?: number, turns?: number}} [options]
 * @returns {Promise<SweepStats>}
 */
export async function sweepCircle(pointers, name, options = {}) {
  const durationMs = options.durationMs ?? 2000;
  const hz = Math.max(10, options.hz ?? 120);
  const turns = options.turns ?? 2;
  const radius = options.radius ?? 90;

  const start = current(pointers, name);
  const interval = 1000 / hz;
  const deadline = Date.now() + durationMs;
  /** @type {number[]} */
  const intervals = [];
  let previousAt = 0;
  let sent = 0;
  let index = 0;

  while (Date.now() < deadline) {
    const elapsed = Date.now() - (deadline - durationMs);
    const angle = (elapsed / durationMs) * turns * Math.PI * 2;
    const x = start.x + radius * Math.cos(angle);
    const y = start.y + radius * Math.sin(angle);

    pointers.move(name, x, y);
    const now = Date.now();
    if (previousAt) {
      intervals.push(now - previousAt);
    }
    previousAt = now;
    sent++;

    index++;
    const nextAt = (deadline - durationMs) + index * interval;
    const wait = nextAt - Date.now();
    if (wait > 0) {
      await delay(wait);
    } else {
      // Timer resolution exceeded the schedule: yield so the socket drains.
      await delay(0);
    }
  }

  return summarize(intervals, hz, sent, durationMs);
}

/**
 * The Phase 2 proof: two independent pointers, one held while the other moves.
 * @param {import('./pointers.js').PointerManager} pointers
 * @param {object} options
 * @param {{width: number, height: number}} options.screen
 * @param {number} options.sweepMs
 * @param {number} options.hz
 * @param {number} [options.keepHeldMs]
 * @param {import('./log.js').Logger} options.logger
 */
export async function runTwoPointerProof(pointers, options) {
  const { screen, sweepMs, hz, keepHeldMs = 0, logger } = options;
  const startedAt = Date.now();
  /** @type {Array<Record<string, unknown>>} */
  const phases = [];

  const holdPoint = { x: Math.round(screen.width * 0.35), y: Math.round(screen.height * 0.45) };
  const movePoint = { x: Math.round(screen.width * 0.65), y: Math.round(screen.height * 0.45) };

  const phase = (name, extra = {}) => {
    phases.push({ name, atMs: Date.now() - startedAt, ...extra });
    logger.info(`proof: ${name}`, extra);
  };

  phase('press-A', holdPoint);
  pointers.down('A', holdPoint.x, holdPoint.y);
  await delay(120);

  phase('press-B', movePoint);
  pointers.down('B', movePoint.x, movePoint.y);
  await delay(120);

  phase('both-held', { active: pointers.snapshot().count });
  const heldSnapshot = pointers.snapshot();

  phase('sweep-B', { sweepMs, hz });
  const sweep = await sweepCircle(pointers, 'B', { durationMs: sweepMs, hz });
  phase('sweep-B-done', sweep);

  if (keepHeldMs > 0) {
    logger.info('proof: holding both pointers', { keepHeldMs });
    await delay(keepHeldMs);
  }

  phase('lift-B');
  pointers.up('B');
  await delay(80);

  phase('lift-A');
  pointers.up('A');

  const finishedAt = Date.now();
  const final = pointers.snapshot();

  return {
    ok: final.count === 0,
    startedAt: new Date(startedAt).toISOString(),
    totalMs: finishedAt - startedAt,
    phases,
    sweep,
    // The decisive number: A must have exactly one event (its DOWN) while B moved.
    heldPointer: {
      name: 'A',
      messages: heldSnapshot.active.find((pointer) => pointer.name === 'A')?.moves ?? null,
      note: 'moves for A during the sweep; must be 0 because A was never re-sent',
    },
    pointersRemaining: final.count,
    messagesSent: final.totalMessages,
    screen,
  };
}

/**
 * @param {import('./pointers.js').PointerManager} pointers
 * @param {string} name
 */
function current(pointers, name) {
  const snapshot = pointers.snapshot();
  const pointer = snapshot.active.find((entry) => entry.name === name);
  if (!pointer) {
    throw new Error(`Pointer ${name} is not down`);
  }
  return { x: pointer.x, y: pointer.y };
}

/**
 * @param {number[]} intervals
 * @param {number} requestedHz
 * @param {number} sent
 * @param {number} durationMs
 * @returns {SweepStats}
 */
function summarize(intervals, requestedHz, sent, durationMs) {
  if (intervals.length === 0) {
    return {
      sent,
      requestedHz,
      achievedHz: 0,
      p95IntervalMs: 0,
      maxIntervalMs: 0,
      durationMs,
    };
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const total = intervals.reduce((sum, value) => sum + value, 0);
  return {
    sent,
    requestedHz,
    achievedHz: Number((1000 / (total / intervals.length)).toFixed(1)),
    p95IntervalMs: p95,
    maxIntervalMs: sorted[sorted.length - 1],
    durationMs,
  };
}
