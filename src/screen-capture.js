import { spawn } from 'node:child_process';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_FRAME_BYTES = 12 * 1024 * 1024;
const FRAME_PAUSE_MS = 35;

/** Captures the phone display over the existing USB ADB connection. */
export class ScreenCapture {
  /**
   * @param {{adbPath: string, serial: string, logger?: import('./log.js').Logger}} options
   */
  constructor(options) {
    this.adbPath = options.adbPath;
    this.serial = options.serial;
    this.logger = options.logger ?? null;
    this.child = null;
    this.stopped = false;
    this.pending = Buffer.alloc(0);
    this.latestFrame = null;
    this.latestAt = 0;
    this.waiters = new Set();
  }

  async capture() {
    if (this.latestFrame && Date.now() - this.latestAt < 400) return this.latestFrame;
    if (this.stopped) throw new Error('Phone screen capture is stopped');
    if (!this.child) this.#startPump();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error('Phone screen capture timed out'));
      }, 5000);
      const waiter = (error, frame) => {
        clearTimeout(timer);
        this.waiters.delete(waiter);
        if (error) reject(error);
        else resolve(frame);
      };
      this.waiters.add(waiter);
    });
  }

  /** @param {Buffer} frame */
  dimensions(frame) {
    if (frame.length < 24 || !frame.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      throw new Error('Invalid phone screen image');
    }
    return { width: frame.readUInt32BE(16), height: frame.readUInt32BE(20) };
  }

  stop() {
    this.stopped = true;
    if (this.child) this.child.kill();
    this.child = null;
    for (const waiter of this.waiters) waiter(new Error('Phone screen capture stopped'));
  }

  #startPump() {
    if (this.stopped || this.child) return;
    const script = `while true; do screencap -p; sleep 0.${String(FRAME_PAUSE_MS).padStart(3, '0')}; done`;
    const child = spawn(this.adbPath, ['-s', this.serial, 'exec-out', 'sh', '-c', script], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    this.child = child;
    child.stdout.on('data', (chunk) => this.#consume(chunk));
    child.stderr.on('data', (chunk) => this.logger?.debug('screen capture stderr', { text: chunk.toString('utf8').trim() }));
    child.once('error', (error) => this.#pumpFailed(child, error));
    child.once('close', (code) => {
      if (code !== 0 && !this.stopped) this.#pumpFailed(child, new Error(`ADB screen capture exited with code ${code}`));
    });
  }

  /** @param {Buffer} chunk */
  #consume(chunk) {
    this.pending = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk;
    if (this.pending.length > MAX_FRAME_BYTES * 2) {
      this.pending = this.pending.subarray(this.pending.length - MAX_FRAME_BYTES);
    }
    while (this.pending.length >= 8) {
      let start = this.pending.indexOf(PNG_SIGNATURE);
      if (start < 0) {
        this.pending = this.pending.subarray(Math.max(0, this.pending.length - PNG_SIGNATURE.length));
        return;
      }
      if (start > 0) this.pending = this.pending.subarray(start);
      let offset = PNG_SIGNATURE.length;
      let end = 0;
      while (offset + 12 <= this.pending.length) {
        const length = this.pending.readUInt32BE(offset);
        if (length > MAX_FRAME_BYTES) break;
        const type = this.pending.toString('ascii', offset + 4, offset + 8);
        const next = offset + 12 + length;
        if (next > this.pending.length) break;
        offset = next;
        if (type === 'IEND') { end = offset; break; }
      }
      if (!end) {
        if (this.pending.length > MAX_FRAME_BYTES) this.pending = this.pending.subarray(1);
        return;
      }
      const frame = this.pending.subarray(0, end);
      this.pending = this.pending.subarray(end);
      if (frame.length < PNG_SIGNATURE.length || !frame.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) continue;
      this.latestFrame = Buffer.from(frame);
      this.latestAt = Date.now();
      for (const waiter of [...this.waiters]) waiter(null, this.latestFrame);
    }
  }

  /** @param {import('node:child_process').ChildProcess} child @param {Error} error */
  #pumpFailed(child, error) {
    if (this.child !== child || this.stopped) return;
    this.child = null;
    this.logger?.warn('phone screen capture pump failed', { message: error.message });
    for (const waiter of this.waiters) waiter(error);
    setTimeout(() => this.#startPump(), 500).unref();
  }
}
