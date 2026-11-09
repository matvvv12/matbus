import { TransportType } from './transport';

export type DayType = 'weekday' | 'saturday' | 'sunday';
export const DAY_LABEL: Record<DayType, string> = {
  weekday: 'будни',
  saturday: 'суббота',
  sunday: 'воскресенье',
};

export type Stop = {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  /** Физические платформы (обе стороны дороги) */
  platforms: { latitude: number; longitude: number; modes?: number }[];
  types: TransportType[];
  isDemo: boolean;
};

export type RouteDirection = { title: string; stopIds: string[] };

export type TransportRoute = {
  id: string;
  number: string;
  type: TransportType;
  directions: RouteDirection[];
  isDemo: boolean;
};

/** Времена отправления маршрута с остановки в одном направлении. Минуты от начала суток; >= 1440 — после полуночи */
export type TimetableEntry = {
  stopId: string;
  routeId: string;
  /** индекс платформы (стороны) остановки, к которой относится это направление */
  platform?: number;
  title: string;
  headsign: string;
  day: DayType;
  times: number[];
  /** true: время рассчитано по опубликованному интервалу, а не указано отдельно для остановки */
  estimated?: boolean;
};

export type TransitData = {
  stops: Stop[];
  stopById: Map<string, Stop>;
  routes: TransportRoute[];
  timetables: TimetableEntry[];
  byStop: Map<string, TimetableEntry[]>;
  daysLoaded: DayType[];
  isDemo: boolean;
  sourceName: string;
};
