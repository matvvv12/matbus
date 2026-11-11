export type LatLng = { latitude: number; longitude: number };

export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export type StopPlatformSource = {
  latitude: number | null;
  longitude: number | null;
  platforms: LatLng[];
};

/**
 * Only return platform coordinates belonging to the stop's resolved physical
 * cluster. Original source indexes are retained for schedule/platform mapping.
 */
export function localPlatformEntries(
  stop: StopPlatformSource,
  maxDistanceMeters = 250,
): { point: LatLng; index: number }[] {
  const all = stop.platforms.map((point, index) => ({ point, index }));
  if (stop.latitude == null || stop.longitude == null) return all;
  const centre = { latitude: stop.latitude, longitude: stop.longitude };
  const local = all.filter(({ point }) => distanceMeters(centre, point) <= maxDistanceMeters);
  return local.length ? local : all;
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} м` : `${(m / 1000).toFixed(1)} км`;
}
