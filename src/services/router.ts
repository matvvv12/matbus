import type { DayType, TimetableEntry, TransitData, TransportRoute } from '../models/stop';
import type { TransportType } from '../models/transport';
import { distanceMeters } from './geo';
import { lastPart, normTitle } from './schedule';

export type Leg =
  | { kind: 'walk'; fromLabel: string; toStopId?: string; toLabel?: string; minutes: number; meters: number }
  | {
      kind: 'ride'; route: TransportRoute; headsign: string; fromStopId: string; toStopId: string;
      stopsCount: number; dep: number; arr: number; pathStopIds?: string[]; dirTitle?: string;
    };

export type Journey = {
  legs: Leg[];
  leaveAt: number;
  arriveAt: number;
  totalMin: number;
  transfers: number;
  walkMin: number;
  tags: ('fastest' | 'fewest' | 'leastWalk' | 'walk' | 'alt')[];
};

export type Origin = { stopId: string; walkMin: number; walkMeters: number; label: string };
export type Dest = Origin;
export type LatLon = { latitude: number; longitude: number };
export const WALK_DETOUR = 1.25; // пешком по улицам длиннее, чем по прямой

/** Остановки рядом с точкой + время пешком до них */
export function stopsAround(data: TransitData, p: LatLon, label: string, maxM = 700, limit = 5): Origin[] {
  return data.stops
    .filter((s) => s.latitude != null)
    .map((s) => {
      const pts = s.platforms.length ? s.platforms : [{ latitude: s.latitude as number, longitude: s.longitude as number }];
      return { s, d: Math.min(...pts.map((q) => distanceMeters(p, q))) * WALK_DETOUR };
    })
    .filter((x) => x.d <= maxM * WALK_DETOUR)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x) => ({ stopId: x.s.id, walkMeters: Math.round(x.d), walkMin: Math.max(1, Math.ceil(x.d / WALK_M_PER_MIN)), label }));
}

type Dir = { route: TransportRoute; title: string; stopIds: string[]; times: Map<string, number[]>; off: number[]; usable: boolean[] };
type Label = { arr: number; stopId: string; prev: Label | null; leg: Leg | null };

const WALK_M_PER_MIN = 75;
const FOOTPATH_M = 250;
const dirCache = new WeakMap<TransitData, Map<string, Dir[]>>();
const nbCache = new WeakMap<TransitData, Map<string, { id: string; meters: number }[]>>();

/**
 * Модель движения по направлению: сколько минут от «опорной» остановки до каждой следующей.
 * Считается по остановкам, у которых столько же рейсов, сколько у опорной (рейс k на одной = рейс k на другой).
 * Благодаря этому время в пути берётся для ТОГО ЖЕ рейса, а не для ближайшего по времени.
 */
function buildModel(stopIds: string[], times: Map<string, number[]>): { off: number[]; usable: boolean[] } {
  const n = stopIds.length;
  const seen = new Set<string>();
  const dupe = new Set<string>();
  stopIds.forEach((id) => { if (seen.has(id)) dupe.add(id); else seen.add(id); });
  const usable = stopIds.map((id) => times.has(id) && !dupe.has(id));
  const ref = usable.findIndex(Boolean);
  if (ref < 0) return { off: stopIds.map(() => 0), usable };

  const T0 = times.get(stopIds[ref]) as number[];
  let known: { pos: number; o: number }[] = [{ pos: ref, o: 0 }];
  for (let p = ref + 1; p < n; p++) {
    if (!usable[p]) continue;
    const T = times.get(stopIds[p]) as number[];
    if (T.length !== T0.length) continue;
    const diffs = T.map((t, k) => t - T0[k]).sort((a, b) => a - b);
    const med = diffs[Math.floor(diffs.length / 2)];
    if (med < 0 || med > 180 || diffs[diffs.length - 1] - diffs[0] > 25) continue;
    known.push({ pos: p, o: med });
  }
  let last = -Infinity;
  known = known.filter((k) => { if (k.o >= last) { last = k.o; return true; } return false; });

  const slope = known.length >= 2
    ? Math.max(0.6, (known[known.length - 1].o - known[0].o) / Math.max(1, known[known.length - 1].pos - known[0].pos))
    : 1.8;
  const off = stopIds.map((_, p) => {
    if (p <= known[0].pos) return known[0].o - (known[0].pos - p) * slope;
    for (let k = 1; k < known.length; k++) {
      if (p <= known[k].pos) {
        const a = known[k - 1], b = known[k];
        return a.o + ((b.o - a.o) * (p - a.pos)) / Math.max(1, b.pos - a.pos);
      }
    }
    const l = known[known.length - 1];
    return l.o + (p - l.pos) * slope;
  });
  return { off, usable };
}

export function buildDirs(data: TransitData, day: DayType): Dir[] {
  let perDay = dirCache.get(data);
  if (!perDay) { perDay = new Map(); dirCache.set(data, perDay); }
  const cached = perDay.get(day);
  if (cached) return cached;

  const byRoute = new Map<string, TimetableEntry[]>();
  data.timetables.forEach((e) => {
    if (e.day !== day) return;
    const a = byRoute.get(e.routeId);
    if (a) a.push(e); else byRoute.set(e.routeId, [e]);
  });

  const dirs: Dir[] = [];
  data.routes.forEach((route) => {
    const entries = byRoute.get(route.id) ?? [];
    route.directions.forEach((d) => {
      if (d.stopIds.length < 2) return;
      const nt = normTitle(d.title);
      let matched = entries.filter((e) => normTitle(e.title) === nt);
      if (!matched.length) {
        const lp = lastPart(d.title);
        matched = entries.filter((e) => lastPart(e.title) === lp && d.stopIds.includes(e.stopId));
      }
      if (!matched.length) return;
      const times = new Map<string, number[]>();
      matched.forEach((e) => { if (d.stopIds.includes(e.stopId)) times.set(e.stopId, e.times); });
      if (times.size >= 2) dirs.push({ route, title: d.title, stopIds: d.stopIds, times, ...buildModel(d.stopIds, times) });
    });
  });
  perDay.set(day, dirs);
  return dirs;
}

function neighbors(data: TransitData) {
  const cached = nbCache.get(data);
  if (cached) return cached;
  const m = new Map<string, { id: string; meters: number }[]>();
  const withPos = data.stops.filter((s) => s.latitude != null);
  withPos.forEach((a) => {
    const list: { id: string; meters: number }[] = [];
    withPos.forEach((b) => {
      if (a.id === b.id) return;
      const d = distanceMeters(
        { latitude: a.latitude as number, longitude: a.longitude as number },
        { latitude: b.latitude as number, longitude: b.longitude as number }
      );
      if (d <= FOOTPATH_M) list.push({ id: b.id, meters: d });
    });
    if (list.length) m.set(a.id, list);
  });
  nbCache.set(data, m);
  return m;
}

/** Время прибытия ТОГО ЖЕ рейса на остановку j (по модели движения), уточнённое по реальному расписанию остановки */
function arrival(dir: Dir, i: number, j: number, dep: number): number | null {
  if (!dir.usable[i] || !dir.usable[j]) return null;
  const tj = dir.times.get(dir.stopIds[j]);
  if (!tj) return null;
  const expected = Math.max(dep + (dir.off[j] - dir.off[i]), dep + 0.8 * (j - i));
  const tol = Math.max(6, 0.15 * (expected - dep));
  let best: number | null = null;
  let bd = Infinity;
  for (const t of tj) {
    const d = Math.abs(t - expected);
    if (d < bd) { bd = d; best = t; }
    if (t > expected + tol) break;
  }
  if (best == null || bd > tol) return null; // этот рейс до остановки j, скорее всего, не доезжает
  return Math.max(best, dep + 1);
}

function search(data: TransitData, dirs: Dir[], origins: Origin[], depart: number, footpaths: boolean, maxRounds = 4): Label[][] {
  const nb = footpaths ? neighbors(data) : new Map<string, { id: string; meters: number }[]>();
  const tauStar = new Map<string, number>();
  let prev = new Map<string, Label>();
  origins.forEach((o) => {
    const arr = depart + o.walkMin;
    const old = prev.get(o.stopId);
    if (old && old.arr <= arr) return;
    prev.set(o.stopId, {
      arr, stopId: o.stopId, prev: null,
      leg: o.walkMin > 0 ? { kind: 'walk', fromLabel: o.label, toStopId: o.stopId, minutes: o.walkMin, meters: o.walkMeters } : null,
    });
    tauStar.set(o.stopId, arr);
  });

  const found: Label[][] = [];
  for (let round = 1; round <= maxRounds; round++) {
    const cur = new Map<string, Label>();
    for (const dir of dirs) {
      const n = dir.stopIds.length;
      for (let i = 0; i < n - 1; i++) {
        const sid = dir.stopIds[i];
        const pl = prev.get(sid);
        if (!pl) continue;
        const ti = dir.times.get(sid);
        if (!ti || !dir.usable[i]) continue;
        const ready = pl.arr + (round > 1 ? 1 : 0);
        let idx = -1;
        for (let k = 0; k < ti.length; k++) if (ti[k] >= ready) { idx = k; break; }
        if (idx < 0) continue;
        const dep = ti[idx];
        if (dep - ready > 180) continue;
        for (let j = i + 1; j < n; j++) {
          const sj = dir.stopIds[j];
          if (sj === sid) continue;
          const arr = arrival(dir, i, j, dep);
          if (arr == null) continue;
          if (arr >= (tauStar.get(sj) ?? Infinity)) continue;
          const ex = cur.get(sj);
          if (ex && ex.arr <= arr) continue;
          cur.set(sj, {
            arr, stopId: sj, prev: pl,
            leg: {
              kind: 'ride', route: dir.route, headsign: dir.title.split(' - ').pop()?.trim() ?? '',
              fromStopId: sid, toStopId: sj, stopsCount: j - i, dep, arr, pathStopIds: dir.stopIds.slice(i, j + 1), dirTitle: dir.title,
            },
          });
        }
      }
    }
    if (footpaths) {
      for (const [sid, lab] of Array.from(cur.entries())) {
        if (lab.leg?.kind === 'walk') continue;
        for (const x of nb.get(sid) ?? []) {
          const walk = Math.max(1, Math.ceil(x.meters / WALK_M_PER_MIN));
          const arr = lab.arr + walk;
          if (arr >= (tauStar.get(x.id) ?? Infinity)) continue;
          const ex = cur.get(x.id);
          if (ex && ex.arr <= arr) continue;
          cur.set(x.id, {
            arr, stopId: x.id, prev: lab,
            leg: { kind: 'walk', fromLabel: sid, toStopId: x.id, minutes: walk, meters: Math.round(x.meters) },
          });
        }
      }
    }
    cur.forEach((l, s) => tauStar.set(s, Math.min(tauStar.get(s) ?? Infinity, l.arr)));
    found.push(Array.from(cur.values()));
    if (!cur.size) break;
    prev = cur;
  }
  return found;
}

function toJourney(lab: Label, egress: Origin): Journey | null {
  const legs: Leg[] = [];
  for (let l: Label | null = lab; l; l = l.prev) if (l.leg) legs.push(l.leg);
  legs.reverse();
  const rides = legs.filter((l) => l.kind === 'ride') as Extract<Leg, { kind: 'ride' }>[];
  if (!rides.length) return null;
  const lead = legs[0].kind === 'walk' ? (legs[0] as Extract<Leg, { kind: 'walk' }>).minutes : 0;
  if (egress.walkMin > 0) {
    legs.push({ kind: 'walk', fromLabel: lab.stopId, toLabel: egress.label, minutes: egress.walkMin, meters: egress.walkMeters });
  }
  const walkMin = legs.reduce((a, l) => a + (l.kind === 'walk' ? l.minutes : 0), 0);
  const leaveAt = rides[0].dep - lead;
  const arriveAt = lab.arr + egress.walkMin;
  return { legs, leaveAt, arriveAt, totalMin: arriveAt - leaveAt, transfers: rides.length - 1, walkMin, tags: [] };
}

function collect(rounds: Label[][], dests: Map<string, Origin>): Journey[] {
  const out: Journey[] = [];
  rounds.forEach((labels) => labels.forEach((l) => {
    const d = dests.get(l.stopId);
    if (!d) return;
    const j = toJourney(l, d);
    if (j) out.push(j);
  }));
  return out;
}

const stopPt = (data: TransitData, id: string): LatLon | null => {
  const s = data.stopById.get(id);
  return s && s.latitude != null ? { latitude: s.latitude, longitude: s.longitude as number } : null;
};

/** Отсекает «объезды»: поездки в другой конец города и петли, не имеющие смысла для этой пары точек */
function plausible(data: TransitData, j: Journey, ends: { from: LatLon | null; to: LatLon | null }): boolean {
  const D = ends.from && ends.to ? distanceMeters(ends.from, ends.to) : null;
  let maxOut = 0;
  for (const l of j.legs) {
    if (l.kind !== 'ride') continue;
    const ids = l.pathStopIds ?? [l.fromStopId, l.toStopId];
    const pts = ids.map((id) => stopPt(data, id)).filter(Boolean) as LatLon[];
    if (pts.length < 2) continue;
    const straight = distanceMeters(pts[0], pts[pts.length - 1]);
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += distanceMeters(pts[k - 1], pts[k]);
    if (straight > 400 && len / straight > 3) return false;
    if (D != null && ends.from && ends.to) {
      for (const p of pts) maxOut = Math.max(maxOut, distanceMeters(ends.from, p) + distanceMeters(p, ends.to));
    }
  }
  if (D != null) {
    const limit = D < 700 ? D * 2 + 2500 : D * 2 + 1500;
    if (maxOut > limit) return false;
  }
  return true;
}

/** Меньше — лучше: время прибытия с учётом неудобства пересадок и ходьбы */
const score = (j: Journey) => j.arriveAt + 6 * j.transfers + 0.6 * j.walkMin;

const sig = (j: Journey) => j.legs.map((l) => (l.kind === 'ride' ? `${l.route.id}@${l.dep}` : 'w')).join('|');

export function planJourneys(
  data: TransitData, origins: Origin[], dests: Origin[], depart: number, day: DayType,
  direct?: { meters: number; fromLabel: string; toLabel: string },
  ends?: { from: LatLon | null; to: LatLon | null },
  allowedTypes?: readonly TransportType[],
): { journeys: Journey[]; reason?: 'no-routes' | 'not-found' } {
  let walkJ: Journey | null = null;
  if (direct && direct.meters <= 1800) {
    const min = Math.max(1, Math.ceil(direct.meters / WALK_M_PER_MIN));
    walkJ = {
      legs: [{ kind: 'walk', fromLabel: direct.fromLabel, toLabel: direct.toLabel, minutes: min, meters: Math.round(direct.meters) }],
      leaveAt: depart, arriveAt: depart + min, totalMin: min, transfers: 0, walkMin: min, tags: ['walk'],
    };
  }

  // Вид транспорта выбирается до поиска, а не после сортировки результатов:
  // маршрутки не смогут вытеснить городской транспорт из выдачи и наоборот.
  const allDirs = buildDirs(data, day);
  const dirs = allDirs.filter((dir) => !allowedTypes || allowedTypes.includes(dir.route.type));
  if (!dirs.length) {
    return {
      journeys: walkJ ? [walkJ] : [],
      reason: walkJ ? undefined : allDirs.length ? 'not-found' : 'no-routes',
    };
  }

  const destMap = new Map(dests.map((d) => [d.stopId, d]));
  // Сначала считаем варианты от БЛИЖАЙШЕЙ остановки. Остальные остановки — только как запасные варианты.
  const ordered = [...origins].sort((a, b) => a.walkMeters - b.walkMeters);
  const groups = ordered
    .map((o) => {
      const raw = [
        ...collect(search(data, dirs, [o], depart, true), destMap),
        ...collect(search(data, dirs, [o], depart, false), destMap),
      ];
      const ok = ends ? raw.filter((j) => plausible(data, j, ends)) : raw;
      return { o, list: ok.length ? ok : raw };
    })
    .filter((g) => g.list.length);
  if (!groups.length) return { journeys: walkJ ? [walkJ] : [], reason: walkJ ? undefined : 'not-found' };

  const all = groups[0].list;
  const best = [...all].sort((a, b) => score(a) - score(b) || a.arriveAt - b.arriveAt)[0];
  const fastest = best;
  const near = all.filter((j) => score(j) <= score(best) + 25);
  const fewest = [...near].sort((a, b) => a.transfers - b.transfers || score(a) - score(b))[0];
  const leastWalk = [...all.filter((j) => score(j) <= score(best) + 20)].sort((a, b) => a.walkMin - b.walkMin || score(a) - score(b))[0];

  const out = new Map<string, Journey>();
  const add = (j: Journey, tag: Journey['tags'][number]) => {
    const k = sig(j);
    const ex = out.get(k);
    if (ex) ex.tags.push(tag); else out.set(k, { ...j, tags: [tag] });
  };
  add(fastest, 'fastest');
  add(fewest, 'fewest');
  add(leastWalk, 'leastWalk');
  // запасные варианты от более дальних остановок — только если заметно выигрывают по времени
  groups.slice(1, 4).forEach((g) => {
    const alt = [...g.list].sort((a, b) => score(a) - score(b))[0];
    if (alt && score(alt) <= score(best) - 4 && !out.has(sig(alt))) out.set(sig(alt), { ...alt, tags: ['alt'] });
  });
  const list = Array.from(out.values());
  if (walkJ) {
    if (walkJ.arriveAt <= fastest.arriveAt) list.unshift(walkJ); else list.push(walkJ);
  }
  return { journeys: list };
}

/** Маршрут, который показывается на карте: сам вариант + конечные точки (для пеших участков) */
export type JourneyView = {
  journey: Journey;
  from: { latitude: number; longitude: number; title: string } | null;
  to: { latitude: number; longitude: number; title: string } | null;
  nonce: number;
};
