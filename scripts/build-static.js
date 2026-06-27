// Build statickej verzie pre GitHub Pages (náhľad bez Node servera).
// Vygeneruje tours.json (v CI sa pokúsi stiahnuť reálny feed, inak vzorka)
// a skopíruje obsah public/ do výstupného priečinka (_site).

import { readFile, writeFile, cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeFeed, buildFacets } from '../src/normalizer.js';
import { renderDealsCards, renderDirectory, homeJsonLd, tourPage, sitemap, robots, redirectPage } from './seo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, '_site');
const FEED_URL = process.env.DAKA_FEED_URL || 'https://www.ckdaka.sk/export/xml';
// V produkcii (workflow) nechceme nikdy nasadiť ukážkové dáta – radšej build padne.
const REQUIRE_LIVE = process.env.REQUIRE_LIVE === '1';
// záloha posledných úspešne stiahnutých dát (kompaktný JSON, commitovaný v repe)
const LAST_GOOD = join(ROOT, 'data', 'last-good.json');

// prehliadačová hlavička – server feedu inak občas odmietne (403)
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/xml, text/xml, application/xhtml+xml, */*;q=0.9',
  'Accept-Language': 'sk,en;q=0.8',
};

async function fetchOnce(timeoutMs) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(FEED_URL, { signal: ctrl.signal, headers: BROWSER_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!/<SHOPITEM|<zajazd|<SHOP/i.test(text)) throw new Error('neočakávaný obsah feedu');
    return text;
  } finally {
    clearTimeout(to);
  }
}

// pokus o stiahnutie živého feedu (s opakovaním); vráti XML alebo null
async function tryLive() {
  const attempts = 6;
  let lastErr = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      const xml = await fetchOnce(45000);
      console.log(`✓ Feed stiahnutý naživo z ${FEED_URL} (pokus ${i})`);
      return { xml, error: null };
    } catch (e) {
      lastErr = e;
      console.warn(`⚠ Pokus ${i}/${attempts} zlyhal: ${e.message || e}`);
      if (i < attempts) await new Promise((r) => setTimeout(r, Math.min(i * 4000, 16000)));
    }
  }
  return { xml: null, error: String(lastErr?.message || lastErr) };
}

async function readBackupTours() {
  try {
    const parsed = JSON.parse(await readFile(LAST_GOOD, 'utf8'));
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch { return null; }
}

// Zdroj dát v poradí: 1) živý feed → 2) posledná dobrá záloha → 3) pád/ukážka
const live = await tryLive();
let tours, source, error = live.error;

if (live.xml) {
  tours = normalizeFeed(live.xml);
  source = 'live';
} else {
  const backup = await readBackupTours();
  if (backup) {
    console.warn('⚠ Živý feed nedostupný – použijem zálohu (posledná dobrá ponuka).');
    tours = backup;
    source = 'backup';
  } else if (REQUIRE_LIVE) {
    throw new Error(`Živý feed sa nepodarilo stiahnuť (${error}) a neexistuje záloha. ` +
      'Build zámerne padá, aby sa nenasadili ukážkové dáta (REQUIRE_LIVE=1).');
  } else {
    console.warn('⚠ Živý feed ani záloha nie sú dostupné – použijem ukážkové dáta.');
    tours = normalizeFeed(await readFile(join(ROOT, 'data', 'sample.xml'), 'utf8'));
    source = 'sample';
  }
}

const facets = buildFacets(tours);

// po úspešnom živom stiahnutí ulož kompaktnú zálohu (commitne ju workflow)
if (source === 'live') {
  await writeFile(LAST_GOOD, JSON.stringify(tours));
  console.log(`✓ Záloha dát aktualizovaná → data/last-good.json (${tours.length} zájazdov)`);
}

await mkdir(OUT, { recursive: true });
await cp(join(ROOT, 'public'), OUT, { recursive: true });
await writeFile(join(OUT, 'tours.json'), JSON.stringify(
  { tours, facets, source, error, feedUrl: FEED_URL, cachedAt: Date.now() }, null, 2));
// .nojekyll, aby GitHub Pages nepreskakoval súbory
await writeFile(join(OUT, '.nojekyll'), '');

// základná adresa pre kanonické URL, sitemap a OG (produkčná doména)
const BASE_URL = (process.env.SITE_URL || 'https://vyber.ckdaka.sk').replace(/\/$/, '');
const stamp = Date.now();

// ── úvodná stránka: predgenerovaný obsah pre vyhľadávače + cache-busting ─────
const idxPath = join(OUT, 'index.html');
let html = await readFile(idxPath, 'utf8');
html = html
  // reálne karty akcií (crawler aj AI hneď vidia obsah, nie prázdnu stránku)
  .replace('<div class="cards-grid" id="dealsGrid"></div>',
    `<div class="cards-grid" id="dealsGrid">${renderDealsCards(tours)}</div>`)
  // adresár všetkých zájazdov (interné odkazy na ich stránky)
  .replace('</main>', `${renderDirectory(tours)}\n  </main>`)
  // štruktúrované dáta (schema.org)
  .replace('</head>', `${homeJsonLd(BASE_URL)}\n</head>`)
  // cache-busting CSS/JS
  .replace('css/styles.css', `css/styles.css?v=${stamp}`)
  .replace('js/app.js', `js/app.js?v=${stamp}`)
  .replace('assets/favicon.png', `assets/favicon.png?v=${stamp}`);
await writeFile(idxPath, html);

// ── samostatná statická stránka pre každý zájazd (pekná URL so slugom) ──────
let pages = 0;
for (const t of tours) {
  const slug = t.slug || String(t.id);
  const dir = join(OUT, 'zajazd', slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.html'), tourPage(t, BASE_URL, stamp));
  pages++;
  // presmerovanie zo starej /zajazd/<id>/ na novú slug URL (stabilný odkaz)
  if (slug !== String(t.id)) {
    const idDir = join(OUT, 'zajazd', String(t.id));
    await mkdir(idDir, { recursive: true });
    await writeFile(join(idDir, 'index.html'), redirectPage(t, BASE_URL));
  }
}

// ── sitemap.xml + robots.txt ────────────────────────────────────────────────
const lastmod = new Date(stamp).toISOString().slice(0, 10);
await writeFile(join(OUT, 'sitemap.xml'), sitemap(tours, BASE_URL, lastmod));
await writeFile(join(OUT, 'robots.txt'), robots(BASE_URL));

console.log(`✓ Statický build hotový: ${tours.length} zájazdov (zdroj: ${source}) → _site/`);
console.log(`✓ SEO: ${pages} stránok zájazdov + sitemap.xml + robots.txt (${BASE_URL})`);
