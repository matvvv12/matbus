export type ThemeKey =
  | 'blue' | 'purple' | 'pink' | 'red' | 'orange' | 'green' | 'cyan' | 'graphite' | 'white';

/** accent — основной цвет свечения; secondary — тот же оттенок, но темнее (без смены тона, чтобы не было «радужных» градиентов) */
export type Palette = { title: string; accent: string; secondary: string; onAccent: string };

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
const mk = (title: string, accent: string, onAccent = '#FFFFFF'): Palette => ({
  title, accent, secondary: shade(accent, 0.6), onAccent,
});

export const PALETTES: Record<ThemeKey, Palette> = {
  blue: mk('Синяя', '#3D8BFF'),
  purple: mk('Фиолетовая', '#B14CFF'),
  pink: mk('Розовая', '#FF4FA3'),
  red: mk('Красная', '#FF4D4D'),
  orange: mk('Оранжевая', '#FF9A3D'),
  green: mk('Зелёная', '#34D17A'),
  cyan: mk('Бирюзовая', '#2BD4E8', '#001018'),
  graphite: mk('Графит', '#9AA0AD', '#000000'),
  white: mk('Белая', '#EDEDF2', '#000000'),
};

/** В светлой теме почти белые/серые акценты невидимы, поэтому затемняем */
export function paletteFor(key: ThemeKey, scheme: 'dark' | 'light'): Palette {
  const p = PALETTES[key];
  if (scheme === 'dark') return p;
  if (key === 'white') return { ...p, accent: '#3C3C46', secondary: '#22222A', onAccent: '#FFFFFF' };
  if (key === 'graphite') return { ...p, accent: '#6B7280', secondary: '#4B5563', onAccent: '#FFFFFF' };
  return p;
}

export const THEME_KEYS = Object.keys(PALETTES) as ThemeKey[];

export type Mode = 'system' | 'light' | 'dark';
export const MODES: { key: Mode; title: string }[] = [
  { key: 'system', title: 'Авто' },
  { key: 'light', title: 'Светлая' },
  { key: 'dark', title: 'Тёмная' },
];

export const INTENSITY_LEVELS: { value: number; title: string }[] = [
  { value: 0.2, title: 'Слабая' },
  { value: 0.45, title: 'Средняя' },
  { value: 0.7, title: 'Сильная' },
  { value: 1, title: 'Макс' },
];

export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
  return hex + a;
}
