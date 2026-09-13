@echo off
rem One-click launcher for SocialMediaAgent (double-click this file).
rem Arguments are forwarded to app\scripts\start.ps1, for example:
rem   start.cmd                use demo data (default, richest pages)
rem   start.cmd real           use real public data
rem   start.cmd demo -Restart  free the ports first
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\scripts\start.ps1" %*
if errorlevel 1 pause
endlocal
