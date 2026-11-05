/**
 * The control socket: a plain TCP connection to a loopback port that adb
 * forwards into the device's abstract unix socket.
 *
 *   [this app] --tcp:127.0.0.1:P--> [adb server] --localabstract--> [scrcpy-server]
 *
 * The server is the listening side (`tunnel_forward=true`), exactly like the
 * scrcpy client: it opens the tunnel first, then executes the server, then
 * connects. Connecting can therefore briefly fail while the server is still
 * starting, so `connect()` retries until a deadline.
 */

import net from 'node:net';
import { AppError, ErrorCode } from './errors.js';

export class ControlChannel {
  /**
   * @param {net.Socket} socket
   * @param {import('./log.js').Logger} logger
   */
  constructor(socket, logger) {
    this.socket = socket;
    this.logger = logger;
    this.closed = false;
    this.bytesSent = 0;
    this.messagesSent = 0;
    this.bytesReceived = 0;
    this.lastSendAt = 0;
    /** @type {((error: Error) => void)[]} */
    this.closeHandlers = [];
    /** @type {Set<(error: Error | null) => void>} */
    this.drainWaiters = new Set();
    this.connectedAt = Date.now();

    socket.setNoDelay(true);
    socket.on('data', (chunk) => this.#onData(chunk));
    socket.on('error', (error) => {
      this.logger.warn('control socket error', { message: error.message });
    });
    socket.on('close', () => {
      this.closed = true;
      for (const waiter of this.drainWaiters) {
        waiter(new AppError(ErrorCode.SESSION_LOST, 'Control socket closed'));
      }
      this.drainWaiters.clear();
      for (const handler of this.closeHandlers) {
        handler(new AppError(ErrorCode.SESSION_LOST, 'Control socket closed'));
      }
    });
  }

  /**
   * @param {{host: string, port: number, timeoutMs?: number, logger: import('./log.js').Logger}} options
   * @returns {Promise<ControlChannel>}
   */
  static async connect(options) {
    const { host, port, timeoutMs = 10000, logger } = options;
    const deadline = Date.now() + timeoutMs;
    let attempt = 0;
    let lastError = null;

    while (Date.now() < deadline) {
      attempt++;
      try {
        const socket = await openSocket(host, port, Math.min(1500, deadline - Date.now()));
        // The server must be accepting; if adb closed us immediately the
        // abstract socket did not exist yet, so retry.
        await waitForStability(socket, 120);
        logger.info('control channel connected', { host, port, attempt });
        return new ControlChannel(socket, logger);
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        logger.debug('control channel connect retry', { attempt, message });
        await delay(120);
      }
    }

    throw new AppError(ErrorCode.SESSION_START, 'Could not connect to the scrcpy server control socket', {
      hint:
        'The server process may have failed to start. Check the log for the server lines ' +
        '(they are prefixed "scrcpy-server").',
      details: { host, port, attempts: attempt, cause: lastError instanceof Error ? lastError.message : String(lastError) },
    });
  }

  /**
   * @param {Buffer} buffer
   */
  send(buffer) {
    if (this.closed) {
      throw new AppError(ErrorCode.SESSION_LOST, 'Cannot send: control channel is closed');
    }
    this.bytesSent += buffer.length;
    this.messagesSent++;
    this.lastSendAt = Date.now();
    this.socket.write(buffer);
  }

  /**
   * Resolve once every queued write has been flushed to the socket, or reject on
   * close/timeout. Used by the panic path so UP events are not lost at exit.
   * @param {number} [timeoutMs]
   * @returns {Promise<void>}
   */
  flush(timeoutMs = 400) {
    if (this.closed) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.drainWaiters.delete(done);
        resolve();
      }, timeoutMs);

      /** @param {Error | null} error */
      const done = (error) => {
        clearTimeout(timer);
        this.drainWaiters.delete(done);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      this.drainWaiters.add(done);
      this.socket.write(Buffer.alloc(0), () => done(null));
    });
  }

  /** @param {(error: Error) => void} handler */
  onClose(handler) {
    this.closeHandlers.push(handler);
  }

  async close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    const socket = this.socket;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 300);
      socket.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.end();
    });
    socket.destroy();
  }

  stats() {
    return {
      up: !this.closed,
      connectedAt: new Date(this.connectedAt).toISOString(),
      messagesSent: this.messagesSent,
      bytesSent: this.bytesSent,
      bytesReceived: this.bytesReceived,
      lastSendAt: this.lastSendAt ? new Date(this.lastSendAt).toISOString() : null,
    };
  }

  /**
   * The server only writes to this socket for clipboard/UHID device messages,
   * which this PoC disables. Anything arriving is recorded for diagnostics and
   * otherwise ignored — never parsed as if it were ours.
   * @param {Buffer} chunk
   */
  #onData(chunk) {
    this.bytesReceived += chunk.length;
    this.logger.warn('unexpected data on control socket', {
      bytes: chunk.length,
      hex: chunk.subarray(0, 32).toString('hex'),
    });
  }
}

/**
 * @param {string} host
 * @param {number} port
 * @param {number} timeoutMs
 * @returns {Promise<net.Socket>}
 */
function openSocket(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`connect timeout after ${timeoutMs} ms`));
    }, Math.max(200, timeoutMs));

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.removeAllListeners('error');
      resolve(socket);
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      socket.destroy();
      reject(error);
    });
  });
}

/**
 * Reject if the socket closes almost immediately (server not listening yet).
 * @param {net.Socket} socket
 * @param {number} windowMs
 */
function waitForStability(socket, windowMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.removeListener('close', onClose);
      socket.removeListener('error', onClose);
      if (error) {
        reject(error);
      } else {
        resolve(undefined);
      }
    };
    const onClose = () => finish(new Error('socket closed immediately'));
    const timer = setTimeout(() => finish(null), windowMs);
    socket.once('close', onClose);
    socket.once('error', onClose);
  });
}

/** @param {number} ms */
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
