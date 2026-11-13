#r "PresentationFramework"
using System;
using System.Windows.Forms;

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
Application.Run(form);
Console.WriteLine($"HWND: {form.Handle}");
Console.WriteLine($"HWND decimal: {((IntPtr)form.Handle).ToInt64()}");
Console.WriteLine($"HWND hex: {((IntPtr)form.Handle).ToString("X")}");
