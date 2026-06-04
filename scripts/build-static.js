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

async function fetchOnce(timeoutMs) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(FEED_URL, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'CKDaka-Vyber/1.0', Accept: 'application/xml, text/xml, */*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(to);
  }
}

async function getXml() {
  const attempts = 4;
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const xml = await fetchOnce(45000);
      console.log(`✓ Feed stiahnutý naživo z ${FEED_URL} (pokus ${i})`);
      return { xml, source: 'live', error: null };
    } catch (e) {
      lastErr = e;
      console.warn(`⚠ Pokus ${i}/${attempts} zlyhal: ${e.message || e}`);
      if (i < attempts) await new Promise((r) => setTimeout(r, i * 3000));
    }
  }
  console.warn('⚠ Živý feed nedostupný – použijem ukážkové dáta.');
  const xml = await readFile(join(ROOT, 'data', 'sample.xml'), 'utf8');
  return { xml, source: 'sample', error: String(lastErr?.message || lastErr) };
}

const { xml, source, error } = await getXml();
const tours = normalizeFeed(xml);
const facets = buildFacets(tours);

// --- DOČASNÁ DIAGNOSTIKA (odstránim po analýze) ---
if (process.env.DEBUG_FEED === '1') {
  console.log('===RAW_XML_START===');
  console.log(xml.slice(0, 2500));
  console.log('===RAW_XML_END===');
  console.log('===NORMALIZED_SAMPLE===');
  console.log(JSON.stringify(tours.slice(0, 5), null, 2));
  console.log('===PRICE_STATS===');
  const prices = tours.map((t) => t.price);
  console.log('priceMin/Max:', facets.priceMin, facets.priceMax);
  console.log('null ceny:', prices.filter((p) => p == null).length, '/', tours.length);
  console.log('ukážky priceText:', tours.slice(0, 12).map((t) => t.priceText));
}
// --- /DOČASNÁ DIAGNOSTIKA ---

await mkdir(OUT, { recursive: true });
await cp(join(ROOT, 'public'), OUT, { recursive: true });
await writeFile(join(OUT, 'tours.json'), JSON.stringify(
  { tours, facets, source, error, feedUrl: FEED_URL, cachedAt: Date.now() }, null, 2));
// .nojekyll, aby GitHub Pages nepreskakoval súbory
await writeFile(join(OUT, '.nojekyll'), '');

console.log(`✓ Statický build hotový: ${tours.length} zájazdov (zdroj: ${source}) → _site/`);
