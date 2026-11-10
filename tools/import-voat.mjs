// Загрузка РЕАЛЬНЫХ данных Витебска с официального сайта ОАО «Витебскоблавтотранс» (raspis.voat.by)
// Запуск (из папки проекта matbus):
//   node tools/import-voat.mjs --debug=51        проверка разбора одной остановки
//   node tools/import-voat.mjs --coords          полная загрузка + координаты из OpenStreetMap
//   node tools/import-voat.mjs --day=saturday    добавить расписание за другой день (запускайте в этот день)
// Ключи: --limit=N (только первые N остановок), --day=weekday|saturday|sunday (по умолчанию - день недели сегодня)
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://raspis.voat.by';
const OUT = path.resolve('src/data/vitebsk.json');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  })
);
const todayType = () => { const d = new Date().getDay(); return d === 0 ? 'sunday' : d === 6 ? 'saturday' : 'weekday'; };
const DAY = args.day || todayType();
const TYPE_RU = { 'автобус': 'bus', 'троллейбус': 'trolleybus', 'трамвай': 'tram' };
const PATH_TYPE = { bus: 'autobus', trolleybus: 'troll', tram: 'tram' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, init) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { ...init, headers: { 'User-Agent': 'MatBus-importer/0.3 (personal project)', 'Accept-Language': 'ru', ...(init?.headers || {}) } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) {
      if (i === 2) throw new Error(url + ' -> ' + e.message);
      await sleep(900);
    }
  }
}
const decodeEntities = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
const strip = (html) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const normNum = (s) => safeDecode(safeDecode(String(s))).replace(/[\s()]/g, '').toUpperCase();
const STOP_WORDS = new Set(['ул', 'улица', 'им', 'имени']);
const normName = (s) => decodeEntities(String(s)).toLowerCase().replace(/ё/g, 'е')
  .replace(/[^a-zа-я0-9]+/g, ' ').split(' ').filter((w) => w && !STOP_WORDS.has(w)).join(' ');

function htmlToLines(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr|\/ul|\/table|\/section|\/a)\b[^>]*>/gi, (m) => (/^<\/a/i.test(m) ? ' ' : '\n'))
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(text).split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

async function fetchStations() {
  const html = await get(BASE + '/station');
  fs.mkdirSync('tools', { recursive: true });
  fs.writeFileSync('tools/raw-station.html', html, 'utf8');
  const map = new Map();
  const re = /station\/(\d+)(?=["'\s>?#\\])/g;
  for (const m of html.matchAll(re)) {
    const id = m[1];
    if (map.has(id)) continue;
    const rest = html.slice(m.index + m[0].length, m.index + m[0].length + 900);
    const gt = rest.indexOf('>');
    if (gt < 0) continue;
    let inner = rest.slice(gt + 1);
    const end = inner.search(/<\/a>|station\//i);
    if (end >= 0) inner = inner.slice(0, end);
    const text = strip(inner);
    if (!text || text.length > 150) continue;
    const t = text.match(/^(.*?)\s+((?:автобус|трамвай|троллейбус)(?:,\s*(?:автобус|трамвай|троллейбус))*)$/i);
    const name = t ? t[1].trim() : text;
    const types = t ? t[2].toLowerCase().split(',').map((x) => TYPE_RU[x.trim()]).filter(Boolean) : [];
    map.set(id, { id, name, types });
  }
  if (!map.size) {
    const i = html.search(/station\/\d+/);
    console.log('   Фрагмент вокруг первой ссылки: ' + html.slice(Math.max(0, i - 150), i + 350).replace(/\s+/g, ' '));
    throw new Error('Не найден список остановок. Пришлите мне фрагмент выше.');
  }
  return [...map.values()];
}

// Разбор страницы остановки: блоки «Автобус №1 / (направление) / название / строки времени»
function parseStation(lines) {
  const out = [];
  let cur = null;
  for (const raw of lines) {
    if (/^Описание отметок/i.test(raw)) break;
    const l = raw.replace(/\([^)]*(красн|зелен|зелён|сер)[^)]*\)/gi, '').replace(/\s+/g, ' ').trim();
    const h = l.match(/^(Автобус|Троллейбус|Трамвай) №\s*(.+)$/i);
    if (h) {
      cur = { type: TYPE_RU[h[1].toLowerCase()], number: h[2].trim(), label: '', title: '', times: [] };
      out.push(cur);
      continue;
    }
    if (!cur) continue;
    if (/^(Маршрут на карте|Подробный маршрут)/.test(l)) continue;
    const lab = l.match(/^\((.+)\)$/);
    if (lab && !cur.label) { cur.label = lab[1]; continue; }
    if (cur.label && !cur.title && !/^\d/.test(l)) { cur.title = l; continue; }
    if (/^через /i.test(l)) continue;
    const m = l.match(/^(\d{2})((?: \d{2})+)$/);
    if (m) {
      const hour = +m[1];
      for (const mm of m[2].trim().split(' ')) cur.times.push((hour === 0 ? 24 : hour) * 60 + +mm);
    }
  }
  return out.filter((e) => e.times.length);
}

async function fetchRouteIndex(type) {
  const html = await get(`${BASE}/transp/${PATH_TYPE[type]}`);
  const re = new RegExp(`transp\\/${PATH_TYPE[type]}\\/([^"'\\s>\\/?#\\\\]+)(?=["'\\s>?#\\\\])`, 'g');
  return [...new Set([...html.matchAll(re)].map((m) => m[1]))];
}

async function fetchRoute(type, seg) {
  const html = await get(`${BASE}/transp/${PATH_TYPE[type]}/${seg}`);
  const linkRe = /transp\/[^"'\s>\/]+\/[^"'\s>\/]+\/\d+(?=["'\s>?#\\])/g;
  const dirs = html.split(/<h6\b[^>]*>/i).slice(1).map((p) => {
    const [head, ...tail] = p.split(/<\/h6>/i);
    const body = tail.join('');
    const names = [];
    for (const m of body.matchAll(linkRe)) {
      const rest = body.slice(m.index + m[0].length, m.index + m[0].length + 500);
      const gt = rest.indexOf('>');
      if (gt < 0) continue;
      let inner = rest.slice(gt + 1);
      const end = inner.search(/<\/a>/i);
      if (end >= 0) inner = inner.slice(0, end);
      const t = strip(inner);
      if (t) names.push(t);
    }
    return { title: strip(head), names };
  }).filter((d) => d.title && d.names.length);
  if (!dirs.length && !fetchRoute.warned) {
    fetchRoute.warned = true;
    fs.mkdirSync('tools', { recursive: true });
    fs.writeFileSync('tools/raw-route.html', html, 'utf8');
    console.log(`   Не удалось разобрать страницу маршрута ${type} ${seg}; сохранена в tools/raw-route.html`);
  }
  return dirs;
}

async function buildRoutes(nameToId) {
  const routes = [];
  const unresolved = new Set();
  for (const type of Object.keys(PATH_TYPE)) {
    let segs = [];
    try { segs = await fetchRouteIndex(type); } catch (e) { console.log('   нет списка', type, e.message); }
    console.log(`   ${type}: маршрутов ${segs.length}`);
    for (const seg of segs) {
      try {
        const dirs = await fetchRoute(type, seg);
        routes.push({
          id: `${type}-${normNum(seg)}`, type, number: safeDecode(safeDecode(seg)),
          directions: dirs.map((d) => ({
            title: d.title,
            stopIds: d.names.map((n) => { const id = nameToId.get(normName(n)); if (!id) unresolved.add(n); return id; }).filter(Boolean),
          })),
        });
      } catch (e) { if (!/404/.test(e.message)) console.log('   ошибка маршрута', type, seg, e.message); }
      await sleep(250);
    }
  }
  return { routes, unresolved };
}

// Виды транспорта по тегам OSM: 1 — автобус, 2 — троллейбус, 4 — трамвай.
// ВАЖНО: обычный highway=bus_stop сам по себе не означает trolleybus=yes.
function modeMask(t = {}) {
  let m = 0;
  const yes = (v) => String(v || '').toLowerCase() === 'yes';
  if (t.railway === 'tram_stop' || yes(t.tram)) m |= 4;
  if (yes(t.trolleybus)) m |= 2;
  if (yes(t.bus) || (t.highway === 'bus_stop' && t.bus !== 'no')) m |= 1;
  return m;
}

const NAME_TAGS = ['name:ru', 'name', 'name:be', 'official_name', 'alt_name', 'short_name', 'loc_name', 'old_name'];

async function fetchOsmCoords() {
  // Расширенная рамка включает город, промзоны и ближайшие пригородные остановки.
  const bb = '55.05,29.94,55.34,30.48';
  const q = `[out:json][timeout:120];(
` +
    `nwr["highway"="bus_stop"](${bb});
` +
    `nwr["highway"="platform"](${bb});
` +
    `nwr["railway"="tram_stop"](${bb});
` +
    `nwr["public_transport"="platform"](${bb});
` +
    `nwr["public_transport"="stop_position"](${bb});
` +
    `nwr["bus"="yes"](${bb});
` +
    `nwr["trolleybus"="yes"](${bb});
` +
    `nwr["tram"="yes"](${bb});
` +
    `);out center tags;`;
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];
  let payload = null;
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const txt = await get(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
      });
      payload = JSON.parse(txt);
      if (Array.isArray(payload.elements)) break;
      throw new Error('Overpass вернул ответ без списка elements');
    } catch (e) {
      lastError = e;
      console.log(`   источник OSM недоступен (${endpoint}): ${e.message}`);
    }
  }
  if (!payload?.elements) throw lastError || new Error('Все серверы OpenStreetMap недоступны');

  const byName = new Map();
  const seen = new Set();
  for (const el of payload.elements) {
    const tags = el.tags || {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const modes = modeMask(tags);
    const point = [+lat.toFixed(6), +lon.toFixed(6), modes];
    const entityKey = `${el.type || 'x'}:${el.id || `${lat}:${lon}`}`;
    if (seen.has(entityKey)) continue;
    seen.add(entityKey);
    const aliases = new Set();
    NAME_TAGS.forEach((tag) => {
      const raw = tags[tag];
      if (!raw) return;
      String(raw).split(/[;|]/).map((v) => v.trim()).filter(Boolean).forEach((v) => aliases.add(v));
    });
    aliases.forEach((alias) => {
      const key = normName(alias);
      if (!key) return;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(point);
    });
  }
  return byName;
}

const BIT = { bus: 1, trolleybus: 2, tram: 4 };

function platformDistanceM(a, b) {
  const lat = (a[0] + b[0]) / 2;
  const dx = (a[1] - b[1]) * 111320 * Math.cos(lat * Math.PI / 180);
  const dy = (a[0] - b[0]) * 110540;
  return Math.hypot(dx, dy);
}

function mergePlatform(target, point) {
  const hit = target.find((p) => platformDistanceM(p, point) <= 7);
  if (hit) hit[2] = (hit[2] || 0) | (point[2] || 0);
  else target.push([+point[0].toFixed(6), +point[1].toFixed(6), point[2] || 0]);
}

function choosePrimaryPlatformCluster(platforms, preferred) {
  const clusters = [];
  for (const point of platforms) {
    const hits = clusters.filter((cluster) => cluster.some((p) => platformDistanceM(p, point) <= 150));
    hits.forEach((hit) => clusters.splice(clusters.indexOf(hit), 1));
    clusters.push([point, ...hits.flat()]);
  }
  if (!clusters.length) return null;
  const center = (cluster) => [
    cluster.reduce((sum, p) => sum + p[0], 0) / cluster.length,
    cluster.reduce((sum, p) => sum + p[1], 0) / cluster.length,
  ];
  let best = clusters.sort((a, b) => b.length - a.length)[0];
  if (preferred && Number.isFinite(preferred.lat) && Number.isFinite(preferred.lng)) {
    best = clusters.reduce((chosen, cluster) => {
      const c = center(cluster), old = center(chosen);
      const dc = platformDistanceM(c, [preferred.lat, preferred.lng, 0]);
      const do_ = platformDistanceM(old, [preferred.lat, preferred.lng, 0]);
      return dc < do_ ? cluster : chosen;
    }, best);
  }
  return center(best);
}

function applyCoords(stops, coords, prevPos) {
  let withCoords = 0;
  let newlyGeocoded = 0;
  let platformCount = 0;
  const unmatched = [];
  for (const s of stops) {
    const previous = prevPos?.get(String(s.id)) || s;
    const oldPlatforms = Array.isArray(previous.platforms) ? previous.platforms : [];
    const list = coords?.get(normName(s.name)) || [];
    const stopMask = (s.types || []).reduce((a, t) => a | (BIT[t] || 0), 0);
    let usable = list.filter(([, , modes]) => !modes || !stopMask || (modes & stopMask));
    if (!usable.length) usable = list;

    // Не удаляем ранее проверенные координаты: новые данные OSM только дополняют их.
    const merged = [];
    oldPlatforms.forEach((p) => {
      if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
        mergePlatform(merged, [p[0], p[1], p[2] || 0]);
      }
    });
    usable.forEach((p) => mergePlatform(merged, p));

    if (merged.length) {
      s.platforms = merged; // без прежнего лимита в 8 платформ
      const preferred = Number.isFinite(previous.lat) && Number.isFinite(previous.lng)
        ? { lat: previous.lat, lng: previous.lng } : null;
      const primary = choosePrimaryPlatformCluster(merged, preferred);
      if (primary) { s.lat = primary[0]; s.lng = primary[1]; }
      if (usable.length) newlyGeocoded++;
    } else if (Number.isFinite(previous.lat) && Number.isFinite(previous.lng)) {
      s.lat = previous.lat;
      s.lng = previous.lng;
      if (oldPlatforms.length) s.platforms = oldPlatforms;
    } else {
      delete s.lat;
      delete s.lng;
      if (oldPlatforms.length) s.platforms = oldPlatforms;
      else delete s.platforms;
    }

    if (Number.isFinite(s.lat) && Number.isFinite(s.lng)) withCoords++;
    else unmatched.push(s.name);
    platformCount += s.platforms?.length || 0;
  }
  return { withCoords, newlyGeocoded, platformCount, unmatched };
}

async function main() {
  if (args.debug) {
    const html = await get(`${BASE}/station/${args.debug}`);
    const lines = htmlToLines(html);
    fs.mkdirSync('tools', { recursive: true });
    fs.writeFileSync(`tools/debug-${args.debug}.txt`, lines.join('\n'), 'utf8');
    const parsed = parseStation(lines);
    console.log(`Строк текста: ${lines.length}. Найдено направлений с временем: ${parsed.length}`);
    parsed.slice(0, 6).forEach((p) => console.log(` - ${p.type} ${p.number} | ${p.label} | ${p.title} | ${p.times.length} рейсов | первые: ${p.times.slice(0, 4).join(',')}`));
    console.log(`Текст страницы сохранён в tools/debug-${args.debug}.txt`);
    return;
  }

  if (args['coords-only']) {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    console.log('Координаты и дополнительные платформы из OpenStreetMap…');
    const coords = await fetchOsmCoords();
    const prevPos = new Map((prev.stops || []).map((stop) => [String(stop.id), stop]));
    const r = applyCoords(prev.stops, coords, prevPos);
    prev.meta = { ...(prev.meta || {}), coordsSource: 'OpenStreetMap · расширенный импорт платформ', coordsUpdatedAt: new Date().toISOString() };
    fs.writeFileSync(OUT, JSON.stringify(prev), 'utf8');
    fs.writeFileSync('tools/report.txt', `Остановок: ${prev.stops.length}\nС координатами: ${r.withCoords}\nНовых остановок геокодировано: ${r.newlyGeocoded}\nВсего платформ: ${r.platformCount}\nБез координат (${r.unmatched.length}):\n${r.unmatched.join('\n')}\n`, 'utf8');
    console.log(`Готово: координаты есть у ${r.withCoords} из ${prev.stops.length}; добавлены координаты для ${r.newlyGeocoded} остановок; платформ: ${r.platformCount}.`);
    return;
  }

  if (args['routes-only']) {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    const nameToId = new Map();
    (prev.stops || []).forEach((st) => nameToId.set(normName(st.name), String(st.id)));
    console.log('Загрузка только маршрутов…');
    const { routes, unresolved } = await buildRoutes(nameToId);
    prev.routes = routes;
    fs.writeFileSync(OUT, JSON.stringify(prev), 'utf8');
    fs.writeFileSync('tools/report-routes.txt', `Маршрутов: ${routes.length}\nИмена, не найденные среди остановок (${unresolved.size}):\n${[...unresolved].join('\n')}\n`, 'utf8');
    console.log(`Готово: маршрутов ${routes.length}, направлений ${routes.reduce((a, r) => a + r.directions.length, 0)}.`);
    return;
  }

  console.log('1/5 Список остановок…');
  let stations = await fetchStations();
  if (args.limit) stations = stations.slice(0, +args.limit);
  console.log(`   остановок: ${stations.length}`);

  console.log(`2/5 Расписание на день «${DAY}» (около ${Math.ceil(stations.length * 0.4 / 60)} мин)…`);
  const timetables = [];
  for (let i = 0; i < stations.length; i++) {
    try {
      const entries = parseStation(htmlToLines(await get(`${BASE}/station/${stations[i].id}`)));
      for (const e of entries) {
        timetables.push({ stopId: stations[i].id, routeId: `${e.type}-${normNum(e.number)}`, title: e.title || e.label, day: DAY, times: e.times });
      }
    } catch (e) { if (!/404/.test(e.message)) console.log('   ошибка остановки', stations[i].id, e.message); }
    if ((i + 1) % 25 === 0) console.log(`   ${i + 1}/${stations.length}`);
    await sleep(250);
  }

  console.log('3/5 Маршруты и порядок остановок…');
  const nameToId = new Map();
  stations.forEach((st) => nameToId.set(normName(st.name), st.id));
  const { routes, unresolved } = await buildRoutes(nameToId);

  let coords = new Map();
  if (args.coords) {
    console.log('4/5 Координаты из OpenStreetMap…');
    try { coords = await fetchOsmCoords(); } catch (e) { console.log('   Overpass недоступен:', e.message); }
  } else console.log('4/5 Координаты пропущены (добавьте ключ --coords)');

  console.log('5/5 Сохранение…');
  let prev = { stops: [], timetables: [], routes: [] };
  try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {}
  const prevPos = new Map((prev.stops || []).map((s) => [String(s.id), s]));

  const stops = stations.map((st) => ({ id: st.id, name: st.name, types: st.types }));
  const { withCoords, unmatched } = applyCoords(stops, coords, prevPos);

  const keepOld = (prev.timetables || []).filter((t) => t.day !== DAY);
  const days = [...new Set([...keepOld.map((t) => t.day), DAY])];
  const out = {
    meta: { source: 'ОАО «Витебскоблавтотранс» · raspis.voat.by', coordsSource: args.coords ? 'OpenStreetMap · расширенный импорт платформ' : 'как раньше', fetchedAt: new Date().toISOString(), days },
    stops, routes: routes.length ? routes : prev.routes || [], timetables: [...keepOld, ...timetables],
  };
  fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');
  fs.writeFileSync('tools/report.txt',
    `Остановок: ${stops.length}\nС координатами: ${withCoords}\nВсего платформ: ${stops.reduce((n, st) => n + (st.platforms?.length || 0), 0)}\nБез координат (${unmatched.length}):\n${unmatched.join('\n')}\n\nИмена из маршрутов, не найденные среди остановок (${unresolved.size}):\n${[...unresolved].join('\n')}\n`, 'utf8');
  console.log(`Готово: остановок ${stops.length}, с координатами ${withCoords}, расписаний ${timetables.length} (день ${DAY}), маршрутов ${routes.length}.`);
  console.log('Подробности: tools/report.txt. Теперь перезапустите npx expo start --web --clear');
}
main().catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1); });
