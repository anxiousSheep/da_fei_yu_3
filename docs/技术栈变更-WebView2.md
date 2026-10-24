# 决策：外壳从 Electron 换成 C# + WebView2

> 日期：2026-10-25　状态：已由用户拍板

## 结论

- 放弃 Electron（stock Electron 在本机必崩），改用 **C# (WPF) + WebView2** 作为外壳。
- 渲染层与全部逻辑（three.js / three-vrm / 姿态引擎 / 行为大脑 / React UI）不变，仍是 Web 代码，跑在 WebView2 里。
- 触碰红线 #1「不换技术栈」。理由：红线的前提「Electron 能用」在本机不成立，这是被环境逼出来的变更，已由用户明确拍板。

## 为什么（证据）

1. stock Electron 40 / 44.0.0 / 44.9.3 / 45.0.0 在本机启动即 0xC0000005 / 0x80000003 崩溃；加遍 `--disable-gpu`、`--no-sandbox`、`--use-gl=swiftshader`、绑核显、换版本、计划任务剥离进程树，全部无效。
2. 根因日志：`ContextResult::kFatalFailure: Failed to create shared context for virtualization`（GPU 虚拟化上下文创建失败）。
3. 逐一排除：Nahimic（停服务后仍崩）、GameViewer 虚拟显示器（禁用后仍崩）、进程树、缓存、第三方 DLL（最新崩溃里已无任何第三方 DLL）。
4. Chrome（浏览器级 Chromium）在本机正常 → 问题在 Electron 自带 Chromium 的 GPU 初始化代码路径，不是 Chromium 本身。
5. 只有 DeepSeek 自研改造版 Electron 能跑（DSH 客户端），无法复刻。

## Spike 结果（程序化断言，非目测）

| 项 | 结果 | 验证方式 |
| --- | --- | --- |
| S1 透明 | ✅ | 窗口区域黑像素计数=0，透出桌面 RGB |
| WebGL | ✅ | 用户确认 + 2D/WebGL 渲染对照 |
| S2 点击穿透 | ✅ | 见下 |

S2 的两条程序化证据：

1. **静态断言**：所有 Chrome 内容窗口已带 `WS_EX_TRANSPARENT`；顶层窗口 `WM_NCHITTEST` 对块中心返回 `HTCLIENT(1)`、对透明角返回 `HTTRANSPARENT(-1)`。
2. **e2e 真实点击**（SendInput + 焦点归属）：点透明区 → 焦点落到下层记事本；点色块 → 焦点不落到记事本。均 PASS。

## 关键技术点（硬啃出来的，务必保留）

1. WebView2 透明：`DefaultBackgroundColor = Color.Transparent` + 页面 body 透明。
2. WebView2 默认会命中测试并吞掉鼠标（已知 issue WebView2Feedback#5668/#1004），必须自己做穿透。
3. 穿透方案：
   - 给 WebView2 的 `Chrome_WidgetWin_0/1`、`Chrome_RenderWidgetHostHWND`、`Intermediate D3D Window`、`Static` 窗口设 `WS_EX_TRANSPARENT`（GWL_EXSTYLE），让它们把命中测试让给顶层窗口。
   - 顶层窗口子类化 `WM_NCHITTEST`：命中区（JS 报告的字符包围盒，CSS px × devicePixelRatio = 物理 px）返回 `HTCLIENT`，否则 `HTTRANSPARENT`。
4. **跨线程坑**：`SetWindowLongPtr(GWLP_WNDPROC)` 对 WebView2 合成线程创建的窗口返回 0（失败，会刷屏重试）；但 `SetWindowLongPtr(GWL_EXSTYLE)` 跨线程**成功**。所以用 EXSTYLE 设 WS_EX_TRANSPARENT，不要用 WNDPROC 子类化那些窗口。
5. JS→C# 通信：`chrome.webview.postMessage({left,top,right,bottom,dpr})`，C# 用 `System.Text.Json` 解析（手写字符串解析会读出全 0）。
6. DPI：窗口 420×640 DIP，150% 下物理 630×960；JS 报 CSS px + devicePixelRatio，C# 侧 ×dpr 换算物理 px 再比。

## 新架构

- 外壳：C# WPF（后续可精简为 Win32 + CoreWebView2Controller），负责窗口/穿透/托盘/IPC。
- 内容：WebView2 加载本地 HTML + three.js，全部逻辑在 Web 侧。
- 交互：JS 计算角色包围盒（后续升级为射线 hitProxy）→ postMessage 给 C# → C# 驱动 WM_NCHITTEST。

## 影响

- 红线 #1 变更（Electron → WebView2），已由用户拍板。
- W1 外壳重写（窗口 + 托盘 + 穿透），渲染/逻辑层不变。
- 开发环境：.NET SDK 9.0 + WebView2 Runtime（本机已具备）。
- `desktop-pet/`（Electron 版）作废，保留作历史参考。

## 待办

- 正式项目结构（如 `desktop-pet-cs/`），把 spike 的 MainWindow 逻辑落进去。
- 拖拽、托盘、多屏 DPI、全屏检测等 W1 后续项。
