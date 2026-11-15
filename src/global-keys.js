/**
 * System-wide keyboard capture for the mapping engine.
 *
 * A browser page only sees keys while it has focus, which is the biggest
 * behavioural difference from a desktop player like MSI App Player: alt-tab out
 * of the page and WASD stops working. The native N-API addon can read the async
 * key state of the whole desktop, so mapping keeps working while the game has
 * focus instead of the page.
 *
 * The poller is deliberately dumb: it reports raw key transitions and leaves all
 * pointer work to MappingEngine through the caller's onKey handler. It never
 * synthesises input of its own and it never throws at start-up, so a missing
 * addon only costs the global-capture convenience.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Resolved against this module, so the poller works regardless of the cwd the
// app was started from.
const ADDON_PATH = fileURLToPath(new URL('../build/Release/napi_windows_input.node', import.meta.url));

/** Virtual-key codes for the non-alphanumeric keys the page can bind. */
const NAMED_VIRTUAL_KEYS = {
  shift: 0x10,
  control: 0x11,
  alt: 0x12,
  tab: 0x09,
  space: 0x20,
  arrowleft: 0x25,
  arrowup: 0x26,
  arrowright: 0x27,
  arrowdown: 0x28,
};

const ESCAPE_VIRTUAL_KEY = 0x1b;

/**
 * Translate a page key name ('w', 'space', 'arrowup', ...) into a Windows
 * virtual-key code, or null when the key cannot be captured globally (mouse
 * wheel pseudo-keys are produced by the page, not by the keyboard).
 * @param {string} key
 * @returns {number | null}
 */
export function virtualKeyFor(key) {
  const name = String(key ?? '').toLowerCase();
  const alias = { ctrl: 'control', escape: 'esc' }[name] ?? name;
  if (Object.prototype.hasOwnProperty.call(NAMED_VIRTUAL_KEYS, alias)) {
    return NAMED_VIRTUAL_KEYS[alias];
  }
  if (/^[a-z]$/.test(alias)) {
    return alias.toUpperCase().charCodeAt(0);
  }
  if (/^[0-9]$/.test(alias)) {
    return 0x30 + Number(alias);
  }
  return null;
}

export class GlobalKeyPoller {
  /**
   * @param {object} options
   * @param {string[]} options.keys          Key names to watch.
   * @param {(key: string, down: boolean) => void} options.onKey
   * @param {() => void} [options.onEscape]  Called when Escape is pressed globally.
   * @param {(key: string, down: boolean) => void} options.onTransition
   * @param {() => boolean} [options.shouldIgnore] Suppress emitting while true.
   * @param {import('./log.js').Logger} [options.logger]
   * @param {number} [options.intervalMs]
   */
  constructor(options) {
    this.onKey = options.onKey;
    this.onEscape = options.onEscape ?? (() => {});
    this.shouldIgnore = options.shouldIgnore ?? (() => false);
    this.logger = options.logger ?? null;
    this.intervalMs = options.intervalMs ?? 8;
    this.timer = null;
    this.addon = null;
    this.watched = [];
    this.previous = new Map();
    this.escapeDown = false;
    this.keyList = [];

    for (const key of options.keys ?? []) {
      const virtualKey = virtualKeyFor(key);
      if (virtualKey === null || this.watched.some((entry) => entry.virtualKey === virtualKey)) continue;
      this.watched.push({ key: String(key).toLowerCase(), virtualKey });
      this.previous.set(virtualKey, false);
      this.keyList.push(String(key).toLowerCase());
    }
  }

  get active() {
    return Boolean(this.timer);
  }

  /**
   * Load the addon and start polling. Returns false (never throws) when the
   * addon is missing, because the page-local key path still works without it.
   * @returns {boolean}
   */
  start() {
    if (this.timer) return true;
    try {
      const require = createRequire(import.meta.url);
      this.addon = require(ADDON_PATH);
      if (typeof this.addon.GetAsyncKeyState !== 'function') {
        this.addon = null;
      }
    } catch (error) {
      this.addon = null;
      this.logger?.warn?.('global key capture unavailable', {
        message: error instanceof Error ? error.message : String(error),
        note: 'build the native addon (node-gyp rebuild) to keep mapping active while the page is not focused',
      });
    }
    if (!this.addon) return false;

    // Seed the state so a key already held when mapping starts does not fire.
    for (const entry of this.watched) {
      this.previous.set(entry.virtualKey, this.read(entry.virtualKey));
    }
    this.escapeDown = this.read(ESCAPE_VIRTUAL_KEY);

    this.timer = setInterval(() => this.poll(), this.intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    this.logger?.info?.('global key capture started', { keys: this.keyList, intervalMs: this.intervalMs });
    return true;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger?.info?.('global key capture stopped');
    }
  }

  /** @param {number} virtualKey */
  read(virtualKey) {
    if (!this.addon) return false;
    try {
      return Boolean(this.addon.GetAsyncKeyState(virtualKey));
    } catch {
      return false;
    }
  }

  poll() {
    if (!this.addon) return;
    const ignored = this.shouldIgnore();
    for (const entry of this.watched) {
      const down = this.read(entry.virtualKey);
      const was = this.previous.get(entry.virtualKey) ?? false;
      this.previous.set(entry.virtualKey, down);
      if (down === was || ignored) continue;
      try {
        this.onKey(entry.key, down);
      } catch (error) {
        this.logger?.warn?.('global key handler failed', {
          key: entry.key,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const escape = this.read(ESCAPE_VIRTUAL_KEY);
    if (escape && !this.escapeDown && !ignored) {
      try {
        this.onEscape();
      } catch (error) {
        this.logger?.warn?.('global escape handler failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.escapeDown = escape;
  }
}
