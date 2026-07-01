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
function slugOf(t) { return t.slug || String(t.id); }
function slugify(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
}
// relatívne cesty (od koreňa, bez úvodného /) – prefix `up` ich prispôsobí hĺbke stránky
function tourPath(t) { return `zajazd/${slugOf(t)}/`; }
function destPath(country) { return `destinacia/${slugify(country)}/`; }
function typePath(type) { return `typ/${type}/`; }
function transportPath(tr) { return `doprava/${tr}/`; }
const AKCIE_PATH = 'akcie/';
function tourUrl(base, t) { return `${base}/${tourPath(t)}`; } // absolútna URL

// štítky pre rozcestníky
const TRANSPORT_HUB = { letecky: 'Letecké zájazdy', autobus: 'Autobusové zájazdy', vlastna: 'Zájazdy vlastnou dopravou', lod: 'Zájazdy loďou' };

// ── karta zájazdu (up = relatívny prefix ku koreňu podľa hĺbky stránky) ──────
function tourCard(t, up = '') {
  const meta = [];
  if (t.transport && TRANSPORT_LABELS[t.transport]) meta.push(TRANSPORT_LABELS[t.transport]);
  if (lenLabel(t)) meta.push(`🗓️ ${lenLabel(t)}`);
  if (t.board) meta.push(`🍽️ ${escapeHtml(t.board)}`);
  if (t.discount > 0) meta.push(`🔖 −${t.discount}%`);
  return `<a class="tour-card card" href="${up}${tourPath(t)}">
      <div class="tc-img"><img class="tc-thumb" src="${escapeHtml(imgOf(t))}" alt="${escapeHtml(t.title)}" width="640" height="400" loading="lazy" decoding="async" />
        <span class="tc-type">${TYPE_LABELS[t.type] || '🧳 Zájazd'}</span></div>
      <div class="tc-body">
        <div class="tc-title">${escapeHtml(t.title)}</div>
        <div class="tc-place">📍 ${escapeHtml(placeOf(t)) || '—'}</div>
        <div class="tc-meta">${meta.map((m) => `<span class="chip">${m}</span>`).join('')}</div>
        <div class="tc-foot"><span class="tc-price">${priceHtml(t)} <small>/os.</small></span>
          <span class="btn btn-primary" style="padding:8px 16px;font-size:.9rem">Detail</span></div>
      </div></a>`;
}
function toursGridHtml(list, up) { return list.map((t) => tourCard(t, up)).join('\n'); }

export function renderDealsCards(tours) {
  const deals = tours.filter((t) => t.discount > 0 && typeof t.price === 'number')
    .sort((a, b) => b.discount - a.discount).slice(0, 8);
  const list = deals.length ? deals
    : tours.filter((t) => typeof t.price === 'number').sort((a, b) => a.price - b.price).slice(0, 8);
  return toursGridHtml(list, '');
}

// ── adresár všetkých zájazdov (interné odkazy pre crawlery) ──────────────────
export function renderDirectory(tours) {
  const items = [...tours].sort((a, b) => a.title.localeCompare(b.title, 'sk')).map((t) => {
    const price = typeof t.price === 'number' ? ` – od ${fmtPrice(t.price)} €` : '';
    return `<li><a href="${tourPath(t)}">${escapeHtml(t.title)}</a><span class="dir-meta"> · ${escapeHtml(placeOf(t))}${price}</span></li>`;
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
export function tourPage(t, base, stamp, related = []) {
  const url = tourUrl(base, t);
  const destAbs = t.country ? `${base}/${destPath(t.country)}` : null;
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

  // TouristTrip = správny typ pre zájazd (nie 'Product' → žiadne e-shopové
  // požiadavky ako doprava, vrátenie, recenzie/hodnotenia).
  const productLd = jsonLd({
    '@context': 'https://schema.org', '@type': 'TouristTrip',
    name: t.title, image: [img], description: desc,
    touristType: TYPE_CATEGORY[t.type] || 'Zájazd',
    provider: { '@type': 'TravelAgency', name: 'CK DAKA', url: base },
    ...(typeof t.price === 'number' ? {
      offers: {
        '@type': 'Offer', url, priceCurrency: t.currency || 'EUR', price: t.price,
        availability: 'https://schema.org/InStock',
        ...(t.dateFrom ? { validFrom: t.dateFrom } : {}),
      },
    } : {}),
  });
  const crumbItems = [{ name: 'Výber zájazdov', item: base + '/' }];
  if (t.country) crumbItems.push({ name: t.country, item: destAbs });
  crumbItems.push({ name: t.title, item: url });
  const breadcrumbLd = jsonLd({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbItems.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  });

  // krížové odkazy na rozcestníky (tour → hub, pomáha im rankovať)
  const hubLinks = [];
  if (t.country) hubLinks.push(`<a href="../../${destPath(t.country)}">${escapeHtml(t.country)}</a>`);
  if (t.type && TYPE_CATEGORY[t.type]) hubLinks.push(`<a href="../../${typePath(t.type)}">${escapeHtml(TYPE_CATEGORY[t.type])}</a>`);
  if (t.transport && TRANSPORT_HUB[t.transport]) hubLinks.push(`<a href="../../${transportPath(t.transport)}">${escapeHtml(TRANSPORT_HUB[t.transport])}</a>`);

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
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(t.title)} | CK DAKA" />
  <meta property="og:description" content="${escapeHtml(metaDesc)}" />
  <meta property="og:image" content="${escapeHtml(img)}" />
  <meta property="og:url" content="${url}" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://cestovnakancelariadaka.sk" />
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
    <nav class="crumbs"><a href="../../">Domov</a> › ${t.country ? `<a href="../../${destPath(t.country)}">${escapeHtml(t.country)}</a> › ` : ''}<span>${escapeHtml(t.title)}</span></nav>
    <img class="tourpage-img" src="${escapeHtml(img)}" alt="${escapeHtml(t.title)}" width="1200" height="675" fetchpriority="high" decoding="async" />
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
    ${hubLinks.length ? `<p class="hub-links">Pozri aj: ${hubLinks.join(' · ')}</p>` : ''}
    ${related.length ? `<section class="related"><h2>Podobné zájazdy</h2><div class="cards-grid">${toursGridHtml(related, '../../')}</div></section>` : ''}
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

// ── výber podobných zájazdov (rovnaká krajina, potom typ) ────────────────────
export function relatedFor(tour, all, n = 4) {
  const others = all.filter((x) => x.id !== tour.id);
  const sameCountry = others.filter((x) => x.country && x.country === tour.country);
  const sameType = others.filter((x) => x.type === tour.type && !(x.country && x.country === tour.country));
  const seen = new Set(); const res = [];
  for (const x of [...sameCountry, ...sameType, ...others]) {
    if (seen.has(x.id)) continue;
    seen.add(x.id); res.push(x);
    if (res.length >= n) break;
  }
  return res;
}

// ── rozcestníky (landing stránky pre destinácie, typy, dopravu, akcie) ───────
function groupBy(list, kf) {
  const m = {};
  for (const x of list) { const k = kf(x); if (!k) continue; (m[k] = m[k] || []).push(x); }
  return m;
}
function minPriceTxt(list) {
  const ps = list.map((t) => t.price).filter((p) => typeof p === 'number');
  return ps.length ? ` od ${fmtPrice(Math.min(...ps))} €` : '';
}
function minPrice(list) {
  const ps = list.map((t) => t.price).filter((p) => typeof p === 'number');
  return ps.length ? Math.min(...ps) : null;
}
// top N hodnôt podľa počtu výskytov (napr. najčastejšie krajiny/typy)
function topBy(list, kf, labelFn, n = 3) {
  const c = {};
  for (const t of list) { const k = kf(t); if (!k) continue; c[k] = (c[k] || 0) + 1; }
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => labelFn(k));
}
function nearestDate(list) {
  const ds = list.map((t) => t.dateFrom).filter(Boolean).sort();
  return ds.length ? ds[0] : null;
}
function joinSk(arr) {
  if (arr.length <= 1) return arr.join('');
  return arr.slice(0, -1).join(', ') + ' a ' + arr[arr.length - 1];
}
// bohatší, unikátny úvodný text pre rozcestník (viac obsahu = lepší ranking)
function richIntro(kind, name, list) {
  const n = list.length;
  const mp = minPrice(list);
  const priceP = mp != null ? ` už od ${fmtPrice(mp)} €` : '';
  const nd = nearestDate(list);
  const nearP = nd ? ` Najbližšie odchody už od ${fmtDate(nd)}.` : '';
  const types = topBy(list, (t) => t.type, (k) => (TYPE_CATEGORY[k] || '').toLowerCase(), 3).filter(Boolean);
  const trans = topBy(list, (t) => t.transport, (k) => (TRANSPORT_HUB[k] || '').toLowerCase(), 2).filter(Boolean);
  const countries = topBy(list, (t) => t.country, (k) => k, 4).filter(Boolean);
  const zajazdovSlovo = (n >= 2 && n <= 4) ? 'zájazdy' : 'zájazdov';

  if (kind === 'dest') {
    const kinds = types.length ? ` Na výber: ${joinSk(types)}.` : '';
    const tr = trans.length ? ` Doprava: ${joinSk(trans)}.` : '';
    return `V ponuke cestovnej kancelárie CK DAKA nájdete ${n} ${zajazdovSlovo} do destinácie ${name}${priceP}.${kinds}${tr}${nearP} Vyberte si termín a cenu, ktorá vám sadne, a rezervujte jednoducho online.`;
  }
  if (kind === 'type') {
    const dest = countries.length ? ` Obľúbené destinácie: ${joinSk(countries)}.` : '';
    return `${name} z aktuálnej ponuky CK DAKA – ${n} ${zajazdovSlovo}${priceP}.${dest}${nearP} Porovnajte ceny aj termíny a vyberte si ten pravý zájazd.`;
  }
  if (kind === 'transport') {
    const dest = countries.length ? ` Najčastejšie smerujú do: ${joinSk(countries)}.` : '';
    return `${name} od CK DAKA – ${n} ${zajazdovSlovo}${priceP}.${dest}${nearP} Nájdite si dovolenku podľa termínu a rozpočtu.`;
  }
  // akcie
  const maxDisc = Math.max(0, ...list.map((t) => t.discount || 0));
  const dest = countries.length ? ` Akcie nájdete napríklad do: ${joinSk(countries)}.` : '';
  return `Zľavnené a last minute zájazdy CK DAKA – ${n} ponúk so zľavou až do −${maxDisc}%${priceP}.${dest} Ceny a dostupnosť sa menia denne, tak neváhajte dlho.`;
}
function hubList(items) {
  return items.sort((a, b) => a.label.localeCompare(b.label, 'sk'))
    .map((i) => `<li><a href="${i.path}">${escapeHtml(i.label)}</a> <span class="dir-meta">(${i.n})</span></li>`).join('');
}
function renderHubs(dest, types, trans, akcieN) {
  return `<section class="hubs">
      <h2>Prehľad ponuky</h2>
      <div class="hubs-cols">
        <div><h3>Podľa typu</h3><ul>${hubList(types)}</ul></div>
        <div><h3>Podľa dopravy</h3><ul>${hubList(trans)}${akcieN ? `<li><a href="${AKCIE_PATH}">🔥 Akcie a last minute</a> <span class="dir-meta">(${akcieN})</span></li>` : ''}</ul></div>
        <div class="hubs-dest"><h3>Destinácie</h3><ul>${hubList(dest)}</ul></div>
      </div>
    </section>`;
}
function landingPage(o) {
  const grid = toursGridHtml(o.tours, o.up);
  const itemLd = jsonLd({
    '@context': 'https://schema.org', '@type': 'ItemList', name: o.heading,
    itemListElement: o.tours.map((t, i) => ({ '@type': 'ListItem', position: i + 1, url: tourUrl(o.base, t), name: t.title })),
  });
  const crumbLd = jsonLd({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Výber zájazdov', item: o.base + '/' },
      { '@type': 'ListItem', position: 2, name: o.crumbLabel, item: o.canonical },
    ],
  });
  const more = o.total > o.tours.length
    ? `<p class="muted" style="text-align:center;margin-top:16px">Zobrazujeme ${o.tours.length} z ${o.total} zájazdov. <a href="${o.up}">Zobraziť všetky v sprievodcovi →</a></p>` : '';
  return `<!DOCTYPE html>
<html lang="sk"><head>
  <meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(o.metaTitle)}</title>
  <meta name="description" content="${escapeHtml(o.metaDesc)}" />
  <link rel="canonical" href="${o.canonical}" />
  <link rel="icon" type="image/png" href="${o.up}assets/favicon.png" />
  <meta name="theme-color" content="#243660" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(o.metaTitle)}" />
  <meta property="og:description" content="${escapeHtml(o.metaDesc)}" />
  <meta property="og:url" content="${o.canonical}" />
  <meta property="og:image" content="${o.base}/assets/og-banner.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://cestovnakancelariadaka.sk" />
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${o.up}css/styles.css?v=${o.stamp}" />
  <script data-goatcounter="https://ckdaka.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
  ${itemLd}
  ${crumbLd}
</head><body>
  <header class="topbar"><div class="brand"><a class="brand-link" href="${o.up}" title="Výber zájazdov CK DAKA">
    <img class="brand-img" src="${o.up}assets/logo.png" alt="CK DAKA – cestovná kancelária" /></a></div>
    <a class="btn btn-ghost" href="${o.up}">← Výber zájazdov</a></header>
  <main class="container landingpage">
    <nav class="crumbs"><a href="${o.up}">Domov</a> › <span>${escapeHtml(o.crumbLabel)}</span></nav>
    <h1>${escapeHtml(o.heading)}</h1>
    <p class="landing-intro">${escapeHtml(o.intro)}</p>
    <div class="cards-grid">${grid}</div>
    ${more}
    <div style="margin-top:26px"><a class="btn btn-primary btn-lg" href="${o.up}">🧭 Spustiť sprievodcu výberom</a></div>
  </main>
  <footer class="footer"><p>🌍 <strong>CK DAKA – cestovná kancelária</strong></p>
    <p class="footer-contacts"><a href="tel:+421244555000">📞 02 / 44 555 000</a> <a href="mailto:info@ckdaka.sk">✉️ info@ckdaka.sk</a></p></footer>
</body></html>
`;
}

// vytvorí všetky landing stránky + homepage prehľad + zoznam URL do sitemapy
export function buildLandingPages(tours, base, stamp) {
  const CAP = 60;
  const pages = []; const sitemapPaths = [];
  const add = (path, up, meta, list) => {
    if (!list.length) return;
    pages.push({ path, html: landingPage({ ...meta, canonical: `${base}/${path}`, base, stamp, up, tours: list.slice(0, CAP), total: list.length }) });
    sitemapPaths.push(path);
  };
  const destItems = [], typeItems = [], transItems = [];

  for (const [country, list] of Object.entries(groupBy(tours, (t) => t.country))) {
    if (list.length < 2) continue;
    const p = destPath(country);
    add(p, '../../', {
      heading: `Zájazdy – ${country}`, crumbLabel: country,
      metaTitle: `${country} – zájazdy a dovolenky | CK DAKA`,
      metaDesc: `Vyberte si z ${list.length} zájazdov do destinácie ${country}${minPriceTxt(list)}. Ceny, termíny aj akcie na jednom mieste – CK DAKA.`,
      intro: richIntro('dest', country, list),
    }, list);
    destItems.push({ label: country, path: p, n: list.length });
  }
  for (const [type, list] of Object.entries(groupBy(tours, (t) => t.type))) {
    if (list.length < 2 || !TYPE_CATEGORY[type]) continue;
    const label = TYPE_CATEGORY[type]; const p = typePath(type);
    add(p, '../../', {
      heading: label, crumbLabel: label, metaTitle: `${label} | CK DAKA`,
      metaDesc: `${label} z ponuky CK DAKA – ${list.length} zájazdov${minPriceTxt(list)}. Vyberte si termín a cenu.`,
      intro: richIntro('type', label, list),
    }, list);
    typeItems.push({ label, path: p, n: list.length });
  }
  for (const [tr, list] of Object.entries(groupBy(tours, (t) => t.transport))) {
    if (list.length < 2 || !TRANSPORT_HUB[tr]) continue;
    const label = TRANSPORT_HUB[tr]; const p = transportPath(tr);
    add(p, '../../', {
      heading: label, crumbLabel: label, metaTitle: `${label} | CK DAKA`,
      metaDesc: `${label} – ${list.length} zájazdov z ponuky CK DAKA${minPriceTxt(list)}.`,
      intro: richIntro('transport', label, list),
    }, list);
    transItems.push({ label, path: p, n: list.length });
  }
  const akcie = tours.filter((t) => t.discount > 0 && typeof t.price === 'number').sort((a, b) => b.discount - a.discount);
  add(AKCIE_PATH, '../', {
    heading: 'Akcie a last minute', crumbLabel: 'Akcie',
    metaTitle: 'Akcie a last minute zájazdy | CK DAKA',
    metaDesc: `Najväčšie zľavy a last minute zájazdy CK DAKA – ${akcie.length} akciových ponúk.`,
    intro: richIntro('akcie', 'Akcie', akcie),
  }, akcie);

  return { pages, sitemapPaths, hubsHtml: renderHubs(destItems, typeItems, transItems, akcie.length) };
}

// ── sitemap.xml a robots.txt ─────────────────────────────────────────────────
export function sitemap(tours, base, lastmod, extraPaths = []) {
  const urls = [
    `  <url><loc>${base}/</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...extraPaths.map((p) =>
      `  <url><loc>${base}/${p}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`),
    ...tours.map((t) =>
      `  <url><loc>${tourUrl(base, t)}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`),
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

// presmerovanie zo starej /zajazd/<id>/ na peknú /zajazd/<id>-<slug>/ (stabilný odkaz)
export function redirectPage(t, base) {
  const target = tourUrl(base, t);     // absolútna kanonická URL
  const rel = `../${slugOf(t)}/`;      // relatívna z /zajazd/<id>/
  return `<!DOCTYPE html>
<html lang="sk"><head><meta charset="UTF-8" />
<title>Presmerovanie…</title>
<link rel="canonical" href="${target}" />
<meta name="robots" content="noindex,follow" />
<meta http-equiv="refresh" content="0; url=${rel}" />
<script>location.replace(${JSON.stringify(rel)});</script>
</head><body>Presmerúvame na <a href="${rel}">${escapeHtml(t.title)}</a>…</body></html>
`;
}
