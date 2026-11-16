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
  const { token, width, height, model, mock, screenAvailable = false, videoAvailable = false, mouseSensitivity = 1, screenWake = null } = options;
  const locked = Boolean(screenWake && screenWake.locked);
  const initialScreenMessage = mock
    ? 'Demo mode — no phone attached. Connect your phone and run live mode to see the game screen here.'
    : locked
      ? 'Unlock your phone to show the live screen.'
      : (screenAvailable ? 'Connecting to your phone screen…' : 'Phone screen preview is not available yet.');
  const initialVideoStatus = videoAvailable ? 'Starting live video…' : 'Preview mode';
  const title = `Heaven Mobile Control — ${model || 'device'}`;
  const tokenShort = escapeHtml(String(token || '').slice(0, 6));
  const deviceLabel = escapeHtml(model || 'Phone');
  const statusLabel = mock ? 'Demo mode — no phone attached' : `Phone connected — ${deviceLabel}`;
  const statusDot = mock ? 'warn' : 'ok';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; --bg:#0b1220; --bg-soft:#101827; --panel:#131c2e; --panel-2:#182238; --panel-3:#1e2a42; --line:#24324a; --line-strong:#334766; --text:#f8fafc; --text-muted:#b7c3d9; --text-faint:#8494b0; --accent:#2563eb; --accent-hover:#3b82f6; --accent-soft:rgba(37,99,235,.16); --accent-contrast:#ffffff; --ok:#22c55e; --ok-soft:rgba(34,197,94,.14); --warn:#f59e0b; --warn-soft:rgba(245,158,11,.14); --danger:#ef4444; --danger-hover:#f87171; --danger-soft:rgba(239,68,68,.14); --shadow:0 18px 40px rgba(2,8,23,.45); --shadow-sm:0 4px 14px rgba(2,8,23,.28); --radius:12px; --mono:ui-monospace,"SFMono-Regular",Consolas,"Liberation Mono",monospace; --sans:"Segoe UI Variable","Segoe UI",Inter,system-ui,-apple-system,sans-serif; }
  *{box-sizing:border-box} html,body{height:100%} body{margin:0;font:14px/1.5 var(--sans);color:var(--text);background:radial-gradient(ellipse at top,#111a2e 0%,var(--bg) 55%);display:flex;flex-direction:column;overflow:hidden}
  h1,h2,h3,p{margin:0} button,input,select,textarea{font:inherit;color:inherit} button{cursor:pointer} :focus-visible{outline:2px solid rgba(59,130,246,.7);outline-offset:2px}
  .topbar{height:60px;flex:none;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding:0 16px;border-bottom:1px solid var(--line);background:rgba(11,18,32,.88);backdrop-filter:blur(8px)}
  .brand{display:flex;align-items:center;gap:10px;min-width:0}.logo{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--accent),#60a5fa);color:#fff;display:grid;place-items:center;font-weight:800;font-size:16px;flex:none}
  .brand-copy .name{font-size:14px;font-weight:700;letter-spacing:.02em}.brand-copy .tag{font-size:11px;color:var(--text-muted)}
  .conn{display:inline-flex;align-items:center;gap:8px;margin-left:10px;padding:6px 10px;border-radius:999px;background:var(--panel);border:1px solid var(--line);color:var(--text-muted);font-size:12px;white-space:nowrap}
  .dot{width:8px;height:8px;border-radius:50%;background:var(--warn);box-shadow:0 0 0 4px var(--warn-soft)} .dot.ok{background:var(--ok);box-shadow:0 0 0 4px var(--ok-soft)}
  .mode-badge{justify-self:center;padding:6px 14px;border-radius:999px;font-size:13px;font-weight:700;letter-spacing:.08em;border:1px solid var(--line-strong);background:var(--panel-2);color:var(--text-muted)}
  .mode-badge.playing{background:var(--ok-soft);color:var(--ok);border-color:rgba(34,197,94,.35)}
  .top-actions{justify-self:end;display:flex;align-items:center;gap:8px}
  .btn,button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:8px 14px;border-radius:10px;border:1px solid var(--line-strong);background:var(--panel-2);color:var(--text);font-size:14px;font-weight:600}
  .btn:hover:not(:disabled),button:hover:not(:disabled){background:var(--panel-3)} .btn:disabled,button:disabled{opacity:.5;cursor:not-allowed}
  .btn.primary,button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-contrast)} .btn.primary:hover:not(:disabled),button.primary:hover:not(:disabled){background:var(--accent-hover);border-color:var(--accent-hover)}
  .btn.danger,button.danger{background:var(--danger-soft);border-color:rgba(239,68,68,.35);color:#fecaca} .btn.ghost{background:transparent;border-color:var(--line);color:var(--text-muted)}
  .demo-banner{flex:none;padding:8px 16px;font-size:13px;font-weight:600;color:#fde68a;background:var(--warn-soft);border-bottom:1px solid rgba(245,158,11,.25);display:${mock ? 'block' : 'none'}}
  main{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 380px} .stage-col{min-width:0;min-height:0;display:flex;flex-direction:column;border-right:1px solid var(--line)}
  .guide{flex:none;margin:14px 16px 0;padding:12px 14px;border-radius:var(--radius);border:1px solid var(--line);background:var(--panel);box-shadow:var(--shadow-sm)}
  .guide-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.guide-head h2{font-size:14px;font-weight:700}
  .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.step{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:var(--panel-2);border:1px solid var(--line);color:var(--text-muted);font-size:13px}
  .step .n{width:24px;height:24px;border-radius:7px;background:var(--accent-soft);color:#93c5fd;display:grid;place-items:center;font-weight:700;font-size:12px;flex:none}
  .step.done{border-color:rgba(34,197,94,.35);color:#bbf7d0;background:rgba(34,197,94,.08)} .step.done .n{background:var(--ok-soft);color:var(--ok)}
  .phone-wrap{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:16px}.stage-wrap{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center}
  #stage{position:relative;flex:none;aspect-ratio:${width} / ${height};max-width:100%;max-height:100%;background:#050913;border:8px solid #1f2937;border-radius:26px;overflow:hidden;box-shadow:0 30px 60px rgba(0,0,0,.55),inset 0 0 0 1px rgba(255,255,255,.04);touch-action:none}
  #stage .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(148,163,184,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.08) 1px,transparent 1px);background-size:10% 10%;opacity:.35;pointer-events:none;z-index:1}
  #phone-video,#phone-screen{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:none;pointer-events:none;z-index:2;background:#020617}
  #screen-message{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:28px;text-align:center;color:#e2e8f0;font-size:15px;line-height:1.5;z-index:2;pointer-events:none;background:radial-gradient(ellipse at center,rgba(15,23,42,.4),rgba(2,6,23,.85))}
  #screen-message .phone-icon{font-size:42px;line-height:1} #screen-message .steps-list{font-size:13px;color:#cbd5e1;line-height:1.7}
  .hud-target{position:absolute;z-index:4;transform:translate(-50%,-50%);pointer-events:none;color:#fff;text-align:center;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6))}
  .hud-target .cap{width:44px;height:44px;border-radius:50%;margin:0 auto;background:rgba(37,99,235,.92);border:2px solid rgba(255,255,255,.95);display:grid;place-items:center;font-size:13px;font-weight:700}
  .hud-target .lbl{margin-top:4px;font-size:11px;font-weight:600;color:#e2e8f0;text-shadow:0 1px 3px #000;white-space:nowrap}
  #stage.layout-editing .hud-target,body.mode-setup .hud-target{pointer-events:auto;cursor:grab} #stage.layout-editing .hud-target:active{cursor:grabbing}
  .hud-target.selected .cap{box-shadow:0 0 0 3px #fff,0 0 0 6px var(--accent)}
  .hud-target i,.hud-target b{display:none}
  .marker{position:absolute;z-index:3;transform:translate(-50%,-50%);pointer-events:none;color:#22c55e}
  .marker .dot{width:12px;height:12px;border-radius:50%;border:2px solid currentColor;background:rgba(34,197,94,.3)}
  .marker .ring{position:absolute;inset:-10px;border-radius:50%;border:1px dashed currentColor;opacity:.5}
  .marker .label{position:absolute;left:14px;top:-10px;font-size:10px;font-weight:700;color:currentColor;text-shadow:0 1px 2px #000}
  #aim-crosshair{position:absolute;z-index:5;transform:translate(-50%,-50%);pointer-events:none;display:none}
  #stage.placing-control{cursor:crosshair}
  .tap-ripple{position:absolute;width:36px;height:36px;margin:-18px 0 0 -18px;border:2px solid rgba(59,130,246,.95);border-radius:50%;background:rgba(59,130,246,.2);pointer-events:none;z-index:12;transform:scale(.3);opacity:1;animation:tap-ripple .45s ease-out forwards}
  @keyframes tap-ripple{to{transform:scale(1.9);opacity:0}}
  .side{min-height:0;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:12px;background:var(--bg-soft)}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:14px;box-shadow:var(--shadow-sm)}
  .card h2{font-size:16px;font-weight:700;margin-bottom:4px}.card .sub{font-size:13px;color:var(--text-muted);margin-bottom:12px}
  .section-title{font-size:12px;font-weight:700;color:var(--text-faint);text-transform:uppercase;letter-spacing:.06em;margin:10px 0 8px}
  .preset-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}.preset-btn{min-height:44px;font-size:13px;padding:8px}
  .control-grid{display:grid;grid-template-columns:1fr;gap:8px}
  .km-tile.control-card{display:grid;grid-template-columns:40px 1fr;gap:10px;align-items:center;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--panel-2);text-align:left;min-height:56px}
  .km-tile.control-card:hover{border-color:var(--accent);background:var(--panel-3)} .km-tile.placing{border-color:var(--warn);background:var(--warn-soft)}
  .km-tile .icon{width:36px;height:36px;border-radius:10px;background:var(--accent-soft);color:#93c5fd;display:grid;place-items:center;font-size:18px;margin:0}
  .km-tile .text{display:flex;flex-direction:column} .km-tile .text b{font-size:14px;font-weight:650;color:var(--text)} .km-tile .text .desc{font-size:12px;color:var(--text-muted);margin-top:2px;line-height:1.35}
  .pill{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;border:1px solid var(--line);background:var(--panel-2);color:var(--text-muted);font-size:12px;font-weight:600}
  .pill.ok{color:#bbf7d0;background:var(--ok-soft);border-color:rgba(34,197,94,.35)} .pill.bad{color:#fecaca;background:var(--danger-soft);border-color:rgba(239,68,68,.35)}
  .status-line{font-size:13px;color:var(--text-muted);margin-top:8px;min-height:20px}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap} .spacer{flex:1}
  .play-summary{display:none} body.mode-play .setup-only{display:none !important} body.mode-play .play-summary{display:block}
  .keycap{min-width:36px;height:36px;padding:0 10px;border-radius:8px;background:var(--panel-3);border:1px solid var(--line-strong);display:inline-grid;place-items:center;font-weight:700;font-size:13px;color:#fff}
  .bottom-bar{flex:none;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding:12px 16px;border-top:1px solid var(--line);background:rgba(11,18,32,.92);backdrop-filter:blur(8px)}
  .bottom-bar .center{display:flex;flex-direction:column;align-items:center;gap:4px} .play-btn{min-width:220px;min-height:50px;font-size:16px;font-weight:700;border-radius:12px}
  .bottom-status{font-size:13px;color:var(--text-muted);text-align:center} .bottom-left,.bottom-right{font-size:12px;color:var(--text-faint)}
  input[type="text"],input[type="number"],select{width:100%;min-height:40px;padding:8px 10px;border-radius:10px;border:1px solid var(--line-strong);background:var(--bg-soft);color:var(--text)}
  input[type="range"]{width:100%;accent-color:var(--accent)} input.capturing{border-color:var(--warn);background:var(--warn-soft)}
  .kv{display:flex;justify-content:space-between;gap:8px;padding:6px 0;font-size:13px;color:var(--text-muted);border-bottom:1px dashed var(--line)} .kv:last-child{border-bottom:0} .kv b{color:var(--text);font-weight:600}
  .inspector-status{font-size:13px;color:var(--text-muted);min-height:20px;margin-top:6px} .inspector-status.error{color:#fca5a5}
  details.advanced{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
  details.advanced>summary{list-style:none;cursor:pointer;padding:12px 14px;font-size:14px;font-weight:650;color:var(--text-muted);display:flex;align-items:center;justify-content:space-between}
  details.advanced>summary::-webkit-details-marker{display:none} details.advanced[open]>summary{border-bottom:1px solid var(--line);color:var(--text)}
  .advanced-body{padding:12px 14px} #log{max-height:180px;overflow:auto;padding:10px;border-radius:10px;background:#060a14;color:#cbd5e1;font:12px/1.5 var(--mono);border:1px solid #1e293b}
  #log div{padding:1px 0;word-break:break-word} #log .error{color:#fca5a5} #log .warn{color:#fde68a} #log .info{color:#94a3b8}
  .settings-backdrop,.aim-modal-backdrop{position:fixed;inset:0;background:rgba(2,6,23,.65);backdrop-filter:blur(4px);z-index:40;display:none;align-items:flex-start;justify-content:center;padding:24px 16px;overflow:auto}
  .settings-backdrop.open,.aim-modal-backdrop.open{display:flex}
  .settings-panel,.aim-modal{width:min(560px,100%);background:var(--panel);color:var(--text);border:1px solid var(--line-strong);border-radius:16px;box-shadow:var(--shadow)}
  .aim-modal{width:min(720px,100%);max-height:92vh;overflow:auto}
  .settings-head,.aim-modal-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line)}
  .settings-head h2,.aim-modal-head h2{font-size:18px;font-weight:700} .settings-close,.aim-close{width:36px;height:36px;padding:0;font-size:18px}
  .settings-body{padding:14px 16px 18px;display:grid;gap:12px} .settings-section{border:1px solid var(--line);border-radius:12px;background:var(--panel-2);padding:12px}
  .settings-section h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-faint);margin-bottom:10px}
  .settings-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0;font-size:14px;color:var(--text-muted);flex-wrap:wrap}
  .settings-actions{display:flex;gap:8px;flex-wrap:wrap} .settings-status{font-size:13px;color:var(--text-muted);margin-top:8px;min-height:18px;white-space:pre-wrap}
  .settings-status.error{color:#fca5a5} .settings-status.ok{color:#86efac}
  .settings-toggle{width:46px;height:26px;border-radius:999px;border:1px solid var(--line-strong);background:var(--panel-3);position:relative;cursor:pointer;padding:0}
  .settings-toggle::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .15s}
  .settings-toggle.on{background:var(--accent);border-color:var(--accent)} .settings-toggle.on::after{left:22px} .settings-range{width:180px}
  .aim-tabs{display:flex;gap:4px;padding:8px 16px 0;border-bottom:1px solid var(--line)} .aim-tab{padding:10px 14px;font-size:14px;color:var(--text-muted);border-bottom:2px solid transparent;cursor:pointer;font-weight:600}
  .aim-tab.active{color:var(--text);border-bottom-color:var(--accent)} .aim-body{padding:14px 16px 18px}
  .aim-section{margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--line)} .aim-section:last-child{border-bottom:0;margin-bottom:0}
  .aim-section-head{display:flex;align-items:center;justify-content:space-between;font-size:14px;font-weight:700;margin-bottom:8px}
  .aim-row{display:grid;grid-template-columns:1fr 180px;gap:10px;align-items:center;margin:8px 0;font-size:14px;color:var(--text-muted)}
  .aim-switch{width:44px;height:24px;border-radius:999px;border:1px solid var(--line-strong);background:var(--panel-3);position:relative;cursor:pointer;padding:0}
  .aim-switch::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .15s}
  .aim-switch.on{background:var(--accent);border-color:var(--accent)} .aim-switch.on::after{left:22px}
  .aim-place-btn.armed{border-color:var(--accent);background:var(--accent-soft);color:#bfdbfe}
  .aim-footer{display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:10px;border-top:1px solid var(--line);font-size:13px;color:var(--text-muted)}
  .aim-trash{color:#fecaca;border-color:rgba(239,68,68,.35);background:var(--danger-soft)} .color-wrap{display:flex;align-items:center;gap:8px}
  .color-swatch{width:36px;height:36px;border:1px solid var(--line);border-radius:8px;padding:0;background:var(--panel-2)}
  .inspector-box{margin-top:10px;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--panel-2)}
  .inspector-box h3{font-size:12px;margin-bottom:8px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.05em}
  .inspector-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:center;margin-bottom:8px;font-size:13px;color:var(--text-muted)} .inspector-row b{color:var(--text)}
  .hidden-compat{display:none !important} .layout-actions{display:contents}
  @media (max-width:980px){body{overflow:auto;height:auto;min-height:100vh}.topbar{grid-template-columns:1fr;height:auto;padding:10px 12px}.mode-badge,.top-actions{justify-self:start}main{grid-template-columns:1fr}.stage-col{border-right:0;border-bottom:1px solid var(--line);min-height:60vh}.side{overflow:visible}.steps{grid-template-columns:1fr}.bottom-bar{grid-template-columns:1fr}}
</style>
</head>
<body class="mode-setup" id="app-body">
<header class="topbar">
  <div class="brand">
    <div class="logo">H</div>
    <div class="brand-copy"><div class="name">HEAVEN MOBILE CONTROL</div><div class="tag">Play your phone games on your laptop</div></div>
    <div class="conn"><span class="dot ${statusDot}" id="conn-dot"></span><span id="conn-text">${statusLabel}</span></div>
  </div>
  <div class="mode-badge" id="mode-badge">SETUP</div>
  <div class="top-actions">
    <button class="btn ghost" id="help-btn" type="button" title="Show quick guide">Help</button>
    <button class="btn settings-btn" id="settings-open" type="button">Settings</button>
    <button class="btn danger" id="panic" type="button">Stop · Release all</button>
  </div>
</header>
<div class="demo-banner" id="mock-banner">Demo mode — no phone attached. Nothing will happen on a real phone.</div>
<main>
  <section class="stage-col">
    <div class="guide setup-only" id="setup-guide">
      <div class="guide-head"><h2>Get ready to play</h2><button class="btn ghost" id="guide-dismiss" type="button" style="min-height:32px;padding:4px 10px;font-size:12px;">Dismiss</button></div>
      <div class="steps">
        <div class="step" id="step-connect"><span class="n">1</span><span><strong>Connect phone</strong><br><span style="color:var(--text-faint);font-size:12px;">USB cable and USB debugging on</span></span></div>
        <div class="step" id="step-place"><span class="n">2</span><span><strong>Place controls</strong><br><span style="color:var(--text-faint);font-size:12px;">Pick a control and click the screen</span></span></div>
        <div class="step" id="step-play"><span class="n">3</span><span><strong>Start playing</strong><br><span style="color:var(--text-faint);font-size:12px;">Press keys to tap and move</span></span></div>
      </div>
    </div>
    <div class="phone-wrap">
      <div class="stage-wrap">
        <div id="stage" aria-label="Phone screen and controls">
          <div class="grid"></div>
          <canvas id="phone-video" aria-label="Live phone video"></canvas>
          <img id="phone-screen" alt="Live phone screen">
          <div id="screen-message"><div class="phone-icon">📱</div><div><strong>${mock ? 'No phone connected' : 'Connecting…'}</strong></div><div class="steps-list">${mock ? '1. Connect phone with USB<br>2. Turn on USB debugging<br>3. Run live mode' : escapeHtml(initialScreenMessage)}</div></div>
          <div id="aim-crosshair" aria-hidden="true"></div>
        </div>
      </div>
    </div>
  </section>
  <aside class="side">
    <section class="card setup-only" id="setup-panel">
      <h2>Add controls</h2>
      <p class="sub">Click a control, click the phone screen to place it, then press a key to assign it. Drag placed controls to move them. Click a placed control and press Delete to remove it.</p>
      <div class="section-title">Quick presets</div>
      <div class="preset-row">
        <button class="btn preset-btn" id="preset-shooter" type="button">Shooter (FPS)</button>
        <button class="btn preset-btn" id="preset-moba" type="button">MOBA</button>
        <button class="btn preset-btn" id="preset-racing" type="button">Racing</button>
      </div>
      <div class="section-title">Controls</div>
      <div class="control-grid km-grid" id="control-grid">
        <button class="km-tile control-card" data-km-type="tap" type="button"><span class="icon">●</span><span class="text"><b>Tap spot</b><span class="desc">Tap one spot when you press a key</span></span></button>
        <button class="km-tile control-card" data-km-type="repeat" type="button"><span class="icon">↻</span><span class="text"><b>Repeated tap</b><span class="desc">Tap again and again while you hold the key</span></span></button>
        <button class="km-tile control-card" data-km-type="dpad" type="button"><span class="icon">✚</span><span class="text"><b>D-pad</b><span class="desc">Move with WASD keys</span></span></button>
        <button class="km-tile control-card" data-km-type="aim" type="button"><span class="icon">◎</span><span class="text"><b>Aim, pan and shoot</b><span class="desc">Move the mouse to look, left click to shoot</span></span></button>
        <button class="km-tile control-card" data-km-type="freelook" type="button"><span class="icon">◉</span><span class="text"><b>Free look</b><span class="desc">Hold a key and move the mouse to look around</span></span></button>
        <button class="km-tile control-card" data-km-type="swipe" type="button"><span class="icon">⇆</span><span class="text"><b>Swipe</b><span class="desc">Swipe in a direction when you press a key</span></span></button>
        <button class="km-tile control-card" data-km-type="zoom" type="button"><span class="icon">⤢</span><span class="text"><b>Zoom</b><span class="desc">Pinch to zoom in or out</span></span></button>
        <button class="km-tile control-card" data-km-type="mobadpad" type="button"><span class="icon">◌</span><span class="text"><b>MOBA D-pad</b><span class="desc">Move your character with keys in MOBA games</span></span></button>
        <button class="km-tile control-card" data-km-type="mobaskill" type="button"><span class="icon">✦</span><span class="text"><b>MOBA skill pad</b><span class="desc">Aim and cast skills with a key</span></span></button>
        <button class="km-tile control-card" data-km-type="rotate" type="button"><span class="icon">⟲</span><span class="text"><b>Rotate</b><span class="desc">Rotate the camera or object</span></span></button>
        <button class="km-tile control-card" data-km-type="edgescroll" type="button"><span class="icon">▣</span><span class="text"><b>Edge scroll</b><span class="desc">Move the view when the mouse reaches the edge</span></span></button>
        <button class="km-tile control-card" data-km-type="scroll" type="button"><span class="icon">⇳</span><span class="text"><b>Scroll</b><span class="desc">Scroll up and down with keys</span></span></button>
        <button class="km-tile control-card" data-km-type="mousewheel" type="button"><span class="icon">◔</span><span class="text"><b>Mouse wheel</b><span class="desc">Use the mouse wheel as a control</span></span></button>
        <button class="km-tile control-card" data-km-type="tilt" type="button"><span class="icon">∿</span><span class="text"><b>Tilt</b><span class="desc">Tilt control — coming soon</span></span></button>
        <button class="km-tile control-card" data-km-type="script" type="button"><span class="icon">⌘</span><span class="text"><b>Script</b><span class="desc">Run a recorded set of taps — coming soon</span></span></button>
      </div>
      <div class="section-title">Selected control</div>
      <div class="inspector-box" id="control-inspector">
        <h3>Selection</h3>
        <div class="inspector-row"><span>Type</span><b id="inspector-type">—</b></div>
        <div class="inspector-row"><span>Key <span class="inspector-hint" id="inspector-key-hint" style="color:var(--text-faint);font-size:11px;">(click to set)</span></span><input id="inspector-key" type="text" readonly placeholder="Click to set key"></div>
        <div class="row" style="margin-top:8px;gap:8px;"><button id="inspector-aim-settings" type="button" class="btn" style="display:none;min-height:36px;">Aim settings</button><button id="layout-delete" type="button" class="btn danger" disabled style="min-height:36px;">Delete control</button></div>
        <div id="inspector-status" class="inspector-status"></div>
      </div>
      <div style="margin-top:10px;" class="kv"><span>Controls placed</span><b id="km-tap-count">0</b></div>
      <div class="kv"><span>Keys set</span><b id="km-key-count">0</b></div>
      <div class="status-line" id="setup-status">Click a control on the right, then click the screen to place it.</div>
    </section>
    <section class="card play-summary" id="play-panel">
      <h2>You are playing</h2>
      <p class="sub">Your keyboard and mouse now control the phone. Press <strong>Esc</strong> to stop and return to setup.</p>
      <div class="status-line" id="play-hint">Left click fires at your Fire point when aiming. Click taps where you click when mapping is off.</div>
      <div class="section-title">Mouse speed</div>
      <div class="row" style="justify-content:space-between;font-size:13px;color:var(--text-muted);"><span>Look speed</span><b id="km-mouse-sensitivity" style="color:var(--text);">Normal</b></div>
      <input type="range" min="0.1" max="10" step="0.01" value="1.44" id="km-mouse-range" style="margin:8px 0 4px;">
      <div class="row" style="justify-content:space-between;font-size:12px;color:var(--text-faint);"><span>Slow</span><span>Normal</span><span>Fast</span></div>
      <div class="section-title">Keys you have set</div>
      <div id="play-keys-summary" class="status-line">No keys set yet.</div>
    </section>
    <details class="advanced setup-only" id="advanced-details">
      <summary><span>Advanced</span><span style="font-size:12px;color:var(--text-faint);">Connection and details</span></summary>
      <div class="advanced-body">
        <div class="section-title">Connection</div>
        <div class="kv"><span>Session</span><b id="session-pill">Connecting…</b></div>
        <div class="kv"><span>Device</span><b id="device-pill">${deviceLabel} · ${width}×${height}</b></div>
        <div class="kv"><span>Video</span><b id="video-status">${escapeHtml(initialVideoStatus)}</b></div>
        <div class="kv"><span>Controls</span><b id="conn-controls">Ready</b></div>
        <div class="section-title">Layout</div>
        <div class="row" style="margin-bottom:8px;"><button id="layout-edit-toggle" type="button" class="btn" style="min-height:36px;">Edit layout</button><span id="layout-status" style="font-size:12px;color:var(--text-muted);"></span></div>
        <div class="section-title">Mouse positions and sensitivity (advanced)</div>
        <div class="row" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:6px;font-size:12px;color:var(--text-faint);"><span>Aim X / Y %</span><input id="mouse-aim-x" type="number" min="0" max="100" step="0.01" value="50.00"><input id="mouse-aim-y" type="number" min="0" max="100" step="0.01" value="50.00"></div>
        <div class="row" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:6px;font-size:12px;color:var(--text-faint);"><span>Fire X / Y %</span><input id="mouse-fire-x" type="number" min="0" max="100" step="0.01" value="75.26"><input id="mouse-fire-y" type="number" min="0" max="100" step="0.01" value="72.81"></div>
        <div class="row" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:6px;font-size:12px;color:var(--text-faint);"><span>Scope X / Y %</span><input id="mouse-scope-x" type="number" min="0" max="100" step="0.01" value="85.00"><input id="mouse-scope-y" type="number" min="0" max="100" step="0.01" value="65.00"></div>
        <div class="row" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:6px;font-size:12px;color:var(--text-faint);"><span>Look speed X / Y</span><input id="mouse-sens-x" type="number" min="0.1" max="10" step="0.01" value="1.42"><input id="mouse-sens-y" type="number" min="0.1" max="10" step="0.01" value="1.46"></div>
        <div class="row" style="gap:6px;margin-bottom:8px;"><button id="mouse-place-aim" type="button" class="btn" style="min-height:32px;font-size:12px;">Place Aim</button><button id="mouse-place-fire" type="button" class="btn" style="min-height:32px;font-size:12px;">Place Fire</button><button id="mouse-place-scope" type="button" class="btn" style="min-height:32px;font-size:12px;">Place Scope</button></div>
        <div id="mouse-settings-status" class="inspector-status"></div>
        <div class="section-title">Diagnostics</div>
        <div class="kv"><span>Active pointers</span><b id="k-count">0</b></div>
        <div class="kv"><span>Messages sent</span><b id="k-messages">0</b></div>
        <div class="kv"><span>Panics</span><b id="k-panics">0</b></div>
        <div class="kv"><span>Achieved Hz</span><b id="k-hz">—</b></div>
        <div class="kv"><span>Last proof</span><b id="k-proof">—</b></div>
        <div class="kv"><span>Video connected</span><b id="k-video-connected">—</b></div>
        <div class="kv"><span>Video frames</span><b id="k-video-frames">0</b></div>
        <div class="kv"><span>Keyframe</span><b id="k-video-keyframe">—</b></div>
        <div class="kv"><span>Codec</span><b id="k-video-codec">—</b></div>
        <div class="kv"><span>Video error</span><b id="k-video-error">—</b></div>
        <div class="kv"><span>Server error</span><b id="k-server-error">—</b></div>
        <div id="log" aria-label="Event log" style="margin-top:8px;"></div>
      </div>
    </details>
  </aside>
</main>
<div class="bottom-bar">
  <div class="bottom-left"><span id="f-note">Setup: place controls, then start playing.</span></div>
  <div class="center"><button class="btn primary play-btn" id="mapping-start" type="button">▶ Start playing</button><div class="bottom-status" id="bottom-status">Ready — place controls and set keys</div></div>
  <div class="bottom-right" style="text-align:right;"><span id="f-token" style="font-family:var(--mono);font-size:11px;color:var(--text-faint);">${tokenShort}…</span></div>
</div>
<div class="hidden-compat" aria-hidden="true">
  <div id="km-keyboard" class="active"></div><div id="km-mouse"></div>
  <div id="km-keyboard-panel" class="km-panel open"></div><div id="km-mouse-panel" class="km-panel"></div>
  <span id="km-selected-info"></span><span id="mapping-status" class="pill bad">Mapping OFF</span>
  <div id="mapping-hint" class="inspector-status"></div><div id="tap-status" class="inspector-status"></div><div id="play-mode-info"></div>
</div>
<div id="settings-backdrop" class="settings-backdrop" aria-hidden="true">
  <div class="settings-panel" role="dialog" aria-label="Settings">
    <div class="settings-head"><h2>Settings</h2><button id="settings-close" class="settings-close" type="button" aria-label="Close settings">×</button></div>
    <div class="settings-body">
      <section class="settings-section" aria-label="Layout"><h3>Save and load layout</h3><p style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">Save your controls and keys to a file, or load a layout you saved before.</p>
        <div class="settings-actions"><button id="preset-import-btn" type="button" class="btn">Load a layout</button><button id="preset-export-btn" type="button" class="btn">Save my layout</button><input id="preset-file-input" type="file" accept=".json,application/json" style="display:none"></div>
        <div id="preset-import-confirm" class="settings-confirm" style="display:none;"></div><div class="settings-actions" id="preset-apply-row" style="display:none;margin-top:8px;"><button id="preset-apply-btn" type="button" class="btn primary">Apply layout</button></div><div id="preset-status" class="settings-status"></div>
      </section>
      <section class="settings-section" aria-label="Audio"><h3>Phone audio</h3>
        <div class="settings-row"><span>Play phone audio on this computer</span><div id="audio-toggle" class="settings-toggle" role="switch" aria-checked="false" tabindex="0"></div></div>
        <div style="font-size:12px;color:var(--text-faint);margin:4px 0 8px;">You may need to click the page once before sound can play.</div>
        <div class="settings-row"><span>Volume</span><div style="display:flex;align-items:center;gap:8px;"><input id="audio-volume" class="settings-range" type="range" min="0" max="100" value="80"><span id="audio-volume-label">80</span></div></div>
        <div class="settings-row"><span>Mute</span><button id="audio-mute-btn" type="button" class="btn">Mute</button></div>
        <div id="audio-status" class="settings-status">Phone audio is off.</div>
      </section>
      <section class="settings-section" aria-label="About"><h3>Advanced info</h3><div style="font-size:13px;color:var(--text-muted);">Connection and diagnostics are in the Advanced section on the right. Video preview mode is used when live video is not available.</div></section>
    </div>
  </div>
</div>
<div id="aim-modal-backdrop" class="aim-modal-backdrop" aria-hidden="true">
  <div class="aim-modal" role="dialog" aria-label="Aim, look and shoot settings">
    <div class="aim-modal-head"><h2>Aim, look and shoot</h2><button id="aim-close" class="aim-close" type="button" aria-label="Close">×</button></div>
    <div class="aim-tabs"><div id="aim-tab-km" class="aim-tab active">Keyboard &amp; mouse</div><div id="aim-tab-gamepad" class="aim-tab">Gamepad</div></div>
    <div class="aim-body" id="aim-body-km">
      <section class="aim-section"><h3 class="aim-section-head">Keys</h3><div class="aim-row"><span>Start / stop aiming</span><input id="aim-start-stop" type="text" readonly></div><div class="aim-row"><span>Hold to look around</span><input id="aim-suspend" type="text" readonly></div></section>
      <section class="aim-section"><h3 class="aim-section-head">Look speed</h3><div class="aim-row"><span>Look left / right speed</span><input id="aim-sens-x" type="number" step="0.01" min="0.1" max="10"></div><div class="aim-row"><span>Look up / down speed</span><input id="aim-sens-y" type="number" step="0.01" min="0.1" max="10"></div><div class="aim-row"><span>Fine tuning</span><input id="aim-tweaks" type="number" step="1"></div><div class="aim-row"><span>Mouse acceleration</span><select id="aim-accel"><option value="false">Off</option><option value="true">On</option></select></div></section>
      <section class="aim-section"><h3 class="aim-section-head"><span>Crosshair</span><div id="aim-crosshair-toggle" class="aim-switch on" role="switch" aria-checked="true"></div></h3><div class="aim-row"><span>Style</span><select id="aim-crosshair-style"><option>Cross</option><option>Dot</option><option>Circle</option></select></div><div class="aim-row"><span>Size</span><input id="aim-crosshair-size" type="number" step="1" min="1" max="10"></div><div class="aim-row"><span>Opacity</span><input id="aim-crosshair-opacity" type="number" step="1" min="0" max="100"></div><div class="aim-row"><span>Color</span><div class="color-wrap"><input id="aim-crosshair-color-picker" class="color-swatch" type="color" value="#2563eb"><input id="aim-crosshair-color" type="text" value="#2563EB"></div></div></section>
      <section class="aim-section"><h3 class="aim-section-head"><span>Fire with left click</span><div id="aim-fire-toggle" class="aim-switch on" role="switch" aria-checked="true"></div></h3><p style="font-size:13px;color:var(--text-muted);margin:4px 0 8px;">Place the fire point on the game's shoot button.</p><button id="aim-place-fire" class="aim-place-btn btn" type="button">Place fire point</button><div class="aim-row"><span>Fire action</span><select id="aim-fire-action"><option>LEFT CLICK</option><option>RIGHT CLICK</option><option>MIDDLE CLICK</option></select></div></section>
      <section class="aim-section"><h3 class="aim-section-head"><span>Free look</span><div id="aim-look-toggle" class="aim-switch" role="switch" aria-checked="false"></div></h3><p style="font-size:13px;color:var(--text-muted);margin:4px 0 8px;">Optional: place a free-look point if your game needs it.</p><button id="aim-place-look" class="aim-place-btn btn" type="button">Place free look point</button></section>
      <details class="advanced" style="margin-top:8px;"><summary><span>Advanced positions (percent)</span><span></span></summary><div class="advanced-body"><div class="aim-row"><span>Aim X (%)</span><input id="aim-x" type="number" step="0.01" min="0" max="100"></div><div class="aim-row"><span>Aim Y (%)</span><input id="aim-y" type="number" step="0.01" min="0" max="100"></div><div class="aim-row"><span>Fire X (%)</span><input id="aim-fire-x" type="number" step="0.01" min="0" max="100"></div><div class="aim-row"><span>Fire Y (%)</span><input id="aim-fire-y" type="number" step="0.01" min="0" max="100"></div><div class="aim-row"><span>Free look X (%)</span><input id="aim-look-x" type="number" step="0.01" min="-1" max="100"></div><div class="aim-row"><span>Free look Y (%)</span><input id="aim-look-y" type="number" step="0.01" min="-1" max="100"></div></div></details>
      <div class="aim-footer"><span>Changes are saved automatically.</span><button id="aim-delete" class="aim-trash btn" type="button">Delete aim control</button></div><div id="aim-panel-status" class="inspector-status" style="margin-top:8px;"></div>
    </div>
    <div class="aim-body" id="aim-body-gamepad" style="display:none;"><p style="color:var(--text-muted);margin:8px 0;">Gamepad settings are not available yet.</p></div>
  </div>
</div>


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
  var mappingHintTimer = null;
  var mappingUpdateTimer = null;
  function setMappingHint(text, isError, timeoutMs) {
    var el = document.getElementById('mapping-hint');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'inspector-status' + (isError ? ' error' : '');
    if (mappingHintTimer) { clearTimeout(mappingHintTimer); mappingHintTimer = null; }
    if (timeoutMs && text) {
      mappingHintTimer = setTimeout(function () {
        if (el.textContent === text) { el.textContent = ''; el.className = 'inspector-status'; }
        mappingHintTimer = null;
      }, timeoutMs);
    }
  }
  function uiSyncMode() {
    try {
      var playing = !!mappingActive;
      var body = document.body || document.getElementById('app-body');
      if (body) { body.classList.toggle('mode-play', playing); body.classList.toggle('mode-setup', !playing); }
      var badge = document.getElementById('mode-badge');
      if (badge) { badge.textContent = playing ? 'PLAYING' : 'SETUP'; badge.className = 'mode-badge' + (playing ? ' playing' : ''); }
      var btn = document.getElementById('mapping-start');
      if (btn) {
        btn.textContent = playing ? '■ Stop playing' : '▶ Start playing';
        btn.className = 'btn ' + (playing ? 'danger' : 'primary') + ' play-btn';
      }
      var placed = Array.isArray(importedHudTargets) ? importedHudTargets.length : 0;
      var bound = Array.isArray(importedHudTargets) ? importedHudTargets.filter(function(t){ return t && t.key && !/^km:/.test(t.key); }).length : 0;
      var bs = document.getElementById('bottom-status');
      if (bs) bs.textContent = playing ? 'Playing — press Esc to stop' : ('Ready — ' + placed + ' controls placed, ' + bound + ' keys set');
      var fn = document.getElementById('f-note');
      if (fn) fn.textContent = playing ? 'Playing: keys send taps, mouse aims. Press Esc to stop.' : 'Setup: place controls, then start playing.';
      var ph = document.getElementById('play-hint');
      if (ph) ph.textContent = (playing && document.pointerLockElement === stage)
        ? 'Mouse captured: move to aim, left click fires at your Fire point. Press Esc to stop.'
        : (playing ? 'Playing: press your keys to use controls. Click the screen to capture the mouse for aiming.' : 'Left click fires at your Fire point when aiming. Click taps where you click when mapping is off.');
      var pks = document.getElementById('play-keys-summary');
      if (pks) {
        var keys = (importedHudTargets||[]).filter(function(t){return t&&t.key&&!/^km:/.test(t.key);}).map(function(t){return (t.actionLabel||kmTypeLabel(t.action||t.kmType||'tap'))+': '+displayKey(t.key);});
        pks.innerHTML = keys.length ? keys.map(function(k){ return '<span class="keycap" style="margin:2px 4px 2px 0;display:inline-grid;">'+escapeClient(k)+'</span>'; }).join(' ') : 'No keys set yet.';
      }
      var sp = document.getElementById('step-place'); if (sp) sp.classList.toggle('done', placed>0);
      var sk = document.getElementById('step-play'); if (sk) sk.classList.toggle('done', playing);
      var sc = document.getElementById('step-connect');
      if (sc) { try { sc.classList.toggle('done', (document.getElementById('conn-dot')||{}).className.indexOf('ok')!==-1); } catch(e){} }
      var sensLabel = document.getElementById('km-mouse-sensitivity');
      if (sensLabel) {
        var rv = Number((document.getElementById('km-mouse-range')||{}).value);
        if (!Number.isFinite(rv)) rv = 1.44;
        sensLabel.textContent = rv < 0.8 ? 'Slow' : (rv <= 2.2 ? 'Normal' : 'Fast');
      }
    } catch (e) {}
  }
  function updateMappingStatusUi() {
    var st = document.getElementById('mapping-status');
    var btnOld = document.getElementById('mapping-start');
    if (st) {
      st.textContent = mappingActive ? 'Mapping ON — keys and mouse are live' : 'Mapping OFF — press Start playing to play';
      st.className = 'pill ' + (mappingActive ? 'ok' : 'bad');
    }
    uiSyncMode();
  }
  function scheduleMappingUpdate(reason) {
    if (!mappingActive) return;
    if (mappingUpdateTimer) clearTimeout(mappingUpdateTimer);
    mappingUpdateTimer = setTimeout(function () {
      mappingUpdateTimer = null;
      if (!mappingActive) return;
      try {
        queuedApi(Object.assign({ op: 'mapping-update' }, mapSettings())).then(function () {
          setMappingHint('Settings applied live (' + (reason || 'mouse/settings') + ').', false, 1500);
        }).catch(function (e) { report(e); });
      } catch (e) { report(e); }
    }, 200);
  }
  function getAimTarget() {
    return importedHudTargets.find(function (t) { return t && (t.action === 'aim' || t.kmType === 'aim'); }) || null;
  }
  function getScopeTarget() {
    return importedHudTargets.find(function (t) { return t && (t.action === 'scope' || t.kmType === 'scope'); }) || null;
  }
  function ensureAimTarget() {
    var t = getAimTarget();
    if (t) { normalizeAimTarget(t); return t; }
    t = defaultAimControl('aim', 0.5, 0.5, importedHudTargets.length);
    importedHudTargets.push(t);
    syncTapBindingsFromTargets();
    return t;
  }
  function setMouseSettingsStatus(text, isError) {
    var el = document.getElementById('mouse-settings-status');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'inspector-status' + (isError ? ' error' : '');
  }
  function fmtPct(frac) {
    var n = Number(frac) * 100;
    if (!Number.isFinite(n)) n = 0;
    n = Math.max(0, Math.min(100, n));
    return n.toFixed(2);
  }
  function parsePctInput(id, oldFrac) {
    var el = document.getElementById(id);
    if (!el) return { ok: false, value: oldFrac };
    var raw = String(el.value).trim();
    var n = Number(raw);
    if (raw === '' || !Number.isFinite(n) || n < 0 || n > 100) {
      setMouseSettingsStatus('X must be 0 to 100', true);
      el.value = fmtPct(oldFrac);
      return { ok: false, value: oldFrac };
    }
    return { ok: true, value: Math.max(0, Math.min(1, n / 100)) };
  }
  function syncMouseSettingsUi() {
    var aim = getAimTarget();
    if (aim) normalizeAimTarget(aim);
    var scope = getScopeTarget();
    var ax = document.getElementById('mouse-aim-x'), ay = document.getElementById('mouse-aim-y');
    var fx = document.getElementById('mouse-fire-x'), fy = document.getElementById('mouse-fire-y');
    var sx = document.getElementById('mouse-scope-x'), sy = document.getElementById('mouse-scope-y');
    var msx = document.getElementById('mouse-sens-x'), msy = document.getElementById('mouse-sens-y');
    var range = document.getElementById('km-mouse-range');
    var avg = document.getElementById('km-mouse-sensitivity');
    if (aim) {
      if (ax && document.activeElement !== ax) ax.value = fmtPct(aim.x);
      if (ay && document.activeElement !== ay) ay.value = fmtPct(aim.y);
      if (fx && document.activeElement !== fx) fx.value = fmtPct(aim.fireX !== undefined ? aim.fireX : aim.x2);
      if (fy && document.activeElement !== fy) fy.value = fmtPct(aim.fireY !== undefined ? aim.fireY : aim.y2);
      var sensX = Number(aim.sensitivityX); var sensY = Number(aim.sensitivityY);
      if (!Number.isFinite(sensX)) sensX = 1.42; if (!Number.isFinite(sensY)) sensY = 1.46;
      if (msx && document.activeElement !== msx) msx.value = sensX.toFixed(2);
      if (msy && document.activeElement !== msy) msy.value = sensY.toFixed(2);
      var a = (sensX + sensY) / 2;
      if (range && document.activeElement !== range) range.value = String(Math.max(0.1, Math.min(10, Number(a.toFixed(2)))));
      if (avg) avg.textContent = String(Number(a.toFixed(2)));
    } else {
      if (ax && document.activeElement !== ax) ax.value = '50.00';
      if (ay && document.activeElement !== ay) ay.value = '50.00';
      if (fx && document.activeElement !== fx) fx.value = '75.26';
      if (fy && document.activeElement !== fy) fy.value = '72.81';
      if (msx && document.activeElement !== msx) msx.value = '1.42';
      if (msy && document.activeElement !== msy) msy.value = '1.46';
      if (range && document.activeElement !== range) range.value = '1.44';
      if (avg) avg.textContent = '1.44';
    }
    if (scope) {
      if (sx && document.activeElement !== sx) sx.value = fmtPct(scope.x);
      if (sy && document.activeElement !== sy) sy.value = fmtPct(scope.y);
    } else {
      if (sx && document.activeElement !== sx) sx.value = '85.00';
      if (sy && document.activeElement !== sy) sy.value = '65.00';
    }
  }
  function applyMouseFieldChange(reason) {
    syncTapBindingsFromTargets();
    saveImportedBindings();
    renderHudTargets();
    if (aimModalOpenIndex >= 0 && importedHudTargets[aimModalOpenIndex]) renderAimModal(importedHudTargets[aimModalOpenIndex]);
    syncMouseSettingsUi();
    setMouseSettingsStatus('', false);
    scheduleMappingUpdate(reason || 'mouse settings');
  }
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
  var pendingControlType = null;
  var movingHudTarget = null;
  var selectedHudTarget = -1;
  var inspectorKeyCapture = false;
  var inspectorOldKey = null;
  var aimModalOpenIndex = -1;
  var aimPanelCapture = null; // {field, oldKey}
  var aimPlacementMode = null; // 'fire' | 'look'
  var aimEditIndex = -1;
  var screenWakeState = ${screenWake ? JSON.stringify(screenWake) : "null"};
  var videoConnected = false;
  var videoFramesReceived = 0;
  var lastVideoFrameAt = null;
  var codecConfigured = false;
  var keyframeReceived = false;
  var lastVideoError = null;

  var VIDEO_TIMEOUT_MS = 3000;
  var INITIAL_SCREEN_LOCKED = ${locked ? 'true' : 'false'};
  var screenLocked = INITIAL_SCREEN_LOCKED;
  var screenWakeState = ${JSON.stringify(screenWake || null)};
  var videoFailed = false;
  var firstFrameSeen = false;
  var lastVideoActivityAt = 0;
  var decodedFrames = 0;
  var videoStartAt = 0;
  var activeVideoAbort = null;
  var midSessionWatchdog = null;
  var startWatchdog = null;

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
    document.getElementById('device-pill').textContent = '${escapeHtml(model || 'unknown')} ï¿½ ' + W + 'ï¿½' + H;
    updateProfileOrientation();
  }

  function updateProfileOrientation() {
    var landscapeRequired = importedTapBindings.length > 0 && W <= H;
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

  function kmTypeLabel(type) {
    var labels = { tap: 'Tap spot', repeat: 'Repeated tap', dpad: 'D-pad', aim: 'Aim, pan and shoot', freelook: 'Free look', script: 'Script', swipe: 'Swipe', zoom: 'Zoom', tilt: 'Tilt', mobadpad: 'MOBA D-pad', mobaskill: 'MOBA skill pad', rotate: 'Rotate', edgescroll: 'Edge scroll', scroll: 'Scroll', mousewheel: 'Mouse wheel' };
    return labels[type] || type || 'Control';
  }
  function renderHudTargets() {
    stage.querySelectorAll('.hud-target').forEach(function (node) { node.remove(); });
    importedHudTargets.forEach(function (target, index) {
      normalizeAimTarget(target);
      var node = document.createElement('div');
      node.className = 'hud-target dynamic' + (index === selectedHudTarget ? ' selected' : '');
      node.dataset.targetIndex = String(index);
      node.style.left = ((target.x || 0) * 100) + '%';
      node.style.top = ((target.y || 0) * 100) + '%';
      var isPlaceholder = !target.key || /^km:/.test(target.key);
      var keyLabel = isPlaceholder ? 'Set key' : displayKey(target.key);
      var actionLabel = target.actionLabel || kmTypeLabel(target.action || target.kmType || 'tap');
      node.innerHTML = '<div class="cap">' + escapeClient(keyLabel) + '</div><div class="lbl">' + escapeClient(actionLabel) + '</div><i></i><b>' + escapeClient(actionLabel) + '</b><b>' + escapeClient(keyLabel) + '</b>';
      node.title = actionLabel + (isPlaceholder ? ' — click and press a key to assign' : ' (' + keyLabel + ') — drag to move, click to select');
      node.addEventListener('click', function (evt) {
        evt.preventDefault();
        evt.stopPropagation();
      });
      node.addEventListener('dblclick', function (evt) {
        evt.preventDefault();
        evt.stopPropagation();
        selectedHudTarget = index;
        renderHudTargets();
        if (target.action === 'aim' || target.kmType === 'aim') openAimModal(index);
      });
      stage.appendChild(node);
    });
    stage.classList.toggle('layout-editing', layoutEditMode);
    stage.classList.toggle('placing-control', placingNewControl || !!aimPlacementMode);
    var countEl = document.getElementById('km-tap-count');
    var boundCount = importedHudTargets.filter(function (t) { return t.key && !/^km:/.test(t.key); }).length;
    if (countEl) countEl.textContent = String(importedHudTargets.length);
    var keyCountEl = document.getElementById('km-key-count');
    if (keyCountEl) keyCountEl.textContent = String(boundCount);
    var info = document.getElementById('km-selected-info');
    if (info) {
      if (placingNewControl) info.textContent = 'Click the phone screen to place controlï¿½';
      else if (aimPlacementMode === 'fire') info.textContent = 'Click the phone screen to place fire positionâ€¦';
      else if (aimPlacementMode === 'look') info.textContent = 'Click the phone screen to place free look positionâ€¦';
      else if (aimPlacementMode === 'aim-anchor-mouse') info.textContent = 'Click the phone screen to place Aim anchorâ€¦';
      else if (aimPlacementMode === 'scope-mouse') info.textContent = 'Click the phone screen to place Scope positionâ€¦';
      else if (selectedHudTarget >= 0 && importedHudTargets[selectedHudTarget]) {
        var t = importedHudTargets[selectedHudTarget];
        var k = t.key && !/^km:/.test(t.key) ? displayKey(t.key) : 'unassigned';
        info.textContent = (t.actionLabel || kmTypeLabel(t.action)) + ' ï¿½ key: ' + k + ' (click Key/press a key to set, drag to move)';
      } else info.textContent = importedHudTargets.length ? 'Select a control to assign key/move/delete' : 'Click or drag a control to place it';
    }
    var del = document.getElementById('layout-delete');
    if (del) del.disabled = !(selectedHudTarget >= 0);
    var editBtn = document.getElementById('layout-edit-toggle');
    if (editBtn) { editBtn.textContent = layoutEditMode ? 'Done editing' : 'Edit layout'; editBtn.classList.toggle('active', layoutEditMode); }
    updateMappingStatusUi();
    renderAddControlInspector();
    updateAimCrosshair();
  }
  function escapeClient(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] || ch;
    });
  }

  function allowedProfileKey(key) {
    return typeof key === 'string' && key.length > 0 && key !== 'escape';
  }

  function refreshLayoutSelection() {
    stage.querySelectorAll('.hud-target').forEach(function (node) {
      node.classList.toggle('selected', Number(node.dataset.targetIndex) === selectedHudTarget);
    });
    renderHudTargets();
  }

  function updateHudTargetPosition(target, x, y) {
    target.x = x;
    target.y = y;
    if ((target.action === 'aim' || target.kmType === 'aim')) normalizeAimTarget(target);
    if (Number.isInteger(target.tapIndex) && importedTapBindings[target.tapIndex]) {
      importedTapBindings[target.tapIndex].x = x;
      importedTapBindings[target.tapIndex].y = y;
    }
    syncTapBindingsFromTargets();
    var node = stage.querySelector('.hud-target[data-target-index="' + selectedHudTarget + '"]');
    if (node) { node.style.left = (x * 100) + '%'; node.style.top = (y * 100) + '%'; }
    updateAimCrosshair();
    syncMouseSettingsUi();
  }
  function setLayoutStatus(text) {
    var status = document.getElementById('layout-status');
    if (status) status.textContent = text || '';
  }

  function defaultAimControl(type, px, py, tapIndex) {
    var t = {
      key: 'km:' + type + ':' + Date.now() + ':' + tapIndex,
      label: kmTypeLabel(type),
      action: type,
      kmType: type,
      actionLabel: kmTypeLabel(type),
      x: px,
      y: py,
      tapIndex: tapIndex
    };
    if (type === 'aim') {
      t.x = 0.8373; t.y = 0.614;
      t.startStopKey = 'alt';
      t.suspendKey = 'x';
      t.sensitivityX = 1.42;
      t.sensitivityY = 1.46;
      t.sensitivity = 1.46;
      t.tweaks = 16450;
      t.mouseAcceleration = false;
      t.crosshairEnabled = true;
      t.crosshairStyle = 'Cross';
      t.crosshairSize = 2;
      t.crosshairOpacity = 100;
      t.crosshairColor = '#AA0000';
      t.fireWithLeftClick = true;
      t.fireAction = 'LEFT CLICK';
      t.fireX = 0.7526; t.fireY = 0.7281;
      t.x2 = t.fireX; t.y2 = t.fireY;
      t.lookAroundEnabled = false;
      t.freeLookX = -1; t.freeLookY = -1;
    }
    return t;
  }

  function syncTapBindingsFromTargets() {
    importedTapBindings = importedHudTargets.map(function (t) {
      var b = { key: t.key, x: t.x, y: t.y, action: t.action || t.kmType || 'tap' };
      if ((t.action || t.kmType) === 'aim') {
        b.x2 = t.x2 !== undefined ? t.x2 : (t.fireX !== undefined ? t.fireX : 0.7526);
        b.y2 = t.y2 !== undefined ? t.y2 : (t.fireY !== undefined ? t.fireY : 0.7281);
        b.startStopKey = t.startStopKey || 'alt';
        b.suspendKey = t.suspendKey || 'x';
        var fb = t.sensitivity !== undefined ? Number(t.sensitivity) : undefined;
        b.sensitivityX = t.sensitivityX !== undefined ? Number(t.sensitivityX) : (Number.isFinite(fb) ? fb : 1.42);
        b.sensitivityY = t.sensitivityY !== undefined ? Number(t.sensitivityY) : (Number.isFinite(fb) ? fb : 1.46);
        b.sensitivity = b.sensitivityY;
        b.tweaks = t.tweaks !== undefined ? Number(t.tweaks) : 16450;
        b.mouseAcceleration = t.mouseAcceleration === true;
        b.crosshairEnabled = t.crosshairEnabled !== false;
        b.crosshairStyle = t.crosshairStyle || 'Cross';
        b.crosshairSize = t.crosshairSize !== undefined ? Number(t.crosshairSize) : 2;
        b.crosshairOpacity = t.crosshairOpacity !== undefined ? Number(t.crosshairOpacity) : 100;
        b.crosshairColor = t.crosshairColor || '#AA0000';
        b.fireWithLeftClick = t.fireWithLeftClick !== false;
        b.fireAction = t.fireAction || 'LEFT CLICK';
        b.fireX = b.x2; b.fireY = b.y2;
        b.lookAroundEnabled = t.lookAroundEnabled === true;
        b.freeLookX = t.freeLookX !== undefined ? Number(t.freeLookX) : -1;
        b.freeLookY = t.freeLookY !== undefined ? Number(t.freeLookY) : -1;
      }
      return b;
    });
    importedHudTargets.forEach(function (t, i) { t.tapIndex = i; });
  }

  function normalizeAimTarget(t) {
    if (!t || (t.action !== 'aim' && t.kmType !== 'aim')) return t;
    t.action = 'aim'; t.kmType = 'aim'; t.actionLabel = t.actionLabel || 'Aim';
    if (typeof t.x !== 'number') t.x = 0.8373;
    if (typeof t.y !== 'number') t.y = 0.614;
    if (t.startStopKey === undefined) t.startStopKey = 'alt';
    if (t.suspendKey === undefined) t.suspendKey = 'x';
    var fb = t.sensitivity !== undefined ? Number(t.sensitivity) : undefined;
    if (t.sensitivityX === undefined) t.sensitivityX = Number.isFinite(fb) ? fb : 1.42;
    if (t.sensitivityY === undefined) t.sensitivityY = Number.isFinite(fb) ? fb : 1.46;
    if (!Number.isFinite(Number(t.sensitivityX))) t.sensitivityX = 1.42;
    if (!Number.isFinite(Number(t.sensitivityY))) t.sensitivityY = 1.46;
    t.sensitivityX = Number(t.sensitivityX); t.sensitivityY = Number(t.sensitivityY);
    t.sensitivity = t.sensitivityY;
    if (t.tweaks === undefined) t.tweaks = 16450; t.tweaks = Number(t.tweaks);
    if (t.mouseAcceleration === undefined) t.mouseAcceleration = false; t.mouseAcceleration = t.mouseAcceleration === true;
    if (t.crosshairEnabled === undefined) t.crosshairEnabled = true;
    if (t.crosshairStyle === undefined) t.crosshairStyle = 'Cross';
    if (t.crosshairSize === undefined) t.crosshairSize = 2; t.crosshairSize = Number(t.crosshairSize);
    if (t.crosshairOpacity === undefined) t.crosshairOpacity = 100; t.crosshairOpacity = Number(t.crosshairOpacity);
    if (t.crosshairColor === undefined) t.crosshairColor = '#AA0000';
    if (t.fireWithLeftClick === undefined) t.fireWithLeftClick = true;
    if (t.fireAction === undefined) t.fireAction = 'LEFT CLICK';
    if (t.fireX === undefined) t.fireX = (t.x2 !== undefined ? Number(t.x2) : 0.7526);
    if (t.fireY === undefined) t.fireY = (t.y2 !== undefined ? Number(t.y2) : 0.7281);
    t.fireX = Number(t.fireX); t.fireY = Number(t.fireY); t.x2 = t.fireX; t.y2 = t.fireY;
    if (t.lookAroundEnabled === undefined) t.lookAroundEnabled = false;
    if (t.freeLookX === undefined) t.freeLookX = -1;
    if (t.freeLookY === undefined) t.freeLookY = -1;
    t.freeLookX = Number(t.freeLookX); t.freeLookY = Number(t.freeLookY);
    return t;
  }

  function setInspectorStatus(text, isError) {
    var el = document.getElementById('inspector-status');
    if (el) { el.textContent = text || ''; el.className = 'inspector-status' + (isError ? ' error' : ''); }
  }

  function renderAddControlInspector() {
    var t = selectedHudTarget >= 0 ? importedHudTargets[selectedHudTarget] : null;
    if (t) normalizeAimTarget(t);
    var typeEl = document.getElementById('inspector-type');
    var keyEl = document.getElementById('inspector-key');
    var hintEl = document.getElementById('inspector-key-hint');
    var aimBtn = document.getElementById('inspector-aim-settings');
    if (typeEl) typeEl.textContent = t ? (t.actionLabel || kmTypeLabel(t.action || t.kmType)) : 'ï¿½';
    if (aimBtn) aimBtn.style.display = (t && (t.action === 'aim' || t.kmType === 'aim')) ? '' : 'none';
    if (!keyEl) return;
    keyEl.classList.toggle('capturing', !!inspectorKeyCapture);
    if (inspectorKeyCapture && t) {
      keyEl.value = 'Press a keyï¿½';
      if (hintEl) hintEl.textContent = '(Backspace clears, Esc cancels)';
    } else if (t) {
      var hasKey = t.key && !/^km:/.test(t.key);
      keyEl.value = hasKey ? displayKey(t.key) : '';
      keyEl.placeholder = 'Click to set key';
      if (hintEl) hintEl.textContent = hasKey ? '(Click to change)' : '(Click to set)';
    } else {
      keyEl.value = '';
      keyEl.placeholder = 'Click to set key';
      if (hintEl) hintEl.textContent = '';
    }
  }

  function placeControlAt(px, py, kmType) {
    var type = kmType || pendingControlType || 'tap';
    if (aimPlacementMode === 'aim-anchor-mouse') {
      var aimA = ensureAimTarget();
      normalizeAimTarget(aimA);
      aimA.x = px; aimA.y = py;
      aimPlacementMode = null;
      pendingControlType = null;
      placingNewControl = false;
      applyMouseFieldChange('aim anchor');
      setMouseSettingsStatus('Aim anchor placed.', false);
      setLayoutStatus('Aim anchor updated.');
      return;
    }
    if (aimPlacementMode === 'scope-mouse') {
      var st = getScopeTarget();
      if (!st) {
        st = { key: 'km:scope:' + Date.now() + ':' + importedHudTargets.length, x: px, y: py, action: 'scope', kmType: 'scope', actionLabel: kmTypeLabel('scope'), tapIndex: importedHudTargets.length };
        importedHudTargets.push(st);
      } else {
        st.x = px; st.y = py;
      }
      syncTapBindingsFromTargets();
      aimPlacementMode = null;
      pendingControlType = null;
      placingNewControl = false;
      applyMouseFieldChange('scope position');
      setMouseSettingsStatus('Scope position placed.', false);
      setLayoutStatus('Scope position updated.');
      return;
    }
    if (aimPlacementMode && (aimPlacementMode === 'fire' || aimPlacementMode === 'look')) {
      var aimT = getAimTarget();
      if (aimT) {
        normalizeAimTarget(aimT);
        if (aimPlacementMode === 'fire') {
          aimT.fireX = px; aimT.fireY = py; aimT.x2 = px; aimT.y2 = py;
        } else if (aimPlacementMode === 'look') {
          aimT.freeLookX = px * 100; aimT.freeLookY = py * 100;
        }
        var mode = aimPlacementMode;
        aimPlacementMode = null;
        pendingControlType = null;
        placingNewControl = false;
        document.querySelectorAll('.aim-place-btn.armed').forEach(function (b) { b.classList.remove('armed'); });
        applyMouseFieldChange(mode === 'fire' ? 'fire position' : 'free look');
        setInspectorStatus(mode === 'fire' ? 'Fire position set. Changes will be saved automatically.' : 'Free look position set. Changes will be saved automatically.');
        setLayoutStatus(mode === 'fire' ? 'Fire position updated.' : 'Free look position updated.');
        return;
      }
    }
    var tapIndex = importedHudTargets.length;
    var t = defaultAimControl(type, px, py, tapIndex);
    importedHudTargets.push(t);
    syncTapBindingsFromTargets();
    selectedHudTarget = importedHudTargets.length - 1;
    placingNewControl = false;
    pendingControlType = null;
    inspectorKeyCapture = false;
    inspectorOldKey = null;
    document.querySelectorAll('.km-tile.placing').forEach(function (n) { n.classList.remove('placing'); });
    renderHudTargets();
    saveImportedBindings();
    setInspectorStatus('');
    setLayoutStatus('Placed ' + kmTypeLabel(type) + ' ï¿½ click Key or press a key to assign it.');
    renderAddControlInspector();
    if (!mappingActive) { inspectorOldKey = t.key; inspectorKeyCapture = true; renderAddControlInspector(); try { document.getElementById('inspector-key').focus(); } catch (e) {} }
    updateAimCrosshair();
  }

  function updateAimCrosshair() {
    var el = document.getElementById('aim-crosshair');
    if (!el) return;
    var aim = null;
    for (var i = 0; i < importedHudTargets.length; i++) {
      if (importedHudTargets[i] && (importedHudTargets[i].action === 'aim' || importedHudTargets[i].kmType === 'aim')) { aim = importedHudTargets[i]; break; }
    }
    if (!aim || aim.crosshairEnabled === false) { el.style.display = 'none'; return; }
    normalizeAimTarget(aim);
    var x = Math.max(0, Math.min(100, Number(aim.x) * 100));
    var y = Math.max(0, Math.min(100, Number(aim.y) * 100));
    var size = Math.max(1, Math.min(10, Number(aim.crosshairSize) || 2));
    var opacity = Math.max(0, Math.min(100, Number(aim.crosshairOpacity)));
    if (!Number.isFinite(opacity)) opacity = 100;
    var color = String(aim.crosshairColor || '#AA0000');
    var style = String(aim.crosshairStyle || 'Cross');
    var px = 8 + size * 4;
    el.style.display = 'block';
    el.style.left = x + '%';
    el.style.top = y + '%';
    el.style.width = px + 'px';
    el.style.height = px + 'px';
    el.style.opacity = String(opacity / 100);
    if (style === 'Dot') {
      var d = Math.max(4, size * 3);
      el.innerHTML = '<div style="width:' + d + 'px;height:' + d + 'px;border-radius:50%;background:' + escapeClient(color) + ';margin:' + ((px - d) / 2) + 'px auto;"></div>';
    } else if (style === 'Circle') {
      el.innerHTML = '<div style="width:' + px + 'px;height:' + px + 'px;border-radius:50%;border:2px solid ' + escapeClient(color) + ';box-sizing:border-box;"></div>';
    } else {
      var tpx = Math.max(2, Math.round(size));
      el.innerHTML = '<div style="position:absolute;left:50%;top:0;width:' + tpx + 'px;height:100%;transform:translateX(-50%);background:' + escapeClient(color) + ';"></div><div style="position:absolute;top:50%;left:0;height:' + tpx + 'px;width:100%;transform:translateY(-50%);background:' + escapeClient(color) + ';"></div>';
    }
  }

  function openAimModal(index) {
    if (index < 0 || !importedHudTargets[index]) return;
    var t = importedHudTargets[index];
    if (t.action !== 'aim' && t.kmType !== 'aim') return;
    aimModalOpenIndex = index;
    aimEditIndex = index;
    selectedHudTarget = index;
    renderAimModal(t);
    var backdrop = document.getElementById('aim-modal-backdrop');
    if (backdrop) { backdrop.classList.add('open'); backdrop.setAttribute('aria-hidden', 'false'); }
  }

  function closeAimModal() {
    aimModalOpenIndex = -1;
    aimEditIndex = -1;
    aimPanelCapture = null;
    aimPlacementMode = null;
    document.querySelectorAll('.aim-place-btn.armed, #mouse-place-aim.armed, #mouse-place-fire.armed, #mouse-place-scope.armed').forEach(function (b) { b.classList.remove('armed'); });
    var backdrop = document.getElementById('aim-modal-backdrop');
    if (backdrop) { backdrop.classList.remove('open'); backdrop.setAttribute('aria-hidden', 'true'); }
    renderHudTargets();
  }

  function renderAimModal(t) {
    if (!t) return;
    normalizeAimTarget(t);
    var setVal = function (id, v) { var el = document.getElementById(id); if (el) el.value = v; };
    setVal('aim-start-stop', displayKey(t.startStopKey || 'alt'));
    setVal('aim-suspend', displayKey(t.suspendKey || 'x'));
    setVal('aim-x', (Number(t.x) * 100).toFixed(2));
    setVal('aim-y', (Number(t.y) * 100).toFixed(2));
    setVal('aim-sens-x', Number(t.sensitivityX).toFixed(2));
    setVal('aim-sens-y', Number(t.sensitivityY).toFixed(2));
    setVal('aim-tweaks', Number(t.tweaks));
    var accel = document.getElementById('aim-accel'); if (accel) accel.value = t.mouseAcceleration ? 'true' : 'false';
    var chT = document.getElementById('aim-crosshair-toggle'); if (chT) { chT.classList.toggle('on', t.crosshairEnabled !== false); chT.setAttribute('aria-checked', t.crosshairEnabled !== false ? 'true' : 'false'); }
    setVal('aim-crosshair-style', t.crosshairStyle || 'Cross');
    setVal('aim-crosshair-size', Number(t.crosshairSize) || 2);
    setVal('aim-crosshair-opacity', Number(t.crosshairOpacity));
    setVal('aim-crosshair-color', String(t.crosshairColor || '#AA0000').toUpperCase());
    var cp = document.getElementById('aim-crosshair-color-picker'); if (cp) try { cp.value = String(t.crosshairColor || '#AA0000'); } catch (e) {}
    var fireT = document.getElementById('aim-fire-toggle'); if (fireT) { fireT.classList.toggle('on', t.fireWithLeftClick !== false); fireT.setAttribute('aria-checked', t.fireWithLeftClick !== false ? 'true' : 'false'); }
    setVal('aim-fire-x', (Number(t.fireX) * 100).toFixed(2));
    setVal('aim-fire-y', (Number(t.fireY) * 100).toFixed(2));
    setVal('aim-fire-action', t.fireAction || 'LEFT CLICK');
    var lookT = document.getElementById('aim-look-toggle'); if (lookT) { lookT.classList.toggle('on', t.lookAroundEnabled === true); lookT.setAttribute('aria-checked', t.lookAroundEnabled === true ? 'true' : 'false'); }
    setVal('aim-look-x', t.freeLookX !== undefined ? String(t.freeLookX) : '-1');
    setVal('aim-look-y', t.freeLookY !== undefined ? String(t.freeLookY) : '-1');
    var st = document.getElementById('aim-panel-status'); if (st) { st.textContent = 'Changes will be saved automatically'; st.className = 'inspector-status'; }
    syncMouseSettingsUi();
  }


  function pct2(v, max) {
    var n = (Number(v) / Math.max(1, Number(max) || 1)) * 100;
    if (!Number.isFinite(n)) n = 0;
    return n.toFixed(2);
  }
  function showTapRipple(point) {
    try {
      var devW = point.devW || W, devH = point.devH || H;
      var r = document.createElement('div');
      r.className = 'tap-ripple';
      r.style.left = (point.x / Math.max(1, devW) * 100) + '%';
      r.style.top = (point.y / Math.max(1, devH) * 100) + '%';
      stage.appendChild(r);
      setTimeout(function () { try { r.remove(); } catch (e) {} }, 480);
    } catch (e) {}
  }
  function setTapStatus(text, isError) {
    try {
      var ids = ['tap-status', 'layout-status', 'mapping-hint', 'mouse-settings-status'];
      for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById(ids[i]);
        if (!el) continue;
        el.textContent = text || '';
        if (isError) {
          if (el.className && el.className.indexOf('inspector-status') !== -1) el.className = 'inspector-status error';
          else el.style.color = '#f97066';
        } else {
          if (el.className && el.className.indexOf('inspector-status') !== -1 && ids[i] !== 'mapping-hint') el.className = 'inspector-status';
          else el.style.color = '';
        }
      }
      var bb = document.getElementById('bottom-status');
      if (bb && text) bb.textContent = text;
      try { console.log('[tap-status]', isError ? 'ERR' : 'OK', text); } catch (e) {}
    } catch (e) {}
  }
  function stopDrag() { try { stopTapDrag(); } catch (e) { dragging = false; tapDrag = null; pendingMove = null; } }

  // Single stage pointer handler: (a) place armed control, (b) marker edit in layout mode, (c) layout miss deselect, (d) tap
  var tapDrag = null; // { pointerId, downPoint, moved }
  var lastTapInfo = null;
  stage.addEventListener('pointerdown', function (evt) {
    try {
      // (a) armed placement
      if (placingNewControl) {
        evt.preventDefault();
        evt.stopImmediatePropagation();
        var pType = pendingControlType || 'tap';
        var position = toDevice(evt);
        placeControlAt(position.x / Math.max(1, W), position.y / Math.max(1, H), pType);
        try { setTapStatus('Placed ' + kmTypeLabel(pType) + ' â€” press a key to assign it. No tap sent.'); } catch (e) {}
        return;
      }
      // (b) marker select/move in setup mode (drag to reposition, click to select for key assign)
      var targetNode = evt.target.closest && evt.target.closest('.hud-target');
      if (targetNode && !mappingActive) {
        evt.preventDefault();
        evt.stopImmediatePropagation();
        selectedHudTarget = Number(targetNode.dataset.targetIndex);
        var startPoint = toDevice(evt);
        movingHudTarget = { pointerId: evt.pointerId, index: selectedHudTarget, startX: startPoint.x, startY: startPoint.y, moved: false };
        try { stage.setPointerCapture(evt.pointerId); } catch (e) {}
        renderHudTargets();
        try { setLayoutStatus('Selected ' + ((importedHudTargets[selectedHudTarget] || {}).actionLabel || 'control') + ' — press a key to assign it, or drag to move.'); } catch (e) {}
        try { setTapStatus('Control selected. Press a key to assign it, or drag to move it.', false); } catch(e){}
        return;
      }
      // (c) setup/edit miss: deselect and fall through to tap (do not swallow)
      if ((layoutEditMode || !mappingActive) && !targetNode && selectedHudTarget !== -1 && !placingNewControl) {
        if (selectedHudTarget !== -1) {
          selectedHudTarget = -1;
          try { renderHudTargets(); } catch (e) {}
        }
        try { setLayoutStatus('Edit layout: no marker selected â€” sending tap.'); } catch (e) {}
        // fall through to (d)
      }

      // (d) ALWAYS send tap at clicked device coordinates
      // Explicit mapping+pointer-lock behavior: left click fires at fixed fire point (not clicked point)
      var point = toDevice(evt);
      try { console.log('[tap] stage pointerdown', { clientX: evt.clientX, clientY: evt.clientY, deviceX: point.x, deviceY: point.y, devW: point.devW, devH: point.devH, mappingActive: mappingActive, pointerLocked: document.pointerLockElement === stage, placingNewControl: !!placingNewControl, layoutEditMode: !!layoutEditMode }); } catch (e) {}

      if (mappingActive && document.pointerLockElement === stage && evt.button === 0) {
        // fire handled by document mousedown/button-down path -> fixed fire point; make explicit
        evt.preventDefault();
        try {
          var st = (typeof mapSettings === 'function') ? mapSettings() : null;
          var fx = st ? (st.shootX != null ? st.shootX : (st.fireX != null ? st.fireX : 0.7526)) : 0.7526;
          var fy = st ? (st.shootY != null ? st.shootY : (st.fireY != null ? st.fireY : 0.7281)) : 0.7281;
          setTapStatus('Mapping ON + mouse captured: left click fires at fixed fire point ' + (Number(fx)*100).toFixed(2) + '%, ' + (Number(fy)*100).toFixed(2) + '% (not at clicked point). Click screen with mapping off to tap anywhere.', false);
        } catch (e) {
          try { setTapStatus('Mapping ON + mouse captured: left click fires at fixed fire point (not at clicked point).', false); } catch (e2) {}
        }
        return;
      }

      evt.preventDefault();
      evt.stopImmediatePropagation();
      // cancel any in-flight tap drag
      if (tapDrag) {
        try { api('/api/input', { op: 'up', name: 'A', x: tapDrag.downPoint.x, y: tapDrag.downPoint.y }).catch(function(){}); } catch (e) {}
        tapDrag = null;
      }
      tapDrag = { pointerId: evt.pointerId, downPoint: point, moved: false };
      dragging = true;
      try { stage.setPointerCapture(evt.pointerId); } catch (e) {}
      lastTapInfo = { x: point.x, y: point.y, px: pct2(point.x, point.devW || W), py: pct2(point.y, point.devH || H) };
      showTapRipple(point);
      setTapStatus('Tapping at ' + lastTapInfo.px + '%, ' + lastTapInfo.py + '% (device ' + point.x + ',' + point.y + ')â€¦');
      try { console.log('[tap] down request', { op: 'down', name: 'A', x: point.x, y: point.y }); } catch (e) {}
      api('/api/input', { op: 'down', name: 'A', x: point.x, y: point.y })
        .then(function (res) {
          try {
            var msgCount = res && (res.totalMessages != null ? res.totalMessages : (res.pointers && res.pointers.totalMessages != null ? res.pointers.totalMessages : null));
            var suffix = (msgCount != null ? (' â€” messages sent: ' + msgCount) : '');
            setTapStatus('Tapped at ' + lastTapInfo.px + '%, ' + lastTapInfo.py + '%' + suffix);
          } catch (e) {}
          try { console.log('[tap] down ok', res); } catch (e) {}
        })
        .catch(function (err) {
          var em = (err && err.message) ? err.message : String(err);
          setTapStatus('Tap failed (down): ' + em, true);
          try { console.error('[tap] down failed', err); } catch (e) {}
          try { report(err); } catch (e) {}
        });
    } catch (e) {
      try { setTapStatus('Tap handler error: ' + (e && e.message ? e.message : e), true); } catch (e2) {}
      try { console.error('[tap] pointerdown error', e); } catch (e2) {}
    }
  }, true);

  stage.addEventListener('pointermove', function (evt) {
    try {
      if (movingHudTarget && movingHudTarget.pointerId === evt.pointerId) {
        evt.preventDefault();
        evt.stopImmediatePropagation();
        var point = toDevice(evt);
        var dx = Math.abs(point.x - (movingHudTarget.startX || 0));
        var dy = Math.abs(point.y - (movingHudTarget.startY || 0));
        if (dx + dy > 3) movingHudTarget.moved = true;
        var target = importedHudTargets[movingHudTarget.index];
        if (target) updateHudTargetPosition(target, point.x / Math.max(1,W), point.y / Math.max(1,H));
        return;
      }
      if (tapDrag && tapDrag.pointerId === evt.pointerId) {
        evt.preventDefault();
        var mpt = toDevice(evt);
        tapDrag.downPoint = mpt; // track last position for up
        pendingMove = mpt;
        flushMove();
        return;
      }
      if (!dragging) { return; }
      pendingMove = toDevice(evt);
      flushMove();
    } catch (e) { try { console.error('[tap] pointermove error', e); } catch (e2) {} }
  }, true);

  function flushMove() {
    if (moveInFlight || !pendingMove) { return; }
    var point = pendingMove;
    pendingMove = null;
    moveInFlight = true;
    api('/api/input', { op: 'move', name: 'A', x: point.x, y: point.y })
      .catch(function (err) { try { console.error('[tap] move failed', err); } catch (e) {} try { report(err); } catch (e) {} })
      .then(function () { moveInFlight = false; flushMove(); });
  }

  function stopTapDrag(evt) {
    if (!tapDrag) { if (dragging) dragging = false; return; }
    if (evt && evt.pointerId != null && evt.pointerId !== tapDrag.pointerId) return;
    try {
      var point = (evt && evt.clientX !== undefined) ? toDevice(evt) : (tapDrag.downPoint || { x: 0, y: 0 });
      tapDrag = null;
      dragging = false;
      pendingMove = null;
      api('/api/input', { op: 'up', name: 'A', x: point.x, y: point.y })
        .then(function (res) {
          try { console.log('[tap] up ok', res, point); } catch (e) {}
        })
        .catch(function (err) {
          var em = (err && err.message) ? err.message : String(err);
          setTapStatus('Tap failed (up): ' + em, true);
          try { console.error('[tap] up failed', err); } catch (e) {}
          try { report(err); } catch (e) {}
        });
    } catch (e) {
      tapDrag = null; dragging = false;
      try { setTapStatus('Tap release error: ' + (e && e.message ? e.message : e), true); } catch (e2) {}
    }
  }

  function finishHudDrag(evt) {
    if (!movingHudTarget || (evt && evt.pointerId !== movingHudTarget.pointerId)) return;
    if (evt) { evt.preventDefault(); evt.stopImmediatePropagation(); }
    movingHudTarget = null;
    try { saveImportedBindings(); } catch (e) {}
    try { renderHudTargets(); } catch (e) {}
    try { syncMouseSettingsUi(); } catch (e) {}
    try { scheduleMappingUpdate('control position'); } catch (e) {}
  }
  stage.addEventListener('pointerup', function (evt) {
    if (movingHudTarget && movingHudTarget.pointerId === evt.pointerId) { finishHudDrag(evt); return; }
    stopTapDrag(evt);
  }, true);
  stage.addEventListener('pointercancel', function (evt) {
    if (movingHudTarget && movingHudTarget.pointerId === evt.pointerId) { finishHudDrag(evt); return; }
    stopTapDrag(evt);
  }, true);

  window.addEventListener('blur', function () {
    if (dragging) { stopDrag(); }
    if (mappingActive) { stopMapping(); }
  });

  document.getElementById('panic').onclick = panic;

  function mapSettings() {
    syncTapBindingsFromTargets();
    var range = document.getElementById('km-mouse-range');
    var sensXEl = document.getElementById('mouse-sens-x');
    var sensYEl = document.getElementById('mouse-sens-y');
    var sensitivityY = range ? Number(range.value) : 1;
    if (!Number.isFinite(sensitivityY)) sensitivityY = 1;
    var sensitivityX = sensXEl ? Number(sensXEl.value) : sensitivityY;
    if (!Number.isFinite(sensitivityX)) sensitivityX = sensitivityY;
    var sensitivityY2 = sensYEl ? Number(sensYEl.value) : sensitivityY;
    if (!Number.isFinite(sensitivityY2)) sensitivityY2 = sensitivityY;
    sensitivityX = Math.max(0.1, Math.min(10, sensitivityX));
    sensitivityY2 = Math.max(0.1, Math.min(10, sensitivityY2));
    var taps = importedHudTargets.filter(function (t) {
      return t && t.key && !/^km:/.test(t.key) && t.key !== 'escape';
    }).map(function (t) {
      var b = { key: t.key, x: t.x, y: t.y, action: t.action || t.kmType || 'tap' };
      if ((t.action || t.kmType) === 'aim') {
        normalizeAimTarget(t);
        b.x2 = t.x2 !== undefined ? t.x2 : t.fireX;
        b.y2 = t.y2 !== undefined ? t.y2 : t.fireY;
        b.startStopKey = t.startStopKey || 'alt';
        b.suspendKey = t.suspendKey || 'x';
        b.sensitivityX = Number(t.sensitivityX); b.sensitivityY = Number(t.sensitivityY); b.sensitivity = Number(t.sensitivityY);
        b.tweaks = t.tweaks; b.mouseAcceleration = t.mouseAcceleration === true;
        b.fireWithLeftClick = t.fireWithLeftClick !== false; b.fireAction = t.fireAction || 'LEFT CLICK';
        b.fireX = b.x2; b.fireY = b.y2;
        b.lookAroundEnabled = t.lookAroundEnabled === true; b.freeLookX = t.freeLookX; b.freeLookY = t.freeLookY;
      }
      return b;
    });
    var aim = importedHudTargets.find(function (t) { return t && (t.action === 'aim' || t.kmType === 'aim'); });
    var scopeTarget = importedHudTargets.find(function (t) { return t && (t.action === 'scope' || t.kmType === 'scope'); });
    var out = {
      joystickX: 0.2, joystickY: 0.8, joystickRadius: 0.12,
      cameraX: 0.5, cameraY: 0.5,
      shootX: 0.85, shootY: 0.8,
      scopeX: scopeTarget ? Number(scopeTarget.x) : 0.85,
      scopeY: scopeTarget ? Number(scopeTarget.y) : 0.65,
      sensitivity: sensitivityY2,
      sensitivityX: sensitivityX,
      sensitivityY: sensitivityY2,
      tweaks: 16450,
      mouseAcceleration: false,
      fireWithLeftClick: true,
      forwardKey: 'w', leftKey: 'a', backwardKey: 's', rightKey: 'd',
      fireKey: null, scopeKey: null,
      tapBindings: taps,
      cameraToggleKey: profileCameraToggleKey || null
    };
    if (aim) {
      normalizeAimTarget(aim);
      out.cameraX = Number(aim.x); out.cameraY = Number(aim.y);
      out.shootX = aim.fireX !== undefined ? Number(aim.fireX) : (aim.x2 !== undefined ? Number(aim.x2) : 0.7526);
      out.shootY = aim.fireY !== undefined ? Number(aim.fireY) : (aim.y2 !== undefined ? Number(aim.y2) : 0.7281);
      var sx = Number(aim.sensitivityX); var sy = Number(aim.sensitivityY);
      if (!Number.isFinite(sx)) sx = sensitivityX; if (!Number.isFinite(sy)) sy = sensitivityY2;
      out.sensitivityX = Math.max(0.1, Math.min(10, sx));
      out.sensitivityY = Math.max(0.1, Math.min(10, sy));
      out.sensitivity = out.sensitivityY;
      out.tweaks = aim.tweaks !== undefined ? Number(aim.tweaks) : 16450;
      out.mouseAcceleration = aim.mouseAcceleration === true;
      out.fireWithLeftClick = aim.fireWithLeftClick !== false;
      out.cameraToggleKey = aim.startStopKey || 'alt';
    }
    if (scopeTarget) {
      out.scopeX = Number(scopeTarget.x); out.scopeY = Number(scopeTarget.y);
    }
    return out;
  }
  function normalizeEventKey(key, code) {
    if (code) {
      var c = String(code);
      if (/^Key[A-Z]$/.test(c)) { return c.slice(3).toLowerCase(); }
      if (/^Digit\d$/.test(c)) { return c.slice(5); }
      if (/^Numpad\d$/.test(c)) { return 'numpad' + c.slice(6); }
      var codeMap = {
        NumpadMultiply: 'numpadmultiply', NumpadAdd: 'numpadadd', NumpadSubtract: 'numpadsubtract',
        NumpadDecimal: 'numpaddecimal', NumpadDivide: 'numpaddivide', NumpadEnter: 'numpadenter',
        ShiftLeft: 'shift', ShiftRight: 'shift', ControlLeft: 'control', ControlRight: 'control',
        AltLeft: 'alt', AltRight: 'alt', MetaLeft: 'meta', MetaRight: 'meta',
        Space: 'space', Tab: 'tab', Enter: 'enter', Escape: 'escape', Backspace: 'backspace',
        Delete: 'delete', Insert: 'insert', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown',
        ArrowUp: 'arrowup', ArrowDown: 'arrowdown', ArrowLeft: 'arrowleft', ArrowRight: 'arrowright',
        CapsLock: 'capslock', NumLock: 'numlock', ScrollLock: 'scrolllock', Pause: 'pause',
        PrintScreen: 'printscreen', ContextMenu: 'contextmenu',
        Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\\\',
        Semicolon: ';', Quote: "'", Backquote: '\u0060', Comma: ',', Period: '.', Slash: '/'
      };
      if (codeMap[c]) { return codeMap[c]; }
      if (/^F\d{1,2}$/.test(c)) { return c.toLowerCase(); }
    }
    if (!key) { return ''; }
    var raw = String(key);
    var lower = raw.toLowerCase();
    var aliases = { ' ': 'space', spacebar: 'space', ctrl: 'control', esc: 'escape', del: 'delete', os: 'meta', win: 'meta' };
    if (aliases[lower]) { return aliases[lower]; }
    if (raw === 'Dead' || raw === 'Unidentified') { return ''; }
    if (/^f\d{1,2}$/i.test(raw)) { return lower; }
    if (raw.length === 1) { return lower; }
    return lower;
  }

  function displayKey(key) {
    if (!key) { return 'Set key'; }
    var map = {
      space: 'Space', control: 'Ctrl', shift: 'Shift', alt: 'Alt', altgraph: 'AltGr', meta: 'Meta',
      tab: 'Tab', enter: 'Enter', backspace: 'Backspace', delete: 'Delete', insert: 'Insert',
      home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown',
      arrowup: '?', arrowdown: '?', arrowleft: '?', arrowright: '?',
      capslock: 'CapsLock', numlock: 'NumLock', scrolllock: 'ScrollLock', pause: 'Pause',
      printscreen: 'PrtSc', contextmenu: 'Menu', wheelup: 'WheelUp', wheeldown: 'WheelDown',
      numpad0: 'Num0', numpad1: 'Num1', numpad2: 'Num2', numpad3: 'Num3', numpad4: 'Num4',
      numpad5: 'Num5', numpad6: 'Num6', numpad7: 'Num7', numpad8: 'Num8', numpad9: 'Num9',
      numpadmultiply: 'Num*', numpadadd: 'Num+', numpadsubtract: 'Num-', numpaddecimal: 'Num.',
      numpaddivide: 'Num/', numpadenter: 'NumEnter',
      '-': '-', '=': '=', '[': '[', ']': ']', '\\\\': '\\\\', ';': ';', "'": "'", '\u0060': '\u0060', ',': ',', '.': '.', '/': '/'
    };
    if (map[key]) { return map[key]; }
    if (/^f\d{1,2}$/.test(key)) { return key.toUpperCase(); }
    if (key.length === 1) { return key.toUpperCase(); }
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  function saveImportedBindings() {
    syncTapBindingsFromTargets();
    try {
      var saved = {};
      try { saved = JSON.parse(localStorage.getItem('heaven-layout') || '{}'); } catch (e) { saved = {}; }
      saved.taps = importedTapBindings;
      saved.targets = importedHudTargets;
      saved.cameraToggleKey = profileCameraToggleKey || null;
      var sensEl = document.getElementById('km-mouse-sensitivity');
      var rangeEl = document.getElementById('km-mouse-range');
      saved.mouseSensitivity = Number((rangeEl && rangeEl.value) || (sensEl && (sensEl.value || sensEl.textContent)) || 1.0) || 1.0;
      localStorage.setItem('heaven-layout', JSON.stringify(saved));
    } catch (e) {}
    var tapCount = document.getElementById('km-tap-count');
    var keyCount = document.getElementById('km-key-count');
    if (tapCount) tapCount.textContent = String(importedHudTargets.length);
    if (keyCount) keyCount.textContent = String(importedHudTargets.filter(function (t) { return t.key && !/^km:/.test(t.key); }).length);
    updateAimCrosshair();
  }

  try {
    var savedLayout = JSON.parse(localStorage.getItem('heaven-layout') || 'null');
    if (savedLayout) {
      importedTapBindings = Array.isArray(savedLayout.taps) ? savedLayout.taps : [];
      importedHudTargets = Array.isArray(savedLayout.targets) ? savedLayout.targets : importedTapBindings.map(function (t, i) {
        var o = { x: t.x, y: t.y, key: t.key, action: t.action || t.kmType || 'tap', kmType: t.kmType || t.action || 'tap', actionLabel: kmTypeLabel(t.action || t.kmType || 'tap'), tapIndex: i };
        if (t.x2 !== undefined) o.x2 = t.x2; if (t.y2 !== undefined) o.y2 = t.y2;
        ['startStopKey','suspendKey','sensitivity','sensitivityX','sensitivityY','tweaks','mouseAcceleration','crosshairEnabled','crosshairStyle','crosshairSize','crosshairOpacity','crosshairColor','fireWithLeftClick','fireAction','fireX','fireY','lookAroundEnabled','freeLookX','freeLookY'].forEach(function(k){ if (t[k] !== undefined) o[k]=t[k]; });
        return o;
      });
      importedHudTargets.forEach(function (target, index) {
        if (!Number.isInteger(target.tapIndex)) target.tapIndex = index;
        if (!target.actionLabel) target.actionLabel = kmTypeLabel(target.action || target.kmType || 'tap');
        normalizeAimTarget(target);
      });
      syncTapBindingsFromTargets();
      profileCameraToggleKey = savedLayout.cameraToggleKey || null;
      if (savedLayout.mouseSensitivity) {
        var r = document.getElementById('km-mouse-range'); var s = document.getElementById('km-mouse-sensitivity');
        if (r) r.value = savedLayout.mouseSensitivity;
        if (s) s.textContent = String(savedLayout.mouseSensitivity);
      }
    }
  } catch (e) {}
  renderHudTargets();
  syncMouseSettingsUi();

  document.getElementById('km-keyboard').addEventListener('click', function () {
    document.getElementById('km-keyboard').classList.add('active');
    document.getElementById('km-mouse').classList.remove('active');
    document.getElementById('km-keyboard-panel').classList.add('open');
    document.getElementById('km-mouse-panel').classList.remove('open');
  });
  document.getElementById('km-mouse').addEventListener('click', function () {
    document.getElementById('km-mouse').classList.add('active');
    document.getElementById('km-keyboard').classList.remove('active');
    document.getElementById('km-mouse-panel').classList.add('open');
    document.getElementById('km-keyboard-panel').classList.remove('open');
  });
  (function () {
    var range = document.getElementById('km-mouse-range');
    if (range) {
      range.addEventListener('input', function () {
        var v = Number(this.value);
        if (!Number.isFinite(v)) v = 1;
        v = Math.max(0.1, Math.min(10, v));
        var aim = ensureAimTarget();
        normalizeAimTarget(aim);
        aim.sensitivityX = v; aim.sensitivityY = v; aim.sensitivity = v;
        var msx = document.getElementById('mouse-sens-x'), msy = document.getElementById('mouse-sens-y');
        if (msx) msx.value = v.toFixed(2);
        if (msy) msy.value = v.toFixed(2);
        var avg = document.getElementById('km-mouse-sensitivity');
        if (avg) avg.textContent = String(Number(v.toFixed(2)));
        applyMouseFieldChange('sensitivity');
      });
    }

    function wirePct(id, getter, setter, reason) {
      var el = document.getElementById(id); if (!el) return;
      var apply = function () {
        var aim = ensureAimTarget(); normalizeAimTarget(aim);
        var old = getter(aim);
        var r = parsePctInput(id, old);
        if (!r.ok) return;
        setter(aim, r.value);
        el.value = fmtPct(r.value);
        applyMouseFieldChange(reason);
      };
      el.addEventListener('change', apply);
      el.addEventListener('blur', apply);
    }
    wirePct('mouse-aim-x', function(a){return a.x;}, function(a,v){a.x=v;}, 'aim anchor');
    wirePct('mouse-aim-y', function(a){return a.y;}, function(a,v){a.y=v;}, 'aim anchor');
    wirePct('mouse-fire-x', function(a){return a.fireX !== undefined ? a.fireX : a.x2;}, function(a,v){a.fireX=v; a.x2=v;}, 'fire position');
    wirePct('mouse-fire-y', function(a){return a.fireY !== undefined ? a.fireY : a.y2;}, function(a,v){a.fireY=v; a.y2=v;}, 'fire position');

    function wireScope(id, axis) {
      var el = document.getElementById(id); if (!el) return;
      var apply = function () {
        var st = getScopeTarget();
        var old = st ? st[axis] : (axis === 'x' ? 0.85 : 0.65);
        var r = parsePctInput(id, old);
        if (!r.ok) return;
        if (!st) {
          st = { key: 'km:scope:' + Date.now() + ':' + importedHudTargets.length, x: 0.85, y: 0.65, action: 'scope', kmType: 'scope', actionLabel: kmTypeLabel('scope'), tapIndex: importedHudTargets.length };
          importedHudTargets.push(st);
          syncTapBindingsFromTargets();
        }
        st[axis] = r.value;
        el.value = fmtPct(r.value);
        applyMouseFieldChange('scope position');
      };
      el.addEventListener('change', apply);
      el.addEventListener('blur', apply);
    }
    wireScope('mouse-scope-x', 'x');
    wireScope('mouse-scope-y', 'y');

    function wireSens(id, axis) {
      var el = document.getElementById(id); if (!el) return;
      var apply = function () {
        var aim = ensureAimTarget(); normalizeAimTarget(aim);
        var old = axis === 'x' ? Number(aim.sensitivityX) : Number(aim.sensitivityY);
        if (!Number.isFinite(old)) old = axis === 'x' ? 1.42 : 1.46;
        var raw = String(el.value).trim();
        var n = Number(raw);
        if (raw === '' || !Number.isFinite(n) || n < 0.1 || n > 10) {
          setMouseSettingsStatus('Sensitivity must be 0.1 to 10', true);
          el.value = old.toFixed(2);
          return;
        }
        n = Math.max(0.1, Math.min(10, n));
        if (axis === 'x') aim.sensitivityX = n; else { aim.sensitivityY = n; aim.sensitivity = n; }
        el.value = n.toFixed(2);
        var avg = (Number(aim.sensitivityX) + Number(aim.sensitivityY)) / 2;
        var range = document.getElementById('km-mouse-range');
        var avgEl = document.getElementById('km-mouse-sensitivity');
        if (range) range.value = String(Number(avg.toFixed(2)));
        if (avgEl) avgEl.textContent = String(Number(avg.toFixed(2)));
        applyMouseFieldChange('sensitivity');
      };
      el.addEventListener('change', apply);
      el.addEventListener('blur', apply);
    }
    wireSens('mouse-sens-x', 'x');
    wireSens('mouse-sens-y', 'y');

    function wirePlace(btnId, mode, msg) {
      var btn = document.getElementById(btnId); if (!btn) return;
      btn.addEventListener('click', function () {
        if (mappingActive) { setMouseSettingsStatus('Stop mapping before placing.', true); return; }
        aimPlacementMode = mode;
        placingNewControl = false;
        pendingControlType = null;
        document.querySelectorAll('.aim-place-btn.armed').forEach(function (b) { b.classList.remove('armed'); });
        this.classList.add('armed');
        setMouseSettingsStatus(msg + ' (Esc to cancel)', false);
        setLayoutStatus(msg);
        renderHudTargets();
      });
    }
    wirePlace('mouse-place-aim', 'aim-anchor-mouse', 'Click the phone screen to place Aim anchorâ€¦');
    wirePlace('mouse-place-fire', 'fire', 'Click the phone screen to place Fire positionâ€¦');
    wirePlace('mouse-place-scope', 'scope-mouse', 'Click the phone screen to place Scope positionâ€¦');
  })();
  // Inspector key field: click to (re)bind
  var inspectorKeyEl = document.getElementById('inspector-key');
  if (inspectorKeyEl) inspectorKeyEl.addEventListener('click', function () {
    if (selectedHudTarget < 0 || !importedHudTargets[selectedHudTarget]) { setInspectorStatus('Select a control first.', true); return; }
    if (mappingActive) { setInspectorStatus('Stop mapping before editing.', true); setLayoutStatus('Stop mapping before editing.'); return; }
    inspectorOldKey = importedHudTargets[selectedHudTarget].key;
    inspectorKeyCapture = true;
    setInspectorStatus('Press a key to bind, Backspace to clear, Esc to cancel.');
    renderAddControlInspector();
    this.focus();
  });

  var inspectorAimBtn = document.getElementById('inspector-aim-settings');
  if (inspectorAimBtn) inspectorAimBtn.addEventListener('click', function () {
    if (selectedHudTarget >= 0) openAimModal(selectedHudTarget);
  });

  function wireAimPanel() {
    var backdrop = document.getElementById('aim-modal-backdrop');
    var closeBtn = document.getElementById('aim-close');
    if (closeBtn) closeBtn.addEventListener('click', closeAimModal);
    if (backdrop) backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeAimModal(); });
    var tabKm = document.getElementById('aim-tab-km');
    var tabGp = document.getElementById('aim-tab-gamepad');
    var bodyKm = document.getElementById('aim-body-km');
    var bodyGp = document.getElementById('aim-body-gamepad');
    if (tabKm) tabKm.addEventListener('click', function () { tabKm.classList.add('active'); if (tabGp) tabGp.classList.remove('active'); if (bodyKm) bodyKm.style.display=''; if (bodyGp) bodyGp.style.display='none'; });
    if (tabGp) tabGp.addEventListener('click', function () { tabGp.classList.add('active'); if (tabKm) tabKm.classList.remove('active'); if (bodyGp) bodyGp.style.display=''; if (bodyKm) bodyKm.style.display='none'; var st=document.getElementById('aim-panel-status'); if(st) st.textContent='Gamepad settings are not supported yet'; });

    function aimTarget() { return (aimModalOpenIndex >= 0 && importedHudTargets[aimModalOpenIndex]) ? importedHudTargets[aimModalOpenIndex] : null; }
    function aimSaveAndRender() { var t = aimTarget(); if (!t) return; normalizeAimTarget(t); syncTapBindingsFromTargets(); saveImportedBindings(); renderAimModal(t); renderHudTargets(); syncMouseSettingsUi(); scheduleMappingUpdate('aim settings'); }

    function bindAimKeyField(id, field) {
      var el = document.getElementById(id); if (!el) return;
      el.addEventListener('click', function () {
        var t = aimTarget(); if (!t) return;
        if (mappingActive) { var st=document.getElementById('aim-panel-status'); if(st){st.textContent='Stop mapping before editing.'; st.className='inspector-status error';} return; }
        aimPanelCapture = { field: field, oldKey: t[field] };
        this.value = 'Press a keyï¿½'; this.classList.add('capturing');
        var st2=document.getElementById('aim-panel-status'); if(st2){st2.textContent='Press a key to bind (Backspace clears, Esc cancels)'; st2.className='inspector-status';}
      });
    }
    bindAimKeyField('aim-start-stop', 'startStopKey');
    bindAimKeyField('aim-suspend', 'suspendKey');

    function onNum(id, apply) {
      var el = document.getElementById(id); if (!el) return;
      var handler = function () { var t = aimTarget(); if (!t) return; apply(t, el.value); aimSaveAndRender(); };
      el.addEventListener('input', handler); el.addEventListener('change', handler);
    }
    onNum('aim-x', function(t,v){ var n=Number(v); if(Number.isFinite(n)) t.x = Math.max(0,Math.min(100,n))/100; syncMouseSettingsUi(); });
    onNum('aim-y', function(t,v){ var n=Number(v); if(Number.isFinite(n)) t.y = Math.max(0,Math.min(100,n))/100; syncMouseSettingsUi(); });
    onNum('aim-sens-x', function(t,v){ var n=Number(v); if(Number.isFinite(n)) { t.sensitivityX = Math.max(0.1,Math.min(10,n)); syncMouseSettingsUi(); } });
    onNum('aim-sens-y', function(t,v){ var n=Number(v); if(Number.isFinite(n)) { t.sensitivityY = Math.max(0.1,Math.min(10,n)); t.sensitivity = t.sensitivityY; syncMouseSettingsUi(); } });
    onNum('aim-tweaks', function(t,v){ var n=Number(v); if(Number.isFinite(n)) t.tweaks = n; });
    onNum('aim-crosshair-size', function(t,v){ var n=Number(v); if(Number.isFinite(n)) t.crosshairSize = Math.max(1,Math.min(10,Math.round(n))); });
    onNum('aim-crosshair-opacity', function(t,v){ var n=Number(v); if(Number.isFinite(n)) t.crosshairOpacity = Math.max(0,Math.min(100,Math.round(n))); });
    onNum('aim-fire-x', function(t,v){ var n=Number(v); if(Number.isFinite(n)) { t.fireX = Math.max(0,Math.min(100,n))/100; t.x2 = t.fireX; syncMouseSettingsUi(); } });
    onNum('aim-fire-y', function(t,v){ var n=Number(v); if(Number.isFinite(n)) { t.fireY = Math.max(0,Math.min(100,n))/100; t.y2 = t.fireY; syncMouseSettingsUi(); } });
    onNum('aim-look-x', function(t,v){ var n=Number(v); if(Number.isFinite(n)) t.freeLookX = (n === -1 ? -1 : Math.max(0,Math.min(100,n))); });
    onNum('aim-look-y', function(t,v){ var n=Number(v); if(Number.isFinite(n)) t.freeLookY = (n === -1 ? -1 : Math.max(0,Math.min(100,n))); });

    var accel = document.getElementById('aim-accel'); if (accel) accel.addEventListener('change', function(){ var t=aimTarget(); if(!t) return; t.mouseAcceleration = this.value === 'true'; aimSaveAndRender(); });
    var style = document.getElementById('aim-crosshair-style'); if (style) style.addEventListener('change', function(){ var t=aimTarget(); if(!t) return; t.crosshairStyle = this.value; aimSaveAndRender(); });
    var faction = document.getElementById('aim-fire-action'); if (faction) faction.addEventListener('change', function(){ var t=aimTarget(); if(!t) return; t.fireAction = this.value; aimSaveAndRender(); });

    function toggleSwitch(id, prop) {
      var el = document.getElementById(id); if (!el) return;
      el.addEventListener('click', function(){ var t=aimTarget(); if(!t) return; t[prop] = !t[prop]; aimSaveAndRender(); });
    }
    toggleSwitch('aim-crosshair-toggle', 'crosshairEnabled');
    toggleSwitch('aim-fire-toggle', 'fireWithLeftClick');
    toggleSwitch('aim-look-toggle', 'lookAroundEnabled');

    function bindColor() {
      var hex = document.getElementById('aim-crosshair-color');
      var pick = document.getElementById('aim-crosshair-color-picker');
      var apply = function(val){ var t=aimTarget(); if(!t) return; t.crosshairColor = val; aimSaveAndRender(); };
      if (hex) hex.addEventListener('input', function(){ var v=this.value; if(/^#?[0-9a-fA-F]{6}$/.test(v)){ if(v[0]!=='#') v='#'+v; apply(v.toUpperCase()); } });
      if (hex) hex.addEventListener('change', function(){ var v=this.value; if(/^#?[0-9a-fA-F]{6}$/.test(v)){ if(v[0]!=='#') v='#'+v; apply(v.toUpperCase()); } });
      if (pick) pick.addEventListener('input', function(){ apply(this.value.toUpperCase()); var h=document.getElementById('aim-crosshair-color'); if(h) h.value=this.value.toUpperCase(); });
    }
    bindColor();

    var placeFire = document.getElementById('aim-place-fire');
    if (placeFire) placeFire.addEventListener('click', function(){ if(aimModalOpenIndex<0) return; if(mappingActive){ var st=document.getElementById('aim-panel-status'); if(st){st.textContent='Stop mapping before placing.'; st.className='inspector-status error';} return; } aimPlacementMode='fire'; this.classList.add('armed'); var ol=document.getElementById('aim-place-look'); if(ol) ol.classList.remove('armed'); setLayoutStatus('Click the phone screen to place fire positionï¿½'); renderHudTargets(); });
    var placeLook = document.getElementById('aim-place-look');
    if (placeLook) placeLook.addEventListener('click', function(){ if(aimModalOpenIndex<0) return; if(mappingActive){ var st=document.getElementById('aim-panel-status'); if(st){st.textContent='Stop mapping before placing.'; st.className='inspector-status error';} return; } aimPlacementMode='look'; this.classList.add('armed'); var of=document.getElementById('aim-place-fire'); if(of) of.classList.remove('armed'); setLayoutStatus('Click the phone screen to place free look positionï¿½'); renderHudTargets(); });

    var delAim = document.getElementById('aim-delete');
    if (delAim) delAim.addEventListener('click', function(){
      var t = aimTarget(); if (!t) return;
      if (!window.confirm('Delete this Aim control?')) return;
      var idx = aimModalOpenIndex;
      closeAimModal();
      if (idx >= 0) {
        importedHudTargets.splice(idx, 1);
        syncTapBindingsFromTargets();
        selectedHudTarget = -1;
        renderHudTargets();
        saveImportedBindings();
        setLayoutStatus('Aim control deleted. Layout saved.');
      }
    });
  }
  wireAimPanel();

  var dragGhost = null;
  var tileDrag = null;
  function ensureDragGhost() {
    if (dragGhost) return dragGhost;
    dragGhost = document.createElement('div');
    dragGhost.className = 'hud-target ghost selected';
    dragGhost.style.position = 'fixed';
    dragGhost.style.zIndex = '20';
    dragGhost.style.pointerEvents = 'none';
    dragGhost.style.display = 'none';
    dragGhost.style.transform = 'translate(-50%, -50%)';
    document.body.appendChild(dragGhost);
    return dragGhost;
  }
  function beginTileDrag(type, evt) {
    if (mappingActive) { setLayoutStatus('Stop mapping before placing controls.'); report(new Error('Stop mapping before placing controls.')); return; }
    if (importedTapBindings.length >= 64) { report(new Error('Maximum 64 controls')); return; }
    tileDrag = { type: type || 'tap', pointerId: evt.pointerId, moved: false, startX: evt.clientX, startY: evt.clientY };
    pendingControlType = tileDrag.type;
    layoutEditMode = layoutEditMode || false; // placing works without edit mode
    try { evt.currentTarget.setPointerCapture(evt.pointerId); } catch (e) {}
    var ghost = ensureDragGhost();
    ghost.innerHTML = '<i></i><b>' + escapeClient(kmTypeLabel(tileDrag.type)) + '</b><b>Drop to place</b>';
    ghost.style.display = 'block';
    ghost.style.left = evt.clientX + 'px';
    ghost.style.top = evt.clientY + 'px';
    document.querySelectorAll('.km-tile.placing').forEach(function (n) { n.classList.remove('placing'); });
    if (evt.currentTarget && evt.currentTarget.classList) evt.currentTarget.classList.add('placing');
    setLayoutStatus('Drag to screen and release to place ' + kmTypeLabel(tileDrag.type) + 'ï¿½');
  }
  function updateTileDrag(evt) {
    if (!tileDrag || evt.pointerId !== tileDrag.pointerId) return;
    var dx = Math.abs(evt.clientX - tileDrag.startX);
    var dy = Math.abs(evt.clientY - tileDrag.startY);
    if (dx + dy > 4) tileDrag.moved = true;
    if (dragGhost) { dragGhost.style.left = evt.clientX + 'px'; dragGhost.style.top = evt.clientY + 'px'; }
  }
  function endTileDrag(evt) {
    if (!tileDrag || (evt && evt.pointerId !== tileDrag.pointerId)) return;
    var type = tileDrag.type;
    var moved = tileDrag.moved;
    tileDrag = null;
    if (dragGhost) dragGhost.style.display = 'none';
    document.querySelectorAll('.km-tile.placing').forEach(function (n) { n.classList.remove('placing'); });
    if (!moved) {
      // click-to-arm fallback (pointer tap on tile)
      placingNewControl = true;
      pendingControlType = type;
      renderHudTargets();
      setLayoutStatus('Click the phone screen to place ' + kmTypeLabel(type) + 'ï¿½');
      return;
    }
    var rect = stage.getBoundingClientRect();
    var inside = evt && evt.clientX >= rect.left && evt.clientX <= rect.right && evt.clientY >= rect.top && evt.clientY <= rect.bottom;
    if (inside) {
      var point = toDevice(evt);
      placeControlAt(point.x / W, point.y / H, type);
    } else {
      placingNewControl = false;
      pendingControlType = null;
      renderHudTargets();
      setLayoutStatus('Placement cancelled.');
    }
  }

  document.querySelectorAll('.km-tile').forEach(function (tile) {
    tile.setAttribute('draggable', 'false');
    tile.addEventListener('pointerdown', function (evt) {
      if (evt.button !== undefined && evt.button !== 0) return;
      evt.preventDefault();
      beginTileDrag(this.dataset.kmType || 'tap', evt);
    });
    tile.addEventListener('pointermove', function (evt) { updateTileDrag(evt); });
    tile.addEventListener('pointerup', function (evt) { endTileDrag(evt); });
    tile.addEventListener('pointercancel', function (evt) { endTileDrag(evt); });
    tile.addEventListener('click', function (evt) {
      // pointer flow handles placement; suppress duplicate click behavior
      evt.preventDefault();
    });
  });
  window.addEventListener('pointermove', function (evt) { if (tileDrag) updateTileDrag(evt); }, true);
  window.addEventListener('pointerup', function (evt) { if (tileDrag) endTileDrag(evt); }, true);
  window.addEventListener('pointercancel', function (evt) { if (tileDrag) endTileDrag(evt); }, true);

  function onStageDragOver(evt) {
    if (!placingNewControl && !tileDrag) return;
    evt.preventDefault();
    if (evt.dataTransfer) evt.dataTransfer.dropEffect = 'copy';
  }
  function onStageDrop(evt) {
    if (!placingNewControl && !tileDrag && !evt.dataTransfer) return;
    evt.preventDefault();
    evt.stopPropagation();
    if (mappingActive) { setLayoutStatus('Stop mapping before placing controls.'); report(new Error('Stop mapping before placing controls.')); return; }
    var type = null;
    try { type = evt.dataTransfer && (evt.dataTransfer.getData('text/add-control') || evt.dataTransfer.getData('text/plain')); } catch (e) {}
    type = type || pendingControlType || (tileDrag && tileDrag.type) || 'tap';
    var point = toDevice(evt);
    placeControlAt(point.x / W, point.y / H, type);
  }
  stage.addEventListener('dragover', onStageDragOver);
  stage.addEventListener('drop', onStageDrop);
  [videoCanvas, screenImage, screenMessage, stageWrap].forEach(function (el) {
    if (!el) return;
    el.addEventListener('dragover', onStageDragOver);
    el.addEventListener('drop', onStageDrop);
  });

  var layoutEditBtn = document.getElementById('layout-edit-toggle');
  if (layoutEditBtn) layoutEditBtn.addEventListener('click', function () {
    if (mappingActive) {
      setLayoutStatus('Stop mapping before editing.');
      report(new Error('Stop mapping before editing.'));
      return;
    }
    layoutEditMode = !layoutEditMode;
    if (layoutEditMode) {
      selectedHudTarget = selectedHudTarget >= 0 ? selectedHudTarget : -1;
      setLayoutStatus(importedHudTargets.length
        ? 'Edit mode on ï¿½ drag a marker to move it.'
        : 'Edit mode on ï¿½ click a tile, then click the screen to place your first control.');
    } else {
      placingNewControl = false;
      pendingControlType = null;
      selectedHudTarget = -1;
      document.querySelectorAll('.km-tile.placing').forEach(function (n) { n.classList.remove('placing'); });
      saveImportedBindings();
      setLayoutStatus('Layout saved.');
    }
    renderHudTargets();
  });
  var layoutDeleteBtn = document.getElementById('layout-delete');
  if (layoutDeleteBtn) layoutDeleteBtn.addEventListener('click', function () {
    if (selectedHudTarget < 0 || !importedHudTargets[selectedHudTarget]) return;
    importedHudTargets.splice(selectedHudTarget, 1);
    importedTapBindings = importedHudTargets.map(function (t) { return { key: t.key, x: t.x, y: t.y, action: t.action || t.kmType || 'tap' }; });
    importedHudTargets.forEach(function (t, i) { t.tapIndex = i; });
    selectedHudTarget = -1;
    renderHudTargets();
    saveImportedBindings();
    setLayoutStatus('Control deleted. Layout saved.');
  });


  var mappingStartBtn = document.getElementById('mapping-start');
  if (mappingStartBtn) {
    mappingStartBtn.onclick = function () {
      if (mappingActive) { stopMapping(); return; }
      layoutEditMode = false;
      placingNewControl = false;
      renderHudTargets();
      setMappingHint('Requesting mouse captureâ€¦ click the phone screen if prompted.', false);
      try {
        var lockRequest = stage.requestPointerLock();
        Promise.resolve(lockRequest).then(function () {
          if (document.pointerLockElement !== stage) {
            throw new Error('Mouse capture was not granted â€” click on the phone screen first, then click Start mapping again.');
          }
          var settings = mapSettings();
          try {
            var keys = [];
            ['forwardKey','leftKey','backwardKey','rightKey','fireKey','scopeKey','cameraToggleKey'].forEach(function (k) { if (settings[k]) keys.push(settings[k]); });
            if (Array.isArray(settings.tapBindings)) settings.tapBindings.forEach(function (t) { if (t && t.key) keys.push(t.key); });
            console.log('[mapping-start] client bound keys:', Array.from(new Set(keys)).join(', '));
          } catch (e) {}
          return queuedApi(Object.assign({ op: 'mapping-start' }, settings));
        }).then(function (res) {
          if (document.pointerLockElement !== stage) {
            return queuedApi({ op: 'mapping-stop' }).catch(function () {}).then(function () {
              throw new Error('Mouse capture ended during startup â€” click the phone screen, then click Start mapping again.');
            });
          }
          mappingActive = true;
          renderHudTargets();
          setMappingHint('', false); try { setTapStatus('Playing — press Esc to stop.', false); } catch(e){} try { uiSyncMode(); } catch(e){}
          if (res && res.missingKeys && res.missingKeys.length) {
            var msg = 'Missing keys on server: ' + res.missingKeys.join(', ');
            setMappingHint(msg, true);
            report(new Error(msg));
          }
        }).catch(function (error) {
          mappingActive = false;
          if (document.pointerLockElement === stage) { try { document.exitPointerLock(); } catch (e) {} }
          renderHudTargets();
          var msg = error && error.message ? error.message : String(error);
          if (/Mouse capture was not granted/i.test(msg) || /not granted/i.test(msg)) {
            msg = 'Mouse capture was not granted â€” click on the phone screen first, then click Start mapping again.';
          }
          setMappingHint(msg, true);
          report(new Error(msg));
        });
      } catch (error) {
        mappingActive = false;
        renderHudTargets();
        var emsg = error && error.message ? error.message : String(error);
        setMappingHint(emsg, true);
        report(error);
      }
    };
  }

  function stopMapping(silent) {
    if (!mappingActive) { return; }
    mappingActive = false;
    if (document.pointerLockElement === stage) { try { document.exitPointerLock(); } catch (e) {} }
    queuedApi({ op: 'mapping-stop' }).catch(report);
    renderHudTargets();
    if (!silent) { try { setTapStatus('Stopped playing — back to setup.', false); } catch(e){} setMappingHint('', false); }
    try { uiSyncMode(); } catch(e){}
  }

  function panic() {
    mappingActive = false;
    if (document.pointerLockElement === stage) { try { document.exitPointerLock(); } catch (e) {} }
    queuedApi({ op: 'panic' }).catch(report);
    renderHudTargets();
    try { setTapStatus('Stopped — all controls released.', false); } catch(e){}
    setMappingHint('', false);
    try { uiSyncMode(); } catch(e){}
  }

  document.addEventListener('pointerlockchange', function () {
    if (mappingActive && document.pointerLockElement !== stage) {
      mappingActive = false;
      queuedApi({ op: 'mapping-stop' }).catch(report);
      renderHudTargets();
      setMappingHint('Mouse capture ended â€” mapping stopped. Click the phone screen, then Start mapping again.', true);
    }
  });
  window.addEventListener('keydown', function (evt) {
    var isAimPanelCapture = !!(aimPanelCapture && aimModalOpenIndex >= 0);
    if (evt.key === 'Escape') {
      if (inspectorKeyCapture) {
        evt.preventDefault(); evt.stopImmediatePropagation();
        inspectorKeyCapture = false;
        setInspectorStatus('Key capture cancelled.');
        setLayoutStatus('Esc: key capture cancelled.');
        renderAddControlInspector();
        return;
      }
      if (isAimPanelCapture) {
        evt.preventDefault(); evt.stopImmediatePropagation();
        aimPanelCapture = null;
        renderAimModal(importedHudTargets[aimModalOpenIndex]);
        var st = document.getElementById('aim-panel-status'); if (st) st.textContent = 'Key capture cancelled. Changes will be saved automatically';
        return;
      }
      if (placingNewControl || aimPlacementMode) {
        evt.preventDefault();
        placingNewControl = false; pendingControlType = null; aimPlacementMode = null;
        document.querySelectorAll('.km-tile.placing,.aim-place-btn.armed').forEach(function (n) { n.classList.remove('placing'); n.classList.remove('armed'); });
        renderHudTargets();
        setLayoutStatus('Placement cancelled.');
        if (!mappingActive) return;
      }
      evt.preventDefault();
      panic();
      return;
    }

    var key = normalizeEventKey(evt.key, evt.code);
    var code = String(evt.code || '');

    // Inspector key capture (rebind always allowed unless mapping active)
    if (inspectorKeyCapture && selectedHudTarget >= 0 && importedHudTargets[selectedHudTarget]) {
      if (mappingActive) {
        evt.preventDefault(); evt.stopImmediatePropagation();
        inspectorKeyCapture = false;
        setInspectorStatus('Stop mapping before editing.', true);
        setLayoutStatus('Stop mapping before editing.');
        renderAddControlInspector();
        return;
      }
      evt.preventDefault(); evt.stopImmediatePropagation();
      var tgt = importedHudTargets[selectedHudTarget];
      // Backspace/Delete clears key
      if (key === 'backspace' || key === 'delete' || code === 'Backspace' || code === 'Delete') {
        tgt.key = '';
        syncTapBindingsFromTargets();
        inspectorKeyCapture = false;
        renderHudTargets();
        saveImportedBindings();
        setInspectorStatus('Key cleared.');
        setLayoutStatus((tgt.actionLabel || kmTypeLabel(tgt.action)) + ' key cleared.');
        renderAddControlInspector();
        try { var ik=document.getElementById('inspector-key'); if(ik) ik.blur(); } catch(e) {}
        return;
      }
      if (!key || key === 'escape') return;
      // same key re-confirms
      if (tgt.key === key) {
        inspectorKeyCapture = false;
        renderHudTargets();
        saveImportedBindings();
        setInspectorStatus('Key confirmed: ' + displayKey(key) + '.');
        setLayoutStatus((tgt.actionLabel || kmTypeLabel(tgt.action)) + ' bound to ' + displayKey(key) + '.');
        renderAddControlInspector();
        try { var ik=document.getElementById('inspector-key'); if(ik) ik.blur(); } catch(e) {}
        return;
      }
      // duplicate used by different control
      var duplicate = -1;
      for (var di = 0; di < importedHudTargets.length; di++) {
        if (di === selectedHudTarget) continue;
        var other = importedHudTargets[di];
        if (!other) continue;
        if (other.key === key) { duplicate = di; break; }
        if ((other.action === 'aim' || other.kmType === 'aim') && (other.startStopKey === key || other.suspendKey === key)) { duplicate = di; break; }
        if ((tgt.action === 'aim' || tgt.kmType === 'aim') && (tgt.startStopKey === key || tgt.suspendKey === key)) { /* self conflict checked below */ }
      }
      // aim start/stop/suspend conflict with this control's other field
      if (duplicate < 0 && (tgt.action === 'aim' || tgt.kmType === 'aim')) {
        // binding main key: cannot equal own start/stop/suspend? not specified, but keep reasonable; allow distinct
      }
      if (duplicate >= 0) {
        var usedBy = importedHudTargets[duplicate];
        setInspectorStatus(displayKey(key) + ' is already used by ' + (usedBy.actionLabel || kmTypeLabel(usedBy.action)) + '.', true);
        report(new Error(displayKey(key) + ' is already used by ' + (usedBy.actionLabel || 'another control')));
        // keep old key, stay in capture mode
        return;
      }
      tgt.key = key;
      syncTapBindingsFromTargets();
      inspectorKeyCapture = false;
      renderHudTargets();
      saveImportedBindings();
      setInspectorStatus((tgt.actionLabel || kmTypeLabel(tgt.action)) + ' bound to ' + displayKey(key) + '.');
      setLayoutStatus((tgt.actionLabel || kmTypeLabel(tgt.action)) + ' bound to ' + displayKey(key) + '.');
      renderAddControlInspector();
      try { var ik=document.getElementById('inspector-key'); if(ik) ik.blur(); } catch(e) {}
      return;
    }

    // Aim panel key capture (Start/Stop or Suspend)
    if (isAimPanelCapture && selectedHudTarget >= 0 && importedHudTargets[selectedHudTarget]) {
      if (mappingActive) {
        evt.preventDefault(); evt.stopImmediatePropagation();
        aimPanelCapture = null;
        var st0 = document.getElementById('aim-panel-status'); if (st0) { st0.textContent = 'Stop mapping before editing.'; st0.className = 'inspector-status error'; }
        return;
      }
      evt.preventDefault(); evt.stopImmediatePropagation();
      var aimTgt = importedHudTargets[selectedHudTarget];
      normalizeAimTarget(aimTgt);
      var field = aimPanelCapture.field;
      if (key === 'backspace' || key === 'delete' || code === 'Backspace' || code === 'Delete') {
        if (field === 'startStopKey') aimTgt.startStopKey = '';
        if (field === 'suspendKey') aimTgt.suspendKey = '';
        syncTapBindingsFromTargets(); saveImportedBindings(); aimPanelCapture = null; renderAimModal(aimTgt); renderHudTargets();
        var stc = document.getElementById('aim-panel-status'); if (stc) stc.textContent = 'Key cleared. Changes will be saved automatically';
        try { if(document.activeElement&&document.activeElement.blur) document.activeElement.blur(); } catch(e) {}
        return;
      }
      if (!key || key === 'escape') return;
      if (aimTgt[field] === key) {
        aimPanelCapture = null; renderAimModal(aimTgt);
        var stsame = document.getElementById('aim-panel-status'); if (stsame) stsame.textContent = 'Key confirmed. Changes will be saved automatically';
        try { if(document.activeElement&&document.activeElement.blur) document.activeElement.blur(); } catch(e) {}
        return;
      }
      var dup = -1;
      for (var dj = 0; dj < importedHudTargets.length; dj++) {
        var o = importedHudTargets[dj]; if (!o) continue;
        if (dj === selectedHudTarget) {
          if (field === 'startStopKey' && o.suspendKey === key) { dup = dj; break; }
          if (field === 'suspendKey' && o.startStopKey === key) { dup = dj; break; }
          continue;
        }
        if (o.key === key) { dup = dj; break; }
        if ((o.action === 'aim' || o.kmType === 'aim') && (o.startStopKey === key || o.suspendKey === key)) { dup = dj; break; }
      }
      if (dup >= 0) {
        var stErr = document.getElementById('aim-panel-status');
        if (stErr) { stErr.textContent = displayKey(key) + ' is already used by ' + (importedHudTargets[dup].actionLabel || kmTypeLabel(importedHudTargets[dup].action)) + '.'; stErr.className = 'inspector-status error'; }
        return; // keep old key, stay in capture mode
      }
      aimTgt[field] = key;
      syncTapBindingsFromTargets(); saveImportedBindings(); aimPanelCapture = null; renderAimModal(aimTgt); renderHudTargets();
      var stok = document.getElementById('aim-panel-status'); if (stok) { stok.textContent = 'Key updated. Changes will be saved automatically'; stok.className = 'inspector-status'; }
      try { if(document.activeElement&&document.activeElement.blur) document.activeElement.blur(); } catch(e) {}
      return;
    }

    if (!key || key === 'escape') return;

    // Delete selected control in setup (not while capturing/mapping/typing)
    if ((key === 'delete' || key === 'backspace') && !mappingActive && !inspectorKeyCapture && !isAimPanelCapture && selectedHudTarget >= 0 && importedHudTargets[selectedHudTarget]) {
      var tagd = (evt.target && evt.target.tagName) ? evt.target.tagName.toLowerCase() : '';
      var typingd = (tagd === 'input' || tagd === 'textarea' || tagd === 'select' || (evt.target && evt.target.isContentEditable));
      if (!typingd) {
        evt.preventDefault();
        try { document.getElementById('layout-delete') && document.getElementById('layout-delete').click(); } catch (e) {}
        return;
      }
    }

    // Quick-assign: in setup, select a control then press a key to assign it
    if (!mappingActive && !inspectorKeyCapture && !isAimPanelCapture && aimModalOpenIndex < 0 && selectedHudTarget >= 0 && importedHudTargets[selectedHudTarget]) {
      var tagq = (evt.target && evt.target.tagName) ? evt.target.tagName.toLowerCase() : '';
      var typingq = (tagq === 'input' || tagq === 'textarea' || tagq === 'select' || (evt.target && evt.target.isContentEditable));
      if (!typingq && key && key !== 'escape' && key !== 'delete' && key !== 'backspace') {
        var tgtq = importedHudTargets[selectedHudTarget];
        // prevent duplicates
        var dupq = -1;
        for (var qi = 0; qi < importedHudTargets.length; qi++) {
          if (qi === selectedHudTarget) continue;
          var oq = importedHudTargets[qi]; if (!oq) continue;
          if (oq.key === key) { dupq = qi; break; }
          if ((oq.action === 'aim' || oq.kmType === 'aim') && (oq.startStopKey === key || oq.suspendKey === key)) { dupq = qi; break; }
        }
        if (dupq >= 0) {
          evt.preventDefault();
          setInspectorStatus(displayKey(key) + ' is already used by ' + (importedHudTargets[dupq].actionLabel || kmTypeLabel(importedHudTargets[dupq].action)) + '.', true);
          setTapStatus(displayKey(key) + ' is already used by another control.', true);
          return;
        }
        evt.preventDefault();
        tgtq.key = key;
        syncTapBindingsFromTargets();
        renderHudTargets();
        saveImportedBindings();
        setInspectorStatus((tgtq.actionLabel || kmTypeLabel(tgtq.action)) + ' is now ' + displayKey(key) + '.', false);
        setTapStatus((tgtq.actionLabel || kmTypeLabel(tgtq.action)) + ' is now ' + displayKey(key) + '. Click Start playing to test it.', false);
        try { renderAddControlInspector(); } catch(e){}
        try { uiSyncMode(); } catch(e){}
        return;
      }
    }

    var isMappedKey = key === profileCameraToggleKey || importedTapBindings.some(function (target) { return target.key === key; })
      || importedHudTargets.some(function (t) { return t && ((t.action === 'aim' || t.kmType === 'aim') && (t.startStopKey === key || t.suspendKey === key)); });
    if (!mappingActive) {
      var tag = (evt.target && evt.target.tagName) ? evt.target.tagName.toLowerCase() : '';
      var typing = (tag === 'input' || tag === 'textarea' || tag === 'select' || (evt.target && evt.target.isContentEditable));
      if (!typing && isMappedKey) {
        setMappingHint('Mapping is off â€” click Start mapping first', true, 3000);
      }
      return;
    }
    if (isMappedKey) evt.preventDefault();
    if (key === 'wheelup') { evt.preventDefault(); queuedApi({ op: 'key-down', key: key }); return; }
    if (['w', 'a', 's', 'd'].indexOf(key) !== -1) {
      evt.preventDefault();
      if (!evt.repeat) { queuedApi({ op: 'key-down', key: key }); }
    } else if (!evt.repeat) {
      queuedApi({ op: 'key-down', key: key }); 
    }
  }, true);
  window.addEventListener('keyup', function (evt) {
    if (!mappingActive) return;
    var key = normalizeEventKey(evt.key, evt.code);
    if (['w', 'a', 's', 'd'].indexOf(key) !== -1) {
      evt.preventDefault();
      queuedApi({ op: 'key-up', key: key });
    } else {
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
    try {
      if (!mappingActive) { return; }
      // In mapping mode with pointer lock (aim/camera captured), left/right are mapped fire/scope actions at fixed points.
      // Without pointer lock, allow normal screen clicks to be handled as direct taps by stage handler.
      if (document.pointerLockElement !== stage) { return; }
      if (evt.button === 0 || evt.button === 2) {
        evt.preventDefault();
        queuedApi({ op: 'button-down', button: evt.button === 0 ? 'left' : 'right' }).then(function(){
          if (evt.button === 0) {
            try {
              var st = (typeof mapSettings === 'function') ? mapSettings() : null;
              var fx = st ? (st.shootX != null ? st.shootX : (st.fireX != null ? st.fireX : 0.7526)) : 0.7526;
              var fy = st ? (st.shootY != null ? st.shootY : (st.fireY != null ? st.fireY : 0.7281)) : 0.7281;
              setTapStatus('Fired at ' + (Number(fx)*100).toFixed(2) + '%, ' + (Number(fy)*100).toFixed(2) + '% (fixed fire point).');
            } catch (e) {}
          } else {
            try { setTapStatus('Scope/right action sent (fixed mapping action).'); } catch (e) {}
          }
        }).catch(function(e){ try { setTapStatus('Mapped click failed: ' + (e && e.message ? e.message : e), true); } catch(e2){} try { report(e); } catch(e2){} });
      }
    } catch (e) { try { console.error('[mousedown mapping] error', e); } catch (e2) {} }
  });
  document.addEventListener('mouseup', function (evt) {
    try {
      if (!mappingActive) { return; }
      if (document.pointerLockElement !== stage) { return; }
      if (evt.button === 0 || evt.button === 2) {
        evt.preventDefault();
        queuedApi({ op: 'button-up', button: evt.button === 0 ? 'left' : 'right' }).catch(function(e){ try { report(e); } catch(e2){} });
      }
    } catch (e) {}
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
        try {
          var dw = state && state.device ? Number(state.device.width) : NaN;
          var dh = state && state.device ? Number(state.device.height) : NaN;
          if (dw > 0 && dh > 0 && (dw !== W || dh !== H)) setDisplaySize(dw, dh);
        } catch (e) {}
        var pill = document.getElementById('session-pill');
        var running = !!(state.session && state.session.running);
        if (pill) {
          pill.textContent = running ? (state.mock ? 'Running (demo)' : 'Connected') : 'Not connected';
          pill.className = 'pill ' + (running ? 'ok' : 'bad');
        }
        try {
          var dot = document.getElementById('conn-dot');
          var ct = document.getElementById('conn-text');
          if (state.mock) {
            if (dot) dot.className = 'dot';
            if (ct) ct.textContent = 'Demo mode — no phone attached';
          } else if (running) {
            if (dot) dot.className = 'dot ok';
            var modelName = (state.device && (state.device.model || state.device.serial)) || 'Phone';
            if (ct) ct.textContent = 'Phone connected — ' + modelName;
          } else {
            if (dot) dot.className = 'dot';
            if (ct) ct.textContent = 'No phone connected';
          }
          var cc = document.getElementById('conn-controls');
          if (cc) cc.textContent = mappingActive ? 'Playing' : 'Ready';
        } catch (e) {}
        screenWakeState = state.screenWake || screenWakeState || null;
        screenLocked = Boolean((screenWakeState && screenWakeState.locked) || (state.device && state.device.locked));
        if (screenLocked) {
          screenMessage.textContent = 'Unlock your phone to show the live screen.';
          screenMessage.style.display = 'flex';
        } else if (INITIAL_SCREEN_LOCKED && !videoConnected && !currentScreenUrl) {
          screenMessage.textContent = ${JSON.stringify(screenAvailable ? 'Waiting for the phone screenï¿½' : 'Phone screen preview is unavailable.')};
        }
        placeMarkers((state.pointers && state.pointers.active) || []);
        document.getElementById('k-count').textContent = (state.pointers && state.pointers.count) || 0;
        document.getElementById('k-messages').textContent = (state.pointers && state.pointers.totalMessages) || 0;
        document.getElementById('k-panics').textContent = (state.pointers && state.pointers.panics) || 0;
        document.getElementById('k-hz').textContent = state.lastSweep ? state.lastSweep.achievedHz : 'ï¿½';
        document.getElementById('k-proof').textContent = state.lastProof
          ? (state.lastProof.ok ? 'ok' : 'failed') + ' ï¿½ ' + state.lastProof.totalMs + ' ms'
          : 'ï¿½';
        var video = state.video || {};
        document.getElementById('k-video-connected').textContent = video.videoConnected ? 'yes' : 'no';
        document.getElementById('k-video-frames').textContent = video.videoFramesReceived ?? 0;
        document.getElementById('k-video-keyframe').textContent = video.keyframeReceived ? 'yes' : 'no';
        document.getElementById('k-video-codec').textContent = video.codecConfigured ? 'h264' : 'ï¿½';
        document.getElementById('k-video-error').textContent = video.lastVideoError || 'ï¿½';
        var serverErr = video.lastServerError || state.lastServerError || (state.session && state.session.lastServerError) || 'ï¿½';
        var serverErrEl = document.getElementById('k-server-error');
        if (serverErrEl) serverErrEl.textContent = serverErr;
        try { uiSyncMode(); } catch(e){}
        render(state.log || []);
      })
      .catch(function () {
        var pill = document.getElementById('session-pill');
        pill.textContent = 'bridge lost';
        pill.className = 'pill bad';
      });
  }

  var screenshotPolling = false;
  function pollScreen() {
    if (screenshotPolling) return;
    screenshotPolling = true;
    if (screenLocked) {
      screenMessage.textContent = 'Unlock your phone to show the live screen.';
      screenMessage.style.display = 'flex';
      setTimeout(function () { screenshotPolling = false; pollScreen(); }, 1000);
      return;
    }
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
          if (!firstFrameSeen) {
            screenImage.style.display = 'block';
            if (screenLocked) {
              screenMessage.textContent = 'Unlock your phone to show the live screen.';
              screenMessage.style.display = 'flex';
            } else {
              screenMessage.style.display = 'none';
            }
          }
          if (previousUrl) { URL.revokeObjectURL(previousUrl); }
        };
        screenImage.onerror = function () {
          URL.revokeObjectURL(nextUrl);
          if (previousUrl) { currentScreenUrl = previousUrl; }
          if (!firstFrameSeen) {
            screenMessage.textContent = 'Phone screen preview is unavailable.';
            screenMessage.style.display = 'flex';
          }
        };
        screenImage.src = nextUrl;
      })
      .catch(function () {
        if (!currentScreenUrl && !firstFrameSeen) {
          screenMessage.textContent = screenLocked
            ? 'Unlock your phone to show the live screen.'
            : 'Phone screen preview is unavailable. Check the USB connection.';
          screenMessage.style.display = 'flex';
        }
      })
      .finally(function () { setTimeout(function () { screenshotPolling = false; pollScreen(); }, 120); });
  }

  function stopVideoStream() {
    if (startWatchdog) { clearTimeout(startWatchdog); startWatchdog = null; }
    if (midSessionWatchdog) { clearInterval(midSessionWatchdog); midSessionWatchdog = null; }
    if (activeVideoAbort) {
      try { activeVideoAbort.abort(); } catch (e) {}
      activeVideoAbort = null;
    }
  }

  function fallbackToScreenshots(reason) {
    if (videoFailed) return;
    videoFailed = true;
    stopVideoStream();
    if (reason) report(reason instanceof Error ? reason : new Error(String(reason)));
    document.getElementById('video-status').textContent = 'Video failed ï¿½ showing screenshot preview';
    if (${screenAvailable ? 'true' : 'false'} && !screenshotPolling) pollScreen();
  }

  function startVideo() {
    if (!window.VideoDecoder || !window.EncodedVideoChunk || !window.ReadableStream) {
      throw new Error('This browser does not support low-latency H.264 video decoding');
    }
    if (screenLocked) {
      document.getElementById('video-status').textContent = 'Unlock your phone to see the screen';
      screenMessage.textContent = 'Unlock your phone to show the live screen.';
      screenMessage.style.display = 'flex';
      if (${screenAvailable ? 'true' : 'false'} && !screenshotPolling) pollScreen();
      setTimeout(function () {
        if (!firstFrameSeen && screenLocked) startVideo().catch(function () {});
        else if (!firstFrameSeen && !videoFailed) startVideo().catch(function (e) { fallbackToScreenshots(e); });
      }, 2000);
      return Promise.resolve();
    }
    videoFailed = false;
    firstFrameSeen = false;
    decodedFrames = 0;
    lastVideoActivityAt = Date.now();
    videoStartAt = Date.now();
    document.getElementById('video-status').textContent = 'Video starting ï¿½ 90 fps target';
    stopVideoStream();
    startWatchdog = setTimeout(function () {
      if (!firstFrameSeen) fallbackToScreenshots(new Error('Live video did not start within 3 seconds; using screenshot preview'));
    }, VIDEO_TIMEOUT_MS);
    midSessionWatchdog = setInterval(function () {
      if (!firstFrameSeen || videoFailed) return;
      if (Date.now() - lastVideoActivityAt > VIDEO_TIMEOUT_MS) {
        fallbackToScreenshots(new Error('Video stream stalled for 3 seconds; using screenshot preview'));
      }
    }, 500);

    var controller = new AbortController();
    activeVideoAbort = controller;
    return fetch('/api/video?t=' + encodeURIComponent(TOKEN), { cache: 'no-store', signal: controller.signal }).then(function (res) {
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
        decodedFrames++;
        renderedFrames++;
        firstFrameSeen = true;
        videoConnected = true;
        lastVideoActivityAt = Date.now();
        if (startWatchdog) { clearTimeout(startWatchdog); startWatchdog = null; }
        if (!keyframeReceived) keyframeReceived = true;
        var now = performance.now();
        if (now - fpsWindowStart >= 1000) {
          var fps = Math.round(renderedFrames * 1000 / (now - fpsWindowStart));
          document.getElementById('video-status').textContent = 'Video live ï¿½ ' + fps + ' fps ï¿½ ' + decodedWidth + 'ï¿½' + decodedHeight;
          renderedFrames = 0;
          fpsWindowStart = now;
        } else if (decodedFrames === 1) {
          document.getElementById('video-status').textContent = 'Video live ï¿½ ' + decodedWidth + 'ï¿½' + decodedHeight;
        }
      }
      function resetDecoder() {
        if (decoder && decoder.state !== 'closed') {
          try { decoder.reset(); } catch (e) {}
        }
        codecConfigured = false;
      }
      decoder = new VideoDecoder({
        output: decodeOutput,
        error: function (error) { fallbackToScreenshots(error); }
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
        if (!codecConfigured || !decoder || decoder.state === 'closed') return;
        var bytes = payload;
        if (key && codecData) {
          bytes = new Uint8Array(codecData.length + payload.length);
          bytes.set(codecData, 0);
          bytes.set(payload, codecData.length);
        }
        try {
          decoder.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: timestamp, data: bytes }));
          lastVideoActivityAt = Date.now();
        } catch (e) { fallbackToScreenshots(e); }
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
            decoder.configure({ codec: currentCodec, optimizeForLatency: true, hardwareAcceleration: 'prefer-hardware' });
            codecConfigured = true;
            lastVideoActivityAt = Date.now();
          } else {
            var timestamp = Number(pts & timestampMask);
            submitFrame(payload, isKey, timestamp);
          }
        }
        buffer = buffer.slice(offset);
      }
      function pump() {
        return reader.read().then(function (result) {
          if (result.done) {
            if (!firstFrameSeen && !videoFailed) fallbackToScreenshots(new Error('Video stream ended before first frame'));
            else if (firstFrameSeen && !videoFailed) fallbackToScreenshots(new Error('Video stream stopped mid-session'));
            return;
          }
          lastVideoActivityAt = Date.now();
          append(result.value);
          return pump();
        });
      }
      return pump();
    }).catch(function (error) {
      if (controller.signal.aborted) return;
      fallbackToScreenshots(error);
    });
  }

  function report(error) {
    var box = document.getElementById('log');
    if (!box) return;
    var line = document.createElement('div');
    line.className = 'error';
    line.textContent = 'client: ' + (error && error.message ? error.message : String(error));
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
  }

  (function(){
    var gd = document.getElementById('guide-dismiss');
    if (gd) gd.addEventListener('click', function(){ var g=document.getElementById('setup-guide'); if(g) g.style.display='none'; try{localStorage.setItem('heaven-guide-dismissed','1');}catch(e){} });
    try { if(localStorage.getItem('heaven-guide-dismissed')==='1'){ var g=document.getElementById('setup-guide'); if(g) g.style.display='none'; } } catch(e){}
    var hb = document.getElementById('help-btn');
    if (hb) hb.addEventListener('click', function(){ var g=document.getElementById('setup-guide'); if(g){ g.style.display=''; } setTapStatus('Step 1: Connect phone. Step 2: Place controls. Step 3: Start playing.', false); });
  })();

  (function(){
    var sb = document.getElementById('settings-backdrop');
    function openSettings(){ if(sb){ sb.classList.add('open'); sb.setAttribute('aria-hidden','false'); } }
    function closeSettings(){ if(sb){ sb.classList.remove('open'); sb.setAttribute('aria-hidden','true'); } }
    var so=document.getElementById('settings-open'); if(so) so.addEventListener('click', openSettings);
    var sc=document.getElementById('settings-close'); if(sc) sc.addEventListener('click', closeSettings);
    if(sb) sb.addEventListener('click', function(e){ if(e.target===sb) closeSettings(); });
    window.__openSettings=openSettings; window.__closeSettings=closeSettings;
  })();

  (function(){
    function presetStatus(msg, err){ var el=document.getElementById('preset-status'); if(!el) return; el.textContent=msg||''; el.className='settings-status'+(err?' error':'')+(msg&&!err?' ok':''); }
    function buildClientPreset(){
      try { syncTapBindingsFromTargets(); } catch(e){}
      var layout = { taps: importedTapBindings||[], targets: importedHudTargets||[], cameraToggleKey: profileCameraToggleKey||null, mouseSensitivity: Number((document.getElementById('km-mouse-range')||{}).value||1.44)||1.44 };
      var profile = { scheme: 'My layout', taps: layout.taps, targets: layout.targets, controls: layout.targets, fields: {}, bindings: { WASD:{w:'w',a:'a',s:'s',d:'d'}, Fire:'left click', Scope:'right click' }, cameraToggleKey: layout.cameraToggleKey, controlsVersion:1 };
      return { format:'heaven-preset', version:1, name: profile.scheme, exportedAt: new Date().toISOString(), 'heaven-msi-profile': profile, 'heaven-key-bindings': profile.bindings, 'heaven-layout': layout };
    }
    var ex=document.getElementById('preset-export-btn');
    if(ex) ex.addEventListener('click', function(){
      try {
        var preset = buildClientPreset();
        var blob = new Blob([JSON.stringify(preset,null,2)], {type:'application/json'});
        var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='heaven-layout-'+new Date().toISOString().slice(0,10)+'.json'; document.body.appendChild(a); a.click(); setTimeout(function(){ try{URL.revokeObjectURL(a.href); a.remove();}catch(e){} }, 0);
        presetStatus('Layout saved to file.', false);
      } catch(e){ presetStatus('Could not save layout: '+(e&&e.message?e.message:e), true); }
    });
    var imp=document.getElementById('preset-import-btn'); var fin=document.getElementById('preset-file-input');
    if(imp && fin) imp.addEventListener('click', function(){ fin.value=''; fin.click(); });
    var pendingPreset=null;
    if(fin) fin.addEventListener('change', function(){
      var f=fin.files && fin.files[0]; if(!f) return;
      var r=new FileReader();
      r.onload=function(){
        try {
          var data=JSON.parse(String(r.result||''));
          if(!data || data.format!=='heaven-preset' || data.version!==1 || !data['heaven-msi-profile'] || !Array.isArray((data['heaven-msi-profile']||{}).controls)) throw new Error('This file is not a valid layout.');
          pendingPreset=data;
          var conf=document.getElementById('preset-import-confirm'); var row=document.getElementById('preset-apply-row');
          if(conf){ conf.style.display='block'; conf.textContent='Ready to load: '+(data.name||'Saved layout')+'. This will replace your current controls.'; }
          if(row) row.style.display='flex';
          presetStatus('Layout file looks good. Click Apply layout to use it.', false);
        } catch(e){ pendingPreset=null; presetStatus('Could not load layout: '+(e&&e.message?e.message:'Invalid file'), true); var conf=document.getElementById('preset-import-confirm'); var row=document.getElementById('preset-apply-row'); if(conf) conf.style.display='none'; if(row) row.style.display='none'; }
      };
      r.readAsText(f);
    });
    var ap=document.getElementById('preset-apply-btn');
    if(ap) ap.addEventListener('click', function(){
      if(!pendingPreset){ presetStatus('Choose a layout file first.', true); return; }
      try {
        var p=pendingPreset['heaven-msi-profile']||{};
        var layout=pendingPreset['heaven-layout']||{ taps:p.taps||[], targets:p.targets||p.controls||[], cameraToggleKey:p.cameraToggleKey||null, mouseSensitivity:1 };
        importedTapBindings = Array.isArray(layout.taps)?layout.taps:(Array.isArray(p.taps)?p.taps:[]);
        importedHudTargets = Array.isArray(layout.targets)?layout.targets:(Array.isArray(p.targets)?p.targets:(Array.isArray(p.controls)?p.controls:[]));
        importedHudTargets.forEach(function(t,i){ if(!Number.isInteger(t.tapIndex)) t.tapIndex=i; if(!t.actionLabel) t.actionLabel=kmTypeLabel(t.action||t.kmType||'tap'); if(typeof normalizeAimTarget==='function') normalizeAimTarget(t); });
        syncTapBindingsFromTargets();
        profileCameraToggleKey = layout.cameraToggleKey || p.cameraToggleKey || null;
        if(layout.mouseSensitivity){ var rr=document.getElementById('km-mouse-range'); if(rr) rr.value=layout.mouseSensitivity; }
        saveImportedBindings(); renderHudTargets(); try{syncMouseSettingsUi();}catch(e){} try{uiSyncMode();}catch(e){}
        pendingPreset=null; var conf=document.getElementById('preset-import-confirm'); var row=document.getElementById('preset-apply-row'); if(conf) conf.style.display='none'; if(row) row.style.display='none';
        presetStatus('Layout loaded.', false); setTapStatus('Layout loaded.', false);
      } catch(e){ presetStatus('Could not apply layout: '+(e&&e.message?e.message:e), true); }
    });
  })();

  (function(){
    function clamp01(v){ v=Number(v); if(!Number.isFinite(v)) v=0.5; return Math.max(0,Math.min(1,v)); }
    function applyPreset(name){
      if (mappingActive) { setTapStatus('Stop playing before applying a preset.', true); return; }
      var targets = [];
      function add(type,x,y,key,label){ targets.push({ key:key||'', x:clamp01(x), y:clamp01(y), action:type, kmType:type, actionLabel:label||kmTypeLabel(type), tapIndex:targets.length }); }
      if (name==='shooter'){
        add('dpad', 0.18, 0.72, 'w', 'D-pad'); // D-pad container position; keys handled by WASD defaults
        var aim = defaultAimControl('aim', 0.84, 0.50, targets.length); aim.key=''; aim.actionLabel='Aim, pan and shoot'; targets.push(aim);
        add('tap', 0.90, 0.78, 'r', 'Reload');
        add('tap', 0.78, 0.86, 'c', 'Crouch');
        add('tap', 0.70, 0.78, 'space', 'Jump');
        add('tap', 0.62, 0.86, 'f', 'Interact');
      } else if (name==='moba'){
        add('mobadpad', 0.18, 0.72, 'w', 'MOBA D-pad');
        add('mobaskill', 0.76, 0.70, 'q', 'Skill 1');
        add('tap', 0.84, 0.62, 'e', 'Skill 2');
        add('tap', 0.90, 0.74, 'r', 'Skill 3');
        add('tap', 0.82, 0.84, 'space', 'Attack');
      } else if (name==='racing'){
        add('tap', 0.12, 0.78, 'a', 'Left');
        add('tap', 0.28, 0.78, 'd', 'Right');
        add('tap', 0.82, 0.70, 'w', 'Accelerate');
        add('tap', 0.82, 0.86, 's', 'Brake');
      } else { return; }
      importedHudTargets = targets;
      importedTapBindings = [];
      syncTapBindingsFromTargets();
      selectedHudTarget = -1;
      inspectorKeyCapture = false;
      saveImportedBindings();
      renderHudTargets();
      try { syncMouseSettingsUi(); } catch(e){}
      try { uiSyncMode(); } catch(e){}
      setTapStatus((name==='shooter'?'Shooter (FPS)':name==='moba'?'MOBA':'Racing') + ' preset added. You can move controls and change keys.', false);
      try { setLayoutStatus('Preset applied. Click a control and press a key to change it.'); } catch(e){}
    }
    var ps=document.getElementById('preset-shooter'); if(ps) ps.addEventListener('click', function(){ applyPreset('shooter'); });
    var pm=document.getElementById('preset-moba'); if(pm) pm.addEventListener('click', function(){ applyPreset('moba'); });
    var pr=document.getElementById('preset-racing'); if(pr) pr.addEventListener('click', function(){ applyPreset('racing'); });
  })();

  tick();
  setInterval(tick, 250);
  fitStage();
  window.addEventListener('resize', fitStage);
  if (window.ResizeObserver) new ResizeObserver(fitStage).observe(stageWrap);
  if (${videoAvailable ? 'true' : 'false'}) {
    startVideo().catch(function (error) { fallbackToScreenshots(error); });
  } else if (${screenAvailable ? 'true' : 'false'}) {
    pollScreen();
  }
  window.addEventListener('beforeunload', function () {
    stopVideoStream();
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

