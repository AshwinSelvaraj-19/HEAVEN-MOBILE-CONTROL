# TESTING.md — how every claim in this PoC was checked

Two kinds of checks are used, and they are never mixed up:

1. **Automated tests** (`node --test`) — prove the protocol bytes, the pointer
   state machine, the sequences and the HTTP bridge. No device needed.
2. **Hardware runs** — the only thing that can prove multi-touch actually
   reaches Android. Commands and observed output are below.

If a check below says "expected", that is what the verification run on
**SM-S721B / Android 16 / SDK 36 / 1080×2340** produced on 5 November 2026.

---

## 0. Environment the results came from

| Item | Value |
|---|---|
| Phone | Samsung SM-S721B (Galaxy S24 FE), serial `RZCY4185BTR` |
| Android | 16, SDK 36, `wm size` 1080×2340, density 443 (override) |
| Host | Windows 10 22H2, Node v26.7.0 |
| adb | 1.0.41, `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` |
| Server | `scrcpy-server` from scrcpy-win64-v4.1, 733,706 bytes, pushed to `/data/local/tmp/heaven-poc-server.jar` |
| Transport | USB only; `adb devices -l` shows `device` (no `host:port` serial) |

---

## 1. Automated tests (no phone)

```bat
cd /d C:\Users\ashwi\Desktop\HEAVEN-MOBILE-CONTROL
node --test
```

Expected: `pass 55`, `fail 0` (55 top-level tests across six suites).

What each suite covers:

| File | Proves |
|---|---|
| `test/protocol.test.js` | the 32-byte layout at every documented offset; u16 fixed-point pressure and clamping; `ACTION_CANCEL` rejected; negative/fractional pointer ids and oversized screens rejected; `MAX_POINTERS === 10` |
| `test/pointers.test.js` | two pointers get distinct ids; moving B never re-sends A; lifting B leaves A down; panic emits exactly N `ACTION_UP` and no cancel; panic is idempotent; moving/lifting an unpressed id throws; the 10-pointer ceiling; coordinate clamping; a closed channel throws instead of silently dropping |
| `test/sequences.test.js` | the proof sequence leaves one pointer with `down=1 move=0 up=1` (never re-sent) and one with `move>0`; sweep refuses an unpressed pointer; sweep stays inside the screen |
| `test/ui.test.js` | the page needs the token; `/api/state` and `/api/input` need the token; a DOWN/MOVE/panic over HTTP really reaches the transport; conflicting ops return 409; cross-origin 403 |
| `test/device-transport.test.js` | USB/TCP/emulator classification, USB-only selection, and rejection of TCP, emulator, and unknown devices |
| `test/mapping-engine.test.js` | WASD joystick lifecycle and direction, diagonal normalization, camera lifecycle and sensitivity, edge rebasing, pointer independence, and awaitable emergency cleanup |

The live controller preview uses scrcpy's H.264 video socket at native display
resolution, capped at 90 fps. Older browsers without WebCodecs fall back to ADB
screenshots, which are substantially slower.

Note: the mock transport is a *test double*. These tests say nothing about the
phone, which is why §2–§4 exist.

---

## 2. Read-only environment check

```bat
node src/main.js --dry-run
```

Expected highlights (exit code `0`):

```json
"device": { "model": "SM-S721B", "androidRelease": "16", "sdk": 36,
            "width": 1080, "height": 2340, "rotation": 0, "screenState": "Awake" },
"transport": "usb",
"plannedServerArgs": [ "CLASSPATH=/data/local/tmp/heaven-poc-server.jar", "app_process", "/",
  "com.genymobile.scrcpy.Server", "4.1", "scid=<random hex>", "log_level=info",
  "video=false", "audio=false", "control=true", "tunnel_forward=true",
  "send_device_meta=false", "send_dummy_byte=false", "clipboard_autosync=false",
  "power_on=false", "cleanup=true" ]
```

Nothing is pushed, launched or injected in this mode.

---

## 3. Session smoke test (one tap)

```bat
node src/main.js --selftest
```

This pushes the server, opens a loopback tunnel, executes
`app_process … com.genymobile.scrcpy.Server 4.1 …`, connects the control socket,
sends one `ACTION_DOWN` + `ACTION_UP` at the screen centre, then panics and exits.

Expected (exit code `0`):

```
INFO  server reported device line="[server] INFO: Device: [samsung] samsung SM-S721B (Android 16)"
INFO  session ready setupMs=603
"messagesSent": 2        bytesSent: 64
INFO  session stopped
```

Two messages × 32 bytes = 64 bytes: proof the serializer and transport agree.
If you see `SESSION_START`, read the last `scrcpy-server` lines in the log — that
is the server's own error text.

> A tap is a real click on whatever is on screen. The 120 ms version here is
> harmless on a home screen; run it with the phone unlocked and idle.

---

## 4. The two-pointer proof

```bat
node src/main.js --proof
```

Sequence: A down at 35%/45% → B down at 65%/45% → B sweeps a circle at 120 Hz →
B up → A up. JSON is printed on stdout.

Verified output (excerpt):

```json
"totalMs": 2324,
"sweep": { "sent": 240, "requestedHz": 120, "achievedHz": 120,
           "p95IntervalMs": 10, "maxIntervalMs": 12, "durationMs": 2000 },
"heldPointer": { "messages": 0, "note": "moves for A during the sweep; must be 0 because A was never re-sent" },
"pointersRemaining": 0,
"messagesSent": 244,
"ok": true
```

`achievedHz: 120` with a 10 ms p95 interval means Node's timers held the schedule
on this machine (Windows' ~15.6 ms timer granularity did not degrade it here).
244 messages = 240 moves + 2 downs + 2 ups, which is the whole gesture.

To watch it with your own eyes on the phone, use the harness in §5, or:

```bat
node src/main.js --proof --keep-held 8000
```

---

## 5. Independent physical verification (recommended)

`tools/verify-multitouch.js` serves a page to the **phone** over `adb reverse`
(USB cable, not the network). The page draws every touch point Android actually
delivers and shows a live count, then the tool injects the sequence and takes
`screencap` screenshots at each stage.

```bat
node tools/verify-multitouch.js
node tools/verify-multitouch.js --sweep-ms 2500
```

Expected final JSON: `"ok": true`, five screenshots in `artifacts/`, and
`artifacts/verify-multitouch.json`.

What the screenshots show (this is the actual evidence):

| Screenshot | Expected on the phone |
|---|---|
| `verify-0-before.png` | big `0`, `peak seen: 0` |
| `verify-1-two-pointers-hold.png` | `2`, `peak seen: 2 \| #0 @137,291 #1 @254,291` — two distinct ids |
| `verify-2-swept-with-a-held.png` | `2`; `#0` still at `137,291`; `#1` moved, with a visible circular trail |
| `verify-3-still-held.png` | still `2` after the sweep finished |
| `verify-4-released.png` | `0`, `peak seen: 2` |

Coordinates in that page are CSS pixels (device pixels ÷ ~2.76 device-pixel-ratio),
which is why `#0` reads `137,291` for an injected `378,1053`.

If the count stays `0`, injection is not reaching the app — go to §7.

---

## 6. Desktop panel

```bat
node src/main.js
```

Expected: a browser opens `http://127.0.0.1:7373/?t=<token>`, the header pill says
`session up`, and dragging on the surface draws a blue `A` marker. **Run two-pointer
proof** animates the green `B` marker around the circle while `A` stays put.

Headless equivalent (what was used during verification):

```bat
node src/main.js --no-open --ui-port 7373
curl -s -H "x-heaven-token: <token>" http://127.0.0.1:7373/api/state
curl -s -X POST -H "x-heaven-token: <token>" -H "content-type: application/json" ^
     -d "{\"op\":\"hold\",\"name\":\"A\"}" http://127.0.0.1:7373/api/input
curl -s -X POST -H "x-heaven-token: <token>" -H "content-type: application/json" ^
     -d "{\"op\":\"panic\"}" http://127.0.0.1:7373/api/input
```

Verified result: holds reported `{"name":"A","id":1,"x":378,"y":1053}` and
`{"name":"B","id":2,"x":702,"y":1053}`, panic returned `{"released":2}` and the
phone showed `2` then `0` (`artifacts/ui-1-two-held.png`, `artifacts/ui-2-released.png`).

---

## 7. Troubleshooting

| Symptom | Meaning / fix |
|---|---|
| `NO_DEVICE` | cable/authorisation: `adb devices -l` must show `device`, not `unauthorized`/`offline` |
| `DEVICE_UNAUTHORIZED` | unlock the phone, accept "Allow USB debugging" |
| `NOT_USB` | a wireless transport is attached (`host:port` serial); `adb disconnect <serial>` and use the cable |
| `MULTIPLE_DEVICES` | pass `--serial <serial>` |
| `SESSION_START` with server lines | the server's own error is in `hint`; typical causes: version mismatch (must be 4.1), jar missing, device locked |
| `SESSION_START` with no server output | `app_process` failed; check `adb shell ls -l /data/local/tmp/heaven-poc-server.jar` |
| Port already forwarded | the PoC picks a fresh ephemeral port each run and removes it on exit; stale rules clean up with `adb forward --remove-all` |
| Screen appears off | injected touches reach no window; wake the phone or pass `--allow-power-on` |
| Panel shows `bridge lost` | the Node process exited; check the console window |
| Panel shows `session down` | the device unplugged or the server died; restart |
| Count stays `0` in §5 | Chrome did not get focus, or the page was never opened; check the phone screen |
| `EBUSY`/`EADDRINUSE` on the UI port | another run is live; `--ui-port 7374` |

---

## 8. Cleanup

```bat
adb forward --remove-all
adb shell rm -f /data/local/tmp/heaven-poc-server.jar
```

Normal exits already do the first, and `cleanup=true` does the second. Nothing is
installed, no app data is touched, and no Android setting is modified at any point
(verified: `adb shell settings get system pointer_location` still returns `0`).

---

## 9. Deliberately not tested

- Free Fire MAX itself (Phase 1 gate T4): the game may ignore API-injected
  touches. Nothing in this PoC was pointed at the game.
- Landscape apps and rotation-aware mapping.
- Device unplugged mid-gesture; >2 simultaneous pointers; other devices/Android
  versions; long-duration stability (the longest run here was seconds).
- Any load scenario where the 10-pointer ceiling, rather than the app, is the
  limiting factor.
