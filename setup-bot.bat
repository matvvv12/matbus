@echo off
if not exist bot mkdir bot
echo.
set /p TOKEN=Paste the token from BotFather and press Enter: 
> bot\config.json echo {"token": "%TOKEN%", "url": ""}
echo.
echo Done: bot\config.json created. Now run bot.bat
pause
