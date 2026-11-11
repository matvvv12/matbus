import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/data/vitebsk.json');
if (!fs.existsSync(file)) {
  console.error('Не найден src/data/vitebsk.json. Запустите команду из корня matbus.');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const stops = Array.isArray(data.stops) ? data.stops : [];
const routes = Array.isArray(data.routes) ? data.routes : [];
const timetables = Array.isArray(data.timetables) ? data.timetables : [];
const validTypes = new Set(['bus', 'trolleybus', 'tram', 'minibus']);
const validDays = new Set(['weekday', 'saturday', 'sunday']);
const errors = [];
const warnings = [];
const bySourceId = new Map();
const routeById = new Map();
const normalizeId = (value) => String(value ?? '').trim();
const normalizeName = (value) => String(value ?? '').toLowerCase().replace(/ё/g, 'е')
  .replace(/^\s*(?:ул\.?|улица)\s+/u, '')
  .replace(/[^a-zа-я0-9]+/gu, ' ').trim().replace(/\s+/g, ' ');

const distance = (a, b) => {
  const lat = (a.latitude + b.latitude) / 2;
  return Math.hypot(
    (a.latitude - b.latitude) * 110540,
    (a.longitude - b.longitude) * 111320 * Math.cos(lat * Math.PI / 180),
  );
};
const platformPoints = (stop) => (stop.platforms || [])
  .filter((point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]))
  .map((point) => ({ latitude: point[0], longitude: point[1] }));

function samePlatformFootprint(a, b) {
  const left = platformPoints(a);
  const right = platformPoints(b);
  if (!left.length || !right.length) return false;
  const matches = (x, y) => x.filter((point) => y.some((candidate) => distance(point, candidate) <= 4)).length;
  const matched = Math.min(matches(left, right), matches(right, left));
  return matched / Math.max(left.length, right.length) >= 0.8;
}

// Same stop name + centre + platform footprint is a feed duplicate, not two stops.
const duplicateGroups = [];
const groups = [];
for (const stop of stops) {
  const id = normalizeId(stop.id);
  if (!id) errors.push(`Пустой ID остановки: ${stop.name}`);
  if (bySourceId.has(id)) errors.push(`Повтор ID остановки ${id}: ${stop.name}`);
  bySourceId.set(id, stop);

  const name = normalizeName(stop.name);
  const group = groups.find((candidate) => {
    const other = candidate[0];
    if (!name || name !== normalizeName(other.name)) return false;
    if (![stop.lat, stop.lng, other.lat, other.lng].every(Number.isFinite)) return false;
    const a = { latitude: stop.lat, longitude: stop.lng };
    const b = { latitude: other.lat, longitude: other.lng };
    return distance(a, b) <= 5 && samePlatformFootprint(stop, other);
  });
  if (group) group.push(stop);
  else groups.push([stop]);
}
for (const group of groups) if (group.length > 1) duplicateGroups.push(group);

const canonicalBySourceId = new Map();
for (const group of groups) {
  const canonical = group[0];
  for (const stop of group) canonicalBySourceId.set(normalizeId(stop.id), normalizeId(canonical.id));
}
const canonicalId = (id) => canonicalBySourceId.get(normalizeId(id)) ?? normalizeId(id);
const canonicalStopIds = new Set(groups.map((group) => normalizeId(group[0].id)));
const routeTypesByStop = new Map();
const routeIdsByStop = new Map();
let emptyDirections = 0;
let unknownRouteStopReferences = 0;
let rawAdjacentDuplicateStopReferences = 0;
let aliasAdjacentDuplicateStopReferences = 0;

for (const route of routes) {
  const routeId = normalizeId(route.id);
  if (!routeId) errors.push(`Пустой ID маршрута: ${route.number}`);
  if (routeById.has(routeId)) errors.push(`Повтор ID маршрута: ${routeId}`);
  routeById.set(routeId, route);
  if (!validTypes.has(route.type)) errors.push(`Неизвестный тип транспорта у маршрута ${route.number}: ${route.type}`);

  for (const direction of route.directions || []) {
    const rawIds = direction.stopIds || [];
    const ids = rawIds.map(canonicalId);
    if (!ids.length) emptyDirections++;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (i > 0 && ids[i] === ids[i - 1]) {
        // Existing repeated IDs are source-data warnings; only a newly collapsed
        // pair of different source IDs indicates an unsafe alias merge.
        if (normalizeId(rawIds[i]) === normalizeId(rawIds[i - 1])) rawAdjacentDuplicateStopReferences++;
        else aliasAdjacentDuplicateStopReferences++;
        continue;
      }
      if (!canonicalStopIds.has(id)) {
        errors.push(`Маршрут ${route.number} ссылается на неизвестную остановку ${direction.stopIds[i]}`);
        unknownRouteStopReferences++;
        continue;
      }
      if (i > 0 && ids[i] === ids[i - 1]) {
        adjacentDuplicateStopReferences++;
        continue;
      }
      if (!routeTypesByStop.has(id)) routeTypesByStop.set(id, new Set());
      routeTypesByStop.get(id).add(route.type);
      if (!routeIdsByStop.has(id)) routeIdsByStop.set(id, new Set());
      routeIdsByStop.get(id).add(routeId);
    }
  }
}

const missingTypes = [];
const invalidCoordinates = [];
const duplicateNames = new Map();
for (const stop of groups.map((group) => group[0])) {
  const id = normalizeId(stop.id);
  const name = normalizeName(stop.name);
  if (!duplicateNames.has(name)) duplicateNames.set(name, []);
  duplicateNames.get(name).push(stop);
  const missing = [...(routeTypesByStop.get(id) || [])].filter((type) => !(stop.types || []).includes(type));
  if (missing.length) missingTypes.push(`${stop.name} [${id}]: ${missing.join(', ')}`);
  if (stop.lat != null || stop.lng != null) {
    if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) {
      invalidCoordinates.push(`${stop.name} [${id}]: неполная пара координат`);
    } else if (stop.lat < 54 || stop.lat > 56 || stop.lng < 29 || stop.lng > 31) {
      invalidCoordinates.push(`${stop.name} [${id}]: координаты вне Витебска (${stop.lat}, ${stop.lng})`);
    }
  }
}
const ambiguousSameName = [...duplicateNames.entries()]
  .filter(([name, same]) => name && same.length > 1)
  .map(([name, same]) => `${name}: ${same.map((stop) => `${stop.name} [${stop.id}]`).join(' | ')}`);

const timetableWithoutRoute = [];
const timetableWithoutStop = [];
const routeStopWithoutTimetable = [];
const unknownDays = [];
const invalidTimes = [];
const timetableByStopRoute = new Set();
for (const entry of timetables) {
  const stopId = canonicalId(entry.stopId);
  const routeId = normalizeId(entry.routeId);
  if (!bySourceId.has(normalizeId(entry.stopId))) timetableWithoutStop.push(entry);
  if (!routeById.has(routeId)) timetableWithoutRoute.push(entry);
  if (!validDays.has(entry.day)) unknownDays.push(entry);
  if (!Array.isArray(entry.times) || entry.times.some((time) => !Number.isFinite(time) || time < 0)) invalidTimes.push(entry);
  timetableByStopRoute.add(`${stopId}|${routeId}`);
}
for (const [stopId, routeIds] of routeIdsByStop) {
  for (const routeId of routeIds) {
    if (!timetableByStopRoute.has(`${stopId}|${routeId}`)) routeStopWithoutTimetable.push(`${stopId} → ${routeId}`);
  }
}

const coordinatesAvailable = groups.map((group) => group[0]).filter((stop) =>
  Number.isFinite(stop.lat) && Number.isFinite(stop.lng)
).length;
const routeTypeCounts = routes.reduce((acc, route) => {
  acc[route.type] = (acc[route.type] || 0) + 1;
  return acc;
}, {});
const typeLabels = { bus: 'автобусов', trolleybus: 'троллейбусов', tram: 'трамваев', minibus: 'маршруток' };

const report = [
  'MATBUS · ЦЕЛОСТНОСТЬ ТРАНСПОРТНЫХ ДАННЫХ',
  `Источник остановок и расписаний: ${data.meta?.source || 'не указан'}`,
  `Снимок данных: ${data.meta?.fetchedAt || 'не указан'}`,
  `Сырых записей остановок: ${stops.length}`,
  `Физических остановок после безопасного объединения дублей: ${groups.length}`,
  `Подтверждённых групп дублей: ${duplicateGroups.length}`,
  `Маршрутов: ${routes.length} (${Object.entries(routeTypeCounts).map(([type, count]) => `${count} ${typeLabels[type] || type}`).join(', ')})`,
  `Записей расписания: ${timetables.length}`,
  `Остановок с координатами: ${coordinatesAvailable}/${groups.length}`,
  '',
  'ПОДТВЕРЖДЁННЫЕ ДУБЛИ ОСТАНОВОК:',
  ...(duplicateGroups.length ? duplicateGroups.map((group) => group.map((stop) => `${stop.name} [${stop.id}]`).join(' = ')) : ['нет']),
  '',
  'ОДИНАКОВЫЕ НАЗВАНИЯ, КОТОРЫЕ НЕЛЬЗЯ АВТОМАТИЧЕСКИ СКЛЕИВАТЬ:',
  ...(ambiguousSameName.length ? ambiguousSameName : ['нет']),
  '',
  'ОСТАНОВКИ БЕЗ КООРДИНАТ:',
  ...groups.map((group) => group[0]).filter((stop) => !Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)).map((stop) => `${stop.name} [${stop.id}]`),
  '',
  'ТИПЫ ТРАНСПОРТА, ОТСУТСТВУЮЩИЕ В КАТАЛОГЕ ОСТАНОВКИ:',
  ...(missingTypes.length ? missingTypes : ['нет']),
  '',
  'МАРШРУТНЫЕ ОСТАНОВКИ БЕЗ РАСПИСАНИЯ:',
  ...(routeStopWithoutTimetable.length ? routeStopWithoutTimetable : ['нет']),
  '',
  'ОШИБКИ ССЫЛОК И РАСПИСАНИЯ:',
  `маршруты с неизвестными остановками: ${unknownRouteStopReferences}`,
  `расписание без маршрута: ${timetableWithoutRoute.length}`,
  `расписание без остановки: ${timetableWithoutStop.length}`,
  `некорректные дни недели: ${unknownDays.length}`,
  `некорректные времена: ${invalidTimes.length}`,
  `пустые направления маршрутов: ${emptyDirections}`,
  `соседние повторяющиеся ID после объединения: ${adjacentDuplicateStopReferences}`,
  '',
  'НЕКОРРЕКТНЫЕ КООРДИНАТЫ:',
  ...(invalidCoordinates.length ? invalidCoordinates : ['нет']),
].join('\n');

console.log(report);
fs.writeFileSync(path.resolve('tools/audit-data-report.txt'), report, 'utf8');

const failed = errors.length || missingTypes.length || timetableWithoutRoute.length ||
  timetableWithoutStop.length || unknownDays.length || invalidTimes.length ||
  routeStopWithoutTimetable.length || invalidCoordinates.length || aliasAdjacentDuplicateStopReferences;
if (failed) {
  console.error('Проверка завершена с ошибками. Подробный отчёт: tools/audit-data-report.txt');
  process.exit(1);
}
console.log('Структурная проверка пройдена. Неоднозначные совпадения названий перечислены отдельно.');
