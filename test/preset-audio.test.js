import assert from "node:assert/strict";
import test from "node:test";
import { Logger } from "../src/log.js";
import { MockSession } from "../src/mock-session.js";
import { PointerManager } from "../src/pointers.js";
import { MappingEngine } from "../src/mapping-engine.js";
import { startUiServer } from "../src/ui-server.js";
import { buildPreset, validatePreset, normalizePreset } from "../src/preset.js";

const SCREEN = { width: 1080, height: 2340 };
const silent = new Logger({ level: "error", file: null });

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
    device: { serial: "mock", model: "MOCK-DEVICE", manufacturer: "mock", androidRelease: "0", sdk: 0, width: SCREEN.width, height: SCREEN.height, density: 420, rotation: 0, screenState: "Awake" },
    mock: true,
  });
  const base = `http://127.0.0.1:${ui.port}`;
  return { session, pointers, ui, base };
}

test("preset export produces valid JSON with all fields", () => {
  const layout = {
    taps: [{ key: "j", x: 0.1, y: 0.2, action: "tap" }],
    targets: [{ key: "j", x: 0.1, y: 0.2, action: "tap", kmType: "tap", actionLabel: "Tap", tapIndex: 0 }],
    cameraToggleKey: null,
    mouseSensitivity: 1.2,
  };
  const msiProfile = { scheme: "Test Scheme", taps: layout.taps, targets: layout.targets, fields: { a: 1 }, bindings: {}, cameraToggleKey: null, controls: layout.targets, controlsVersion: 1 };
  const keyBindings = { WASD: { w: "w", a: "a", s: "s", d: "d" }, Fire: "left click", Scope: "right click" };
  const preset = buildPreset({ layout, msiProfile, keyBindings, name: "Test Scheme", exportedAt: "2026-11-16T00:00:00.000Z" });
  assert.equal(preset.format, "heaven-preset");
  assert.equal(preset.version, 1);
  assert.equal(preset.name, "Test Scheme");
  assert.equal(preset.exportedAt, "2026-11-16T00:00:00.000Z");
  assert.ok(preset["heaven-msi-profile"]);
  assert.ok(preset["heaven-key-bindings"]);
  assert.ok(preset["heaven-layout"]);
  assert.ok(Array.isArray(preset["heaven-msi-profile"].controls));
  assert.ok(Array.isArray(preset["heaven-msi-profile"].taps));
  assert.ok(Array.isArray(preset["heaven-msi-profile"].targets));
  assert.ok(preset["heaven-msi-profile"].fields && typeof preset["heaven-msi-profile"].fields === "object");
  assert.ok(preset["heaven-msi-profile"].bindings && typeof preset["heaven-msi-profile"].bindings === "object");
  assert.ok("cameraToggleKey" in preset["heaven-msi-profile"]);
  assert.deepEqual(preset["heaven-key-bindings"], keyBindings);
  assert.equal(preset["heaven-layout"].mouseSensitivity, 1.2);
  assert.equal(validatePreset(preset).ok, true);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(preset)));
});

test("preset import rejects a bad file without changing the layout", () => {
  const bads = [
    null,
    {},
    { format: "nope", version: 1, "heaven-msi-profile": { controls: [] } },
    { format: "heaven-preset", version: 2, "heaven-msi-profile": { controls: [] } },
    { format: "heaven-preset", version: 1, "heaven-msi-profile": { controls: "x" } },
    { format: "heaven-preset", version: 1, "heaven-msi-profile": { controls: [], taps: "x" } },
    { format: "heaven-preset", version: 1, "heaven-msi-profile": { controls: [] }, "heaven-key-bindings": "x" },
  ];
  for (const bad of bads) {
    assert.equal(validatePreset(bad).ok, false);
    assert.equal(normalizePreset(bad).ok, false);
  }
  let layout = { taps: [{ key: "k", x: 0.5, y: 0.5, action: "tap" }] };
  const before = JSON.stringify(layout);
  const attempt = normalizePreset({ format: "bad" });
  if (attempt.ok) layout = attempt.layout;
  assert.equal(JSON.stringify(layout), before);
});

test("preset import applies a good file and fills aim defaults for older presets", () => {
  const good = {
    format: "heaven-preset",
    version: 1,
    name: "Old Preset",
    exportedAt: "2026-01-01T00:00:00.000Z",
    "heaven-msi-profile": {
      scheme: "Old Preset",
      controls: [
        { action: "aim", kmType: "aim", key: "km:aim:1", x: 0.8, y: 0.6, x2: 0.7, y2: 0.7 },
        { action: "tap", key: "j", x: 0.2, y: 0.3 }
      ],
      taps: [{ key: "j", x: 0.2, y: 0.3, action: "tap" }],
      targets: [],
      fields: {},
      bindings: {},
      cameraToggleKey: "alt",
      controlsVersion: 1
    },
    "heaven-key-bindings": { WASD: { w: "w", a: "a", s: "s", d: "d" }, Fire: "left click", Scope: "right click" }
  };
  assert.equal(validatePreset(good).ok, true);
  const n = normalizePreset(good);
  assert.equal(n.ok, true);
  assert.equal(n.name, "Old Preset");
  const aim = (n.profile.controls || []).find(c => c && c.action === "aim");
  assert.ok(aim);
  assert.equal(aim.startStopKey, "alt");
  assert.equal(aim.suspendKey, "x");
  assert.equal(aim.sensitivityX, 1.42);
  assert.equal(aim.sensitivityY, 1.46);
  assert.equal(aim.tweaks, 16450);
  assert.equal(aim.mouseAcceleration, false);
  assert.equal(aim.crosshairEnabled, true);
  assert.equal(aim.crosshairStyle, "Cross");
  assert.equal(aim.crosshairSize, 2);
  assert.equal(aim.crosshairOpacity, 100);
  assert.equal(aim.crosshairColor, "#AA0000");
  assert.equal(aim.fireWithLeftClick, true);
  assert.ok(Array.isArray(n.layout.targets));
});

test("audio route returns 503 when there is no audio stream (mock mode)", async () => {
  const { ui, base } = await harness();
  try {
    const res = await fetch(`${base}/api/audio?t=${ui.token}`);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.code, "AUDIO_UNAVAILABLE");
    assert.match(body.message || "", /mock/i);

    const noToken = await fetch(`${base}/api/audio`);
    assert.equal(noToken.status, 400);
  } finally {
    await ui.close();
  }
});
