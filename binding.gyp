{
  "targets": [
    {
      "target_name": "napi_windows_input",
      "type": "loadable_module",
      "sources": ["napi-windows-input.cpp"],
      "libraries": ["user32.lib", "kernel32.lib"],
      "cflags": ["-std=c++17"],
      "x64_release": {
        "defines": ["NODE_GYP_MODULE_NAME=napi_windows_input"]
      },
      "x64_debug": {
        "defines": ["NODE_GYP_MODULE_NAME=napi_windows_input", "DEBUG"]
      }
    }
  ]
}