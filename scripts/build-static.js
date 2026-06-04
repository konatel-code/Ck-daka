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

async function getXml() {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 25000);
    const res = await fetch(FEED_URL, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'CKDaka-Vyber/1.0', Accept: 'application/xml, text/xml, */*' },
    });
    clearTimeout(to);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log('✓ Feed stiahnutý naživo z', FEED_URL);
    return { xml: await res.text(), source: 'live', error: null };
  } catch (e) {
    console.warn('⚠ Živý feed nedostupný (' + (e.message || e) + ') – použijem ukážkové dáta.');
    const xml = await readFile(join(ROOT, 'data', 'sample.xml'), 'utf8');
    return { xml, source: 'sample', error: String(e.message || e) };
  }
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

console.log(`✓ Statický build hotový: ${tours.length} zájazdov (zdroj: ${source}) → _site/`);
