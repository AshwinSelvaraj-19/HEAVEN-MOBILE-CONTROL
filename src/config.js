/**
 * Toolchain + run configuration.
 *
 * The PoC deliberately does not depend on PATH: Phase 1 found that both adb and
 * scrcpy exist on this machine but neither is exported. Resolution order is
 * explicit override -> well-known Windows location -> PATH.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppError, ErrorCode } from './errors.js';

export const SCRCPY_VERSION = '4.1';
export const SERVER_JAR_REMOTE = '/data/local/tmp/heaven-poc-server.jar';
/** scrcpy 4.1 win64 `scrcpy-server`; used only as a sanity check, not a hard gate. */
export const KNOWN_SERVER_SIZE = 733706;

/**
 * @typedef {object} Toolchain
 * @property {string} adbPath
 * @property {string} serverJarPath
 * @property {number | null} serverJarSize
 * @property {string | null} adbVersion
 */

const CANDIDATE_SCRCPY_DIRS = [
  'C:/Users/ashwi/Desktop/scrcpy-win64-v4.1/scrcpy-win64-v4.1',
  'C:/Users/ashwi/Desktop/scrcpy-win64-v4.1',
  path.join(os.homedir(), 'Desktop', 'scrcpy-win64-v4.1', 'scrcpy-win64-v4.1'),
  path.join(os.homedir(), 'Downloads', 'scrcpy-win64-v4.1', 'scrcpy-win64-v4.1'),
];

const CANDIDATE_ADB_PATHS = [
  path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
  'C:/Users/ashwi/AppData/Local/Android/Sdk/platform-tools/adb.exe',
];

/**
 * @param {{adb?: string, serverJar?: string}} [overrides]
 * @returns {Toolchain}
 */
export function resolveToolchain(overrides = {}) {
  const adbPath = resolveAdb(overrides.adb);
  const serverJarPath = resolveServerJar(overrides.serverJar);

  let size = null;
  try {
    size = fs.statSync(serverJarPath).size;
  } catch {
    size = null;
  }

  return { adbPath, serverJarPath, serverJarSize: size, adbVersion: null };
}

/** @param {string | undefined} override */
function resolveAdb(override) {
  if (override) {
    assertFile(override, 'adb', ErrorCode.TOOLCHAIN);
    return path.resolve(override);
  }

  const scrcpyDirs = CANDIDATE_SCRCPY_DIRS.filter((dir) => fs.existsSync(dir));

  const candidates = [
    ...CANDIDATE_ADB_PATHS,
    // scrcpy ships its own adb; last resort to keep the PoC runnable.
    ...scrcpyDirs.map((dir) => path.join(dir, 'adb.exe')),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  if (process.platform !== 'win32') {
    return 'adb';
  }

  throw new AppError(ErrorCode.TOOLCHAIN, 'Could not find adb.exe', {
    hint:
      'Pass --adb "<path to adb.exe>" or install Android platform-tools. ' +
      'Expected location: %LOCALAPPDATA%\\Android\\Sdk\\platform-tools\\adb.exe',
    details: { looked: candidates },
  });
}

/** @param {string | undefined} override */
function resolveServerJar(override) {
  if (override) {
    assertFile(override, 'scrcpy server', ErrorCode.TOOLCHAIN);
    return path.resolve(override);
  }

  const candidates = [];
  for (const dir of CANDIDATE_SCRCPY_DIRS) {
    candidates.push(path.join(dir, 'scrcpy-server'));
    candidates.push(path.join(dir, 'scrcpy-server.jar'));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new AppError(ErrorCode.TOOLCHAIN, 'Could not find the scrcpy 4.1 server binary', {
    hint:
      'Pass --server-jar "<path to scrcpy-server>" from the scrcpy-win64-v4.1 folder. ' +
      'The file is named exactly "scrcpy-server" (no extension).',
    details: { looked: candidates },
  });
}

/**
 * @param {string} file
 * @param {string} label
 * @param {string} code
 */
function assertFile(file, label, code) {
  if (!fs.existsSync(file)) {
    throw new AppError(code, `${label} path does not exist: ${file}`);
  }
}

/**
 * @typedef {object} RunConfig
 * @property {string | null} serial
 * @property {number} uiPort
 * @property {boolean} ui
 * @property {boolean} openBrowser
 * @property {boolean} verbose
 * @property {string} logFile
 * @property {number} messageHz
 * @property {string} mode  'ui' | 'selftest' | 'proof' | 'dry-run'
 * @property {number} sweepMs
 * @property {number} keepHeldMs
 * @property {boolean} allowPowerOn
 * @property {boolean} mock
 */

/**
 * @param {string[]} argv process.argv.slice(2)
 * @param {Partial<RunConfig> & {adb?: string, serverJar?: string}} [base]
 * @returns {{config: RunConfig, toolchain: Toolchain}}
 */
export function parseArgs(argv, base = {}) {
  /** @type {Record<string, string | boolean>} */
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      throw new AppError(ErrorCode.BAD_REQUEST, `Unexpected argument: ${arg}`, {
        hint: 'Run with --help for the accepted flags.',
      });
    }
    const [key, inlineValue] = arg.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
      flags[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }

  if (flags.help) {
    return {
      config: { ...defaults(base), mode: 'help' },
      toolchain: /** @type {Toolchain} */ ({}),
    };
  }

  const mode = flags['dry-run']
    ? 'dry-run'
    : flags.selftest
      ? 'selftest'
      : flags.proof
        ? 'proof'
        : 'ui';

  const config = {
    ...defaults(base),
    mode,
    serial: str(flags.serial) ?? base.serial ?? null,
    uiPort: num(flags['ui-port'], base.uiPort ?? 7373),
    ui: !flags['no-ui'] && mode === 'ui',
    openBrowser: !flags['no-open'] && mode === 'ui',
    verbose: Boolean(flags.verbose),
    logFile: str(flags['log-file']) ?? base.logFile ?? defaultLogFile(),
    messageHz: num(flags.hz, base.messageHz ?? 120),
    sweepMs: num(flags['sweep-ms'], base.sweepMs ?? 2000),
    keepHeldMs: num(flags['keep-held'], base.keepHeldMs ?? 0),
    allowPowerOn: Boolean(flags['allow-power-on']),
    mock: Boolean(flags.mock) || base.mock === true,
  };

  const toolchain = resolveToolchain({
    adb: str(flags.adb) ?? base.adb,
    serverJar: str(flags['server-jar']) ?? base.serverJar,
  });

  return { config, toolchain };
}

/** @param {Partial<RunConfig> & {adb?: string, serverJar?: string}} base */
function defaults(base) {
  return {
    serial: null,
    uiPort: 7373,
    ui: true,
    openBrowser: true,
    verbose: false,
    logFile: defaultLogFile(),
    messageHz: 120,
    mode: 'ui',
    sweepMs: 2000,
    keepHeldMs: 0,
    allowPowerOn: false,
    mock: false,
    ...base,
  };
}

export function defaultLogFile() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join('logs', `heaven-poc-${stamp}.jsonl`);
}

export const HELP = `
HEAVEN-MOBILE-CONTROL — Phase 2 multi-touch PoC

Usage:
  node src/main.js [options]

Modes (default: interactive UI):
  (none)            Start a control-only session and the loopback test UI
  --selftest        Detect device, start session, tap once, panic, exit
  --proof           Run the automated two-pointer proof sequence, print JSON
  --dry-run         Resolve toolchain + device, print the plan, touch nothing

Options:
  --serial <s>      Target device serial (required only when several are attached)
  --adb <path>      Path to adb.exe
  --server-jar <p>  Path to the scrcpy 4.1 "scrcpy-server" file
  --ui-port <n>     Loopback UI port (default 7373)
  --no-ui           Headless session (keeps running until Ctrl+C)
  --no-open         Do not open the browser automatically
  --hz <n>          Move message rate for sweeps (default 120)
  --sweep-ms <n>    Duration of the moving pointer in --proof (default 2000)
  --keep-held <ms>  After the proof, hold both pointers this long (visual check)
  --allow-power-on  Permit the server to press POWER if the screen is off
  --mock            Verification harness: no device, messages are counted only
  --log-file <p>    JSONL log path (default logs/heaven-poc-<stamp>.jsonl)
  --verbose         Debug logging
  --help            This text

Safety:
  Loopback UI only (127.0.0.1). USB transports only. No root, no Shizuku,
  no /dev/input, no "adb shell input" for movement.
`.trim();

/** @param {unknown} value */
function str(value) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function num(value, fallback) {
  if (value === undefined || value === true || value === false) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
