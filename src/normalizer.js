// Flexibilný normalizér XML feedu CK Daka.
//
// Cieľom je byť odolný voči konkrétnym názvom XML polí: reálny export sa môže
// líšiť od ukážky, preto mapujeme veľké množstvo bežných slovenských/anglických
// variantov názvov a navyše dopĺňame typ/štítky heuristicky z textu.

import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  parseTagValue: true,
  cdataPropName: '__cdata',
});

// ── pomocné funkcie ────────────────────────────────────────────────────────

function stripDiacritics(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function norm(s) {
  return stripDiacritics(String(s ?? '')).toLowerCase().trim();
}

// Z hodnoty (môže byť string, číslo, objekt s #text alebo CDATA) spraví text.
function textOf(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
  if (typeof v === 'object') {
    if (v.__cdata != null) return String(v.__cdata).trim();
    if (v['#text'] != null) return String(v['#text']).trim();
    // občas býva hodnota v atribúte
    for (const k of Object.keys(v)) {
      if (k.startsWith('@_')) return String(v[k]).trim();
    }
  }
  return '';
}

// Vyhľadá v objekte hodnotu podľa zoznamu možných (znormalizovaných) názvov.
function pick(obj, candidates) {
  if (!obj || typeof obj !== 'object') return '';
  const keys = Object.keys(obj);
  const map = new Map(keys.map((k) => [norm(k), k]));
  for (const cand of candidates) {
    const real = map.get(norm(cand));
    if (real != null) {
      const t = textOf(obj[real]);
      if (t !== '') return t;
    }
  }
  // čiastočná zhoda (kľúč obsahuje kandidáta)
  for (const cand of candidates) {
    const nc = norm(cand);
    for (const [nk, real] of map) {
      if (nk.includes(nc)) {
        const t = textOf(obj[real]);
        if (t !== '') return t;
      }
    }
  }
  return '';
}

function toNumber(s) {
  if (s == null) return null;
  const cleaned = String(s).replace(/\s/g, '').replace(/[^0-9.,-]/g, '').replace(',', '.');
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function toDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  // ISO yyyy-mm-dd
  let m = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  // dd.mm.yyyy
  m = str.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  return null;
}

// ── nájdenie zoznamu zájazdov v ľubovoľne zanorenej štruktúre ───────────────

const TOUR_CONTAINER_HINTS = ['zajazd', 'zajazdy', 'tour', 'tours', 'item', 'items',
  'offer', 'offers', 'ponuka', 'ponuky', 'product', 'products', 'trip', 'trips'];

function looksLikeTour(o) {
  if (!o || typeof o !== 'object') return false;
  const keys = Object.keys(o).map(norm);
  const hasName = keys.some((k) => /(nazov|name|title|destinac|krajina|country|hotel)/.test(k));
  const hasMeta = keys.some((k) => /(cena|price|termin|datum|date|noc|night|den|day)/.test(k));
  return hasName && hasMeta;
}

// Rekurzívne nájde najväčšie pole objektov, ktoré vyzerajú ako zájazdy.
function findTourArray(node, best = { arr: [], score: 0 }) {
  if (Array.isArray(node)) {
    const tourish = node.filter(looksLikeTour);
    if (tourish.length > best.score) {
      best.arr = node;
      best.score = tourish.length;
    }
    node.forEach((n) => findTourArray(n, best));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      // ak je to single objekt pod containerom-hintom, obal ho do poľa
      if (!Array.isArray(v) && looksLikeTour(v) && TOUR_CONTAINER_HINTS.includes(norm(k))) {
        if (1 > best.score) { best.arr = [v]; best.score = 1; }
      }
      findTourArray(v, best);
    }
  }
  return best;
}

// ── odvodenie typu dovolenky a štítkov z textu ──────────────────────────────

const TYPE_RULES = [
  { type: 'more', re: /(more|pla[zž]|beach|pobrez|riv[ie]|ostrov|all\s*inclus)/ },
  { type: 'hory', re: /(hor[ya]|tatr|alp|lyz|ski|treking|treck|turistik|hiking|vrch)/ },
  { type: 'mesto', re: /(mesto|city|metropol|poznavac|okruh|pamiatk|advent)/ },
  { type: 'exotika', re: /(exotik|thaj|bali|maled|dominik|kuba|emir[aá]t|dubaj|egypt|afrik|kara[ib])/ },
  { type: 'wellness', re: /(wellness|kupel|spa|termal|relax|aquapark)/ },
  { type: 'eurovikend', re: /(eurov[ií]kend|vikend|weekend|3\s*dni|4\s*dni)/ },
];

function deriveType(haystack) {
  for (const rule of TYPE_RULES) if (rule.re.test(haystack)) return rule.type;
  return 'ine';
}

const TRANSPORT_RULES = [
  { t: 'letecky', re: /(letec|let[ao]?|plane|flight|fly|charter)/ },
  { t: 'autobus', re: /(autobus|bus|autokar)/ },
  { t: 'vlastna', re: /(vlastn[aá]|individu|own|auto[m]?\b)/ },
  { t: 'lod', re: /(lod|trajekt|plavb|cruise|ferry)/ },
];

function deriveTransport(raw, haystack) {
  const r = norm(raw);
  for (const rule of TRANSPORT_RULES) if (rule.re.test(r)) return rule.t;
  for (const rule of TRANSPORT_RULES) if (rule.re.test(haystack)) return rule.t;
  return raw || '';
}

// ── hlavná normalizácia jedného zájazdu ─────────────────────────────────────

let _autoId = 0;

function normalizeTour(raw) {
  const title = pick(raw, ['nazov', 'name', 'title', 'nazov_zajazdu', 'meno', 'hotel', 'nazovHotela']);
  const country = pick(raw, ['krajina', 'country', 'stat', 'destinaciaKrajina']);
  const destination = pick(raw, ['destinacia', 'destination', 'lokalita', 'oblast', 'miesto', 'stredisko', 'region']);
  const region = pick(raw, ['region', 'oblast', 'provincia']);
  const priceRaw = pick(raw, ['cena', 'price', 'cena_od', 'cenaOd', 'cena_eur', 'sumaOd', 'amount']);
  const currency = pick(raw, ['mena', 'currency']) || 'EUR';
  const dateFromRaw = pick(raw, ['termin_od', 'datum_od', 'datumOd', 'terminOd', 'date_from', 'dateFrom', 'od', 'start', 'termin']);
  const dateToRaw = pick(raw, ['termin_do', 'datum_do', 'datumDo', 'terminDo', 'date_to', 'dateTo', 'do', 'end']);
  const nightsRaw = pick(raw, ['noci', 'pocet_noci', 'pocetNoci', 'nights', 'dni', 'pocet_dni', 'days', 'dlzka', 'trvanie']);
  const transportRaw = pick(raw, ['doprava', 'transport', 'typ_dopravy', 'doprava_typ']);
  const board = pick(raw, ['strava', 'board', 'stravovanie', 'meal', 'rozsah_stravy']);
  const accommodation = pick(raw, ['ubytovanie', 'accommodation', 'typ_ubytovania', 'hotel', 'kategoria', 'stars', 'hviezdy']);
  const description = pick(raw, ['popis', 'description', 'text', 'detail', 'info', 'anotacia', 'obsah']);
  const image = pick(raw, ['obrazok', 'image', 'img', 'foto', 'photo', 'picture', 'thumbnail', 'imageUrl', 'image_url']);
  const url = pick(raw, ['url', 'odkaz', 'link', 'detail_url', 'web', 'href']);
  const ratingRaw = pick(raw, ['hodnotenie', 'rating', 'stars', 'hviezdy', 'kategoria']);
  const typeRaw = pick(raw, ['typ', 'type', 'typ_dovolenky', 'kategoria_zajazdu', 'druh']);

  const haystack = norm([title, country, destination, region, description, typeRaw, accommodation].join(' '));

  const price = toNumber(priceRaw);
  const dateFrom = toDate(dateFromRaw);
  const dateTo = toDate(dateToRaw);

  let nights = toNumber(nightsRaw);
  // ak máme od/do termíny, vieme dopočítať noci
  if (!nights && dateFrom && dateTo) {
    const d1 = new Date(dateFrom), d2 = new Date(dateTo);
    const diff = Math.round((d2 - d1) / 86400000);
    if (diff > 0 && diff < 200) nights = diff;
  }

  const month = dateFrom ? parseInt(dateFrom.slice(5, 7), 10) : null;

  return {
    id: pick(raw, ['id', 'kod', 'code', 'cislo']) || `auto-${++_autoId}`,
    title: title || destination || country || 'Zájazd CK Daka',
    country,
    destination,
    region,
    price,
    priceText: priceRaw,
    currency,
    dateFrom,
    dateTo,
    month,
    nights: nights || null,
    transport: deriveTransport(transportRaw, haystack),
    transportRaw,
    board,
    accommodation,
    type: typeRaw ? deriveType(norm(typeRaw) + ' ' + haystack) : deriveType(haystack),
    description,
    image,
    url,
    rating: toNumber(ratingRaw),
  };
}

// ── verejné API ─────────────────────────────────────────────────────────────

export function parseXml(xmlString) {
  return parser.parse(xmlString);
}

export function normalizeFeed(xmlString) {
  const parsed = parseXml(xmlString);
  const { arr } = findTourArray(parsed);
  const tours = arr.map(normalizeTour).filter((t) => t.title);
  return tours;
}

// Z normalizovaných zájazdov vyrobí číselník pre filtre vo frontende.
export function buildFacets(tours) {
  const countries = new Set();
  const transports = new Set();
  const types = new Set();
  const boards = new Set();
  let priceMin = Infinity, priceMax = 0;

  for (const t of tours) {
    if (t.country) countries.add(t.country);
    if (t.transport) transports.add(t.transport);
    if (t.type) types.add(t.type);
    if (t.board) boards.add(t.board);
    if (typeof t.price === 'number') {
      priceMin = Math.min(priceMin, t.price);
      priceMax = Math.max(priceMax, t.price);
    }
  }

  return {
    countries: [...countries].sort((a, b) => a.localeCompare(b, 'sk')),
    transports: [...transports].sort(),
    types: [...types].sort(),
    boards: [...boards].sort((a, b) => a.localeCompare(b, 'sk')),
    priceMin: priceMin === Infinity ? 0 : Math.floor(priceMin),
    priceMax: Math.ceil(priceMax),
    count: tours.length,
  };
}
