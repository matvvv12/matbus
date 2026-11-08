# MatBus Telegram Bot на Cloudflare Workers

Эта папка переносит Telegram-бота MatBus с локального компьютера на Cloudflare Workers. Бот принимает обновления через Telegram Webhook — запуск Windows, `bot.bat` и постоянно включённый ПК больше не нужны.

Код остаётся обычным JavaScript-файлом `src/index.js`: его можно править в VS Code, сохранять в GitHub или редактировать через Cloudflare. После изменения нужно выполнить `npm run deploy` либо настроить автодеплой из GitHub.

## Важно про безопасность

В исходном архиве MatBus файл `bot/config.json` содержал действующий токен Telegram. Считай его раскрытым и **обязательно отзови его через @BotFather** (`/revoke` → выбери бота), затем используй новый токен. Не вставляй токен в исходники, GitHub, скриншоты или переписку.

В этом патче `bot/config.json` очищен, а `.gitignore` настроен так, чтобы локальный файл с токеном не попадал в новые коммиты. Если `bot/config.json` уже отслеживается Git, один раз выполни в корне проекта:

```powershell
git rm --cached -f bot/config.json
git add .gitignore
git commit -m "Remove local Telegram bot credentials"
```

Файл останется на компьютере, но перестанет отправляться в репозиторий.

## 1. Подготовка Cloudflare

1. Создай бесплатный аккаунт на <https://dash.cloudflare.com/>.
2. Установи Node.js LTS: <https://nodejs.org/>.
3. Открой PowerShell в папке `cloudflare-worker`.
4. Установи инструменты и войди в Cloudflare:

```powershell
npm install
npx wrangler login
```

5. Создай хранилище KV, в котором будут сохраняться владелец бота и адрес Mini App:

```powershell
npx wrangler kv namespace create BOT_KV
```

Команда вернёт `id`. Открой `wrangler.jsonc` и замени значение `PASTE_KV_NAMESPACE_ID_HERE` на этот ID. Не меняй имя binding `BOT_KV`.

## 2. Добавление секретов

Сгенерируй секрет для проверки запросов от Telegram. Выполни в PowerShell:

```powershell
$secret = [guid]::NewGuid().ToString("N")
$secret
```

Скопируй показанную строку — она понадобится и Cloudflare, и скрипту регистрации webhook.

Добавь новый токен, полученный после `/revoke` в @BotFather, и webhook-секрет в Cloudflare:

```powershell
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
```

На каждый запрос Wrangler попросит вставить значение. В `BOT_TOKEN` вставь новый токен бота. В `WEBHOOK_SECRET` вставь сгенерированную строку.

**Не добавляй эти значения в `wrangler.jsonc` или `src/index.js`.** Это секреты Cloudflare.

## 3. Публикация Worker

Убедись, что в `wrangler.jsonc` указан настоящий KV ID, затем выполни:

```powershell
npm run deploy
```

В конце Wrangler покажет адрес примерно такого вида:

```text
https://matbus-telegram-bot.ТВОЙ-АККАУНТ.workers.dev
```

Открой этот адрес в браузере. Должен появиться JSON с `"ok": true`.

## 4. Подключение Telegram к Worker

Всё ещё находясь в папке `cloudflare-worker`, запусти:

```powershell
.\scripts\set-webhook.ps1
```

Скрипт попросит:

- новый токен бота от @BotFather;
- тот же `WEBHOOK_SECRET`, который добавлен в Cloudflare;
- URL Worker, который показал `npm run deploy`.

После этого Telegram начнёт отправлять команды на Cloudflare. Проверь бота командой `/start`.

## 5. Укажи адрес приложения MatBus

Открой бота в Telegram и отправь владельцем:

```text
/url https://ТВОЙ-АДРЕС-MATBUS
```

Например, если приложение опубликовано на Netlify — используй его постоянный HTTPS-адрес. Адрес сохранится в KV и не потеряется при новых публикациях Worker.

Первый пользователь, который отправит `/start` после чистого развёртывания, становится владельцем — как и в прежней версии. Только владелец может менять адрес командой `/url`. При желании можно задать `OWNER_TELEGRAM_ID` в `wrangler.jsonc` заранее, тогда будет использоваться указанный Telegram ID.

## Как вносить изменения дальше

### Вариант A — через VS Code

1. Открой `cloudflare-worker/src/index.js`.
2. Внеси правки и сохрани файл.
3. В терминале из папки `cloudflare-worker` запусти:

```powershell
npm run deploy
```

Cloudflare опубликует новую версию. Токен, webhook-секрет, владелец и сохранённый URL останутся в секретах и KV.

### Вариант B — автопубликация из GitHub

В Cloudflare Dashboard открой **Workers & Pages → Create → Connect to Git** и подключи GitHub-репозиторий MatBus. Для проекта укажи корневую папку `cloudflare-worker`, команду установки `npm install` и команду публикации `npm run deploy`. После настройки Cloudflare сможет автоматически публиковать изменения, которые ты отправляешь в выбранную ветку GitHub.

При подключении GitHub проверь, что в настройках Worker сохранены секреты `BOT_TOKEN`, `WEBHOOK_SECRET` и KV binding `BOT_KV`.

## Команды бота

- `/start` и `/app` — прислать кнопку открытия MatBus;
- `/url https://...` — изменить адрес Mini App (только владелец);
- `/refresh` — обновить кнопку меню Telegram;
- `/help` — показать команды.

`bot/bot.mjs` в корне проекта защищён от случайного локального запуска: прежняя версия при старте удаляла webhook и включала Long Polling. После перехода на Cloudflare **не запускай старый локальный poller**, иначе он отключит webhook.

## Бесплатный тариф и ограничения

По документации Cloudflare Workers Free имеет лимит 100 000 запросов в сутки и 10 мс CPU на один HTTP-запрос. Для простого Telegram-бота, который отвечает на команды и выдаёт кнопку Mini App, это обычно большой запас. Если проект вырастет и упрётся в квоты, Cloudflare покажет ограничение — тогда можно отдельно решить, нужен ли платный тариф.

Документация:
- Cloudflare Workers limits: <https://developers.cloudflare.com/workers/platform/limits/>
- Cloudflare Workers Git integration: <https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/>
- Telegram Bot API — setWebhook: <https://core.telegram.org/bots/api#setwebhook>
