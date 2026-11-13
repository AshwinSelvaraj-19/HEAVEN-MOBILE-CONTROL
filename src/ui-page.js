/**
 * The loopback controller.
 *
 * Served from 127.0.0.1 only, with a per-run token required on every API call.
 * The page has no build step and no external assets: it is one HTML document
 * with inline CSS/JS so `node src/main.js` is genuinely the only command needed.
 *
 * Coordinate model: the canvas keeps the device aspect ratio; the page converts
 * client pixels to device pixels before calling the API. Nothing here talks to
 * the phone directly.
 */

/**
 * @param {{token: string, width: number, height: number, model: string, mock: boolean, screenAvailable?: boolean, videoAvailable?: boolean, mouseSensitivity?: number}} options
 * @returns {string}
 */
export function renderPage(options) {
  const { token, width, height, model, mock, screenAvailable = false, videoAvailable = false, mouseSensitivity = 1 } = options;
  const title = `HEAVEN Mobile Control — ${model || 'device'}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #090d14;
    --panel: #111824;
    --panel-2: #182333;
    --line: #26364a;
    --text: #edf3fb;
    --muted: #91a2b8;
    --accent: #62b2ff;
    --accent-2: #70dfa3;
    --danger: #ff7676;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 "Segoe UI", system-ui, sans-serif; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
  header { height: 66px; flex: none; display: flex; align-items: center; gap: 12px; padding: 10px 22px; border-bottom: 1px solid var(--line); background: #101722; box-shadow: 0 6px 24px #0003; z-index: 4; }
  .brand-mark { width: 32px; height: 32px; display: grid; place-items: center; border: 1px solid #3476b6; border-radius: 10px; color: #a8d8ff; background: #122b43; font-size: 16px; font-weight: 800; }
  .brand-copy { min-width: 205px; }
  header h1 { font-size: 13px; margin: 0; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
  .brand-copy small { display: block; color: var(--muted); font-size: 11px; }
  .pill { white-space: nowrap; padding: 4px 10px; border-radius: 999px; font-size: 11px; border: 1px solid var(--line); color: var(--muted); background: #0c121b; }
  .pill.ok { border-color: #1f6f3f; color: var(--accent-2); background: #0e2a19; }
  .pill.bad { border-color: #6f1f1f; color: var(--danger); background: #2a0e0e; }
  .spacer { flex: 1; }
  main { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) 410px; gap: 0; min-height: 0; }
  .preview-column { min-width: 0; display: flex; flex-direction: column; min-height: 0; }
  .preview-head { min-height: 54px; flex: none; display: flex; align-items: center; gap: 12px; padding: 7px 22px; border-bottom: 1px solid #1e2a3a; background: #0d131d; }
  .preview-head strong { display: block; font-size: 13px; }
  .preview-head small { color: var(--muted); font-size: 11px; }
  .landscape-pill { margin-left: 0; color: #a8d8ff; border: 1px solid #29445f; border-radius: 20px; padding: 4px 10px; font-size: 11px; white-space: nowrap; }
  .layout-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
  .layout-actions button { padding: 7px 10px; font-size: 11px; }
  .layout-actions button.active { border-color: #c39b31; background: #3a2e14; color: #ffe69a; }
  #layout-status { font-size: 11px; color: #f4d783; min-width: 90px; }
  .stage-wrap { flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px; min-height: 0; background: radial-gradient(ellipse at 50% 42%, #162337 0%, #0b1019 62%, #090d14 100%); }
  #stage {
    position: relative; flex: none; aspect-ratio: ${width} / ${height};
    background: #05070a; border: 1px solid #304257; border-radius: 12px;
    overflow: hidden; cursor: crosshair; touch-action: none;
    box-shadow: 0 24px 70px rgba(0,0,0,.58), 0 0 0 1px #ffffff08;
  }
  #stage .grid { position: absolute; inset: 0;
    background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px);
    background-size: 10% 10%; opacity: .25; pointer-events: none; }
  #phone-screen { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: none; pointer-events: none; z-index: 1; }
  #phone-video { position: absolute; inset: 0; width: 100%; height: 100%; display: none; pointer-events: none; z-index: 1; }
  #screen-message { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 22px; text-align: center; color: var(--muted); font-size: 13px; z-index: 1; pointer-events: none; }
  .marker { position: absolute; transform: translate(-50%, -50%); pointer-events: none; transition: none; z-index: 2; }
  .marker .dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid currentColor; opacity: .9; }
  .marker .ring { position: absolute; inset: -12px; border-radius: 50%; border: 1px dashed currentColor; opacity: .45; }
  .marker .label { position: absolute; left: 16px; top: -10px; font-size: 10px; letter-spacing: .08em; color: currentColor; white-space: nowrap; }
  .marker[data-name="A"] { color: var(--accent); }
  .marker[data-name="B"] { color: var(--accent-2); }
  .hud-target { position: absolute; z-index: 3; transform: translate(-50%, -50%); pointer-events: none; color: #ffe082; font-size: 10px; font-weight: 700; text-shadow: 0 1px 4px #000, 1px 0 #000, -1px 0 #000; }
  #stage.layout-editing .hud-target { pointer-events: auto; cursor: grab; touch-action: none; padding: 4px; border: 1px solid transparent; border-radius: 8px; }
  #stage.layout-editing .hud-target:active { cursor: grabbing; }
  #stage.layout-editing .hud-target.selected { border-color: #fff2a8; background: #17202dcc; box-shadow: 0 0 0 2px #1118, 0 0 18px #ffd34d88; }
  .hud-target i { display: block; width: 18px; height: 18px; border: 1px solid #ffe082; border-radius: 50%; background: #ffce3a33; }
  .hud-target b { display: block; white-space: nowrap; text-align: center; }
  aside { border-left: 1px solid var(--line); background: #101722; display: flex; flex-direction: column; min-height: 0; overflow-y: auto; padding: 18px; gap: 12px; }
  .group { padding: 15px; border: 1px solid var(--line); border-radius: 12px; background: linear-gradient(145deg, #151f2d, #111824 65%); box-shadow: 0 8px 22px #0002; }
  .group h2 { display: flex; align-items: center; gap: 9px; font-size: 13px; color: var(--text); margin: 0 0 12px; letter-spacing: .01em; }
  .step-number { width: 23px; height: 23px; display: inline-grid; place-items: center; border-radius: 8px; color: #c8e6ff; background: #173550; font-size: 11px; }
  .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  button { font: inherit; font-size: 12px; font-weight: 600; padding: 9px 12px; border-radius: 8px; cursor: pointer; background: var(--panel-2); color: var(--text); border: 1px solid #31445b; transition: background .15s, border-color .15s, transform .15s; }
  button:hover:not(:disabled) { border-color: #5485b8; background: #203148; transform: translateY(-1px); }
  button:disabled { opacity: .45; cursor: not-allowed; transform: none; }
  button.primary { border-color: #327ab8; background: linear-gradient(135deg, #1e6bab, #174c7d); color: #f1f8ff; }
  button.danger { border-color: #7a3030; background: #321719; color: #ffc9c9; font-weight: 700; }
  button.wide { width: 100%; }
  label.field { display: flex; align-items: center; justify-content: space-between; gap: 9px; font-size: 12px; color: #b5c4d6; }
  input[type="number"], .binding-input { min-width: 0; background: #0b121c; color: var(--text); border: 1px solid #2d4055; border-radius: 7px; padding: 8px 9px; font: inherit; outline: none; }
  input[type="number"]:focus, .binding-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px #4da3ff22; }
  #mapping-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  #mapping-fields label.field { align-items: flex-start; flex-direction: column; gap: 5px; }
  #mapping-fields input { width: 100%; }
  #key-bindings { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  #key-bindings label.field { padding: 6px 8px; border: 1px solid #233247; border-radius: 8px; background: #0e1520; }
  #key-bindings input { width: 76px; text-align: center; cursor: pointer; padding: 6px; }
  #imported-bindings { display: grid; gap: 5px; max-height: 250px; overflow: auto; padding-right: 3px; }
  .imported-binding-row { display: grid; grid-template-columns: minmax(0,1fr) 80px; align-items: center; gap: 8px; padding: 5px 7px; border-radius: 7px; background: #0d1520; color: #b8c7d9; font-size: 11px; }
  .imported-binding-row input { width: 100%; text-align: center; cursor: pointer; padding: 5px; }
  .add-control-form { display: grid; grid-template-columns: minmax(0,1fr) 74px auto; gap: 6px; margin: 10px 0; }
  .add-control-form input { min-width: 0; width: 100%; padding: 7px 8px; background: #0b121c; color: var(--text); border: 1px solid #2d4055; border-radius: 7px; font: inherit; }
  .add-control-form button { padding: 7px 9px; }
  .file-choose { position: relative; display: flex; justify-content: center; align-items: center; width: 100%; min-height: 66px; border: 1px dashed #3f6890; border-radius: 10px; background: #122338; color: #cce7ff; font-weight: 650; cursor: pointer; overflow: hidden; }
  .file-choose:hover { background: #172c43; border-color: var(--accent); }
  .file-choose input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
  .file-choose span { pointer-events: none; text-align: center; padding: 8px; }
  .helper-card { padding: 9px 10px; border-radius: 8px; color: #adbed3; background: #0c1420; border: 1px solid #202e40; font-size: 11px; }
  .target-toggle { justify-content: flex-start !important; margin-top: 9px; }
  .target-toggle input { accent-color: var(--accent); }
  details.advanced { border-top: 1px solid #28384c; margin-top: 12px; padding-top: 11px; }
  details.advanced > summary { color: #b8c8da; font-size: 12px; font-weight: 650; cursor: pointer; user-select: none; }
  details.advanced[open] > summary { margin-bottom: 12px; }
  .kv { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); padding: 3px 0; }
  .kv b { color: var(--text); font-weight: 650; }
  #log { max-height: 180px; overflow: auto; padding: 8px 0 0; font: 11px/1.5 ui-monospace, Consolas, monospace; color: var(--muted); min-height: 0; }
  #log div { white-space: pre-wrap; word-break: break-word; }
  #log .warn { color: #ffcf70; }
  #log .error { color: var(--danger); }
  #log .info { color: #9fb4d0; }
  footer { padding: 8px 2px 0; font-size: 10px; color: var(--muted); display: flex; gap: 8px; }
  .hint { font-size: 11px; color: var(--muted); margin: 9px 0 0; }
  .banner { background: #2a1f0b; border-bottom: 1px solid #5c4312; color: #ffd479; padding: 6px 16px; font-size: 12px; display: ${mock ? 'block' : 'none'}; }
  .mapping-action { position: sticky; bottom: -18px; z-index: 2; margin: -1px -1px 0; padding: 12px; border: 1px solid #2a4560; border-radius: 12px; background: #111d2bfa; box-shadow: 0 -8px 24px #0004; }
  .mapping-action .hint { text-align: center; margin: 7px 0 0; }
  .mapping-action button { min-height: 44px; font-size: 13px; }
  @media (max-width: 1000px) { main { grid-template-columns: minmax(0,1fr) 360px; } header { padding-inline: 14px; gap: 8px; } .brand-copy { min-width: 175px; } }
  @media (max-width: 780px) { body { height: auto; min-height: 100vh; overflow: auto; } header { min-height: 62px; height: auto; flex-wrap: wrap; } main { display: flex; flex-direction: column; } .preview-column { min-height: 55vh; } .preview-head { padding-inline: 14px; } .stage-wrap { min-height: 48vh; padding: 12px; } aside { border-left: 0; border-top: 1px solid var(--line); overflow: visible; padding: 12px; } .brand-copy { min-width: 0; } }
</style>
</head>
<body>
<header>
  <div class="brand-mark">H</div>
  <div class="brand-copy"><h1>Heaven Mobile Control</h1><small>Phone gaming controller</small></div>
  <span class="pill" id="session-pill">connecting…</span>
  <span class="pill" id="device-pill">${escapeHtml(model || 'unknown')} · ${width}&times;${height}</span>
  <span class="pill" id="video-status">${videoAvailable ? 'Video starting · 90 fps target' : 'Screenshot preview'}</span>
  <span class="spacer"></span>
  <button class="danger" id="panic">Release all · Esc</button>
</header>
<div class="banner" id="mock-banner">MOCK TRANSPORT — no device attached; messages are counted, not injected.</div>
<main>
  <section class="preview-column" aria-label="Live phone preview">
    <div class="preview-head"><div><strong>Live phone</strong><small>Drag imported controls to match your HUD</small></div><span class="landscape-pill">USB preview</span><div class="layout-actions"><span id="layout-status"></span><button id="layout-edit-toggle" type="button">Edit layout</button><button id="layout-delete" type="button" disabled>Delete</button></div></div>
    <div class="stage-wrap">
      <div id="stage" aria-label="Phone screen preview and touch test surface">
        <div class="grid"></div>
        <canvas id="phone-video" aria-label="Live Android phone video"></canvas>
        <img id="phone-screen" alt="Live Android phone screen">
        <div id="screen-message">${escapeHtml(mock ? 'Mock mode is active. Connect your phone and run npm run live to see its screen.' : screenAvailable ? 'Waiting for the phone screen…' : 'Phone screen preview is unavailable.')}</div>
      </div>
    </div>
  </section>
  <aside aria-label="Controller setup">
    <section class="group">
      <h2><span class="step-number">1</span> Load your MSI controls</h2>
      <label class="file-choose"><input id="cfg-file" type="file" accept=".cfg,.json,application/json"><span>Choose controls.cfg<br><small>Selected MSI layout imports automatically</small></span></label>
      <p class="hint" id="cfg-status">Choose controls.cfg to import its selected scheme and show touch targets.</p>
      <label class="field target-toggle"><input id="show-targets" type="checkbox" checked> Show HUD touch markers</label>
      <p class="helper-card">Keep the game HUD open in landscape on your phone. Confirm the yellow markers sit over the correct buttons.</p>
    </section>
    <section class="group">
      <h2><span class="step-number">2</span> Set your controls</h2>
      <div id="key-bindings">
        <label class="field">Forward <input class="binding-input" data-binding="forwardKey" value="W" readonly aria-label="Forward key"></label>
        <label class="field">Left <input class="binding-input" data-binding="leftKey" value="A" readonly aria-label="Left key"></label>
        <label class="field">Back <input class="binding-input" data-binding="backwardKey" value="S" readonly aria-label="Back key"></label>
        <label class="field">Right <input class="binding-input" data-binding="rightKey" value="D" readonly aria-label="Right key"></label>
        <label class="field">Fire <input class="binding-input" data-binding="fireKey" value="Space" placeholder="Mouse Left" readonly aria-label="Fire key"></label>
        <label class="field">Scope <input class="binding-input" data-binding="scopeKey" value="Shift" placeholder="Mouse Right" readonly aria-label="Scope key"></label>
      </div>
      <p class="hint">Click a key box, then press a new key. Mouse movement aims; left and right click fire and scope.</p>
      <details class="advanced" id="imported-actions-details">
        <summary id="imported-actions-summary">Imported game actions</summary>
        <div class="add-control-form"><input id="new-action-name" type="text" maxlength="48" placeholder="New action name"><input id="new-action-key" type="text" maxlength="12" placeholder="Key"><button id="place-new-control" type="button">Place</button></div>
        <p class="hint" id="edit-help">Choose an action and key, press Place, then click its location on the phone preview. In Edit layout, drag a marker to reposition it.</p>
        <div id="imported-bindings"></div>
        <p class="hint">If a key appears more than once, pressing it touches all those targets together.</p>
      </details>
      <details class="advanced">
        <summary>Fine-tune touch positions and sensitivity</summary>
      <div id="mapping-fields">
        <label class="field">Joystick X <input type="number" id="map-jx" value="0.20" min="0" max="1" step="0.01"></label>
        <label class="field">Joystick Y <input type="number" id="map-jy" value="0.80" min="0" max="1" step="0.01"></label>
        <label class="field">Joystick radius <input type="number" id="map-radius" value="0.10" min="0" max="1" step="0.01"></label>
        <label class="field">Aim sensitivity <input type="number" id="map-sensitivity" value="${Number.isFinite(mouseSensitivity) ? mouseSensitivity : 1}" min="0" max="10" step="0.1"></label>
        <label class="field">Aim anchor X <input type="number" id="map-cx" value="0.50" min="0" max="1" step="0.01"></label>
        <label class="field">Aim anchor Y <input type="number" id="map-cy" value="0.50" min="0" max="1" step="0.01"></label>
        <label class="field">Fire X <input type="number" id="map-fx" value="0.85" min="0" max="1" step="0.01"></label>
        <label class="field">Fire Y <input type="number" id="map-fy" value="0.80" min="0" max="1" step="0.01"></label>
        <label class="field">Scope X <input type="number" id="map-sx" value="0.85" min="0" max="1" step="0.01"></label>
        <label class="field">Scope Y <input type="number" id="map-sy" value="0.65" min="0" max="1" step="0.01"></label>
      </div>
      </details>
    </section>
    <section class="mapping-action">
      <button id="mapping-start" class="primary wide">Start mapping</button>
      <p class="hint" id="mapping-hint">Captures keyboard and mouse while active. Click Start mapping, then keep this browser page focused. Press Esc to release touches.</p>
    </section>
    <details class="group advanced">
      <summary>Advanced pointer test</summary>
      <p class="hint">Manual two-pointer checks for diagnosing touch input.</p>
      <div class="row" style="margin-top:10px">
        <button id="hold-a" class="primary">Hold pointer A</button>
        <button id="up-a">Release A</button>
        <button id="hold-b" class="primary">Hold pointer B</button>
        <button id="up-b">Release B</button>
      </div>
      <div class="row" style="margin-top:8px">
        <label class="field">Sweep time <input type="number" id="sweep-ms" value="2000" min="200" max="15000" step="100"> ms</label>
        <button id="sweep-b">Sweep B</button>
        <button id="proof" class="primary">Run touch proof</button>
      </div>
    </details>
    <details class="group advanced">
      <summary>Diagnostics</summary>
      <div class="kv"><span>active pointers</span><b id="k-count">0</b></div>
      <div class="kv"><span>messages sent</span><b id="k-messages">0</b></div>
      <div class="kv"><span>panics</span><b id="k-panics">0</b></div>
      <div class="kv"><span>achieved Hz</span><b id="k-hz">—</b></div>
      <div class="kv"><span>last proof</span><b id="k-proof">—</b></div>
      <div id="log"></div>
    </details>
    <footer>
      <span id="f-note">Controls run only while mapping is active.</span><span class="spacer"></span><span id="f-token">${escapeHtml(token.slice(0, 6))}…</span>
    </footer>
  </aside>
</main>
<script>
(function () {
  var TOKEN = ${JSON.stringify(token)};
  var W = ${width};
  var H = ${height};
  var stage = document.getElementById('stage');
  var stageWrap = document.querySelector('.stage-wrap');
  var dragging = false;
  var pendingMove = null;
  var moveInFlight = false;
  var mappingActive = false;
  var mappingQueue = Promise.resolve();
  var screenImage = document.getElementById('phone-screen');
  var videoCanvas = document.getElementById('phone-video');
  var videoContext = videoCanvas.getContext('2d', { alpha: false, desynchronized: true });
  var screenMessage = document.getElementById('screen-message');
  var currentScreenUrl = null;
  var renderedFrames = 0;
  var fpsWindowStart = performance.now();
  var decodedWidth = W;
  var decodedHeight = H;
  var importedTapBindings = [];
  var importedHudTargets = [];
  var profileCameraToggleKey = null;
  var layoutEditMode = false;
  var placingNewControl = false;
  var movingHudTarget = null;
  var selectedHudTarget = -1;

  function fitStage() {
    var bounds = stageWrap.getBoundingClientRect();
    var availableWidth = Math.max(1, bounds.width - 32);
    var availableHeight = Math.max(1, bounds.height - 32);
    var ratio = W / H;
    var width = Math.min(availableWidth, availableHeight * ratio);
    var height = width / ratio;
    stage.style.width = Math.round(width) + 'px';
    stage.style.height = Math.round(height) + 'px';
  }

  function setDisplaySize(width, height) {
    if (!(width > 0 && height > 0) || (W === width && H === height)) return;
    W = width;
    H = height;
    videoCanvas.width = width;
    videoCanvas.height = height;
    fitStage();
    document.getElementById('device-pill').textContent = '${escapeHtml(model || 'unknown')} · ' + W + '×' + H;
    updateProfileOrientation();
  }

  function updateProfileOrientation() {
    var start = document.getElementById('mapping-start');
    var landscapeRequired = importedTapBindings.length > 0 && W <= H;
    start.disabled = landscapeRequired;
    if (landscapeRequired) document.getElementById('cfg-status').textContent = 'MSI profile is landscape. Rotate the game to landscape; mapping will unlock when the phone reports landscape.';
  }

  function queuedApi(body) {
    var request = mappingQueue.then(function () { return api('/api/input', body); });
    mappingQueue = request.catch(function () {});
    return request;
  }

  function api(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-heaven-token': TOKEN },
      body: JSON.stringify(body || {})
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) { throw new Error(data.message || ('HTTP ' + res.status)); }
        return data;
      });
    });
  }

  function toDevice(evt) {
    var rect = stage.getBoundingClientRect();
    var x = Math.round(((evt.clientX - rect.left) / rect.width) * W);
    var y = Math.round(((evt.clientY - rect.top) / rect.height) * H);
    return { x: Math.max(0, Math.min(W - 1, x)), y: Math.max(0, Math.min(H - 1, y)) };
  }

  function allowedProfileKey(key) {
    return /^[a-z0-9]$/.test(key)
      || ['space', 'shift', 'control', 'alt', 'tab', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(key) !== -1;
  }

  function refreshLayoutSelection() {
    stage.querySelectorAll('.hud-target').forEach(function (node) {
      node.classList.toggle('selected', Number(node.dataset.targetIndex) === selectedHudTarget);
    });
    var target = importedHudTargets[selectedHudTarget];
    document.getElementById('layout-delete').disabled = !layoutEditMode || !target || !Number.isInteger(target.tapIndex);
  }

  function updateHudTargetPosition(target, x, y) {
    target.x = x;
    target.y = y;
    if (Number.isInteger(target.tapIndex) && importedTapBindings[target.tapIndex]) {
      importedTapBindings[target.tapIndex].x = x;
      importedTapBindings[target.tapIndex].y = y;
    }
    if (target.fieldX) document.getElementById(target.fieldX).value = x.toFixed(4);
    if (target.fieldY) document.getElementById(target.fieldY).value = y.toFixed(4);
    var node = stage.querySelector('.hud-target[data-target-index="' + selectedHudTarget + '"]');
    if (node) { node.style.left = (x * 100) + '%'; node.style.top = (y * 100) + '%'; }
  }

  stage.addEventListener('pointerdown', function (evt) {
    if (placingNewControl) {
      evt.preventDefault();
      evt.stopImmediatePropagation();
      var name = document.getElementById('new-action-name').value.trim();
      var key = normalizeEventKey(document.getElementById('new-action-key').value);
      if (!name || !allowedProfileKey(key)) {
        document.getElementById('layout-status').textContent = 'Enter an action and a valid key first.';
        placingNewControl = false;
        return;
      }
      var position = toDevice(evt);
      var tapIndex = importedTapBindings.length;
      var action = { key: key, x: position.x / W, y: position.y / H, action: name };
      importedTapBindings.push(action);
      importedHudTargets.push({ key: key, label: key, action: name, x: action.x, y: action.y, tapIndex: tapIndex });
      selectedHudTarget = importedHudTargets.length - 1;
      placingNewControl = false;
      document.getElementById('new-action-name').value = '';
      document.getElementById('new-action-key').value = '';
      document.getElementById('layout-status').textContent = 'Button added. Drag to adjust.';
      renderHudTargets();
      renderImportedBindings();
      saveImportedBindings();
      refreshLayoutSelection();
      return;
    }
    var targetNode = evt.target.closest && evt.target.closest('.hud-target');
    if (!layoutEditMode) return;
    evt.preventDefault();
    evt.stopImmediatePropagation();
    if (!targetNode) {
      document.getElementById('layout-status').textContent = 'Select a marker, or use Place to add one.';
      return;
    }
    selectedHudTarget = Number(targetNode.dataset.targetIndex);
    movingHudTarget = { pointerId: evt.pointerId, index: selectedHudTarget };
    stage.setPointerCapture(evt.pointerId);
    refreshLayoutSelection();
  });

  stage.addEventListener('pointermove', function (evt) {
    if (!movingHudTarget || movingHudTarget.pointerId !== evt.pointerId) return;
    evt.preventDefault();
    evt.stopImmediatePropagation();
    var point = toDevice(evt);
    var target = importedHudTargets[movingHudTarget.index];
    if (target) updateHudTargetPosition(target, point.x / W, point.y / H);
  });

  function finishHudDrag(evt) {
    if (!movingHudTarget || (evt && evt.pointerId !== movingHudTarget.pointerId)) return;
    if (evt) { evt.preventDefault(); evt.stopImmediatePropagation(); }
    movingHudTarget = null;
    saveImportedBindings();
    renderHudTargets();
    refreshLayoutSelection();
  }
  stage.addEventListener('pointerup', finishHudDrag);
  stage.addEventListener('pointercancel', finishHudDrag);

  stage.addEventListener('pointerdown', function (evt) {
    evt.preventDefault();
    if (mappingActive) { return; }
    var point = toDevice(evt);
    dragging = true;
    stage.setPointerCapture(evt.pointerId);
    api('/api/input', { op: 'down', name: 'A', x: point.x, y: point.y }).catch(report);
  });

  stage.addEventListener('pointermove', function (evt) {
    if (!dragging) { return; }
    pendingMove = toDevice(evt);
    flushMove();
  });

  function flushMove() {
    if (moveInFlight || !pendingMove) { return; }
    var point = pendingMove;
    pendingMove = null;
    moveInFlight = true;
    api('/api/input', { op: 'move', name: 'A', x: point.x, y: point.y })
      .catch(report)
      .then(function () { moveInFlight = false; flushMove(); });
  }

  function stopDrag(evt) {
    if (!dragging) { return; }
    dragging = false;
    if (evt && evt.clientX !== undefined) { pendingMove = toDevice(evt); }
    var point = pendingMove || { x: 0, y: 0 };
    pendingMove = null;
    api('/api/input', { op: 'up', name: 'A', x: point.x, y: point.y }).catch(report);
  }

  stage.addEventListener('pointerup', stopDrag);
  stage.addEventListener('pointercancel', stopDrag);
  window.addEventListener('blur', function () {
    if (dragging) { stopDrag(); }
    if (mappingActive) { stopMapping(); }
  });

  document.getElementById('hold-a').onclick = function () { api('/api/input', { op: 'hold', name: 'A' }).catch(report); };
  document.getElementById('up-a').onclick = function () { api('/api/input', { op: 'up', name: 'A' }).catch(report); };
  document.getElementById('hold-b').onclick = function () { api('/api/input', { op: 'hold', name: 'B' }).catch(report); };
  document.getElementById('up-b').onclick = function () { api('/api/input', { op: 'up', name: 'B' }).catch(report); };
  document.getElementById('sweep-b').onclick = function () {
    var ms = Number(document.getElementById('sweep-ms').value) || 2000;
    api('/api/input', { op: 'sweep', name: 'B', durationMs: ms }).catch(report);
  };
  document.getElementById('proof').onclick = function () {
    var ms = Number(document.getElementById('sweep-ms').value) || 2000;
    api('/api/input', { op: 'proof', durationMs: ms }).catch(report);
  };
  document.getElementById('panic').onclick = panic;

  function mapSettings() {
    function value(id) { return Number(document.getElementById(id).value); }
    var settings = {
      joystickX: value('map-jx'), joystickY: value('map-jy'), joystickRadius: value('map-radius'),
      sensitivity: value('map-sensitivity'), cameraX: value('map-cx'), cameraY: value('map-cy'),
      shootX: value('map-fx'), shootY: value('map-fy'), scopeX: value('map-sx'), scopeY: value('map-sy')
    };
    settings.tapBindings = importedTapBindings;
    settings.cameraToggleKey = profileCameraToggleKey;
    document.querySelectorAll('.binding-input').forEach(function (input) {
      settings[input.dataset.binding] = normalizeEventKey(input.value);
    });
    return settings;
  }

  function normalizeEventKey(key) {
    if (key === ' ') { return 'space'; }
    if (key.length === 1) { return key.toLowerCase(); }
    return key.toLowerCase();
  }

  function displayKey(key) {
    if (key === 'space') { return 'Space'; }
    if (key.indexOf('arrow') === 0) { return 'Arrow ' + key.slice(5); }
    return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
  }

  function saveImportedBindings() {
    try {
      var existingProfile = localStorage.getItem('heaven-msi-profile');
      if (!existingProfile) return;
      var saved = JSON.parse(existingProfile);
      saved.taps = importedTapBindings;
      saved.targets = importedHudTargets;
      saved.fields = {};
      ['map-jx','map-jy','map-radius','map-sensitivity','map-cx','map-cy','map-fx','map-fy','map-sx','map-sy'].forEach(function (id) { saved.fields[id] = document.getElementById(id).value; });
      saved.bindings = {};
      document.querySelectorAll('.binding-input:not(.tap-binding-input)').forEach(function (input) { saved.bindings[input.dataset.binding] = input.value; });
      saved.cameraToggleKey = profileCameraToggleKey;
      localStorage.setItem('heaven-msi-profile', JSON.stringify(saved));
    } catch (e) {}
  }

  function renderImportedBindings() {
    var list = document.getElementById('imported-bindings');
    list.textContent = '';
    document.getElementById('imported-actions-summary').textContent = 'Imported game actions (' + importedTapBindings.length + ')';
    document.getElementById('imported-actions-details').hidden = importedHudTargets.length === 0;
    importedTapBindings.forEach(function (target, index) {
      var row = document.createElement('label');
      row.className = 'imported-binding-row';
      var description = document.createElement('span');
      description.textContent = target.action || target.key;
      var input = document.createElement('input');
      input.className = 'binding-input tap-binding-input';
      input.dataset.index = String(index);
      input.value = displayKey(target.key);
      input.readOnly = true;
      input.setAttribute('aria-label', 'Key for ' + (target.action || target.key));
      input.addEventListener('click', function () {
        if (!mappingActive) { input.value = 'Press key'; input.focus(); }
      });
      row.append(description, input);
      list.appendChild(row);
    });
  }

  try {
    var savedBindings = JSON.parse(localStorage.getItem('heaven-key-bindings') || '{}');
    document.querySelectorAll('.binding-input').forEach(function (input) {
      if (savedBindings[input.dataset.binding]) { input.value = displayKey(savedBindings[input.dataset.binding]); }
    });
  } catch (e) {}

  document.querySelectorAll('.binding-input').forEach(function (input) {
    input.addEventListener('click', function () {
      if (!mappingActive) { input.value = 'Press key'; input.focus(); }
    });
  });
  document.querySelectorAll('#mapping-fields input').forEach(function (input) {
    input.addEventListener('change', saveImportedBindings);
  });

  function renderHudTargets() {
    stage.querySelectorAll('.hud-target').forEach(function (node) { node.remove(); });
    stage.classList.toggle('layout-editing', layoutEditMode);
    if (!document.getElementById('show-targets').checked) return;
    importedHudTargets.forEach(function (target, index) {
      var node = document.createElement('div');
      node.className = 'hud-target';
      node.dataset.targetIndex = String(index);
      node.style.left = (target.x * 100) + '%';
      node.style.top = (target.y * 100) + '%';
      var ring = document.createElement('i');
      var label = document.createElement('b');
      label.textContent = String(target.label || target.key).toUpperCase();
      node.append(ring, label);
      node.title = target.action || target.key;
      node.classList.toggle('selected', index === selectedHudTarget);
      stage.appendChild(node);
    });
    refreshLayoutSelection();
  }
  document.getElementById('show-targets').addEventListener('change', renderHudTargets);

  document.getElementById('layout-edit-toggle').addEventListener('click', function () {
    if (!importedHudTargets.length) {
      document.getElementById('layout-status').textContent = 'Load an MSI profile first.';
      return;
    }
    if (mappingActive) {
      document.getElementById('layout-status').textContent = 'Stop mapping before editing.';
      return;
    }
    layoutEditMode = !layoutEditMode;
    placingNewControl = false;
    this.classList.toggle('active', layoutEditMode);
    this.textContent = layoutEditMode ? 'Done editing' : 'Edit layout';
    document.getElementById('layout-status').textContent = layoutEditMode ? 'Drag a marker to move it.' : 'Layout saved.';
    if (layoutEditMode) document.getElementById('imported-actions-details').open = true;
    renderHudTargets();
  });

  document.getElementById('place-new-control').addEventListener('click', function () {
    if (mappingActive) {
      document.getElementById('layout-status').textContent = 'Stop mapping before editing.';
      return;
    }
    if (importedTapBindings.length >= 64) {
      document.getElementById('layout-status').textContent = 'The controller supports up to 64 tap buttons.';
      return;
    }
    var name = document.getElementById('new-action-name').value.trim();
    var key = normalizeEventKey(document.getElementById('new-action-key').value);
    if (!name || !allowedProfileKey(key)) {
      document.getElementById('layout-status').textContent = 'Enter an action name and valid key.';
      return;
    }
    layoutEditMode = true;
    placingNewControl = true;
    document.getElementById('layout-edit-toggle').classList.add('active');
    document.getElementById('layout-edit-toggle').textContent = 'Done editing';
    document.getElementById('layout-status').textContent = 'Click the HUD button location.';
    renderHudTargets();
  });

  document.getElementById('layout-delete').addEventListener('click', function () {
    var target = importedHudTargets[selectedHudTarget];
    if (!target || !Number.isInteger(target.tapIndex)) return;
    var removedIndex = target.tapIndex;
    importedTapBindings.splice(removedIndex, 1);
    importedHudTargets.splice(selectedHudTarget, 1);
    importedHudTargets.forEach(function (item) {
      if (Number.isInteger(item.tapIndex) && item.tapIndex > removedIndex) item.tapIndex--;
    });
    selectedHudTarget = -1;
    document.getElementById('layout-status').textContent = 'Button removed.';
    renderHudTargets();
    renderImportedBindings();
    saveImportedBindings();
  });

  document.getElementById('cfg-file').addEventListener('change', function (event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { report(new Error('Could not read the MSI controls file')); };
    reader.onload = function () {
      try {
        var config = JSON.parse(String(reader.result || ''));
        var schemes = config.ControlSchemes || [];
        var scheme = schemes.find(function (candidate) { return candidate.Selected; }) || schemes[0];
        if (!scheme || !Array.isArray(scheme.GameControls)) throw new Error('No MSI control scheme was found');
        var controls = scheme.GameControls;
        var dpad = controls.find(function (item) { return item.Type === 'Dpad'; });
        var pan = controls.find(function (item) { return item.Type === 'Pan'; });
        var taps = [];
        var skipped = 0;
        controls.forEach(function (item) {
          if (item.Type !== 'Tap' || !item.Key || !Number.isFinite(Number(item.X)) || !Number.isFinite(Number(item.Y))) {
            if (item.Type === 'Script') skipped++;
            return;
          }
          var key = String(item.Key).toLowerCase();
          var keyAliases = { ctrl: 'control', 'mousewheelup': 'wheelup', 'mousewheeldown': 'wheeldown' };
          key = keyAliases[key] || key;
          if (!/^[a-z0-9]$/.test(key) && ['space', 'shift', 'control', 'alt', 'tab', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'wheelup', 'wheeldown'].indexOf(key) === -1) {
            skipped++;
            return;
          }
          taps.push({ key: key, x: Number(item.X) / 100, y: Number(item.Y) / 100, action: (item.Guidance && item.Guidance.Key) || item.GuidanceCategory || key });
        });
        if (dpad) {
          document.getElementById('map-jx').value = (Number(dpad.X) / 100).toFixed(4);
          document.getElementById('map-jy').value = (Number(dpad.Y) / 100).toFixed(4);
          document.getElementById('map-radius').value = (Number(dpad.XRadius) / 100).toFixed(4);
          var movement = { w: 'forwardKey', a: 'leftKey', s: 'backwardKey', d: 'rightKey' };
          [['KeyUp', 'w'], ['KeyLeft', 'a'], ['KeyDown', 's'], ['KeyRight', 'd']].forEach(function (pair) {
            var field = document.querySelector('[data-binding="' + movement[pair[1]] + '"]');
            if (field && dpad[pair[0]]) field.value = String(dpad[pair[0]]).toUpperCase();
          });
        }
        if (pan) {
          document.getElementById('map-cx').value = (Number(pan.X) / 100).toFixed(4);
          document.getElementById('map-cy').value = (Number(pan.Y) / 100).toFixed(4);
          document.getElementById('map-sensitivity').value = Number(pan.Sensitivity).toFixed(2);
          if (Number.isFinite(Number(pan.LButtonX))) document.getElementById('map-fx').value = (Number(pan.LButtonX) / 100).toFixed(4);
          if (Number.isFinite(Number(pan.LButtonY))) document.getElementById('map-fy').value = (Number(pan.LButtonY) / 100).toFixed(4);
          profileCameraToggleKey = String(pan.KeyStartStop || '').toLowerCase() || null;
        }
        var scope = taps.find(function (item) { return item.key === 'wheelup'; });
        var scopeTap = controls.find(function (item) { return item.Type === 'Tap' && String(item.Key).toLowerCase() === 'mouserbutton'; });
        if (scopeTap) {
          document.getElementById('map-sx').value = (Number(scopeTap.X) / 100).toFixed(4);
          document.getElementById('map-sy').value = (Number(scopeTap.Y) / 100).toFixed(4);
        }
        document.querySelector('[data-binding="fireKey"]').value = '';
        document.querySelector('[data-binding="scopeKey"]').value = '';
        importedTapBindings = taps;
        importedHudTargets = taps.map(function (target, index) { return { x: target.x, y: target.y, key: target.key, action: target.action, label: target.key, tapIndex: index }; });
        if (dpad) importedHudTargets.push({ x: Number(dpad.X) / 100, y: Number(dpad.Y) / 100, label: 'MOVE', fieldX: 'map-jx', fieldY: 'map-jy' });
        if (pan) importedHudTargets.push({ x: Number(pan.X) / 100, y: Number(pan.Y) / 100, label: 'AIM', fieldX: 'map-cx', fieldY: 'map-cy' });
        if (pan && Number.isFinite(Number(pan.LButtonX)) && Number.isFinite(Number(pan.LButtonY))) importedHudTargets.push({ x: Number(pan.LButtonX) / 100, y: Number(pan.LButtonY) / 100, label: 'FIRE', fieldX: 'map-fx', fieldY: 'map-fy' });
        if (scopeTap) importedHudTargets.push({ x: Number(scopeTap.X) / 100, y: Number(scopeTap.Y) / 100, label: 'SCOPE', fieldX: 'map-sx', fieldY: 'map-sy' });
        renderHudTargets();
        renderImportedBindings();
        var duplicates = taps.some(function (target, index) { return taps.some(function (other, otherIndex) { return otherIndex !== index && other.key === target.key; }); });
        document.getElementById('cfg-status').textContent = scheme.Name + ': ' + taps.length + ' tap targets imported; ' + skipped + ' script/unsupported controls skipped.' + (duplicates ? ' Repeated keys trigger their listed targets together.' : '');
        var fields = {};
        ['map-jx','map-jy','map-radius','map-sensitivity','map-cx','map-cy','map-fx','map-fy','map-sx','map-sy'].forEach(function (id) { fields[id] = document.getElementById(id).value; });
        var bindings = {};
        document.querySelectorAll('.binding-input').forEach(function (input) { bindings[input.dataset.binding] = input.value; });
        localStorage.setItem('heaven-msi-profile', JSON.stringify({ scheme: scheme.Name, taps: taps, targets: importedHudTargets, fields: fields, bindings: bindings, cameraToggleKey: profileCameraToggleKey }));
        updateProfileOrientation();
      } catch (error) {
        document.getElementById('cfg-status').textContent = 'Import failed: ' + error.message;
      }
    };
    reader.readAsText(file);
  });

  try {
    var savedProfile = JSON.parse(localStorage.getItem('heaven-msi-profile') || 'null');
    if (savedProfile && Array.isArray(savedProfile.taps)) {
      importedTapBindings = savedProfile.taps;
      importedHudTargets = Array.isArray(savedProfile.targets) ? savedProfile.targets : savedProfile.taps;
      importedTapBindings.forEach(function (target, index) { target.tapIndex = index; });
      importedHudTargets.forEach(function (target, index) {
        if (index < importedTapBindings.length && target.tapIndex === undefined) target.tapIndex = index;
        if (target.label === 'MOVE') { target.fieldX = 'map-jx'; target.fieldY = 'map-jy'; }
        if (target.label === 'AIM') { target.fieldX = 'map-cx'; target.fieldY = 'map-cy'; }
        if (target.label === 'FIRE') { target.fieldX = 'map-fx'; target.fieldY = 'map-fy'; }
        if (target.label === 'SCOPE') { target.fieldX = 'map-sx'; target.fieldY = 'map-sy'; }
      });
      profileCameraToggleKey = savedProfile.cameraToggleKey || null;
      Object.keys(savedProfile.fields || {}).forEach(function (id) { var field = document.getElementById(id); if (field) field.value = savedProfile.fields[id]; });
      Object.keys(savedProfile.bindings || {}).forEach(function (name) { var field = document.querySelector('[data-binding="' + name + '"]'); if (field) field.value = savedProfile.bindings[name]; });
      renderHudTargets();
      renderImportedBindings();
      document.getElementById('cfg-status').textContent = savedProfile.scheme + ': saved profile loaded (' + importedTapBindings.length + ' tap targets).';
      updateProfileOrientation();
    }
  } catch (e) {}

  document.getElementById('mapping-start').onclick = function () {
    if (mappingActive) { stopMapping(); return; }
    layoutEditMode = false;
    placingNewControl = false;
    document.getElementById('layout-edit-toggle').classList.remove('active');
    document.getElementById('layout-edit-toggle').textContent = 'Edit layout';
    renderHudTargets();
    try {
      var lockRequest = stage.requestPointerLock();
      Promise.resolve(lockRequest).then(function () {
        if (document.pointerLockElement !== stage) { throw new Error('Mouse capture was not granted'); }
        return queuedApi(Object.assign({ op: 'mapping-start' }, mapSettings()));
      }).then(function () {
        if (document.pointerLockElement !== stage) {
          return queuedApi({ op: 'mapping-stop' }).then(function () { throw new Error('Mouse capture ended during startup'); });
        }
        mappingActive = true;
        document.getElementById('mapping-start').textContent = 'Stop mapping';
        document.getElementById('mapping-start').classList.add('danger');
        document.getElementById('mapping-hint').textContent = 'Mapping active · press WASD or an imported key. This browser page must stay focused.';
      }).catch(function (error) {
        if (document.pointerLockElement === stage) { document.exitPointerLock(); }
        report(error);
      });
    } catch (error) { report(error); }
  };

  function stopMapping() {
    if (!mappingActive) { return; }
    mappingActive = false;
    document.getElementById('mapping-start').textContent = 'Start mapping';
    document.getElementById('mapping-start').classList.remove('danger');
    document.getElementById('mapping-hint').textContent = 'Mapping stopped. Click Start mapping, then keep this browser page focused.';
    if (document.pointerLockElement === stage) { document.exitPointerLock(); }
    queuedApi({ op: 'mapping-stop' }).catch(report);
  }

  function panic() {
    mappingActive = false;
    document.getElementById('mapping-start').textContent = 'Start mapping';
    document.getElementById('mapping-start').classList.remove('danger');
    document.getElementById('mapping-hint').textContent = 'All touches released. Click Start mapping to continue.';
    if (document.pointerLockElement === stage) { document.exitPointerLock(); }
    queuedApi({ op: 'panic' }).catch(report);
  }

  document.addEventListener('pointerlockchange', function () {
    if (mappingActive && document.pointerLockElement !== stage) { stopMapping(); }
  });
  window.addEventListener('keydown', function (evt) {
    var tapBindingInput = document.activeElement && document.activeElement.classList.contains('tap-binding-input')
      ? document.activeElement : null;
    if (tapBindingInput && !mappingActive) {
      evt.preventDefault();
      if (evt.key === 'Escape') { tapBindingInput.blur(); return; }
      var chosenTapKey = normalizeEventKey(evt.key);
      var allowedTapKey = /^[a-z0-9]$/.test(chosenTapKey)
        || ['space', 'shift', 'control', 'alt', 'tab', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(chosenTapKey) !== -1;
      if (!allowedTapKey) { report(new Error('Choose a letter, number, Space, Shift, Control, Alt, Tab, or arrow key')); return; }
      var index = Number(tapBindingInput.dataset.index);
      if (!Number.isInteger(index) || !importedTapBindings[index]) return;
      importedTapBindings[index].key = chosenTapKey;
      if (importedHudTargets[index]) { importedHudTargets[index].key = chosenTapKey; importedHudTargets[index].label = chosenTapKey; }
      saveImportedBindings();
      renderHudTargets();
      renderImportedBindings();
      return;
    }
    var bindingInput = document.activeElement && document.activeElement.classList.contains('binding-input')
      ? document.activeElement : null;
    if (bindingInput && !mappingActive) {
      evt.preventDefault();
      if (evt.key === 'Escape') { bindingInput.blur(); return; }
      try {
        var chosen = normalizeEventKey(evt.key);
        if (!chosen || chosen === 'escape') { throw new Error('Escape is reserved for emergency release'); }
        bindingInput.value = displayKey(chosen);
        var bindings = {};
        document.querySelectorAll('.binding-input').forEach(function (input) {
          bindings[input.dataset.binding] = normalizeEventKey(input.value);
        });
        localStorage.setItem('heaven-key-bindings', JSON.stringify(bindings));
        saveImportedBindings();
        bindingInput.blur();
      } catch (error) { report(error); }
      return;
    }
    if (evt.key === 'Escape') {
      evt.preventDefault();
      panic();
      return;
    }
    var key = normalizeEventKey(evt.key);
    var isMappedKey = key === profileCameraToggleKey
      || importedTapBindings.some(function (target) { return target.key === key; })
      || Array.prototype.some.call(document.querySelectorAll('.binding-input:not(.tap-binding-input)'), function (input) {
        return normalizeEventKey(input.value) === key;
      });
    if (mappingActive && isMappedKey) evt.preventDefault();
    if (mappingActive && key !== 'escape') {
      document.getElementById('mapping-hint').textContent = 'Keyboard received: ' + displayKey(key) + ' · keep this browser page focused.';
    }
    if (mappingActive && key === 'wheelup') { evt.preventDefault(); queuedApi({ op: 'key-down', key: key }); return; }
    if (mappingActive && ['w', 'a', 's', 'd'].indexOf(key) !== -1) {
      evt.preventDefault();
      if (!evt.repeat) { queuedApi({ op: 'key-down', key: key }); }
    } else if (mappingActive && !evt.repeat) {
      queuedApi({ op: 'key-down', key: key });
    }
  }, true);
  window.addEventListener('keyup', function (evt) {
    var key = normalizeEventKey(evt.key);
    if (mappingActive && ['w', 'a', 's', 'd'].indexOf(key) !== -1) {
      evt.preventDefault();
      queuedApi({ op: 'key-up', key: key });
    } else if (mappingActive) {
      queuedApi({ op: 'key-up', key: key });
    }
  }, true);
  document.addEventListener('wheel', function (evt) {
    if (!mappingActive) return;
    evt.preventDefault();
    queuedApi({ op: 'key-down', key: evt.deltaY < 0 ? 'wheelup' : 'wheeldown' });
    queuedApi({ op: 'key-up', key: evt.deltaY < 0 ? 'wheelup' : 'wheeldown' });
  }, { passive: false });
  stage.addEventListener('mousemove', function (evt) {
    if (mappingActive && document.pointerLockElement === stage && (evt.movementX || evt.movementY)) {
      queuedApi({ op: 'camera-move', dx: evt.movementX, dy: evt.movementY });
    }
  });
  document.addEventListener('mousedown', function (evt) {
    if (!mappingActive) { return; }
    if (evt.button === 0 || evt.button === 2) {
      evt.preventDefault();
      queuedApi({ op: 'button-down', button: evt.button === 0 ? 'left' : 'right' });
    }
  });
  document.addEventListener('mouseup', function (evt) {
    if (!mappingActive) { return; }
    if (evt.button === 0 || evt.button === 2) {
      evt.preventDefault();
      queuedApi({ op: 'button-up', button: evt.button === 0 ? 'left' : 'right' });
    }
  });
  document.addEventListener('contextmenu', function (evt) { if (mappingActive) { evt.preventDefault(); } });

  window.addEventListener('beforeunload', function () {
    try { navigator.sendBeacon('/api/input?t=' + encodeURIComponent(TOKEN), new Blob([JSON.stringify({ op: 'panic' })], { type: 'application/json' })); } catch (e) {}
  });

  var seenLog = 0;
  function render(log) {
    var box = document.getElementById('log');
    for (var i = 0; i < log.length; i++) {
      var entry = log[i];
      if (entry.seq <= seenLog) { continue; }
      seenLog = entry.seq;
      var line = document.createElement('div');
      line.className = entry.level;
      line.textContent = entry.ts.slice(11, 23) + ' ' + entry.msg;
      box.appendChild(line);
    }
    while (box.childElementCount > 120) { box.removeChild(box.firstChild); }
    box.scrollTop = box.scrollHeight;
  }

  function placeMarkers(active) {
    var existing = {};
    var nodes = stage.querySelectorAll('.marker');
    for (var i = 0; i < nodes.length; i++) { existing[nodes[i].dataset.name] = nodes[i]; }
    active.forEach(function (pointer) {
      var node = existing[pointer.name];
      if (!node) {
        node = document.createElement('div');
        node.className = 'marker';
        node.dataset.name = pointer.name;
        node.innerHTML = '<div class="ring"></div><div class="dot"></div><div class="label">' + pointer.name + '</div>';
        stage.appendChild(node);
      }
      node.style.left = (pointer.x / W * 100) + '%';
      node.style.top = (pointer.y / H * 100) + '%';
      delete existing[pointer.name];
    });
    Object.keys(existing).forEach(function (name) { existing[name].remove(); });
  }

  function tick() {
    fetch('/api/state', { headers: { 'x-heaven-token': TOKEN } })
      .then(function (res) { return res.json(); })
      .then(function (state) {
        var pill = document.getElementById('session-pill');
        var mock = state.mock ? ' (mock)' : '';
        if (state.session.running) {
          pill.textContent = 'session up' + mock;
          pill.className = 'pill ok';
        } else {
          pill.textContent = 'session down' + mock;
          pill.className = 'pill bad';
        }
        placeMarkers(state.pointers.active);
        if (state.mappingActive && !mappingActive) {
          document.getElementById('mapping-start').textContent = 'Stop mapping';
        }
        document.getElementById('k-count').textContent = state.pointers.count;
        document.getElementById('k-messages').textContent = state.pointers.totalMessages;
        document.getElementById('k-panics').textContent = state.pointers.panics;
        document.getElementById('k-hz').textContent = state.lastSweep ? state.lastSweep.achievedHz : '—';
        document.getElementById('k-proof').textContent = state.lastProof
          ? (state.lastProof.ok ? 'ok' : 'failed') + ' · ' + state.lastProof.totalMs + ' ms'
          : '—';
        render(state.log || []);
      })
      .catch(function () {
        var pill = document.getElementById('session-pill');
        pill.textContent = 'bridge lost';
        pill.className = 'pill bad';
      });
  }

  function pollScreen() {
    fetch('/api/screen?t=' + encodeURIComponent(TOKEN) + '&v=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) { throw new Error('Phone screen is not available'); }
        var nextWidth = Number(res.headers.get('x-display-width'));
        var nextHeight = Number(res.headers.get('x-display-height'));
        if (nextWidth > 0 && nextHeight > 0) setDisplaySize(nextWidth, nextHeight);
        return res.blob();
      })
      .then(function (blob) {
        var nextUrl = URL.createObjectURL(blob);
        var previousUrl = currentScreenUrl;
        currentScreenUrl = nextUrl;
        screenImage.onload = function () {
          screenImage.style.display = 'block';
          screenMessage.style.display = 'none';
          if (previousUrl) { URL.revokeObjectURL(previousUrl); }
        };
        screenImage.onerror = function () {
          URL.revokeObjectURL(nextUrl);
          if (previousUrl) { currentScreenUrl = previousUrl; }
          screenMessage.textContent = 'Phone screen preview is unavailable.';
          screenMessage.style.display = 'flex';
        };
        screenImage.src = nextUrl;
      })
      .catch(function () {
        if (!currentScreenUrl) {
          screenMessage.textContent = 'Phone screen preview is unavailable. Check the USB connection.';
          screenMessage.style.display = 'flex';
        }
      })
      // Keep only a short pause after each completed frame. Polling is
      // serialized, so this avoids piling up captures while reducing the
      // dead time between updates.
      .finally(function () { setTimeout(pollScreen, 80); });
  }

  function startVideo() {
    if (!window.VideoDecoder || !window.EncodedVideoChunk || !window.ReadableStream) {
      throw new Error('This browser does not support low-latency H.264 video decoding');
    }
    return fetch('/api/video?t=' + encodeURIComponent(TOKEN), { cache: 'no-store' }).then(function (res) {
      if (!res.ok || !res.body) throw new Error('The scrcpy video stream is unavailable');
      var reader = res.body.getReader();
      var buffer = new Uint8Array(0);
      var decoder = null;
      var codecSeen = false;
      var codecConfigured = false;
      var codecData = null;
      var currentCodec = '';
      var timestampMask = (1n << 61n) - 1n;
      var configMask = 1n << 62n;
      var keyMask = 1n << 61n;
      var sessionMask = 1n << 63n;

      function decodeOutput(frame) {
        decodedWidth = frame.displayWidth;
        decodedHeight = frame.displayHeight;
        if (frame.displayWidth !== W || frame.displayHeight !== H) setDisplaySize(frame.displayWidth, frame.displayHeight);
        // Use the dimensions carried by the decoded H.264 frame for the canvas
        // backing store. Session dimensions describe the Android display and
        // can be different from the actual encoded frame dimensions.
        if (videoCanvas.width !== frame.displayWidth || videoCanvas.height !== frame.displayHeight) {
          videoCanvas.width = frame.displayWidth;
          videoCanvas.height = frame.displayHeight;
        }
        videoCanvas.style.display = 'block';
        screenImage.style.display = 'none';
        screenMessage.style.display = 'none';
        videoContext.imageSmoothingEnabled = true;
        videoContext.imageSmoothingQuality = 'high';
        videoContext.drawImage(frame, 0, 0, videoCanvas.width, videoCanvas.height);
        frame.close();
        renderedFrames++;
        var now = performance.now();
        if (now - fpsWindowStart >= 1000) {
          var fps = Math.round(renderedFrames * 1000 / (now - fpsWindowStart));
          document.getElementById('video-status').textContent = 'Video ' + fps + ' fps · ' + decodedWidth + '×' + decodedHeight;
          renderedFrames = 0;
          fpsWindowStart = now;
        }
      }
      function resetDecoder() {
        if (decoder && decoder.state !== 'closed') decoder.reset();
        codecConfigured = false;
      }
      decoder = new VideoDecoder({
        output: decodeOutput,
        error: function (error) { report(error); }
      });
      function codecFromSps(data) {
        for (var i = 0; i + 5 < data.length; i++) {
          var nal = -1;
          if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1) nal = i + 4;
          else if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) nal = i + 3;
          if (nal >= 0 && (data[nal] & 31) === 7) {
            return 'avc1.' + [data[nal + 1], data[nal + 2], data[nal + 3]].map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
          }
        }
        return 'avc1.42E01E';
      }
      function submitFrame(payload, key, timestamp) {
        if (!codecConfigured) return;
        var bytes = payload;
        if (key && codecData) {
          bytes = new Uint8Array(codecData.length + payload.length);
          bytes.set(codecData, 0);
          bytes.set(payload, codecData.length);
        }
        decoder.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: timestamp, data: bytes }));
      }
      function append(incoming) {
        var merged = new Uint8Array(buffer.length + incoming.length);
        merged.set(buffer, 0);
        merged.set(incoming, buffer.length);
        buffer = merged;
        var offset = 0;
        if (!codecSeen) {
          if (buffer.length < 4) return;
          currentCodec = String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3]);
          if (currentCodec !== 'h264') throw new Error('Unsupported phone video codec: ' + currentCodec);
          codecSeen = true;
          offset = 4;
        }
        while (buffer.length - offset >= 12) {
          var view = new DataView(buffer.buffer, buffer.byteOffset + offset, buffer.byteLength - offset);
          var pts = view.getBigUint64(0, false);
          if ((pts & sessionMask) !== 0n) {
            var sessionWidth = view.getUint32(4, false);
            var sessionHeight = view.getUint32(8, false);
            offset += 12;
            setDisplaySize(sessionWidth, sessionHeight);
            codecData = null;
            resetDecoder();
            continue;
          }
          var packetSize = view.getUint32(8, false);
          if (packetSize > 64 * 1024 * 1024) throw new Error('Phone video packet is too large');
          if (buffer.length - offset < 12 + packetSize) break;
          var payload = buffer.slice(offset + 12, offset + 12 + packetSize);
          offset += 12 + packetSize;
          var isConfig = (pts & configMask) !== 0n;
          var isKey = (pts & keyMask) !== 0n;
          if (isConfig) {
            codecData = payload;
            currentCodec = codecFromSps(codecData);
            resetDecoder();
            // Let the H.264 SPS tell WebCodecs the real encoded dimensions.
            // Forcing the display size here can make a cropped/scaled stream
            // look soft and can conceal a lower-resolution encoder output.
            decoder.configure({ codec: currentCodec, optimizeForLatency: true, hardwareAcceleration: 'prefer-hardware' });
            codecConfigured = true;
          } else {
            var timestamp = Number(pts & timestampMask);
            submitFrame(payload, isKey, timestamp);
          }
        }
        buffer = buffer.slice(offset);
      }
      function pump() {
        return reader.read().then(function (result) {
          if (result.done) throw new Error('The phone video stream ended');
          append(result.value);
          return pump();
        });
      }
      return pump();
    });
  }

  function report(error) {
    var box = document.getElementById('log');
    var line = document.createElement('div');
    line.className = 'error';
    line.textContent = 'client: ' + error.message;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
  }

  tick();
  setInterval(tick, 250);
  fitStage();
  window.addEventListener('resize', fitStage);
  if (window.ResizeObserver) new ResizeObserver(fitStage).observe(stageWrap);
  if (${videoAvailable ? 'true' : 'false'}) {
    startVideo().catch(function (error) {
      report(error);
      if (${screenAvailable ? 'true' : 'false'}) pollScreen();
    });
  } else if (${screenAvailable ? 'true' : 'false'}) { pollScreen(); }
  window.addEventListener('beforeunload', function () {
    if (currentScreenUrl) { URL.revokeObjectURL(currentScreenUrl); }
  });
})();
</script>
</body>
</html>`;
}

/**
 * @param {string} value
 */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
