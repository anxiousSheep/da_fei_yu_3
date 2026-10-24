namespace Kujira.Core;

/// <summary>角色在 CSS 像素空间里的屏幕包围盒。</summary>
public readonly record struct HitRect(double Left, double Top, double Right, double Bottom);

/// <summary>命中判定与 DPI 换算（纯函数，可单测）。</summary>
public static class HitTest
{
    /// <summary>
    /// 判断物理像素点 (x, y) 是否落在命中区内。
    /// rect 为 CSS 像素（来自 JS 的屏幕投影），物理坐标 = CSS × dpr。
    /// </summary>
    public static bool Contains(HitRect rect, double x, double y, double dpr)
    {
        if (dpr <= 0 || rect.Right < 0) return false; // 无效区域/无效缩放视为未命中
        return x >= rect.Left * dpr
            && x <= rect.Right * dpr
            && y >= rect.Top * dpr
            && y <= rect.Bottom * dpr;
    }
}
