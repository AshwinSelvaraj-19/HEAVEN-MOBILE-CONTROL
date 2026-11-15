/** 
 * Loopback HTTP + JSON bridge between the test page and the pointer manager. 
 * 
 * Hardening (cheap, but the right shape): 
 *  - binds 127.0.0.1 only, never 0.0.0.0; 
 *  - a random per-run token is required on every API call, so a random web page 
 *    in the same browser cannot drive the phone through a localhost POST; 
 *  - Origin, when present, must match this server; 
 *  - request bodies are capped at 64 KiB. 
 * 
 * Safety behaviour: 
 *  - one long-running sequence at a time (sweep/proof), so two clicks cannot 
 *    interleave MOVE streams; 
 *  - if the page stops polling while pointers are down (tab closed, crash), all 
 *    pointers are released automatically. 
 */ 
 
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { AppError, ErrorCode, asAppError } from './errors.js';
import { runTwoPointerProof, sweepCircle } from './sequences.js';
import { renderPage } from './ui-page.js';

const BODY_LIMIT = 64 * 1024;
const HEARTBEAT_TIMEOUT_MS = 3000;

/** 
 * @param {object} options 
 * @param {import('./config.js').RunConfig} options.config 
 * @param {import('./log.js').Logger} options.logger 
 * @param {import('./session.js').ScrcpySession | import('./mock-session.js').MockSession} options.session 
 * @param {import('./pointers.js').PointerManager} options.pointers 
 * @param {import('./mapping-engine.js').MappingEngine} [options.mapping]
 * @param {import('./screen-capture.js').ScreenCapture} [options.screenCapture]
 * @param {import('./session.js').ScrcpySession} [options.session] Native scrcpy H.264 video socket.
 * @param {import('./device.js').DeviceInfo} options.device 
 * @param {boolean} [options.mock] 
 */ 
export async function startUiServer(options) {
  const { config, logger, session, pointers, mapping, screenCapture, device } = options;
  const screen = pointers.screen;
  const token = crypto.randomBytes(18).toString('hex');
  const mock = options.mock ?? false;
  const screenWake = options.screenWake ?? session.screenWake ?? null;

  let lastSweep = null;
  let lastProof = null;
  let busy = false;
  let mappingActive = false;
  let mappingTargets = null;
  let mappingBindings = null;
  let mappingTaps = new Map();
  let activeTaps = new Map();
  let cameraEnabled = false;
  const triggerSources = { shoot: new Set(), scope: new Set() };
  let lastPollAt = Date.now();
  let closed = false;

  const page = renderPage({
    token,
    width: device.width,
    height: device.height,
    model: device.model,
    mock,
    screenAvailable: Boolean(screenCapture),
    videoAvailable: Boolean(session.videoStream),
    mouseSensitivity: config.mouseSensitivity ?? 1,
    screenWake,
  });

  session.videoStream?.onDisplaySize(async (width, height) => {
    if (screen.width === width && screen.height === height) return;
    if (mapping) await mapping.emergencyRelease('screen-orientation-changed');
    else await pointers.panic('screen-orientation-changed');
    screen.width = width;
    screen.height = height;
    if (mapping && mappingActive && cameraEnabled) mapping.mouseDown();
    logger.info('phone display orientation changed', { width, height });
  });

  const watchdog = setInterval(() => {
    if (closed) {
      return;
    }
    const active = pointers.snapshot().count;
    if (active > 0 && Date.now() - lastPollAt > HEARTBEAT_TIMEOUT_MS) {
      logger.warn('UI heartbeat lost while pointers are down', { active });
      void pointers.panic('ui-heartbeat-lost');
    }
  }, 1000);

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      const appError = asAppError(error);
      if (!(appError.code === ErrorCode.BAD_REQUEST && appError.message === 'Missing or invalid UI token')) {
        logger.warn('ui request failed', { code: appError.code, message: appError.message, url: req.url });
      }
      sendJson(res, statusFor(appError), { ...appError.toJSON() });
    });
  });

  /** 
   * @param {http.IncomingMessage} req 
   * @param {http.ServerResponse} res 
   */ 
  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const origin = req.headers.origin;
    if (origin && !isLoopbackOrigin(origin)) {
      sendJson(res, 403, { code: 'FORBIDDEN', message: 'Cross-origin request refused' });
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(page);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/screen') {
      requireToken(req, url);
      if (!screenCapture) {
        sendJson(res, 503, { code: 'SCREEN_UNAVAILABLE', message: 'Connect a phone and start a real USB session to view its screen.' });
        return;
      }
      try {
        const frame = await screenCapture.capture();
        const dimensions = screenCapture.dimensions(frame);
        if (screen.width !== dimensions.width || screen.height !== dimensions.height) {
          if (mapping) await mapping.emergencyRelease('screen-orientation-changed');
          else await pointers.panic('screen-orientation-changed');
          screen.width = dimensions.width;
          screen.height = dimensions.height;
          if (mapping && mappingActive && cameraEnabled) mapping.mouseDown();
          logger.info('phone display orientation changed', dimensions);
        }
        res.writeHead(200, {
          'content-type': 'image/png',
          'content-length': frame.length,
          'cache-control': 'no-store',
          'x-display-width': String(dimensions.width),
          'x-display-height': String(dimensions.height),
        });
        res.end(frame);
      } catch (error) {
        logger.warn('phone screen capture failed', { message: error instanceof Error ? error.message : String(error) });
        sendJson(res, 503, { code: 'SCREEN_CAPTURE_FAILED', message: 'Phone screen preview is temporarily unavailable.' });
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/video') {
      requireToken(req, url);
      if (!session.videoStream) {
        sendJson(res, 503, { code: 'VIDEO_UNAVAILABLE', message: 'Native scrcpy video is unavailable for this session.' });
        return;
      }
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      session.videoStream.addClient(res);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/audio') {
      requireToken(req, url);
      if (mock) {
        sendJson(res, 503, { code: 'AUDIO_UNAVAILABLE', message: 'Audio is not available in mock mode.' });
        return;
      }
      if (!session.audioStream) {
        sendJson(res, 503, { code: 'AUDIO_UNAVAILABLE', message: 'Audio stream is unavailable for this session.' });
        return;
      }
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      session.audioStream.addClient(res);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/state') {
      requireToken(req, url);
      lastPollAt = Date.now();
      const sessionStats = session.stats();
      const videoStats = session.videoStream ? session.videoStream.stats() : (sessionStats.video ?? null);
      const audioStats = session.audioStream ? session.audioStream.stats() : (sessionStats.audio ?? { audioConnected: false, audioPacketsReceived: 0, lastAudioPacketAt: null, audioCodec: null, audioCodecConfigured: false, lastAudioError: null });
      const lastServerError = sessionStats.lastServerError ?? (typeof session.lastServerErrorLine === 'function' ? session.lastServerErrorLine() : null);
      sendJson(res, 200, {
        mock,
        session: sessionStats,
        device,
        pointers: pointers.snapshot(),
        mappingActive,
        screenWake: screenWake ?? session.screenWake ?? null,
        lastSweep,
        lastProof: lastProof ? { ok: lastProof.ok, totalMs: lastProof.totalMs, sweep: lastProof.sweep } : null,
        video: videoStats ? { ...videoStats, lastServerError } : { videoConnected: false, videoFramesReceived: 0, lastVideoFrameAt: null, codecConfigured: false, keyframeReceived: false, lastVideoError: null, lastServerError },
        audio: { ...audioStats, audioEnabled: Boolean(sessionStats.audioEnabled ?? (session.audio !== undefined ? session.audio : false)) },
        lastServerError,
        log: logger.tail(60),
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/audio/restart') {
      requireToken(req, url);
      if (mock) {
        sendJson(res, 503, { code: 'AUDIO_UNAVAILABLE', message: 'Audio is not available in mock mode.' });
        return;
      }
      if (typeof session.restartWithAudio !== 'function') {
        sendJson(res, 503, { code: 'AUDIO_UNAVAILABLE', message: 'Audio restart is unavailable for this session.' });
        return;
      }
      const body = await readJson(req);
      const enabled = Boolean(body.enabled);
      // Preserve pointers/mapping state by releasing before restart; UI will reapply mapping as needed.
      if (mapping) await mapping.emergencyRelease('audio-restart').catch(() => undefined);
      else await pointers.panic('audio-restart').catch(() => undefined);
      mappingActive = false;
      cameraEnabled = false;
      clearTriggerSources();
      activeTaps.clear();
      const result = await session.restartWithAudio(enabled);
      if (mapping && enabled === false) {
        // no-op
      }
      sendJson(res, 200, { ok: true, ...result, audio: session.audioStream ? session.audioStream.stats() : null });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/input') {
      requireToken(req, url);
      lastPollAt = Date.now();
      const body = await readJson(req);
      const result = await applyInput(body);
      sendJson(res, 200, { ok: true, ...result, pointers: pointers.snapshot() });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/quit') {
      requireToken(req, url);
      sendJson(res, 200, { ok: true });
      logger.info('quit requested from UI');
      setTimeout(() => process.kill(process.pid, 'SIGTERM'), 50);
      return;
    }

    sendJson(res, 404, { code: 'NOT_FOUND', message: `No route for ${req.method} ${url.pathname}` });
  }

  /** 
   * @param {Record<string, unknown>} body 
   */ 
  async function applyInput(body) {
    const op = String(body.op ?? '');
    const name = body.name === undefined ? null : String(body.name);

    // Audit trail: every command that reaches the transport is logged, so the
    // message counter can always be reconciled against the JSONL log.
    logger.info('input command', {
      op,
      name,
      x: body.x ?? null,
      y: body.y ?? null,
      durationMs: body.durationMs ?? null,
      sentBefore: pointers.snapshot().totalMessages,
    });

    switch (op) {
      case 'down': {
        if (!name) {
          throw new AppError(ErrorCode.BAD_REQUEST, 'op=down requires a pointer name');
        }
        const pointer = pointers.down(name, Number(body.x), Number(body.y));
        return { pointer: { name, id: pointer.id, x: pointer.x, y: pointer.y } };
      }
      case 'move': {
        if (!name) {
          throw new AppError(ErrorCode.BAD_REQUEST, 'op=move requires a pointer name');
        }
        pointers.move(name, Number(body.x), Number(body.y));
        return {};
      }
      case 'up': {
        if (!name) {
          throw new AppError(ErrorCode.BAD_REQUEST, 'op=up requires a pointer name');
        }
        const pointer = pointers.up(name);
        return { pointer: { name, x: pointer.x, y: pointer.y } };
      }
      case 'hold': {
        if (!name) {
          throw new AppError(ErrorCode.BAD_REQUEST, 'op=hold requires a pointer name');
        }
        const point = holdPosition(screen, name);
        const pointer = pointers.down(name, body.x ?? point.x, body.y ?? point.y);
        return { pointer: { name, id: pointer.id, x: pointer.x, y: pointer.y } };
      }
      case 'sweep': {
        if (busy) {
          throw new AppError(ErrorCode.BAD_REQUEST, 'A sequence is already running');
        }
        if (!name) {
          throw new AppError(ErrorCode.BAD_REQUEST, 'op=sweep requires a pointer name');
        }
        busy = true;
        try {
          const durationMs = clampNumber(body.durationMs, 200, 15000, 2000);
          lastSweep = await sweepCircle(pointers, name, { durationMs, hz: config.messageHz });
          logger.info('sweep finished', { ...lastSweep, sentTotal: pointers.snapshot().totalMessages });
          return { sweep: lastSweep };
        } finally {
          busy = false;
        }
      }
      case 'proof': {
        if (busy) {
          throw new AppError(ErrorCode.BAD_REQUEST, 'A sequence is already running');
        }
        busy = true;
        try {
          const durationMs = clampNumber(body.durationMs, 200, 15000, 2000);
          lastProof = await runTwoPointerProof(pointers, {
            screen,
            sweepMs: durationMs,
            hz: config.messageHz,
            logger,
          });
          lastProof = { ...lastProof, totalMs: lastProof.totalMs };
          logger.info('proof finished', {
            ok: lastProof.ok,
            totalMs: lastProof.totalMs,
            sweepSent: lastProof.sweep.sent,
            sentTotal: pointers.snapshot().totalMessages,
          });
          return { proof: lastProof };
        } finally {
          busy = false;
        }
      }
      case 'panic': {
        mappingActive = false;
        cameraEnabled = false;
        clearTriggerSources();
        activeTaps.clear();
        const released = mapping
          ? await mapping.emergencyRelease('ui-panic')
          : await pointers.panic('ui-panic');
        logger.info('panic handled', { released });
        return { released };
      }
      case 'mapping-start': {
        if (!mapping) throw new AppError(ErrorCode.BAD_REQUEST, 'Keyboard mapping is unavailable');
        if (busy) throw new AppError(ErrorCode.BAD_REQUEST, 'A sequence is already running');
        if (mappingActive) throw new AppError(ErrorCode.BAD_REQUEST, 'Keyboard mapping is already active');
        const settings = mappingSettings(body);
        mapping.setJoystickCenter({ x: settings.joystickX, y: settings.joystickY });
        mapping.setJoystickRadius({ x: settings.joystickRadius, y: settings.joystickRadius });
        mapping.setMouseAnchor({ x: settings.cameraX, y: settings.cameraY });
        if (typeof mapping.setSensitivityX === 'function' && typeof mapping.setSensitivityY === 'function') {
          mapping.setSensitivityX(settings.sensitivityX ?? settings.sensitivity ?? 1);
          mapping.setSensitivityY(settings.sensitivityY ?? settings.sensitivity ?? 1);
        } else {
          mapping.setSensitivity(settings.sensitivity ?? 1);
        }
        if (typeof mapping.setMouseAcceleration === 'function') mapping.setMouseAcceleration(settings.mouseAcceleration === true);
        if (typeof mapping.setTweaks === 'function') mapping.setTweaks(settings.tweaks);
        mapping.mouseDown();
        mappingActive = true;
        mappingTargets = settings;
        mappingBindings = settings.bindings;
        mappingTaps = settings.tapBindings;
        activeTaps.clear();
        cameraEnabled = true;
        clearTriggerSources();
        const tapKeys = [...mappingTaps.keys()];
        const bindingList = Object.entries(mappingBindings).filter(([,v]) => v).map(([k,v]) => `${k}:${v}`);
        const expected = Array.isArray(body.expectedKeys) ? body.expectedKeys.map(normalizeBindingKey) : null;
        const receivedKeys = new Set([...Object.values(mappingBindings).filter(Boolean), ...tapKeys]);
        const missingKeys = expected ? [...new Set(expected.filter(k => !receivedKeys.has(k)))] : [];
        logger.info('keyboard mapping started', {
          bindings: bindingList,
          tapKeys,
          cameraX: settings.cameraX, cameraY: settings.cameraY,
          shootX: settings.shoot.x, shootY: settings.shoot.y,
          scopeX: settings.scope.x, scopeY: settings.scope.y,
          sensitivity: settings.sensitivity, sensitivityX: settings.sensitivityX, sensitivityY: settings.sensitivityY,
          mouseAcceleration: settings.mouseAcceleration, tweaks: settings.tweaks,
          fireWithLeftClick: settings.fireWithLeftClick,
          expectedKeys: expected,
          missingKeys,
        });
        if (missingKeys.length) {
          throw new AppError(ErrorCode.BAD_REQUEST, `Missing bound keys on server: ${missingKeys.join(', ')}`);
        }
        return { mappingActive, settings: { ...settings, tapBindingKeys: tapKeys, bindings: mappingBindings }, missingKeys };
      }
      case 'mapping-stop': {
        mappingActive = false;
        clearTriggerSources();
        activeTaps.clear();
        cameraEnabled = false;
        const released = mapping
          ? await mapping.emergencyRelease('mapping-stop')
          : await pointers.panic('mapping-stop');
        return { mappingActive, released };
      }
      case 'mapping-update': {
        if (!mapping || !mappingActive) {
          throw new AppError(ErrorCode.BAD_REQUEST, 'Keyboard mapping is not active');
        }
        const settings = mappingSettings(body);
        mapping.setJoystickCenter({ x: settings.joystickX, y: settings.joystickY });
        mapping.setJoystickRadius({ x: settings.joystickRadius, y: settings.joystickRadius });
        mapping.setMouseAnchor({ x: settings.cameraX, y: settings.cameraY });
        if (typeof mapping.setSensitivityX === 'function' && typeof mapping.setSensitivityY === 'function') {
          mapping.setSensitivityX(settings.sensitivityX ?? settings.sensitivity ?? 1);
          mapping.setSensitivityY(settings.sensitivityY ?? settings.sensitivity ?? 1);
        } else {
          mapping.setSensitivity(settings.sensitivity ?? 1);
        }
        if (typeof mapping.setMouseAcceleration === 'function') mapping.setMouseAcceleration(settings.mouseAcceleration === true);
        if (typeof mapping.setTweaks === 'function') mapping.setTweaks(settings.tweaks);
        mappingTargets = settings;
        mappingBindings = settings.bindings;
        mappingTaps = settings.tapBindings;
        clearTriggerSources();
        logger.info('keyboard mapping updated', {
          cameraX: settings.cameraX, cameraY: settings.cameraY,
          shootX: settings.shoot.x, shootY: settings.shoot.y,
          scopeX: settings.scope.x, scopeY: settings.scope.y,
          sensitivity: settings.sensitivity, sensitivityX: settings.sensitivityX, sensitivityY: settings.sensitivityY,
          mouseAcceleration: settings.mouseAcceleration, tweaks: settings.tweaks,
          fireWithLeftClick: settings.fireWithLeftClick,
          tapKeys: [...mappingTaps.keys()],
        });
        return { mappingActive: true, updated: true };
      }
      case 'key-down':
      case 'key-up': {
        if (!mapping || !mappingActive) return { mappingActive: false };
        const key = normalizeBindingKey(body.key);
        const down = op === 'key-down';
        if (down && mappingBindings.cameraToggle === key) {
          cameraEnabled = !cameraEnabled;
          if (cameraEnabled) mapping.mouseDown();
          else mapping.mouseUp();
        }
        const movement = Object.entries(mappingBindings).find(([, binding]) => binding === key);
        const directions = { forward: 'w', left: 'a', backward: 's', right: 'd' };
        if (movement && directions[movement[0]]) {
          if (down) mapping.keyDown(directions[movement[0]]);
          else mapping.keyUp(directions[movement[0]]);
        }
        if (mappingBindings.fire === key) {
          applyTrigger('shoot', `key:${key}`, down);
        }
        if (mappingBindings.scope === key) {
          applyTrigger('scope', `key:${key}`, down);
        }
        const targets = mappingTaps.get(key) || [];
        if (down && targets.length && !activeTaps.has(key)) {
          const names = [];
          for (let index = 0; index < targets.length; index++) {
            const target = targets[index];
            const name = `cfg-${key}-${index}`;
            pointers.down(name, target.x * screen.width, target.y * screen.height);
            names.push(name);
          }
          activeTaps.set(key, names);
        } else if (!down && activeTaps.has(key)) {
          for (const name of activeTaps.get(key)) {
            if (pointers.active.has(name)) pointers.up(name);
          }
          activeTaps.delete(key);
        }
        return { mappingActive };
      }
      case 'camera-move': {
        if (!mapping || !mappingActive) return { mappingActive: false };
        mapping.mouseMove(finiteInput(body.dx, 'dx'), finiteInput(body.dy, 'dy'));
        return { mappingActive };
      }
      case 'button-down':
      case 'button-up': {
        if (!mapping || !mappingActive) return { mappingActive: false };
        const button = String(body.button ?? '');
        const fireAction = mappingTargets && mappingTargets.fireAction ? String(mappingTargets.fireAction).toUpperCase() : 'LEFT CLICK';
        const fireButton = fireAction === 'RIGHT CLICK' ? 'right' : fireAction === 'MIDDLE CLICK' ? 'middle' : 'left';
        const action = (button === fireButton) ? 'shoot' : (button === 'right' ? 'scope' : null);
        if (!action) return { mappingActive };
        if (action === 'shoot' && mappingTargets && mappingTargets.fireWithLeftClick === false && op === 'button-down') return { mappingActive };
        applyTrigger(action, `mouse:${button}`, op === 'button-down');
        return { mappingActive };
      }
      default:
        throw new AppError(ErrorCode.BAD_REQUEST, `Unknown op: ${op || '(none)'}`);
    }
  }

  function clearTriggerSources() {
    triggerSources.shoot.clear();
    triggerSources.scope.clear();
  }

  function applyTrigger(action, source, down) {
    if (action === 'shoot' && mappingTargets && mappingTargets.fireWithLeftClick === false) {
      if (down) return;
      // if disabled, ensure any prior state from this source cleared
    }
    const sources = triggerSources[action];
    if (down) {
      if (sources.has(source)) return;
      if (action === 'shoot' && mappingTargets && mappingTargets.fireWithLeftClick === false) return;
      const wasReleased = sources.size === 0;
      sources.add(source);
      if (wasReleased) {
        const target = mappingTargets[action];
        mapping[`${action}Down`](target.x * screen.width, target.y * screen.height);
      }
    } else if (sources.delete(source) && sources.size === 0) {
      mapping[`${action}Up`]();
    }
  }

  /** 
   * @param {http.IncomingMessage} req 
   * @param {URL} url 
   */ 
  function requireToken(req, url) {
    const header = req.headers['x-heaven-token'];
    if (header !== token && url.searchParams.get('t') !== token) {
      throw new AppError(ErrorCode.BAD_REQUEST, 'Missing or invalid UI token');
    }
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.uiPort, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(undefined);
    });
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : config.uiPort;
  const url = `http://127.0.0.1:${port}/`;

  return {
    url,
    port,
    token,
    /** Opens the panel in the user's default browser. */ 
    async openBrowser() {
      try {
        if (process.platform === 'win32') {
          // `start` needs an empty title argument to avoid treating the URL as one.
          spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        } else if (process.platform === 'darwin') {
          spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
        } else {
          spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
        }
        logger.info('browser launch requested');
      } catch (error) {
        logger.warn('could not open the browser', {
          message: error instanceof Error ? error.message : String(error),
          url,
        });
      }
    },
    async close() {
      closed = true;
      clearInterval(watchdog);
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    },
  };
}

/** 
 * @param {import('./device.js').DeviceInfo} device 
 * @param {string} name 
 */ 
function holdPosition(screen, name) {
  const ratio = name.toUpperCase() === 'B' ? { x: 0.65, y: 0.45 } : { x: 0.35, y: 0.45 };
  return {
    x: Math.round(screen.width * ratio.x),
    y: Math.round(screen.height * ratio.y),
  };
}

/** 
 * @param {unknown} value 
 * @param {number} min 
 * @param {number} max 
 * @param {number} fallback 
 */ 
function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

/** @param {Record<string, unknown>} body */
function mappingSettings(body) {
  const setting = (name, fallback) => {
    const value = body[name] === undefined ? fallback : Number(body[name]);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new AppError(ErrorCode.BAD_REQUEST, `${name} must be between 0 and 1`);
    }
    return value;
  };
  const sensitivity = body.sensitivity === undefined ? 1 : Number(body.sensitivity);
  const sensitivityX = body.sensitivityX === undefined ? sensitivity : Number(body.sensitivityX);
  const sensitivityY = body.sensitivityY === undefined ? sensitivity : Number(body.sensitivityY);
  if (!Number.isFinite(sensitivity) || sensitivity < 0 || sensitivity > 10) {
    throw new AppError(ErrorCode.BAD_REQUEST, 'sensitivity must be between 0 and 10');
  }
  if (!Number.isFinite(sensitivityX) || sensitivityX < 0.1 || sensitivityX > 10) {
    throw new AppError(ErrorCode.BAD_REQUEST, 'sensitivityX must be between 0.1 and 10');
  }
  if (!Number.isFinite(sensitivityY) || sensitivityY < 0.1 || sensitivityY > 10) {
    throw new AppError(ErrorCode.BAD_REQUEST, 'sensitivityY must be between 0.1 and 10');
  }
  const tweaks = body.tweaks === undefined ? 16450 : Number(body.tweaks);
  const mouseAcceleration = body.mouseAcceleration === true || body.mouseAcceleration === 'true';
  const fireWithLeftClick = body.fireWithLeftClick === false || body.fireWithLeftClick === 'false' ? false : true;
  const bindings = {
    forward: normalizeBindingKey(body.forwardKey ?? 'w'),
    left: normalizeBindingKey(body.leftKey ?? 'a'),
    backward: normalizeBindingKey(body.backwardKey ?? 's'),
    right: normalizeBindingKey(body.rightKey ?? 'd'),
    fire: body.fireKey === null || body.fireKey === '' ? null : normalizeBindingKey(body.fireKey ?? 'space'),
    scope: body.scopeKey === null || body.scopeKey === '' ? null : normalizeBindingKey(body.scopeKey ?? 'shift'),
  };
  if (new Set(Object.values(bindings).filter(Boolean)).size !== Object.values(bindings).filter(Boolean).length) {
    throw new AppError(ErrorCode.BAD_REQUEST, 'Each action must use a different key');
  }
  const tapBindings = new Map();
  if (body.tapBindings !== undefined) {
    if (!Array.isArray(body.tapBindings) || body.tapBindings.length > 64) {
      throw new AppError(ErrorCode.BAD_REQUEST, 'tapBindings must contain at most 64 targets');
    }
    for (const raw of body.tapBindings) {
      if (!raw || typeof raw !== 'object') throw new AppError(ErrorCode.BAD_REQUEST, 'Invalid tap binding');
      const key = normalizeBindingKey(raw.key);
      const x = Number(raw.x);
      const y = Number(raw.y);
      if (!Number.isFinite(x) || x < 0 || x > 1 || !Number.isFinite(y) || y < 0 || y > 1) {
        throw new AppError(ErrorCode.BAD_REQUEST, 'Tap target coordinates must be between 0 and 1');
      }
      if (!tapBindings.has(key)) tapBindings.set(key, []);
      tapBindings.get(key).push({ x, y, action: String(raw.action ?? key).slice(0, 80) });
    }
  }
  return {
    joystickX: setting('joystickX', 0.2),
    joystickY: setting('joystickY', 0.8),
    joystickRadius: setting('joystickRadius', 0.1),
    cameraX: setting('cameraX', 0.5),
    cameraY: setting('cameraY', 0.5),
    sensitivity,
    sensitivityX,
    sensitivityY,
    tweaks,
    mouseAcceleration,
    fireWithLeftClick,
    bindings: {
      ...bindings,
      cameraToggle: body.cameraToggleKey ? normalizeBindingKey(body.cameraToggleKey) : null,
    },
    tapBindings,
    shoot: { x: setting('shootX', 0.85), y: setting('shootY', 0.8) },
    scope: { x: setting('scopeX', 0.85), y: setting('scopeY', 0.65) },
  };
}

/** @param {unknown} value */
function normalizeBindingKey(value) {
  let key = String(value ?? '').trim().toLowerCase();
  const aliases = {
    ' ': 'space',
    spacebar: 'space',
    ctrl: 'control',
    esc: 'escape',
    del: 'delete',
    os: 'meta',
    win: 'meta',
  };
  key = aliases[key] || key;
  if (!key || key === 'escape') {
    throw new AppError(ErrorCode.BAD_REQUEST, 'Escape is reserved and cannot be bound.');
  }
  return key;
}

/** @param {unknown} value @param {string} name */
function finiteInput(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new AppError(ErrorCode.BAD_REQUEST, `${name} must be a finite number`);
  return number;
}

/** 
 * @param {string} origin e.g. \"http://127.0.0.1:7373\" 
 */ 
function isLoopbackOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '[::1]';
  } catch {
    return false;
  }
}

/** 
 * @param {http.IncomingMessage} req 
 * @returns {Promise<Record<string, unknown>>} 
 */ 
async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) {
      throw new AppError(ErrorCode.BAD_REQUEST, 'Request body too large');
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('not an object');
    }
    return parsed;
  } catch (error) {
    throw new AppError(ErrorCode.BAD_REQUEST, 'Invalid JSON body', {
      cause: error,
    });
  }
}

/** 
 * @param {http.ServerResponse} res 
 * @param {number} status 
 * @param {Record<string, unknown>} body 
 */ 
function sendJson(res, status, body) {
  if (res.writableEnded) {
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** 
 * @param {AppError} error 
 */ 
function statusFor(error) {
  switch (error.code) {
    case ErrorCode.BAD_REQUEST:
      return 400;
    case ErrorCode.POINTER_STATE:
    case ErrorCode.POINTER_LIMIT:
      return 409;
    case ErrorCode.SESSION_LOST:
      return 503;
    default:
      return 500;
  }
}

