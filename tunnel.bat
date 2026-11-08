@echo off
where cloudflared >nul 2>nul
if errorlevel 1 (
  echo.
  echo cloudflared is not installed. Trying to install it with winget...
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
  echo.
  echo If installation finished: CLOSE this window and run again.
  echo If winget does not exist: download cloudflared-windows-amd64.exe from
  echo https://github.com/cloudflare/cloudflared/releases  and save it into this folder as cloudflared.exe
  pause
  exit /b
)
echo.
echo Starting tunnel to http://localhost:8081 ...
echo Copy the address like https://something.trycloudflare.com from the text below.
echo.
cloudflared tunnel --url http://localhost:8081
echo.
echo Tunnel stopped.
pause
