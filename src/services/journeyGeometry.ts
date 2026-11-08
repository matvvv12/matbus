import type { TransitData } from '../models/stop';
import { TRANSPORT_META, TransportType } from '../models/transport';
import type { JourneyView } from './router';
import { formatTime, normTitle } from './schedule';

export type LL = [number, number];
export type Bounds = [LL, LL];
export type GeoLine = { kind: 'ride' | 'walk'; type?: TransportType; pts: LL[] };
export type GeoMarker = {
  lat: number; lng: number;
  kind: 'start' | 'end' | 'board' | 'transfer' | 'alight' | 'mid';
  icon: string; title: string; sub?: string;
};
export type RouteGeometry = { lines: GeoLine[]; markers: GeoMarker[]; bounds: Bounds | null; legBounds: (Bounds | null)[] };

export function boundsOf(pts: LL[]): Bounds | null {
  if (!pts.length) return null;
  let s = 90, w = 180, n = -90, e = -180;
  pts.forEach(([la, lo]) => { s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo); });
  return [[s, w], [n, e]];
}

export function computeBounds(lines: GeoLine[], markers: GeoMarker[]): Bounds | null {
  return boundsOf([...lines.flatMap((l) => l.pts), ...markers.map((m): LL => [m.lat, m.lng])]);
}

/** Положение остановки с учётом стороны дороги для конкретного направления маршрута */
function platformPoint(data: TransitData, stopId: string, routeId: string, dirTitle?: string): LL | null {
  const stop = data.stopById.get(stopId);
  if (!stop) return null;
  if (stop.platforms.length > 1 && dirTitle) {
    const nt = normTitle(dirTitle);
    const e = (data.byStop.get(stopId) ?? []).find((x) => x.routeId === routeId && x.platform != null && normTitle(x.title) === nt);
    const p = e && e.platform != null ? stop.platforms[e.platform] : undefined;
    if (p) return [p.latitude, p.longitude];
  }
  if (stop.platforms.length >= 1) return [stop.platforms[0].latitude, stop.platforms[0].longitude];
  if (stop.latitude != null) return [stop.latitude, stop.longitude as number];
  return null;
}

const centerOf = (data: TransitData, id: string): LL | null => {
  const s = data.stopById.get(id);
  return s && s.latitude != null ? [s.latitude, s.longitude as number] : null;
};

export function buildGeometry(data: TransitData, jv: JourneyView): RouteGeometry {
  const lines: GeoLine[] = [];
  const markers: GeoMarker[] = [];
  const legBounds: (Bounds | null)[] = [];
  const j = jv.journey;
  let pos: LL | null = jv.from ? [jv.from.latitude, jv.from.longitude] : null;

  if (jv.from && pos) {
    markers.push({ lat: pos[0], lng: pos[1], kind: 'start', icon: 'start', title: jv.from.title, sub: `Выход в ${formatTime(j.leaveAt)}` });
  }

  j.legs.forEach((leg, li) => {
    const pts: LL[] = [];
    if (leg.kind === 'walk') {
      let target: LL | null = null;
      if (leg.toStopId) target = centerOf(data, leg.toStopId);
      else if (jv.to) target = [jv.to.latitude, jv.to.longitude];
      if (pos && target) {
        lines.push({ kind: 'walk', pts: [pos, target] });
        pts.push(pos, target);
      }
      if (target) pos = target;
    } else {
      const ids = leg.pathStopIds && leg.pathStopIds.length >= 2 ? leg.pathStopIds : [leg.fromStopId, leg.toStopId];
      const rp = ids.map((id) => platformPoint(data, id, leg.route.id, leg.dirTitle)).filter((p): p is LL => !!p);
      if (rp.length >= 2) lines.push({ kind: 'ride', type: leg.route.type, pts: rp });
      const meta = TRANSPORT_META[leg.route.type];
      const next = j.legs[li + 1];
      const prev = j.legs[li - 1];
      const isTransfer = prev?.kind === 'ride';
      const nameOf = (id: string) => data.stopById.get(id)?.name ?? '';
      if (rp.length) {
        markers.push({
          lat: rp[0][0], lng: rp[0][1], kind: isTransfer ? 'transfer' : 'board', icon: isTransfer ? 'transfer' : leg.route.type,
          title: `${isTransfer ? 'Пересадка · ' : ''}${formatTime(leg.dep)} · ${meta.title} ${leg.route.number}`,
          sub: nameOf(leg.fromStopId),
        });
        rp.slice(1, -1).forEach((p) => markers.push({ lat: p[0], lng: p[1], kind: 'mid', icon: 'mid', title: '' }));
        const last = rp[rp.length - 1];
        const nextIsRideSameStop = next?.kind === 'ride' && next.fromStopId === leg.toStopId;
        if (!nextIsRideSameStop) {
          markers.push({ lat: last[0], lng: last[1], kind: 'alight', icon: 'alight', title: `Выйти · ${formatTime(leg.arr)}`, sub: nameOf(leg.toStopId) });
        }
        pos = last;
        pts.push(...rp);
      }
    }
    legBounds.push(boundsOf(pts));
  });

  if (jv.to) {
    markers.push({ lat: jv.to.latitude, lng: jv.to.longitude, kind: 'end', icon: 'end', title: jv.to.title, sub: `Прибытие в ${formatTime(j.arriveAt)}` });
  }
  return { lines, markers, bounds: computeBounds(lines, markers), legBounds };
}
