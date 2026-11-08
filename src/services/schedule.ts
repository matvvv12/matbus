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

export type Departure = { route: TransportRoute; headsign: string; timeMin: number; inMin: number; estimated: boolean };

/** Ближайшие отправления строго по расписанию (без GPS и без «задержек») */
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
      e.times.filter((t) => t >= nowMin).slice(0, 2).forEach((t) =>
        out.push({ route, headsign: e.headsign, timeMin: t, inMin: t - nowMin, estimated: Boolean(e.estimated) })
      );
    });
  return out.sort((a, b) => a.timeMin - b.timeMin).slice(0, limit);
}

/** Маршруты, которые проходят через остановку (без дублей) */
export function routesAtStop(data: TransitData, stopId: string, platform?: number): TransportRoute[] {
  const routeById = new Map(data.routes.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const out: TransportRoute[] = [];
  (data.byStop.get(stopId) ?? []).forEach((e) => {
    if (platform != null && e.platform != null && e.platform !== platform) return;
    if (seen.has(e.routeId)) return;
    seen.add(e.routeId);
    const r = routeById.get(e.routeId);
    if (r) out.push(r);
  });
  return out.sort((a, b) =>
    a.type === b.type ? a.number.localeCompare(b.number, 'ru', { numeric: true }) : a.type.localeCompare(b.type)
  );
}

export const normTitle = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
export const lastPart = (s: string) => normTitle(s.split(' - ').pop() ?? '');
export const shortTitle = (s: string) => (s.split(' - ').pop() ?? s).trim();

/** Конечные направления для каждой платформы (стороны) остановки */
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
