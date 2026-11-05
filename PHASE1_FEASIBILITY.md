# HEAVEN-MOBILE-CONTROL — Phase 1 Feasibility Report

**Date:** 5 November 2026
**Phase:** 1 — Inspection and feasibility only. No implementation, no dependency installs, no project modifications.
**Target:** Windows 10 desktop → Samsung Galaxy S24 FE (Android 16), USB only, no root, no Shizuku.

> **Status of this document:** everything marked **CONFIRMED** is backed by documented vendor/AOSP/source evidence.
> Everything marked **UNTESTED** has *not* been verified on your hardware. No device was attached during this
> inspection, so **not a single feature has been tested on the S24 FE**. Nothing in this report should be read as
> "this works on your phone".

---

## 1. Project inspection

### 1.1 Repository contents

The project folder is empty apart from Freebuff's own marker directory:

```
C:\Users\ashwi\Desktop\HEAVEN-MOBILE-CONTROL\
├── .freebuff\
│   ├── .gitignore
│   └── project-id
└── PHASE1_FEASIBILITY.md   ← this file (created in Phase 1)
```

- No source code, no `package.json`, no build system, no README, no prior architecture.
- **Not a git repository** (`git status` → `fatal: not a git repository`). Version control should be initialised in
  Phase 2 before the first line of application code.
- Conclusion: greenfield. Nothing existing can constrain the architecture, and nothing existing needs preserving.

### 1.2 Host toolchain (detected on this machine)

| Tool | Status | Detail |
|---|---|---|
| Windows | **CONFIRMED** | Windows 10 Pro 22H2, build `10.0.19045.6466` |
| ADB | **CONFIRMED, not on PATH** | `1.0.41` / platform-tools `37.0.1` at `C:\Users\ashwi\AppData\Local\Android\Sdk\platform-tools\adb.exe` |
| scrcpy | **CONFIRMED, not on PATH** | `scrcpy 4.1`, SDL 3.4.12, FFmpeg libavcodec 62.28.102, libusb 1.0.30 at `C:\Users\ashwi\Desktop\scrcpy-win64-v4.1\scrcpy-win64-v4.1\` |
| scrcpy server payload | **CONFIRMED** | `scrcpy-server` 733,706 bytes present next to `scrcpy.exe` |
| Android SDK | **CONFIRMED** | `build-tools 36.0.0`, `platforms android-37.0`, `emulator` |
| Node.js | **CONFIRMED** | v26.7.0, npm 11.19.0 |
| .NET | **CONFIRMED** | SDK 9.0.320 |
| Python | **CONFIRMED** | 3.12.10 |
| JDK | **CONFIRMED (bundled)** | Android Studio JBR at `C:\Program Files\Android\Android Studio\jbr` — no standalone `java` on PATH, no Gradle |
| ffmpeg | **NOT on PATH** | Not required — scrcpy ships its own FFmpeg DLLs |
| Android device | **NOT CONNECTED** | `adb devices` → empty list; `adb get-state` → `error: no devices/emulators found` |

### 1.3 Environment findings that affect the build

1. **Neither `adb` nor `scrcpy` is on `PATH`.** The application must resolve both explicitly (configurable paths with
   auto-detection of the SDK location and the portable scrcpy folder). Shelling out to bare `adb`/`scrcpy` will fail.
2. **Two duplicate scrcpy extractions exist** — `Desktop\scrcpy-win64-v4.1\`, `Downloads\scrcpy-win64-v4.1\`, plus
   `Desktop\scrcpy-win64-v4.1.zip`. Duplicate copies with different bundled `adb.exe` versions are a classic source of
   "cannot connect to daemon" errors. **Pin exactly one scrcpy folder and one adb binary** in app config.
3. **Two different adb builds are present** (SDK `37.0.1` and scrcpy's bundled `adb.exe`). They share port 5037 and
   whichever starts first owns the daemon; a client/server version mismatch produces confusing failures. Recommendation:
   always drive the **SDK** adb, and pass `--adb`-style explicit paths rather than relying on scrcpy's bundled copy.
4. ADB daemon is currently running (`tcp:5037`) with zero devices — normal, no security implication.

### 1.4 What was *not* done in Phase 1

No dependencies installed, no APK built, no server pushed to the phone, no files outside this folder modified, no game
launched, no account touched.

---

## 2. The decisive constraint: USB topology

This is the part most "ADB game controller" projects get wrong, so it is stated first.

**A normal USB cable makes the PC the *host* and the phone the *peripheral*.** A USB HID device is, by definition, a
*peripheral*. Therefore:

> **A Windows PC cannot present itself as a USB HID touchscreen to the phone over a normal USB cable.**
> The naive reading of "USB HID multitouch" — PC emulates a digitiser, phone sees a physical touchscreen — is
> **impossible without extra hardware** (a Raspberry Pi Zero / Arduino Leonardo class device acting as the HID
> peripheral, or a phone acting as USB host via OTG, which also breaks the PC link).

So input must reach the phone through one of exactly four channels. All four were evaluated:

| # | Channel | Mechanism | Root? | Works while mirroring? | Verdict |
|---|---|---|---|---|---|
| **A** | **ADB + `InputManager.injectInputEvent()`** | A Java process launched as the `shell` user via `app_process` (this is exactly what `scrcpy-server` is) injects synthetic `MotionEvent`s into the input pipeline | **No** | **Yes** (separate socket) | **PRIMARY — chosen** |
| B | ADB + **UHID** (`/dev/uhid`) | Kernel HID subsystem: register a virtual HID device (keyboard/mouse/**and possibly a touchscreen**) that Android sees as real hardware | **No** (shell is in group `uhid`) | Yes | **FALLBACK — worth a spike** |
| C | **AOA / AOAv2 HID** | PC claims the USB device via libusb and injects HID reports at USB level, no adb needed | No | **No on Windows** | **REJECTED** |
| D | `sendevent` / **minitouch** (raw `/dev/input/event*`) | Write directly to the kernel input nodes | Needs root on modern Android | n/a | **REJECTED** |
| E | `adb shell input …` | One-shot shell command per event | No | Yes | **REJECTED for gameplay** (process spawn ≈ tens of ms per event) |

### 2.1 Why D and E are out

- **D (`/dev/input`, minitouch):** AOSP's SELinux policy explicitly forbids the `shell` domain from writing input
  device nodes (`neverallow shell input_device:chr_file no_w_file_perms`). This was reported for Android Q and later;
  every modern report is `open: Permission denied` for `/dev/input/event*`, and `minitouch`'s own documentation only
  claims no-root operation up to **SDK 25**. On Android 16 this path is dead without root.
  → `openstf/minitouch` #41, `DeviceFarmer/minitouch`, `Cartucho/android-touch-record-replay` #23.
- **E (`input`):** Each invocation forks a shell, starts a VM/app process, injects, exits. Latency per event is far too
  high for camera control, and it cannot express continuous multi-pointer drags with stable pointer IDs. Useful only as
  a **diagnostic tool** in the PoC (see §12, gate T4).

### 2.2 Why C (AOA) is out on this host

AOA really is USB-level HID and would give genuine relative mouse motion — but scrcpy's own documentation is explicit:

> "Note: On Windows, it may only work in **OTG mode**, not while mirroring (it is not possible to open a USB device if
> it is already open by another process like the _adb daemon_)."
> — `scrcpy/doc/mouse.md` (v4.1)

AOA requires exclusive libusb access to the device; the adb daemon already owns it. So on Windows, AOA can **either**
control **or** mirror — never both. Since mirroring is a core requirement, **C is rejected**.

### 2.3 Why A is the primary mechanism (and what "scrcpy" actually does)

`scrcpy` is not one thing; it is a **client + server** pair:

- **Server** (`scrcpy-server`, a plain Java program, ~730 KB) is pushed to `/data/local/tmp` and executed as
  `app_process` under the **`shell` UID**. The `shell` user holds `INJECT_EVENTS`, so the server can call the hidden
  `InputManager.injectInputEvent()`. No app is installed, no root, nothing persists after the process exits.
- **Client** (`scrcpy.exe`) captures keyboard/mouse, encodes control messages onto a **control socket**, and decodes the
  H.264 video stream.

**CONFIRMED from source** (`server/src/main/java/com/genymobile/scrcpy/control/Controller.java`, v4.1):

- Touch messages create `MotionEvent`s with `source = SOURCE_TOUCHSCREEN`, `toolType = TOOL_TYPE_FINGER`, `buttons = 0`.
- Up to **`MAX_POINTERS = 10`** simultaneous pointers (`PointersState.java`, v4.1).
- When more than one pointer is active, the server **automatically converts** `ACTION_DOWN`/`ACTION_UP` into
  `ACTION_POINTER_DOWN`/`ACTION_POINTER_UP` with the correct `pointerIndex` bits — i.e. a custom client can simply send
  per-pointer down/move/up and get correct multitouch semantics for free.
- Injection is asynchronous (`INJECT_MODE_ASYNC`), so the server does not block on dispatch.
- The server logs `Too many pointers for touch event` and drops the event beyond 10 pointers.

**This directly answers the architecture requirement in the brief:** scrcpy *as an application* provides no joystick
mapping and no FPS camera model — it forwards absolute pointer positions only. But scrcpy's *server component* is a
readymade, no-root, multitouch-capable **injection engine**, and the mapping/HUD/joystick/camera logic is ours.

---

## 3. Recommended architecture

### 3.1 Design principle

Separate the three concerns that are usually blended together and then blamed on each other:

```
 ┌───────────────────────────── Windows 10 ─────────────────────────────┐
 │                                                                      │
 │  INPUT CAPTURE          MAPPING ENGINE            TRANSPORT          │
 │  ─────────────          ──────────────            ─────────          │
 │  Raw Input /      →     profile → touch      →    scrcpy control     │
 │  Pointer Lock           pointer model             protocol over USB   │
 │  (keyboard + mouse)     (joystick / camera /                          │
 │                          buttons, rebase logic)   adb forward →      │
 │                                                   localabstract       │
 │                                                                      │
 │  RENDER                  CALIBRATION              DISPLAY             │
 │  ──────                  ───────────              ───────             │
 │  HUD overlay      ←      zone editor over   ←     H.264 video stream  │
 │  (zones, minimap)        the live mirror          (scrcpy server)     │
 └──────────────────────────────────────────────────────────────────────┘
                                    │ USB cable (never Wi-Fi)
                                    ▼
 ┌──────────────────────── Samsung Galaxy S24 FE / Android 16 ─────────┐
 │  adbd (USB debugging) → shell UID → scrcpy-server → injectInputEvent │
 └─────────────────────────────────────────────────────────────────────┘
```

Three hard separations:

1. **Injection ≠ display.** They use different sockets and can be developed, tested and replaced independently.
2. **Mapping ≠ injection.** A profile is pure data (JSON): zones, bindings, sensitivity curves. Swappable per game.
3. **Calibration ≠ code.** FF MAX's HUD is user-customisable, so no coordinate can be hard-coded. The app must ship a
   one-time calibration wizard that overlays the live mirror and lets zones be dragged onto the player's own layout.

### 3.2 Staged delivery (each stage must pass its own gates)

| Stage | Scope | Risk | Why this order |
|---|---|---|---|
| **0 — PoC, no GUI** | Node scripts + existing scrcpy CLI. Prove capture, injection, multitouch, rebase, latency (§11). | Low | Kills the project cheaply if the game refuses injected input |
| **1 — Control engine** | Own minimal scrcpy-protocol client (control-only server instance) + mapping engine + profile schema + panic-release | Medium | The actual product value; testable with scrcpy's own window as display |
| **2 — Premium shell** | Electron + React UI: device card, embedded mirror, overlay mapping editor, profile manager | Medium | UI only after the engine is proven |
| **3 — Embedded video** | Move video decode in-app (WebCodecs via `@yume-chan/scrcpy`, or an IPC-fed decode canvas) | High | Only if Stage 2's external window is judged insufficient |

Rationale for **not** starting with embedded video: scrcpy 4.1's video pipeline is already tuned (35–70 ms). Rebuilding
it first would burn the schedule on the least uncertain part of the project.

### 3.3 Recommended stack

**TypeScript / Node 26 + Electron + React.**

- Node 26 and npm are already installed; no new runtime to provision.
- MIT-licensed scrcpy-protocol and ADB libraries exist in TypeScript (see §4), so nothing paid and no reimplementation
  of the ADB wire protocol.
- HTML/CSS gives the "premium HEAVEN SOCIETY" surface (glass panels, gradients, animated states) far faster than WPF,
  and the mapping overlay is trivially a layer above a `<canvas>`/`<video>`.
- Windows-specific needs (Raw Input, pointer lock) are covered by Chromium's Pointer Lock API, which yields
  **unaccelerated `movementX/movementY`** — exactly what a camera needs.

**Alternatives considered (all viable, all free):**

- **.NET 9 + WPF/WinUI** (`dotnet 9.0.320` present) with `AdvancedSharpAdbClient` (Apache-2.0). Best raw input latency
  and smallest binary; weaker for a flashy UI and the video pipeline becomes Media Foundation work.
- **QtScrcpy as the base** (Apache-2.0, C++/Qt) — it is the closest existing product (it already does key mapping with
  JSON configs). Forking it is the fastest route to a *functional* keymapper but the slowest route to a *custom premium*
  UI, and it is a large C++ codebase to inherit.

Recommendation stands: **TypeScript/Electron**, with the mapping engine written as a framework-agnostic TypeScript
module so it can be reused if the shell is ever swapped.

### 3.4 The mapping engine (the real IP)

Five pointer roles, each an independent virtual finger with a stable ID:

| Role | Pointer behaviour | Notes |
|---|---|---|
| **Move (WASD)** | Finger held at joystick anchor; `MOVE` scales direction × radius. Analog speed for free (diagonal ≠ faster). | Requires calibration of joystick centre + radius |
| **Camera (mouse)** | Finger held at a camera anchor; each mouse Δ becomes a `MOVE`; **rebase** at zone edge by `UP`+`DOWN` at anchor | The hardest problem — see §6.3 |
| **Fire** | Tap or hold on a fixed HUD button zone | Two modes: tap / hold, per profile |
| **Aim / scope / crouch / jump / reload** | Discrete taps or holds on calibrated zones | Toggle vs hold configurable per binding |
| **Free-look / lean / extra** | Reserved pointers 9–10 | Keeps ≤10 pointer budget |

Engine requirements that fall out of the source review:

- **Panic release:** `UP` every active pointer on window blur, disconnect, hotkey, or crash. A stuck finger in a
  shooter is worse than a crash — it walks the player into the open. This is a **must**, not a nicety.
- **Move coalescing:** cap camera events at ~120 Hz and coalesce deltas; a 1000 Hz mouse must not flood the adb socket.
- **Timestamping:** all events carry device uptime; bursts sent late can be reordered by the game's input handling.
- **Atomic button + camera:** pressing fire while turning must not release the camera pointer (see §7.2).

---

## 4. Free / open-source tools and libraries

All are free of charge and OSI-licensed. **No paid library, API, subscription or licence is proposed anywhere.**

| Project | Licence | Role | Official repository |
|---|---|---|---|
| **scrcpy** | Apache-2.0 | Video + the `scrcpy-server` **injection engine**; protocol authority | https://github.com/Genymobile/scrcpy |
| **Tango / ya-webadb** (`@yume-chan/adb`, `@yume-chan/scrcpy`, `@yume-chan/adb-scrcpy`) | MIT | Pure-TS ADB client + scrcpy protocol client; supports server 4.0/4.1 in the v3 beta line; explicit **multi-finger** touch messages | https://github.com/yume-chan/ya-webadb |
| **QtScrcpy** | Apache-2.0 | Reference implementation of a *key-mapped* scrcpy client (JSON keymaps, drag-to-aim); best prior art to study | https://github.com/barry-ran/QtScrcpy |
| **ws-scrcpy** | MIT | Reference for browser-based scrcpy clients (if a web UI is ever wanted) | https://github.com/NetrisTV/ws-scrcpy |
| **DeviceFarmer/minitouch** | Apache-2.0 | **Rejected** (§2.1) — kept in the report because its limitation is the reason approach A exists | https://github.com/DeviceFarmer/minitouch |
| **AdvancedSharpAdbClient** | Apache-2.0 | .NET ADB client — only if the stack switches to WPF | https://github.com/SharpAdb/AdvancedSharpAdbClient |
| **AndroidUHidPureJava** | check repo before use | Reference spike for UHID devices from the `shell` user (Android 6–15 range claim) | https://github.com/WuDi-ZhanShen/AndroidUHidPureJava |
| **AOSP `hid` shell command** | Apache-2.0 (AOSP) | Built into Android: registers arbitrary HID devices from `adb shell` — the UHID fallback path | https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/cmds/hid/ |

Notes on licence hygiene:

- scrcpy's `scrcpy-server` may be **redistributed** under Apache-2.0 provided `LICENSE` and NOTICE are carried. Ship
  the jar with attribution.
- **Pin the server version.** The scrcpy control protocol is explicitly version-locked: "there is no backward or
  forward compatibility… A client must always be run with a matching server version" (`doc/develop.md`). Bundling
  server 4.1 means the serializer must be written for 4.1 and the handshake must send `4.1`.
- `@yume-chan/scrcpy` 3.x is currently a **beta** line; its 4.1 server support landed in `v3.0.0-beta.3`. Treat any
  dependency on it as a tracked risk, or write the ~100-line touch serializer directly against scrcpy's own
  serializer unit tests (`server/src/test/java/.../ControlMessageReaderTest.java`).

---

## 5. USB input approach (chosen, in detail)

### 5.1 Cold start sequence

1. **Detect device.** `adb devices -l` + USB VID/PID enumeration; filter to the S24 FE serial. Handle the three states:
   *no device* → *unauthorised* (`unauthorized`) → *ready* (`device`).
2. **Verify capabilities once, then cache:** `getprop ro.build.version.sdk`, `wm size`, `wm density`, refresh rate.
3. **Push server:** `adb push scrcpy-server /data/local/tmp/scrcpy-server-manual.jar` (idempotent, skip if hash matches).
4. **Start a control-only server instance:**
   ```bash
   adb shell CLASSPATH=/data/local/tmp/scrcpy-server-manual.jar \
       app_process / com.genymobile.scrcpy.Server 4.1 \
       scid=<random31> log_level=info tunnel_forward=true \
       video=false audio=false control=true cleanup=true
   ```
   A distinct `scid` allows a *second* scrcpy instance to mirror video simultaneously — the two instances do not
   interfere (`scid` exists precisely so multiple clients can run on one device).
5. **Tunnel:** `adb forward tcp:<port> localabstract:scrcpy_<scid>` → connect control socket.
6. **Video:** separate scrcpy instance, `scrcpy --no-control --no-audio -m1600 --max-fps=90` (Stage 0/1), later embedded.
7. **Coordinates:** with `video=false`, the server has no frame metadata to map against, so the client must send **device
   coordinates** and the true screen size (`wm size`, e.g. `1080x2340`) in every touch message. The server validates
   these and drops mismatches (documented in the protocol reference). This is a real implementation detail that will
   silently produce "no input at all" if wrong.

### 5.2 Touch message semantics (what we send)

Semantics, not bytes, are listed here; byte layout must be taken from the version-locked serializer tests:

- `action` — `DOWN`/`UP`/`MOVE` per pointer (server rewrites to `POINTER_DOWN`/`POINTER_UP` when >1 pointer is active)
- `pointerId` — stable per virtual finger (not reused across distinct presses)
- `pointerX`, `pointerY` — device pixel coordinates
- `screenWidth`, `screenHeight` — must match the device display
- `pressure` — non-zero (a hostile value of 0 can be treated as a palm/ghost touch)
- `actionButton` / `buttons` — **zero** for touch; non-zero would flip the event to `SOURCE_MOUSE`

### 5.3 Fallback: UHID (approach B) — deliberately *not* chosen first

**CONFIRMED:** `/dev/uhid` is owned `uhid:uhid` and the `shell` user is in that group
(`AID_UHID 3011`), added in the Android 8 cycle — AOSP commit `0729dd1e`, still current in `ueventd.rc` main. scrcpy
itself says UHID "may not work on **old** Android versions due to permission errors", never that it needs root.
AOSP ships `hid`, a shell command that accepts **any** HID report descriptor as a byte array plus raw reports over
stdin:

```bash
adb shell hid -    # interactive; JSON: {"command":"register","name":…,"bus":"usb","descriptor":[0x05,…]}
```

Community evidence (scrcpy issue #4034, `AndroidUHidPureJava`) indicates a **HID touchscreen** can be registered this
way with only adb access, working on Android 11/12, with "Android 10+" cited for the feature-report support it needs.

**Why it is a fallback, not the primary path:**

- Not verified on this device or Android 16; the digitizer path has no primary-source demo of *multi-contact* use.
- For Android to classify it as a **touchscreen** rather than a pointer, the descriptor must put the device on the
  Digitizer usage page with Tip Switch + Contact Identifier inside a Finger collection, and the kernel must set
  `INPUT_PROP_DIRECT`. This is inference from AOSP's documented classification order, not proven for UHID.
- It is real added complexity (report descriptors, feature reports, contact accounting).

**It is kept in the plan for one honest reason:** if FF MAX ignores API-injected touches (a real possibility, §7.2 and
§10.2), a UHID touchscreen is the only remaining no-root option that still presents as genuine hardware. It will **not**
be used to evade detection — see §10.3.

### 5.4 What about `--mouse=uhid` / `--keyboard=uhid`?

Available in the installed 4.1 (`--mouse=mode` / `--keyboard=mode` verified locally via `scrcpy --help`), giving a real
HID mouse with **relative** motion. The question is not whether it can be sent, but whether FF MAX *uses* it — see §6.

---

## 6. Camera control: can relative mouse become usable camera control?

### 6.1 Three candidate routes

| Route | Mechanism | Status |
|---|---|---|
| **R1 — Game reads a real mouse** | Send HID mouse (`--mouse=uhid`) or let the OS deliver `SOURCE_MOUSE`; the game natively maps motion to the camera | **Almost certainly NO.** FF MAX is built as a touch game; Garena frames keyboard/mouse as a PC/emulator characteristic and separates emulator matchmaking rather than supporting mouse on mobile. Native KB/M exists only in the **Google Play Games on PC** build |
| **R2 — Synthetic touch drag (chosen)** | One virtual finger held in a camera-safe zone; mouse Δ becomes successive `MOVE` events on that finger. Absolute coordinates, relative *behaviour* | **The only viable route** — works with any touch-only game |
| **R3 — Synthetic mouse events** | Send `SOURCE_MOUSE` via injection and hope the game accepts it | **No** — same reason as R1, plus it loses `SOURCE_TOUCHSCREEN` semantics |

**Recommendation: R2.** It is also why §2's mechanism matters: R2 requires *continuous, arbitrary-coordinate, multi-pointer
touch injection*, which is precisely what `injectInputEvent` + scrcpy's control protocol provides and what neither
`adb shell input` nor minitouch can do on Android 16.

### 6.2 R1 must still be tested — it is free

Before writing any code, plug a **Bluetooth mouse** into the phone (or use `--mouse=uhid`) and try to aim in Training
Ground. This costs two minutes and definitively settles whether the HID mouse path is worth anything. Expected result:
cursor appears, UI taps work, camera does not move. If the camera *does* respond, the whole camera complexity collapses
into `--mouse=uhid` — which would be a materially better product. **This is gate T8 in §12 and it must run before
architecture is frozen.**

### 6.3 The rebase problem (the main technical risk in the mapping engine)

A finger drag has a physical end: the anchor sits somewhere in the right-hand zone and runs out of screen after
`Δmax` pixels. Options:

1. **Rebase (lift + re-place at anchor).** Every `Δmax` px: `ACTION_UP`, then `ACTION_DOWN` at the anchor.
   *Risk:* the game sees touch-up → a one-frame camera stall, or worse, a camera snap if it treats re-touch as a new
   gesture. Commercial keymappers do this, so it usually works — but "usually" is not "tested".
2. **Large anchor travel + sensitivity curve.** Fewer rebases (fewer artefacts), but the finger reaches the edge more
   slowly at low sensitivity and the zone must not overlap HUD buttons.
3. **Multiple staggered anchors** (round-robin pointers). Avoids the lift entirely, but two fingers on the camera zone
   may be interpreted as pinch/zoom or as a two-finger action. Risky.

**Plan:** implement (1) with a tunable anchor and a per-profile `rebase_threshold`; measure the artefact in gate T6
(frame-level capture), and keep (2) as a tuning escape hatch. Do not promise "no camera stutter" until T6 passes.

### 6.4 Movement (WASD → joystick)

FF MAX uses a fixed on-screen joystick: `DOWN` at the stick centre, `MOVE` within its radius gives analog direction and
speed. Mapping is straightforward **but** the centre/radius are user-HUD-dependent → calibration wizard, no hard-coded
coordinates. A diagonal must be normalised (length ≤ 1) or the player runs faster diagonally — a real gameplay
difference, not a cosmetic one.

---

## 7. Multi-touch feasibility

### 7.1 What is confirmed

- **10 simultaneous injected pointers** (`PointersState.MAX_POINTERS = 10`, scrcpy 4.1).
- Correct `ACTION_POINTER_*` index handling is done **server-side**, so a custom client sends simple per-pointer
  down/up/move.
- Multi-finger messaging is an explicitly supported feature of the reference TS library ("Multiple fingers are also
  supported", Tango ADB scrcpy control docs).
- The realistic requirement is **3–5 concurrent fingers** (move + camera + fire + one or two actions), well inside both
  the 10-pointer budget and any Samsung digitiser limit.

### 7.2 What is *not* confirmed

- **Whether FF MAX accepts events from a virtual source.** Injected events are `SOURCE_TOUCHSCREEN` +
  `TOOL_TYPE_FINGER`, but they carry `deviceId = 0` and no matching entry in the `InputDevice` list. A game *can*
  filter on that; several apps demonstrably ignore injected touches (scrcpy #1020 notes injected touches are not seen
  by some touch visualisers/recorders). **This is the single biggest functional unknown in the project.**
- **Per-finger behaviour under load:** whether the game keeps a held camera finger alive while a second finger taps
  fire, or silently drops the first pointer. Must be measured, not assumed.
- **Multi-touch limits inside FF MAX itself** are unknown (many mobile shooters cap at 4–5 useful contacts).
- **The 120 Hz path:** whether pointer `MOVE` events at 90–120 Hz are consumed without visible lag when the game
  renders at 60–90 fps and adb is also carrying video.

### 7.3 Known Android-level caveats

- The input dispatcher drops injected events whose target window cannot be validated; the historical Android 13
  failure was `Dropped injected event: Injected event targeted at uid 0…`, fixed by not pinning a target uid (scrcpy
  handles this). Expect version-specific quirks like this on new Android releases.
- Injected touches are **not visible to "Show touches"** and generally not to accessibility visualisers — useful as a
  diagnostic (if the game ignores input but the OS reacts, the difference is informative) and a reminder that
  "it looks like nothing happened" is not proof that injection failed.

---

## 8. Android 16 compatibility risks

| # | Risk | Evidence | Severity |
|---|---|---|---|
| 1 | **`FLAG_SECURE` → black mirror** | Android enforces secure-window blocking against the `shell` user since Android 12, which is exactly how scrcpy captures (scrcpy issues #3323/#5216/#5671). **Whether FF MAX sets it is unknown** — no primary evidence either way | **Critical** — kills the product if true |
| 2 | **`INJECT_EVENTS` denial** | Some OEMs require Developer options → **"USB debugging (Security settings)"** *in addition to* USB debugging, plus a reboot (scrcpy README; issue #4199) | High (but fixable) |
| 3 | scrcpy vs Android 16 bugs | 3.3.3 was a "critical Android 16 hotfix"; user reports show **scrcpy 4.1 working on a Samsung S936B (Android 16, One UI 8.5)** while 5.0 failed on the same machine (issue #7079) — i.e. **4.1 is the safer pin**, not "latest" | Medium |
| 4 | Samsung One UI 8 behaviour | Extra security prompts, adb key expiry, "configuration update" incidents that broke adb until keys were flushed (issue #6888) | Medium |
| 5 | Display/capture changes | Secure-capture / screen-share protection settings and virtual-display changes have repeatedly broken mirroring on 15/16 | Medium |
| 6 | Game pauses on focus/rotation | Mirroring can trigger resizes/config changes that pause or letterbox the game | Low |
| 7 | Refresh rate / frame pacing | S24 FE is expected to be a 120 Hz panel; capture at 120 fps roughly doubles bitrate and decode cost. Verify actual capabilities with `adb shell dumpsys display` rather than assuming | Low |

**Mirror mechanics note:** scrcpy captures through a virtual display fed by `SurfaceControl`/`MediaCodec`, not
MediaProjection-with-consent-dialog. Consequence: no permission prompt (good), but `FLAG_SECURE` still applies (bad).
There is no non-root workaround for `FLAG_SECURE`. If gate T2 shows black, the only remaining options are root (forbidden)
or accepting a control-only product with no mirror — which fails the brief.

---

## 9. Latency considerations

### 9.1 Budget (worst case, to be replaced by measurement)

| Segment | Expected | Basis |
|---|---|---|
| Keyboard/mouse → app (Raw Input / pointer lock) | 1–8 ms | 125–1000 Hz device polling, no compositor round-trip |
| Mapping + serialise | < 1 ms | Same process, preallocated buffers |
| USB → adb forward → device | 2–8 ms | Documented USB 2/3 adb round trips |
| `injectInputEvent` → app `onTouchEvent` | 2–5 ms (async mode) | Non-blocking injection, InputDispatcher queue |
| **Game** processes input → next rendered frame | 15–35 ms | 60–90 fps title, own input buffering |
| Encode → USB → decode → display | **35–70 ms** | scrcpy's own published figure |
| **Perceived input → photon (end to end)** | **~60–120 ms** | **Estimate. NOT measured.** |

### 9.2 Practical implications, stated honestly

- **Aiming feel is dominated by the video pipeline, not by injection.** ~35–70 ms of visual lag is the floor with this
  approach; that is the difference between "playable in a phone-game sense" and "competitive PC shooter". Any claim of
  CS-style fidelity would be false.
- **The lag is not symmetric:** the player aims using a *stale* frame. This must be surfaced in the UI (an honest
  latency readout), not hidden.
- Mitigations that are worth trying, in order of expected effect:
  1. `--max-size` just below native (e.g. 1600) with high bitrate; avoid CPU scaling.
  2. H.264 with no B-frames; disable scrcpy's video buffering; USB 3 port and cable (verify with `adb shell getprop
     sys.usb.controller` / actual negotiated speed).
  3. `--max-fps` matched to the game's real framerate — extra fps costs decode and adds nothing.
  4. `--no-audio` (removes a whole stream's contention).
  5. Coalesce input at ~120 Hz; never send more events than the display can show.
  6. Keep the app's UI off the decode critical path (separate process/thread).
- **Measurement is a gate (T7), not a footnote.** Method: 240 fps phone-camera capture of the PC screen and the phone
  screen in one frame, with an injected event that produces an unambiguous visual change; count frames between
  "input applied on PC" and "change visible on phone". Report p50/p95, or report that it could not be measured.

---

## 10. Security and game compatibility

### 10.1 Technical security posture

- **USB only.** Never enable wireless debugging; the design has no TCP path to the device, and the app must refuse
  `adb tcpip`. Nothing in the product should ever open a listening socket.
- **ADB trust:** authorising the PC writes a host key to the phone (and `%USERPROFILE%\.android\adbkey` on Windows).
  The app must warn, and offer "revoke USB debugging authorisations" guidance for teardown.
- **Footprint:** `scrcpy-server` lives in `/data/local/tmp` only while running; nothing is installed on the phone; no
  root, no Shizuku, no `su`, no SELinux changes, no `/dev/input` writes.
- **Data:** profiles are local JSON (zones, bindings, curves). No telemetry, no cloud sync, no analytics, no account.
  Do not log screen content; do not capture the mirror to disk by default.
- **Integrity:** pin and hash-verify the bundled `scrcpy-server`; ship its `LICENSE`/NOTICE. Upstream scrcpy explicitly
  warns that only its own GitHub repo is the official source.
- **Privilege:** the app runs as the normal user. No admin, no drivers, no filter drivers, no kernel components.

### 10.2 Game compatibility — the honest assessment

FF MAX is a **touch game**. The camera is a drag gesture; the stick is an on-screen joystick. Everything this project
does is "synthesise a finger", so the game's own behaviour is preserved — that is the *compatibility* argument. The
*counter*-argument is that injected fingers are virtual (deviceId 0, no `InputDevice`), and Garena's detection is
deliberately opaque.

What Garena's own published rules say (quoted, because paraphrase would be unfair):

- Account Ban article — bans include *"Using modified or unauthorized game client"*, *"Using unauthorized tools that
  interact with Free Fire game client"*, *"Using non-official programs to provide an edge to gameplay"*.
- Anti-Hack FAQ — permanent bans, **device bans**, "no appeals", and evidence is kept confidential "to prevent players
  from figuring out workarounds".
- Emulator policy — emulators are **not banned but segregated** into an emulator matchmaking pool.

**The uncomfortable asymmetry:** on a *real phone* the emulator-pool safeguard does not apply. If input injection were
detected, it would be judged as a mobile player using an unauthorised tool for an edge — the least favourable framing in
their own documents. Conversely, no credible report was found of a ban for scrcpy/ADB input specifically; absence of
reports is not evidence of safety.

**Therefore:** ban risk is real, non-zero, and **the user's decision, not the tool's**. Recommended handling:
- Test on a **secondary account**, in Training Ground / custom rooms, never in ranked, until T2–T7 pass.
- Surface the risk in the app's first-run screen; do not bury it.
- Do not ship any feature whose purpose is to look more "human" or evade detection.

### 10.3 Explicit non-goals (locked in by the brief)

| Forbidden | How this design respects it |
|---|---|
| Root / Shizuku / root-only APIs | Everything runs as `shell` UID over plain adb; no `su`, no `pm grant` of signature permissions, no SELinux edits |
| Wi-Fi / LAN transmission | USB-only transport; no `adb tcpip`, no listening sockets |
| Paid libraries / APIs / subscriptions | Every component listed in §4 is free and OSI-licensed |
| Anti-cheat bypass / anti-detection | No obfuscation of injected events, no spoofed device fingerprints, no timing randomisation to appear human. If the game blocks injection, we report it and stop — we do not engineer around detection |
| Claims of untested function | This document labels every unverified item; the PoC plan exists to convert assumptions into measurements |

---

## 11. Confirmed vs unverified

### 11.1 CONFIRMED (documented evidence, not this machine's hardware)

- scrcpy 4.1 is installed and launches on this Windows 10 host; its CLI exposes `--mouse=uhid|aoa|sdk`, `--keyboard`,
  `--max-size`, `--max-fps`, `--display-id` (verified by running `scrcpy --help`).
- ADB 37.0.1 is installed and its daemon starts (`adb devices` ran; no device attached).
- scrcpy injects input by running a Java server as the **`shell` user** and calling
  `InputManager.injectInputEvent()`; `INJECT_EVENTS` cannot be obtained by a normal app, which is why shell execution is
  used (scrcpy issue #1865, maintainer statement).
- The scrcpy control protocol supports up to **10 pointers** with server-side `ACTION_POINTER_*` conversion
  (`PointersState.java`, `Controller.java`, v4.1).
- The protocol is **version-locked**; client and server must match (`doc/develop.md`).
- Raw `/dev/input` injection is blocked for the `shell` domain on modern Android (SELinux `neverallow`; minitouch
  reports "SDK 25 and lower"; repeated `Permission denied` reports on Android 9/10+).
- AOA HID cannot be used **while mirroring on Windows** (scrcpy `doc/mouse.md`, explicit note).
- `/dev/uhid` is `uhid:uhid` with the shell user in group 3011, since the Android 8 cycle (AOSP commit `0729dd1e`,
  current `ueventd.rc`), and AOSP ships a `hid` shell command that accepts arbitrary HID report descriptors.
- Android 12+ applies `FLAG_SECURE` to the `shell` user, so a secure app cannot be mirrored by scrcpy.
- scrcpy **4.1 was reported working on a Samsung device on Android 16 / One UI 8.5** (issue #7079), while 5.0 failed there.
- Several OEMs (especially Xiaomi) additionally require "USB debugging (Security settings)" + reboot for injection.
- Garena's published ban clauses and emulator-pool policy (quoted in §10.2).
- Garena frames keyboard/mouse as a PC/emulator characteristic, not a mobile one, and segregates emulator matchmaking
  rather than banning it (official policy article). **Strong secondary evidence** (not first-party confirmation) that
  the *phone* build is touch-only and that native KB/M support exists only in the Google Play Games on PC build.

### 11.2 UNTESTED — assumptions that must not be treated as facts

1. That the S24 FE / Android 16 accepts scrcpy injection at all (Samsung may need the security-debugging toggle).
2. **That FF MAX does not set `FLAG_SECURE`** (mirror is not black). Unknown either way.
3. **That FF MAX accepts events from a virtual (injected) touch source.**
4. That FF MAX's camera responds to a synthetic drag with usable sensitivity and no snap on rebase.
5. That FF MAX keeps a held camera finger alive while other fingers tap.
6. That analog joystick movement via injected `MOVE` produces smooth, correctly-scaled character movement.
7. That end-to-end latency lands near the 60–120 ms estimate.
8. That a two-instance setup (video instance + control-only instance) coexists cleanly on this specific phone.
9. That the `hid` shell command exists and is permitted on Samsung's Android 16 build; and that a UHID digitizer
   descriptor is classified as a touchscreen there.
10. That the S24 FE's actual resolution/refresh (`1080x2340`/120 Hz expected) and HDR/rotation behaviour are as assumed
    — verify with `adb shell wm size` / `dumpsys display`, do not hard-code.

---

## 12. Proof-of-concept test plan

Sequential. **Each gate must pass before the next is attempted**, and no gate may be reported as passing without a
recorded observation. Estimated total: one focused session, plus a longer soak.

### Phase A — device reality check (no code)

**T0 — Baseline capability probe.** Device connected via USB, USB debugging on.
```bash
adb devices -l
adb shell getprop ro.product.model        # expect SM-S721* ; record actual
adb shell getprop ro.build.version.release # expect 16
adb shell getprop ro.build.version.sdk     # expect 36
adb shell wm size ; adb shell wm density
adb shell dumpsys display | grep -iE "fps|refresh|real"
adb shell id                                # look for (uhid) / gid 3011
adb shell ls -l /dev/uhid                   # expect crw-rw---- uhid uhid
adb shell which hid ; adb shell hid -h      # UHID fallback availability
```
*Pass:* model/version recorded, `wm size` known, uhid group present. *Record everything — HUD calibration and every
coordinate depend on this.*

**T1 — Mirroring works.** `scrcpy --no-audio --max-size=1600 --max-fps=60`
*Pass:* launcher visible, interacts smoothly. *Fail:* see T2.

**T2 — `FLAG_SECURE` probe (CRITICAL GATE).** Launch FF MAX, enter a match, keep mirroring.
```bash
adb shell dumpsys window | grep -iE "mSecure|FLAG_SECURE|isSecure"
```
*Pass:* game renders in the mirror; `dumpsys` shows no secure flag on the game window.
*Fail:* black rectangle → **project is No-Go for "mirroring"**; stop and report rather than seeking workarounds.

**T3 — Injection sanity outside the game.** Use `scrcpy`'s own mouse (SDK mode) on the launcher: tap an icon, swipe a
menu.
*Pass:* taps land where clicked. *Fail with `SecurityException: …INJECT_EVENTS`:* enable Developer options →
**USB debugging (Security settings)**, **reboot**, retry. Record which combination was required — it becomes a
first-run requirement in the app.

**T4 — Does FF MAX accept injected touch? (CRITICAL GATE, still no code).**
In Training Ground:
```bash
adb shell input swipe 800 1200 400 1200 300   # slow synthetic camera drag, right side
adb shell input tap 950 2100                  # fire button
```
*Pass:* camera rotates / weapon fires. *Partial:* UI responds but in-game camera does not → escalate to T9 (UHID).
*Fail:* nothing at all → check T3 first, then T9.

### Phase B — engine spikes (small scripts, disposable)

**T5 — Multitouch.** Throwaway Node script: control-only `scrcpy-server` instance + minimal touch serializer. Inject
(i) one finger held and moved, (ii) two fingers simultaneously (move + camera), (iii) three fingers (move + camera +
fire).
*Pass:* all three work concurrently in Training Ground; no dropped or stuck pointers. *Record:* pointer count at which
behaviour degrades.

**T6 — Camera rebase quality.** Continuous drag with `UP`+`DOWN` rebase at the zone edge; capture at 120–240 fps and
step frames.
*Pass:* no visible snap, stall ≤ 1 frame, camera does not jump horizontally. *Fail:* try staggered anchors / larger
travel, then re-measure. **No "smooth" claim without this recording.**

**T7 — Latency.** Input→photon measurement as described in §9.2. Report p50 **and** p95, plus the video-only baseline
(scrcpy's own overlay/`--print-fps` for pipeline fps).
*Pass:* p95 ≤ 120 ms and subjectively playable. *Record the number even if it fails* — the number decides whether the
product is honest.

**T8 — Is a real mouse enough? (cheap, do it early).** Pair a Bluetooth mouse (or `scrcpy --mouse=uhid`), aim in
Training Ground.
*Pass:* camera responds → **re-plan**: camera becomes `--mouse=uhid` and the touch-drag engine simplifies drastically.
*Expected fail:* cursor + UI taps only → proceed with R2.

**T9 — UHID fallback spike (only if T4/T5 fail).** `adb shell hid -` → register a mouse, confirm it appears
(`adb shell dumpsys input | grep -i -A3 hid`), then attempt a Digitizer-page multitouch descriptor; verify Android
classifies it as a **touchscreen** (not pointer) and that FF MAX accepts its contact reports.
*Pass:* touchscreen recognised and game accepts multi-contact. *Fail:* document and stop — this exhausts the no-root
options.

### Phase C — endurance

**T10 — 30–60 minute soak in a real session.** Watch for: stuck fingers after alt-tab, drift, pointer exhaustion
("Too many pointers"), disconnect/reconnect mid-match, device sleep, USB re-enumeration, memory growth.
*Pass:* zero stuck touches, clean recovery after unplug/replug, panic-release verified on window blur and on hotkey.

### 12.1 Hard exit criteria

Stop and report (do not engineer around) if:
- T2 shows the game is `FLAG_SECURE` (mirroring impossible without root).
- T4 fails, T9 fails, and T8 fails (no input path reaches the game).
- T7 shows p95 latency above roughly 150 ms (the product would be a liability, not a controller).
- Any solution would require root, Shizuku, `/dev/input` writes, or detection evasion — all forbidden by the brief.

---

## 13. Go / No-Go recommendation

### Verdict: CONDITIONAL GO — PoC only, not the full application yet

**Why Go is justified:**

1. The injection mechanism is **identified and proven in principle**: `InputManager.injectInputEvent()` from the `shell`
   UID via `scrcpy-server` — no root, no Shizuku, no forbidden APIs, and it is the same mechanism a mature,
   Apache-2.0 project has shipped for years.
2. **Multitouch is supported at the mechanism level** (10 pointers, correct `ACTION_POINTER_*` semantics), so joystick +
   camera + fire simultaneously is architecturally possible.
3. **Relative mouse → camera is solvable without game cooperation** via synthetic touch drag, which is exactly what the
   injection engine is good at. (And T8 might make it trivial.)
4. Required tooling is **already installed and free**: adb, scrcpy 4.1, Node 26; all libraries are Apache-2.0/MIT.
5. The transport is **USB-only**, as required, with no network surface added.
6. Android 16 is **not a blocker**: scrcpy 4.1 has Android 16 fixes and has been reported working on Samsung Android
   16 / One UI 8.5 hardware.

**Why it is conditional, not a green light:**

Two unknowns can each kill the product outright, and both are cheap to test:

- **`FLAG_SECURE`** — if FF MAX blocks capture, mirroring is impossible without root → brief cannot be met.
- **Injection acceptance** — if FF MAX ignores virtual touch events, only the unproven UHID path remains.

Neither can be settled by research; both are settled in minutes on the actual phone (T2, T4).

**Recommended decision path:**

```
T0 → T1 → T2 ─┬─ black ────────────────────────────► NO-GO (report, stop)
              └─ ok → T3 → T4 ─┬─ works ────────────► GO to Phase 2 (Stage 0 PoC → Stage 1 engine)
                                ├─ partial → T8/T9 ─┬─ works → GO (reduced scope)
                                │                   └─ fails → NO-GO
                                └─ fails → T9 ──────► same
```

**If approved, Phase 2 begins with Stage 0 only:** the disposable scripts behind T5–T7, plus initialising git. No
application shell, no UI, no profiles, no packaging — none of that is authorised until the gates in §12 have recorded
results.

### 13.1 What I would tell a stakeholder in one paragraph

Building a touch-mapping controller for FF MAX without root is technically possible and the mechanism is well
understood — but two properties of *this specific game* are unknown, and both are decisive. The project should proceed
as a short, cheap experiment that answers two questions on the real phone before any real engineering: does the game
let itself be mirrored, and does it accept synthetic touch. If both answers are yes, the rest is ordinary software
engineering with a known latency floor of roughly 35–70 ms of visual lag — playable for a mobile shooter, not
competitive-grade. If either answer is no, no amount of engineering inside the stated restrictions will fix it, and we
should stop rather than drift toward root or detection-evasion, both of which are explicitly off the table.

---

## 14. Decisions I need from you before Phase 2

1. **Ban risk acceptance.** Garena's rules name "unauthorised tools that interact with the game client" and
   "non-official programs to provide an edge", with permanent **device** bans and no appeals, and detection is
   undisclosed. Test on a secondary account / Training Ground only, or stop here?
2. **Latency expectation.** A 35–70 ms mirroring floor means aim feel will be "mobile-game-with-a-mouse", not PC-grade.
   Accept, or should I re-examine a lower-latency capture approach first (more work, still no root)?
3. **UI stack.** TypeScript/Electron (recommended, fastest premium UI, MIT/Apache deps) or .NET 9/WPF (smaller, lower
   input latency, more video work)?
4. **Device access.** I need the S24 FE connected via USB with USB debugging enabled to run T0–T4. If "USB debugging
   (Security settings)" needs enabling (and a reboot), that is a one-time manual step on your side.
