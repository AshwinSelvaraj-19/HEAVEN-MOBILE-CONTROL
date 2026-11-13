# HEAVEN-MOBILE-CONTROL — Phase 3A: keyboard and mouse control

A Windows controller that maps keyboard and mouse input to touch pointers on an
Android phone over a **USB cable only**, using the scrcpy 4.1 server as the
injection transport. The loopback controller page receives the input and shows
the live phone screen and touch positions; keyboard/mouse mapping is active
only while that page has pointer lock. The preview uses scrcpy's native H.264
video stream at native resolution (90 fps ceiling, 40 Mbps), while touch input
uses the separate low-latency scrcpy control socket.

No root. No Shizuku. No Wi-Fi. No `/dev/input`. No minitouch. No `adb shell input`
per movement. No modifications to Free Fire MAX.

The underlying USB multi-touch transport has been physically verified on the
target hardware. The new keyboard and mouse mapping flow is implemented in the
controller page and still needs hardware validation.

---

## 1. What was physically verified

### Start the controller

1. Connect the Android phone by USB and enable USB debugging.
2. Install the scrcpy 4.1 server and Android platform tools, or pass their paths
   with `--server-jar` and `--adb`.
3. Run `npm run live`. The controller opens in your browser.
4. Configure the touch locations to match the game's on-screen controls, then
   select each key field and press the key you want to assign. Select **Start
   mapping**. The page captures the mouse; the assigned keys move, fire, and
   scope, while mouse movement aims and left/right click remain available.
   Press **Q** to stop
   mapping or **Escape** to release all active touches.

You can exercise the UI without a phone with `node src/main.js --live --mock`.
The mock mode records touch events but does not send them to a device.

Run `npm run build` for the source check and `npm test` for the automated
regression suite.

Target: **Samsung SM-S721B (Galaxy S24 FE), Android 16, SDK 36, 1080×2340**,
connected by USB to Windows 10. The UI decodes the phone's H.264 stream at full
display resolution and shows the actual decoded frame rate. It requests up to
90 fps; the delivered rate depends on the phone display mode, the game's own
frame-rate setting, and the browser decoder. Touch injection shares the same
scrcpy session on its separate control socket. The phone must use High/Adaptive
Motion Smoothness and the game must produce 90 fps to reach the target.

| Claim | How it was proven | Evidence |
|---|---|---|
| Control-only session starts under the `shell` UID | server logged `[server] INFO: Device: [samsung] samsung SM-S721B (Android 16)`; socket connected; clean shutdown | `logs/*.jsonl` |
| Touch events are injected at all | `DOWN`+`UP` pair sent, no server error, 64 bytes | `--selftest` |
| **Two simultaneous pointers exist at once** | phone displayed `2` active touch points with distinct ids `#0` and `#1` | `artifacts/verify-1-two-pointers-hold.png` |
| **One pointer held while the other moves continuously** | `#0` stayed at `137,291` while `#1` traced two full circles | `artifacts/verify-2-swept-with-a-held.png` |
| **Panic release releases everything** | after release the phone displayed `0` active points | `artifacts/verify-4-released.png` |
| The same works through the desktop UI | UI HTTP API held A and B at `378,1053` / `702,1053`, panic released 2 | `artifacts/ui-1-two-held.png`, `artifacts/ui-2-released.png` |
| Move rate | 120 Hz requested → **120.0 Hz achieved**, p95 interval **10 ms**, max **11–12 ms**, 240 moves in 2 s | `--proof` output, `artifacts/verify-multitouch.json` |
| Session setup cost | 603–1200 ms from `start()` to a live control socket | `logs/*.jsonl` |

The visual proof is device-independent: the phone renders a page (served to it
over `adb reverse`, i.e. through the USB cable, not the network) that draws every
touch point Android actually delivers. If injection were fake, the page would
stay at `0`.

---

## 2. Why this injection path

Phase 1 established that the obvious routes are blocked on a stock phone:

| Route | Status |
|---|---|
| `adb shell input tap/swipe` | spawns a process per event, no stable pointer ids — unusable for continuous or simultaneous input |
| minitouch / `sendevent` / `/dev/input` | SELinux denies the `shell` domain on modern Android; no-root only on SDK ≤ 25 |
| AOA USB HID | the PC cannot be a HID peripheral while adb owns the USB device (scrcpy's own docs: OTG mode only, not while mirroring) |
| **`InputManager.injectInputEvent()` as `shell`** | **works; this is what `scrcpy-server` already is** |

So the PoC runs `scrcpy-server` v4.1 via `app_process` (exactly how scrcpy does
it), with `video=false audio=false control=true`, and speaks its control protocol
directly. The server is the *only* thing borrowed from scrcpy; the client,
protocol serializer, pointer state machine, UI and safety logic are ours.

### Protocol facts taken from the v4.1 source

Verified against the scrcpy v4.1 tree, not from memory:

- `INJECT_TOUCH_EVENT` = type **2**, fixed **32 bytes**, big endian:
  `type(1) action(1) pointerId(8) x(4) y(4) w(2) h(2) pressure(2) actionButton(4) buttons(4)`
  (`app/src/control_msg.c`, `server/.../ControlMessageReader.java`).
- Pressure is a **u16 fixed point** field (`sc_float_to_u16fp`).
- `video=false` → the server has no `displayData`, so it uses **raw device
  coordinates** and skips the screen-size check
  (`Controller.getEventPointAndDisplayId`). This is what makes a control-only
  session viable.
- The server **derives the `ACTION_POINTER_*` variants itself**: send `ACTION_DOWN`
  for every press and `ACTION_UP` for every lift; with other pointers present it
  rewrites them to `ACTION_POINTER_DOWN|index` / `ACTION_POINTER_UP|index`.
- **`ACTION_CANCEL` does not clear `PointersState`** (only `ACTION_UP` sets
  `pointer.setUp()`), so a cancel would leave stuck fingers. Panic release is
  therefore *N × `ACTION_UP`*, never a cancel. This is enforced in
  `src/protocol.js` (CANCEL is rejected) and unit-tested.
- A `MOVE` for an id that was never pressed silently allocates a new pointer, so
  the client refuses to move/lift unknown ids.
- Ceiling is `PointersState.MAX_POINTERS = 10`.
- Socket name is `scrcpy_%08x`, `scid` is parsed as hex, the server must be
  started with `tunnel_forward=true` (the server *listens*, adb connects in).
  The version argument must match exactly (`4.1`).
- Server options that matter here: `send_device_meta=false` (otherwise 64 bytes of
  device name land on the control socket), `send_dummy_byte=false` (no handshake
  byte), `clipboard_autosync=false` (keeps the socket upstream-silent),
  `power_on=false` (never press POWER unless asked), `cleanup=true`.

---

## 3. Architecture

```
┌─────────────────────── Windows ────────────────────────┐
│  node src/main.js                                      │
│    ├── adb.js      spawn/parse adb, USB-only checks    │
│    ├── session.js  push server, adb forward, launch,   │
│    │               connect, teardown                   │
│    ├── protocol.js 32-byte INJECT_TOUCH_EVENT          │
│    ├── pointers.js multi-pointer invariants + panic    │
│    ├── sequences.js sweep + two-pointer proof          │
│    └── ui-server.js 127.0.0.1 panel (token-protected)  │
└───────────────┬────────────────────────────────────────┘
                │ adb forward tcp:<port> localabstract:scrcpy_<scid>
                │ (USB)
┌───────────────▼────────────────────────────────────────┐
│  scrcpy-server 4.1 in /data/local/tmp                  │
│  app_process / com.genymobile.scrcpy.Server 4.1 …      │
│  runs as `shell`, calls InputManager.injectInputEvent  │
└───────────────┬────────────────────────────────────────┘
                ▼  ACTION_DOWN / MOVE / POINTER_* / UP
           Android input pipeline  →  foreground app
```

Nothing is installed on the phone: there is no daemon and no app, and nothing is
left behind (`cleanup=true` removes the pushed jar when the server exits).

---

## 4. Exact Windows CMD instructions

Prerequisites: Windows 10, Node.js ≥ 22.6 on `PATH`, Android platform-tools, the
scrcpy 4.1 win64 folder, and the phone attached by USB with USB debugging
allowed. Nothing needs `npm install` — there are no dependencies.

Auto-detection looks in `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` and
the scrcpy 4.1 folder; use the flags below if yours live elsewhere.

```bat
cd /d C:\Users\ashwi\Desktop\HEAVEN-MOBILE-CONTROL

REM 1. Read-only environment check (device, screen, planned server argv)
node src/main.js --dry-run

REM 2. Unit + integration tests, no device required
node --test

REM 3. Start a session and send one DOWN/UP pair, then exit
node src/main.js --selftest

REM 4. Automated two-pointer proof, prints JSON
node src/main.js --proof

REM 5. Proof + hold both pointers for 8 s so you can look at the phone
node src/main.js --proof --keep-held 8000

REM 6. Interactive panel in the default browser
node src/main.js

REM 6b. Interactive panel, headless (URL is printed; open it yourself)
node src/main.js --no-open

REM 7. Hardware verification harness: serves a touch visualiser to the phone
node tools/verify-multitouch.js
```

Explicit paths, extra devices, and tuning:

```bat
node src/main.js --adb "C:\Users\ashwi\AppData\Local\Android\Sdk\platform-tools\adb.exe" ^
  --server-jar "C:\Users\ashwi\Desktop\scrcpy-win64-v4.1\scrcpy-win64-v4.1\scrcpy-server" ^
  --serial RZCY4185BTR --ui-port 7373

node src/main.js --proof --sweep-ms 4000 --hz 120 --verbose
node src/main.js --log-file logs\run.jsonl
node src/main.js --allow-power-on          REM lets the server wake a sleeping screen
node src/main.js --mock                    REM no device: UI/pointer wiring only
```

Stopping: in interactive mode press `Ctrl+C` (this releases all pointers first),
click **Panic release (Esc)**, or close the panel — the UI heartbeat watchdog
releases everything within 3 s if the page disappears.

Exit codes: `0` ok · `1` internal · `2` toolchain/device problem · `3` session
problem · `4` protocol/pointer state violation.

---

## 5. The controller interface

`node src/main.js` starts a loopback-only panel (`http://127.0.0.1:7373/?t=<token>`):

- **Pointer A** — press and drag anywhere on the surface, or *Down at 35%/45%*.
- **Pointer B** — *Down at 65%/45%*, then *Sweep B while A held*.
- **Run two-pointer proof** — deterministic A-down → B-down → sweep → B-up → A-up.
- **Panic release** — button, `Esc`, page unload, `Ctrl+C`, heartbeat loss, socket
  error, or fatal error. Every path releases every pointer.
- Live state: active pointer ids, positions, message count, achieved Hz, log tail.
- Every command that reaches the transport is written to the JSONL log with the
  message counter before it runs, so the counter can always be reconciled
  (one proof = 244 messages = 240 moves + 2 downs + 2 ups).

The token in the URL is required on every API call, the server binds
`127.0.0.1` only, cross-origin requests are refused (403) and payloads are capped
at 64 KiB — a random web page in the same browser cannot drive the phone.

---

## 6. Safety and scope limits (read before pointing this at a game)

- **This is input injection into a real game client.** Garena's ToS prohibit
  "unauthorized tools that interact with the Free Fire game client" and
  "non-official programs to provide an edge to gameplay", with permanent
  account **and device** bans and no appeals. Phase 2 contains **no anti-cheat
  evasion** and no detection avoidance of any kind; the mechanism is exactly the
  same `injectInputEvent` path scrcpy uses for ordinary mirroring. Whether to
  accept the ban risk is a product decision, not a technical one.
- `power_on=false` by default: the PoC never presses a hardware key unless you
  pass `--allow-power-on`.
- No Android setting is read-modify-written. `pointer_location`, `show_touches`,
  DPI and rotation are untouched.
- USB-only is enforced, not just documented: a `host:port` serial (TCP transport)
  is rejected with `NOT_USB`.
- Nothing is installed on the phone; the pushed jar is deleted on exit.

---

## 7. Implemented / untested / unsupported

### Implemented and physically verified (see §1)

USB detection and geometry read; control-only session lifecycle; 32-byte touch
serialization; two simultaneous pointers; continuous movement of one while the
other is held; panic release; JSONL + console logging; loopback UI with token
auth; 120 Hz move stream.

### Implemented, **not** verified on hardware

| Item | Status |
|---|---|
| The 10-pointer ceiling | enforced in code and unit-tested; only 2 pointers exercised on the device |
| Panic on `SIGINT`, tab close, heartbeat loss, socket error | unit-tested against the mock transport; not exercised on the device |
| Device unplugged while pointers are down | cleanup path exists; not exercised |
| `--selftest` tap producing a *visible* side effect | the DOWN/UP pair is accepted with no server error; the tap's effect was not observed |
| Landscape / rotated apps | coordinates are sent in natural-orientation device pixels; rotation is detected and warned about, never compensated |
| Other phones, other Android versions, One UI variants | not tested; only SM-S721B / Android 16 / SDK 36 |
| `--mock` mode | by construction cannot prove anything about the real pipeline |
| WASD joystick and mouse camera mapping | implemented in the loopback controller; requires the controller page to hold mouse pointer lock |
| Fire and scope mouse buttons | configurable touch locations; implemented in the loopback controller |

### Explicitly unsupported in this PoC

Root, Shizuku, minitouch, `/dev/input`, AOA/HID, Wi-Fi/LAN transport, scrcpy
video/audio streaming, per-app profiles, global hotkeys, >10 pointers,
virtual/secondary displays, and any form of anti-cheat evasion. The app does
not capture input globally or inject keyboard/mouse events into other Windows
apps. **Game compatibility is unproven** — Phase 1
gate T4 (does Free Fire MAX accept injected touches) is still open, and this PoC
was deliberately not pointed at the game.

---

## 8. Repository layout

```
src/main.js            CLI, mode dispatch, exit paths
src/config.js          toolchain resolution + flags
src/adb.js             adb wrapper (spawn-based, serialised, parsed)
src/device.js          USB enforcement, geometry, rotation, screen state
src/protocol.js        32-byte touch event, action semantics, validation
src/control-channel.js loopback socket, retry-connect, flush, stats
src/session.js         push → forward → app_process → connect → teardown
src/pointers.js        pointer state machine + panic release
src/sequences.js       sweep + two-pointer proof, real Hz/jitter stats
src/ui-server.js       loopback HTTP bridge, token auth, watchdog
src/ui-page.js         the panel (single HTML document, no build step)
src/mock-session.js    verification harness transport (no device)
tools/verify-multitouch.js  serves a touch visualiser to the phone + screenshots
test/                  node:test suites (55 declared tests across six suites)
artifacts/             screenshots and JSON evidence from the hardware runs
```

Third-party code: only `scrcpy-server` v4.1 (Apache-2.0, © Genymobile) is used at
runtime, unmodified, from your existing scrcpy installation. See `TESTING.md` for
reproduction steps and troubleshooting.
