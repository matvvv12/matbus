import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'matbus.favorites.v2';
const OLD_KEY = 'matbus.favorites.v1';

type Ctx = {
  stopIds: string[];
  routeIds: string[];
  isFavorite: (id: string) => boolean;
  isFavoriteRoute: (id: string) => boolean;
  toggle: (id: string) => void;
  toggleRoute: (id: string) => void;
};
const FavCtx = createContext<Ctx | null>(null);
const flip = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [stopIds, setStopIds] = useState<string[]>([]);
  const [routeIds, setRouteIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const v = JSON.parse(raw);
          setStopIds(v.stopIds ?? []);
          setRouteIds(v.routeIds ?? []);
        } else {
          const old = await AsyncStorage.getItem(OLD_KEY);
          if (old) setStopIds(JSON.parse(old));
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(KEY, JSON.stringify({ stopIds, routeIds })).catch(() => {});
  }, [stopIds, routeIds, loaded]);

  const toggle = useCallback((id: string) => setStopIds((p) => flip(p, id)), []);
  const toggleRoute = useCallback((id: string) => setRouteIds((p) => flip(p, id)), []);

  return (
    <FavCtx.Provider
      value={{
        stopIds, routeIds, toggle, toggleRoute,
        isFavorite: (id) => stopIds.includes(id),
        isFavoriteRoute: (id) => routeIds.includes(id),
      }}
    >
      {children}
    </FavCtx.Provider>
  );
}

export function useFavorites(): Ctx {
  const v = useContext(FavCtx);
  if (!v) throw new Error('useFavorites must be used inside FavoritesProvider');
  return v;
}
