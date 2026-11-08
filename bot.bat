@echo off
if not exist bot\config.json (
  echo.
  echo File bot\config.json not found. Run setup-bot.bat first.
  pause
  exit /b
)
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js not found. Install Node.js LTS from https://nodejs.org and reopen this window.
  pause
  exit /b
)
node -e "process.exit(+process.versions.node.split('.')[0]>=18?0:1)"
if errorlevel 1 (
  echo.
  echo Node.js is too old. Install Node.js 18 or newer from https://nodejs.org
  pause
  exit /b
)
echo.
echo Starting bot. Keep this window open. Stop with Ctrl+C.
echo.
node bot\bot.mjs
echo.
echo Bot stopped.
pause
