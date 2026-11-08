// MatBus Telegram bot is hosted by cloudflare-worker/src/index.js.
// The former local Long Polling version called deleteWebhook() at startup,
// which would disconnect the Cloudflare webhook. Keep this guard so that an
// accidental local start cannot take the production bot offline.
console.log('MatBus bot теперь работает через Cloudflare Worker.');
console.log('Не запускай локальный Long Polling: он может отключить Telegram Webhook.');
console.log('Для правок открой cloudflare-worker/src/index.js, затем выполни npm run deploy.');
