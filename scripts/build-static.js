// Build statickej verzie pre GitHub Pages (náhľad bez Node servera).
// Vygeneruje tours.json (v CI sa pokúsi stiahnuť reálny feed, inak vzorka)
// a skopíruje obsah public/ do výstupného priečinka (_site).

import { readFile, writeFile, cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeFeed, buildFacets } from '../src/normalizer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, '_site');
const FEED_URL = process.env.DAKA_FEED_URL || 'https://www.ckdaka.sk/export/xml';
// V produkcii (workflow) nechceme nikdy nasadiť ukážkové dáta – radšej build padne.
const REQUIRE_LIVE = process.env.REQUIRE_LIVE === '1';

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

async function getXml() {
  const attempts = 6;
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const xml = await fetchOnce(45000);
      console.log(`✓ Feed stiahnutý naživo z ${FEED_URL} (pokus ${i})`);
      return { xml, source: 'live', error: null };
    } catch (e) {
      lastErr = e;
      console.warn(`⚠ Pokus ${i}/${attempts} zlyhal: ${e.message || e}`);
      if (i < attempts) await new Promise((r) => setTimeout(r, Math.min(i * 4000, 16000)));
    }
  }
  if (REQUIRE_LIVE) {
    throw new Error(`Živý feed sa nepodarilo stiahnuť (${lastErr?.message || lastErr}). ` +
      'Build zámerne padá, aby sa nenasadili ukážkové dáta (REQUIRE_LIVE=1).');
  }
  console.warn('⚠ Živý feed nedostupný – použijem ukážkové dáta.');
  const xml = await readFile(join(ROOT, 'data', 'sample.xml'), 'utf8');
  return { xml, source: 'sample', error: String(lastErr?.message || lastErr) };
}

const { xml, source, error } = await getXml();
const tours = normalizeFeed(xml);
const facets = buildFacets(tours);

await mkdir(OUT, { recursive: true });
await cp(join(ROOT, 'public'), OUT, { recursive: true });
await writeFile(join(OUT, 'tours.json'), JSON.stringify(
  { tours, facets, source, error, feedUrl: FEED_URL, cachedAt: Date.now() }, null, 2));
// .nojekyll, aby GitHub Pages nepreskakoval súbory
await writeFile(join(OUT, '.nojekyll'), '');

// cache-busting: ku každému buildu pripneme verziu k CSS/JS, aby prehliadač
// po novej dennej aktualizácii vždy načítal čerstvé súbory (nie staré z cache).
const stamp = Date.now();
const idxPath = join(OUT, 'index.html');
let html = await readFile(idxPath, 'utf8');
html = html
  .replace('css/styles.css', `css/styles.css?v=${stamp}`)
  .replace('js/app.js', `js/app.js?v=${stamp}`)
  .replace('assets/favicon.png', `assets/favicon.png?v=${stamp}`);
await writeFile(idxPath, html);

console.log(`✓ Statický build hotový: ${tours.length} zájazdov (zdroj: ${source}) → _site/`);
