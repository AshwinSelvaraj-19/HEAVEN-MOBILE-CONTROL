/**
 * Device discovery, USB enforcement and screen geometry.
 *
 * The transport rule from the brief is "USB ADB only, no Wi-Fi or LAN". We
 * enforce it rather than document it: a serial containing ':' means a TCP
 * transport (adb reports `host:port`), so it is rejected before any input is
 * sent.
 */

import { AppError, ErrorCode } from './errors.js';
import { parseDevices } from './adb.js';

/**
 * @typedef {object} DeviceInfo
 * @property {string} serial
 * @property {string} model
 * @property {string} manufacturer
 * @property {string} androidRelease
 * @property {number} sdk
 * @property {number} width
 * @property {number} height
 * @property {number} density
 * @property {number} rotation
 * @property {string} screenState
 */

/**
 * @param {import('./adb.js').Adb} adb
 * @returns {Promise<Array<{serial: string, state: string, model: string | null, transport: 'usb' | 'tcp' | 'unknown'}>>}
 */
export async function listTransports(adb) {
  const devices = await adb.devices();
  return devices.map((device) => ({
    serial: device.serial,
    state: device.state,
    model: device.model,
    transport: classifyTransport(device.serial),
  }));
}

/**
 * @param {string} serial
 * @returns {'usb' | 'tcp' | 'unknown'}
 */
export function classifyTransport(serial) {
  if (serial.includes(':')) {
    return 'tcp';
  }
  // USB serials are alphanumeric (letters and digits only); emulators look like emulator-5554.
  if (serial.startsWith('emulator-')) {
    return 'unknown';
  }
  // Only pure alphanumeric serials are classified as USB; reject empty, null, or special chars.
  if (serial && !/^[A-Za-z0-9]+$/.test(serial)) {
    return 'unknown';
  }
  return 'usb';
}

/**
 * Pick exactly one usable USB device, failing loudly otherwise.
 * @param {import('./adb.js').Adb} adb
 * @param {string | null} requestedSerial
 * @param {import('./log.js').Logger} logger
 * @returns {Promise<string>}
 */
export async function selectDevice(adb, requestedSerial, logger) {
  const devices = await listTransports(adb);
  if (devices.length === 0) {
    throw new AppError(ErrorCode.NO_DEVICE, 'No Android device is attached over ADB', {
      hint:
        'Connect the phone with a data-capable USB cable, unlock it, and accept the ' +
        '"Allow USB debugging" prompt. Then check: adb devices -l',
    });
  }

  const candidates = requestedSerial
    ? devices.filter((device) => device.serial === requestedSerial)
    : devices;

  if (candidates.length === 0) {
    throw new AppError(ErrorCode.NO_DEVICE, `Device ${requestedSerial} is not attached`, {
      details: { attached: devices.map((device) => device.serial) },
    });
  }

  const tcp = candidates.find((device) => device.transport === 'tcp');
  if (tcp) {
    throw new AppError(ErrorCode.NOT_USB, `Refusing to use TCP transport (${tcp.serial})`, {
      hint:
        'This PoC is USB-only by requirement. Disconnect the wireless transport ' +
        `(adb disconnect ${tcp.serial}) and plug the cable back in.`,
    });
  }

  const usb = candidates.find((device) => device.transport === 'usb');
  if (!usb) {
    throw new AppError(ErrorCode.NOT_USB, 'No USB transport device found', {
      hint:
        'This PoC is USB-only by requirement. All attached devices are TCP, emulator, or unknown transport.',
      details: { attached: candidates.map((device) => ({ serial: device.serial, transport: device.transport, state: device.state })) },
    });
  }

  const usable = candidates.filter((device) => device.state === 'device' && device.transport === 'usb');
  if (usable.length === 0) {
    const state = candidates[0].state;
    if (state === 'unauthorized') {
      throw new AppError(ErrorCode.DEVICE_UNAUTHORIZED, 'Device is attached but not authorised', {
        hint: 'Unlock the phone and tap "Allow" on the USB debugging prompt.',
      });
    }
    if (state === 'offline') {
      throw new AppError(ErrorCode.DEVICE_OFFLINE, 'Device is offline', {
        hint: 'Replug the cable, or run: adb kill-server && adb start-server',
      });
    }
    throw new AppError(ErrorCode.DEVICE_OFFLINE, `Device state is "${state}"`);
  }

  if (usable.length > 1) {
    throw new AppError(ErrorCode.MULTIPLE_DEVICES, `${usable.length} devices are attached`, {
      hint: 'Choose one with --serial <serial>.',
      details: { serials: usable.map((device) => device.serial) },
    });
  }

  logger.info('device selected', { serial: usable[0].serial, model: usable[0].model ?? 'unknown' });
  return usable[0].serial;
}

/**
 * @param {import('./adb.js').Adb} adb
 * @param {string} serial
 * @returns {Promise<DeviceInfo>}
 */
export async function readDeviceInfo(adb, serial) {
  const [model, manufacturer, release, sdk] = await Promise.all([
    adb.getProp('ro.product.model', { serial }),
    adb.getProp('ro.product.manufacturer', { serial }),
    adb.getProp('ro.build.version.release', { serial }),
    adb.getProp('ro.build.version.sdk', { serial }),
  ]);

  const size = await readScreenSize(adb, serial);
  const density = await readDensity(adb, serial);
  const rotation = await readRotation(adb, serial);
  const screenState = await readScreenState(adb, serial);

  return {
    serial,
    model,
    manufacturer,
    androidRelease: release,
    sdk: Number.parseInt(sdk, 10) || 0,
    width: size.width,
    height: size.height,
    density,
    rotation,
    screenState,
  };
}

/**
 * @param {import('./adb.js').Adb} adb
 * @param {string} serial
 * @returns {Promise<{width: number, height: number}>}
 */
export async function readScreenSize(adb, serial) {
  const { stdout } = await adb.shell(['wm', 'size'], { serial });
  const override = /Override size:\s*(\d+)x(\d+)/i.exec(stdout);
  const physical = /Physical size:\s*(\d+)x(\d+)/i.exec(stdout);
  const match = override ?? physical;
  if (!match) {
    throw new AppError(ErrorCode.ADB_FAILED, 'Could not read screen size from wm size', {
      hint: stdout.trim(),
    });
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

/**
 * @param {import('./adb.js').Adb} adb
 * @param {string} serial
 */
async function readDensity(adb, serial) {
  try {
    const { stdout } = await adb.shell(['wm', 'density'], { serial, allowFailure: true });
    const override = /Override density:\s*(\d+)/i.exec(stdout);
    const physical = /Physical density:\s*(\d+)/i.exec(stdout);
    return Number((override ?? physical)?.[1] ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Display rotation in Surface.ROTATION_* units (0..3).
 * @param {import('./adb.js').Adb} adb
 * @param {string} serial
 */
async function readRotation(adb, serial) {
  try {
    const { stdout } = await adb.shell(['dumpsys', 'input'], { serial, allowFailure: true });
    const match = /SurfaceOrientation:\s*(\d)/.exec(stdout);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
}

/**
 * Best-effort screen power state. Injected touches go nowhere on a sleeping
 * display, so this is reported to the user rather than silently tolerated.
 * @param {import('./adb.js').Adb} adb
 * @param {string} serial
 */
async function readScreenState(adb, serial) {
  try {
    const { stdout } = await adb.shell(['dumpsys', 'power'], { serial, allowFailure: true });
    const wakefulness = /mWakefulness=(\w+)/.exec(stdout)?.[1];
    if (wakefulness) {
      return wakefulness;
    }
    const displayPower = /Display Power:\s*state=(\w+)/.exec(stdout)?.[1];
    if (displayPower) {
      return displayPower;
    }
  } catch {
    /* fall through */
  }
  try {
    const { stdout } = await adb.shell(['dumpsys', 'deviceidle'], { serial, allowFailure: true });
    if (/mScreenOn=true/.test(stdout)) {
      return 'Awake';
    }
  } catch {
    /* ignore */
  }
  return 'unknown';
}

/**
 * Re-export for tests / callers that only need parsing.
 */
export { parseDevices };
