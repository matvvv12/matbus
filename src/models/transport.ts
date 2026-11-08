export type TransportType = 'bus' | 'trolleybus' | 'tram' | 'minibus';

export const TRANSPORT_META: Record<TransportType, { title: string; icon: string; color: string }> = {
  bus: { title: 'Автобус', icon: 'bus', color: '#FF9F0A' },
  trolleybus: { title: 'Троллейбус', icon: 'flash', color: '#0A84FF' },
  tram: { title: 'Трамвай', icon: 'train', color: '#FF453A' },
  minibus: { title: 'Маршрутка', icon: 'car', color: '#30D158' },
};

/** Биты видов транспорта у платформ (те же значения использует загрузчик данных) */
export const MODE_BIT: Record<TransportType, number> = { bus: 1, trolleybus: 2, tram: 4, minibus: 8 };
export const maskOfTypes = (t: TransportType[]) => t.reduce((a, x) => a | MODE_BIT[x], 0);
export const typesOfMask = (m: number): TransportType[] =>
  (Object.keys(MODE_BIT) as TransportType[]).filter((k) => (m & MODE_BIT[k]) !== 0);
