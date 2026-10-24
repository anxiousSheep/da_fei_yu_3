using Kujira.Core;
using Xunit;

public class HitTestTests
{
    private static readonly HitRect Rect = new(130, 210, 290, 430);

    [Fact]
    public void Contains_CenterOfRegion_True()
    {
        // 区域中心 (210, 320) CSS px，150% DPI 下物理 (315, 480)
        Assert.True(HitTest.Contains(Rect, 315, 480, 1.5));
    }

    [Fact]
    public void Contains_OutsideRegion_False()
    {
        Assert.False(HitTest.Contains(Rect, 10, 10, 1.5));
    }

    [Fact]
    public void Contains_OnBoundary_True()
    {
        // 边界含端点
        Assert.True(HitTest.Contains(Rect, 130 * 1.5, 210 * 1.5, 1.5));
        Assert.True(HitTest.Contains(Rect, 290 * 1.5, 430 * 1.5, 1.5));
    }

    [Fact]
    public void Contains_JustOutsideBoundary_False()
    {
        Assert.False(HitTest.Contains(Rect, 290 * 1.5 + 0.1, 430 * 1.5, 1.5));
    }

    [Fact]
    public void Contains_InvalidDpr_False()
    {
        Assert.False(HitTest.Contains(Rect, 100, 100, 0));
        Assert.False(HitTest.Contains(Rect, 100, 100, -1));
    }

    [Fact]
    public void Contains_UnsetRegion_False()
    {
        var unset = new HitRect(0, 0, -1, -1); // Right < 0 表示尚未收到有效区域
        Assert.False(HitTest.Contains(unset, 100, 100, 1.0));
    }

    [Fact]
    public void Contains_DpiScaling_ScalesAllEdges()
    {
        // 100% DPI 下区域即 CSS 像素本身
        Assert.True(HitTest.Contains(new HitRect(0, 0, 100, 100), 50, 50, 1.0));
        // 200% DPI 下区域翻倍
        Assert.True(HitTest.Contains(new HitRect(0, 0, 100, 100), 150, 150, 2.0));
        Assert.False(HitTest.Contains(new HitRect(0, 0, 100, 100), 201, 150, 2.0));
    }
}
