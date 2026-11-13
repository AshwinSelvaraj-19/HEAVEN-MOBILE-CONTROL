const fs = require('fs');
const path = require('path');

const cppCode = `
#include <windows.h>
#include <stdio.h>

INT WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow) {
    const wchar_t* lpClassName = L"HeavenControlWindow";
    WNDCLASSEXW wcex = { sizeof(WNDCLASSEXW) };
    wcex.style = CS_HREDRAW | CS_VREDRAW;
    wcex.lpfnWndProc = DefWindowProcW;
    wcex.hInstance = hInstance;
    wcex.lpszClassName = lpClassName;
    RegisterClassExW(&wcex);
    
    HWND hwnd = CreateWindowExW(
        WS_EX_TOOLWINDOW | WS_EX_APPWINDOW,
        lpClassName,
        L"HEAVEN MOBILE CONTROL",
        0,
        CW_USEDEFAULT, CW_USEDEFAULT,
        CW_USEDEFAULT, CW_USEDEFAULT,
        NULL,
        NULL,
        hInstance,
        NULL
    );
    
    if (hwnd) {
        LONG_PTR ptr = reinterpret_cast<LONG_PTR>(hwnd);
        wprintf(L"HWND: %p\n", hwnd);
        wprintf(L"HWND decimal: %I64d\n", ptr);
        wprintf(L"HWND hex: %I64x\n", ptr);
    } else {
        wprintf(L"Failed to create window\n");
    }
    
    Sleep(100);
    DestroyWindow(hwnd);
    UnregisterClassW(lpClassName, hInstance);
    return 0;
}
`;

const cppPath = path.join(process.cwd(), 'tmp_window.cpp');
fs.writeFileSync(cppPath, cppCode);

try {
    const result = execSync(`cd "${process.cwd()}" && g++ -o tmp_window tmp_window.cpp 2>&1`, { encoding: 'utf8' });
    console.log('Compilation:', result);
} catch (e) {
    console.log('g++ not available');
}

// Try to run it
try {
    const result = execSync('./tmp_window 2>&1', { encoding: 'utf8', timeout: 10 });
    console.log('Window creation output:');
    console.log(result);
} catch (e) {
    console.log('Error running window:', e.message);
}

try { fs.unlinkSync(cppPath); } catch(e) {}
try { fs.unlinkSync(path.join(process.cwd(), 'tmp_window')); } catch(e) {}
