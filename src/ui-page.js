/**
 * The loopback test interface.
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
 * @param {{token: string, width: number, height: number, model: string, mock: boolean}} options
 * @returns {string}
 */
export function renderPage(options) {
  const { token, width, height, model, mock } = options;
  const title = `HEAVEN PoC — ${model || 'device'}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0b0d12;
    --panel: #14171f;
    --panel-2: #1b1f29;
    --line: #262c3a;
    --text: #e6e9f0;
    --muted: #8b93a7;
    --accent: #4da3ff;
    --accent-2: #7ee787;
    --danger: #ff5d5d;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 13px/1.5 "Segoe UI", system-ui, sans-serif;
    height: 100vh; display: flex; flex-direction: column;
  }
  header {
    display: flex; align-items: center; gap: 16px;
    padding: 10px 16px; border-bottom: 1px solid var(--line); background: var(--panel);
  }
  header h1 { font-size: 13px; margin: 0; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
  .pill { padding: 2px 8px; border-radius: 999px; font-size: 11px; border: 1px solid var(--line); color: var(--muted); }
  .pill.ok { border-color: #1f6f3f; color: var(--accent-2); background: #0e2a19; }
  .pill.bad { border-color: #6f1f1f; color: var(--danger); background: #2a0e0e; }
  .spacer { flex: 1; }
  main { flex: 1; display: grid; grid-template-columns: minmax(300px, 1fr) 320px; gap: 0; min-height: 0; }
  .stage-wrap { display: flex; align-items: center; justify-content: center; padding: 16px; min-height: 0; background: radial-gradient(circle at 50% 0%, #141a26 0%, #0b0d12 70%); }
  #stage {
    position: relative; height: 100%; max-height: 100%; aspect-ratio: ${width} / ${height};
    background: #05070a; border: 1px solid var(--line); border-radius: 10px;
    overflow: hidden; cursor: crosshair; touch-action: none;
    box-shadow: 0 20px 50px rgba(0,0,0,.5);
  }
  #stage .grid { position: absolute; inset: 0;
    background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px);
    background-size: 10% 10%; opacity: .25; pointer-events: none; }
  .marker { position: absolute; transform: translate(-50%, -50%); pointer-events: none; transition: none; }
  .marker .dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid currentColor; opacity: .9; }
  .marker .ring { position: absolute; inset: -12px; border-radius: 50%; border: 1px dashed currentColor; opacity: .45; }
  .marker .label { position: absolute; left: 16px; top: -10px; font-size: 10px; letter-spacing: .08em; color: currentColor; white-space: nowrap; }
  .marker[data-name="A"] { color: var(--accent); }
  .marker[data-name="B"] { color: var(--accent-2); }
  aside { border-left: 1px solid var(--line); background: var(--panel); display: flex; flex-direction: column; min-height: 0; }
  .group { padding: 12px 14px; border-bottom: 1px solid var(--line); }
  .group h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 0 0 8px; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; }
  button {
    font: inherit; font-size: 12px; padding: 6px 10px; border-radius: 7px; cursor: pointer;
    background: var(--panel-2); color: var(--text); border: 1px solid var(--line);
  }
  button:hover:not(:disabled) { border-color: #3a4358; background: #212633; }
  button:disabled { opacity: .4; cursor: not-allowed; }
  button.primary { border-color: #245d91; background: #12283d; color: #cfe6ff; }
  button.danger { border-color: #7a2626; background: #2b1010; color: #ffc9c9; font-weight: 600; }
  button.wide { width: 100%; }
  label.field { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); }
  input[type="number"] { width: 64px; background: #0c0f15; color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px; font: inherit; }
  .kv { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); padding: 1px 0; }
  .kv b { color: var(--text); font-weight: 600; }
  #log { flex: 1; overflow: auto; padding: 10px 14px; font: 11px/1.5 ui-monospace, Consolas, monospace; color: var(--muted); min-height: 0; }
  #log div { white-space: pre-wrap; word-break: break-word; }
  #log .warn { color: #ffcf70; }
  #log .error { color: var(--danger); }
  #log .info { color: #9fb4d0; }
  footer { padding: 6px 14px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted); display: flex; gap: 12px; }
  .hint { font-size: 11px; color: var(--muted); margin: 6px 0 0; }
  .banner { background: #2a1f0b; border-bottom: 1px solid #5c4312; color: #ffd479; padding: 6px 16px; font-size: 12px; display: ${mock ? 'block' : 'none'}; }
</style>
</head>
<body>
<header>
  <h1>HEAVEN Mobile Control — PoC</h1>
  <span class="pill" id="session-pill">connecting…</span>
  <span class="pill" id="device-pill">${escapeHtml(model || 'unknown')} · ${width}&times;${height}</span>
  <span class="spacer"></span>
  <button class="danger" id="panic">Panic release (Esc)</button>
</header>
<div class="banner" id="mock-banner">MOCK TRANSPORT — no device attached; messages are counted, not injected.</div>
<main>
  <div class="stage-wrap">
    <div id="stage" aria-label="Touch test surface">
      <div class="grid"></div>
    </div>
  </div>
  <aside>
    <div class="group">
      <h2>Pointer A — held</h2>
      <div class="row">
        <button id="hold-a" class="primary">Down at 35%/45%</button>
        <button id="up-a">Release A</button>
      </div>
      <p class="hint">Or press and drag directly on the surface: the mouse drives pointer A.</p>
    </div>
    <div class="group">
      <h2>Pointer B — moving</h2>
      <div class="row">
        <button id="hold-b" class="primary">Down at 65%/45%</button>
        <button id="up-b">Release B</button>
      </div>
      <div class="row" style="margin-top:6px">
        <label class="field">sweep <input type="number" id="sweep-ms" value="2000" min="200" max="15000" step="100"> ms</label>
        <button id="sweep-b">Sweep B while A held</button>
      </div>
    </div>
    <div class="group">
      <h2>Sequence</h2>
      <div class="row">
        <button id="proof" class="primary wide">Run two-pointer proof</button>
      </div>
      <p class="hint">Server-side: A down, B down, B sweeps, B up, A up. No device app is touched.</p>
    </div>
    <div class="group">
      <h2>State</h2>
      <div class="kv"><span>active pointers</span><b id="k-count">0</b></div>
      <div class="kv"><span>messages sent</span><b id="k-messages">0</b></div>
      <div class="kv"><span>panics</span><b id="k-panics">0</b></div>
      <div class="kv"><span>achieved Hz</span><b id="k-hz">—</b></div>
      <div class="kv"><span>last proof</span><b id="k-proof">—</b></div>
    </div>
    <div id="log"></div>
    <footer>
      <span id="f-note">loopback only</span>
      <span class="spacer"></span>
      <span id="f-token">${escapeHtml(token.slice(0, 6))}…</span>
    </footer>
  </aside>
</main>
<script>
(function () {
  var TOKEN = ${JSON.stringify(token)};
  var W = ${width};
  var H = ${height};
  var stage = document.getElementById('stage');
  var dragging = false;
  var pendingMove = null;
  var moveInFlight = false;

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

  stage.addEventListener('pointerdown', function (evt) {
    evt.preventDefault();
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
  window.addEventListener('blur', function () { if (dragging) { stopDrag(); } });

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

  function panic() { api('/api/input', { op: 'panic' }).catch(report); }

  document.addEventListener('keydown', function (evt) {
    if (evt.key === 'Escape') { evt.preventDefault(); panic(); }
  });

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
