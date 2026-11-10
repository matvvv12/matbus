import { useCallback, useEffect, useRef, useState } from 'react';
import { LatLng, distanceMeters } from '../services/geo';

export type LocationStatus = 'idle' | 'loading' | 'tracking' | 'denied' | 'error';

type GeoApi = {
  watchPosition: (success: (position: any) => void, error: (error: any) => void, options?: any) => number;
  clearWatch: (watchId: number) => void;
};

/**
 * Continuous foreground location tracking for the web app and Telegram Mini App.
 * Browsers request permission from a user gesture and then stream fixes through
 * watchPosition. Telegram's LocationManager is retained as a one-shot fallback
 * for clients where browser geolocation is unavailable.
 */
export function useUserLocation(enabled = true) {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [watching, setWatching] = useState(false);

  const watchId = useRef<number | null>(null);
  const geoApi = useRef<GeoApi | null>(null);
  const mounted = useRef(true);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const trackingRequested = useRef(false);
  const lastAccepted = useRef<{ point: LatLng; at: number } | null>(null);
  const hasLocation = useRef(false);

  const clearWatch = useCallback(() => {
    if (watchId.current != null) {
      geoApi.current?.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    trackingRequested.current = false;
    clearWatch();
    if (mounted.current) setWatching(false);
  }, [clearWatch]);

  const acceptPosition = useCallback((position: any) => {
    const coords = position?.coords;
    const latitude = Number(coords?.latitude);
    const longitude = Number(coords?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    const point = { latitude, longitude };
    const at = Number(position?.timestamp) || Date.now();
    const previous = lastAccepted.current;
    // Ignore sub-metre jitter unless enough time has passed to refresh accuracy.
    if (previous && distanceMeters(previous.point, point) < 2 && at - previous.at < 2500) {
      return;
    }
    lastAccepted.current = { point, at };
    hasLocation.current = true;
    if (!mounted.current) return;
    setLocation(point);
    setAccuracy(Number.isFinite(Number(coords?.accuracy)) ? Number(coords.accuracy) : null);
    setHeading(coords?.heading != null && Number.isFinite(Number(coords.heading))
      ? ((Number(coords.heading) % 360) + 360) % 360
      : null);
    setUpdatedAt(at);
    setStatus('tracking');
  }, []);

  const fail = useCallback((error: any) => {
    if (!mounted.current) return;
    // A timeout or temporary position-unavailable event is not a reason to
    // cancel watchPosition: the browser may deliver a valid fix a moment later.
    if (error?.code === 1) {
      trackingRequested.current = false;
      clearWatch();
      setWatching(false);
      setStatus('denied');
      return;
    }
    setStatus(hasLocation.current ? 'tracking' : 'error');
  }, [clearWatch]);

  const request = useCallback(() => {
    trackingRequested.current = true;
    if (!enabledRef.current || watchId.current != null) return;
    if (mounted.current) setStatus('loading');

    const geo = (globalThis as any).navigator?.geolocation as GeoApi | undefined;
    if (geo && typeof (geo as any).watchPosition === 'function' && typeof (geo as any).clearWatch === 'function') {
      geoApi.current = geo;
      try {
        const id = geo.watchPosition(acceptPosition, fail, {
          enableHighAccuracy: true,
          maximumAge: 3000,
          timeout: 20000,
        });
        watchId.current = id;
        if (mounted.current) setWatching(true);
        return;
      } catch {
        // Continue to Telegram's one-shot fallback below.
      }
    }

    const telegram = (globalThis as any).Telegram?.WebApp;
    const manager = telegram?.LocationManager;
    if (manager && telegram?.isVersionAtLeast?.('8.0')) {
      const read = () => {
        if (!manager.isLocationAvailable) {
          if (mounted.current) setStatus('denied');
          return;
        }
        manager.getLocation((value: any) => {
          if (value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)) {
            acceptPosition({ coords: value, timestamp: Date.now() });
            if (mounted.current) setStatus('idle');
          } else if (mounted.current) {
            setStatus('denied');
          }
        });
      };
      if (manager.isInited) read(); else manager.init(read);
      return;
    }

    if (mounted.current) setStatus('error');
  }, [acceptPosition, fail]);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) {
      clearWatch();
      setWatching(false);
    } else if (trackingRequested.current && watchId.current == null) {
      request();
    }
    return () => {
      mounted.current = false;
      clearWatch();
    };
  }, [clearWatch, enabled, request]);

  return { location, accuracy, heading, updatedAt, status, watching, request, stop };
}
