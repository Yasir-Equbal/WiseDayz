@echo off
setlocal
cd /d "%~dp0"
echo ==========================================
echo        wisedayZ Windows Desktop Builder
echo ==========================================
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 22.12 or newer, then reopen this file.
  pause
  exit /b 1
)
for /f "tokens=1 delims=v" %%V in ('node --version') do set NODEVER=%%V
 echo Using Node.js %NODEVER%
if not exist package.json (
  echo package.json not found. Extract the full project ZIP first.
  pause
  exit /b 1
)
echo.
echo [1/4] Installing desktop build dependencies...
call npm install
if errorlevel 1 goto failed
echo.
echo [2/4] Running automated tests...
call npm test
if errorlevel 1 goto failed
echo.
echo [3/4] Building the Windows installer...
call npm run dist:win
if errorlevel 1 goto failed
echo.
echo [4/4] Build complete.
echo Installer should be in: %CD%\dist\wisedayZ-Setup-1.0.0.exe
if exist "%CD%\dist\wisedayZ-Setup-1.0.0.exe" start "" explorer.exe "%CD%\dist"
echo Test the installer before sharing it with anyone.
pause
exit /b 0
:failed
echo.
echo BUILD FAILED. Copy the error above and send it for troubleshooting.
pause
exit /b 1
