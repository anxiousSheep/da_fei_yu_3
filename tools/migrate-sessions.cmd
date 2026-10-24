@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo  DSH 会话迁移：D:\DSH\DSH Workspace\2  -^>  E:\Playground\BigFatFish3
echo.
echo  请先完全退出 DSH（含托盘图标），再运行本脚本。
echo  已迁移的会话会自动跳过，可以重复运行。
echo ============================================================
echo.

node "%~dp0migrate-sessions.mjs" --apply > "%~dp0migrate-log.txt" 2>&1
type "%~dp0migrate-log.txt"

echo.
echo ------------------------------------------------------------
echo  日志已保存到 tools\migrate-log.txt
echo  若显示「失败」，多半是 DSH 没退干净，退出后重跑即可。
echo ------------------------------------------------------------
pause
