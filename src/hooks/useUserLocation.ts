import { useCallback, useState } from 'react';
import { LatLng } from '../services/geo';

export type LocationStatus = 'idle' | 'loading' | 'denied' | 'error';

export function useUserLocation() {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');

  const viaBrowser = useCallback(() => {
    const geo = (globalThis as any).navigator?.geolocation;
    if (!geo) {
      setStatus('error');
      return;
    }
    geo.getCurrentPosition(
      (p: any) => {
        setLocation({ latitude: p.coords.latitude, longitude: p.coords.longitude });
        setStatus('idle');
      },
      (err: any) => setStatus(err?.code === 1 ? 'denied' : 'error'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const request = useCallback(() => {
    setStatus('loading');
    // Внутри Telegram используем его собственный менеджер геолокации (Bot API 8.0+), он надёжнее браузерного
    const tg = (globalThis as any).Telegram?.WebApp;
    const lm = tg?.LocationManager;
    if (lm && tg.isVersionAtLeast?.('8.0')) {
      const ask = () => {
        if (!lm.isLocationAvailable) { viaBrowser(); return; }
        lm.getLocation((d: any) => {
          if (d && typeof d.latitude === 'number') {
            setLocation({ latitude: d.latitude, longitude: d.longitude });
            setStatus('idle');
          } else {
            setStatus('denied');
          }
        });
      };
      if (lm.isInited) ask(); else lm.init(ask);
      return;
    }
    viaBrowser();
  }, [viaBrowser]);

  return { location, status, request };
}
