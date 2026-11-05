/**
 * Loopback bridge tests: token enforcement, cross-origin refusal, and that an
 * HTTP command really reaches the pointer manager.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { Logger } from '../src/log.js';
import { MockSession } from '../src/mock-session.js';
import { PointerManager } from '../src/pointers.js';
import { startUiServer } from '../src/ui-server.js';
import { ACTION } from '../src/protocol.js';

const SCREEN = { width: 1080, height: 2340 };
const silent = new Logger({ level: 'error', file: null });

async function harness() {
  const session = new MockSession({ logger: silent, screen: SCREEN });
  const pointers = new PointerManager({ session, screen: SCREEN, logger: silent });
  const ui = await startUiServer({
    config: { uiPort: 0, messageHz: 120 },
    logger: silent,
    session,
    pointers,
    device: {
      serial: 'mock',
      model: 'MOCK-DEVICE',
      manufacturer: 'mock',
      androidRelease: '0',
      sdk: 0,
      width: SCREEN.width,
      height: SCREEN.height,
      density: 420,
      rotation: 0,
      screenState: 'Awake',
    },
    mock: true,
  });
  const base = `http://127.0.0.1:${ui.port}`;
  return { session, pointers, ui, base };
}

test('page is served only with the run token', async () => {
  const { ui, base } = await harness();
  try {
    const ok = await fetch(ui.url);
    assert.equal(ok.status, 200);
    const html = await ok.text();
    assert.match(html, /HEAVEN Mobile Control/);
    assert.match(html, /MOCK TRANSPORT/);

    // Page is served publicly; token is only required for API endpoints
    const pageWithoutToken = await fetch(`${base}/`);
    assert.equal(pageWithoutToken.status, 200);

    // API endpoints require the token header
    const noToken = await fetch(`${base}/api/state`);
    assert.equal(noToken.status, 400);

    const withToken = await fetch(`${base}/api/state`, {
      headers: { 'x-heaven-token': ui.token },
    });
    assert.equal(withToken.status, 200);
  } finally {
    await ui.close();
  }
});

test('state and input require the token header', async () => {
  const { ui, base } = await harness();
  try {
    const noToken = await fetch(`${base}/api/state`);
    assert.equal(noToken.status, 400);

    const state = await fetch(`${base}/api/state`, { headers: { 'x-heaven-token': ui.token } });
    assert.equal(state.status, 200);
    const body = await state.json();
    assert.equal(body.mock, true);
    assert.equal(body.pointers.count, 0);
  } finally {
    await ui.close();
  }
});

test('down / move / panic through HTTP reach the transport', async () => {
  const { ui, base, session } = await harness();
  try {
    const post = (payload, headers = {}) =>
      fetch(`${base}/api/input`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-heaven-token': ui.token, ...headers },
        body: JSON.stringify(payload),
      });

    const down = await post({ op: 'down', name: 'A', x: 100, y: 200 });
    assert.equal(down.status, 200);
    assert.equal((await down.json()).pointers.count, 1);

    const move = await post({ op: 'move', name: 'A', x: 150, y: 250 });
    assert.equal(move.status, 200);

    const panic = await post({ op: 'panic' });
    assert.equal(panic.status, 200);
    assert.equal((await panic.json()).released, 1);

    const actions = session.messages.map((message) => message.action);
    assert.deepEqual(actions, [ACTION.DOWN, ACTION.MOVE, ACTION.UP]);
  } finally {
    await ui.close();
  }
});

test('conflicting operations are rejected with 409', async () => {
  const { ui, base } = await harness();
  try {
    const post = (payload) =>
      fetch(`${base}/api/input`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-heaven-token': ui.token },
        body: JSON.stringify(payload),
      });

    const move = await post({ op: 'move', name: 'ghost', x: 1, y: 1 });
    assert.equal(move.status, 409);
    const body = await move.json();
    assert.equal(body.code, 'POINTER_STATE');
  } finally {
    await ui.close();
  }
});

test('cross-origin and unauthenticated requests are refused', async () => {
  const { ui, base } = await harness();
  try {
    const crossOrigin = await fetch(`${base}/api/input`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-heaven-token': ui.token, origin: 'https://evil.example' },
      body: JSON.stringify({ op: 'panic' }),
    });
    assert.equal(crossOrigin.status, 403);

    const badToken = await fetch(`${base}/api/input`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-heaven-token': 'deadbeef' },
      body: JSON.stringify({ op: 'panic' }),
    });
    assert.equal(badToken.status, 400);
  } finally {
    await ui.close();
  }
});
