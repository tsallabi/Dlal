@echo off
REM Dlal - one-click local launcher for Windows. Double-click this file.
setlocal
cd /d "%~dp0"
echo.
echo ========================================
echo   DLAL - local development launcher
echo ========================================
echo.
echo [1/4] Updating project from GitHub...
git pull
if errorlevel 1 goto fail
echo.
echo [2/4] Checking packages...
if not exist node_modules (
  call npm ci
  if errorlevel 1 goto fail
) else (
  echo     already installed - skipped.
)
echo.
echo [3/4] Preparing local database...
call npm run setup
if errorlevel 1 goto fail
echo.
echo [4/4] Starting the site...
echo.
echo     Open this address in Chrome:  http://localhost:8787
echo     Owner login: 0910000000 / admin123  (local only)
echo     Press Ctrl+C twice to stop.
echo.
call npm run dev
goto end

:fail
echo.
echo ----------------------------------------
echo  A step failed. Take a screenshot of
echo  this window and send it to Claude.
echo ----------------------------------------
pause
exit /b 1

:end
pause
