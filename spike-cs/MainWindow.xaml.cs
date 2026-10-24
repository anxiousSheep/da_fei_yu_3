using System;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.Web.WebView2.Core;
using WinForms = System.Windows.Forms;
using Drawing = System.Drawing;

namespace PetSpike;

public partial class MainWindow : Window
{
    private readonly string _log = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "spike-log.txt");
    private int _maskLogged;
    private bool _clickThrough = true;
    private WinForms.NotifyIcon? _tray;
    private ImageBrush? _lastMask;
    private double _maskX, _maskY, _maskW, _maskH;

    private void Log(string msg)
    {
        try { File.AppendAllText(_log, DateTime.Now.ToString("HH:mm:ss.fff") + " " + msg + Environment.NewLine); } catch { }
    }

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        Log("ctor");
    }

    // 把 JS 发来的逐像素 alpha 掩码转成 Pbgra32 位图，作为 OpacityMask
    private void ApplyMask(JsonElement r)
    {
        var b64 = r.GetProperty("mask").GetString();
        int mw = r.GetProperty("mw").GetInt32();
        int mh = r.GetProperty("mh").GetInt32();
        _maskX = r.GetProperty("x").GetDouble();
        _maskY = r.GetProperty("y").GetDouble();
        _maskW = Math.Max(1, r.GetProperty("w").GetDouble());
        _maskH = Math.Max(1, r.GetProperty("h").GetDouble());

        var raw = Convert.FromBase64String(b64);
        var px = new byte[mw * mh * 4];
        for (int i = 0; i < mw * mh; i++) { byte a = raw[i]; px[i * 4] = a; px[i * 4 + 1] = a; px[i * 4 + 2] = a; px[i * 4 + 3] = a; }
        var bmp = BitmapSource.Create(mw, mh, 96, 96, PixelFormats.Pbgra32, null, px, mw * 4);
        bmp.Freeze();
        var brush = new ImageBrush(bmp) { Stretch = Stretch.Fill };
        brush.Freeze();
        _lastMask = brush;

        if (_clickThrough) ApplyCatcher();
        if (_maskLogged == 0) { _maskLogged = 1; Log($"mask {mw}x{mh} @({_maskX},{_maskY}) size({_maskW}x{_maskH})"); }
    }

    private void ApplyCatcher()
    {
        if (_clickThrough && _lastMask != null)
        {
            clickCatcher.OpacityMask = _lastMask;
            clickCatcher.Width = _maskW;
            clickCatcher.Height = _maskH;
            clickCatcher.Margin = new Thickness(_maskX, _maskY, 0, 0);
        }
        else
        {
            // 穿透关：整窗接住（无掩码，Fill=#01000000 整块 alpha=1）
            clickCatcher.OpacityMask = null;
            clickCatcher.Width = Width;
            clickCatcher.Height = Height;
            clickCatcher.Margin = new Thickness(0);
        }
    }

    private void SetupTray()
    {
        _tray = new WinForms.NotifyIcon { Icon = Drawing.SystemIcons.Application, Text = "Project Kujira 桌宠", Visible = true };
        var menu = new WinForms.ContextMenuStrip();
        menu.Items.Add("显示 / 隐藏", null, (_, _) => { if (IsVisible) Hide(); else Show(); });
        var ct = new WinForms.ToolStripMenuItem("点击穿透") { Checked = _clickThrough, CheckOnClick = true };
        ct.CheckedChanged += (_, _) => { _clickThrough = ct.Checked; ApplyCatcher(); Log("clickThrough=" + _clickThrough); };
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
            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;

            var folder = AppDomain.CurrentDomain.BaseDirectory;
            webView.CoreWebView2.SetVirtualHostNameToFolderMapping("app.local", folder, CoreWebView2HostResourceAccessKind.DenyCors);

            webView.CoreWebView2.WebMessageReceived += (s, args) =>
            {
                try
                {
                    using var doc = JsonDocument.Parse(args.WebMessageAsJson);
                    var r = doc.RootElement;
                    if (r.TryGetProperty("type", out var t))
                    {
                        var type = t.GetString();
                        if (type == "err") { Log("JS-ERR: " + args.WebMessageAsJson); return; }
                        if (type == "mask") { ApplyMask(r); return; }
                    }
                }
                catch { }
            };

            webView.CoreWebView2.Navigate("https://app.local/index.html");
            Log("navigated");

            SetupTray();
        }
        catch (Exception ex) { Log("EXCEPTION: " + ex.Message); }
    }
}
