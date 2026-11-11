import fs from 'node:fs';
import path from 'node:path';

const DATA_FILE = path.resolve('src/data/vitebsk.json');
const APPLY = process.argv.includes('--apply');
const REPORT_FILE = path.resolve('tools/osm-coordinate-candidates.json');
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!fs.existsSync(DATA_FILE)) {
  console.error('Не найден src/data/vitebsk.json. Запустите команду из корня matbus.');
  process.exit(1);
}

function normalizeName(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/ё/g, 'е')
    .replace(/^\s*(?:остановка\s+)?(?:ул\.?|улица)\s+/u, '')
    .replace(/^\s*ост\.?\s*/u, '')
    .replace(/[^a-zа-я0-9]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function metres(a, b) {
  const lat = (a.lat + b.lat) / 2;
  return Math.hypot(
    (a.lat - b.lat) * 110540,
    (a.lng - b.lng) * 111320 * Math.cos(lat * Math.PI / 180),
  );
}

function clusterFeatures(features, radius = 80) {
  const clusters = [];
  for (const feature of features) {
    const hits = clusters.filter((cluster) =>
      cluster.some((candidate) => metres(feature, candidate) <= radius)
    );
    hits.forEach((hit) => clusters.splice(clusters.indexOf(hit), 1));
    clusters.push([feature, ...hits.flat()]);
  }
  return clusters;
}

function dedupePlatforms(features) {
  const points = [];
  for (const feature of features) {
    const hit = points.find((point) => metres(point, feature) <= 12);
    if (hit) {
      hit.modes |= feature.modes;
    } else {
      points.push({ lat: feature.lat, lng: feature.lng, modes: feature.modes });
    }
  }
  return points;
}

async function fetchOverpass() {
  const query = [
    '[out:json][timeout:90];',
    'area["name"="Витебск"]["boundary"="administrative"]->.vitebsk;',
    '(',
    '  node["name"]["public_transport"="platform"](area.vitebsk);',
    '  node["name"]["highway"="bus_stop"](area.vitebsk);',
    '  way["name"]["public_transport"="platform"](area.vitebsk);',
    ');',
    'out center tags;',
  ].join('\n');

  let lastError;
  for (const endpoint of ENDPOINTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(100000),
        });
        if (!response.ok) throw new Error('Overpass HTTP ' + response.status);
        const payload = await response.json();
        if (!Array.isArray(payload.elements)) throw new Error('Overpass вернул неожиданный формат');
        return payload.elements;
      } catch (error) {
        lastError = error;
        await wait(1500 * (attempt + 1));
      }
    }
  }
  throw lastError || new Error('Не удалось получить данные OpenStreetMap');
}

function toFeature(element) {
  const tags = element.tags || {};
  const lat = Number(element.lat ?? element.center?.lat);
  const lng = Number(element.lon ?? element.center?.lon);
  if (!tags.name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let modes = 0;
  if (tags.bus === 'yes' || tags.highway === 'bus_stop') modes |= 1;
  if (tags.trolleybus === 'yes') modes |= 2;
  if (tags.tram === 'yes') modes |= 4;
  return { name: String(tags.name), key: normalizeName(tags.name), lat, lng, modes };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const missing = (data.stops || []).filter((stop) =>
    !Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)
  );
  console.log('Остановок без координат: ' + missing.length);
  if (!missing.length) {
    console.log('Все остановки уже имеют координаты.');
    return;
  }

  console.log('Запрашиваю платформы OpenStreetMap для Витебска…');
  const elements = await fetchOverpass();
  const features = elements.map(toFeature).filter(Boolean);
  const byName = new Map();
  for (const feature of features) {
    if (!feature.key) continue;
    if (!byName.has(feature.key)) byName.set(feature.key, []);
    byName.get(feature.key).push(feature);
  }

  const candidates = [];
  const unmatched = [];
  const ambiguous = [];
  for (const stop of missing) {
    const matches = byName.get(normalizeName(stop.name)) || [];
    if (!matches.length) {
      unmatched.push({ id: String(stop.id), name: stop.name });
      continue;
    }
    const clusters = clusterFeatures(matches);
    if (clusters.length !== 1) {
      ambiguous.push({
        id: String(stop.id), name: stop.name,
        clusters: clusters.map((cluster) => ({
          count: cluster.length,
          points: cluster.map((point) => [point.lat, point.lng]),
        })),
      });
      continue;
    }
    const platforms = dedupePlatforms(clusters[0]);
    const lat = platforms.reduce((sum, point) => sum + point.lat, 0) / platforms.length;
    const lng = platforms.reduce((sum, point) => sum + point.lng, 0) / platforms.length;
    candidates.push({
      id: String(stop.id), name: stop.name, lat, lng,
      platforms: platforms.map((point) => [point.lat, point.lng, point.modes]),
      matchedOsmNames: [...new Set(matches.map((point) => point.name))],
      featureCount: matches.length,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: 'OpenStreetMap Overpass API',
    license: 'OpenStreetMap contributors, ODbL 1.0',
    totals: {
      missingBefore: missing.length,
      featuresDownloaded: features.length,
      safeMatches: candidates.length,
      ambiguous: ambiguous.length,
      unmatched: unmatched.length,
    },
    candidates,
    ambiguous,
    unmatched,
  };
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');

  console.log('Совпадений с одной группой платформ: ' + candidates.length);
  console.log('Неоднозначных совпадений (не применяются автоматически): ' + ambiguous.length);
  console.log('Не найдено: ' + unmatched.length);
  console.log('Отчёт: tools/osm-coordinate-candidates.json');

  if (APPLY) {
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    let updated = 0;
    for (const stop of data.stops || []) {
      const candidate = byId.get(String(stop.id));
      if (!candidate) continue;
      stop.lat = candidate.lat;
      stop.lng = candidate.lng;
      stop.platforms = candidate.platforms;
      updated++;
    }
    data.meta = data.meta || {};
    data.meta.coordsSource = 'OpenStreetMap contributors · Overpass API';
    data.meta.coordsUpdatedAt = new Date().toISOString();
    data.meta.osmAttribution = '© OpenStreetMap contributors · ODbL 1.0';
    fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf8');
    console.log('Применено координат: ' + updated);
  } else {
    console.log('Режим предпросмотра: vitebsk.json не изменён. Для записи уникальных совпадений используйте --apply.');
  }
}

main().catch((error) => {
  console.error('Ошибка обогащения координат:', error.message);
  process.exit(1);
});
