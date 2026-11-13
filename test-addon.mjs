import('./build/Release/napi_windows_input.node').then(addon => {
  console.log('Direct .node import works');
  console.log('keys:', Object.keys(addon));
  console.log('GetAsyncKeyState type:', typeof addon.GetAsyncKeyState);
  console.log('GetCursorPos type:', typeof addon.GetCursorPos);
  console.log('SetCursorPos type:', typeof addon.SetCursorPos);
  try { console.log('GetAsyncKeyState(0x57):', addon.GetAsyncKeyState(0x57)); } catch(e) { console.error(e.message); }
  try { const r = addon.GetCursorPos(); console.log('GetCursorPos:', r); } catch(e) { console.error(e.message); }
  try { console.log('SetCursorPos(100,100):', addon.SetCursorPos(100, 100)); } catch(e) { console.error(e.message); }
}).catch(e => console.error('Direct import failed:', e));
