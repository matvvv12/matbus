import { DEMO_ROUTES, DEMO_STOPS } from './demo';
import { DayType, Stop, TimetableEntry, TransitData, TransportRoute } from '../models/stop';
import { MODE_BIT, TransportType } from '../models/transport';
import { lastPart, normTitle } from '../services/schedule';

const ALL_DAYS: DayType[] = ['weekday', 'saturday', 'sunday'];
const TRAVEL_MIN_BETWEEN_STOPS = 3;
let cache: TransitData | null = null;

function indexByStop(entries: TimetableEntry[]) {
  const m = new Map<string, TimetableEntry[]>();
  entries.forEach((e) => {
    const a = m.get(e.stopId);
    if (a) a.push(e);
    else m.set(e.stopId, [e]);
  });
  return m;
}


type P = { latitude: number; longitude: number };
const M_LAT = 110540;
const mPerLon = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);
const distM = (a: P, b: P) =>
  Math.hypot((a.latitude - b.latitude) * M_LAT, (a.longitude - b.longitude) * mPerLon(a.latitude));
const centroid = (c: P[]): P => ({
  latitude: c.reduce((a, p) => a + p.latitude, 0) / c.length,
  longitude: c.reduce((a, p) => a + p.longitude, 0) / c.length,
});

function clusterPlatforms(pts: P[]): P[][] {
  const clusters: P[][] = [];
  pts.forEach((p) => {
    const hit = clusters.filter((c) => c.some((q) => distM(p, q) <= 150));
    hit.forEach((h) => clusters.splice(clusters.indexOf(h), 1));
    clusters.push([p, ...hit.flat()]);
  });
  return clusters;
}

/** Если у названия несколько удалённых друг от друга групп точек OSM (одинаковые названия) - выбираем ту, что рядом с соседними остановками маршрутов */
function resolvePlatforms(stops: Stop[], routes: TransportRoute[], stopById: Map<string, Stop>) {
  const nb = new Map<string, Set<string>>();
  routes.forEach((r) => r.directions.forEach((d) => d.stopIds.forEach((id, i) => {
    [d.stopIds[i - 1], d.stopIds[i + 1]].forEach((n) => {
      if (!n || n === id) return;
      if (!nb.has(id)) nb.set(id, new Set());
      nb.get(id)!.add(n);
    });
  })));
  const multi: [Stop, P[][]][] = [];
  stops.forEach((s) => {
    if (s.platforms.length < 2) return;
    const cl = clusterPlatforms(s.platforms);
    if (cl.length === 1) { const c = centroid(cl[0]); s.latitude = c.latitude; s.longitude = c.longitude; }
    else multi.push([s, cl]);
  });
  const multiIds = new Set(multi.map((m) => m[0].id));
  multi.forEach(([s, cl]) => {
    const refs = Array.from(nb.get(s.id) ?? [])
      .map((id) => stopById.get(id))
      .filter((x): x is Stop => !!x && x.latitude != null && !multiIds.has(x.id));
    let best = [...cl].sort((a, b) => b.length - a.length)[0];
    if (refs.length) {
      let bs = Infinity;
      cl.forEach((c) => {
        const cc = centroid(c);
        const sc = refs.reduce((a, r) => a + distM(cc, { latitude: r.latitude as number, longitude: r.longitude as number }), 0) / refs.length;
        if (sc < bs) { bs = sc; best = c; }
      });
    }
    s.platforms = best;
    const ce = centroid(best);
    s.latitude = ce.latitude; s.longitude = ce.longitude;
  });
}

const sideKey = (stopId: string, routeId: string, title: string) => `${stopId}|${routeId}|${normTitle(title)}`;
const sideKeyLast = (stopId: string, routeId: string, title: string) => `${stopId}|${routeId}|L${lastPart(title)}`;

/** Движение правостороннее: платформа направления лежит справа от курса движения */
/** Платформы остановки, на которых останавливается данный вид транспорта (трамвай не попадает на автобусную платформу) */
const compatIdx = (s: Stop, type: TransportType): number[] => {
  // In the base OSM stop catalog minibus platforms are recorded as bus platforms.
  const bit = MODE_BIT[type === 'minibus' ? 'bus' : type];
  const idx = s.platforms.map((_, i) => i).filter((i) => {
    const m = s.platforms[i].modes;
    return !m || (m & bit) !== 0;
  });
  return idx.length ? idx : s.platforms.map((_, i) => i);
};

function buildSideMap(stopById: Map<string, Stop>, routes: TransportRoute[]) {
  const m = new Map<string, number>();
  routes.forEach((r) => r.directions.forEach((d) => d.stopIds.forEach((id, i) => {
    const s = stopById.get(id);
    if (!s || s.platforms.length < 2 || s.latitude == null) return;
    const prev = stopById.get(d.stopIds[i - 1]);
    const next = stopById.get(d.stopIds[i + 1]);
    const a = prev && prev.latitude != null ? prev : s;
    const b = next && next.latitude != null ? next : s;
    const mlon = mPerLon(s.latitude);
    const hx = ((b.longitude as number) - (a.longitude as number)) * mlon;
    const hy = ((b.latitude as number) - (a.latitude as number)) * M_LAT;
    if (Math.hypot(hx, hy) < 5) return;
    const rx = hy, ry = -hx;
    const compat = compatIdx(s, r.type);
    let best = compat[0] ?? 0, bs = -Infinity;
    s.platforms.forEach((p, pi) => {
      if (!compat.includes(pi)) return;
      const sc = (p.longitude - (s.longitude as number)) * mlon * rx + (p.latitude - (s.latitude as number)) * M_LAT * ry;
      if (sc > bs) { bs = sc; best = pi; }
    });
    m.set(sideKey(id, r.id, d.title), best);
    m.set(sideKeyLast(id, r.id, d.title), best);
  })));
  return m;
}

function buildDemo(): TransitData {
  const nameOf = new Map(DEMO_STOPS.map((s) => [s.id, s.name]));
  const typesByStop = new Map<string, Set<TransportType>>();
  const routes: TransportRoute[] = DEMO_ROUTES.map((r) => {
    r.stopIds.forEach((id) => {
      if (!typesByStop.has(id)) typesByStop.set(id, new Set());
      typesByStop.get(id)!.add(r.type);
    });
    return {
      id: r.id, number: r.number, type: r.type, isDemo: true,
      directions: [
        { title: `${nameOf.get(r.stopIds[0])} - ${nameOf.get(r.stopIds[r.stopIds.length - 1])}`, stopIds: r.stopIds },
        { title: `${nameOf.get(r.stopIds[r.stopIds.length - 1])} - ${nameOf.get(r.stopIds[0])}`, stopIds: [...r.stopIds].reverse() },
      ],
    };
  });
  const stops: Stop[] = DEMO_STOPS.map((s) => ({
    ...s, platforms: [{ latitude: s.latitude, longitude: s.longitude }],
    types: Array.from(typesByStop.get(s.id) ?? []), isDemo: true,
  }));

  const timetables: TimetableEntry[] = [];
  const gen = (first: number, last: number, step: number) => {
    const out: number[] = [];
    for (let t = first; t <= last; t += step) out.push(t);
    return out;
  };
  DEMO_ROUTES.forEach((r) => {
    const n = r.stopIds.length;
    r.stopIds.forEach((stopId, i) => {
      ALL_DAYS.forEach((day) => {
        if (i < n - 1) {
          const off = i * TRAVEL_MIN_BETWEEN_STOPS;
          timetables.push({ stopId, routeId: r.id, title: `${nameOf.get(r.stopIds[0])} - ${nameOf.get(r.stopIds[n - 1])}`, headsign: nameOf.get(r.stopIds[n - 1]) ?? '', day,
            times: gen(r.firstMin + off, r.lastMin + off, r.intervalMin) });
        }
        if (i > 0) {
          const off = (n - 1 - i) * TRAVEL_MIN_BETWEEN_STOPS;
          timetables.push({ stopId, routeId: r.id, title: `${nameOf.get(r.stopIds[n - 1])} - ${nameOf.get(r.stopIds[0])}`, headsign: nameOf.get(r.stopIds[0]) ?? '', day,
            times: gen(r.firstMin + off, r.lastMin + off, r.intervalMin) });
        }
      });
    });
  });

  return {
    stops, stopById: new Map(stops.map((x) => [x.id, x])), routes, timetables, byStop: indexByStop(timetables),
    daysLoaded: ALL_DAYS, isDemo: true, sourceName: 'ДЕМО-данные (не реальные)',
  };
}

function buildReal(raw: any): TransitData | null {
  const stopsRaw: any[] = raw?.stops ?? [];
  if (!stopsRaw.length) return null;

  const stops: Stop[] = stopsRaw.map((s) => ({
    id: String(s.id), name: s.name, address: '',
    latitude: typeof s.lat === 'number' ? s.lat : null,
    longitude: typeof s.lng === 'number' ? s.lng : null,
    platforms: Array.isArray(s.platforms)
      ? s.platforms.map((p: number[]) => ({ latitude: p[0], longitude: p[1], modes: p[2] || 0 }))
      : typeof s.lat === 'number' ? [{ latitude: s.lat, longitude: s.lng }] : [],
    types: s.types ?? [], isDemo: false,
  }));
  const stopIds = new Set(stops.map((s) => s.id));

  const routes = new Map<string, TransportRoute>();
  (raw.routes ?? []).forEach((r: any) =>
    routes.set(r.id, {
      id: r.id, number: r.number, type: r.type, isDemo: false,
      directions: (r.directions ?? []).map((d: any) => ({ title: d.title, stopIds: d.stopIds ?? [] })),
    })
  );

  const stopByIdTmp = new Map(stops.map((x) => [x.id, x]));
  resolvePlatforms(stops, Array.from(routes.values()), stopByIdTmp);
  const sideMap = buildSideMap(stopByIdTmp, Array.from(routes.values()));
  const platformFor = (stopId: string, routeId: string, title: string): number | undefined => {
    const direct = sideMap.get(sideKey(stopId, routeId, title)) ?? sideMap.get(sideKeyLast(stopId, routeId, title));
    if (direct != null) return direct;
    const st = stopByIdTmp.get(stopId);
    const rt = routes.get(routeId)?.type;
    if (st && st.platforms.length > 1 && rt) {
      const c = compatIdx(st, rt);
      if (c.length === 1) return c[0];
    }
    return undefined;
  };

  const timetables: TimetableEntry[] = [];
  (raw.timetables ?? []).forEach((t: any) => {
    const stopId = String(t.stopId);
    if (!stopIds.has(stopId) || !Array.isArray(t.times) || !t.times.length) return;
    if (!routes.has(t.routeId)) {
      const [type, ...rest] = String(t.routeId).split('-');
      routes.set(t.routeId, { id: t.routeId, number: rest.join('-'), type: type as TransportType, isDemo: false, directions: [] });
    }
    timetables.push({
      stopId, routeId: t.routeId, title: String(t.title ?? ''),
      platform: platformFor(stopId, t.routeId, String(t.title ?? '')),
      headsign: String(t.title ?? '').split(' - ').pop()?.trim() ?? '',
      day: t.day, times: t.times, estimated: Boolean(t.estimated),
    });
  });

  const daysLoaded = Array.from(new Set(timetables.map((t) => t.day))) as DayType[];
  return {
    stops, stopById: new Map(stops.map((x) => [x.id, x])), routes: Array.from(routes.values()), timetables, byStop: indexByStop(timetables),
    daysLoaded, isDemo: false,
    sourceName: raw?.meta?.minibusSource
      ? `${raw?.meta?.source || 'Данные расписаний'} · маршрутки: GoOnBus / Aavtobus`
      : (raw?.meta?.source || 'ОАО «Витебскоблавтотранс» · raspis.voat.by'),
  };
}

/** Единая точка получения данных: реальные (src/data/vitebsk.json), иначе ДЕМО. */
export function loadTransitData(): TransitData {
  if (cache) return cache;
  let real: TransitData | null = null;
  try {
    real = buildReal(require('./vitebsk.json'));
  } catch {
    real = null;
  }
  cache = real ?? buildDemo();
  return cache;
}
