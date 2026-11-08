$ErrorActionPreference = 'Stop'

Write-Host 'Регистрация Telegram webhook для MatBus' -ForegroundColor Cyan
$botToken = Read-Host 'Вставь НОВЫЙ токен бота от @BotFather (не отправляй его в чат)' 
$webhookSecret = Read-Host 'Вставь тот же WEBHOOK_SECRET, который добавлен в Cloudflare'
$workerUrl = Read-Host 'Вставь адрес Worker, например https://matbus-telegram-bot.ТВОЙ-АККАУНТ.workers.dev'

$workerUrl = $workerUrl.Trim().TrimEnd('/')
if (-not $workerUrl.StartsWith('https://')) { throw 'Адрес Worker должен начинаться с https://' }
if ($webhookSecret -notmatch '^[A-Za-z0-9_-]{1,256}$') { throw 'WEBHOOK_SECRET должен содержать только A-Z, a-z, 0-9, _ и -' }

$body = @{
    url = "$workerUrl/webhook"
    secret_token = $webhookSecret
    allowed_updates = @('message')
    drop_pending_updates = $true
} | ConvertTo-Json -Compress

$result = Invoke-RestMethod -Method Post `
    -Uri "https://api.telegram.org/bot$botToken/setWebhook" `
    -ContentType 'application/json' `
    -Body $body

if ($result.ok) {
    Write-Host 'Webhook успешно подключён. Теперь бот работает через Cloudflare.' -ForegroundColor Green
} else {
    throw "Telegram не принял webhook: $($result.description)"
}
