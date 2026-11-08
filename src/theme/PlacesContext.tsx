import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PLACE_META, PlaceType, SavedPlace } from '../models/place';

const KEY = 'matbus.places.v2';

type SaveData = { address: string; latitude: number; longitude: number; title?: string };
type Ctx = {
  places: SavedPlace[];
  /** Для дома/работы/учёбы перезаписывает существующее; для custom — создаёт новое или обновляет по id */
  savePlace: (type: PlaceType, data: SaveData, id?: string) => void;
  removePlace: (id: string) => void;
};
const PlacesCtx = createContext<Ctx | null>(null);

export function PlacesProvider({ children }: { children: React.ReactNode }) {
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setPlaces(JSON.parse(raw)))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(KEY, JSON.stringify(places)).catch(() => {});
  }, [places, loaded]);

  const savePlace = useCallback((type: PlaceType, data: SaveData, id?: string) => {
    setPlaces((prev) => {
      const pid = type === 'custom' ? id ?? `c${Date.now()}` : type;
      const old = prev.find((p) => p.id === pid);
      const title = data.title?.trim() || old?.title || PLACE_META[type].title;
      const next: SavedPlace = { id: pid, type, title, address: data.address, latitude: data.latitude, longitude: data.longitude };
      return [...prev.filter((p) => p.id !== pid), next];
    });
  }, []);

  const removePlace = useCallback((id: string) => setPlaces((p) => p.filter((x) => x.id !== id)), []);

  return <PlacesCtx.Provider value={{ places, savePlace, removePlace }}>{children}</PlacesCtx.Provider>;
}

export function usePlaces(): Ctx {
  const v = useContext(PlacesCtx);
  if (!v) throw new Error('usePlaces must be used inside PlacesProvider');
  return v;
}
