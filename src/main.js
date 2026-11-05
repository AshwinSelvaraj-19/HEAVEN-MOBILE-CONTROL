#!/usr/bin/env node
/**
 * HEAVEN-MOBILE-CONTROL — Phase 2 multi-touch proof of concept.
 *
 * Everything in this file is wiring: argument parsing, device checks, session
 * lifecycle, exit paths. The interesting parts live in
 *   protocol.js   wire format of INJECT_TOUCH_EVENT (verified against v4.1)
 *   pointers.js   the invariant-preserving multi-pointer state machine
 *   sequences.js  the deterministic two-pointer proof
 *   ui-server.js  the loopback test interface
 */

import process from 'node:process';
import { Adb } from './adb.js';
import { HELP, parseArgs, SCRCPY_VERSION } from './config.js';
import { readDeviceInfo, selectDevice } from './device.js';
import { AppError, ErrorCode, asAppError } from './errors.js';
import { Logger } from './log.js';
import { PointerManager } from './pointers.js';
import { ScrcpySession } from './session.js';
import { MockSession } from './mock-session.js';
import { runTwoPointerProof } from './sequences.js';
import { delay } from './control-channel.js';

const EXIT = {
  OK: 0,
  INTERNAL: 1,
  ENVIRONMENT: 2,
  SESSION: 3,
  PROTOCOL: 4,
};

async function main() {
  const { config, toolchain } = parseArgs(process.argv.slice(2));

  if (config.mode === 'help') {
    process.stdout.write(HELP + '\n');
    return EXIT.OK;
  }

  const logger = new Logger({
    level: config.verbose ? 'debug' : 'info',
    file: config.logFile,
  });

  /** @type {ScrcpySession | null} */
  let session = null;
  /** @type {PointerManager | null} */
  let pointers = null;
  let shuttingDown = false;

  const shutdown = async (reason, exitCode = EXIT.OK) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info('shutting down', { reason });
    try {
      if (pointers) {
        await pointers.panic(reason);
      }
    } finally {
      if (session) {
        await session.stop().catch((error) => {
          logger.warn('session stop failed', { message: error instanceof Error ? error.message : String(error) });
        });
      }
      await logger.close();
    }
    if (exitCode !== undefined) {
      process.exit(exitCode);
    }
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT', EXIT.OK);
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM', EXIT.OK);
  });
  process.on('uncaughtException', (error) => {
    logger.error('uncaught exception', { message: error.message, stack: error.stack });
    void shutdown('uncaughtException', EXIT.INTERNAL);
  });
  process.on('unhandledRejection', (reason) => {
    const error = asAppError(reason);
    logger.error('unhandled rejection', { code: error.code, message: error.message });
    void shutdown('unhandledRejection', EXIT.INTERNAL);
  });

  try {
    logger.info('HEAVEN-MOBILE-CONTROL PoC', {
      mode: config.mode,
      node: process.version,
      scrcpyServerVersion: SCRCPY_VERSION,
      logFile: config.logFile,
    });
    logger.info('toolchain', {
      adb: toolchain.adbPath,
      serverJar: toolchain.serverJarPath,
      serverJarBytes: toolchain.serverJarSize,
    });

    if (toolchain.serverJarSize && toolchain.serverJarSize !== 733706) {
      logger.warn('unexpected scrcpy-server size', {
        bytes: toolchain.serverJarSize,
        expected: 733706,
        note: 'Size check is advisory; protocol may differ if this is not scrcpy 4.1',
      });
    }

    if (config.mock && config.mode === 'dry-run') {
      throw new AppError(ErrorCode.BAD_REQUEST, '--dry-run inspects the real toolchain and cannot be combined with --mock');
    }

    /** @type {Adb | null} */
    let adb = null;
    let adbVersion = 'mock';
    /** @type {import('./device.js').DeviceInfo} */
    let device;

    if (config.mock) {
      // Verification harness: exercise pointers/sequences/UI with no device.
      device = {
        serial: 'mock',
        model: 'MOCK-DEVICE',
        manufacturer: 'mock',
        androidRelease: '0',
        sdk: 0,
        width: 1080,
        height: 2340,
        density: 420,
        rotation: 0,
        screenState: 'Awake',
      };
      logger.warn('mock transport enabled', { note: 'no adb, no injection; messages are counted in memory' });
    } else {
      adb = new Adb(toolchain.adbPath, { logger });
      const version = await adb.run(['version'], { timeoutMs: 10000, allowFailure: true });
      adbVersion = (version.stdout.split(/\r?\n/)[0] ?? 'unknown').trim();
      logger.info('adb', { version: adbVersion });

      const serial = await selectDevice(adb, config.serial, logger);
      device = await readDeviceInfo(adb, serial);
    }

    logger.info('device', {
      model: device.model,
      manufacturer: device.manufacturer,
      android: device.androidRelease,
      sdk: device.sdk,
      screen: `${device.width}x${device.height}`,
      density: device.density,
      rotation: device.rotation,
      screenState: device.screenState,
    });

    if (device.rotation !== 0) {
      logger.warn('device is rotated', {
        rotation: device.rotation,
        note: 'This PoC sends natural-orientation pixel coordinates and has only been reasoned about for rotation 0',
      });
    }

    const screenAsleep = device.screenState !== 'unknown' && !/awake|on/i.test(device.screenState);
    if (screenAsleep) {
      logger.warn('screen appears to be off', {
        screenState: device.screenState,
        note: 'Injected touches will not reach any window. Wake the device, or pass --allow-power-on.',
      });
    }

    if (config.mode === 'dry-run') {
      const report = {
        ok: true,
        mode: 'dry-run',
        toolchain: {
          adb: toolchain.adbPath,
          adbVersion: adbVersion.trim(),
          serverJar: toolchain.serverJarPath,
          serverJarBytes: toolchain.serverJarSize,
        },
        device,
        transport: 'usb',
        plannedServerArgs: buildPlannedArgs(device),
        notes: [
          'dry run: nothing was pushed, launched or injected',
          screenAsleep ? 'screen may be off; touches would not land' : 'screen state looks usable',
        ],
      };
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      await logger.close();
      return EXIT.OK;
    }

    if (config.mock) {
      session = /** @type {any} */ (
        new MockSession({ logger, screen: { width: device.width, height: device.height } })
      );
    } else {
      session = new ScrcpySession({
        adb: /** @type {Adb} */ (adb),
        serial: device.serial,
        device,
        logger,
        serverJarPath: toolchain.serverJarPath,
        allowPowerOn: config.allowPowerOn,
      });

      session.onLost((error) => {
        logger.error('session lost', { code: error.code, message: error.message });
        void shutdown('session-lost', EXIT.SESSION);
      });
    }

    const sessionInfo = await session.start();
    logger.info('session established', sessionInfo);

    pointers = new PointerManager({ session, screen: { width: device.width, height: device.height }, logger });
    pointers.onEvent((name, action, x, y) => logger.debug('pointer', { name, action, x, y }));

    if (config.mode === 'selftest') {
      logger.info('selftest: single tap at screen centre');
      const x = Math.round(device.width / 2);
      const y = Math.round(device.height / 2);
      pointers.down('A', x, y);
      await delay(120);
      pointers.up('A');
      const report = {
        ok: true,
        mode: 'selftest',
        device,
        session: session.stats(),
        messagesSent: pointers.snapshot().totalMessages,
        note: 'A single ACTION_DOWN/ACTION_UP pair was sent. This proves transport and injection plumbing, not multi-touch.',
      };
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      await shutdown('selftest-complete', EXIT.OK);
      return EXIT.OK;
    }

    if (config.mode === 'proof') {
      const report = await runTwoPointerProof(pointers, {
        screen: { width: device.width, height: device.height },
        sweepMs: config.sweepMs,
        hz: config.messageHz,
        keepHeldMs: config.keepHeldMs,
        logger,
      });
      await pointers.panic('proof-cleanup');
      const output = {
        ...report,
        device,
        session: session.stats(),
      };
      process.stdout.write(JSON.stringify(output, null, 2) + '\n');
      await shutdown('proof-complete', report.ok ? EXIT.OK : EXIT.PROTOCOL);
      return report.ok ? EXIT.OK : EXIT.PROTOCOL;
    }

    // Interactive mode: loopback UI.
    const { startUiServer } = await import('./ui-server.js');
    const ui = await startUiServer({ config, logger, session, pointers, device, mock: config.mock });
    logger.info('UI ready', { url: ui.url });
    process.stdout.write(`\n  Test interface: ${ui.url}\n  Press Ctrl+C to release all pointers and exit.\n\n`);

    if (config.openBrowser) {
      await ui.openBrowser();
    }

    // Keep the process alive; shutdown happens on signals or /api/quit.
    await new Promise(() => undefined);
    return EXIT.OK;
  } catch (error) {
    const appError = asAppError(error);
    logger.error('fatal', {
      code: appError.code,
      message: appError.message,
      hint: appError.hint,
      details: appError.details,
    });
    if (pointers) {
      await pointers.panic('fatal-error').catch(() => undefined);
    }
    if (session) {
      await session.stop().catch(() => undefined);
    }
    await logger.close();

    switch (appError.code) {
      case ErrorCode.TOOLCHAIN:
      case ErrorCode.NO_DEVICE:
      case ErrorCode.MULTIPLE_DEVICES:
      case ErrorCode.DEVICE_UNAUTHORIZED:
      case ErrorCode.DEVICE_OFFLINE:
      case ErrorCode.NOT_USB:
        return EXIT.ENVIRONMENT;
      case ErrorCode.SESSION_START:
      case ErrorCode.SESSION_LOST:
      case ErrorCode.ADB_FAILED:
        return EXIT.SESSION;
      case ErrorCode.PROTOCOL:
      case ErrorCode.POINTER_STATE:
      case ErrorCode.POINTER_LIMIT:
        return EXIT.PROTOCOL;
      default:
        return EXIT.INTERNAL;
    }
  }
}

/**
 * Mirrors the argv that session.js will pass to app_process, for --dry-run.
 * Kept in one place conceptually but duplicated as data on purpose: the dry run
 * must never depend on a live session object.
 * @param {{width: number, height: number}} device
 */
function buildPlannedArgs(device) {
  return [
    'CLASSPATH=/data/local/tmp/heaven-poc-server.jar',
    'app_process',
    '/',
    'com.genymobile.scrcpy.Server',
    SCRCPY_VERSION,
    'scid=<random hex>',
    'log_level=info',
    'video=false',
    'audio=false',
    'control=true',
    'tunnel_forward=true',
    'send_device_meta=false',
    'send_dummy_byte=false',
    'clipboard_autosync=false',
    'power_on=false',
    'cleanup=true',
    `# touch coordinates: 0..${device.width - 1} x 0..${device.height - 1}`,
  ];
}

main()
  .then((code) => {
    if (code !== EXIT.OK) {
      process.exitCode = code;
    }
  })
  .catch((error) => {
    process.stderr.write(`fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = EXIT.INTERNAL;
  });
