#!/usr/bin/env node
/**
 * Hardware verification harness — the "physically tested" step.
 *
 * It does NOT use the desktop UI. Instead it asks the phone to display a page
 * that renders every touch point the OS delivers, then injects the two-pointer
 * sequence and takes real screenshots of the device.
 *
 *   PC  --adb forward-->  scrcpy-server (shell uid)  --injects-->  Android input
 *   phone Chrome  <--adb reverse (USB)---  this script's tiny HTTP server
 *
 * adb reverse is a USB transport, so the "no Wi-Fi or LAN" rule still holds: the
 * page is served over the cable, not the network.
 *
 * Usage:
 *   node tools/verify-multitouch.js [--sweep-ms 2000] [--hold-ms 1500]
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { Adb } from '../src/adb.js';
import { parseArgs } from '../src/config.js';
import { readDeviceInfo, selectDevice } from '../src/device.js';
import { Logger } from '../src/log.js';
import { PointerManager } from '../src/pointers.js';
import { ScrcpySession } from '../src/session.js';
import { sweepCircle } from '../src/sequences.js';
import { delay } from '../src/control-channel.js';

const ARTIFACTS = path.join(process.cwd(), 'artifacts');

const PAGE = `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>multitouch probe</title>
<style>
  html,body{margin:0;height:100%;overflow:hidden;background:#000;color:#fff;
    font-family:system-ui,sans-serif;touch-action:none;overscroll-behavior:none}
  #hud{position:fixed;top:0;left:0;right:0;padding:10px 14px;font-size:20px;
    background:#000a;border-bottom:2px solid #333}
  #count{font-size:64px;font-weight:800;line-height:1;color:#7ee787}
  #count.zero{color:#8b93a7}
  #ids{font-size:20px;color:#9fb4d0;min-height:28px}
  canvas{position:fixed;top:0;left:0;width:100%;height:100%}
  #note{position:fixed;bottom:8px;left:14px;right:14px;font-size:14px;color:#6b7488}
</style></head>
<body>
<div id="hud">
  <div>SIMULTANEOUS TOUCH POINTS</div>
  <div id="count" class="zero">0</div>
  <div id="ids"></div>
</div>
<canvas id="c"></canvas>
<div id="note">This page only displays what Android delivers. Input travels over USB.</div>
<script>
(function(){
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var countEl = document.getElementById('count');
  var idsEl = document.getElementById('ids');
  var W = 0, H = 0, dpr = window.devicePixelRatio || 1;

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', function(){ resize(); });

  var points = {};
  var trails = {};
  var maxSeen = 0;

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 3;
    var ids = Object.keys(points);
    countEl.textContent = String(ids.length);
    countEl.className = ids.length === 0 ? 'zero' : '';
    idsEl.textContent = 'peak seen: ' + maxSeen + (ids.length ? '  |  ' + ids.map(function(id){
      var p = points[id]; return '#' + id + ' @' + Math.round(p.x) + ',' + Math.round(p.y);
    }).join('  ') : '');

    // per-pointer trails: a held pointer draws a dot, a moving one draws a path
    Object.keys(trails).forEach(function(id){
      var path = trails[id];
      if (path.length < 2) { return; }
      ctx.strokeStyle = '#2f6f4a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (var i = 1; i < path.length; i++) { ctx.lineTo(path[i].x, path[i].y); }
      ctx.stroke();
    });

    ids.forEach(function(id){
      var p = points[id];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 54, 0, Math.PI * 2);
      ctx.strokeStyle = '#4da3ff';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#7ee787';
      ctx.fill();
      ctx.fillStyle = '#cfe6ff';
      ctx.font = '600 22px system-ui';
      ctx.fillText('#' + id, p.x + 64, p.y - 40);
    });
  }

  function record(list) {
    var next = {};
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      next[t.identifier] = { x: t.clientX, y: t.clientY };
    }
    points = next;
    if (Object.keys(points).length > maxSeen) { maxSeen = Object.keys(points).length; }
    for (var key in next) {
      var trail = trails[key] || (trails[key] = []);
      trail.push({ x: next[key].x, y: next[key].y });
      if (trail.length > 600) { trail.splice(0, trail.length - 600); }
    }
    render();
  }

  function onTouch(e) { e.preventDefault(); record(e.touches); }
  document.addEventListener('touchstart', onTouch, { passive: false });
  document.addEventListener('touchmove', onTouch, { passive: false });
  document.addEventListener('touchend', onTouch, { passive: false });
  document.addEventListener('touchcancel', onTouch, { passive: false });
  render();
})();
</script>
</body></html>`;

async function main() {
  const argv = process.argv.slice(2);
  const sweepMs = numberFlag(argv, '--sweep-ms', 1500);
  const holdMs = numberFlag(argv, '--hold-ms', 1200);
  const port = numberFlag(argv, '--port', 8791);

  const logger = new Logger({ level: 'info', file: path.join('logs', 'verify-multitouch.jsonl') });
  fs.mkdirSync(ARTIFACTS, { recursive: true });

  const { toolchain } = parseArgs([]);
  const adb = new Adb(toolchain.adbPath, { logger });
  const serial = await selectDevice(adb, null, logger);
  const device = await readDeviceInfo(adb, serial);

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(PAGE);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(undefined));
  });
  logger.info('probe page served', { url: `http://127.0.0.1:${port}/` });

  const session = new ScrcpySession({
    adb,
    serial,
    device,
    logger,
    serverJarPath: toolchain.serverJarPath,
    allowPowerOn: false,
  });

  let points = null;
  const result = { ok: false, steps: [], screenshots: [] };

  try {
    // Serve the page to the phone over the USB cable only.
    await adb.run(['reverse', `tcp:${port}`, `tcp:${port}`], { serial });
    logger.info('adb reverse ready', { port });
    await adb.shell(['am', 'start', '-a', 'android.intent.action.VIEW', '-d', `http://127.0.0.1:${port}/`], {
      serial,
      allowFailure: true,
    });
    result.steps.push('opened the probe page on the device');
    await delay(4000); // let the browser paint

    await session.start();
    result.steps.push('control-only scrcpy session started');

    points = new PointerManager({ session, screen: { width: device.width, height: device.height }, logger });

    result.screenshots.push(await screenshot(adb, serial, '0-before'));

    const ax = Math.round(device.width * 0.35);
    const ay = Math.round(device.height * 0.45);
    const bx = Math.round(device.width * 0.65);
    const by = Math.round(device.height * 0.45);

    points.down('A', ax, ay);
    await delay(150);
    points.down('B', bx, by);
    await delay(700);
    result.screenshots.push(await screenshot(adb, serial, '1-two-pointers-hold'));
    result.steps.push('two pointers down; screenshot taken');

    const sweep = await sweepCircle(points, 'B', {
      durationMs: sweepMs,
      hz: 120,
      radius: Math.round(device.width * 0.12),
      turns: 2,
    });
    result.sweep = sweep;
    result.screenshots.push(await screenshot(adb, serial, '2-swept-with-a-held'));
    result.steps.push('pointer B swept while pointer A stayed down; screenshot taken');

    await delay(holdMs);
    result.screenshots.push(await screenshot(adb, serial, '3-still-held'));
    result.steps.push('both pointers still held after the sweep; screenshot taken');

    points.up('B');
    await delay(120);
    points.up('A');
    await delay(600);
    result.screenshots.push(await screenshot(adb, serial, '4-released'));
    result.steps.push('both pointers released; screenshot taken');

    result.ok = true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    logger.error('verification failed', { message: result.error });
  } finally {
    if (points) {
      await points.panic('verify-cleanup').catch(() => undefined);
    }
    await session.stop().catch(() => undefined);
    await adb.run(['reverse', '--remove', `tcp:${port}`], { serial, allowFailure: true }).catch(() => undefined);
    await new Promise((resolve) => server.close(() => resolve(undefined)));
    await logger.close();

    const reportPath = path.join(ARTIFACTS, 'verify-multitouch.json');
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.stdout.write(`\nreport: ${reportPath}\n`);
  }

  process.exitCode = result.ok ? 0 : 1;
}

/**
 * @param {Adb} adb
 * @param {string} serial
 * @param {string} name
 * @returns {Promise<string>}
 */
async function screenshot(adb, serial, name) {
  const file = path.join(ARTIFACTS, `verify-${name}.png`);
  const buffer = await new Promise((resolve, reject) => {
    const child = spawn(adb.executable, ['-s', serial, 'exec-out', 'screencap', '-p'], { windowsHide: true });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`screencap exited with ${code}`));
      }
    });
  });
  fs.writeFileSync(file, buffer);
  return file;
}

/**
 * @param {string[]} argv
 * @param {string} name
 * @param {number} fallback
 */
function numberFlag(argv, name, fallback) {
  const index = argv.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  const value = Number(argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
