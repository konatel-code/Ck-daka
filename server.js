// CK Daka – sprievodca výberom zájazdov.
// Server načíta XML feed (server-side, takže rieši CORS), znormalizuje ho a
// poskytne frontendu cez /api/tours. Feed kešuje, aby sme ckdaka.sk nezahltili.

import express from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeFeed, buildFacets } from './src/normalizer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const FEED_URL = process.env.DAKA_FEED_URL || 'https://www.ckdaka.sk/export/xml';
const CACHE_TTL_MS = Number(process.env.FEED_TTL_MS || 15 * 60 * 1000); // 15 min
const SAMPLE_PATH = join(__dirname, 'data', 'sample.xml');

const app = express();
app.use(express.static(join(__dirname, 'public')));

// ── jednoduchý cache feedu ──────────────────────────────────────────────────
let cache = { at: 0, tours: null, facets: null, source: null, error: null };

async function fetchFeed() {
  const fresh = Date.now() - cache.at < CACHE_TTL_MS;
  if (fresh && cache.tours) return cache;

  let xml = null;
  let source = 'live';
  let error = null;

  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(FEED_URL, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'CKDaka-Vyber/1.0', Accept: 'application/xml, text/xml, */*' },
    });
    clearTimeout(to);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    xml = await res.text();
  } catch (e) {
    error = e.message || String(e);
    source = 'sample';
  }

  // fallback na ukážkovú vzorku (napr. ak je sieť obmedzená)
  if (!xml) {
    try {
      xml = await readFile(SAMPLE_PATH, 'utf8');
    } catch {
      cache = { at: Date.now(), tours: [], facets: buildFacets([]), source: 'none', error };
      return cache;
    }
  }

  const tours = normalizeFeed(xml);
  cache = { at: Date.now(), tours, facets: buildFacets(tours), source, error };
  return cache;
}

// ── API ─────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, cachedAt: cache.at, source: cache.source, count: cache.tours?.length ?? 0 });
});

app.get('/api/tours', async (req, res) => {
  try {
    const data = await fetchFeed();
    res.json({
      tours: data.tours,
      facets: data.facets,
      source: data.source,
      error: data.error,
      feedUrl: FEED_URL,
      cachedAt: data.at,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e), tours: [], facets: buildFacets([]) });
  }
});

// vynútené obnovenie cache (napr. tlačidlo "Obnoviť ponuku")
app.get('/api/refresh', async (req, res) => {
  cache.at = 0;
  const data = await fetchFeed();
  res.json({ ok: true, source: data.source, count: data.tours.length, error: data.error });
});

app.listen(PORT, () => {
  console.log(`🌴 CK Daka sprievodca beží na http://localhost:${PORT}`);
  console.log(`   Feed: ${FEED_URL}`);
});
