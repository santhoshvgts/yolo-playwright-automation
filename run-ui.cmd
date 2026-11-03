@echo off
rem Starts the Test Board (ui/server.js) with Bun (Node if Bun is not installed) and opens it in the browser.
rem Double-click this file, or run "run-ui.cmd" from the project folder. Close the window to stop it.
rem The tests themselves always run under Node (see NODE in ui/server.js).
cd /d "%~dp0"
set RUNTIME=node
where bun >nul 2>nul && set RUNTIME=bun
if not exist node_modules (
  echo Installing packages...
  if "%RUNTIME%"=="bun" (call bun install) else (call npm install)
  if errorlevel 1 goto :error
)
if "%UI_PORT%"=="" set UI_PORT=4400
start "" "http://localhost:%UI_PORT%"
%RUNTIME% ui\server.js
goto :eof

:error
echo Package install failed.
pause
