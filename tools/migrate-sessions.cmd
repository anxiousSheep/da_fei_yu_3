@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "ARG=%~1"
if "%ARG%"=="" set "ARG=--apply"
node "migrate-sessions.mjs" %ARG%
echo.
pause
