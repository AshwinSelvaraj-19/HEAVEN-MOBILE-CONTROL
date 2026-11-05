/**
 * Mock transport — verification harness, not a feature.
 *
 * It satisfies the same surface as ScrcpySession so the pointer manager, the
 * sequences and the UI can be exercised on a machine with no phone attached.
 * Messages are parsed back out of the buffer and counted; nothing is injected
 * and no device is contacted. UI mode labels this "MOCK TRANSPORT".
 */

import { ACTION, TOUCH_EVENT_LENGTH } from './protocol.js';

export class MockSession {
  /**
   * @param {{logger: import('./log.js').Logger, screen: {width: number, height: number}}} options
   */
  constructor(options) {
    this.logger = options.logger;
    this.screen = options.screen;
    /** @type {Array<{at: number, action: number, pointerId: string, x: number, y: number, pressure: number}>} */
    this.messages = [];
    this.startedAt = 0;
    this.stopped = false;

    const self = this;
    this.channel = {
      closed: false,
      messagesSent: 0,
      bytesSent: 0,
      bytesReceived: 0,
      lastSendAt: 0,
      send(buffer) {
        if (this.closed) {
          // Same contract as ControlChannel.send(): never drop silently.
          throw new Error('Cannot send: control channel is closed');
        }
        if (buffer.length !== TOUCH_EVENT_LENGTH) {
          throw new Error(`mock: expected ${TOUCH_EVENT_LENGTH} bytes, got ${buffer.length}`);
        }
        self.messages.push({
          at: Date.now(),
          action: buffer[1],
          pointerId: buffer.readBigUInt64BE(2).toString(),
          x: buffer.readInt32BE(10),
          y: buffer.readInt32BE(14),
          pressure: Number((buffer.readUInt16BE(22) / 0xffff).toFixed(3)),
        });
        this.messagesSent++;
        this.bytesSent += buffer.length;
        this.lastSendAt = Date.now();
      },
      flush() {
        return Promise.resolve();
      },
      close() {
        this.closed = true;
        return Promise.resolve();
      },
      stats() {
        return {
          up: !this.closed,
          connectedAt: new Date(self.startedAt).toISOString(),
          messagesSent: this.messagesSent,
          bytesSent: this.bytesSent,
          bytesReceived: 0,
          lastSendAt: this.lastSendAt ? new Date(this.lastSendAt).toISOString() : null,
        };
      },
    };
  }

  async start() {
    this.startedAt = Date.now();
    this.logger.warn('mock session started', { note: 'no device traffic will occur' });
    return { port: 0, scid: 'mock', socketName: 'mock', startMs: 0 };
  }

  requireChannel() {
    if (this.stopped) {
      throw new Error('mock session is stopped');
    }
    return this.channel;
  }

  onLost() {
    /* never lost */
  }

  async stop() {
    this.stopped = true;
  }

  get running() {
    return !this.stopped;
  }

  stats() {
    return {
      running: this.running,
      port: 0,
      socketName: 'mock',
      serverLines: 0,
      channel: this.channel.stats(),
      mock: true,
    };
  }

  /** Down/move/up counts by pointer id, for the tests. */
  countsByPointer() {
    /** @type {Record<string, {down: number, move: number, up: number}>} */
    const counts = {};
    for (const message of this.messages) {
      const entry = (counts[message.pointerId] ??= { down: 0, move: 0, up: 0 });
      if (message.action === ACTION.DOWN) {
        entry.down++;
      } else if (message.action === ACTION.MOVE) {
        entry.move++;
      } else if (message.action === ACTION.UP) {
        entry.up++;
      }
    }
    return counts;
  }
}
