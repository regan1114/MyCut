@echo off
setlocal
cd /d "%~dp0"
if exist "release\win-unpacked\MyCut.exe" (
  start "" "release\win-unpacked\MyCut.exe"
  exit /b
)
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Install MyCut using the Windows Setup.exe in the release folder.
  pause
  exit /b 1
)
call npm run desktop
if errorlevel 1 pause
