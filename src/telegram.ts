import { Platform } from 'react-native';

/** Подключает Telegram Mini App SDK (если приложение открыто внутри Telegram) и настраивает окно. */
export function initTelegram() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const w = window as any;
  const setup = () => {
    try {
      const tg = w.Telegram?.WebApp;
      if (!tg) return;
      const at = (v: string) => { try { return !!tg.isVersionAtLeast?.(v); } catch { return false; } };
      tg.ready();
      tg.expand();
      // вызываем только то, что поддерживает версия Telegram (иначе в консоли предупреждения)
      try { if (at('7.7')) tg.disableVerticalSwipes?.(); } catch {}   // прокрутка списков не закрывает приложение
      try { if (at('6.9')) { tg.setHeaderColor?.('#08080A'); tg.setBackgroundColor?.('#08080A'); } } catch {}
      try { if (at('7.10')) tg.setBottomBarColor?.('#08080A'); } catch {}
      try { w.dispatchEvent(new Event('matbus-tg-ready')); } catch {}
    } catch {}
  };
  if (w.Telegram?.WebApp) { setup(); return; }
  const s = document.createElement('script');
  s.src = 'https://telegram.org/js/telegram-web-app.js';
  s.async = true;
  s.onload = setup;
  document.head.appendChild(s);
}
