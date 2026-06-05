/* =========================================================================
   CK Daka – sprievodca výberom zájazdov (frontend)
   ========================================================================= */

const state = {
  tours: [],
  facets: null,
  answers: {},      // odpovede zo sprievodcu
  step: 0,
  mode: 'quiz',     // 'quiz' | 'browse'
  sort: '',         // '' | 'price' | 'discount' | 'date'
  compare: [],      // ID zájazdov vybraných na porovnanie
};

// anonymná analytika (GoatCounter) – bezpečný wrapper, funguje aj keď skript nie je načítaný
function track(event, props) {
  try {
    if (!window.goatcounter || typeof window.goatcounter.count !== 'function') return;
    const detail = props ? ' (' + Object.values(props).join(', ') + ')' : '';
    window.goatcounter.count({ path: 'event/' + event, title: event + detail, event: true });
  } catch (_) {}
}

// ── REGIÓNY (mapovanie odpovede na krajiny / typ) ───────────────────────────
const REGION_COUNTRIES = {
  stredomorie: ['grecko', 'taliansko', 'spanielsko', 'turecko', 'chorvatsko', 'bulharsko',
                'cyprus', 'malta', 'tunisko', 'portugalsko', 'cierna hora', 'albansko'],
  zamorie:     ['egypt', 'maldivy', 'thajsko', 'dominikanska republika', 'dominikana', 'kuba',
                'dubaj', 'spojene arabske emiraty', 'emiraty', 'mexiko', 'zanzibar', 'tanzania',
                'bali', 'indonezia', 'srilanka', 'sri lanka', 'vietnam', 'kapverdy', 'mauricius'],
  domace:      ['slovensko', 'madarsko', 'rakusko', 'cesko', 'ceska republika', 'polsko', 'slovinsko'],
};

// ── KROKY SPRIEVODCU ────────────────────────────────────────────────────────
const STEPS = [
  {
    key: 'type', weight: 22, title: 'Po akej dovolenke túžiš?',
    hint: 'Vyber náladu – ostatné spolu doladíme.', type: 'options',
    options: [
      { value: 'more', label: 'More & pláž', emoji: '🏖️' },
      { value: 'exotika', label: 'Exotika', emoji: '🌴' },
      { value: 'hory', label: 'Hory & turistika', emoji: '⛰️' },
      { value: 'mesto', label: 'Mesto & pamiatky', emoji: '🏛️' },
      { value: 'wellness', label: 'Wellness & relax', emoji: '💆' },
      { value: 'eurovikend', label: 'Eurovíkend', emoji: '⚡' },
      { value: '', label: 'Prekvap ma', emoji: '🎲' },
    ],
  },
  {
    key: 'region', weight: 10, title: 'Kam ťa to ťahá?',
    hint: 'Klíma a vzdialenosť – alebo nechaj na osud.', type: 'options',
    options: [
      { value: 'stredomorie', label: 'Stredomorie', emoji: '🌊' },
      { value: 'zamorie', label: 'Ďaleké zámorie', emoji: '🌍' },
      { value: 'europa_mesta', label: 'Európske mestá', emoji: '🏙️' },
      { value: 'priroda', label: 'Hory & príroda', emoji: '🏔️' },
      { value: 'domace', label: 'Doma a blízko', emoji: '🏡' },
      { value: '', label: 'Je mi to jedno', emoji: '🧭' },
    ],
  },
  {
    key: 'who', weight: 8, title: 'S kým vyrážaš?',
    hint: 'Pomôže nám vystihnúť atmosféru.', type: 'options',
    options: [
      { value: 'rodina', label: 'Rodina s deťmi', emoji: '👨‍👩‍👧‍👦' },
      { value: 'par', label: 'Vo dvojici', emoji: '💑' },
      { value: 'partia', label: 'S partiou', emoji: '🎉' },
      { value: 'sam', label: 'Sólo dobrodružstvo', emoji: '🎒' },
      { value: '', label: 'Je mi to jedno', emoji: '🤷' },
    ],
  },
  {
    key: 'budget', weight: 24, title: 'Aký je tvoj rozpočet na osobu?',
    hint: 'Posúvaj, kým ti to nesadne. (0 = bez limitu)', type: 'range',
  },
  {
    key: 'month', weight: 12, title: 'Kedy by si chcel/a vyraziť?',
    hint: 'Vyber obdobie alebo nechaj na nás.', type: 'options',
    options: [
      { value: 'jar', label: 'Jar (3–5)', emoji: '🌷' },
      { value: 'leto', label: 'Leto (6–8)', emoji: '☀️' },
      { value: 'jesen', label: 'Jeseň (9–11)', emoji: '🍂' },
      { value: 'zima', label: 'Zima (12–2)', emoji: '❄️' },
      { value: '', label: 'Kedykoľvek', emoji: '🗓️' },
    ],
  },
  {
    key: 'duration', weight: 10, title: 'Ako dlho chceš oddychovať?',
    hint: '', type: 'options',
    options: [
      { value: 'vikend', label: 'Predĺžený víkend (1–4)', emoji: '⚡' },
      { value: 'tyzden', label: 'Týždeň (5–8)', emoji: '🌅' },
      { value: 'dlhe', label: 'Dlhšie (9+)', emoji: '🧘' },
      { value: '', label: 'Je mi to jedno', emoji: '🤷' },
    ],
  },
  {
    key: 'transport', weight: 8, title: 'Ako sa tam chceš dostať?',
    hint: '', type: 'options',
    options: [
      { value: 'letecky', label: 'Letecky', emoji: '✈️' },
      { value: 'autobus', label: 'Autobusom', emoji: '🚌' },
      { value: 'vlastna', label: 'Vlastnou dopravou', emoji: '🚗' },
      { value: '', label: 'Hlavne nech som tam', emoji: '🪄' },
    ],
  },
  {
    key: 'board', weight: 8, title: 'Ako to máš so stravou?',
    hint: '', type: 'options',
    options: [
      { value: 'ai', label: 'All inclusive', emoji: '🍹' },
      { value: 'pp', label: 'Polpenzia', emoji: '🍽️' },
      { value: 'rj', label: 'Len raňajky', emoji: '🥐' },
      { value: 'bez', label: 'Bez stravy', emoji: '🛒' },
      { value: '', label: 'Nezáleží mi', emoji: '🤷' },
    ],
  },
  {
    key: 'comfort', weight: 6, title: 'Aký komfort ubytovania?',
    hint: 'Koľko hviezdičiek ťa robí šťastným?', type: 'options',
    options: [
      { value: '3', label: 'Pohoda ⭐⭐⭐', emoji: '🛏️' },
      { value: '4', label: 'Komfort ⭐⭐⭐⭐', emoji: '🏨' },
      { value: '5', label: 'Luxus ⭐⭐⭐⭐⭐', emoji: '🥂' },
      { value: '', label: 'Nezáleží mi', emoji: '🤷' },
    ],
  },
  {
    key: 'musthaves', weight: 12, title: 'Čo tam nesmie chýbať?',
    hint: 'Môžeš vybrať viac. (alebo nič – sme flexibilní)', type: 'multi',
    options: [
      { value: 'plaz', label: 'Pláž pri hoteli', emoji: '🏖️' },
      { value: 'ai', label: 'All inclusive', emoji: '🍹' },
      { value: 'deti', label: 'Pre deti / aquapark', emoji: '🧒' },
      { value: 'wellness', label: 'Wellness & spa', emoji: '💆' },
      { value: 'nocny', label: 'Nočný život', emoji: '🌃' },
      { value: 'pokoj', label: 'Pokoj a ticho', emoji: '🤫' },
      { value: 'vylety', label: 'Výlety & pamiatky', emoji: '📸' },
    ],
  },
  {
    key: 'priority', weight: 0, title: 'A čo je pre teba najdôležitejšie?',
    hint: 'Podľa toho nastavíme váhy pri výbere.', type: 'options',
    options: [
      { value: 'cena', label: 'Dobrá cena', emoji: '💸' },
      { value: 'komfort', label: 'Komfort & strava', emoji: '🛎️' },
      { value: 'lokalita', label: 'Tá správna destinácia', emoji: '📍' },
      { value: 'zazitky', label: 'Zážitky', emoji: '🎢' },
      { value: '', label: 'Vyvážene', emoji: '⚖️' },
    ],
  },
];

const MONTH_RANGES = { jar: [3,4,5], leto: [6,7,8], jesen: [9,10,11], zima: [12,1,2] };

// váhové násobiče podľa priority klienta
const PRIORITY_BOOST = {
  cena:     { budget: 1.8 },
  komfort:  { board: 1.6, comfort: 1.8 },
  lokalita: { region: 1.7, type: 1.3 },
  zazitky:  { type: 1.4, musthaves: 1.6, who: 1.3 },
};

const MUSTHAVE_RULES = {
  plaz:     /pláž|plaz|more|beach|pri mori|pobrez/,
  ai:       /all\s*inclus/,
  deti:     /det[ií]|deťom|rodin|aquapark|animac|detsk/,
  wellness: /wellness|spa|kúpe|kupel|termal|relax|sauna|bazén|bazen/,
  nocny:    /nočn|nocn|párty|party|zábav|zabav|disko|klub|bary/,
  pokoj:    /pokoj|tich|romant|oddych|kľud|kud/,
  vylety:   /výlet|vylet|poznavac|sprievodca|okruh|pamiatk|galér|galer|histór|histor/,
};

// ── DÁTOVO-RIADENÁ HLÁŠKA (unikátna pre každý zájazd) ────────────────────────
// Vtipný „chvost" vyberáme deterministicky podľa ID, hlavná časť sa skladá
// z konkrétnych údajov (miesto, noci, cena, zľava), takže výsledok je unikátny.
const TAILS = [
  'ber a nerieš 😎', 'toto chce fotku 📸', 'kufre von 🧳', 'ideš? 🙌',
  'dovolenka volá ☎️', 'a je vymaľované 🎨', 'klik a si tam ✈️', 'paráda 🌟',
  'toto poteší 😊', 'žiadne výhovorky 💪', 'sadni a leť 🛫', 'super tip 👌',
  'pohoda istá 🛋️', 'zaslúžiš si to ✨', 'leto v kapse ☀️', 'go go go 🏁',
];

function hashId(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function placeOf(tour) {
  return [...new Set([tour.destination, tour.region, tour.country].filter(Boolean))].join(', ');
}
function dniSlovo(n) { return n === 1 ? 'deň' : (n >= 2 && n <= 4 ? 'dni' : 'dní'); }
// trvanie zájazdu v dňoch – z poľa days (z názvu, inak hotelové noci + 1).
// Fallback na noci+1 zaistí trvanie aj pri staršej zálohe bez poľa days.
function lenLabel(tour) {
  let d = tour.days;
  if (d == null && tour.nights != null) d = tour.nights === 0 ? 1 : tour.nights + 1;
  if (d == null) return '';
  return d === 1 ? '1 deň' : `${d} ${dniSlovo(d)}`;
}
function fmtPrice(p) { return Number(p).toLocaleString('sk-SK'); }

// HTML blok ceny: prečiarknutá pôvodná cena (ak je zľava) + cena "od X €".
function priceBlock(tour, perPerson = true, showOriginal = true) {
  if (typeof tour.price !== 'number') return 'cena na dopyt';
  const os = perPerson ? ' <small>/os.</small>' : '';
  const orig = (showOriginal && tour.originalPrice && tour.originalPrice > tour.price)
    ? `<s class="tc-orig">${fmtPrice(tour.originalPrice)} €</s> ` : '';
  return `${orig}${tour.priceFrom ? 'od ' : ''}${fmtPrice(tour.price)}&nbsp;€${os}`;
}

function tourTagline(tour) {
  const place = tour.destination || tour.country || '';
  const lenTxt = lenLabel(tour);
  const priceTxt = tour.price != null ? `od ${fmtPrice(tour.price)} €` : '';
  const emoji = { more: '🏖️', exotika: '🌴', hory: '⛰️', mesto: '🏛️', wellness: '💆', eurovikend: '⚡', ine: '🧳' }[tour.type] || '🧳';

  const head = [place, lenTxt, priceTxt].filter(Boolean).join(' · ');
  const disc = tour.discount && tour.discount > 0 ? ` · zľava −${tour.discount}%` : '';
  const tail = TAILS[hashId(String(tour.id) + tour.type) % TAILS.length];
  return `${emoji} ${head}${disc} — ${tail}`;
}

const TYPE_LABELS = {
  more: '🏖️ More', exotika: '🌴 Exotika', hory: '⛰️ Hory',
  mesto: '🏛️ Mesto', wellness: '💆 Wellness', eurovikend: '⚡ Eurovíkend', ine: '🧳 Zájazd',
};
const TRANSPORT_LABELS = {
  letecky: '✈️ Letecky', autobus: '🚌 Autobus', vlastna: '🚗 Vlastná', lod: '⛴️ Loď',
};

// =========================================================================
//  POMOCNÉ – normalizácia textu, hviezdičky, strava
// =========================================================================
function deburr(s) { return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

function starsOf(tour) {
  const s = String(tour.accommodation || tour.title || '');
  const byStar = (s.match(/\*/g) || []).length;
  if (byStar >= 3) return Math.min(5, byStar);
  const m = s.match(/([345])\s*(\*|hviezd|star)/i);
  return m ? Number(m[1]) : null;
}

function boardOf(tour) {
  const b = deburr(tour.board);
  if (/all\s*inclus|ultra/.test(b)) return 'ai';
  if (/pol\s*penz|half/.test(b)) return 'pp';
  if (/ranaj|breakfast|^bb$/.test(b)) return 'rj';
  if (/bez\s*strav|vlastn|self/.test(b)) return 'bez';
  return null;
}

function haystackOf(tour) {
  return deburr([tour.title, tour.destination, tour.region, tour.country, tour.description, tour.type, tour.board].join(' '));
}

function regionMatch(tour, region) {
  const c = deburr(tour.country);
  switch (region) {
    case 'stredomorie': return REGION_COUNTRIES.stredomorie.includes(c) || (tour.type === 'more' && !REGION_COUNTRIES.zamorie.includes(c));
    case 'zamorie': return REGION_COUNTRIES.zamorie.includes(c) || tour.type === 'exotika';
    case 'europa_mesta': return tour.type === 'mesto' || tour.type === 'eurovikend';
    case 'priroda': return tour.type === 'hory';
    case 'domace': return REGION_COUNTRIES.domace.includes(c);
    default: return true;
  }
}

// =========================================================================
//  NAČÍTANIE DÁT (server /api/tours, fallback na statické tours.json)
// =========================================================================
async function fetchData() {
  try {
    const r = await fetch('api/tours', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) return await r.json();
  } catch (_) { /* žiadny server – skúsime statický súbor */ }
  // cache-busting: vždy načítame najaktuálnejšiu ponuku, nie starú z cache
  const r2 = await fetch(`tours.json?ts=${Date.now()}`, { cache: 'no-store' });
  return await r2.json();
}

async function loadTours() {
  const data = await fetchData();
  state.tours = data.tours || [];
  state.facets = data.facets || {};
  updateFeedBadge();
  populateFilters();
  fillDestList();
  renderDeals();
  const maxP = Math.max(3000, state.facets.priceMax || 0);
  document.getElementById('fPrice').max = Math.ceil(maxP / 50) * 50;
}

// našepkávač destinácií pre sprievodcu
function fillDestList() {
  const dl = document.getElementById('destList');
  if (!dl) return;
  const places = new Set();
  for (const t of state.tours) { if (t.country) places.add(t.country); if (t.destination) places.add(t.destination); }
  dl.innerHTML = [...places].sort((a, b) => a.localeCompare(b, 'sk'))
    .map((p) => `<option value="${escapeHtml(p)}"></option>`).join('');
}

// AKCIE / LAST MINUTE – najväčšie zľavy na úvodnej obrazovke
function renderDeals() {
  const grid = document.getElementById('dealsGrid');
  const section = document.getElementById('dealsSection');
  if (!grid || !section) return;
  const deals = state.tours
    .filter((t) => t.discount && t.discount > 0 && typeof t.price === 'number')
    .sort((a, b) => b.discount - a.discount)
    .slice(0, 8);
  // ak feed nemá zľavy, ukáž aspoň najlacnejšie ponuky
  const list = deals.length ? deals : state.tours
    .filter((t) => typeof t.price === 'number').sort((a, b) => a.price - b.price).slice(0, 8);
  grid.innerHTML = '';
  for (const t of list) grid.appendChild(renderCard(t, null));
  section.hidden = list.length === 0;
}

function updateFeedBadge() {
  const badge = document.getElementById('feedBadge');
  const n = state.tours.length;
  const terms = state.facets.terms ?? state.tours.reduce((s, t) => s + (t.termsCount || 0), 0);
  badge.textContent = `${n} ${plural(n)} · ${terms} ${pluralTermin(terms)}`;
  badge.className = 'feed-badge';
}

function pluralTermin(n) { return n === 1 ? 'termín' : (n >= 2 && n <= 4 ? 'termíny' : 'termínov'); }

// =========================================================================
//  MATCHOVACÍ ALGORITMUS – % zhody zájazdu so zadaním klienta
// =========================================================================
function scoreTour(tour, a) {
  const boost = PRIORITY_BOOST[a.priority] || {};
  const dims = []; // { w, f }
  const add = (key, w, f) => dims.push({ w: w * (boost[key] || 1), f });

  // typ dovolenky
  if (a.type) {
    let f = 0;
    if (tour.type === a.type) f = 1;
    else if ((a.type === 'more' && tour.type === 'exotika') || (a.type === 'exotika' && tour.type === 'more')) f = 0.5;
    else if ((a.type === 'mesto' && tour.type === 'eurovikend') || (a.type === 'eurovikend' && tour.type === 'mesto')) f = 0.7;
    add('type', 22, f);
  }
  // konkrétna destinácia (text z našepkávača) – silná váha
  if (a.destination && a.destination.trim()) {
    const q = deburr(a.destination.trim());
    const hay = deburr([tour.country, tour.destination, tour.title].join(' '));
    add('destination', 18, hay.includes(q) ? 1 : 0);
  }
  // región
  if (a.region) add('region', 10, regionMatch(tour, a.region) ? 1 : 0);

  // s kým
  if (a.who) {
    const hay = haystackOf(tour);
    const rules = {
      rodina: /rodin|det[ií]|deťom|detsk|aquapark|animac/,
      par: /par|romant|dvoj|svadob|wellness|relax/,
      partia: /parti|priatel|zábav|zabav|nocn|mesto|klub/,
      sam: /solo|individu|poznavac|treking|treck/,
    };
    add('who', 8, rules[a.who]?.test(hay) ? 1 : 0.3);
  }
  // rozpočet
  if (a.budget && a.budget > 0 && typeof tour.price === 'number') {
    let f;
    if (tour.price <= a.budget) f = 0.7 + 0.3 * (tour.price / a.budget);
    else f = Math.max(0, 1 - 2 * ((tour.price - a.budget) / a.budget));
    add('budget', 24, f);
  }
  // termín / obdobie
  if (a.month && MONTH_RANGES[a.month] && tour.month) {
    add('month', 12, MONTH_RANGES[a.month].includes(tour.month) ? 1 : 0);
  }
  // dĺžka (počítame v dňoch)
  if (a.duration && tour.days) {
    const d = tour.days;
    const ok = (a.duration === 'vikend' && d <= 4) || (a.duration === 'tyzden' && d >= 5 && d <= 8) || (a.duration === 'dlhe' && d >= 9);
    add('duration', 10, ok ? 1 : 0.3);
  }
  // doprava
  if (a.transport && tour.transport) add('transport', 8, tour.transport === a.transport ? 1 : 0);

  // strava
  if (a.board) {
    const b = boardOf(tour);
    if (b) add('board', 8, b === a.board ? 1 : 0.2);
  }
  // komfort / hviezdičky
  if (a.comfort) {
    const st = starsOf(tour);
    if (st) {
      const diff = Math.abs(st - Number(a.comfort));
      add('comfort', 6, diff === 0 ? 1 : diff === 1 ? 0.6 : 0.2);
    }
  }
  // must-have požiadavky (multi)
  if (Array.isArray(a.musthaves) && a.musthaves.length) {
    const hay = haystackOf(tour);
    const matched = a.musthaves.filter((m) => MUSTHAVE_RULES[m]?.test(hay)).length;
    add('musthaves', 12, matched / a.musthaves.length);
  }

  const wSum = dims.reduce((s, d) => s + d.w, 0);
  if (wSum === 0) return 60;
  const got = dims.reduce((s, d) => s + d.w * d.f, 0);
  return Math.round((got / wSum) * 100);
}

// =========================================================================
//  SPRIEVODCA
// =========================================================================
// úvodný (domovský) stav pomocníka – logo naň odkazuje
function showHome() {
  state.mode = 'quiz';
  document.getElementById('wizard').hidden = true;
  document.getElementById('resultsSection').hidden = true;
  document.getElementById('filters').hidden = true;
  document.getElementById('dealsSection').hidden = false;
  closeModal();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startQuiz() {
  state.mode = 'quiz';
  state.step = 0;
  state.answers = {};
  document.getElementById('dealsSection').hidden = true;
  document.getElementById('wizard').hidden = false;
  document.getElementById('resultsSection').hidden = true;
  document.getElementById('filters').hidden = true;
  renderStep();
  document.getElementById('wizard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderStep() {
  const step = STEPS[state.step];
  const body = document.getElementById('wizardBody');
  document.getElementById('stepCounter').textContent = `${state.step + 1} / ${STEPS.length}`;
  document.getElementById('progressBar').style.width = `${(state.step / STEPS.length) * 100}%`;
  document.getElementById('backBtn').style.visibility = state.step === 0 ? 'hidden' : 'visible';
  const last = state.step === STEPS.length - 1;
  document.getElementById('nextBtn').textContent = last ? '🎉 Nájsť zájazd' : 'Ďalej →';

  let html = `<h2 class="q-title">${step.title}</h2>`;
  if (step.hint) html += `<p class="q-hint">${step.hint}</p>`;

  if (step.type === 'options' || step.type === 'multi') {
    const cur = step.type === 'multi' ? (state.answers[step.key] || []) : state.answers[step.key];
    html += '<div class="option-grid">';
    for (const opt of step.options) {
      const sel = step.type === 'multi' ? cur.includes(opt.value) : cur === opt.value;
      html += `<button class="option ${sel ? 'selected' : ''}" data-value="${opt.value}">
                 <span class="emoji">${opt.emoji}</span><span>${opt.label}</span></button>`;
    }
    html += '</div>';
  } else if (step.type === 'range') {
    const val = state.answers.budget ?? 800;
    html += `<div class="range-wrap">
        <div class="range-value" id="budgetVal">${val === 0 ? 'Bez limitu' : val + ' €'}</div>
        <input type="range" id="budgetRange" min="0" max="3000" step="50" value="${val}" />
        <div style="display:flex;justify-content:space-between;color:var(--muted);font-weight:700;font-size:.85rem;margin-top:6px">
          <span>0 €</span><span>3000 €+</span></div></div>`;
  } else if (step.type === 'search') {
    const val = escapeHtml(state.answers[step.key] || '');
    html += `<div class="search-wrap">
        <input type="text" id="destInput" list="destList" autocomplete="off"
          placeholder="napr. Grécko, Egypt, Tatry…" value="${val}" />
        <p class="q-hint" style="margin-top:10px">Tip: nechaj prázdne a klikni „Ďalej", ak chceš nechať výber na nás.</p>
      </div>`;
  }
  body.innerHTML = html;

  if (step.type === 'options') {
    body.querySelectorAll('.option').forEach((el) => el.addEventListener('click', () => {
      state.answers[step.key] = el.dataset.value;
      body.querySelectorAll('.option').forEach((o) => o.classList.remove('selected'));
      el.classList.add('selected');
      setTimeout(nextStep, 200);
    }));
  } else if (step.type === 'multi') {
    if (!Array.isArray(state.answers[step.key])) state.answers[step.key] = [];
    body.querySelectorAll('.option').forEach((el) => el.addEventListener('click', () => {
      const arr = state.answers[step.key];
      const v = el.dataset.value;
      const i = arr.indexOf(v);
      if (i >= 0) { arr.splice(i, 1); el.classList.remove('selected'); }
      else { arr.push(v); el.classList.add('selected'); }
    }));
  } else if (step.type === 'range') {
    const range = document.getElementById('budgetRange');
    const label = document.getElementById('budgetVal');
    if (state.answers.budget == null) state.answers.budget = Number(range.value);
    range.addEventListener('input', () => {
      const v = Number(range.value);
      state.answers.budget = v;
      label.textContent = v === 0 ? 'Bez limitu' : v + ' €';
    });
  } else if (step.type === 'search') {
    const input = document.getElementById('destInput');
    input.addEventListener('input', () => { state.answers[step.key] = input.value; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') nextStep(); });
  }
}

function scrollWizardTop() {
  const w = document.getElementById('wizard');
  if (!w || w.hidden) return;
  const y = w.getBoundingClientRect().top + window.scrollY - 64; // odpočet lepkavej hlavičky
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
}
function nextStep() { if (state.step < STEPS.length - 1) { state.step++; renderStep(); scrollWizardTop(); } else finishQuiz(); }
function prevStep() { if (state.step > 0) { state.step--; renderStep(); scrollWizardTop(); } }

// Zabráni „ghost clicku" na mobile: tesne po vykreslení výsledkov ignorujeme
// kliknutia na karty, aby sa hneď neotvoril detál (dotyk z poslednej voľby).
let cardClickGuardUntil = 0;

function finishQuiz() {
  document.getElementById('progressBar').style.width = '100%';
  state.mode = 'quiz';
  document.getElementById('wizard').hidden = true;
  cardClickGuardUntil = Date.now() + 700;
  track('Sprievodca dokončený', { typ: state.answers.type || '—', region: state.answers.region || '—' });
  showResults();
  document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
}

// =========================================================================
//  VÝSLEDKY
// =========================================================================
function showResults() {
  document.getElementById('resultsSection').hidden = false;
  applyFiltersFromAnswers();
  renderResults();
}

function applyFiltersFromAnswers() {
  if (state.mode !== 'quiz') return;
  const a = state.answers;
  document.getElementById('fType').value = a.type || '';
  document.getElementById('fTransport').value = a.transport || '';
  const price = document.getElementById('fPrice');
  price.value = a.budget && a.budget > 0 ? a.budget : price.max;
  document.getElementById('fPriceLabel').textContent = (a.budget && a.budget > 0) ? a.budget + ' €' : 'bez limitu';
  document.getElementById('fCountry').value = '';
  document.getElementById('fMonth').value = '';
  document.getElementById('fSearch').value = '';
}

// zoradenie podľa voľby používateľa (prepíše predvolené poradie)
function applySort(list) {
  const sort = state.sort;
  const num = (v, d) => (typeof v === 'number' ? v : d);
  if (sort === 'price') list.sort((a, b) => num(a.tour.price, 1e9) - num(b.tour.price, 1e9));
  else if (sort === 'discount') list.sort((a, b) => num(b.tour.discount, 0) - num(a.tour.discount, 0));
  else if (sort === 'date') list.sort((a, b) => String(a.tour.dateFrom || '9999').localeCompare(String(b.tour.dateFrom || '9999')));
  return list;
}

function computeList() {
  let list;
  if (state.mode === 'quiz') {
    list = state.tours
      .map((t) => ({ tour: t, score: scoreTour(t, state.answers) }))
      .sort((x, y) => y.score - x.score)
      .filter((x) => x.score >= 30)
      .slice(0, 12);
  } else {
    const f = {
      country: document.getElementById('fCountry').value,
      type: document.getElementById('fType').value,
      transport: document.getElementById('fTransport').value,
      price: Number(document.getElementById('fPrice').value),
      month: document.getElementById('fMonth').value,
      search: deburr(document.getElementById('fSearch').value.trim()),
    };
    const maxAllowed = Number(document.getElementById('fPrice').max);
    list = state.tours
      .filter((t) => !f.country || t.country === f.country)
      .filter((t) => !f.type || t.type === f.type)
      .filter((t) => !f.transport || t.transport === f.transport)
      .filter((t) => f.price >= maxAllowed || typeof t.price !== 'number' || t.price <= f.price)
      .filter((t) => !f.month || t.month === Number(f.month))
      .filter((t) => !f.search || deburr(t.title + ' ' + t.description + ' ' + t.destination + ' ' + t.country).includes(f.search))
      .map((t) => ({ tour: t, score: null }));
  }
  if (state.sort) applySort(list);
  return list;
}

function renderResults() {
  const list = computeList();
  const grid = document.getElementById('cardsGrid');
  const empty = document.getElementById('emptyState');
  const meta = document.getElementById('resultsMeta');
  const title = document.getElementById('resultsTitle');

  if (state.mode === 'quiz') {
    title.textContent = 'Tvoje zájazdy na mieru 🎯';
    const top = list[0];
    meta.textContent = top ? `Najlepšia zhoda: ${top.score}% · ukazujeme ${list.length} ${plural(list.length)} zoradených podľa zhody.` : '';
  } else {
    title.textContent = 'Ponuka zájazdov';
    meta.textContent = `${list.length} ${plural(list.length)} podľa filtrov.`;
  }

  grid.innerHTML = '';
  empty.hidden = list.length > 0;
  for (const { tour, score } of list) grid.appendChild(renderCard(tour, score));
}

function plural(n) { return n === 1 ? 'zájazd' : (n >= 2 && n <= 4 ? 'zájazdy' : 'zájazdov'); }

function renderCard(tour, score) {
  const el = document.createElement('article');
  el.className = 'tour-card card';
  const img = tour.image || `https://picsum.photos/seed/${encodeURIComponent(tour.id)}/640/420`;
  const priceHtml = priceBlock(tour);
  const matchBadge = score != null ? `<span class="tc-match">${score}% zhoda</span>` : '';

  const meta = [];
  if (tour.transport && TRANSPORT_LABELS[tour.transport]) meta.push(TRANSPORT_LABELS[tour.transport]);
  if (lenLabel(tour)) meta.push(`🗓️ ${lenLabel(tour)}`);
  if (tour.board) meta.push(`🍽️ ${tour.board}`);
  if (tour.discount && tour.discount > 0) meta.push(`🔖 −${tour.discount}%`);

  el.innerHTML = `
    <div class="tc-img">
      <img class="tc-thumb" src="${img}" alt="${escapeHtml(tour.title)}" loading="lazy" decoding="async" />
      ${matchBadge}
      <span class="tc-type">${TYPE_LABELS[tour.type] || '🧳 Zájazd'}</span>
    </div>
    <div class="tc-body">
      <div class="tc-title">${escapeHtml(tour.title)}</div>
      <div class="tc-place">📍 ${escapeHtml(placeOf(tour)) || '—'}</div>
      ${score != null ? `<div class="tc-quip">${escapeHtml(tourTagline(tour))}</div>` : ''}
      <div class="tc-meta">${meta.map((m) => `<span class="chip">${m}</span>`).join('')}</div>
      <div class="tc-foot">
        <span class="tc-price">${priceHtml}</span>
        <span class="tc-foot-actions">
          <button class="cmp-toggle ${state.compare.includes(String(tour.id)) ? 'on' : ''}" title="Pridať do porovnania">⚖️</button>
          <span class="btn btn-primary" style="padding:8px 16px;font-size:.9rem">Detail</span>
        </span>
      </div>
    </div>`;
  el.querySelector('.cmp-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCompare(tour.id);
  });
  el.addEventListener('click', () => {
    if (Date.now() < cardClickGuardUntil) return; // ignoruj „ghost click" po výsledkoch
    openModal(tour, score);
  });
  return el;
}

// =========================================================================
//  POROVNANIE ZÁJAZDOV
// =========================================================================
const COMPARE_MAX = 4;

function toggleCompare(id) {
  id = String(id);
  const i = state.compare.indexOf(id);
  if (i >= 0) state.compare.splice(i, 1);
  else {
    if (state.compare.length >= COMPARE_MAX) {
      alert(`Naraz vieš porovnať najviac ${COMPARE_MAX} zájazdy.`);
      return;
    }
    state.compare.push(id);
  }
  // prekresli viditeľné karty, aby sa zhodoval stav prepínačov
  if (!document.getElementById('dealsSection').hidden) renderDeals();
  if (!document.getElementById('resultsSection').hidden) renderResults();
  updateCompareBar();
}

function updateCompareBar() {
  const bar = document.getElementById('compareBar');
  const info = document.getElementById('compareInfo');
  const n = state.compare.length;
  bar.hidden = n === 0;
  info.textContent = `${n} ${n === 1 ? 'zájazd vybraný' : (n >= 2 && n <= 4 ? 'zájazdy vybrané' : 'zájazdov vybraných')} na porovnanie`;
  document.getElementById('compareOpen').disabled = n < 2;
}

function clearCompare() {
  state.compare = [];
  document.querySelectorAll('.cmp-toggle.on').forEach((b) => b.classList.remove('on'));
  updateCompareBar();
}

function openCompare() {
  const tours = state.compare.map((id) => state.tours.find((t) => String(t.id) === id)).filter(Boolean);
  if (tours.length < 2) return;
  track('Porovnanie', { pocet: tours.length });
  const overlay = document.getElementById('compareOverlay');
  const modal = document.getElementById('compareModal');

  const rows = [
    ['Cena', (t) => priceBlock(t, false, false)],
    ['Pôvodná cena', (t) => (t.originalPrice && t.originalPrice > t.price ? `${fmtPrice(t.originalPrice)} €` : '—')],
    ['Zľava', (t) => (t.discount ? `−${t.discount}%` : '—')],
    ['Typ', (t) => TYPE_LABELS[t.type] || '—'],
    ['Miesto', (t) => escapeHtml(placeOf(t)) || '—'],
    ['Doprava', (t) => (TRANSPORT_LABELS[t.transport] || '—')],
    ['Dĺžka', (t) => (lenLabel(t) || '—')],
    ['Strava', (t) => (t.board || '—')],
    ['Najbližší termín', (t) => (t.dateFrom ? fmtDate(t.dateFrom) : '—')],
    ['Počet termínov', (t) => (t.termsCount || '—')],
  ];

  const head = tours.map((t) => {
    const img = t.image || `https://picsum.photos/seed/${encodeURIComponent(t.id)}/300/200`;
    return `<th><img src="${img}" alt="" loading="lazy" /><div class="cmp-title">${escapeHtml(t.title)}</div></th>`;
  }).join('');

  const body = rows.map(([label, fn]) =>
    `<tr><th class="cmp-label">${label}</th>${tours.map((t) => `<td>${fn(t)}</td>`).join('')}</tr>`
  ).join('');

  const foot = tours.map((t) => `<td>${t.url ? `<a class="btn btn-primary" style="padding:8px 14px;font-size:.88rem" href="${t.url}" target="_blank" rel="noopener">Detail ↗</a>` : ''}</td>`).join('');

  modal.innerHTML = `
    <div class="modal-content">
      <button class="btn btn-ghost" id="closeCompare" style="float:right">✕</button>
      <h3>Porovnanie zájazdov</h3>
      <div class="cmp-scroll">
        <table class="cmp-table">
          <thead><tr><th></th>${head}</tr></thead>
          <tbody>${body}<tr><th class="cmp-label"></th>${foot}</tr></tbody>
        </table>
      </div>
    </div>`;
  overlay.hidden = false;
  document.getElementById('closeCompare').addEventListener('click', () => { overlay.hidden = true; });
}

// =========================================================================
//  DETAIL (modálne okno)
// =========================================================================
function openModal(tour, score) {
  const overlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('modal');
  const img = tour.image || `https://picsum.photos/seed/${encodeURIComponent(tour.id)}/800/450`;
  const term = (tour.dateFrom && tour.dateTo && tour.dateFrom !== tour.dateTo)
    ? `${fmtDate(tour.dateFrom)} – ${fmtDate(tour.dateTo)}`
    : (tour.dateFrom ? fmtDate(tour.dateFrom) : '');

  const chips = [];
  if (tour.type) chips.push(TYPE_LABELS[tour.type] || tour.type);
  if (tour.transport && TRANSPORT_LABELS[tour.transport]) chips.push(TRANSPORT_LABELS[tour.transport]);
  if (lenLabel(tour)) chips.push(`🗓️ ${lenLabel(tour)}`);
  if (tour.board) chips.push(`🍽️ ${tour.board}`);
  if (tour.accommodation) chips.push(`🏨 ${tour.accommodation}`);
  if (tour.discount && tour.discount > 0) chips.push(`🔖 zľava −${tour.discount}%`);

  // kalendár termínov (#7)
  const terms = Array.isArray(tour.terms) ? tour.terms : [];
  let termsHtml = '';
  if (terms.length) {
    const rows = terms.map((t) => {
      const range = (t.from && t.to && t.from !== t.to) ? `${fmtDate(t.from)} – ${fmtDate(t.to)}` : fmtDate(t.from || t.to);
      const orig = (t.orig && t.orig > t.price) ? `<s class="tc-orig">${fmtPrice(t.orig)} €</s> ` : '';
      const disc = (t.discount && t.discount > 0) ? ` <span class="term-disc">−${t.discount}%</span>` : '';
      return `<li class="term-row"><span>📅 ${range}</span><span class="term-price">${orig}${fmtPrice(t.price)} €${disc}</span></li>`;
    }).join('');
    termsHtml = `<div class="terms-cal"><h4>Dostupné termíny (${terms.length})</h4><ul class="term-list">${rows}</ul></div>`;
  }

  // predvyplnený dopytový e-mail (#1)
  const subject = `Záujem o zájazd: ${tour.title} (kód ${tour.id})`;
  const bodyLines = [
    'Dobrý deň,', '',
    `mám záujem o zájazd: ${tour.title} (kód ${tour.id}).`,
    typeof tour.price === 'number' ? `Cena od ${fmtPrice(tour.price)} € / os.` : '',
    term ? `Termín: ${term}` : '',
    tour.url ? `Odkaz: ${tour.url}` : '',
    '', 'Prosím o viac informácií. Ďakujem.',
  ].filter(Boolean);
  const mailto = `mailto:info@ckdaka.sk?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;

  modal.innerHTML = `
    <img class="modal-img" src="${img}" alt="${escapeHtml(tour.title)}" loading="lazy" />
    <div class="modal-content">
      <button class="btn btn-ghost" id="closeModal" style="float:right">✕</button>
      ${score != null ? `<span class="tc-match" style="position:static;display:inline-block;margin-bottom:8px">${score}% zhoda s tvojím zadaním</span>` : ''}
      <h3>${escapeHtml(tour.title)}</h3>
      <div class="tc-place">📍 ${escapeHtml(placeOf(tour)) || '—'}</div>
      <div class="modal-row">${chips.map((c) => `<span class="chip">${escapeHtml(String(c))}</span>`).join('')}</div>
      <p class="modal-desc">${escapeHtml(tour.description || 'Detailný popis nájdeš na stránke zájazdu.')}</p>
      ${termsHtml}
      <div class="modal-foot">
        <span class="tc-price">${priceBlock(tour)}</span>
        <span class="modal-actions">
          <button class="btn btn-ghost btn-icon" id="shareBtn" title="Skopírovať odkaz na tento zájazd">🔗</button>
          <a class="btn btn-ghost" id="askBtn" href="${mailto}">Spýtať sa na zájazd</a>
          ${tour.url ? `<a class="btn btn-primary" href="${tour.url}" target="_blank" rel="noopener">Detail zájazdu ↗</a>` : ''}
        </span>
      </div>
    </div>`;
  overlay.hidden = false;
  track('Detail zájazdu', { nazov: tour.title });
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('shareBtn').addEventListener('click', () => shareTour(tour));
  document.getElementById('askBtn').addEventListener('click', () => track('Spýtať sa', { nazov: tour.title }));
  // deep-link (#6)
  try { history.replaceState(null, '', `#zajazd=${encodeURIComponent(tour.id)}`); } catch (_) {}
}

function closeModal() {
  document.getElementById('modalOverlay').hidden = true;
  if (location.hash.startsWith('#zajazd=')) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
  }
}

async function shareTour(tour) {
  const url = `${location.origin}${location.pathname}#zajazd=${encodeURIComponent(tour.id)}`;
  const data = { title: tour.title, text: `${tour.title} – CK DAKA`, url };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(url);
    const btn = document.getElementById('shareBtn');
    if (btn) { btn.textContent = '✅ Odkaz skopírovaný'; setTimeout(() => { btn.textContent = '🔗 Zdieľať'; }, 1800); }
  } catch (_) { /* používateľ zrušil zdieľanie */ }
}

function openTourById(id) {
  const tour = state.tours.find((t) => String(t.id) === String(id));
  if (tour) openModal(tour, null);
}

// =========================================================================
//  DETAILNÉ FILTRE / BROWSE
// =========================================================================
function populateFilters() {
  fillSelect('fCountry', state.facets.countries || []);
  fillSelect('fType', state.facets.types || [], (v) => TYPE_LABELS[v] || v);
  fillSelect('fTransport', state.facets.transports || [], (v) => TRANSPORT_LABELS[v] || v);
  const price = document.getElementById('fPrice');
  document.getElementById('fPriceLabel').textContent = price.max + ' €';
}
function fillSelect(id, values, labelFn) {
  const sel = document.getElementById(id);
  sel.length = 1;
  for (const v of values) {
    const o = document.createElement('option');
    o.value = v; o.textContent = labelFn ? labelFn(v) : v;
    sel.appendChild(o);
  }
}

function browseAll() {
  state.mode = 'browse';
  document.getElementById('dealsSection').hidden = true;
  document.getElementById('wizard').hidden = true;
  document.getElementById('resultsSection').hidden = false;
  document.getElementById('filters').hidden = false;
  document.getElementById('fPrice').value = document.getElementById('fPrice').max;
  document.getElementById('fPriceLabel').textContent = 'bez limitu';
  renderResults();
  document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
}

// =========================================================================
//  POMOCNÉ
// =========================================================================
function fmtDate(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${Number(d)}.${Number(m)}.${y}`; }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// =========================================================================
//  INICIALIZÁCIA + EVENTY
// =========================================================================
function bind() {
  document.getElementById('startQuizBtn').addEventListener('click', startQuiz);
  document.getElementById('browseAllBtn').addEventListener('click', browseAll);
  document.getElementById('dealsBrowseBtn').addEventListener('click', browseAll);
  document.getElementById('nextBtn').addEventListener('click', nextStep);
  document.getElementById('backBtn').addEventListener('click', prevStep);
  document.getElementById('restartBtn').addEventListener('click', startQuiz);

  // logo → úvod pomocníka
  document.getElementById('homeLink').addEventListener('click', (e) => { e.preventDefault(); showHome(); });

  // triedenie výsledkov
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderResults();
  });

  document.getElementById('toggleFiltersBtn').addEventListener('click', () => {
    const f = document.getElementById('filters');
    f.hidden = !f.hidden;
    if (!f.hidden) { state.mode = 'browse'; renderResults(); }
  });

  ['fCountry', 'fType', 'fTransport', 'fMonth', 'fSearch'].forEach((id) =>
    document.getElementById(id).addEventListener('input', () => { state.mode = 'browse'; renderResults(); }));
  const price = document.getElementById('fPrice');
  price.addEventListener('input', () => {
    const v = Number(price.value);
    document.getElementById('fPriceLabel').textContent = v >= Number(price.max) ? 'bez limitu' : v + ' €';
    state.mode = 'browse'; renderResults();
  });

  document.getElementById('modalOverlay').addEventListener('click', (e) => { if (e.target.id === 'modalOverlay') closeModal(); });

  // porovnanie
  document.getElementById('compareClear').addEventListener('click', clearCompare);
  document.getElementById('compareOpen').addEventListener('click', openCompare);
  document.getElementById('compareOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'compareOverlay') document.getElementById('compareOverlay').hidden = true;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeModal();
    document.getElementById('compareOverlay').hidden = true;
  });
}

(async function init() {
  bind();
  try {
    await loadTours();
    // deep-link: ak je v URL #zajazd=<id>, otvor detail (#6)
    const m = location.hash.match(/^#zajazd=(.+)$/);
    if (m) openTourById(decodeURIComponent(m[1]));
  } catch (e) {
    document.getElementById('feedBadge').textContent = 'chyba načítania';
    console.error(e);
  }
  // PWA – service worker (pridať na plochu + offline)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
