#include <node_api.h>
#include <windows.h>
#include <string>

// Helper: Convert UTF-8 napi_value string to std::wstring
static std::wstring napiValueToWide(napi_env env, napi_value val) {
  // First, get the length of the UTF-8 string
  size_t len = 0;
  napi_get_value_string_utf8(env, val, nullptr, 0, &len);

  // Convert to narrow string first
  std::string narrow(len, '\0');
  napi_get_value_string_utf8(env, val, &narrow[0], len + 1, nullptr);

  // Then convert to wide string
  int wideLen = MultiByteToWideChar(CP_UTF8, 0, narrow.c_str(), (int)narrow.length(), nullptr, 0);
  std::wstring wide(wideLen, L' ');
  MultiByteToWideChar(CP_UTF8, 0, narrow.c_str(), (int)narrow.length(), &wide[0], wideLen);

  return wide;
}

// ---------------------------------------------------------------------------
// Helper: Wrap GetAsyncKeyState in a napi_value return (boolean: key is down)
napi_value GetAsyncKeyStateWrap(napi_env env, napi_callback_info info) {
  napi_status status;
  napi_value result;

  // Parse argument: key code (uint32)
  size_t argc = 1;
  napi_value args[1];
  status = napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (status != napi_ok || argc < 1) {
    napi_throw_type_error(env, nullptr, "GetAsyncKeyState requires a key code argument");
    return nullptr;
  }

  uint32_t keyCode;
  napi_get_value_uint32(env, args[0], &keyCode);

  // Call GetAsyncKeyState from user32
  SHORT kv = GetAsyncKeyState((UINT16)keyCode);
  bool isDown = (kv & 0x8000) != 0;

  // Create boolean result using napi_get_boolean
  status = napi_get_boolean(env, isDown, &result);
  if (status != napi_ok) {
    napi_throw_error(env, nullptr, "Failed to create boolean result");
    return nullptr;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helper: Wrap GetCursorPos in a napi_value return (object {x, y})
napi_value GetCursorPosWrap(napi_env env, napi_callback_info info) {
  napi_status status;
  napi_value result;
  POINT pt;

  if (!GetCursorPos(&pt)) {
    napi_throw_error(env, nullptr, "GetCursorPos failed");
    return nullptr;
  }

  status = napi_create_object(env, &result);
  if (status != napi_ok) {
    napi_throw_error(env, nullptr, "Failed to create result object");
    return nullptr;
  }

  // Use napi_create_double to create napi_value from double
  napi_value x_val, y_val;
  status = napi_create_double(env, (double)pt.x, &x_val);
  if (status != napi_ok) {
    napi_throw_error(env, nullptr, "Failed to create x value");
    return nullptr;
  }
  status = napi_create_double(env, (double)pt.y, &y_val);
  if (status != napi_ok) {
    napi_throw_error(env, nullptr, "Failed to create y value");
    return nullptr;
  }

  napi_set_named_property(env, result, "x", x_val);
  napi_set_named_property(env, result, "y", y_val);

  return result;
}

// ---------------------------------------------------------------------------
// Helper: Wrap GetForegroundWindow in a napi_value return (window handle as BigInt)
napi_value GetForegroundWindowWrap(napi_env env, napi_callback_info info) {
  napi_status status;
  napi_value result;
  HWND hwnd = GetForegroundWindow();

  // Create BigInt from window handle pointer value for safe comparison.
  // HWND is a pointer (void*) on Windows; reinterpret as int64_t.
  // Preserve full 64-bit pointer width - do NOT mask to 32 bits.
  int64_t hwndValue = reinterpret_cast<int64_t>(hwnd);
  status = napi_create_bigint_int64(env, hwndValue, &result);
  if (status != napi_ok) {
    napi_throw_error(env, nullptr, "Failed to create BigInt result");
    return nullptr;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helper: Wrap SetCursorPos in a napi_value return (boolean success)
napi_value SetCursorPosWrap(napi_env env, napi_callback_info info) {
  napi_status status;
  napi_value result;
  UINT x, y;

  size_t argc = 2;
  napi_value args[2];
  status = napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (status != napi_ok || argc < 2) {
    napi_throw_type_error(env, nullptr, "SetCursorPos requires x and y arguments");
    return nullptr;
  }

  napi_get_value_uint32(env, args[0], &x);
  napi_get_value_uint32(env, args[1], &y);

  BOOL ok = SetCursorPos((INT)x, (INT)y);

  // Create boolean result
  status = napi_get_boolean(env, ok, &result);

  return result;
}

// ---------------------------------------------------------------------------
// Helper: Wrap CreateWindowExW in a napi_value return (window handle as BigInt)
napi_value CreateWindowExWrap(napi_env env, napi_callback_info info) {
  napi_status status;
  napi_value result;

  // Parse arguments: styles, class name, window name, parent, menu
  size_t argc = 5;
  napi_value args[5];
  status = napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (status != napi_ok || argc < 5) {
    napi_throw_type_error(env, nullptr, "CreateWindowExW requires arguments");
    return nullptr;
  }

  // Get window style
  uint32_t style;
  napi_get_value_uint32(env, args[0], &style);

  // Get class name (convert napi UTF-8 to wide string)
  std::wstring className = napiValueToWide(env, args[1]);

  // Get window name (convert napi UTF-8 to wide string)
  std::wstring windowName = napiValueToWide(env, args[2]);

  // Get parent window handle (as int64)
  int64_t parentHwnd;
  napi_get_value_int64(env, args[3], &parentHwnd);

  // Get menu (unused - pass nullptr)
  napi_value menuVal;
  napi_get_null(env, &menuVal);

  // Register window class
  WNDCLASSEXW wc = { sizeof(WNDCLASSEXW) };
  wc.style = CS_HREDRAW | CS_VREDRAW;
  wc.lpfnWndProc = DefWindowProcW;
  wc.hInstance = nullptr;
  wc.lpszClassName = className.c_str();

  ATOM atom = RegisterClassExW(&wc);
  if (!atom) {
    napi_throw_error(env, nullptr, "Failed to register window class");
    return nullptr;
  }

  // Create the window (message-only, hidden)
  // Using WS_EX_APPWINDOW | WS_EX_WINDOWEDGE for a standard desktop window
  HWND hwnd = CreateWindowExW(
    WS_EX_APPWINDOW | WS_EX_WINDOWEDGE,
    wc.lpszClassName,
    windowName.c_str(),
    style,
    CW_USEDEFAULT, CW_USEDEFAULT,
    CW_USEDEFAULT, CW_USEDEFAULT,
    reinterpret_cast<HWND>(parentHwnd),
    nullptr,
    wc.hInstance,
    nullptr);

  if (!hwnd) {
    napi_throw_error(env, nullptr, "Failed to create window");
    return nullptr;
  }

  // Create BigInt from window handle pointer value for safe comparison.
  // HWND is a pointer (void*) on Windows; reinterpret as int64_t.
  // Preserve full 64-bit pointer width - do NOT mask to 32 bits.
  int64_t hwndValue = reinterpret_cast<int64_t>(hwnd);
  status = napi_create_bigint_int64(env, hwndValue, &result);
  if (status != napi_ok) {
    napi_throw_error(env, nullptr, "Failed to create BigInt result");
    return nullptr;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Initialize exports - use separate status variables for each function
napi_value Init(napi_env env, napi_value exports) {
  napi_status status1;  // Separate status for each napi_create_function call
  napi_status status2;
  napi_status status3;
  napi_status status4;
  napi_value fn1 = nullptr;
  napi_value fn2 = nullptr;
  napi_value fn3 = nullptr;
  napi_value fn4 = nullptr;

  // GetAsyncKeyState(keyCode) -> boolean
  status1 = napi_create_function(env, nullptr, 0, GetAsyncKeyStateWrap, nullptr, &fn1);
  if (status1 == napi_ok && fn1) {
    napi_set_named_property(env, exports, "GetAsyncKeyState", fn1);
  }

  // GetForegroundWindow() -> external pointer (window handle) as BigInt
  status2 = napi_create_function(env, nullptr, 0, GetForegroundWindowWrap, nullptr, &fn2);
  if (status2 == napi_ok && fn2) {
    napi_set_named_property(env, exports, "GetForegroundWindow", fn2);
  }

  // GetCursorPos() -> {x: number, y: number}
  status3 = napi_create_function(env, nullptr, 0, GetCursorPosWrap, nullptr, &fn3);
  if (status3 == napi_ok && fn3) {
    napi_set_named_property(env, exports, "GetCursorPos", fn3);
  }

  // SetCursorPos(x, y) -> boolean
  status4 = napi_create_function(env, nullptr, 0, SetCursorPosWrap, nullptr, &fn4);
  if (status4 == napi_ok && fn4) {
    napi_set_named_property(env, exports, "SetCursorPos", fn4);
  }

  // CreateHeavenWindow() -> BigInt HWND
  // Reuse status1 since we've already used status2, status3, status4
  status1 = napi_create_function(env, nullptr, 0, CreateWindowExWrap, nullptr, &fn1);
  if (status1 == napi_ok && fn1) {
    napi_set_named_property(env, exports, "CreateHeavenWindow", fn1);
  }

  // Also set GetForegroundWindow explicitly if not already set
  if (status2 != napi_ok || !fn2) {
    // Try to set it again - but fn2 may already be from GetForegroundWindowWrap
    // We need to create it fresh
    napi_status status5 = napi_create_function(env, nullptr, 0, GetForegroundWindowWrap, nullptr, &fn2);
    if (status5 == napi_ok && fn2) {
      napi_set_named_property(env, exports, "GetForegroundWindow", fn2);
    }
  }

  // Final: ensure GetAsyncKeyState is set (in case it was overwritten)
  if (status1 != napi_ok || !fn1) {
    napi_status status6 = napi_create_function(env, nullptr, 0, GetAsyncKeyStateWrap, nullptr, &fn1);
    if (status6 == napi_ok && fn1) {
      napi_set_named_property(env, exports, "GetAsyncKeyState", fn1);
    }
  }

  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)