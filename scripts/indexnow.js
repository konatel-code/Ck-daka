// IndexNow – po builde oznámi vyhľadávačom (Bing, Seznam, Yandex…) zoznam URL,
// aby nové/zmenené zájazdy zaindexovali rýchlejšie (v hodinách, nie týždňoch).
// Google IndexNow zatiaľ nepodporuje – ten dostáva rovnaké URL cez sitemap.xml
// (denne aktualizovanú) a Search Console.
//
// Kľúč je verejný súbor v koreni domény: /<KEY>.txt s obsahom rovným <KEY>.
// Spúšťa sa z workflow po builde (číta _site/sitemap.xml). Zlyhanie nezhodí build.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const KEY = '8f4b2e6a9c1d47f0b3e5a8c2d6091e73';
const BASE_URL = (process.env.SITE_URL || 'https://vyber.ckdaka.sk').replace(/\/$/, '');
const ENDPOINT = 'https://api.indexnow.org/indexnow';

async function main() {
  let xml;
  try {
    xml = await readFile(join(ROOT, '_site', 'sitemap.xml'), 'utf8');
  } catch (e) {
    console.warn('⚠ IndexNow: sitemap.xml sa nenašla – preskakujem.', e.message || e);
    return;
  }

  const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter(Boolean);
  if (!urlList.length) {
    console.warn('⚠ IndexNow: v sitemape nie sú žiadne URL – preskakujem.');
    return;
  }

  const host = new URL(BASE_URL).host;
  const body = { host, key: KEY, keyLocation: `${BASE_URL}/${KEY}.txt`, urlList };

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });
    // 200 = prijaté, 202 = prijaté na spracovanie; obe sú v poriadku.
    console.log(`IndexNow: odoslaných ${urlList.length} URL → HTTP ${res.status} ${res.statusText}`);
    if (![200, 202].includes(res.status)) {
      const txt = await res.text().catch(() => '');
      console.warn('⚠ IndexNow odpoveď:', txt.slice(0, 300));
    }
  } catch (e) {
    console.warn('⚠ IndexNow: odoslanie zlyhalo (nezhodí build):', e.message || e);
  }
}

await main();
