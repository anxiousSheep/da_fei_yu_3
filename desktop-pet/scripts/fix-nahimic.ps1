# fix-nahimic.ps1
# 用途：停用 Nahimic 的「音频悬浮层进程注入」，解决 stock Electron 启动即崩溃（0xC0000005）。
# 不影响 Nahimic 的音频 EQ/环绕 —— 那是驱动级 APO（NahimicAPO4.dll），与进程注入无关。
# 需要管理员权限（会自动请求 UAC 提升）；幂等，可重复运行。
# 用法：powershell -ExecutionPolicy Bypass -File scripts\fix-nahimic.ps1

$ErrorActionPreference = 'Stop'

function Test-Admin {
  return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
  Write-Host '需要管理员权限，正在请求 UAC 提升...' -ForegroundColor Yellow
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File', $PSCommandPath)
  return
}

$changed = @()

# 1) 停用注入器计划任务（NahimicService 用它们把 DLL 注入到进程）
foreach ($t in @('NahimicTask32','NahimicTask64')) {
  $task = Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
  if ($task) {
    if ($task.State -ne 'Disabled') {
      Disable-ScheduledTask -TaskName $t | Out-Null
      $changed += ('计划任务 ' + $t + ' 已停用')
    } else {
      $changed += ('计划任务 ' + $t + ' 已是停用状态')
    }
  } else {
    Write-Host ('未找到计划任务 ' + $t) -ForegroundColor DarkGray
  }
}

# 2) 停止并禁用 NahimicService（注入编排器；非音频 APO）
$svc = Get-Service -Name 'NahimicService' -ErrorAction SilentlyContinue
if ($svc) {
  if ($svc.Status -ne 'Stopped') { Stop-Service -Name 'NahimicService' -Force }
  if ($svc.StartType -ne 'Disabled') { Set-Service -Name 'NahimicService' -StartupType Disabled }
  $changed += 'NahimicService 已停止并禁用'
}

Write-Host ''
if ($changed.Count -eq 0) {
  Write-Host 'Nahimic 注入已处于停用状态，无需处理。' -ForegroundColor Green
} else {
  Write-Host ($changed -join [Environment]::NewLine) -ForegroundColor Green
}
Write-Host 'Nahimic 的音频 EQ/环绕（驱动级 APO）不受影响，可正常使用。' -ForegroundColor Cyan
Write-Host '如需恢复：Enable-ScheduledTask NahimicTask32,NahimicTask64; Set-Service NahimicService -StartupType Automatic; Start-Service NahimicService' -ForegroundColor DarkGray
