import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/data/vitebsk.json');
if (!fs.existsSync(file)) {
  console.error('Не найден src/data/vitebsk.json. Запустите команду из корня matbus.');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const stops = data.stops || [];
const routes = data.routes || [];
const timetable = data.timetables || [];
const byId = new Map();
const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е')
  .replace(/[^a-zа-я0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const errors = [];
const warnings = [];
const missingCoords = [];
const missingTypes = [];
const duplicateNames = new Map();

const platformDistance = (a, b) => {
  const lat = (a[0] + b[0]) / 2;
  const dx = (a[1] - b[1]) * 111320 * Math.cos(lat * Math.PI / 180);
  const dy = (a[0] - b[0]) * 110540;
  return Math.hypot(dx, dy);
};
function platformClusters(points) {
  const clusters = [];
  for (const point of points) {
    const hits = clusters.filter((cluster) => cluster.some((p) => platformDistance(p, point) <= 150));
    hits.forEach((hit) => clusters.splice(clusters.indexOf(hit), 1));
    clusters.push([point, ...hits.flat()]);
  }
  return clusters;
}

for (const stop of stops) {
  const id = String(stop.id);
  if (byId.has(id)) errors.push(`Повтор ID остановки ${id}: ${stop.name}`);
  byId.set(id, stop);
  const key = norm(stop.name);
  if (!duplicateNames.has(key)) duplicateNames.set(key, []);
  duplicateNames.get(key).push(stop);
  if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) missingCoords.push(stop.name);
  const served = new Set(routes.filter((route) => ['bus','trolleybus','tram'].includes(route.type) &&
    (route.directions || []).some((d) => (d.stopIds || []).map(String).includes(id))).map((r) => r.type));
  const own = new Set(stop.types || []);
  const missing = [...served].filter((type) => !own.has(type));
  if (missing.length) missingTypes.push(`${stop.name} (${id}): ${missing.join(', ')}`);
}

const routeStops = new Map();
let emptyDirections = 0;
for (const route of routes) {
  for (const dir of route.directions || []) {
    if (!(dir.stopIds || []).length) emptyDirections++;
    for (const id of dir.stopIds || []) {
      if (!byId.has(String(id))) errors.push(`Маршрут ${route.type} ${route.number}: отсутствует ID остановки ${id}`);
      const key = `${id}|${route.type}`;
      routeStops.set(key, (routeStops.get(key) || 0) + 1);
    }
  }
}
const timetableWithoutRoute = timetable.filter((t) => !routes.some((r) => r.id === t.routeId));
const timetableWithoutStop = timetable.filter((t) => !byId.has(String(t.stopId)));
const trolleyStops = stops.filter((s) => (routeStops.get(`${s.id}|trolleybus`) || 0) > 0);
const trolleyWithoutTimes = trolleyStops.filter((s) => !timetable.some((t) => String(t.stopId) === String(s.id) && String(t.routeId).startsWith('trolleybus-')));
const platforms = stops.reduce((n, s) => n + (s.platforms?.length || 0), 0);
const dedupedPlatformCount = stops.reduce((sum, stop) => {
  const merged = [];
  for (const point of stop.platforms || []) {
    const candidate = { lat: point[0], lng: point[1], modes: point[2] || 0 };
    const hit = merged.find((item) => {
      const a = [(item.lat), (item.lng)];
      const b = [candidate.lat, candidate.lng];
      return platformDistance(a, b) <= 12;
    });
    if (!hit) {
      merged.push({ ...candidate, count: 1 });
      continue;
    }
    hit.count += 1;
    hit.lat += (candidate.lat - hit.lat) / hit.count;
    hit.lng += (candidate.lng - hit.lng) / hit.count;
    hit.modes |= candidate.modes;
  }
  return sum + merged.length;
}, 0);
const duplicates = [...duplicateNames.entries()].filter(([, arr]) => arr.length > 1);

console.log('=== MATBUS · АУДИТ ДАННЫХ ВИТЕБСКА ===');
console.log(`Остановок: ${stops.length}`);
console.log(`Маршрутов: ${routes.length}`);
console.log(`Записей расписания: ${timetable.length}`);
console.log(`Платформ (точек): ${platforms}`);
console.log(`После удаления дублей в радиусе 12 м: ${dedupedPlatformCount}`);
console.log(`Остановок с несколькими удалёнными группами платформ: ${multiPlatformStops.length}`);
console.log(`Платформ терял старый алгоритм: ${pointsDroppedByOldResolver}`);
console.log(`Остановок с координатами: ${stops.length - missingCoords.length}/${stops.length}`);
console.log(`Троллейбусных остановок по последовательностям маршрутов: ${trolleyStops.length}`);
console.log(`Троллейбусных остановок без строк расписания: ${trolleyWithoutTimes.length}`);
console.log(`Расписание без маршрута: ${timetableWithoutRoute.length}`);
console.log(`Расписание без остановки: ${timetableWithoutStop.length}`);
console.log(`Пустых направлений маршрутов: ${emptyDirections}`);
console.log(`Одинаковых нормализованных названий (разные ID): ${duplicates.length}`);

fs.mkdirSync('tools', { recursive: true });
const report = [
  'MATBUS · АУДИТ ДАННЫХ ВИТЕБСКА',
  `Остановок: ${stops.length}`,
  `Маршрутов: ${routes.length}`,
  `Платформ: ${platforms}`,
  `После удаления близких дублей (12 м): ${dedupedPlatformCount}`,
  `Остановок с несколькими удалёнными группами платформ: ${multiPlatformStops.length}`,
  `Платформ терял старый алгоритм: ${pointsDroppedByOldResolver}`,
  '', 'ОСТАНОВКИ С НЕСКОЛЬКИМИ ГРУППАМИ ПЛАТФОРМ:', ...multiPlatformStops.map(({ stop, clusters }) => `${stop.name} [${stop.id}]: ${stop.platforms.length} точек / ${clusters.length} групп`),
  `Остановок с координатами: ${stops.length - missingCoords.length}/${stops.length}`,
  '', 'ОСТАНОВКИ БЕЗ КООРДИНАТ:', ...missingCoords,
  '', 'ТИПЫ МАРШРУТОВ, КОТОРЫЕ НЕ УКАЗАНЫ У ОСТАНОВКИ:', ...(missingTypes.length ? missingTypes : ['нет']),
  '', 'ТРОЛЛЕЙБУСНЫЕ ОСТАНОВКИ БЕЗ РАСПИСАНИЯ:', ...(trolleyWithoutTimes.length ? trolleyWithoutTimes.map((s) => `${s.name} (${s.id})`) : ['нет']),
  '', 'ДУБЛИ НАЗВАНИЙ С РАЗНЫМИ ID:', ...duplicates.map(([name, arr]) => `${name}: ${arr.map((s) => `${s.name} [${s.id}]`).join(' | ')}`),
  '', 'ОШИБКИ ССЫЛОК:', ...(errors.length ? errors : ['нет']),
  '', `Расписание без маршрута: ${timetableWithoutRoute.length}`,
  `Расписание без остановки: ${timetableWithoutStop.length}`,
].join('\n');
fs.writeFileSync('tools/audit-vitebsk-report.txt', report, 'utf8');

if (errors.length || missingTypes.length || timetableWithoutRoute.length || timetableWithoutStop.length) {
  console.log('Проверка завершена с замечаниями. Подробный отчёт: tools/audit-vitebsk-report.txt');
} else {
  console.log('Структурные связи маршрутов и остановок корректны. Отчёт: tools/audit-vitebsk-report.txt');
}
