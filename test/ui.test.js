/**
 * Loopback bridge tests: token enforcement, cross-origin refusal, and that an
 * HTTP command really reaches the pointer manager.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { Logger } from '../src/log.js';
import { MockSession } from '../src/mock-session.js';
import { PointerManager } from '../src/pointers.js';
import { MappingEngine } from '../src/mapping-engine.js';
import { startUiServer } from '../src/ui-server.js';
import { ACTION } from '../src/protocol.js';

const SCREEN = { width: 1080, height: 2340 };
const silent = new Logger({ level: 'error', file: null });

async function harness() {
  const session = new MockSession({ logger: silent, screen: SCREEN });
  const pointers = new PointerManager({ session, screen: SCREEN, logger: silent });
  const mapping = new MappingEngine(pointers, SCREEN);
  const ui = await startUiServer({
    config: { uiPort: 0, messageHz: 120 },
    logger: silent,
    session,
    pointers,
    mapping,
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
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1, 'controller page should contain its inline client');
    assert.doesNotThrow(() => new Function(scripts[0][1]), 'controller client should parse as JavaScript');

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
    const noScreenToken = await fetch(`${base}/api/screen`);
    assert.equal(noScreenToken.status, 400);
    const mockScreen = await fetch(`${base}/api/screen?t=${ui.token}`);
    assert.equal(mockScreen.status, 503, 'mock mode should explain that no phone image is available');
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

test('editable key bindings drive movement, camera, fire, and scope pointers', async () => {
  const { ui, base, session, pointers } = await harness();
  try {
    const post = (payload) => fetch(`${base}/api/input`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-heaven-token': ui.token },
      body: JSON.stringify(payload),
    });

    const duplicate = await post({
      op: 'mapping-start', forwardKey: 'i', leftKey: 'i', backwardKey: 'k', rightKey: 'l', fireKey: 'f', scopeKey: 'g',
    });
    assert.equal(duplicate.status, 400, 'duplicate key bindings should be rejected');
    assert.equal(pointers.snapshot().count, 0, 'invalid bindings should not press any pointers');

    const started = await post({
      op: 'mapping-start', joystickX: 0.2, joystickY: 0.8, sensitivity: 1,
      forwardKey: 'i', leftKey: 'j', backwardKey: 'k', rightKey: 'l', fireKey: 'f', scopeKey: 'g',
    });
    assert.equal(started.status, 200);
    assert.equal((await started.json()).mappingActive, true);
    assert.equal(pointers.snapshot().count, 1, 'camera pointer should start when mapping is enabled');

    assert.equal((await post({ op: 'key-down', key: 'i' })).status, 200);
    assert.equal((await post({ op: 'key-up', key: 'i' })).status, 200);
    assert.equal((await post({ op: 'camera-move', dx: 12, dy: -8 })).status, 200);
    assert.equal((await post({ op: 'button-down', button: 'left' })).status, 200);
    assert.equal((await post({ op: 'button-up', button: 'left' })).status, 200);
    assert.equal((await post({ op: 'button-down', button: 'right' })).status, 200);
    assert.equal((await post({ op: 'button-up', button: 'right' })).status, 200);
    assert.equal((await post({ op: 'key-down', key: 'f' })).status, 200);
    assert.equal((await post({ op: 'key-up', key: 'f' })).status, 200);
    assert.equal((await post({ op: 'key-down', key: 'g' })).status, 200);
    assert.equal((await post({ op: 'key-up', key: 'g' })).status, 200);

    const stopped = await post({ op: 'mapping-stop' });
    assert.equal(stopped.status, 200);
    assert.equal(pointers.snapshot().count, 0, 'stopping mapping should release every pointer');
    const actions = session.messages.map((message) => message.action);
    assert.ok(actions.includes(ACTION.MOVE), 'WASD and camera input should send MOVE events');
    assert.equal(actions.filter((action) => action === ACTION.DOWN).length, 6,
      'camera, joystick, mouse fire/scope, and keyboard fire/scope should each press once');
    assert.equal(actions.at(-1), ACTION.UP, 'mapping stop should finish with pointer releases');
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
