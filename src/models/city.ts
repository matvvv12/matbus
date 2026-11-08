export type City = {
  id: string;
  name: string;
  center: { latitude: number; longitude: number };
  bbox: [number, number, number, number]; // west, south, east, north
};

export const VITEBSK: City = {
  id: 'vitebsk',
  name: 'Витебск',
  center: { latitude: 55.1904, longitude: 30.2049 },
  bbox: [30.12, 55.15, 30.29, 55.23],
};
