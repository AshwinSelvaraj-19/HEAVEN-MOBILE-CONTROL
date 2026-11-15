import assert from 'node:assert/strict';
import test from 'node:test';
import { renderPage } from '../src/ui-page.js';

function page() {
  return renderPage({
    token: 'tok',
    width: 1080,
    height: 2340,
    model: 'TEST',
    mock: true,
    screenAvailable: false,
    videoAvailable: false,
    mouseSensitivity: 1,
    screenWake: null,
  });
}

test('rebind replaces an old key and keeps selection/inspector updated', () => {
  const html = page();
  assert.match(html, /inspectorKeyCapture = true/);
  assert.match(html, /Click to change/);
  assert.match(html, /tgt\.key = key;[\s\S]*?syncTapBindingsFromTargets\(\);[\s\S]*?inspectorKeyCapture = false;/);
  assert.match(html, /renderAddControlInspector\(\);/);
});

test('duplicate key is rejected with the old key kept and capture remains active', () => {
  const html = page();
  assert.match(html, /already used by/);
  assert.match(html, /keep old key, stay in capture mode/);
  assert.match(html, /setInspectorStatus\(displayKey\(key\) \+ ' is already used by '/);
});

test('Backspace clears a key while capturing', () => {
  const html = page();
  assert.match(html, /key === 'backspace' \|\| key === 'delete'/);
  assert.match(html, /tgt\.key = '';/);
  assert.match(html, /Key cleared/);
});

test('Aim sensitivityX/sensitivityY fields and wiring are present', () => {
  const html = page();
  assert.match(html, /id="aim-sens-x"/);
  assert.match(html, /id="aim-sens-y"/);
  assert.match(html, /sensitivityX/);
  assert.match(html, /sensitivityY/);
});
