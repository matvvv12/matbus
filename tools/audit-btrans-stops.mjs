import fs from 'node:fs';
import path from 'node:path';

const DATA_FILE = path.resolve('src/data/vitebsk.json');
const INDEX_URL = 'https://vitebsk.btrans.by/ostanovka';
const BASE = 'https://vitebsk.btrans.by';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!fs.existsSync(DATA_FILE)) {
  console.error('Не найден src/data/vitebsk.json. Запустите команду из корня matbus.');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

function decode(value = '') {
  return String(value)
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}
const strip = (html = '') => decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function normalizeName(value) {
  let s = decode(value).toLowerCase().replace(/ё/g, 'е').replace(/[«»"']/g, ' ');
  s = s.replace(/\bпл\.?\s*/g, 'площадь ')
    .replace(/\bпр-т\.?\s*/g, 'проспект ')
    .replace(/\bпр\.?\s+(?=[а-я])/g, 'проспект ')
    .replace(/\bул\.?\s*/g, 'улица ')
    .replace(/\bмкр\.?\s*/g, 'микрорайон ');
  return s.replace(/^\s*улица\s+/u, '').replace(/[^a-zа-я0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function normRoute(value) { return decode(value).replace(/[\s()]/g, '').toUpperCase(); }

async function fetchText(url) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'MatBus-data-audit/1.0', 'Accept-Language': 'ru' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      last = error;
      await wait(500 * (attempt + 1));
    }
  }
  throw last;
}

function getStopLinks(html) {
  const links = new Map();
  const re = /<a\b[^>]*href=["']([^"']*\/ostanovka\/[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(re)) {
    const href = new URL(match[1], BASE).href;
    const name = strip(match[2]);
    if (name && !links.has(href)) links.set(href, name);
  }
  return [...links.entries()].map(([url, name]) => ({ url, name }));
}

function getRoutes(html) {
  const out = { bus: new Set(), trolleybus: new Set(), tram: new Set() };
  const modes = [
    ['bus', /\/(?:autobus|avtobus)\/([^/"'?#]+)/gi],
    ['trolleybus', /\/(?:trollejbus|trolleybus|troll)\/([^/"'?#]+)/gi],
    ['tram', /\/(?:tramvaj|tram|tramvay)\/([^/"'?#]+)/gi],
  ];
  for (const [type, re] of modes) {
    for (const match of html.matchAll(re)) {
      const number = normRoute(match[1]);
      if (number && number.length <= 8) out[type].add(number);
    }
  }
  return out;
}

const localByName = new Map((data.stops || []).map((stop) => [normalizeName(stop.name), stop]));
const routeById = new Map((data.routes || []).map((route) => [route.id, route]));
function localRoutes(stopId, type) {
  const result = new Set();
  for (const route of data.routes || []) {
    if (route.type !== type) continue;
    if ((route.directions || []).some((d) => (d.stopIds || []).map(String).includes(String(stopId)))) {
      result.add(normRoute(route.number));
    }
  }
  return result;
}

async function main() {
  console.log('Загружаю каталог остановок Btrans…');
  const indexHtml = await fetchText(INDEX_URL);
  const links = getStopLinks(indexHtml);
  if (!links.length) throw new Error('Не удалось извлечь ссылки на остановки из Btrans.');
  console.log(`В каталоге Btrans найдено остановок: ${links.length}`);

  const reportRows = [];
  let next = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (true) {
      const i = next++;
      if (i >= links.length) return;
      const stop = links[i];
      try {
        const html = await fetchText(stop.url);
        const routes = getRoutes(html);
        const local = localByName.get(normalizeName(stop.name));
        const row = { name: stop.name, url: stop.url, localId: local?.id ?? null, routes: {}, missingInMatBus: {}, extraInMatBus: {} };
        for (const type of ['bus', 'trolleybus', 'tram']) {
          const app = local ? localRoutes(local.id, type) : new Set();
          const reference = routes[type];
          row.routes[type] = [...reference].sort();
          row.missingInMatBus[type] = [...reference].filter((n) => !app.has(n)).sort();
          row.extraInMatBus[type] = [...app].filter((n) => !reference.has(n)).sort();
        }
        reportRows.push(row);
      } catch (error) {
        reportRows.push({ name: stop.name, url: stop.url, error: error.message });
      }
      if ((i + 1) % 40 === 0) console.log(`   обработано ${i + 1}/${links.length}`);
      await wait(100);
    }
  });
  await Promise.all(workers);
  reportRows.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const unmatched = reportRows.filter((row) => !row.localId && !row.error);
  const missing = reportRows.filter((row) => row.localId && ['bus','trolleybus','tram'].some((type) => row.missingInMatBus[type]?.length));
  const failed = reportRows.filter((row) => row.error);
  const detailed = reportRows.map((row) => {
    if (row.error) return `${row.name}: ОШИБКА ${row.error}`;
    const lines = [`${row.name} [MatBus ID: ${row.localId ?? 'НЕ НАЙДЕНА'}]`];
    for (const type of ['bus','trolleybus','tram']) {
      const ref = row.routes[type] || [];
      if (!ref.length && !(row.extraInMatBus[type] || []).length) continue;
      lines.push(`  ${type}: Btrans ${ref.join(', ') || '—'} | отсутствуют в MatBus: ${(row.missingInMatBus[type] || []).join(', ') || '—'} | лишние в MatBus: ${(row.extraInMatBus[type] || []).join(', ') || '—'}`);
    }
    return lines.join('\n');
  });
  const summary = [
    'MATBUS · СВЕРКА С ПУБЛИЧНЫМ КАТАЛОГОМ BTRANS',
    `Остановок в Btrans: ${links.length}`,
    `Не сопоставлено по нормализованному названию: ${unmatched.length}`,
    `Остановок с расхождением маршрутов: ${missing.length}`,
    `Страниц не удалось загрузить: ${failed.length}`,
    '', 'НЕСОПОСТАВЛЕННЫЕ ОСТАНОВКИ:', ...unmatched.map((r) => r.name),
    '', 'РАСХОЖДЕНИЯ И ДЕТАЛИ:', ...detailed,
  ].join('\n');
  fs.writeFileSync('tools/audit-btrans-report.txt', summary, 'utf8');
  fs.writeFileSync('tools/audit-btrans-report.json', JSON.stringify({ source: INDEX_URL, fetchedAt: new Date().toISOString(), rows: reportRows }, null, 2), 'utf8');
  console.log(`Сверка завершена. Не сопоставлено: ${unmatched.length}; расхождений маршрутов: ${missing.length}; ошибок загрузки: ${failed.length}.`);
  console.log('Отчёты: tools/audit-btrans-report.txt и tools/audit-btrans-report.json');
}

main().catch((error) => { console.error('ОШИБКА:', error.message); process.exit(1); });
