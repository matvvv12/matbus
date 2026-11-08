// Привязка линии маршрута к дорогам через OSRM (публичный демо-сервер, нужен интернет).
// Для каждой остановки передаётся направление движения (по соседним остановкам маршрута), поэтому линия
// садится на дорогу «своей» стороны и не делает разворотов. Отрезок, который всё равно получился
// заметно длиннее прямой, рисуется прямой линией между остановками.
type LL = [number, number];

function distM(a: LL, b: LL): number {
  const dy = (a[0] - b[0]) * 110540;
  const dx = (a[1] - b[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

function bearing(a: LL, b: LL): number {
  const y = (b[1] - a[1]) * Math.cos((a[0] * Math.PI) / 180);
  const x = b[0] - a[0];
  return (Math.round((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

async function ask(url: string): Promise<any | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    return j?.code === 'Ok' ? j : null;
  } catch {
    return null;
  }
}

export async function snapToRoad(pts: LL[]): Promise<LL[] | null> {
  if (pts.length < 2 || pts.length > 90) return null;
  const coords = pts.map((p) => `${p[1].toFixed(6)},${p[0].toFixed(6)}`).join(';');
  const bears = pts
    .map((_, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      return distM(a, b) < 6 ? '0,180' : `${bearing(a, b)},75`;
    })
    .join(';');
  const base = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false&steps=true&geometries=geojson&continue_straight=true`;
  const radii = pts.map(() => '70').join(';');

  const j = (await ask(`${base}&bearings=${bears}&radiuses=${radii}`)) ?? (await ask(`${base}&bearings=${bears}`)) ?? (await ask(base));
  const legs: any[] | undefined = j?.routes?.[0]?.legs;
  if (!legs || legs.length !== pts.length - 1) return null;

  const out: LL[] = [];
  legs.forEach((leg, i) => {
    const a = pts[i], b = pts[i + 1];
    const straight = distM(a, b);
    const seg: LL[] = (leg.steps ?? []).flatMap((st: any) =>
      (st.geometry?.coordinates ?? []).map(([lo, la]: number[]) => [la, lo] as LL));
    const ok = seg.length >= 2 && leg.distance <= Math.max(straight * 1.8, straight + 130);
    const use: LL[] = ok ? seg : [a, b];
    use.forEach((p, k) => {
      if (out.length && k === 0 && distM(out[out.length - 1], p) < 3) return;
      out.push(p);
    });
  });
  return out.length >= 2 ? out : null;
}
