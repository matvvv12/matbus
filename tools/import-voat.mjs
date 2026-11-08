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

// Виды транспорта по тегам OSM: 1 — автобус, 2 — троллейбус, 4 — трамвай, 0 — не указано
function modeMask(t) {
  let m = 0;
  const yes = (v) => v === 'yes';
  if (t.railway === 'tram_stop' || yes(t.tram)) m |= 4;
  if (yes(t.trolleybus)) m |= 2;
  if (yes(t.bus)) m |= 1;
  if (t.highway === 'bus_stop') {
    if (t.bus !== 'no') m |= 1;
    if (t.trolleybus !== 'no') m |= 2;
  }
  return m;
}

async function fetchOsmCoords() {
  const bb = '55.10,30.00,55.30,30.45';
  const q = `[out:json][timeout:90];(node["highway"="bus_stop"](${bb});node["railway"="tram_stop"](${bb});node["public_transport"="platform"]["name"](${bb}););out body;`;
  const txt = await get('https://overpass-api.de/api/interpreter', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q),
  });
  const byName = new Map();
  for (const el of JSON.parse(txt).elements || []) {
    const n = el.tags?.['name:ru'] || el.tags?.name;
    if (!n || el.lat == null) continue;
    const k = normName(n);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push([el.lat, el.lon, modeMask(el.tags)]);
  }
  return byName;
}

const BIT = { bus: 1, trolleybus: 2, tram: 4 };

function applyCoords(stops, coords, prevPos) {
  let withCoords = 0;
  const unmatched = [];
  for (const s of stops) {
    delete s.lat; delete s.lng; delete s.platforms;
    const list = coords?.get(normName(s.name));
    if (list?.length) {
      // оставляем только те точки OSM, где останавливается транспорт этой остановки (трамвайные не попадают на автобусные)
      const stopMask = (s.types || []).reduce((a, t) => a | (BIT[t] || 0), 0);
      let usable = list.filter(([, , m]) => !m || (m & stopMask));
      if (!usable.length) usable = list;
      // склеиваем только точные дубли (менее ~8 м): знак + платформа + stop_position в одном месте
      const pts = [];
      for (const [la, lo, m] of usable) {
        const hit = pts.find((p) => Math.abs(p[0] - la) < 0.00007 && Math.abs(p[1] - lo) < 0.00013);
        if (hit) { hit[2] |= m; continue; }
        pts.push([+la.toFixed(6), +lo.toFixed(6), m]);
      }
      s.platforms = pts.slice(0, 8);
      s.lat = pts.reduce((a, c) => a + c[0], 0) / pts.length;
      s.lng = pts.reduce((a, c) => a + c[1], 0) / pts.length;
    } else if (prevPos?.get(String(s.id))?.lat != null) {
      const o = prevPos.get(String(s.id));
      s.lat = o.lat; s.lng = o.lng; if (o.platforms) s.platforms = o.platforms;
    }
    if (s.lat != null) withCoords++; else unmatched.push(s.name);
  }
  return { withCoords, unmatched };
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
    console.log('Координаты из OpenStreetMap…');
    const coords = await fetchOsmCoords();
    const r = applyCoords(prev.stops, coords, null);
    fs.writeFileSync(OUT, JSON.stringify(prev), 'utf8');
    fs.writeFileSync('tools/report.txt', `Остановок: ${prev.stops.length}\nС координатами: ${r.withCoords}\nБез координат (${r.unmatched.length}):\n${r.unmatched.join('\n')}\n`, 'utf8');
    console.log(`Готово: с координатами ${r.withCoords} из ${prev.stops.length}. Платформ (обе стороны) сохранены.`);
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
    meta: { source: 'ОАО «Витебскоблавтотранс» · raspis.voat.by', coordsSource: args.coords ? 'OpenStreetMap' : 'как раньше', fetchedAt: new Date().toISOString(), days },
    stops, routes: routes.length ? routes : prev.routes || [], timetables: [...keepOld, ...timetables],
  };
  fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');
  fs.writeFileSync('tools/report.txt',
    `Остановок: ${stops.length}\nС координатами: ${withCoords}\nБез координат (${unmatched.length}):\n${unmatched.join('\n')}\n\nИмена из маршрутов, не найденные среди остановок (${unresolved.size}):\n${[...unresolved].join('\n')}\n`, 'utf8');
  console.log(`Готово: остановок ${stops.length}, с координатами ${withCoords}, расписаний ${timetables.length} (день ${DAY}), маршрутов ${routes.length}.`);
  console.log('Подробности: tools/report.txt. Теперь перезапустите npx expo start --web --clear');
}
main().catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1); });
