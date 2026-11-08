import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Безопасные отступы экрана: системные (вырез, Dynamic Island, полоса жестов) плюс отступы,
 * которые сообщает Telegram (в том числе в полноэкранном режиме мини-приложения).
 */
export function useInsets() {
  const base = useSafeAreaInsets();
  const [, setTick] = useState(0);

  useEffect(() => {
    const w: any = typeof window !== 'undefined' ? window : undefined;
    const events = ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged'];
    const bump = () => setTick((t) => t + 1);
    let attached: any = null;
    const attach = () => {
      const tg = (globalThis as any).Telegram?.WebApp;
      if (!tg?.onEvent || attached === tg) return;
      attached = tg;
      events.forEach((e) => tg.onEvent(e, bump));
      bump();
    };
    attach();
    w?.addEventListener?.('matbus-tg-ready', attach);
    return () => {
      w?.removeEventListener?.('matbus-tg-ready', attach);
      if (attached) events.forEach((e) => attached.offEvent?.(e, bump));
    };
  }, []);

  const tg = (globalThis as any).Telegram?.WebApp;
  const sa = tg?.safeAreaInset ?? {};
  const ca = tg?.contentSafeAreaInset ?? {};
  return {
    top: Math.max(base.top, (sa.top || 0) + (ca.top || 0)),
    bottom: Math.max(base.bottom, sa.bottom || 0),
    left: Math.max(base.left, sa.left || 0),
    right: Math.max(base.right, sa.right || 0),
  };
}
