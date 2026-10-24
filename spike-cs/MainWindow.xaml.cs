using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Interop;
using Microsoft.Web.WebView2.Core;
using Kujira.Core;
using WinForms = System.Windows.Forms;
using Drawing = System.Drawing;

namespace PetSpike;

public partial class MainWindow : Window
{
    private readonly string _log = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "spike-log.txt");
    private double _dpr = 1.0;
    private double _left, _top, _right, _bottom = -1;
    private readonly HashSet<IntPtr> _done = new();
    private bool _clickThrough = true;
    private WinForms.NotifyIcon? _tray;

    private void Log(string msg)
    {
        try { File.AppendAllText(_log, DateTime.Now.ToString("HH:mm:ss.fff") + " " + msg + Environment.NewLine); } catch { }
    }

    private const int GWLP_WNDPROC = -4;
    private const int GWL_EXSTYLE = -20;
    private const int WM_NCHITTEST = 0x0084;
    private const int HTCLIENT = 1;
    private const int HTTRANSPARENT = -1;
    private const int WS_EX_TRANSPARENT = 0x20;

    [StructLayout(LayoutKind.Sequential)] private struct POINT { public int x, y; }
    private delegate bool EnumProc(IntPtr h, IntPtr l);
    private delegate IntPtr WndProcDelegate(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")] private static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);
    [DllImport("user32.dll")] private static extern IntPtr CallWindowProc(IntPtr prev, IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")] private static extern bool ScreenToClient(IntPtr hWnd, ref POINT p);
    [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr h, StringBuilder s, int m);

    private WndProcDelegate? _wndProc;
    private IntPtr _topHwnd;
    private IntPtr _prevTop;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        Log("ctor");
    }

    private IntPtr TopProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
        if (msg == WM_NCHITTEST)
        {
            if (!_clickThrough) return (IntPtr)HTCLIENT; // 穿透关闭：整窗可交互
            short sx = (short)((long)lParam & 0xFFFF);
            short sy = (short)(((long)lParam >> 16) & 0xFFFF);
            var p = new POINT { x = sx, y = sy };
            ScreenToClient(hWnd, ref p);
            bool hit = HitTest.Contains(new HitRect(_left, _top, _right, _bottom), p.x, p.y, _dpr);
            return (IntPtr)(hit ? HTCLIENT : HTTRANSPARENT);
        }
        return CallWindowProc(_prevTop, hWnd, msg, wParam, lParam);
    }

    private void MakeTransparent(IntPtr parent)
    {
        EnumChildWindows(parent, (h, l) =>
        {
            var sb = new StringBuilder(128); GetClassName(h, sb, 128);
            var cn = sb.ToString();
            if (cn.StartsWith("Chrome") || cn.StartsWith("Intermediate") || cn == "Static")
            {
                if (!_done.Contains(h))
                {
                    int ex = GetWindowLong(h, GWL_EXSTYLE);
                    SetWindowLongPtr(h, GWL_EXSTYLE, (IntPtr)(ex | WS_EX_TRANSPARENT));
                    _done.Add(h);
                    Log("WS_EX_TRANSPARENT set on " + cn + " hwnd=" + h);
                }
            }
            MakeTransparent(h);
            return true;
        }, IntPtr.Zero);
    }

    private void SetupTray()
    {
        _tray = new WinForms.NotifyIcon
        {
            Icon = Drawing.SystemIcons.Application,
            Text = "Project Kujira 桌宠",
            Visible = true
        };
        var menu = new WinForms.ContextMenuStrip();
        menu.Items.Add("显示 / 隐藏", null, (_, _) => { if (IsVisible) Hide(); else Show(); });
        var ct = new WinForms.ToolStripMenuItem("点击穿透") { Checked = _clickThrough, CheckOnClick = true };
        ct.CheckedChanged += (_, _) => { _clickThrough = ct.Checked; Log("clickThrough=" + _clickThrough); };
        menu.Items.Add(ct);
        menu.Items.Add(new WinForms.ToolStripSeparator());
        menu.Items.Add("退出", null, (_, _) => { if (_tray != null) _tray.Visible = false; System.Windows.Application.Current.Shutdown(); });
        _tray.ContextMenuStrip = menu;
        _tray.DoubleClick += (_, _) => { if (IsVisible) Hide(); else Show(); };
        Log("tray ready");
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        try
        {
            var env = await CoreWebView2Environment.CreateAsync();
            await webView.EnsureCoreWebView2Async(env);
            webView.DefaultBackgroundColor = System.Drawing.Color.Transparent;

            var folder = AppDomain.CurrentDomain.BaseDirectory;
            webView.CoreWebView2.SetVirtualHostNameToFolderMapping("app.local", folder, CoreWebView2HostResourceAccessKind.DenyCors);

            webView.CoreWebView2.WebMessageReceived += (s, args) =>
            {
                try
                {
                    using var doc = JsonDocument.Parse(args.WebMessageAsJson);
                    var r = doc.RootElement;
                    if (r.TryGetProperty("type", out var t) && t.GetString() == "err") { Log("JS-ERR: " + args.WebMessageAsJson); return; }
                    if (r.TryGetProperty("left", out var l)) _left = l.GetDouble();
                    if (r.TryGetProperty("top", out var tp)) _top = tp.GetDouble();
                    if (r.TryGetProperty("right", out var rg)) _right = rg.GetDouble();
                    if (r.TryGetProperty("bottom", out var b)) _bottom = b.GetDouble();
                    if (r.TryGetProperty("dpr", out var d)) _dpr = d.GetDouble();
                    if (_dpr <= 0) _dpr = 1.0;
                }
                catch { }
            };

            webView.CoreWebView2.Navigate("https://app.local/index.html");
            Log("navigated");

            _topHwnd = new WindowInteropHelper(this).Handle;
            _wndProc = TopProc;
            _prevTop = SetWindowLongPtr(_topHwnd, GWLP_WNDPROC, Marshal.GetFunctionPointerForDelegate(_wndProc!));
            Log("subclassed TOP hwnd=" + _topHwnd);

            SetupTray();

            var timer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
            timer.Tick += (s2, e2) => MakeTransparent(_topHwnd);
            timer.Start();
        }
        catch (Exception ex) { Log("EXCEPTION: " + ex.Message); }
    }
}
