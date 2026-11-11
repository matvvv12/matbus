import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/data/vitebsk.json');
if (!fs.existsSync(file)) {
  console.error('Не найден src/data/vitebsk.json');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const stops = Array.isArray(data.stops) ? data.stops : [];
const routes = Array.isArray(data.routes) ? data.routes : [];
const timetables = Array.isArray(data.timetables) ? data.timetables : [];
const rawPlatformCount = stops.reduce((sum, stop) => sum + (stop.platforms || []).length, 0);
const dedupedPlatformCount = stops.reduce((sum, stop) => {
  const merged = [];
  for (const point of stop.platforms || []) {
    const candidate = { latitude: point[0], longitude: point[1], modes: point[2] || 0 };
    const distance = (a, b) => Math.hypot(
      (a.latitude - b.latitude) * 110540,
      (a.longitude - b.longitude) * 111320 * Math.cos(a.latitude * Math.PI / 180)
    );
    const hit = merged.find((item) => distance(item, candidate) <= 12);
    if (!hit) {
      merged.push({ ...candidate, count: 1 });
      continue;
    }
    hit.count += 1;
    hit.latitude += (candidate.latitude - hit.latitude) / hit.count;
    hit.longitude += (candidate.longitude - hit.longitude) / hit.count;
    hit.modes |= candidate.modes;
  }
  return sum + merged.length;
}, 0);
const stopIds = new Set();
const routeIds = new Set();
const errors = [];
const missingCoords = [];
const stopTypes = new Map();

for (const stop of stops) {
  const id = String(stop.id);
  if (stopIds.has(id)) errors.push(`Дублируется ID остановки: ${id}`);
  stopIds.add(id);
  (stop.types || []).forEach((type) => {
    if (!stopTypes.has(type)) stopTypes.set(type, 0);
    stopTypes.set(type, stopTypes.get(type) + 1);
  });

  const validPair = Number.isFinite(stop.lat) && Number.isFinite(stop.lng);
  if (validPair) {
    if (stop.lat < 54 || stop.lat > 56 || stop.lng < 29 || stop.lng > 31) {
      errors.push(`Координаты остановки вне контрольного диапазона Витебской области: ${stop.name} (${stop.lat}, ${stop.lng})`);
    }
  } else {
    missingCoords.push(stop.name);
    if (stop.lat != null || stop.lng != null) errors.push(`Неполная пара координат у остановки: ${stop.name}`);
  }

  for (const point of stop.platforms || []) {
    if (!Array.isArray(point) || point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      errors.push(`Некорректная платформа у остановки: ${stop.name}`);
      continue;
    }
    if (point[0] < 54 || point[0] > 56 || point[1] < 29 || point[1] > 31) {
      errors.push(`Координаты платформы вне контрольного диапазона: ${stop.name}`);
    }
  }
}

for (const route of routes) {
  if (routeIds.has(route.id)) errors.push(`Дублируется ID маршрута: ${route.id}`);
  routeIds.add(route.id);
  for (const direction of route.directions || []) {
    for (const stopId of direction.stopIds || []) {
      if (!stopIds.has(String(stopId))) errors.push(`Маршрут ${route.number} ссылается на неизвестную остановку ${stopId}`);
    }
  }
}

for (const entry of timetables) {
  if (!stopIds.has(String(entry.stopId))) errors.push(`Расписание ссылается на неизвестную остановку ${entry.stopId}`);
  if (!routeIds.has(entry.routeId)) errors.push(`Расписание ссылается на неизвестный маршрут ${entry.routeId}`);
  if (!Array.isArray(entry.times) || entry.times.some((t) => !Number.isFinite(t) || t < 0)) {
    errors.push(`Некорректные времена у ${entry.routeId} на остановке ${entry.stopId}`);
  }
}

const routeTypeCounts = routes.reduce((acc, route) => {
  acc[route.type] = (acc[route.type] || 0) + 1;
  return acc;
}, {});
const modeLabels = { bus: 'автобусных', trolleybus: 'троллейбусных', tram: 'трамвайных', minibus: 'маршрутных' };

console.log(`Источник: ${data.meta?.source || 'не указан'}`);
console.log(`Снимок данных: ${data.meta?.fetchedAt || 'не указан'}`);
console.log(`Остановок: ${stops.length} (${stops.length - missingCoords.length} с координатами, ${missingCoords.length} без координат)`);
console.log(`Маршрутов: ${routes.length} (${Object.entries(routeTypeCounts).map(([type, count]) => `${count} ${modeLabels[type] || type}`).join(', ')})`);
console.log(`Записей расписания: ${timetables.length}`);
console.log(`Точек платформ: ${rawPlatformCount}; после объединения дублей в радиусе 12 м: ${dedupedPlatformCount}`);
console.log(`Типы, отмеченные в остановках: ${Array.from(stopTypes, ([type, count]) => `${type}: ${count}`).join(', ')}`);
if (missingCoords.length) {
  console.log('\nОстановки без проверенных координат (остаются в поиске и расписании):');
  missingCoords.forEach((name) => console.log(`  • ${name}`));
}
if (errors.length) {
  console.error(`\nОшибки структуры данных: ${errors.length}`);
  errors.slice(0, 50).forEach((error) => console.error(`  ✕ ${error}`));
  process.exit(1);
}
console.log('\nСтруктурная проверка пройдена. Отсутствующие координаты указаны отдельно и не подменяются догадками.');
