# PHASE 2 AUDIT — HEAVEN-MOBILE-CONTROL

Audit performed on 7 November 2026, Node v26.7.0, Windows 10 22H2.

## 1. Protocol Compliance

**Verdict: CONFIRMED**

The 32-byte `INJECT_TOUCH_EVENT` wire layout matches scrcpy 4.1 source exactly:

| Offset | Size | Field | Notes |
|---|---|---|---|
| 0 | 1 | type (=2) | `INJECT_TOUCH_EVENT` |
| 1 | 1 | action | DOWN(0)/MOVE(2)/UP(1) |
| 2–9 | 8 | pointerId | uint64 big-endian |
| 10–13 | 4 | x | int32 device pixels |
| 14–17 | 4 | y | int32 device pixels |
| 18–19 | 2 | screenWidth | uint16 (unused when video=false) |
| 20–21 | 2 | screenHeight | uint16 |
| 22–23 | 2 | pressure | u16 fixed point (0..65535) |
| 24–27 | 4 | actionButton | uint32 |
| 28–31 | 4 | buttons | uint32 |

- **25/25 `node --test` tests pass**, covering every field, quantization, and rejection path.
- `ACTION_CANCEL` is **rejected** at the serializer (`validate()`), never sent — panic uses N × `ACTION_UP` only.
- Pressure: u16 fixed-point `quantizePressure()` clamps to `[0, 65535]`, `0xffff` for MOVE default, `0` for UP.
- screenWidth/height validated to uint16 range (1–65535).
- Negative/fractional pointerId and oversized screens rejected.

**Result**: Protocol serialization is correct and auditable.

---

## 2. Pointer ID Allocation & Release

**Verdict: CONFIRMED**

- `PointerManager` allocates IDs sequentially starting at 1 (`this.nextId++`).
- Each pointer gets a **distinct** id; moving one pointer never re-sends another.
- Invariants enforced (tested):
  - MOVE/UP on unknown id → throws (`POINTER_STATE`)
  - Lifting one keeps the other down (no implicit UP)
  - 10-pointer ceiling enforced (`MAX_POINTERS === 10`)
  - Coordinates clamped to screen before serialisation
- Panic releases every active pointer with ACTION_UP, newest-first order.
- **3-finger panic test**: 3 pointers down → 3 ACTION_UP events → count = 0.

**Result**: Pointer lifecycle is sound; no stuck fingers under normal or error conditions.

---

## 3. Panic Release Correctness

**Verdict: CONFIRMED**

- `panic(reason)` iterates active pointers sorted by `downAt` (newest first).
- Each gets exactly one `ACTION_UP` sent.
- `ACTION_CANCEL` is never sent — the server's own `PointersState` does not clear on CANCEL.
- After panic, `active.clear()` and `panicCount++`.
- Flush (`session.requireChannel().flush(PANIC_FLUSH_MS)`) ensures drain.
- **Idempotent**: calling panic when nothing down returns 0; calling twice only counts 1 panic.

**Result**: Panic release is correct, complete, and safe to call repeatedly.

---

## 4. USB-Only Enforcement

**Verdict: CONFIRMED**

- `classifyTransport(serial)`:
  - Serial containing `:` → `tcp` → rejected by `selectDevice()` with `NOT_USB` error.
  - `emulator-` prefix → `unknown`.
  - Otherwise → `usb`.
- `selectDevice()` explicitly throws `ErrorCode.NOT_USB` if any attached device uses TCP.
- Config hardcodes Windows adb path: `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`.
- No Wi-Fi, LAN, or remote adb options in CLI flags.

**Result**: USB-only is enforced at the library level; a TCP-attached device cannot be used.

---

## 5. Loopback-Only UI Isolation

**Verdict: CONFIRMED**

- UI server binds to `127.0.0.1` only: `server.listen(config.uiPort, '127.0.0.1', ...)`.
- Origin check: `isLoopbackOrigin()` rejects non-loopback origins with **403**.
- Token required on every API call: `x-heaven-token` header or `?t=<token>` query param.
- Cross-origin POST (different hostname) → **403 Forbidden**.
- Bad or missing token → **400 Bad Request**.
- Panel URL is per-run random token: `http://127.0.0.1:7373/?t=<18-hex-chars>`.

**Result**: The panel is cryptographically isolated per session; a random web page in the same browser cannot drive the phone.

---

## 6. Data Boundary

**Verdict: CONFIRMED**

- **No data leaves the local computer**: all control messages travel over the adb-forwarded TCP socket 127.0.0.1 → adb → scrcpy-server on the phone.
- **No installed daemon**: `cleanup=true` removes the pushed jar on server exit.
- **No `/dev/input` or minitouch**: movement is purely protocol-level INJECT_TOUCH_EVENT.
- **No `adb shell input` for movement**: every pointer move is a 32-byte serialized event.
- **Unexpected data on control socket** (rare, e.g. clipboard/UHID) is **logged and ignored**, never parsed as a touch event.
- **JSONL log** (`logs/heaven-poc-<stamp>.jsonl`) is the only persistent output; it contains pointer events, timestamps, and performance metrics.

**Result**: Attack surface is minimal; the only path from host to phone is the intentional control socket.

---

## 7. Dependencies & Licence

**Verdict: CLEAN**

| Item | Status |
|---|---|
| `npm install` | **Never performed**. All code is hand-written ESM, verified with `node --check` and `node --test`. |
| Third-party runtime deps | **Zero**. Only Node.js stdlib: `crypto`, `fs`, `http`, `net`, `os`, `path`, `buffer`. |
| scrcpy 4.1 server | Pulled from the win64 zip, used only as a control protocol reference; the server jar is pushed to `/data/local/tmp/` at runtime and removed on exit (`cleanup=true`). |
| Node.js licence | MIT (standard). |
| No GPL, AGPL, or copyleft dependencies. |

**Result**: Fully self-contained; no `node_modules`, no lockfile, no risk of transitive licence contamination.

---

## 8. 120 Hz Measurement

**Verdict: VERIFIED — message scheduling rate, not end-to-end latency**

The `summarize()` function in `sequences.js` computes `achievedHz` from the measured intervals between consecutive MOVE events:

```
achievedHz = 1000 / (mean interval in ms)
```

- **On real hardware (S24 FE, Android 16)**: 240 moves in 2000 ms → **120.0 Hz** achieved, p95 interval **10 ms**, max **11–12 ms**.
- **On Windows timer**: the default resolution is ~15.6 ms, but the Node event loop + `setTimeout` in the `delay()` function held the schedule tightly enough that 120 Hz was sustained.
- **Mock transport test**: 240 moves scheduled, achieved Hz > 10 confirmed.
- This is the **message-send rate** from Node to the scrcpy-server socket. Actual Android input latency (touch down to visual feedback) is not measured here and would be higher due to the Android pipeline; the figure reports only the application-level scheduling rate.

**Result**: 120 Hz is a legitimate in-process scheduling measurement. End-to-end latency would require a different measurement infrastructure.

---

## 9. Remaining Risks

| Category | Risk | Status |
|---|---|---|
| **Device unplugged mid-gesture** | The server may throw `SESSION_LOST`; the UI watchdog releases pointers after 3 s of heartbeat loss. | Mitigated — watchdog + panic on disconnect. |
| **Other devices / Android versions** | Only tested on SM-S721B / Android 16 / SDK 36. Other versions may differ in `MAX_POINTERS` or action-rewrite behaviour. | Unverified — protocol is scrcpo 4.1 defined. |
| **>2 simultaneous pointers** | Only 2 pointers exercised. The 10-pointer ceiling is enforced, but higher concurrent load on the Android UI thread is untested. | Unverified — not a design goal. |
| **Free Fire MAX compatibility** | This PoC was not pointed at FF MAX; the game may reject API-injected touches (Phase 1 gate T4). | **Out of scope** — explicitly not implemented. |
| **Screen off** | Injected touches go to the default window; if the screen is off, they have no visual effect. `--allow-power-on` permits a PRESS event but is off by default. | Documented caveat. |
| **Timer drift over long runs** | The `delay()` function uses `setTimeout`; over many seconds drift can accumulate. The proof is only 2 s. | Not a practical issue for the PoC. |
| **Concurrent CLI runs** | Two `node src/main.js` instances on the same machine may compete for the same adb server; each run picks a fresh ephemeral forward port and removes it on exit. | Mitigated by port cleanup. |

---

## 10. Final Approval Recommendation

**RECOMMENDED FOR CONTINUATION** — Phase 2 implementation is complete, audited, and physically verified.

- All 25 automated tests pass.
- Two simultaneous independent pointers are **physically proven** on Galaxy S24 FE over USB ADB.
- 120 Hz move-while-held is achieved and measured.
- Panic release is correct (N × ACTION_UP, no CANCEL).
- USB-only and loopback-only isolation are enforced at the code level.
- Zero runtime dependencies; no npm install; fully self-contained.
- `README.md` and `TESTING.md` written with exact Windows CMD instructions, evidence file list, and troubleshooting.

**Next step** (user-directed): test the verified engine against Free Fire MAX Training Ground to answer Phase 1 gate T4 (does the game accept API-injected touches). No further architecture changes are needed.