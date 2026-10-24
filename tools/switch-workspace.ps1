# 工作区迁移：把旧路径切换为指向 E:\Playground\BigFatFish3 的 junction
#
# 背景：
#   DSH 把每个会话的项目目录（cwd）写在会话日志的头部，没有官方的「移动会话」操作。
#   文件已经复制到 E:\Playground\BigFatFish3，但老会话仍记录着 D:\DSH\DSH Workspace\2。
#   在旧路径上建 junction（目录联接）指向新路径，老会话即可无感继续工作，
#   同时磁盘上只有一份真实文件，不会出现两份副本各自演进。
#
# 使用：
#   1. 完全退出 DSH（包括托盘）；
#   2. 右键「使用 PowerShell 运行」，或在 PowerShell 中执行本脚本；
#   3. 重新打开 DSH，工作区已指向 E:\Playground\BigFatFish3。
#
# 回滚：
#   删除 junction（Remove-Item 'D:\DSH\DSH Workspace\2' -Force，不要加 -Recurse），
#   再把 D:\DSH\DSH Workspace\2.migrated-* 改回原名。

[CmdletBinding()]
param(
    [string]$OldPath = 'D:\DSH\DSH Workspace\2',
    [string]$NewPath = 'E:\Playground\BigFatFish3',
    [int]$DshPort = 56381
)

$ErrorActionPreference = 'Stop'

function Fail($msg) { Write-Host "[中止] $msg" -ForegroundColor Red; exit 1 }

# 1) 目标必须存在且是真实目录
if (-not (Test-Path -LiteralPath $NewPath -PathType Container)) { Fail "目标目录不存在：$NewPath" }
$newItem = Get-Item -LiteralPath $NewPath -Force
if ($newItem.LinkType) { Fail "目标本身是链接，拒绝继续：$NewPath" }

# 2) 旧路径如果已经是 junction，说明已迁移过
if (Test-Path -LiteralPath $OldPath) {
    $oldItem = Get-Item -LiteralPath $OldPath -Force
    if ($oldItem.LinkType -eq 'Junction') {
        Write-Host "[跳过] $OldPath 已经是 junction → $($oldItem.Target)" -ForegroundColor Yellow
        exit 0
    }
}

# 3) DSH 必须已退出（端口还在监听就说明没退干净）
$listening = $false
try {
    $listening = (Test-NetConnection -ComputerName 127.0.0.1 -Port $DshPort -InformationLevel Quiet -WarningAction SilentlyContinue)
} catch { $listening = $false }
if ($listening) { Fail "DSH 仍在运行（端口 $DshPort 可连通）。请先完全退出 DSH 再执行。" }

# 3.5) 旧目录的提交必须都已包含在新目录里，否则切换后会丢提交
if (Test-Path -LiteralPath $OldPath) {
    $oldHead = (git -C $OldPath rev-parse HEAD 2>$null)
    $newHead = (git -C $NewPath rev-parse HEAD 2>$null)
    git -C $NewPath merge-base --is-ancestor $oldHead $newHead 2>$null
    if ($LASTEXITCODE -ne 0) {
        Fail "旧目录的提交未被新目录包含：`n  旧 $OldPath = $oldHead`n  新 $NewPath = $newHead`n请先同步（重新 robocopy 或 git 传输）再执行迁移。"
    }
    $dirty = (git -C $OldPath status --porcelain 2>$null)
    if ($dirty) {
        Write-Host "[警告] 旧目录有未提交改动，这些改动不会进入新目录：" -ForegroundColor Yellow
        $dirty | ForEach-Object { Write-Host "        $_" -ForegroundColor Yellow }
        $answer = Read-Host "仍要继续？(y/N)"
        if ($answer -ne 'y') { Fail "已取消。" }
    }
}

# 4) 旧目录若还在，改名保留（不删除，留作回滚）
if (Test-Path -LiteralPath $OldPath) {
    $suffix = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = "$OldPath.migrated-$suffix"
    try {
        Rename-Item -LiteralPath $OldPath -NewName (Split-Path $backup -Leaf)
        Write-Host "[改名] $OldPath → $backup"
    } catch {
        Fail "无法重命名旧目录（可能仍被进程占用）：$($_.Exception.Message)"
    }
}

# 5) 建 junction
cmd /c mklink /J "$OldPath" "$NewPath" | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "创建 junction 失败（mklink 退出码 $LASTEXITCODE）" }

# 6) 校验
$check = Get-Item -LiteralPath $OldPath -Force
if ($check.LinkType -ne 'Junction') { Fail "校验失败：$OldPath 不是 junction" }
if (-not (Test-Path -LiteralPath (Join-Path $OldPath '.git'))) { Fail "校验失败：junction 下找不到 .git" }

Write-Host ""
Write-Host "[完成] $OldPath" -ForegroundColor Green
Write-Host "        → $($check.Target)" -ForegroundColor Green
Write-Host "       老会话沿用旧路径，实际读写 E:\Playground\BigFatFish3"
Write-Host ""
Write-Host "确认无误后可删除备份目录：$backup"
