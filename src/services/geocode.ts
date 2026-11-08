// Поиск адресов и мест через Nominatim (OpenStreetMap). Нужен интернет.
// Условия использования: не чаще 1 запроса в секунду, без запросов на каждую букву (экраны ждут паузу в наборе).
export type GeoResult = { title: string; subtitle: string; latitude: number; longitude: number };

const BASE = 'https://nominatim.openstreetmap.org';
const VIEWBOX = '30.00,55.30,30.45,55.10'; // Витебск и окрестности: запад, север, восток, юг
const cache = new Map<string, GeoResult[]>();
const rcache = new Map<string, string>();

function describe(item: any): { title: string; subtitle: string } {
  const a = item.address ?? {};
  const road = a.road || a.pedestrian || a.footway || a.path || a.neighbourhood || a.suburb || '';
  const street = road ? `${road}${a.house_number ? ', ' + a.house_number : ''}` : '';
  const display = String(item.display_name ?? '');
  const name = item.name && item.name !== road ? String(item.name) : '';
  const city = a.city || a.town || a.village || '';
  if (name) return { title: name, subtitle: [street, city].filter(Boolean).join(', ') };
  if (street) return { title: street, subtitle: city };
  const parts = display.split(',').map((x) => x.trim());
  return { title: parts[0] ?? '', subtitle: parts.slice(1, 3).join(', ') };
}

export async function searchAddress(q: string): Promise<GeoResult[]> {
  const key = q.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const url =
    `${BASE}/search?format=jsonv2&addressdetails=1&limit=6&accept-language=ru&countrycodes=by` +
    `&viewbox=${VIEWBOX}&bounded=1&q=${encodeURIComponent(q.trim())}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const arr: any[] = await r.json();
  const out: GeoResult[] = arr.map((it) => ({ ...describe(it), latitude: parseFloat(it.lat), longitude: parseFloat(it.lon) }));
  cache.set(key, out);
  return out;
}

/** Адрес по координатам (для точки, поставленной на карте) */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const hit = rcache.get(key);
  if (hit) return hit;
  try {
    const r = await fetch(`${BASE}/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=ru&lat=${lat}&lon=${lng}`);
    if (!r.ok) return null;
    const it = await r.json();
    if (!it || it.error) return null;
    const d = describe(it);
    const text = [d.title, d.subtitle].filter(Boolean).join(', ') || null;
    if (text) rcache.set(key, text);
    return text;
  } catch {
    return null;
  }
}
