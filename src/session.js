/**
 * Session lifecycle: push the server, open the adb tunnel, execute the
 * scrcpy-server under the `shell` UID, connect the control socket, and tear it
 * all down again.
 *
 * Verified against scrcpy 4.1 source:
 *   app/src/server.c              execute_server(), tunnel opened before exec
 *   server/.../Server.java        options parsed as key=value after the version
 *   server/.../DesktopConnection  socket name scrcpy_%08x, tunnel_forward path
 *   server/.../Options.java       unknown keys only warn
 *
 * Control-only mode (video=false audio=false control=true) is explicitly
 * supported by the server: Controller.getEventPointAndDisplayId() falls back to
 * raw coordinates when no video display data exists.
 */

import crypto from 'node:crypto';
import net from 'node:net';
import { ControlChannel, delay } from './control-channel.js';
import { AppError, ErrorCode } from './errors.js';
import { SCRCPY_VERSION, SERVER_JAR_REMOTE } from './config.js';

export class ScrcpySession {
  /**
   * @param {object} options
   * @param {import('./adb.js').Adb} options.adb
   * @param {string} options.serial
   * @param {import('./device.js').DeviceInfo} options.device
   * @param {import('./log.js').Logger} options.logger
   * @param {string} options.serverJarPath
   * @param {boolean} [options.allowPowerOn]
   * @param {number} [options.startTimeoutMs]
   */
  constructor(options) {
    this.adb = options.adb;
    this.serial = options.serial;
    this.device = options.device;
    this.logger = options.logger;
    this.serverJarPath = options.serverJarPath;
    this.allowPowerOn = options.allowPowerOn ?? false;
    this.startTimeoutMs = options.startTimeoutMs ?? 20000;

    /** @type {ControlChannel | null} */
    this.channel = null;
    /** @type {import('node:child_process').ChildProcess | null} */
    this.child = null;
    /** @type {Promise<{code: number|null, signal: string|null}> | null} */
    this.exitPromise = null;
    this.port = 0;
    this.scid = 0;
    this.socketName = '';
    this.startedAt = 0;
    this.serverLines = [];
    this.stopping = false;
    this.exited = false;

    /** @type {((error: Error) => void)[]} */
    this.lostHandlers = [];
  }

  get running() {
    return Boolean(this.channel && !this.channel.closed && !this.stopping);
  }

  /**
   * @returns {Promise<{port: number, scid: string, socketName: string, startMs: number}>}
   */
  async start() {
    const started = Date.now();
    this.port = await findFreePort();
    this.scid = crypto.randomInt(1, 0x7fffffff);
    const scidHex = this.scid.toString(16).padStart(8, '0');
    this.socketName = `scrcpy_${scidHex}`;

    this.logger.info('session starting', {
      serial: this.serial,
      port: this.port,
      scid: scidHex,
      socket: this.socketName,
      server: this.serverJarPath,
    });

    await this.#pushServer();

    // The tunnel must exist before the server listens on the abstract socket.
    await this.adb.removeForward(this.port, { serial: this.serial });
    await this.adb.forward(this.port, this.socketName, { serial: this.serial });
    this.logger.info('adb forward ready', { tcp: this.port, remote: this.socketName });

    this.#executeServer();

    await this.#waitForServerReady();

    this.channel = await ControlChannel.connect({
      host: '127.0.0.1',
      port: this.port,
      logger: this.logger,
      timeoutMs: 12000,
    });
    this.channel.onClose((error) => this.#onLost(error));

    this.startedAt = Date.now();
    this.logger.info('session ready', { setupMs: this.startedAt - started });
    return { port: this.port, scid: scidHex, socketName: this.socketName, startMs: this.startedAt - started };
  }

  /**
   * @returns {ControlChannel}
   */
  requireChannel() {
    if (!this.channel || this.channel.closed) {
      throw new AppError(ErrorCode.SESSION_LOST, 'No live control channel');
    }
    return this.channel;
  }

  /** @param {(error: Error) => void} handler */
  onLost(handler) {
    this.lostHandlers.push(handler);
  }

  async stop() {
    if (this.stopping) {
      return;
    }
    this.stopping = true;

    if (this.channel) {
      await this.channel.close().catch(() => undefined);
    }

    if (this.child && this.exitPromise) {
      const exited = await Promise.race([
        this.exitPromise.then(() => true),
        delay(800).then(() => false),
      ]);
      if (!exited) {
        this.logger.warn('server did not exit after socket close; terminating adb shell');
        this.child.kill();
        await Promise.race([this.exitPromise, delay(800)]);
      }
    }

    await this.adb.removeForward(this.port, { serial: this.serial }).catch(() => undefined);
    this.logger.info('session stopped', {
      messagesSent: this.channel?.messagesSent ?? 0,
    });
    this.channel = null;
    this.child = null;
    this.exitPromise = null;
  }

  stats() {
    return {
      running: this.running,
      port: this.port,
      socketName: this.socketName,
      serverLines: this.serverLines.length,
      channel: this.channel?.stats() ?? null,
    };
  }

  async #pushServer() {
    // scrcpy does this on every start; overwrite keeps the PoC self-healing.
    const result = await this.adb.push(this.serverJarPath, SERVER_JAR_REMOTE, { serial: this.serial });
    const rate = /(\d+(?:\.\d+)?)\s*MB\/s/.exec(result.stdout)?.[1];
    this.logger.info('server pushed', { remote: SERVER_JAR_REMOTE, rateMBps: rate ?? 'unknown' });
  }

  #executeServer() {
    const args = [
      `CLASSPATH=${SERVER_JAR_REMOTE}`,
      'app_process',
      '/',
      'com.genymobile.scrcpy.Server',
      SCRCPY_VERSION,
      `scid=${this.scid.toString(16).padStart(8, '0')}`,
      `log_level=${this.logger.level === 'debug' ? 'debug' : 'info'}`,
      'video=false',
      'audio=false',
      'control=true',
      // The server listens; adb forward connects into the abstract socket.
      'tunnel_forward=true',
      // Keep the control socket one-directional and free of handshake bytes.
      'send_device_meta=false',
      'send_dummy_byte=false',
      'clipboard_autosync=false',
      // Do not press POWER by default (no state-changing input without opt-in).
      `power_on=${this.allowPowerOn ? 'true' : 'false'}`,
      'cleanup=true',
    ];

    const { child, exit } = this.adb.spawnShell(args, {
      serial: this.serial,
      onStdout: (line) => this.#onServerLine(line, 'out'),
      onStderr: (line) => this.#onServerLine(line, 'err'),
    });
    this.child = child;
    this.exitPromise = exit;

    exit.then(({ code, signal }) => {
      this.exited = true;
      if (!this.stopping) {
        this.logger.warn('server process exited', { code, signal });
        this.#onLost(
          new AppError(ErrorCode.SESSION_LOST, `scrcpy-server exited (code ${code ?? 'null'})`, {
            hint: this.serverLines.slice(-8).join(' | ') || undefined,
          }),
        );
      }
    });
  }

  /**
   * @param {string} line
   * @param {'out'|'err'} stream
   */
  #onServerLine(line, stream) {
    const trimmed = line.trimEnd();
    this.serverLines.push(trimmed);
    if (this.serverLines.length > 200) {
      this.serverLines.shift();
    }
    const level = /^(ERROR|E\/)/.test(trimmed) || stream === 'err' ? 'warn' : 'debug';
    this.logger.write(level, 'scrcpy-server', { line: trimmed, stream });
  }

  async #waitForServerReady() {
    const deadline = Date.now() + this.startTimeoutMs;
    let ready = false;
    while (Date.now() < deadline) {
      if (this.exited) {
        break;
      }
      // scrcpy prefixes its own lines: "[server] INFO: Device: [samsung] ..."
      if (this.serverLines.some((line) => line.includes('Device: ['))) {
        ready = true;
        break;
      }
      await delay(60);
    }

    if (!ready) {
      const detail = this.serverLines.slice(-10).join(' | ');
      await this.stop().catch(() => undefined);
      throw new AppError(ErrorCode.SESSION_START, 'scrcpy-server did not start', {
        hint: detail
          ? `Server output: ${detail}`
          : 'No server output was received. Check the USB connection and that the device is unlocked.',
      });
    }

    this.logger.info('server reported device', { line: this.serverLines.find((l) => l.includes('Device: [')) });
  }

  /** @param {Error} error */
  #onLost(error) {
    if (this.stopping) {
      return;
    }
    for (const handler of this.lostHandlers) {
      handler(error);
    }
  }
}

/**
 * Ask the OS for an unused loopback port. There is an unavoidable race between
 * closing this probe socket and adb binding the port; on collision the forward
 * command fails loudly and the session aborts rather than silently reusing a
 * stale tunnel.
 * @returns {Promise<number>}
 */
export function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => (port ? resolve(port) : reject(new Error('could not allocate a loopback port'))));
    });
  });
}
