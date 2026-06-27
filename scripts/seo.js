// SEO vrstva: pri builde z dát vygeneruje obsah, ktorý vidia vyhľadávače aj AI:
//  - predgenerované karty akcií na úvod (renderDealsCards)
//  - adresár všetkých zájazdov s odkazmi (renderDirectory)
//  - samostatnú statickú stránku pre každý zájazd (tourPage) s JSON-LD
//  - sitemap.xml a robots.txt
//
// Všetko sa generuje automaticky pri každom (dennom) builde – ostáva bezúdržbové.

const TYPE_LABELS = {
  more: '🏖️ More', exotika: '🌴 Exotika', hory: '⛰️ Hory',
  mesto: '🏛️ Mesto', wellness: '💆 Wellness', eurovikend: '⚡ Eurovíkend', ine: '🧳 Zájazd',
};
const TRANSPORT_LABELS = {
  letecky: '✈️ Letecky', autobus: '🚌 Autobus', vlastna: '🚗 Vlastná', lod: '⛴️ Loď',
};
// čistá kategória (bez emoji) pre štruktúrované dáta
const TYPE_CATEGORY = {
  more: 'Dovolenka pri mori', exotika: 'Exotika', hory: 'Hory a turistika',
  mesto: 'Poznávací zájazd', wellness: 'Wellness', eurovikend: 'Eurovíkend', ine: 'Zájazd',
};

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function stripText(s) { return String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function clamp(s, n) { const t = stripText(s); return t.length > n ? t.slice(0, n - 1).trim() + '…' : t; }
function fmtPrice(p) { return Number(p).toLocaleString('sk-SK'); }
function fmtDate(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${+d}.${+m}.${y}`; }
function dniSlovo(n) { return n === 1 ? 'deň' : (n >= 2 && n <= 4 ? 'dni' : 'dní'); }
function lenLabel(t) {
  let d = t.days;
  if (d == null && t.nights != null) d = t.nights === 0 ? 1 : t.nights + 1;
  if (d == null) return '';
  return d === 1 ? '1 deň' : `${d} ${dniSlovo(d)}`;
}
function placeOf(t) { return [...new Set([t.destination, t.region, t.country].filter(Boolean))].join(', '); }
function priceHtml(t) {
  if (typeof t.price !== 'number') return 'cena na dopyt';
  const orig = (t.originalPrice && t.originalPrice > t.price)
    ? `<s class="tc-orig">${fmtPrice(t.originalPrice)} €</s> ` : '';
  return `${orig}${t.priceFrom ? 'od ' : ''}${fmtPrice(t.price)}&nbsp;€`;
}
function jsonLd(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}
function imgOf(t) { return t.image || `https://picsum.photos/seed/${encodeURIComponent(t.id)}/640/420`; }
function tourPath(id) { return `zajazd/${encodeURIComponent(String(id))}/`; }
function tourUrl(base, id) { return `${base}/zajazd/${encodeURIComponent(String(id))}/`; }

// ── predgenerované karty akcií (rovnaký výber ako appka) ─────────────────────
function dealCard(t) {
  const meta = [];
  if (t.transport && TRANSPORT_LABELS[t.transport]) meta.push(TRANSPORT_LABELS[t.transport]);
  if (lenLabel(t)) meta.push(`🗓️ ${lenLabel(t)}`);
  if (t.board) meta.push(`🍽️ ${escapeHtml(t.board)}`);
  if (t.discount > 0) meta.push(`🔖 −${t.discount}%`);
  return `<a class="tour-card card" href="${tourPath(t.id)}">
      <div class="tc-img"><img class="tc-thumb" src="${escapeHtml(imgOf(t))}" alt="${escapeHtml(t.title)}" loading="lazy" />
        <span class="tc-type">${TYPE_LABELS[t.type] || '🧳 Zájazd'}</span></div>
      <div class="tc-body">
        <div class="tc-title">${escapeHtml(t.title)}</div>
        <div class="tc-place">📍 ${escapeHtml(placeOf(t)) || '—'}</div>
        <div class="tc-meta">${meta.map((m) => `<span class="chip">${m}</span>`).join('')}</div>
        <div class="tc-foot"><span class="tc-price">${priceHtml(t)} <small>/os.</small></span>
          <span class="btn btn-primary" style="padding:8px 16px;font-size:.9rem">Detail</span></div>
      </div></a>`;
}
export function renderDealsCards(tours) {
  const deals = tours.filter((t) => t.discount > 0 && typeof t.price === 'number')
    .sort((a, b) => b.discount - a.discount).slice(0, 8);
  const list = deals.length ? deals
    : tours.filter((t) => typeof t.price === 'number').sort((a, b) => a.price - b.price).slice(0, 8);
  return list.map(dealCard).join('\n');
}

// ── adresár všetkých zájazdov (interné odkazy pre crawlery) ──────────────────
export function renderDirectory(tours) {
  const items = [...tours].sort((a, b) => a.title.localeCompare(b.title, 'sk')).map((t) => {
    const price = typeof t.price === 'number' ? ` – od ${fmtPrice(t.price)} €` : '';
    return `<li><a href="${tourPath(t.id)}">${escapeHtml(t.title)}</a><span class="dir-meta"> · ${escapeHtml(placeOf(t))}${price}</span></li>`;
  }).join('');
  return `<section class="all-index">
      <details><summary>📋 Zoznam všetkých zájazdov (${tours.length})</summary>
        <ul class="all-index-list">${items}</ul></details>
    </section>`;
}

// ── štruktúrované dáta pre úvodnú stránku ────────────────────────────────────
export function homeJsonLd(base) {
  return jsonLd({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TravelAgency', '@id': `${base}/#org`,
        name: 'CK DAKA – cestovná kancelária', url: base,
        logo: `${base}/assets/logo.png`, image: `${base}/assets/logo.png`,
        telephone: '+421244555000', email: 'info@ckdaka.sk',
      },
      {
        '@type': 'WebSite', '@id': `${base}/#web`, url: base,
        name: 'CK DAKA – výber zájazdov', inLanguage: 'sk',
        publisher: { '@id': `${base}/#org` },
      },
    ],
  });
}

// ── samostatná stránka jedného zájazdu ───────────────────────────────────────
export function tourPage(t, base, stamp) {
  const url = tourUrl(base, t.id);
  const img = imgOf(t);
  const place = placeOf(t);
  const desc = stripText(t.description) ||
    `Zájazd ${t.title}${place ? ' – ' + place : ''} v ponuke CK DAKA.`;
  const metaDesc = clamp(
    `${t.title} – ${place}${lenLabel(t) ? ', ' + lenLabel(t) : ''}${typeof t.price === 'number' ? ', od ' + fmtPrice(t.price) + ' €' : ''}. ${desc}`,
    160);

  const chips = [];
  if (t.type) chips.push(TYPE_LABELS[t.type] || t.type);
  if (t.transport && TRANSPORT_LABELS[t.transport]) chips.push(TRANSPORT_LABELS[t.transport]);
  if (lenLabel(t)) chips.push(`🗓️ ${lenLabel(t)}`);
  if (t.board) chips.push(`🍽️ ${escapeHtml(t.board)}`);
  if (t.dateFrom) chips.push(`📅 najbližšie ${fmtDate(t.dateFrom)}`);
  if (t.termsCount > 1) chips.push(`📆 ${t.termsCount} termínov`);
  if (t.discount > 0) chips.push(`🔖 zľava −${t.discount}%`);

  const terms = (t.terms || []).map((d) => {
    const range = (d.from && d.to && d.from !== d.to) ? `${fmtDate(d.from)} – ${fmtDate(d.to)}` : fmtDate(d.from || d.to);
    const orig = (d.orig && d.orig > d.price) ? `<s class="tc-orig">${fmtPrice(d.orig)} €</s> ` : '';
    const disc = (d.discount > 0) ? ` <span class="term-disc">−${d.discount}%</span>` : '';
    return `<li class="term-row"><span>📅 ${range}</span><span class="term-price">${orig}${fmtPrice(d.price)}&nbsp;€${disc}</span></li>`;
  }).join('');

  const subject = `Záujem o zájazd: ${t.title} (kód ${t.id})`;
  const body = ['Dobrý deň,', '', `mám záujem o zájazd: ${t.title} (kód ${t.id}).`,
    typeof t.price === 'number' ? `Cena od ${fmtPrice(t.price)} € / os.` : '',
    t.dateFrom ? `Najbližší termín: ${fmtDate(t.dateFrom)}` : '',
    t.url ? `Odkaz: ${t.url}` : '', '', 'Prosím o viac informácií. Ďakujem.'].filter(Boolean);
  const mailto = `mailto:info@ckdaka.sk?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.join('\n'))}`;

  const productLd = jsonLd({
    '@context': 'https://schema.org', '@type': 'Product',
    name: t.title, image: [img], description: desc,
    category: TYPE_CATEGORY[t.type] || 'Zájazd',
    brand: { '@type': 'Organization', name: 'CK DAKA' },
    ...(typeof t.price === 'number' ? {
      offers: {
        '@type': 'Offer', url, priceCurrency: t.currency || 'EUR', price: t.price,
        availability: 'https://schema.org/InStock',
        ...(t.dateFrom ? { validFrom: t.dateFrom } : {}),
      },
    } : {}),
  });
  const breadcrumbLd = jsonLd({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Výber zájazdov', item: base + '/' },
      { '@type': 'ListItem', position: 2, name: t.title, item: url },
    ],
  });

  return `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(t.title)} | CK DAKA</title>
  <meta name="description" content="${escapeHtml(metaDesc)}" />
  <link rel="canonical" href="${url}" />
  <link rel="icon" type="image/png" href="../../assets/favicon.png" />
  <meta name="theme-color" content="#243660" />
  <meta property="og:type" content="product" />
  <meta property="og:title" content="${escapeHtml(t.title)} | CK DAKA" />
  <meta property="og:description" content="${escapeHtml(metaDesc)}" />
  <meta property="og:image" content="${escapeHtml(img)}" />
  <meta property="og:url" content="${url}" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../../css/styles.css?v=${stamp}" />
  <script data-goatcounter="https://ckdaka.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
  ${productLd}
  ${breadcrumbLd}
</head>
<body>
  <header class="topbar">
    <div class="brand"><a class="brand-link" href="../../" title="Výber zájazdov CK DAKA">
      <img class="brand-img" src="../../assets/logo.png" alt="CK DAKA – cestovná kancelária" /></a></div>
    <a class="btn btn-ghost" href="../../">← Výber zájazdov</a>
  </header>

  <main class="tourpage">
    <nav class="crumbs"><a href="../../">Domov</a> › <span>${escapeHtml(t.title)}</span></nav>
    <img class="tourpage-img" src="${escapeHtml(img)}" alt="${escapeHtml(t.title)}" />
    <h1>${escapeHtml(t.title)}</h1>
    <p class="tc-place">📍 ${escapeHtml(place) || '—'}</p>
    <div class="modal-row">${chips.map((c) => `<span class="chip">${escapeHtml(String(c))}</span>`).join('')}</div>
    <p class="price-line"><span class="tc-price">${priceHtml(t)}</span> <small>/ osoba</small></p>
    <p class="tourpage-desc">${escapeHtml(desc)}</p>
    ${terms ? `<h2>Dostupné termíny (${(t.terms || []).length})</h2><ul class="term-list">${terms}</ul>` : ''}
    <div class="tourpage-cta">
      ${t.url ? `<a class="btn btn-primary btn-lg" href="${escapeHtml(t.url)}" target="_blank" rel="noopener">Detail a objednávka na ckdaka.sk ↗</a>` : ''}
      <a class="btn btn-ghost" href="${mailto}">Spýtať sa na zájazd</a>
      <a class="btn btn-ghost" href="../../">Nájsť podobný zájazd 🧭</a>
    </div>
  </main>

  <footer class="footer">
    <p>🌍 <strong>CK DAKA – cestovná kancelária</strong></p>
    <p class="footer-contacts">
      <a href="tel:+421244555000">📞 02 / 44 555 000</a>
      <a href="mailto:info@ckdaka.sk">✉️ info@ckdaka.sk</a>
    </p>
  </footer>
</body>
</html>
`;
}

// ── sitemap.xml a robots.txt ─────────────────────────────────────────────────
export function sitemap(tours, base, lastmod) {
  const urls = [
    `  <url><loc>${base}/</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...tours.map((t) =>
      `  <url><loc>${tourUrl(base, t.id)}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`),
  ].join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
export function robots(base) {
  return `User-agent: *
Allow: /

Sitemap: ${base}/sitemap.xml
`;
}
