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
| S2 点击穿透 | ✅ | e2e 真实点击 + 焦点归属（见下） |

S2 的程序化证据（真实点击，非 SendMessage 直调窗口过程）：

- 点色块中心 → 前景窗口 = PetSpike（桌宠接住）✅
- 点透明区 → 前景窗口 = 下层记事本（穿透）✅
- 点圆角透明像素 → 前景窗口 = 下层记事本（穿透）✅

## 关键技术点（硬啃出来的，务必保留）

1. WebView2 透明：`DefaultBackgroundColor = Color.Transparent` + 页面 body 透明。
2. WebView2 透明会让**整窗点击穿透**（Chrome 子窗口按 HTCLIENT 接住后，渲染器把「透明背景」上的点击转发给下层），必须自己做「角色区接住」。
3. **穿透方案（最终落地）：clickCatcher 掩码**。WPF 里放一个覆盖角色命中区的 `#01000000`（alpha=1）元素，使窗口分层 alpha 仅在角色区为 1（OS 接住）、其余为 0（穿透）。W1 占位角色是圆角矩形，用 `Border CornerRadius=18` 匹配形状。
4. **踩过的坑（都失败，别再走）**：
   - WPF `AllowsTransparency` 是分层窗口，`Background=Transparent` 时 alpha=0，OS 直接按 alpha 判穿透，**绕过 `WM_NCHITTEST` 子类化**（`SendMessage` 直调窗口过程是假通过，真实点击从不进子类化过程）。
   - 深层 Chrome 窗口在 WebView2 合成线程上，`SetWindowLongPtr(GWLP_WNDPROC)` 与 `SetWindowSubclass` 跨线程都失败。
   - 全局 `WH_MOUSE_LL` 钩子能装入，但 WPF Dispatcher 不泵低级钩子消息，proc 从不被调用。
5. JS→C# 通信：`chrome.webview.postMessage({left,top,right,bottom,dpr})`，C# 用 `System.Text.Json` 解析（手写字符串解析会读出全 0）。
6. DPI：窗口 420×640 DIP，150% 下物理 630×960；JS 报 CSS px + devicePixelRatio。clickCatcher 用 DIP（与 CSS 1:1），命中判断核心逻辑（Kujira.Core.HitTest）用物理 px ×dpr。

## 新架构

- 外壳：C# WPF，负责窗口/穿透/托盘/IPC。
- 内容：WebView2 加载本地 HTML + three.js，全部逻辑在 Web 侧。
- 交互：JS 计算角色包围盒 → postMessage 给 C# → C# 驱动 clickCatcher（alpha 掩码），W2 升级为逐像素 alpha（见下）。

## 逐像素命中方案（W2 设计，配合 VRM）

当前穿透是「形状」穿透（圆角矩形掩码），换 VRM 模型后，发丝/肢体间隙等透明像素会误触。结论：命中用的分层 alpha 与视觉渲染是**解耦**的，可从 3D 几何直接算 alpha，不必抓 WebView2 像素。

| 方案 | 精度 | 成本/次 |
| --- | --- | --- |
| A. 逐像素 alpha 掩码（JS 投影网格→光栅化 alpha 图→降采样→postMessage→WPF OpacityMask） | 精确 | ~1–4 ms |
| B. 多边形近似（凸包/凹包） | 粗（凸包含肢体间隙） | 微秒级 |
| C. 事件驱动 ray cast（光标处命中才开捕获区） | 精确 | 每 mousemove 一次 ray cast，有竞态 |

**选 A**。成本：角色 bbox ~240×330 物理、降采样 1/4 ≈ 2 千采样点；JS 投影+光栅化 ≈ 0.1–0.5 ms，postMessage ≈ 0.5 ms，WPF OpacityMask ≈ 1–3 ms。**关键优化：只在轮廓（silhouette）变化时重算掩码**（呼吸/微摆 idle 轮廓几乎不动，可缓存），平均成本趋近零；全帧动画 60fps 时才到单核 6–24%。

## 影响

- 红线 #1 变更（Electron → WebView2），已由用户拍板。
- W1 外壳重写（窗口 + 托盘 + 穿透），渲染/逻辑层不变。
- 开发环境：.NET SDK 9.0 + WebView2 Runtime（本机已具备）。
- `desktop-pet/`（Electron 版）作废，保留作历史参考。

## 待办

- 拖拽、多屏 DPI、全屏检测等 W1 后续项（托盘/穿透已完成）。
- **three.js 集成（W2）**：✅ 已用 esbuild 打成单个 IIFE 包（`npx esbuild entry.js --bundle --format=iife --outfile=bundle.js`，1.1MB，199ms），绕开 ES 模块加载器，在 WebView2 中成功加载渲染（`THREE-BUNDLE-RAN-OK` + 角色屏幕包围盒上报）。`bundle.js` 为构建产物已 gitignore；`three.core.js`/three.module.js 为 vendored three.js（MIT）。剩余：three-vrm 加载 VRM、逐像素穿透（见上文方案）、性能基线。
- **逐像素穿透**：✅ 已实现——JS 读回画布 alpha 生成降采样二进制掩码（base64）→ C# Pbgra32 ImageBrush OpacityMask 驱动 `#01000000` Rectangle 的分层 alpha。验证：头部球体透明角落穿透、身体中心接住。随 three-vrm 换 VRM 时掩码生成逻辑不变，仅角色网格替换。
