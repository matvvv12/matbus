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

/**
 * У одного названия может быть несколько реальных площадок: например, разные
 * стороны перекрёстка или несколько платформ транспортных видов.
 * Выбираем основную группу только для расчётов маршрута, но НИКОГДА не удаляем
 * остальные точки: карта должна показывать все найденные платформы.
 */
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
    if (!s.platforms.length) return;
    const clusters = clusterPlatforms(s.platforms);
    if (clusters.length === 1) {
      const c = centroid(clusters[0]);
      s.latitude = c.latitude;
      s.longitude = c.longitude;
    } else if (clusters.length > 1) {
      multi.push([s, clusters]);
    } else if (s.latitude == null || s.longitude == null) {
      const p = s.platforms[0];
      s.latitude = p.latitude;
      s.longitude = p.longitude;
    }
  });

  const multiIds = new Set(multi.map(([s]) => s.id));
  multi.forEach(([s, clusters]) => {
    const refs = Array.from(nb.get(s.id) ?? [])
      .map((id) => stopById.get(id))
      .filter((x): x is Stop => !!x && x.latitude != null && !multiIds.has(x.id));
    let primary = [...clusters].sort((a, b) => b.length - a.length)[0];
    if (refs.length) {
      let bestScore = Infinity;
      clusters.forEach((cluster) => {
        const center = centroid(cluster);
        const score = refs.reduce((sum, ref) => sum + distM(center, {
          latitude: ref.latitude as number, longitude: ref.longitude as number,
        }), 0) / refs.length;
        if (score < bestScore) { bestScore = score; primary = cluster; }
      });
    }
    // Важно: s.platforms остаётся полным исходным массивом, включая все кластеры.
    const center = centroid(primary);
    s.latitude = center.latitude;
    s.longitude = center.longitude;
  });
}

/** Выбирает группу одноимённых платформ, ближайшую именно к соседям данного направления. */
function clusterForDirection(s: Stop, prev?: Stop, next?: Stop): P[] {
  const clusters = clusterPlatforms(s.platforms);
  if (clusters.length <= 1) return clusters[0] ?? [];
  const refs = [prev, next].filter((x): x is Stop => !!x && x.latitude != null && x.longitude != null);
  if (!refs.length) {
    return clusters.reduce((best, cluster) => {
      const c = centroid(cluster), b = centroid(best);
      return distM(c, { latitude: s.latitude as number, longitude: s.longitude as number }) <
        distM(b, { latitude: s.latitude as number, longitude: s.longitude as number }) ? cluster : best;
    }, clusters[0]);
  }
  return clusters.reduce((best, cluster) => {
    const center = centroid(cluster), bestCenter = centroid(best);
    const score = refs.reduce((sum, ref) => sum + distM(center, {
      latitude: ref.latitude as number, longitude: ref.longitude as number,
    }), 0) / refs.length;
    const bestScore = refs.reduce((sum, ref) => sum + distM(bestCenter, {
      latitude: ref.latitude as number, longitude: ref.longitude as number,
    }), 0) / refs.length;
    return score < bestScore ? cluster : best;
  }, clusters[0]);
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
    // У одинакового названия могут быть несколько удалённых кластеров.
    // Направление выбирает свой кластер по соседним остановкам маршрута.
    const localCluster = clusterForDirection(s, prev, next);
    const center = centroid(localCluster.length ? localCluster : s.platforms);
    const a = prev && prev.latitude != null ? prev : { ...s, ...center };
    const b = next && next.latitude != null ? next : { ...s, ...center };
    const mlon = mPerLon(center.latitude);
    const hx = ((b.longitude as number) - (a.longitude as number)) * mlon;
    const hy = ((b.latitude as number) - (a.latitude as number)) * M_LAT;
    if (Math.hypot(hx, hy) < 5) return;
    const rx = hy, ry = -hx;
    const compat = compatIdx(s, r.type);
    const localSet = new Set(localCluster);
    const localCompatible = compat.filter((pi) => localSet.has(s.platforms[pi]));
    const allowed = localCompatible.length ? localCompatible : compat;
    let best = allowed[0] ?? 0, bs = -Infinity;
    s.platforms.forEach((p, pi) => {
      if (!allowed.includes(pi)) return;
      const sc = (p.longitude - center.longitude) * mlon * rx + (p.latitude - center.latitude) * M_LAT * ry;
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
  // Не теряем остановку из-за отсутствующих верхнеуровневых lat/lng,
  // если в исходном JSON есть координаты хотя бы одной платформы.
  stops.forEach((stop) => {
    if ((stop.latitude == null || stop.longitude == null) && stop.platforms.length) {
      const p = stop.platforms[0];
      stop.latitude = p.latitude;
      stop.longitude = p.longitude;
    }
  });
  const stopIds = new Set(stops.map((s) => s.id));

  const routes = new Map<string, TransportRoute>();
  (raw.routes ?? []).forEach((r: any) =>
    routes.set(r.id, {
      id: r.id, number: r.number, type: r.type, isDemo: false,
      directions: (r.directions ?? []).map((d: any) => ({ title: d.title, stopIds: d.stopIds ?? [] })),
    })
  );

  // Не полагаемся только на сохранённый список типов остановки: сверяем его с реальными
  // последовательностями маршрутов, чтобы вид транспорта не пропадал из фильтров.
  const typesAtStop = new Map<string, Set<TransportType>>();
  routes.forEach((route) => route.directions.forEach((direction) => direction.stopIds.forEach((id) => {
    if (!typesAtStop.has(id)) typesAtStop.set(id, new Set());
    typesAtStop.get(id)!.add(route.type);
  })));
  stops.forEach((stop) => {
    stop.types = Array.from(new Set([...(stop.types ?? []), ...(typesAtStop.get(stop.id) ?? [])]));
  });

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
  const rawTimetableGroups = new Map<string, any[]>();
  (raw.timetables ?? []).forEach((t: any) => {
    const stopId = String(t.stopId);
    if (!stopIds.has(stopId) || !Array.isArray(t.times) || !t.times.length) return;
    if (!routes.has(t.routeId)) {
      const [type, ...rest] = String(t.routeId).split('-');
      routes.set(t.routeId, { id: t.routeId, number: rest.join('-'), type: type as TransportType, isDemo: false, directions: [] });
    }
    const key = `${stopId}|${t.routeId}|${t.day}`;
    const group = rawTimetableGroups.get(key);
    if (group) group.push(t);
    else rawTimetableGroups.set(key, [t]);
  });

  rawTimetableGroups.forEach((group) => {
    const first = group[0];
    const stopId = String(first.stopId);
    const routeId = String(first.routeId);
    const route = routes.get(routeId);
    const matchingDirections = (route?.directions ?? []).filter((direction) => direction.stopIds.includes(stopId));

    group.forEach((t, index) => {
      let title = String(t.title ?? '').trim();
      if (!title) {
        // В выгрузке часть строк не содержит направления. Заполняем его только тогда,
        // когда число строк однозначно совпадает с числом направлений маршрута на остановке.
        if (matchingDirections.length === group.length && matchingDirections.length > 0) {
          title = matchingDirections[index]?.title ?? '';
        }
        if (!title && matchingDirections.length === 1 && group.length === 1) {
          title = matchingDirections[0].title;
        }
        if (!title) title = 'Направление не указано в источнике';
      }
      const times = Array.from(new Set<number>(t.times.map((value: number) => Number(value))))
        .filter((value) => Number.isFinite(value) && value >= 0)
        .sort((a, b) => a - b);
      if (!times.length) return;
      timetables.push({
        stopId, routeId, title,
        platform: platformFor(stopId, routeId, title),
        headsign: title === 'Направление не указано в источнике'
          ? title
          : (title.split(' - ').pop()?.trim() || title),
        day: t.day, times, estimated: Boolean(t.estimated),
      });
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
