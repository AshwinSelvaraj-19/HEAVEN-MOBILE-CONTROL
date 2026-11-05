/**
 * Thin, promise-based wrapper around the adb executable.
 *
 * Design notes:
 *  - `spawn` (not `exec`) so argument boundaries are exact and no cmd.exe
 *    quoting is involved.
 *  - Every call is serialised through a per-instance queue. adb's server
 *    protocol is happy with concurrency, but serialising keeps the log
 *    readable and failures deterministic.
 *  - We never build a shell string ourselves; the device-side command is passed
 *    as separate argv entries, exactly like scrcpy's own client does.
 */

import { spawn } from 'node:child_process';
import { AppError, ErrorCode } from './errors.js';

/**
 * @typedef {object} ExecResult
 * @property {number} code
 * @property {string} stdout
 * @property {string} stderr
 * @property {number} durationMs
 */

export class Adb {
  /**
   * @param {string} executable
   * @param {{logger?: import('./log.js').Logger, defaultTimeoutMs?: number}} [options]
   */
  constructor(executable, options = {}) {
    this.executable = executable;
    this.logger = options.logger ?? null;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 15000;
    /** @type {Promise<unknown>} */
    this.queue = Promise.resolve();
  }

  /**
   * Run adb with argv, optionally pinned to a device.
   * @param {string[]} args
   * @param {{serial?: string | null, timeoutMs?: number, allowFailure?: boolean, label?: string}} [options]
   * @returns {Promise<ExecResult>}
   */
  async run(args, options = {}) {
    const { serial = null, timeoutMs = this.defaultTimeoutMs, allowFailure = false, label } = options;
    const argv = serial ? ['-s', serial, ...args] : args;
    const result = await this.#enqueue(() => this.#spawn(argv, timeoutMs, label ?? args[0]));
    if (result.code !== 0 && !allowFailure) {
      throw new AppError(ErrorCode.ADB_FAILED, `adb ${args[0]} failed (exit ${result.code})`, {
        hint: result.stderr.trim() || undefined,
        details: { argv: argv.join(' '), code: result.code },
      });
    }
    return result;
  }

  /**
   * `adb devices -l` parsed into records.
   * @returns {Promise<Array<{serial: string, state: string, model: string | null, product: string | null, transportId: string | null, raw: string}>>}
   */
  async devices() {
    const { stdout } = await this.run(['devices', '-l'], { timeoutMs: 10000 });
    return parseDevices(stdout);
  }

  /**
   * Run a shell command on the device. Args are passed verbatim.
   * @param {string[]} command
   * @param {{serial?: string | null, timeoutMs?: number, allowFailure?: boolean}} [options]
   */
  async shell(command, options = {}) {
    return this.run(['shell', ...command], options);
  }

  /**
   * @param {string} local
   * @param {string} remote
   * @param {{serial?: string | null}} [options]
   */
  async push(local, remote, options = {}) {
    return this.run(['push', local, remote], { ...options, timeoutMs: 60000 });
  }

  /**
   * @param {number} localPort
   * @param {string} remoteAbstract
   * @param {{serial?: string | null}} [options]
   */
  async forward(localPort, remoteAbstract, options = {}) {
    return this.run(['forward', `tcp:${localPort}`, `localabstract:${remoteAbstract}`], options);
  }

  /**
   * @param {number} localPort
   * @param {{serial?: string | null}} [options]
   */
  async removeForward(localPort, options = {}) {
    return this.run(['forward', '--remove', `tcp:${localPort}`], { ...options, allowFailure: true });
  }

  /**
   * @param {string} name
   * @param {{serial?: string | null}} [options]
   */
  async getProp(name, options = {}) {
    const { stdout } = await this.shell(['getprop', name], options);
    return stdout.trim();
  }

  /**
   * Spawn a long-lived adb shell child (the scrcpy server).
   * @param {string[]} command
   * @param {{serial?: string | null, onStdout?: (line: string) => void, onStderr?: (line: string) => void}} options
   * @returns {{child: import('node:child_process').ChildProcess, exit: Promise<{code: number | null, signal: string | null}>}}
   */
  spawnShell(command, options) {
    const argv = options.serial
      ? ['-s', options.serial, 'shell', ...command]
      : ['shell', ...command];

    this.logger?.debug('adb spawn', { argv: argv.join(' ') });
    const child = spawn(this.executable, argv, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

    lineSplitter(child.stdout, options.onStdout);
    lineSplitter(child.stderr, options.onStderr);

    /** @type {Promise<{code: number | null, signal: string | null}>} */
    const exit = new Promise((resolve) => {
      child.on('exit', (code, signal) => resolve({ code, signal }));
      child.on('error', (error) => {
        this.logger?.error('adb spawn error', { message: error.message });
        resolve({ code: -1, signal: null });
      });
    });

    return { child, exit };
  }

  /**
   * @param {() => Promise<ExecResult>} job
   * @returns {Promise<ExecResult>}
   */
  #enqueue(job) {
    const run = this.queue.then(job, job);
    // Keep the chain alive even if this job rejects.
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * @param {string[]} argv
   * @param {number} timeoutMs
   * @param {string} label
   * @returns {Promise<ExecResult>}
   */
  #spawn(argv, timeoutMs, label) {
    const started = Date.now();
    return new Promise((resolve) => {
      const child = spawn(this.executable, argv, { windowsHide: true });
      /** @type {Buffer[]} */
      const out = [];
      /** @type {Buffer[]} */
      const err = [];
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill();
        resolve({
          code: 124,
          stdout: Buffer.concat(out).toString('utf8'),
          stderr: `adb ${label} timed out after ${timeoutMs} ms`,
          durationMs: Date.now() - started,
        });
      }, timeoutMs);

      child.stdout.on('data', (chunk) => out.push(chunk));
      child.stderr.on('data', (chunk) => err.push(chunk));
      child.on('error', (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve({
          code: -1,
          stdout: '',
          stderr: error.message,
          durationMs: Date.now() - started,
        });
      });
      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve({
          code: code ?? -1,
          stdout: Buffer.concat(out).toString('utf8'),
          stderr: Buffer.concat(err).toString('utf8'),
          durationMs: Date.now() - started,
        });
      });
    });
  }
}

/**
 * @param {NodeJS.ReadableStream | null} stream
 * @param {((line: string) => void) | undefined} onLine
 */
function lineSplitter(stream, onLine) {
  if (!stream || !onLine) {
    return;
  }
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? '';
    for (const line of parts) {
      if (line.length > 0) {
        onLine(line);
      }
    }
  });
  stream.on('end', () => {
    if (buffer.length > 0) {
      onLine(buffer);
      buffer = '';
    }
  });
}

/**
 * Parse `adb devices -l` output.
 * @param {string} stdout
 */
export function parseDevices(stdout) {
  /** @type {Array<{serial: string, state: string, model: string | null, product: string | null, transportId: string | null, raw: string}>} */
  const devices = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('List of devices') || line.startsWith('*')) {
      continue;
    }
    const parts = line.split(/\s+/);
    const serial = parts.shift();
    if (!serial) {
      continue;
    }
    const state = parts.shift() ?? 'unknown';
    /** @type {Record<string, string>} */
    const props = {};
    for (const part of parts) {
      const index = part.indexOf(':');
      if (index > 0) {
        props[part.slice(0, index)] = part.slice(index + 1);
      }
    }
    devices.push({
      serial,
      state,
      model: props.model ?? null,
      product: props.product ?? null,
      transportId: props.transport_id ?? null,
      raw: line,
    });
  }
  return devices;
}
