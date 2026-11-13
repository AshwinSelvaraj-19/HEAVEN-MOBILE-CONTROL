using System;
using System.Runtime.InteropServices;

class Program
{
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool RegisterClassExW([In] ref WNDCLASSEXW lpwcx);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern int UnregisterClassW([MarshalAs(UnmanagedType.LPWStr)]string lpClassName, IntPtr hInstance);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr CreateWindowExW(
        uint dwExStyle,
        [MarshalAs(UnmanagedType.LPWStr)]string lpClassName,
        [MarshalAs(UnmanagedType.LPWStr)]string lpWindowName,
        uint dwStyle,
        int x,
        int y,
        int nWidth,
        int nHeight,
        IntPtr hWndParent,
        IntPtr hMenu,
        IntPtr hInstance,
        IntPtr lpParam);

    [DllImport("user32.dll", SetLastError = true)]
    static extern int GetLastError();

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct WNDCLASSEXW
    {
        public uint cbSize;
        public uint style;
        public IntPtr lpfnWndProc;
        public int cbClsExtra;
        public int cbWndExtra;
        public IntPtr hInstance;
        public IntPtr hIcon;
        public IntPtr hCursor;
        public IntPtr hbrBackground;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string lpszClassName;
        public IntPtr lpfnMenuName;
        public IntPtr hbrIconSm;
    }

    static void Main()
    {
        // Try minimal registration
        var wcex = new WNDCLASSEXW();
        wcex.cbSize = (uint)Marshal.SizeOf(typeof(WNDCLASSEXW));
        wcex.style = 0;
        wcex.lpfnWndProc = (IntPtr)0;
        wcex.hInstance = (IntPtr)0;
        wcex.lpszClassName = "HeavenControlWindowMinimal";

        fixed (WNDCLASSEXW* pWcex = &wcex)
        {
            bool result = RegisterClassExW(ref *pWcex);
            int error = GetLastError();
            Console.WriteLine($"RegisterClassExW result: {result}, error code: {error}");
        }

        // Try creating window
        IntPtr hwnd = CreateWindowExW(
            0,
            "HeavenControlWindowMinimal",
            "Test",
            0,
            0, 0, 0, 0,
            IntPtr.Zero,
            IntPtr.Zero,
            (IntPtr)0,
            IntPtr.Zero);

        error = GetLastError();
        Console.WriteLine($"CreateWindowExW result: hwnd={hwnd}, error code: {error}");
    }
}
