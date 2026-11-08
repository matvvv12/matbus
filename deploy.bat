@echo off
chcp 65001 >nul
echo [1/2] Сборка веб-версии...
call npx expo export --platform web
if errorlevel 1 goto fail
echo [2/2] Публикация на Netlify...
call npx netlify-cli deploy --prod --dir=dist
if errorlevel 1 goto fail
echo Готово. Откройте приложение в боте заново.
goto end
:fail
echo ОШИБКА - смотрите сообщения выше.
:end
pause
