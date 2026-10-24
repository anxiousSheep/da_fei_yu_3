using System;
using System.IO;
using System.Text.Json;
using System.Windows;
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
    private int _catcherLogged;
    private WinForms.NotifyIcon? _tray;

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

    private void UpdateCatcher()
    {
        if (_right < 0) return;
        // hitRect 是 CSS 像素，WPF DIP 与 CSS 1:1，直接使用
        double w = Math.Max(0, _right - _left);
        double h = Math.Max(0, _bottom - _top);
        clickCatcher.Width = w;
        clickCatcher.Height = h;
        clickCatcher.Margin = new Thickness(_left, _top, 0, 0);
    }

    private void SetupTray()
    {
        _tray = new WinForms.NotifyIcon { Icon = Drawing.SystemIcons.Application, Text = "Project Kujira 桌宠", Visible = true };
        var menu = new WinForms.ContextMenuStrip();
        menu.Items.Add("显示 / 隐藏", null, (_, _) => { if (IsVisible) Hide(); else Show(); });
        var ct = new WinForms.ToolStripMenuItem("点击穿透") { Checked = true, CheckOnClick = true };
        ct.CheckedChanged += (_, _) =>
        {
            // 穿透开关：开=只在角色区接住；关=整窗接住（clickCatcher 铺满）
            clickCatcher.Width = ct.Checked ? Math.Max(0, _right - _left) : Width;
            clickCatcher.Height = ct.Checked ? Math.Max(0, _bottom - _top) : Height;
            clickCatcher.Margin = ct.Checked ? new Thickness(_left, _top, 0, 0) : new Thickness(0);
            Log("clickThrough=" + ct.Checked);
        };
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
                    if (r.TryGetProperty("type", out var t) && t.GetString() == "err") { Log("JS-ERR: " + args.WebMessageAsJson); return; }
                    if (r.TryGetProperty("left", out var l)) _left = l.GetDouble();
                    if (r.TryGetProperty("top", out var tp)) _top = tp.GetDouble();
                    if (r.TryGetProperty("right", out var rg)) _right = rg.GetDouble();
                    if (r.TryGetProperty("bottom", out var b)) _bottom = b.GetDouble();
                    if (r.TryGetProperty("dpr", out var d)) _dpr = d.GetDouble();
                    if (_dpr <= 0) _dpr = 1.0;
                    UpdateCatcher();
                    if (_catcherLogged == 0) { _catcherLogged = 1; Log($"hitRect=({_left},{_top})-({_right},{_bottom}) dpr={_dpr} catcher=({clickCatcher.Width}x{clickCatcher.Height})"); }
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
