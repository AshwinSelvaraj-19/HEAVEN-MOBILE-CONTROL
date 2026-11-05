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
 * @param {import('./device.js').DeviceInfo} options.device 
 * @param {boolean} [options.mock] 
 */ 
export async function startUiServer(options) {
  const { config, logger, session, pointers, device } = options;
  const token = crypto.randomBytes(18).toString('hex');
  const mock = options.mock ?? false;

  let lastSweep = null;
  let lastProof = null;
  let busy = false;
  let lastPollAt = Date.now();
  let closed = false;

  const page = renderPage({
    token,
    width: device.width,
    height: device.height,
    model: device.model,
    mock,
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
      logger.warn('ui request failed', { code: appError.code, message: appError.message, url: req.url });
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

    if (req.method === 'GET' && url.pathname === '/api/state') {
      requireToken(req, url);
      lastPollAt = Date.now();
      sendJson(res, 200, {
        mock,
        session: session.stats(),
        device,
        pointers: pointers.snapshot(),
        lastSweep,
        lastProof: lastProof ? { ok: lastProof.ok, totalMs: lastProof.totalMs, sweep: lastProof.sweep } : null,
        log: logger.tail(60),
      });
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
        const point = holdPosition(device, name);
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
            screen: { width: device.width, height: device.height },
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
        const released = await pointers.panic('ui-panic');
        logger.info('panic handled', { released });
        return { released };
      }
      default:
        throw new AppError(ErrorCode.BAD_REQUEST, `Unknown op: ${op || '(none)'}`);
    }
  }

  /** 
   * @param {http.IncomingMessage} req 
   * @param {URL} url 
   */ 
  function requireToken(req, url) {
    const header = req.headers['x-heaven-token'];
    if (header !== token) {
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
function holdPosition(device, name) {
  const ratio = name.toUpperCase() === 'B' ? { x: 0.65, y: 0.45 } : { x: 0.35, y: 0.45 };
  return {
    x: Math.round(device.width * ratio.x),
    y: Math.round(device.height * ratio.y),
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
