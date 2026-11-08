@echo off
echo Starting MatBus: app, tunnel and bot in three windows...
start "MatBus app" cmd /k start-app.bat
timeout /t 6 >nul
start "MatBus tunnel" cmd /k tunnel.bat
timeout /t 3 >nul
start "MatBus bot" cmd /k bot.bat
echo.
echo Done. Look at the TUNNEL window: copy the https://....trycloudflare.com address,
echo then send it to your bot in Telegram:   /url https://....trycloudflare.com
pause
