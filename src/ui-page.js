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
    ? 'Mock mode is active. Connect your phone and run npm run live to see its screen.'
    : locked
      ? 'Unlock your phone to show the live screen.'
      : (screenAvailable ? 'Waiting for the phone screen�' : 'Phone screen preview is unavailable.');
  const initialVideoStatus = videoAvailable ? 'Video starting � 90 fps target' : 'Screenshot preview';
  const title = `HEAVEN Mobile Control � ${model || 'device'}`;
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
    overflow: hidden; cursor: default; touch-action: none;
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
  .hud-target.ghost { opacity: .85; }
  #aim-crosshair { position: absolute; z-index: 4; transform: translate(-50%, -50%); pointer-events: none; display: none; }
  .inspector-box { border: 1px solid var(--line); border-radius: 10px; background: #0e1520; margin-top: 10px; padding: 10px; }
  .inspector-box h3 { margin: 0 0 8px; font-size: 12px; color: var(--text); text-transform: uppercase; letter-spacing: .05em; }
  .inspector-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 6px 0; font-size: 12px; color: #b5c4d6; }
  .inspector-row input[type="text"], .inspector-row input[type="number"], .inspector-row select { width: 140px; background: #0b121c; color: var(--text); border: 1px solid #2d4055; border-radius: 7px; padding: 7px 8px; font: inherit; outline: none; }
  .inspector-row input.capturing { border-color: #ff0000; box-shadow: 0 0 0 2px #ff000033; color: #ffd479; }
  .inspector-hint { font-size: 11px; color: var(--muted); }
  .inspector-status { font-size: 11px; color: #f4d783; min-height: 16px; margin-top: 6px; }
  .inspector-status.error { color: var(--danger); }
  .aim-modal-backdrop { position: fixed; inset: 0; background: #0008; z-index: 30; display: none; align-items: center; justify-content: center; padding: 16px; }
  .aim-modal-backdrop.open { display: flex; }
  .aim-modal { width: min(760px, 100%); max-height: 92vh; overflow: auto; background: #0d0d0d; color: #fff; border: 1px solid #333; border-radius: 10px; box-shadow: 0 24px 80px #000c; }
  .aim-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid #2a2a2a; }
  .aim-modal-head h2 { margin: 0; font-size: 18px; font-weight: 700; }
  .aim-close { width: 34px; height: 34px; border-radius: 6px; border: 1px solid #333; background: #151515; color: #fff; font-size: 18px; cursor: pointer; }
  .aim-tabs { display: flex; gap: 18px; padding: 0 16px; border-bottom: 1px solid #2a2a2a; }
  .aim-tab { padding: 10px 2px; font-size: 14px; color: #bbb; cursor: pointer; border-bottom: 2px solid transparent; }
  .aim-tab.active { color: #fff; border-bottom-color: #ff0000; }
  .aim-body { padding: 14px 16px 18px; }
  .aim-section { margin: 14px 0; }
  .aim-section-head { display: flex; align-items: center; justify-content: space-between; font-size: 16px; font-weight: 700; margin: 0 0 10px; }
  .aim-row { display: grid; grid-template-columns: 1fr 170px; gap: 10px; align-items: center; margin: 8px 0; font-size: 14px; color: #e6e6e6; }
  .aim-row input[type="text"], .aim-row input[type="number"], .aim-row select { width: 100%; background: #1a1a1a; color: #fff; border: 1px solid #3a3a3a; border-radius: 6px; padding: 8px 10px; font: inherit; }
  .aim-row input.capturing { border-color: #ff0000; box-shadow: 0 0 0 2px #ff000033; }
  .aim-switch { position: relative; width: 46px; height: 24px; border-radius: 999px; background: #444; cursor: pointer; border: 1px solid #555; }
  .aim-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: left .15s; }
  .aim-switch.on { background: #ff0000; border-color: #aa0000; }
  .aim-switch.on::after { left: 24px; }
  .aim-instruction { color: #ff0000; font-size: 13px; margin: 6px 0 10px; display: flex; align-items: center; gap: 6px; }
  .aim-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding-top: 12px; border-top: 1px solid #2a2a2a; color: #ddd; font-size: 13px; }
  .aim-trash { width: 34px; height: 34px; border: 1px solid #442222; background: #1a0d0d; color: #ff5555; border-radius: 6px; cursor: pointer; font-size: 16px; }
  .aim-place-btn { margin: 4px 0 8px; padding: 7px 10px; font-size: 12px; border: 1px solid #5a2a2a; background: #221010; color: #ffd6d6; border-radius: 7px; cursor: pointer; }
  .aim-place-btn.armed { border-color: #ff0000; color: #fff; background: #3a1010; }
  .color-wrap { display: flex; align-items: center; gap: 8px; }
  .color-swatch { width: 26px; height: 26px; border-radius: 4px; border: 1px solid #555; cursor: pointer; padding: 0; }
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
  .km-toggle { display: flex; gap: 8px; margin: 10px 0 0; }
  .km-toggle button { flex: 1; padding: 12px 8px; font-size: 12px; border-radius: 10px; background: var(--panel-2); color: var(--text); border: 1px solid var(--line); }
  .km-toggle button.active { border-color: var(--accent); background: #1e4a73; color: #d7eaff; }
  .km-panel { border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2); margin-top: 10px; padding: 10px; display: none; }
  .km-panel.open { display: block; }
  .km-panel h3 { margin: 0 0 8px; font-size: 13px; color: var(--text); text-transform: uppercase; letter-spacing: .06em; }
  .km-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .km-tile { border: 1px solid var(--line); border-radius: 10px; background: #0e1520; padding: 10px 8px; text-align: center; font-size: 12px; font-weight: 600; color: var(--text); cursor: grab; user-select: none; transition: border-color .15s, background .15s; }
  .km-tile:hover { border-color: var(--accent); background: #1a2a40; }
  .km-tile.placing { border-color: #f4d783; background: #3a2e14; box-shadow: 0 0 0 1px #f4d78355; }
  .km-tile .icon { font-size: 18px; line-height: 1; margin-bottom: 6px; display: block; }
  .km-hint { font-size: 11px; color: var(--muted); margin-top: 8px; line-height: 1.4; }
  #stage.layout-editing { cursor: crosshair; }
  #stage.placing-control { cursor: copy; }
  .tap-ripple { position:absolute; width:34px; height:34px; margin:-17px 0 0 -17px; border:2px solid rgba(131,255,201,.95); border-radius:50%; background:rgba(131,255,201,.18); pointer-events:none; z-index:12; transform:scale(.3); opacity:1; animation:tap-ripple .45s ease-out forwards; box-shadow:0 0 0 2px rgba(0,0,0,.2) inset; }
  @keyframes tap-ripple { to { transform:scale(1.8); opacity:0; } }
  .hud-target { cursor: grab; }
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
  @media (max-width: 1000px) { main { grid-template-columns: minmax(0,1fr) 360px; } header { padding-inline: 14px; gap: 8px; } .brand-copy { min-width: 175px; } }
  @media (max-width: 780px) { body { height: auto; min-height: 100vh; overflow: auto; } header { min-height: 62px; height: auto; flex-wrap: wrap; } main { display: flex; flex-direction: column; } .preview-column { min-height: 55vh; } .preview-head { padding-inline: 14px; } .stage-wrap { min-height: 48vh; padding: 12px; } aside { border-left: 0; border-top: 1px solid var(--line); overflow: visible; padding: 12px; } .brand-copy { min-width: 0; } }


  .settings-btn { padding: 8px 12px; font-size: 12px; border: 1px solid #31445b; background: var(--panel-2); color: var(--text); border-radius: 8px; cursor: pointer; }
  .settings-btn:hover { border-color: #5485b8; background: #203148; }
  .settings-backdrop { position: fixed; inset: 0; background: #0008; z-index: 40; display: none; align-items: flex-start; justify-content: center; padding: 24px 16px; overflow: auto; }
  .settings-backdrop.open { display: flex; }
  .settings-panel { width: min(560px, 100%); background: #101722; color: var(--text); border: 1px solid #2b3b50; border-radius: 12px; box-shadow: 0 24px 80px #000c; }
  .settings-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid #223145; }
  .settings-head h2 { margin: 0; font-size: 16px; }
  .settings-close { width: 32px; height: 32px; border-radius: 6px; border: 1px solid #31445b; background: #182333; color: #fff; font-size: 18px; cursor: pointer; }
  .settings-body { padding: 14px 16px 18px; display: grid; gap: 14px; }
  .settings-section { border: 1px solid #223145; border-radius: 10px; background: #0d1420; padding: 12px; }
  .settings-section h3 { margin: 0 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #d6e3f3; }
  .settings-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 8px 0; font-size: 13px; color: #c4d3e5; flex-wrap: wrap; }
  .settings-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .settings-note { font-size: 11px; color: var(--muted); margin-top: 6px; }
  .settings-status { font-size: 12px; color: #9fd4ff; margin-top: 8px; min-height: 18px; white-space: pre-wrap; }
  .settings-status.error { color: var(--danger); }
  .settings-status.ok { color: var(--accent-2); }
  .settings-range { width: 180px; }
  .settings-inline { display: flex; align-items: center; gap: 8px; }
  .settings-toggle { width: 44px; height: 24px; border-radius: 999px; border: 1px solid #3a4f68; background: #253447; position: relative; cursor: pointer; }
  .settings-toggle::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #dce8f5; transition: left .15s; }
  .settings-toggle.on { background: #1e6bab; border-color: #327ab8; }
  .settings-toggle.on::after { left: 22px; }
  .settings-toggle.disabled { opacity: .45; cursor: not-allowed; }
  .settings-confirm { margin-top: 8px; padding: 8px; border: 1px solid #2b3b50; border-radius: 8px; background: #111b29; font-size: 12px; color: #cfe0f5; }

</style>
</head>
<body>
<header>
  <div class="brand-mark">H</div>
  <div class="brand-copy"><h1>Heaven Mobile Control</h1><small>Phone gaming controller</small></div>
  <span class="pill" id="session-pill">connecting�</span>
  <span class="pill" id="device-pill">${escapeHtml(model || 'unknown')} � ${width}&times;${height}</span>
  <span class="pill" id="video-status">${escapeHtml(initialVideoStatus)}</span>
  <span class="spacer"></span>
  <button class="settings-btn" id="settings-open" type="button">Settings</button>
  <button class="danger" id="panic">Release all � Esc</button>
</header>
<div class="banner" id="mock-banner">MOCK TRANSPORT � no device attached; messages are counted, not injected.</div>
<main>
  <section class="preview-column" aria-label="Live phone preview">
    <div class="preview-head"><div><strong>Live phone</strong><small>Drag imported controls to match your HUD</small></div><span class="landscape-pill">USB preview</span><div class="layout-actions"><span id="layout-status"></span><button id="layout-edit-toggle" type="button">Edit layout</button><button id="layout-delete" type="button" disabled>Delete</button></div></div>
    <div class="stage-wrap">
      <div id="stage" aria-label="Phone screen preview and touch test surface">
        <div class="grid"></div>
        <canvas id="phone-video" aria-label="Live Android phone video"></canvas>
        <img id="phone-screen" alt="Live Android phone screen">
        <div id="screen-message">${escapeHtml(initialScreenMessage)}</div>
        <div id="aim-crosshair" aria-hidden="true"></div>
      </div>
    </div>
  </section>
  <aside aria-label="Controller setup">
    <section class="group">
      <h2><span class="step-number">1</span> Keymapping settings</h2>
      <div class="km-toggle">
        <button id="km-keyboard" type="button" class="active">Keyboard</button>
        <button id="km-mouse" type="button">Mouse</button>
      </div>
      <div class="km-panel open" id="km-keyboard-panel">
        <h3>Keyboard actions</h3>
        <div class="km-grid">
          <div class="km-tile" data-km-type="tap"><span class="icon">?</span>Tap spot</div>
          <div class="km-tile" data-km-type="repeat"><span class="icon">?</span>Repeated tap</div>
          <div class="km-tile" data-km-type="dpad"><span class="icon">?</span>D-pad</div>
          <div class="km-tile" data-km-type="aim"><span class="icon">?</span>Aim pan and shoot</div>
          <div class="km-tile" data-km-type="freelook"><span class="icon">??</span>Free look</div>
          <div class="km-tile" data-km-type="script"><span class="icon">??</span>Script</div>
          <div class="km-tile" data-km-type="swipe"><span class="icon">?</span>Swipe</div>
          <div class="km-tile" data-km-type="zoom"><span class="icon">??</span>Zoom</div>
          <div class="km-tile" data-km-type="tilt"><span class="icon">?</span>Tilt</div>
          <div class="km-tile" data-km-type="mobadpad"><span class="icon">?</span>MOBA D-pad</div>
          <div class="km-tile" data-km-type="mobaskill"><span class="icon">??</span>MOBA Skill pad</div>
          <div class="km-tile" data-km-type="rotate"><span class="icon">??</span>Rotate</div>
          <div class="km-tile" data-km-type="edgescroll"><span class="icon">?</span>Edge scroll</div>
          <div class="km-tile" data-km-type="scroll"><span class="icon">?</span>Scroll</div>
          <div class="km-tile" data-km-type="mousewheel"><span class="icon">??</span>Mouse wheel</div>
        </div>
        <p class="km-hint">Drag a tile onto the phone screen (or tap a tile then click the screen) to place it. Click a placed control to select it, then click Key or press a key to assign/change it. Drag placed controls to reposition. Esc cancels capture/panic release.</p>
        <div class="row" style="margin-top:8px;gap:8px;align-items:center;flex-wrap:wrap;">
          <button id="mapping-start" type="button" class="primary">Start mapping</button>
          <span id="mapping-status" class="pill bad" style="font-size:11px;padding:4px 8px;">Mapping OFF — press Start mapping to play</span>
        </div>
        <div id="mapping-hint" class="inspector-status" style="margin:4px 0 8px;min-height:18px;"></div>
        <span id="km-selected-info" class="hint" style="display:block;margin:0 0 6px;">No control selected</span>
        <div class="inspector-box" id="control-inspector">
          <h3>Selected control</h3>
          <div class="inspector-row"><span>Type</span><b id="inspector-type">�</b></div>
          <div class="inspector-row"><span>Key <span class="inspector-hint" id="inspector-key-hint">(click to set)</span></span><input id="inspector-key" type="text" readonly placeholder="Click to set key"></div>
          <div class="row" style="margin-top:8px;gap:8px;">
            <button id="inspector-aim-settings" type="button" style="display:none;">Aim settings</button>
          </div>
          <div id="inspector-status" class="inspector-status"></div>
        </div>
        <div class="kv"><span>Tap buttons placed</span><b id="km-tap-count">0</b></div>
        <div class="kv"><span>Keys bound</span><b id="km-key-count">0</b></div>
      </div>
      <div class="km-panel" id="km-mouse-panel">
        <h3>Mouse actions</h3>
        <p class="km-hint">Mouse controls are active while mapping runs. X/Y are percentages (0–100, 2 dp). Changes save immediately and apply live while mapping is on.</p>
        <div class="aim-row" style="grid-template-columns:1fr 90px 90px auto;gap:6px;margin:8px 0 2px;"><span>Aim anchor</span><input id="mouse-aim-x" type="number" min="0" max="100" step="0.01" value="50.00"><input id="mouse-aim-y" type="number" min="0" max="100" step="0.01" value="50.00"><button id="mouse-place-aim" type="button">Place</button></div>
        <div class="aim-row" style="grid-template-columns:1fr 90px 90px auto;gap:6px;margin:6px 0 2px;"><span>Fire (left click)</span><input id="mouse-fire-x" type="number" min="0" max="100" step="0.01" value="75.26"><input id="mouse-fire-y" type="number" min="0" max="100" step="0.01" value="72.81"><button id="mouse-place-fire" type="button">Place</button></div>
        <div class="aim-row" style="grid-template-columns:1fr 90px 90px auto;gap:6px;margin:6px 0 8px;"><span>Scope (right click)</span><input id="mouse-scope-x" type="number" min="0" max="100" step="0.01" value="85.00"><input id="mouse-scope-y" type="number" min="0" max="100" step="0.01" value="65.00"><button id="mouse-place-scope" type="button">Place</button></div>
        <div class="aim-row" style="grid-template-columns:1fr 90px 90px;gap:6px;margin:8px 0 2px;"><span>Aim sensitivity X / Y</span><input id="mouse-sens-x" type="number" min="0.1" max="10" step="0.01" value="1.42"><input id="mouse-sens-y" type="number" min="0.1" max="10" step="0.01" value="1.46"></div>
        <div class="kv" style="margin-top:4px;"><span>Aim sensitivity (avg)</span><b id="km-mouse-sensitivity">1.44</b></div>
        <input type="range" min="0.1" max="10" step="0.01" value="1.44" style="width:100%;margin-top:6px;" id="km-mouse-range">
        <div id="mouse-settings-status" class="inspector-status" style="margin-top:8px;min-height:18px;"></div>
      </div>
    </section>
    <section class="group advanced">
      <summary>Diagnostics</summary>
      <div class="kv"><span>active pointers</span><b id="k-count">0</b></div>
      <div class="kv"><span>messages sent</span><b id="k-messages">0</b></div>
      <div class="kv"><span>panics</span><b id="k-panics">0</b></div>
      <div class="kv"><span>achieved Hz</span><b id="k-hz">�</b></div>
      <div class="kv"><span>last proof</span><b id="k-proof">�</b></div>
      <div class="kv"><span>video connected</span><b id="k-video-connected">�</b></div>
      <div class="kv"><span>video frames</span><b id="k-video-frames">0</b></div>
      <div class="kv"><span>keyframe</span><b id="k-video-keyframe">�</b></div>
      <div class="kv"><span>codec</span><b id="k-video-codec">�</b></div>
      <div class="kv"><span>video error</span><b id="k-video-error">�</b></div>
      <div class="kv"><span>server error</span><b id="k-server-error">�</b></div>
      <div id="log"></div>
    </section>
    <footer>
      <span id="f-note">Controls run only while mapping is active.</span><span class="spacer"></span><span id="f-token">${escapeHtml(token.slice(0, 6))}�</span>
    </footer>
  </aside>
</main>


<div id="settings-backdrop" class="settings-backdrop" aria-hidden="true">
  <div class="settings-panel" role="dialog" aria-label="Settings">
    <div class="settings-head"><h2>Settings</h2><button id="settings-close" class="settings-close" type="button" aria-label="Close settings">×</button></div>
    <div class="settings-body">
      <section class="settings-section" aria-label="Presets">
        <h3>Presets</h3>
        <div class="settings-actions">
          <button id="preset-import-btn" type="button">Import preset</button>
          <button id="preset-export-btn" type="button">Export preset</button>
          <input id="preset-file-input" type="file" accept=".json,application/json" style="display:none">
        </div>
        <div id="preset-import-confirm" class="settings-confirm" style="display:none;"></div>
        <div class="settings-actions" id="preset-apply-row" style="display:none;margin-top:8px;">
          <button id="preset-apply-btn" type="button" class="primary">Apply preset</button>
        </div>
        <div id="preset-status" class="settings-status"></div>
      </section>
      <section class="settings-section" aria-label="Audio forwarding">
        <h3>Audio forwarding</h3>
        <div class="settings-row"><span>Play phone audio on this laptop</span><div id="audio-toggle" class="settings-toggle" role="switch" aria-checked="false" tabindex="0"></div></div>
        <div class="settings-note">Needs one click to start — browsers block audio until you interact with the page.</div>
        <div class="settings-row"><span>Volume</span><div class="settings-inline"><input id="audio-volume" class="settings-range" type="range" min="0" max="100" value="80"><span id="audio-volume-label">80</span></div></div>
        <div class="settings-row"><span>Mute</span><button id="audio-mute-btn" type="button">Mute</button></div>
        <div id="audio-status" class="settings-status">Audio forwarding is off.</div>
      </section>
    </div>
  </div>
</div>

<div id="aim-modal-backdrop" class="aim-modal-backdrop" aria-hidden="true">
  <div class="aim-modal" role="dialog" aria-label="Aim, pan and shoot settings">
    <div class="aim-modal-head"><h2>Aim, pan and shoot settings</h2><button id="aim-close" class="aim-close" type="button">?</button></div>
    <div class="aim-tabs"><div id="aim-tab-km" class="aim-tab active">Keyboard and mouse</div><div id="aim-tab-gamepad" class="aim-tab">Gamepad</div></div>
    <div class="aim-body" id="aim-body-km">
      <section class="aim-section">
        <h3 class="aim-section-head">Key bindings</h3>
        <div class="aim-row"><span>Start/Stop</span><input id="aim-start-stop" type="text" readonly></div>
        <div class="aim-row"><span>Suspend</span><input id="aim-suspend" type="text" readonly></div>
      </section>
      <section class="aim-section">
        <h3 class="aim-section-head">Properties</h3>
        <div class="aim-row"><span>X</span><input id="aim-x" type="number" step="0.01" min="0" max="100"></div>
        <div class="aim-row"><span>Y</span><input id="aim-y" type="number" step="0.01" min="0" max="100"></div>
        <div class="aim-row"><span>Mouse sensitivity X</span><input id="aim-sens-x" type="number" step="0.01" min="0.1" max="10"></div>
        <div class="aim-row"><span>Mouse sensitivity Y</span><input id="aim-sens-y" type="number" step="0.01" min="0.1" max="10"></div>
        <div class="aim-row"><span>Tweaks</span><input id="aim-tweaks" type="number" step="1"></div>
        <div class="aim-row"><span>Mouse acceleration</span><select id="aim-accel"><option value="false">FALSE</option><option value="true">TRUE</option></select></div>
      </section>
      <section class="aim-section">
        <h3 class="aim-section-head"><span>Crosshair</span><div id="aim-crosshair-toggle" class="aim-switch on" role="switch" aria-checked="true"></div></h3>
        <div class="aim-row"><span>Style</span><select id="aim-crosshair-style"><option>Cross</option><option>Dot</option><option>Circle</option></select></div>
        <div class="aim-row"><span>Size</span><input id="aim-crosshair-size" type="number" step="1" min="1" max="10"></div>
        <div class="aim-row"><span>Opacity (Changes applied on next start)</span><input id="aim-crosshair-opacity" type="number" step="1" min="0" max="100"></div>
        <div class="aim-row"><span>Color</span><div class="color-wrap"><input id="aim-crosshair-color-picker" class="color-swatch" type="color" value="#aa0000"><input id="aim-crosshair-color" type="text" value="#AA0000"></div></div>
      </section>
      <section class="aim-section">
        <h3 class="aim-section-head"><span>Fire with left click</span><div id="aim-fire-toggle" class="aim-switch on" role="switch" aria-checked="true"></div></h3>
        <div class="aim-instruction">?? Place the fire icon in the fire weapon control on the screen</div>
        <button id="aim-place-fire" class="aim-place-btn" type="button">Place fire position</button>
        <div class="aim-row"><span>Action position X</span><input id="aim-fire-x" type="number" step="0.01" min="0" max="100"></div>
        <div class="aim-row"><span>Action position Y</span><input id="aim-fire-y" type="number" step="0.01" min="0" max="100"></div>
        <div class="aim-row"><span>Action</span><select id="aim-fire-action"><option>LEFT CLICK</option><option>RIGHT CLICK</option><option>MIDDLE CLICK</option></select></div>
      </section>
      <section class="aim-section">
        <h3 class="aim-section-head"><span>Look around mode</span><div id="aim-look-toggle" class="aim-switch" role="switch" aria-checked="false"></div></h3>
        <div class="aim-instruction">?? Place the eye icon on the look around control if available</div>
        <button id="aim-place-look" class="aim-place-btn" type="button">Place free look position</button>
        <div class="aim-row"><span>Free look position X</span><input id="aim-look-x" type="number" step="0.01" min="-1" max="100"></div>
        <div class="aim-row"><span>Free look position Y</span><input id="aim-look-y" type="number" step="0.01" min="-1" max="100"></div>
      </section>
      <div class="aim-footer"><span>? Changes will be saved automatically</span><button id="aim-delete" class="aim-trash" type="button" title="Delete Aim control">??</button></div>
      <div id="aim-panel-status" class="inspector-status" style="margin-top:8px;"></div>
    </div>
    <div class="aim-body" id="aim-body-gamepad" style="display:none;"><p style="color:#ccc;margin:8px 0;">Gamepad settings are not supported yet</p></div>
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
  function updateMappingStatusUi() {
    var st = document.getElementById('mapping-status');
    var btn = document.getElementById('mapping-start');
    if (st) {
      st.textContent = mappingActive ? 'Mapping ON — keys and mouse are live' : 'Mapping OFF — press Start mapping to play';
      st.className = 'pill ' + (mappingActive ? 'ok' : 'bad');
      st.style.fontSize = '11px';
      st.style.padding = '4px 8px';
    }
    if (btn) btn.textContent = mappingActive ? 'Stop mapping' : 'Start mapping';
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
    document.getElementById('device-pill').textContent = '${escapeHtml(model || 'unknown')} � ' + W + '�' + H;
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
    var labels = { tap: 'Tap', repeat: 'Repeat', dpad: 'D-pad', aim: 'Aim', freelook: 'Free look', script: 'Script', swipe: 'Swipe', zoom: 'Zoom', tilt: 'Tilt', mobadpad: 'MOBA D-pad', mobaskill: 'MOBA Skill', rotate: 'Rotate', edgescroll: 'Edge scroll', scroll: 'Scroll', mousewheel: 'Mouse wheel' };
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
      var keyLabel = isPlaceholder ? 'Press a key�' : displayKey(target.key);
      var actionLabel = target.actionLabel || kmTypeLabel(target.action || target.kmType || 'tap');
      node.innerHTML = '<i></i><b>' + escapeClient(actionLabel) + '</b><b>' + escapeClient(keyLabel) + '</b>';
      node.title = actionLabel + (isPlaceholder ? ' (press a key to assign)' : ' [' + keyLabel + ']') + ' � drag to move';
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
      if (placingNewControl) info.textContent = 'Click screen to place control�';
      else if (aimPlacementMode === 'fire') info.textContent = 'Click screen to place fire position…';
      else if (aimPlacementMode === 'look') info.textContent = 'Click screen to place free look position…';
      else if (aimPlacementMode === 'aim-anchor-mouse') info.textContent = 'Click screen to place Aim anchor…';
      else if (aimPlacementMode === 'scope-mouse') info.textContent = 'Click screen to place Scope position…';
      else if (selectedHudTarget >= 0 && importedHudTargets[selectedHudTarget]) {
        var t = importedHudTargets[selectedHudTarget];
        var k = t.key && !/^km:/.test(t.key) ? displayKey(t.key) : 'unassigned';
        info.textContent = (t.actionLabel || kmTypeLabel(t.action)) + ' � key: ' + k + ' (click Key/press a key to set, drag to move)';
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
    if (typeEl) typeEl.textContent = t ? (t.actionLabel || kmTypeLabel(t.action || t.kmType)) : '�';
    if (aimBtn) aimBtn.style.display = (t && (t.action === 'aim' || t.kmType === 'aim')) ? '' : 'none';
    if (!keyEl) return;
    keyEl.classList.toggle('capturing', !!inspectorKeyCapture);
    if (inspectorKeyCapture && t) {
      keyEl.value = 'Press a key�';
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
    setLayoutStatus('Placed ' + kmTypeLabel(type) + ' � click Key or press a key to assign it.');
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

  // Single stage pointer handler: (a) place armed control, (b) marker edit in layout mode, (c) layout miss deselect, (d) tap
  var tapDrag = null; // { pointerId, downPoint, moved }
  stage.addEventListener('pointerdown', function (evt) {
    try {
      // (a) armed placement
      if (placingNewControl) {
        evt.preventDefault();
        evt.stopImmediatePropagation();
        var pType = pendingControlType || 'tap';
        var position = toDevice(evt);
        placeControlAt(position.x / Math.max(1, W), position.y / Math.max(1, H), pType);
        try { setTapStatus('Placed ' + kmTypeLabel(pType) + ' — press a key to assign it. No tap sent.'); } catch (e) {}
        return;
      }
      // (b) marker select/move only in Edit layout mode
      var targetNode = evt.target.closest && evt.target.closest('.hud-target');
      if (targetNode && layoutEditMode) {
        evt.preventDefault();
        evt.stopImmediatePropagation();
        selectedHudTarget = Number(targetNode.dataset.targetIndex);
        var startPoint = toDevice(evt);
        movingHudTarget = { pointerId: evt.pointerId, index: selectedHudTarget, startX: startPoint.x, startY: startPoint.y, moved: false };
        try { stage.setPointerCapture(evt.pointerId); } catch (e) {}
        renderHudTargets();
        try { setLayoutStatus('Selected ' + ((importedHudTargets[selectedHudTarget] || {}).actionLabel || 'control') + ' — drag to move or press a key to assign.'); } catch (e) {}
        return;
      }
      // (c) edit mode miss: deselect and fall through to tap (do not swallow)
      if (layoutEditMode && !targetNode) {
        if (selectedHudTarget !== -1) {
          selectedHudTarget = -1;
          try { renderHudTargets(); } catch (e) {}
        }
        try { setLayoutStatus('Edit layout: no marker selected — sending tap.'); } catch (e) {}
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
      setTapStatus('Tapping at ' + lastTapInfo.px + '%, ' + lastTapInfo.py + '% (device ' + point.x + ',' + point.y + ')…');
      try { console.log('[tap] down request', { op: 'down', name: 'A', x: point.x, y: point.y }); } catch (e) {}
      api('/api/input', { op: 'down', name: 'A', x: point.x, y: point.y })
        .then(function (res) {
          try {
            var msgCount = res && (res.totalMessages != null ? res.totalMessages : (res.pointers && res.pointers.totalMessages != null ? res.pointers.totalMessages : null));
            var suffix = (msgCount != null ? (' — messages sent: ' + msgCount) : '');
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
    wirePlace('mouse-place-aim', 'aim-anchor-mouse', 'Click screen to place Aim anchor…');
    wirePlace('mouse-place-fire', 'fire', 'Click screen to place Fire position…');
    wirePlace('mouse-place-scope', 'scope-mouse', 'Click screen to place Scope position…');
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
        this.value = 'Press a key�'; this.classList.add('capturing');
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
    if (placeFire) placeFire.addEventListener('click', function(){ if(aimModalOpenIndex<0) return; if(mappingActive){ var st=document.getElementById('aim-panel-status'); if(st){st.textContent='Stop mapping before placing.'; st.className='inspector-status error';} return; } aimPlacementMode='fire'; this.classList.add('armed'); var ol=document.getElementById('aim-place-look'); if(ol) ol.classList.remove('armed'); setLayoutStatus('Click screen to place fire position�'); renderHudTargets(); });
    var placeLook = document.getElementById('aim-place-look');
    if (placeLook) placeLook.addEventListener('click', function(){ if(aimModalOpenIndex<0) return; if(mappingActive){ var st=document.getElementById('aim-panel-status'); if(st){st.textContent='Stop mapping before placing.'; st.className='inspector-status error';} return; } aimPlacementMode='look'; this.classList.add('armed'); var of=document.getElementById('aim-place-fire'); if(of) of.classList.remove('armed'); setLayoutStatus('Click screen to place free look position�'); renderHudTargets(); });

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
    setLayoutStatus('Drag to screen and release to place ' + kmTypeLabel(tileDrag.type) + '�');
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
      setLayoutStatus('Click screen to place ' + kmTypeLabel(type) + '�');
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
        ? 'Edit mode on � drag a marker to move it.'
        : 'Edit mode on � click a tile, then click the screen to place your first control.');
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
      setMappingHint('Requesting mouse capture… click the phone screen if prompted.', false);
      try {
        var lockRequest = stage.requestPointerLock();
        Promise.resolve(lockRequest).then(function () {
          if (document.pointerLockElement !== stage) {
            throw new Error('Mouse capture was not granted — click on the phone screen first, then click Start mapping again.');
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
              throw new Error('Mouse capture ended during startup — click the phone screen, then click Start mapping again.');
            });
          }
          mappingActive = true;
          renderHudTargets();
          setMappingHint('Mapping active. Press Esc to stop.', false);
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
            msg = 'Mouse capture was not granted — click on the phone screen first, then click Start mapping again.';
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
    if (!silent) setMappingHint('Mapping OFF.', false);
  }

  function panic() {
    mappingActive = false;
    if (document.pointerLockElement === stage) { try { document.exitPointerLock(); } catch (e) {} }
    queuedApi({ op: 'panic' }).catch(report);
    renderHudTargets();
    setMappingHint('Mapping OFF (panic).', false);
  }

  document.addEventListener('pointerlockchange', function () {
    if (mappingActive && document.pointerLockElement !== stage) {
      mappingActive = false;
      queuedApi({ op: 'mapping-stop' }).catch(report);
      renderHudTargets();
      setMappingHint('Mouse capture ended — mapping stopped. Click the phone screen, then Start mapping again.', true);
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

    // Quick-assign when control selected (not in capture mode, not typing in input)
    if (selectedHudTarget >= 0 && importedHudTargets[selectedHudTarget] && !mappingActive) {
      var tag = (evt.target && evt.target.tagName) ? evt.target.tagName.toLowerCase() : '';
      var isTextField = (tag === 'input' || tag === 'textarea' || tag === 'select');
      if (!isTextField) {
        // don't steal if aim modal open and focus inside it except allow? better ignore when modal open without capture
        if (aimModalOpenIndex >= 0) { /* modal fields handle themselves */ }
        else {
          // allow quick assign only when explicitly editing (Edit mode on) to avoid accidental rebinds
          // but keep previous behavior of allowing when selected and not mapping: user asked for editable via Key field click.
          // Do nothing here; require Key field click for intentional capture.
        }
      }
    }

    var isMappedKey = key === profileCameraToggleKey || importedTapBindings.some(function (target) { return target.key === key; })
      || importedHudTargets.some(function (t) { return t && ((t.action === 'aim' || t.kmType === 'aim') && (t.startStopKey === key || t.suspendKey === key)); });
    if (!mappingActive) {
      var tag = (evt.target && evt.target.tagName) ? evt.target.tagName.toLowerCase() : '';
      var typing = (tag === 'input' || tag === 'textarea' || tag === 'select' || (evt.target && evt.target.isContentEditable));
      if (!typing && isMappedKey) {
        setMappingHint('Mapping is off — click Start mapping first', true, 3000);
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
        var mockLabel = state.mock ? ' (mock)' : '';
        if (state.session && state.session.running) {
          pill.textContent = 'session up' + mockLabel;
          pill.className = 'pill ok';
        } else {
          pill.textContent = 'session down' + mockLabel;
          pill.className = 'pill bad';
        }
        screenWakeState = state.screenWake || screenWakeState || null;
        screenLocked = Boolean((screenWakeState && screenWakeState.locked) || (state.device && state.device.locked));
        if (screenLocked) {
          screenMessage.textContent = 'Unlock your phone to show the live screen.';
          screenMessage.style.display = 'flex';
        } else if (INITIAL_SCREEN_LOCKED && !videoConnected && !currentScreenUrl) {
          screenMessage.textContent = ${JSON.stringify(screenAvailable ? 'Waiting for the phone screen�' : 'Phone screen preview is unavailable.')};
        }
        placeMarkers((state.pointers && state.pointers.active) || []);
        document.getElementById('k-count').textContent = (state.pointers && state.pointers.count) || 0;
        document.getElementById('k-messages').textContent = (state.pointers && state.pointers.totalMessages) || 0;
        document.getElementById('k-panics').textContent = (state.pointers && state.pointers.panics) || 0;
        document.getElementById('k-hz').textContent = state.lastSweep ? state.lastSweep.achievedHz : '�';
        document.getElementById('k-proof').textContent = state.lastProof
          ? (state.lastProof.ok ? 'ok' : 'failed') + ' � ' + state.lastProof.totalMs + ' ms'
          : '�';
        var video = state.video || {};
        document.getElementById('k-video-connected').textContent = video.videoConnected ? 'yes' : 'no';
        document.getElementById('k-video-frames').textContent = video.videoFramesReceived ?? 0;
        document.getElementById('k-video-keyframe').textContent = video.keyframeReceived ? 'yes' : 'no';
        document.getElementById('k-video-codec').textContent = video.codecConfigured ? 'h264' : '�';
        document.getElementById('k-video-error').textContent = video.lastVideoError || '�';
        var serverErr = video.lastServerError || state.lastServerError || (state.session && state.session.lastServerError) || '�';
        var serverErrEl = document.getElementById('k-server-error');
        if (serverErrEl) serverErrEl.textContent = serverErr;
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
    document.getElementById('video-status').textContent = 'Video failed � showing screenshot preview';
    if (${screenAvailable ? 'true' : 'false'} && !screenshotPolling) pollScreen();
  }

  function startVideo() {
    if (!window.VideoDecoder || !window.EncodedVideoChunk || !window.ReadableStream) {
      throw new Error('This browser does not support low-latency H.264 video decoding');
    }
    if (screenLocked) {
      document.getElementById('video-status').textContent = 'Unlock your phone';
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
    document.getElementById('video-status').textContent = 'Video starting � 90 fps target';
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
          document.getElementById('video-status').textContent = 'Video live � ' + fps + ' fps � ' + decodedWidth + '�' + decodedHeight;
          renderedFrames = 0;
          fpsWindowStart = now;
        } else if (decodedFrames === 1) {
          document.getElementById('video-status').textContent = 'Video live � ' + decodedWidth + '�' + decodedHeight;
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
