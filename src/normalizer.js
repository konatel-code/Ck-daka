// Normalizér XML feedu CK Daka.
//
// Reálny feed má formát e-shopu: <SHOP><SHOPITEM>…</SHOPITEM></SHOP>,
// kde cena a termíny sú vnorené v <DATES><DATE>…</DATE></DATES>.
// Pre tento formát máme presný normalizér (normalizeShop). Pre iné/ukážkové
// XML ostáva generický fallback (findTourArray + normalizeTourGeneric).

import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  parseTagValue: true,
  cdataPropName: '__cdata',
});

// ── pomocné funkcie ────────────────────────────────────────────────────────
function deburr(s) { return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function norm(s) { return deburr(s).toLowerCase().trim(); }

function textOf(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
  if (typeof v === 'object') {
    if (v.__cdata != null) return String(v.__cdata).trim();
    if (v['#text'] != null) return String(v['#text']).trim();
    for (const k of Object.keys(v)) if (k.startsWith('@_')) return String(v[k]).trim();
  }
  return '';
}

function toNumber(s) {
  if (s == null) return null;
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  const cleaned = String(s).replace(/\s/g, '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  return cleaned ? parseFloat(cleaned[0]) : null;
}

function toDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  let m = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  m = str.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  return null;
}

function toArray(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]); }
function stripHtml(s) { return String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }

// ── odvodenie typu dovolenky / dopravy / stravy z textu ──────────────────────
const TYPE_RULES = [
  { type: 'more', re: /(pri mori|more|plaz|beach|pobrez|rivier|all\s*inclus|dovolenka pri)/ },
  { type: 'exotika', re: /(exotik|thaj|bali|maled|dominik|kub[ay]|emirat|dubaj|egypt|afrik|karib|zanzibar|mauricius|mexik|vietnam)/ },
  { type: 'hory', re: /(hor[ya]|tatr|alp|lyz|ski|treking|treck|turistik|hiking|vrch|dolomit)/ },
  { type: 'wellness', re: /(wellness|kupel|spa|termal|relax|aquapark|sauna)/ },
  { type: 'eurovikend', re: /(eurovikend|advent|silvest|1-dnov|jednodnov)/ },
  { type: 'mesto', re: /(mesto|city|metropol|poznavac|okruh|pamiatk|prehliadk|galer|histor)/ },
];
function deriveType(hay) {
  for (const r of TYPE_RULES) if (r.re.test(hay)) return r.type;
  return 'ine';
}

// typ podľa kategórií feedu (má prednosť – je najspoľahlivejší)
const CATEGORY_TYPE_RULES = [
  { type: 'wellness', re: /(wellness|kupel|relax|termal|aquapark)/ },
  { type: 'hory', re: /(lyz|hory|skipas|treking|turistik|zimn)/ },
  { type: 'exotika', re: /(exotik)/ },
  { type: 'eurovikend', re: /(eurovikend|advent|silvest)/ },
  { type: 'mesto', re: /(poznavac|poznav|okruh|mesta|metropol|kultur)/ },
  { type: 'more', re: /(pri mori|more|pobytov|leto|dovolenky pri|plavb)/ },
];
function deriveTypeFromCategory(catHay) {
  for (const r of CATEGORY_TYPE_RULES) if (r.re.test(catHay)) return r.type;
  return '';
}

// posledná pomôcka: typ podľa krajiny (prímorské → more, zámorské → exotika)
const SEA_COUNTRIES = ['grecko', 'egypt', 'turecko', 'spanielsko', 'taliansko', 'chorvatsko',
  'bulharsko', 'cyprus', 'tunisko', 'malta', 'portugalsko', 'cierna hora', 'albansko'];
const EXOTIC_COUNTRIES = ['maldivy', 'thajsko', 'dominikanska republika', 'dominikana', 'kuba',
  'dubaj', 'spojene arabske emiraty', 'emiraty', 'mexiko', 'zanzibar', 'tanzania', 'mauricius',
  'vietnam', 'bali', 'indonezia', 'srilanka', 'kapverdy'];
function guessTypeByCountry(country) {
  const c = norm(country);
  if (EXOTIC_COUNTRIES.includes(c)) return 'exotika';
  if (SEA_COUNTRIES.includes(c)) return 'more';
  return '';
}

function deriveTransport(hay) {
  if (/(letec|lietadl|charter|wizzair|ryanair|letenka)/.test(hay)) return 'letecky';
  if (/(autobus|autokar|klimatizovan)/.test(hay)) return 'autobus';
  if (/(vlastn[aá] doprav|individu)/.test(hay)) return 'vlastna';
  if (/(lod|trajekt|plavb|cruise)/.test(hay)) return 'lod';
  return '';
}

// Skutočné trvanie zájazdu v dňoch z názvu (operátor takto inzeruje).
// Feed v NIGHTS posiela len HOTELOVÉ noci – pri autobusových zájazdoch s
// nočnými presunmi to nezodpovedá reálnemu počtu dní.
const DAY_WORDS = {
  jednodnov: 1, celodenn: 1, dvojdnov: 2, trojdnov: 3, stvordnov: 4, styridnov: 4,
  patdnov: 5, sestdnov: 6, sedemdnov: 7, osemdnov: 8, devatdnov: 9, desatdnov: 10,
};
function parseDaysFromTitle(title) {
  const d = norm(title);
  const m = d.match(/(\d+)\s*-?\s*dnov/) || d.match(/(\d+)\s*dni\b/) || d.match(/(\d+)\s*dn[ií]/);
  if (m) return parseInt(m[1], 10);
  for (const [k, v] of Object.entries(DAY_WORDS)) if (d.includes(k)) return v;
  return null;
}
// počet dní z rozsahu dátumov termínu (od–do, vrátane oboch dní)
function spanDays(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return null;
  const sp = Math.round((new Date(dateTo) - new Date(dateFrom)) / 86400000) + 1;
  return sp >= 1 && sp <= 60 ? sp : null;
}
// počet dní: 1) rozsah dátumov termínu (najspoľahlivejšie, zodpovedá "X DNÍ")
//            2) počet dní z názvu  3) hotelové noci + 1
function computeDays(title, nights, dateFrom, dateTo) {
  const sp = spanDays(dateFrom, dateTo);
  if (sp != null) return sp;
  const t = parseDaysFromTitle(title);
  if (t != null) return t;
  if (nights == null) return null;
  return nights === 0 ? 1 : nights + 1;
}

function deriveBoard(hay) {
  if (/all\s*inclusive|ultra all/.test(hay)) return 'all inclusive';
  if (/pln[aá]\s*penzi|plnou penziou/.test(hay)) return 'plná penzia';
  if (/pol\s*penzi|polpenzi/.test(hay)) return 'polpenzia';
  if (/ranajk|ranaj/.test(hay)) return 'raňajky';
  if (/bez\s*strav|vlastn[aá]\s*strav/.test(hay)) return 'bez stravy';
  return '';
}

// ── normalizácia jednej položky SHOPITEM ─────────────────────────────────────
let _autoId = 0;

function normalizeShopItem(item) {
  const title = textOf(item.NAME);
  const place = textOf(item.DESTINATION);
  const description = textOf(item.DESCRIPTION);
  const image = textOf(item.IMGURL) || textOf(item.IMGURL_ALTERNATIVE);
  const url = textOf(item.URL);
  const categoryText = textOf(item.CATEGORYTEXT);
  const categoryNames = toArray(item.CATEGORIES?.CATEGORY).map((c) => textOf(c?.NAME)).join(' ');
  const priceInfo = stripHtml(textOf(item.PRICELIST_INFO));

  // termíny + ceny
  const dates = toArray(item.DATES?.DATE).map((d) => ({
    from: toDate(textOf(d.DATE_FROM)),
    to: toDate(textOf(d.DATE_TO)),
    nights: toNumber(d.NIGHTS),
    price: toNumber(d.PRICE),
    orig: toNumber(d.ORIGINAL_PRICE),
    discount: toNumber(d.DISCOUNT_PERCENT),
  })).filter((d) => d.price != null && d.price > 0);

  // reprezentatívny termín = najlacnejší (cena "od")
  let best = null;
  for (const d of dates) if (!best || d.price < best.price) best = d;

  // všetky termíny pre kalendár v detaile (zoradené podľa dátumu, orezané)
  const terms = [...dates]
    .sort((a, b) => String(a.from || '').localeCompare(String(b.from || '')))
    .slice(0, 40);

  let nights = best?.nights ?? null;
  if ((nights == null || nights === 0) && best?.from && best?.to) {
    const diff = Math.round((new Date(best.to) - new Date(best.from)) / 86400000);
    if (diff > 0 && diff < 200) nights = diff;
  }

  const dateFrom = best?.from ?? null;
  const dateTo = best?.to ?? null;
  const month = dateFrom ? parseInt(dateFrom.slice(5, 7), 10) : null;

  const hay = norm([title, place, description, categoryText, categoryNames, priceInfo].join(' '));
  const catHay = norm(categoryText + ' ' + categoryNames);
  let type = deriveTypeFromCategory(catHay) || deriveType(hay);
  if (type === 'ine') type = guessTypeByCountry(place) || 'ine';

  return {
    id: textOf(item.ITEM_ID) || textOf(item.PRODUCTNO) || `auto-${++_autoId}`,
    title: title || place || 'Zájazd CK DAKA',
    country: place,
    destination: place,
    region: '',
    price: best?.price ?? null,
    originalPrice: best?.orig ?? null,
    discount: best?.discount ?? null,
    priceFrom: dates.length > 1 || (best?.price != null),
    priceText: '',
    currency: 'EUR',
    dateFrom,
    dateTo,
    month,
    nights,
    days: computeDays(title, nights, dateFrom, dateTo),
    termsCount: dates.length,
    terms,
    transport: deriveTransport(hay),
    transportRaw: '',
    board: deriveBoard(hay),
    accommodation: '',
    type,
    category: categoryText,
    description: description || stripHtml(textOf(item.DESCRIPTION_FULL)).slice(0, 280),
    image,
    url,
    rating: null,
  };
}

// ── generický fallback (pre ukážkové/iné XML) ────────────────────────────────
function pick(obj, candidates) {
  if (!obj || typeof obj !== 'object') return '';
  const map = new Map(Object.keys(obj).map((k) => [norm(k), k]));
  for (const cand of candidates) {
    const real = map.get(norm(cand));
    if (real != null) { const t = textOf(obj[real]); if (t !== '') return t; }
  }
  for (const cand of candidates) {
    const nc = norm(cand);
    for (const [nk, real] of map) if (nk.includes(nc)) { const t = textOf(obj[real]); if (t !== '') return t; }
  }
  return '';
}

function looksLikeTour(o) {
  if (!o || typeof o !== 'object') return false;
  const keys = Object.keys(o).map(norm);
  return keys.some((k) => /(nazov|name|title|destinac|krajina|country|hotel)/.test(k)) &&
         keys.some((k) => /(cena|price|termin|datum|date|noc|night|den|day)/.test(k));
}

function findTourArray(node, best = { arr: [], score: 0 }) {
  if (Array.isArray(node)) {
    const n = node.filter(looksLikeTour).length;
    if (n > best.score) { best.arr = node; best.score = n; }
    node.forEach((x) => findTourArray(x, best));
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) findTourArray(v, best);
  }
  return best;
}

function normalizeTourGeneric(raw) {
  const title = pick(raw, ['nazov', 'name', 'title', 'hotel']);
  const country = pick(raw, ['krajina', 'country', 'stat']);
  const destination = pick(raw, ['destinacia', 'destination', 'lokalita', 'oblast', 'miesto', 'stredisko']);
  const priceRaw = pick(raw, ['cena', 'price', 'cena_od', 'cenaOd']);
  const dateFromRaw = pick(raw, ['termin_od', 'datum_od', 'datumOd', 'date_from', 'od', 'termin']);
  const dateToRaw = pick(raw, ['termin_do', 'datum_do', 'datumDo', 'date_to', 'do']);
  const nightsRaw = pick(raw, ['noci', 'pocet_noci', 'nights', 'dni', 'dlzka']);
  const transportRaw = pick(raw, ['doprava', 'transport']);
  const board = pick(raw, ['strava', 'board', 'stravovanie']);
  const accommodation = pick(raw, ['ubytovanie', 'accommodation', 'hotel', 'kategoria']);
  const description = pick(raw, ['popis', 'description', 'text', 'detail', 'anotacia']);
  const image = pick(raw, ['obrazok', 'image', 'img', 'foto', 'imageUrl']);
  const url = pick(raw, ['url', 'odkaz', 'link', 'web']);
  const typeRaw = pick(raw, ['typ', 'type', 'druh']);

  const dateFrom = toDate(dateFromRaw), dateTo = toDate(dateToRaw);
  let nights = toNumber(nightsRaw);
  if (!nights && dateFrom && dateTo) {
    const diff = Math.round((new Date(dateTo) - new Date(dateFrom)) / 86400000);
    if (diff > 0 && diff < 200) nights = diff;
  }
  const hay = norm([title, country, destination, description, typeRaw, accommodation].join(' '));

  return {
    id: pick(raw, ['id', 'kod', 'code']) || `auto-${++_autoId}`,
    title: title || destination || country || 'Zájazd CK DAKA',
    country, destination, region: '',
    price: toNumber(priceRaw), originalPrice: null, discount: null, priceFrom: false,
    priceText: priceRaw, currency: pick(raw, ['mena', 'currency']) || 'EUR',
    dateFrom, dateTo, month: dateFrom ? parseInt(dateFrom.slice(5, 7), 10) : null,
    nights: nights || null, days: computeDays(title, nights || null, dateFrom, dateTo), termsCount: dateFrom ? 1 : 0,
    terms: [],
    transport: deriveTransport(norm(transportRaw) + ' ' + hay), transportRaw,
    board: board || deriveBoard(hay), accommodation,
    type: typeRaw ? deriveType(norm(typeRaw) + ' ' + hay) : deriveType(hay),
    category: '', description, image, url, rating: toNumber(pick(raw, ['hodnotenie', 'rating'])),
  };
}

// ── verejné API ─────────────────────────────────────────────────────────────
export function parseXml(xmlString) { return parser.parse(xmlString); }

export function normalizeFeed(xmlString) {
  const parsed = parseXml(xmlString);
  const shopItems = parsed?.SHOP?.SHOPITEM;
  let tours;
  if (shopItems) {
    tours = toArray(shopItems).map(normalizeShopItem);
  } else {
    tours = findTourArray(parsed).arr.map(normalizeTourGeneric);
  }
  return tours.filter((t) => t.title);
}

export function buildFacets(tours) {
  const countries = new Set(), transports = new Set(), types = new Set(), boards = new Set();
  let priceMin = Infinity, priceMax = 0, terms = 0;
  for (const t of tours) {
    if (t.country) countries.add(t.country);
    if (t.transport) transports.add(t.transport);
    if (t.type) types.add(t.type);
    if (t.board) boards.add(t.board);
    terms += t.termsCount || 0;
    if (typeof t.price === 'number') { priceMin = Math.min(priceMin, t.price); priceMax = Math.max(priceMax, t.price); }
  }
  return {
    countries: [...countries].sort((a, b) => a.localeCompare(b, 'sk')),
    transports: [...transports].sort(),
    types: [...types].sort(),
    boards: [...boards].sort((a, b) => a.localeCompare(b, 'sk')),
    priceMin: priceMin === Infinity ? 0 : Math.floor(priceMin),
    priceMax: Math.ceil(priceMax),
    count: tours.length,
    terms,
  };
}
