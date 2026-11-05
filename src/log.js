/**
 * Structured logger: console (human), JSONL file (machine), and a small ring
 * buffer that the loopback UI polls. No dependencies.
 */

import fs from 'node:fs';
import path from 'node:path';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

/** @typedef {'debug' | 'info' | 'warn' | 'error'} Level */

export class Logger {
  /**
   * @param {{level?: Level, file?: string | null, ringSize?: number, sink?: (line: string, entry: object) => void}} [options]
   */
  constructor(options = {}) {
    this.level = options.level ?? 'info';
    this.ringSize = options.ringSize ?? 300;
    /** @type {object[]} */
    this.ring = [];
    this.seq = 0;
    this.sink = options.sink ?? null;
    this.file = options.file ?? null;
    this.stream = null;

    if (this.file) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      this.stream = fs.createWriteStream(this.file, { flags: 'a' });
    }
  }

  /**
   * @param {Level} level
   * @param {string} message
   * @param {Record<string, unknown>} [fields]
   */
  write(level, message, fields = {}) {
    if (LEVELS[level] < LEVELS[this.level]) {
      return;
    }
    const entry = {
      seq: ++this.seq,
      ts: new Date().toISOString(),
      level,
      msg: message,
      ...fields,
    };

    this.ring.push(entry);
    if (this.ring.length > this.ringSize) {
      this.ring.splice(0, this.ring.length - this.ringSize);
    }

    const tail = Object.entries(fields)
      .map(([k, v]) => `${k}=${formatValue(v)}`)
      .join(' ');
    const line = `${entry.ts} ${level.toUpperCase().padEnd(5)} ${message}${tail ? ' ' + tail : ''}`;
    // stderr keeps stdout clean for --proof / --selftest machine output.
    process.stderr.write(line + '\n');

    if (this.stream) {
      this.stream.write(JSON.stringify(entry) + '\n');
    }
    if (this.sink) {
      this.sink(line, entry);
    }
  }

  debug(message, fields) {
    this.write('debug', message, fields);
  }

  info(message, fields) {
    this.write('info', message, fields);
  }

  warn(message, fields) {
    this.write('warn', message, fields);
  }

  error(message, fields) {
    this.write('error', message, fields);
  }

  /** @param {number} [limit] */
  tail(limit = 40) {
    return this.ring.slice(-limit);
  }

  async close() {
    if (!this.stream) {
      return;
    }
    await new Promise((resolve) => this.stream.end(resolve));
    this.stream = null;
  }
}

/** @param {unknown} value */
function formatValue(value) {
  if (value === null || value === undefined) {
    return String(value);
  }
  if (typeof value === 'string') {
    return /[\s"]/.test(value) ? JSON.stringify(value) : value;
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
