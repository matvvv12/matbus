# MatBus на GitHub Pages — инструкция

В архиве три файла для корня проекта MatBus:

- `app.config.js` — автоматически выставляет правильный префикс `/ИМЯ-РЕПОЗИТОРИЯ` для Expo на GitHub Pages.
- `.github/workflows/deploy.yml` — автоматически собирает сайт и публикует его после каждого push в `main`.
- `.gitignore` — исключает зависимости, локальную сборку и секретный `bot/config.json`.

## 1. Подготовить проект

Распакуйте файлы из архива в корень MatBus с сохранением структуры и согласитесь на замену `.gitignore`.

Проверьте, что рядом находятся `package.json` и `package-lock.json`.

**Не публикуйте `bot/config.json`, `.env` и Cloudflare `.dev.vars`.** Репозиторий для бесплатного GitHub Pages должен быть публичным. Содержимое публичного репозитория доступно всем.

## 2. Создать репозиторий GitHub

1. Откройте https://github.com/new.
2. Repository name: `matbus`.
3. Выберите **Public**.
4. Не добавляйте README, .gitignore или License при создании.
5. Нажмите Create repository.

Адрес будущего сайта будет:
`https://ВАШ_GITHUB_ЛОГИН.github.io/matbus/`

## 3. Отправить проект на GitHub из PowerShell

Откройте PowerShell в корне `C:\Windows\System32\matbus` (или в своей папке MatBus).

В исходном проекте может находиться старый локальный `.git` с отсутствующей ссылкой HEAD. Если вы создаёте новый чистый GitHub-репозиторий, удалите только старую папку метаданных Git — исходники проекта не удаляются:

```powershell
if (Test-Path .git) { Remove-Item .git -Recurse -Force }
git init -b main
git add .
git check-ignore -v bot/config.json
```

Последняя команда должна показать правило `bot/config.json` из `.gitignore`. Проверьте, что секретный файл не попал в список добавленных файлов:

```powershell
git status --short
```

Если `bot/config.json` отображается в списке staged-файлов, **не продолжайте** — удалите его из индекса командой `git rm --cached bot/config.json` и проверьте `.gitignore`.

Затем создайте коммит и отправьте проект (замените `ВАШ_GITHUB_ЛОГИН` на свой логин GitHub):

```powershell
git commit -m "Initial MatBus GitHub Pages setup"
git remote add origin https://github.com/ВАШ_GITHUB_ЛОГИН/matbus.git
git push -u origin main
```

Если Git попросит имя и email автора коммита, задайте их командами `git config --global user.name "Ваше имя"` и `git config --global user.email "EMAIL_ИЗ_GITHUB"`, затем повторите commit.

## 4. Включить GitHub Pages

1. Откройте репозиторий `https://github.com/ВАШ_GITHUB_ЛОГИН/matbus`.
2. Settings → Pages.
3. В разделе Build and deployment выберите Source: **GitHub Actions**.
4. Откройте вкладку Actions и дождитесь зелёной отметки у workflow `Build and deploy MatBus to GitHub Pages`.

Workflow автоматически выполнит `npm ci`, `npx expo export --platform web` и опубликует папку `dist`. При каждом следующем push в `main` сайт обновится автоматически.

## 5. Подключить сайт в Telegram

Когда workflow завершится, сайт будет доступен по адресу:
`https://ВАШ_GITHUB_ЛОГИН.github.io/matbus/`

Проверьте ссылку в обычном браузере без VPN. Если сайт открывается, отправьте своему MatBus-боту:

```text
/url https://ВАШ_GITHUB_ЛОГИН.github.io/matbus/
```

Затем отправьте `/start` и проверьте кнопку открытия мини-приложения.

## Как обновлять приложение

Вносите изменения в MatBus как обычно. Затем отправляйте их на GitHub:

```powershell
git add .
git commit -m "Update MatBus"
git push
```

GitHub Actions пересоберёт и опубликует сайт автоматически. Компьютер нужен только для редактирования и отправки изменений, но не для работы опубликованного сайта или Telegram-бота.

## Примечания

- GitHub Pages на бесплатном GitHub Free требует публичный репозиторий.
- Публикуемый сайт тоже доступен всем, поэтому не помещайте в исходники токены, пароли, пользовательские данные и другие секреты.
- GitHub Pages — статический хостинг. Он подходит для текущей Expo Web-сборки MatBus, если приложение не требует собственного backend-сервера.
