using System;
using System.Windows.Forms;

class Program {
    static void Main() {
        Application.EnableVisualStyles();
        Form form = new Form();
        form.Text = "HEAVEN MOBILE CONTROL";
        form.StartPosition = FormStartPosition.CenterParent;
        form.Width = 0;
        form.Height = 0;
        form.TopMost = true;
        form.Opacity = 0.01;
        form.BackColor = System.Drawing.Color.Transparent;
        form.FormClosing += (s, e) => { form.Dispose(); };
        IntPtr hwnd = form.Handle;
        Console.WriteLine($"HWND: {hwnd}");
        Console.WriteLine($"HWND decimal: {hwnd.ToInt64()}");
        Console.WriteLine($"HWND hex: {hwnd.ToInt64().ToString("X")}");
        Application.Run(form);
    }
}
