@echo off
title ComfyPocket - Serveur PC
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Demarrer-ComfyPocket.ps1"
if errorlevel 1 (
  echo.
  echo Le demarrage a echoue. Consultez le message ci-dessus.
)
pause
