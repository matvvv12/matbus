import { DayType, TransitData, TransportRoute } from '../models/stop';

export function dayTypeOf(d: Date): DayType {
  const wd = d.getDay();
  return wd === 0 ? 'sunday' : wd === 6 ? 'saturday' : 'weekday';
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function formatTime(totalMin: number): string {
  const m = ((totalMin % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;
}

export type Departure = {
  route: TransportRoute;
  headsign: string;
  timeMin: number;
  inMin: number;
  estimated: boolean;
  directionIndex: number;
};

export type StopRouteSchedule = {
  title: string;
  headsign: string;
  times: number[];
  estimated: boolean;
};

/** Ближайшие отправления строго по расписанию (без GPS и без «задержек»). */
export function nextDepartures(data: TransitData, stopId: string, now: Date, limit = 4, platform?: number): Departure[] {
  const nowMin = minutesOfDay(now);
  const day = dayTypeOf(now);
  const routeById = new Map(data.routes.map((r) => [r.id, r]));
  const out: Departure[] = [];
  (data.byStop.get(stopId) ?? [])
    .filter((e) => e.day === day && (platform == null || e.platform == null || e.platform === platform))
    .forEach((e) => {
      const route = routeById.get(e.routeId);
      if (!route) return;
      Array.from(new Set(e.times)).filter((t) => t >= nowMin).slice(0, 2).forEach((t) =>
        out.push({
          route,
          headsign: e.headsign?.trim() || 'Направление не указано',
          timeMin: t, inMin: t - nowMin, estimated: Boolean(e.estimated),
          directionIndex: route.directions.findIndex((direction) => direction.title === e.title),
        })
      );
    });
  const seen = new Set<string>();
  return out.sort((a, b) => a.timeMin - b.timeMin).filter((entry) => {
    const key = `${entry.route.id}|${entry.headsign}|${entry.timeMin}|${entry.estimated ? 1 : 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

/** Все рейсы конкретного маршрута на остановке за выбранный тип дня, сгруппированные по направлению. */
export function routeScheduleAtStop(
  data: TransitData,
  stopId: string,
  routeId: string,
  date: Date,
  platform?: number,
): StopRouteSchedule[] {
  const day = dayTypeOf(date);
  const groups = new Map<string, StopRouteSchedule>();
  (data.byStop.get(stopId) ?? [])
    .filter((entry) => entry.routeId === routeId && entry.day === day &&
      (platform == null || entry.platform == null || entry.platform === platform))
    .forEach((entry) => {
      const title = entry.title || entry.headsign || 'Направление не указано';
      const headsign = entry.headsign || title.split(' - ').pop()?.trim() || title;
      const estimated = Boolean(entry.estimated);
      const key = `${title}|${estimated ? 'estimated' : 'official'}`;
      const existing = groups.get(key);
      if (existing) {
        existing.times = Array.from(new Set([...existing.times, ...entry.times])).sort((a, b) => a - b);
      } else {
        groups.set(key, { title, headsign, times: [...entry.times].sort((a, b) => a - b), estimated });
      }
    });
  return Array.from(groups.values()).sort((a, b) => a.times[0] - b.times[0]);
}

/** Маршруты, которые проходят через остановку (без дублей). */
export function routesAtStop(data: TransitData, stopId: string, platform?: number): TransportRoute[] {
  const routeById = new Map(data.routes.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const add = (routeId: string) => {
    if (seen.has(routeId)) return;
    const route = routeById.get(routeId);
    if (route) { seen.add(routeId); }
  };
  // Расписание может не содержать строку на отдельной остановке (например, конечную),
  // поэтому список маршрутов строим также по последовательностям остановок.
  (data.byStop.get(stopId) ?? []).forEach((entry) => {
    if (platform != null && entry.platform != null && entry.platform !== platform) return;
    add(entry.routeId);
  });
  data.routes.forEach((route) => {
    if (route.directions.some((direction) => direction.stopIds.includes(stopId))) add(route.id);
  });
  return Array.from(seen).map((id) => routeById.get(id)!).sort((a, b) =>
    a.type === b.type ? a.number.localeCompare(b.number, 'ru', { numeric: true }) : a.type.localeCompare(b.type)
  );
}

/** По одному ближайшему отправлению каждого вида транспорта. */
export function nextDepartureByType(data: TransitData, stopId: string, now: Date, platform?: number): Departure[] {
  const all = nextDepartures(data, stopId, now, Number.MAX_SAFE_INTEGER, platform);
  const seen = new Set<string>();
  return all.filter((departure) => {
    if (seen.has(departure.route.type)) return false;
    seen.add(departure.route.type);
    return true;
  });
}

export const normTitle = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
export const lastPart = (s: string) => normTitle(s.split(' - ').pop() ?? '');
export const shortTitle = (s: string) => (s.split(' - ').pop() ?? s).trim();

/** Конечные направления для каждой платформы (стороны) остановки. */
export function platformHeadsigns(data: TransitData, stopId: string): string[][] {
  const out: string[][] = [];
  (data.byStop.get(stopId) ?? []).forEach((e) => {
    if (e.platform == null) return;
    const h = (e.headsign || '').trim();
    if (!h) return;
    (out[e.platform] = out[e.platform] ?? []);
    if (!out[e.platform].includes(h)) out[e.platform].push(h);
  });
  return out;
}

export function addCalendarDays(date: Date, count: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  result.setDate(result.getDate() + count);
  return result;
}

export function dateChipLabel(date: Date, offset: number): string {
  if (offset === 0) return 'Сегодня';
  if (offset === 1) return 'Завтра';
  return date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
}

export function dateLongLabel(date: Date): string {
  return date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}
