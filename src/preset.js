/**
 * Preset export/import helpers (additive). Layout-only data; no tokens/passwords/serials.
 */

export function applyAimDefaultsToTarget(t) {
  if (!t || (t.action !== "aim" && t.kmType !== "aim")) return t;
  if (t.startStopKey === undefined || t.startStopKey === null || t.startStopKey === "") t.startStopKey = "alt";
  if (t.suspendKey === undefined || t.suspendKey === null || t.suspendKey === "") t.suspendKey = "x";
  const fb = t.sensitivity !== undefined ? Number(t.sensitivity) : NaN;
  if (t.sensitivityX === undefined) t.sensitivityX = Number.isFinite(fb) ? fb : 1.42;
  if (t.sensitivityY === undefined) t.sensitivityY = Number.isFinite(fb) ? fb : 1.46;
  if (!Number.isFinite(Number(t.sensitivityX))) t.sensitivityX = 1.42;
  if (!Number.isFinite(Number(t.sensitivityY))) t.sensitivityY = 1.46;
  t.sensitivityX = Number(t.sensitivityX);
  t.sensitivityY = Number(t.sensitivityY);
  t.sensitivity = t.sensitivityY;
  if (t.tweaks === undefined || !Number.isFinite(Number(t.tweaks))) t.tweaks = 16450;
  t.tweaks = Number(t.tweaks);
  if (t.mouseAcceleration === undefined) t.mouseAcceleration = false;
  t.mouseAcceleration = t.mouseAcceleration === true;
  if (t.crosshairEnabled === undefined) t.crosshairEnabled = true;
  if (t.crosshairStyle === undefined) t.crosshairStyle = "Cross";
  if (t.crosshairSize === undefined || !Number.isFinite(Number(t.crosshairSize))) t.crosshairSize = 2;
  t.crosshairSize = Number(t.crosshairSize);
  if (t.crosshairOpacity === undefined || !Number.isFinite(Number(t.crosshairOpacity))) t.crosshairOpacity = 100;
  t.crosshairOpacity = Number(t.crosshairOpacity);
  if (t.crosshairColor === undefined || t.crosshairColor === null || t.crosshairColor === "") t.crosshairColor = "#AA0000";
  if (t.fireWithLeftClick === undefined) t.fireWithLeftClick = true;
  if (t.fireAction === undefined || !t.fireAction) t.fireAction = "LEFT CLICK";
  if (t.fireX === undefined && t.x2 !== undefined) t.fireX = Number(t.x2);
  if (t.fireY === undefined && t.y2 !== undefined) t.fireY = Number(t.y2);
  if (t.fireX === undefined || !Number.isFinite(Number(t.fireX))) t.fireX = 0.7526;
  if (t.fireY === undefined || !Number.isFinite(Number(t.fireY))) t.fireY = 0.7281;
  t.fireX = Number(t.fireX); t.fireY = Number(t.fireY); t.x2 = t.fireX; t.y2 = t.fireY;
  if (t.lookAroundEnabled === undefined) t.lookAroundEnabled = false;
  if (t.freeLookX === undefined || !Number.isFinite(Number(t.freeLookX))) t.freeLookX = -1;
  if (t.freeLookY === undefined || !Number.isFinite(Number(t.freeLookY))) t.freeLookY = -1;
  t.freeLookX = Number(t.freeLookX); t.freeLookY = Number(t.freeLookY);
  t.action = "aim"; t.kmType = "aim";
  return t;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function buildPreset({ layout, msiProfile, keyBindings, name, exportedAt }) {
  const l = layout && typeof layout === "object" ? clone(layout) : { taps: [], targets: [], cameraToggleKey: null, mouseSensitivity: 1 };
  const p = msiProfile && typeof msiProfile === "object" ? clone(msiProfile) : {};
  const b = keyBindings && typeof keyBindings === "object" ? clone(keyBindings) : { WASD: { w: "w", a: "a", s: "s", d: "d" }, Fire: "left click", Scope: "right click" };
  p.scheme = p.scheme || name || "Untitled";
  p.taps = Array.isArray(l.taps) ? l.taps : (Array.isArray(p.taps) ? p.taps : []);
  p.targets = Array.isArray(l.targets) ? l.targets : (Array.isArray(p.targets) ? p.targets : p.taps);
  p.controls = Array.isArray(p.controls) ? p.controls : p.targets;
  p.fields = p.fields && typeof p.fields === "object" && !Array.isArray(p.fields) ? p.fields : {};
  p.bindings = p.bindings && typeof p.bindings === "object" && !Array.isArray(p.bindings) ? p.bindings : b;
  p.cameraToggleKey = l.cameraToggleKey !== undefined ? l.cameraToggleKey : (p.cameraToggleKey ?? null);
  if (p.controlsVersion === undefined) p.controlsVersion = 1;
  for (const arr of [p.controls, p.targets, p.taps, l.targets, l.taps]) if (Array.isArray(arr)) arr.forEach(applyAimDefaultsToTarget);
  return {
    format: "heaven-preset",
    version: 1,
    name: name || p.scheme || "Untitled",
    exportedAt: exportedAt || new Date().toISOString(),
    "heaven-msi-profile": p,
    "heaven-key-bindings": b,
    "heaven-layout": l,
  };
}

export function validatePreset(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, reason: "not-object" };
  if (data.format !== "heaven-preset") return { ok: false, reason: "format" };
  if (data.version !== 1) return { ok: false, reason: "version" };
  const profile = data["heaven-msi-profile"];
  const bindings = data["heaven-key-bindings"];
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return { ok: false, reason: "profile" };
  if (!Array.isArray(profile.controls)) return { ok: false, reason: "controls" };
  if (profile.taps !== undefined && !Array.isArray(profile.taps)) return { ok: false, reason: "taps" };
  if (bindings !== undefined && (bindings === null || typeof bindings !== "object" || Array.isArray(bindings))) return { ok: false, reason: "bindings" };
  return { ok: true };
}

export function normalizePreset(data) {
  const v = validatePreset(data);
  if (!v.ok) return v;
  const profile = clone(data["heaven-msi-profile"]);
  let bindings = data["heaven-key-bindings"];
  bindings = bindings && typeof bindings === "object" && !Array.isArray(bindings)
    ? clone(bindings)
    : { WASD: { w: "w", a: "a", s: "s", d: "d" }, Fire: "left click", Scope: "right click" };
  const taps = Array.isArray(profile.taps) ? profile.taps : [];
  const controls = Array.isArray(profile.controls) ? profile.controls : [];
  const targets = Array.isArray(profile.targets) ? profile.targets : controls;
  for (const arr of [controls, targets, taps]) arr.forEach(applyAimDefaultsToTarget);
  profile.taps = taps; profile.controls = controls; profile.targets = targets;
  if (!profile.fields || typeof profile.fields !== "object" || Array.isArray(profile.fields)) profile.fields = {};
  let layout = data["heaven-layout"];
  if (!layout || typeof layout !== "object" || Array.isArray(layout)) {
    layout = { taps, targets, cameraToggleKey: profile.cameraToggleKey ?? null, mouseSensitivity: 1 };
  } else {
    layout = clone(layout);
    if (!Array.isArray(layout.taps)) layout.taps = taps;
    if (!Array.isArray(layout.targets)) layout.targets = targets;
    for (const arr of [layout.targets, layout.taps]) if (Array.isArray(arr)) arr.forEach(applyAimDefaultsToTarget);
  }
  return { ok: true, profile, bindings, layout, name: data.name || profile.scheme || "Untitled" };
}
