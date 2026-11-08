const TELEGRAM_API = 'https://api.telegram.org';
const WEBHOOK_PATH = '/webhook';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function commandOf(text = '') {
  const first = text.trim().split(/\s+/, 1)[0] || '';
  return first.split('@')[0].toLowerCase();
}

function argumentOf(text = '') {
  const trimmed = text.trim();
  const first = trimmed.split(/\s+/, 1)[0] || '';
  return trimmed.slice(first.length).trim();
}

async function telegram(env, method, payload = {}) {
  if (!env.BOT_TOKEN) throw new Error('BOT_TOKEN is not configured');

  const response = await fetch(`${TELEGRAM_API}/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Telegram API returned HTTP ${response.status}`);
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.description || `Telegram API returned HTTP ${response.status}`);
  }
  return result.result;
}

async function getAppUrl(env) {
  const savedUrl = await env.BOT_KV.get('app_url');
  const rawUrl = (savedUrl || env.MATBUS_URL || '').trim();
  if (!rawUrl) return null;

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname) return null;

  // Cache-busting query parameter, matching the previous bot's behaviour.
  parsed.searchParams.set('v', Math.floor(Date.now() / 1000).toString(36));
  return parsed.toString();
}

async function setMenuButton(env) {
  const url = await getAppUrl(env);
  if (!url) return false;

  await telegram(env, 'setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: 'MatBus',
      web_app: { url },
    },
  });
  return true;
}

async function sendApp(env, chatId) {
  const url = await getAppUrl(env);
  if (!url) {
    return telegram(env, 'sendMessage', {
      chat_id: chatId,
      text: 'MatBus ещё не настроен. Владелец бота может указать адрес приложения командой:\n/url https://адрес-вашего-приложения',
    });
  }

  return telegram(env, 'sendMessage', {
    chat_id: chatId,
    text: 'MatBus — транспорт Витебска. Открой приложение кнопкой ниже 👇',
    reply_markup: {
      inline_keyboard: [[
        { text: '🚍 Открыть MatBus', web_app: { url } },
      ]],
    },
  });
}

async function getOwnerId(env) {
  const configuredOwner = (env.OWNER_TELEGRAM_ID || '').trim();
  if (configuredOwner) return configuredOwner;
  return (await env.BOT_KV.get('owner_id')) || '';
}

async function handleMessage(message, env) {
  if (!message?.chat || message.chat.type !== 'private') return;

  const text = (message.text || '').trim();
  if (!text.startsWith('/')) return;

  const chatId = message.chat.id;
  const fromId = String(message.from?.id || '');
  const command = commandOf(text);
  const argument = argumentOf(text);

  let ownerId = await getOwnerId(env);
  // Preserve the original project's behaviour: the first person to send /start
  // becomes the owner, unless OWNER_TELEGRAM_ID is explicitly configured.
  if (!ownerId && command === '/start' && fromId) {
    await env.BOT_KV.put('owner_id', fromId);
    ownerId = fromId;
  }
  const isOwner = Boolean(ownerId && ownerId === fromId);

  if (command === '/start' || command === '/app') {
    try {
      await setMenuButton(env);
    } catch (error) {
      console.error('Could not set menu button:', error.message);
    }
    await sendApp(env, chatId);
    return;
  }

  if (command === '/refresh') {
    const updated = await setMenuButton(env);
    await telegram(env, 'sendMessage', {
      chat_id: chatId,
      text: updated
        ? 'Готово! Кнопка MatBus в меню обновлена. Закрой и снова открой чат с ботом.'
        : 'Адрес приложения ещё не задан. Владелец может задать его командой /url https://адрес-приложения',
    });
    return;
  }

  if (command === '/url') {
    if (!isOwner) {
      await telegram(env, 'sendMessage', {
        chat_id: chatId,
        text: 'Менять адрес приложения может только владелец бота.',
      });
      return;
    }

    let parsed;
    try {
      parsed = new URL(argument);
    } catch {
      parsed = null;
    }

    if (!parsed || parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
      await telegram(env, 'sendMessage', {
        chat_id: chatId,
        text: 'Укажи полный HTTPS-адрес приложения, например:\n/url https://my-matbus.netlify.app',
      });
      return;
    }

    parsed.hash = '';
    await env.BOT_KV.put('app_url', parsed.toString().replace(/\/$/, ''));
    await setMenuButton(env);
    await telegram(env, 'sendMessage', {
      chat_id: chatId,
      text: 'Адрес MatBus сохранён. Вот кнопка для открытия приложения:',
    });
    await sendApp(env, chatId);
    return;
  }

  if (command === '/help') {
    await telegram(env, 'sendMessage', {
      chat_id: chatId,
      text: 'Команды MatBus:\n/start — открыть приложение\n/app — показать кнопку открытия\n/refresh — обновить кнопку меню\n/url https://адрес — изменить адрес приложения (только владелец)',
    });
    return;
  }

  await sendApp(env, chatId);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json({ ok: true, service: 'MatBus Telegram Worker' });
    }

    if (url.pathname !== WEBHOOK_PATH || request.method !== 'POST') {
      return json({ ok: false, error: 'Not found' }, 404);
    }

    if (!env.BOT_TOKEN || !env.WEBHOOK_SECRET || !env.BOT_KV) {
      console.error('Worker configuration is incomplete. Set BOT_TOKEN, WEBHOOK_SECRET and BOT_KV.');
      return json({ ok: false, error: 'Worker is not configured' }, 500);
    }

    const receivedSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
    if (receivedSecret !== env.WEBHOOK_SECRET) {
      return json({ ok: false, error: 'Unauthorized' }, 403);
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return json({ ok: false, error: 'Invalid JSON' }, 400);
    }

    try {
      if (update?.message) await handleMessage(update.message, env);
      return json({ ok: true });
    } catch (error) {
      console.error('Telegram update failed:', error.message);
      // Telegram will retry this update when it receives a non-2xx response.
      return json({ ok: false, error: 'Could not process update' }, 500);
    }
  },
};
