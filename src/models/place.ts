import { Stop } from './stop';

export type PlaceType = 'home' | 'work' | 'study' | 'custom';

export const PLACE_META: Record<PlaceType, { title: string; icon: string; color: string }> = {
  home: { title: 'Дом', icon: 'home', color: '#30D158' },
  work: { title: 'Работа', icon: 'briefcase', color: '#0A84FF' },
  study: { title: 'Учёба', icon: 'school', color: '#BF5AF2' },
  custom: { title: 'Место', icon: 'location', color: '#FF9F0A' },
};

/** Сохранённое место. Для дома/работы/учёбы id === type */
export type SavedPlace = {
  id: string;
  type: PlaceType;
  title: string;
  address: string;
  latitude: number;
  longitude: number;
};

/** Конечная точка маршрута: моё местоположение, остановка или произвольная точка (адрес, место, точка на карте) */
export type RoutePlace =
  | { kind: 'me' }
  | { kind: 'stop'; stop: Stop }
  | { kind: 'point'; title: string; subtitle?: string; latitude: number; longitude: number };

export const pointOf = (p: SavedPlace): RoutePlace => ({
  kind: 'point', title: p.title, subtitle: p.address, latitude: p.latitude, longitude: p.longitude,
});
