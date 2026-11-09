// Бот MatBus: открывает веб-приложение как Telegram Mini App.
// Запуск: node bot/bot.mjs   (нужен Node.js 18+ и файл bot/config.json с токеном от @BotFather)
// Команды в чате с ботом:
//   /start          - открыть приложение (первый, кто написал /start, становится владельцем)
//   /url https://…  - сменить адрес приложения (только владелец) — удобно при новом адресе туннеля
//   /refresh        - сбросить кэш Telegram (обновляет кнопку меню)
//   /app            - прислать кнопку открытия
import fs from 'node:fs';
import path from 'node:path';

const CFG = path.resolve('bot/config.json');
if (!fs.existsSync(CFG)) {
  console.error('Нет файла bot/config.json. Скопируйте bot/config.example.json в bot/config.json и вставьте токен.');
  process.exit(1);
}
let cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
if (!cfg.token || cfg.token.includes('ВСТАВЬТЕ')) {
  console.error('В bot/config.json не указан token (получите его у @BotFather командой /newbot).');
  process.exit(1);
}
const save = () => fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, body = {}) {
  const r = await fetch(`https://api.telegram.org/bot${cfg.token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
}

const appUrl = () => (cfg.url ? cfg.url + (cfg.url.includes('?') ? '&' : '?') + 'v=' + Date.now().toString(36) : null);

async function setMenu() {
  const url = appUrl();
  if (!url) return;
  const r = await api('setChatMenuButton', { menu_button: { type: 'web_app', text: 'MatBus', web_app: { url } } });
  console.log('Кнопка меню:', r.ok ? 'обновлена' : r.description);
}

async function sendApp(chatId) {
  const url = appUrl();
  if (!url) {
    return api('sendMessage', { chat_id: chatId, text: 'Адрес приложения ещё не задан. Отправьте команду:\n/url https://ваш-адрес' });
  }
  return api('sendMessage', {
    chat_id: chatId,
    text: 'MatBus — транспорт Витебска',
    reply_markup: { inline_keyboard: [[{ text: 'Открыть MatBus', web_app: { url } }]] },
  });
}

async function handle(m) {
  const chatId = m.chat.id;
  const text = (m.text || '').trim();
  const from = m.from?.id;
  if (!cfg.owner && text.startsWith('/start')) { cfg.owner = from; save(); console.log('Владелец:', from); }
  const isOwner = cfg.owner === from;

  if (text.startsWith('/start') || text.startsWith('/app')) {
    await setMenu();
    await sendApp(chatId);
  } else if (text.startsWith('/refresh')) {
    await setMenu();
    await api('sendMessage', { chat_id: chatId, text: 'Готово: кнопка меню обновлена. Закройте и снова откройте приложение.' });
  } else if (text.startsWith('/url')) {
    if (!isOwner) return api('sendMessage', { chat_id: chatId, text: 'Менять адрес может только владелец бота.' });
    const u = text.split(/\s+/)[1];
    if (!u || !/^https:\/\/\S+$/.test(u)) {
      return api('sendMessage', { chat_id: chatId, text: 'Нужен адрес с https, например:\n/url https://my-matbus.netlify.app' });
    }
    cfg.url = u.replace(/\/+$/, '');
    save();
    await setMenu();
    await api('sendMessage', { chat_id: chatId, text: 'Адрес сохранён. Нажмите кнопку ниже или «MatBus» в меню.' });
    await sendApp(chatId);
  } else {
    await api('sendMessage', { chat_id: chatId, text: 'Команды: /start, /app, /url, /refresh' });
  }
}

async function main() {
  const me = await api('getMe');
  if (!me.ok) { console.error('Неверный токен:', me.description); process.exit(1); }
  console.log(`Бот @${me.result.username} запущен. Откройте его в Telegram и отправьте /start`);
  await api('deleteWebhook');
  await setMenu();
  let offset = 0;
  for (;;) {
    try {
      const r = await api('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] });
      if (!r.ok) { console.log('getUpdates:', r.description); await sleep(3000); continue; }
      for (const u of r.result) {
        offset = u.update_id + 1;
        if (u.message?.chat?.type === 'private') await handle(u.message).catch((e) => console.log('ошибка:', e.message));
      }
    } catch (e) {
      console.log('Сеть:', e.message);
      await sleep(3000);
    }
  }
}
main();
