/* =========================================================================
   CK Daka – sprievodca výberom zájazdov (frontend)
   ========================================================================= */

const state = {
  tours: [],
  facets: null,
  answers: {},      // odpovede zo sprievodcu
  step: 0,
  mode: 'quiz',     // 'quiz' | 'browse'
};

// ── KROKY SPRIEVODCU ────────────────────────────────────────────────────────
// Každý krok mapuje odpoveď na kľúč v state.answers a podieľa sa na skóre.
const STEPS = [
  {
    key: 'type',
    title: 'Po akej dovolenke túžiš?',
    hint: 'Vyber náladu – ostatné doladíme.',
    type: 'options',
    options: [
      { value: 'more', label: 'More & pláž', emoji: '🏖️' },
      { value: 'exotika', label: 'Exotika', emoji: '🌴' },
      { value: 'hory', label: 'Hory & turistika', emoji: '⛰️' },
      { value: 'mesto', label: 'Mesto & pamiatky', emoji: '🏛️' },
      { value: 'wellness', label: 'Wellness & relax', emoji: '💆' },
      { value: '', label: 'Prekvap ma', emoji: '🎲' },
    ],
  },
  {
    key: 'who',
    title: 'S kým vyrážaš?',
    hint: 'Pomôže nám to vybrať atmosféru zájazdu.',
    type: 'options',
    options: [
      { value: 'rodina', label: 'Rodina s deťmi', emoji: '👨‍👩‍👧‍👦' },
      { value: 'par', label: 'Vo dvojici', emoji: '💑' },
      { value: 'partia', label: 'S partiou', emoji: '🎉' },
      { value: 'sam', label: 'Sólo dobrodružstvo', emoji: '🎒' },
      { value: '', label: 'Je mi to jedno', emoji: '🤷' },
    ],
  },
  {
    key: 'budget',
    title: 'Aký je tvoj rozpočet na osobu?',
    hint: 'Posúvaj, kým ti to nesadne. (0 = bez limitu)',
    type: 'range',
  },
  {
    key: 'month',
    title: 'Kedy by si chcel/a vyraziť?',
    hint: 'Vyber obdobie alebo nechaj na nás.',
    type: 'options',
    options: [
      { value: 'jar', label: 'Jar (3–5)', emoji: '🌷' },
      { value: 'leto', label: 'Leto (6–8)', emoji: '☀️' },
      { value: 'jesen', label: 'Jeseň (9–11)', emoji: '🍂' },
      { value: 'zima', label: 'Zima (12–2)', emoji: '❄️' },
      { value: '', label: 'Kedykoľvek', emoji: '🗓️' },
    ],
  },
  {
    key: 'duration',
    title: 'Ako dlho chceš oddychovať?',
    hint: '',
    type: 'options',
    options: [
      { value: 'vikend', label: 'Predĺžený víkend (1–4)', emoji: '⚡' },
      { value: 'tyzden', label: 'Týždeň (5–8)', emoji: '🌅' },
      { value: 'dlhe', label: 'Dlhšie (9+)', emoji: '🧘' },
      { value: '', label: 'Je mi to jedno', emoji: '🤷' },
    ],
  },
  {
    key: 'transport',
    title: 'Ako sa tam chceš dostať?',
    hint: '',
    type: 'options',
    options: [
      { value: 'letecky', label: 'Letecky', emoji: '✈️' },
      { value: 'autobus', label: 'Autobusom', emoji: '🚌' },
      { value: 'vlastna', label: 'Vlastnou dopravou', emoji: '🚗' },
      { value: '', label: 'Hlavne nech som tam', emoji: '🪄' },
    ],
  },
];

const MONTH_RANGES = {
  jar:   [3, 4, 5],
  leto:  [6, 7, 8],
  jesen: [9, 10, 11],
  zima:  [12, 1, 2],
};

// ── VTIPNÉ HLÁŠKY ────────────────────────────────────────────────────────────
const QUIPS = {
  more: ['More volá a ty musíš ísť. 🌊', 'Plavky už balíš, však? 🩱', 'Piesok všade. Ale stojí to za to. 🏖️'],
  exotika: ['Pas po ruke, dobrodružstvo čaká! 🛂', 'Toto bude story na celý rok. 🐠', 'Palmy, koktail, ty. ✅'],
  hory: ['Čerstvý vzduch a žiadny signál – paráda. 🏔️', 'Nohy ťa potom budú nenávidieť (v dobrom). 🥾', 'Výhľady ako z plagátu. 📸'],
  mesto: ['Kávička, galéria, fotka pri pamiatke. 📷', 'Krok-meter dnes nestíha. 🚶', 'Kultúra a dobré jedlo v jednom. 🍝'],
  wellness: ['Relax level: maximum. 💆', 'Telefón vypni, vaňu napusti. 🛁', 'Toto si zaslúžiš. ✨'],
  exotika_lux: ['Toto nie je dovolenka, to je životná udalosť. 💍'],
  cheap: ['A do peňaženky to ani nebolí. 💸'],
  default: ['Toto by mohlo sadnúť! 👌', 'Solídna voľba. 🌟', 'Pekný kúsok z ponuky. 🧳'],
};

const TYPE_LABELS = {
  more: '🏖️ More', exotika: '🌴 Exotika', hory: '⛰️ Hory',
  mesto: '🏛️ Mesto', wellness: '💆 Wellness', eurovikend: '⚡ Eurovíkend', ine: '🧳 Zájazd',
};
const TRANSPORT_LABELS = {
  letecky: '✈️ Letecky', autobus: '🚌 Autobus', vlastna: '🚗 Vlastná', lod: '⛴️ Loď',
};

// =========================================================================
//  NAČÍTANIE DÁT
// =========================================================================
async function loadTours() {
  const res = await fetch('/api/tours');
  const data = await res.json();
  state.tours = data.tours || [];
  state.facets = data.facets || {};
  updateFeedBadge(data);
  populateFilters();
  // nastav rozsah rozpočtu podľa reálnych cien
  const maxP = Math.max(3000, state.facets.priceMax || 0);
  const priceEl = document.getElementById('fPrice');
  priceEl.max = Math.ceil(maxP / 50) * 50;
}

function updateFeedBadge(data) {
  const badge = document.getElementById('feedBadge');
  const feedUrlEl = document.getElementById('feedUrl');
  if (data.feedUrl) feedUrlEl.textContent = data.feedUrl.replace(/^https?:\/\//, '');
  const n = state.tours.length;
  if (data.source === 'live') {
    badge.textContent = `● naživo · ${n} zájazdov`;
    badge.className = 'feed-badge live';
  } else if (data.source === 'sample') {
    badge.textContent = `● ukážka · ${n} zájazdov`;
    badge.className = 'feed-badge sample';
    badge.title = 'Živý feed nedostupný (sieť) – zobrazujem ukážkové dáta. ' + (data.error || '');
  } else {
    badge.textContent = 'feed nedostupný';
    badge.className = 'feed-badge';
  }
}

// =========================================================================
//  MATCHOVACÍ ALGORITMUS – skóre zhody zájazdu so zadaním klienta
// =========================================================================
function scoreTour(tour, a) {
  let score = 0, max = 0;

  // typ dovolenky (váha 30)
  if (a.type) {
    max += 30;
    if (tour.type === a.type) score += 30;
    else if (a.type === 'more' && tour.type === 'exotika') score += 14; // príbuzné
    else if (a.type === 'exotika' && tour.type === 'more') score += 14;
  }

  // rozpočet (váha 28) – v rámci => plný bod, mierne nad => čiastočne
  if (a.budget && a.budget > 0 && typeof tour.price === 'number') {
    max += 28;
    if (tour.price <= a.budget) {
      // čím viac pod rozpočtom, tým lepšie (do rozumnej miery)
      const ratio = tour.price / a.budget;
      score += 28 * (0.7 + 0.3 * ratio); // 19.6–28
    } else {
      const over = (tour.price - a.budget) / a.budget;
      score += Math.max(0, 28 * (1 - over * 2)); // postupný prepad
    }
  }

  // termín / obdobie (váha 16)
  if (a.month && MONTH_RANGES[a.month] && tour.month) {
    max += 16;
    if (MONTH_RANGES[a.month].includes(tour.month)) score += 16;
  }

  // dĺžka (váha 12)
  if (a.duration && tour.nights) {
    max += 12;
    const n = tour.nights;
    const ok = (a.duration === 'vikend' && n <= 4) ||
               (a.duration === 'tyzden' && n >= 5 && n <= 8) ||
               (a.duration === 'dlhe' && n >= 9);
    if (ok) score += 12; else score += 4;
  }

  // doprava (váha 8)
  if (a.transport && tour.transport) {
    max += 8;
    if (tour.transport === a.transport) score += 8;
  }

  // s kým (váha 6) – heuristika z popisu
  if (a.who) {
    max += 6;
    const hay = (tour.description + ' ' + tour.title + ' ' + tour.type).toLowerCase();
    const rules = {
      rodina: /(rodin|deti|deťom|detsk|aquapark|animac)/,
      par: /(pár|romant|dvoj|svadob|wellness)/,
      partia: /(parti|priateľ|zábav|nočn|mesto)/,
      sam: /(sólo|individu|poznavac|treking)/,
    };
    if (rules[a.who]?.test(hay)) score += 6; else score += 2;
  }

  // ak používateľ nič nešpecifikoval, nech to nespadne na 0
  if (max === 0) return 60;
  return Math.round((score / max) * 100);
}

function quipFor(tour) {
  if (tour.type === 'exotika' && (tour.price || 0) > 1200) return pick(QUIPS.exotika_lux);
  if ((tour.price || 9999) < 280) return pick(QUIPS.cheap);
  return pick(QUIPS[tour.type] || QUIPS.default);
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// =========================================================================
//  SPRIEVODCA
// =========================================================================
function startQuiz() {
  state.mode = 'quiz';
  state.step = 0;
  state.answers = {};
  document.getElementById('wizard').hidden = false;
  document.getElementById('resultsSection').hidden = true;
  renderStep();
  document.getElementById('wizard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderStep() {
  const step = STEPS[state.step];
  const body = document.getElementById('wizardBody');
  document.getElementById('stepCounter').textContent = `${state.step + 1} / ${STEPS.length}`;
  document.getElementById('progressBar').style.width = `${(state.step / STEPS.length) * 100}%`;
  document.getElementById('backBtn').style.visibility = state.step === 0 ? 'hidden' : 'visible';
  document.getElementById('nextBtn').textContent = state.step === STEPS.length - 1 ? '🎉 Nájsť zájazd' : 'Ďalej →';

  let html = `<h2 class="q-title">${step.title}</h2>`;
  if (step.hint) html += `<p class="q-hint">${step.hint}</p>`;

  if (step.type === 'options') {
    html += '<div class="option-grid">';
    for (const opt of step.options) {
      const sel = state.answers[step.key] === opt.value ? 'selected' : '';
      html += `<button class="option ${sel}" data-value="${opt.value}">
                 <span class="emoji">${opt.emoji}</span><span>${opt.label}</span>
               </button>`;
    }
    html += '</div>';
  } else if (step.type === 'range') {
    const val = state.answers.budget ?? 800;
    html += `<div class="range-wrap">
        <div class="range-value" id="budgetVal">${val === 0 ? 'Bez limitu' : val + ' €'}</div>
        <input type="range" id="budgetRange" min="0" max="3000" step="50" value="${val}" />
        <div style="display:flex;justify-content:space-between;color:var(--muted);font-weight:700;font-size:.85rem;margin-top:6px">
          <span>0 €</span><span>3000 €+</span>
        </div>
      </div>`;
  }
  body.innerHTML = html;

  // event listenery pre aktuálny krok
  if (step.type === 'options') {
    body.querySelectorAll('.option').forEach((el) => {
      el.addEventListener('click', () => {
        state.answers[step.key] = el.dataset.value;
        body.querySelectorAll('.option').forEach((o) => o.classList.remove('selected'));
        el.classList.add('selected');
        setTimeout(nextStep, 220); // plynulý posun po výbere
      });
    });
  } else if (step.type === 'range') {
    const range = document.getElementById('budgetRange');
    const label = document.getElementById('budgetVal');
    range.addEventListener('input', () => {
      const v = Number(range.value);
      state.answers.budget = v;
      label.textContent = v === 0 ? 'Bez limitu' : v + ' €';
    });
    if (state.answers.budget == null) state.answers.budget = val0(range);
  }
}
function val0(range) { return Number(range.value); }

function nextStep() {
  if (state.step < STEPS.length - 1) { state.step++; renderStep(); }
  else { finishQuiz(); }
}
function prevStep() { if (state.step > 0) { state.step--; renderStep(); } }

function finishQuiz() {
  document.getElementById('progressBar').style.width = '100%';
  state.mode = 'quiz';
  document.getElementById('wizard').hidden = true;
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

// odvodí počiatočné hodnoty detailných filtrov z odpovedí (aby sedeli)
function applyFiltersFromAnswers() {
  const a = state.answers;
  if (state.mode === 'quiz') {
    document.getElementById('fType').value = a.type || '';
    document.getElementById('fTransport').value = a.transport || '';
    document.getElementById('fPrice').value = a.budget || document.getElementById('fPrice').max;
    document.getElementById('fPriceLabel').textContent =
      (a.budget && a.budget > 0) ? a.budget + ' €' : 'bez limitu';
    document.getElementById('fCountry').value = '';
    document.getElementById('fMonth').value = '';
    document.getElementById('fSearch').value = '';
  }
}

function computeList() {
  if (state.mode === 'quiz') {
    // skórovanie podľa sprievodcu
    return state.tours
      .map((t) => ({ tour: t, score: scoreTour(t, state.answers) }))
      .sort((x, y) => y.score - x.score)
      .filter((x) => x.score >= 35) // odrež úplne nesúvisiace
      .slice(0, 12);
  }
  // režim "browse" → detailné filtre
  const f = {
    country: document.getElementById('fCountry').value,
    type: document.getElementById('fType').value,
    transport: document.getElementById('fTransport').value,
    price: Number(document.getElementById('fPrice').value),
    month: document.getElementById('fMonth').value,
    search: document.getElementById('fSearch').value.trim().toLowerCase(),
  };
  const maxAllowed = Number(document.getElementById('fPrice').max);
  return state.tours
    .filter((t) => !f.country || t.country === f.country)
    .filter((t) => !f.type || t.type === f.type)
    .filter((t) => !f.transport || t.transport === f.transport)
    .filter((t) => f.price >= maxAllowed || typeof t.price !== 'number' || t.price <= f.price)
    .filter((t) => !f.month || t.month === Number(f.month))
    .filter((t) => !f.search || (t.title + ' ' + t.description + ' ' + t.destination).toLowerCase().includes(f.search))
    .map((t) => ({ tour: t, score: null }));
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
    meta.textContent = top
      ? `Najlepšia zhoda: ${top.score}% · ukazujeme ${list.length} ${plural(list.length)}.`
      : '';
  } else {
    title.textContent = 'Ponuka zájazdov';
    meta.textContent = `${list.length} ${plural(list.length)} podľa filtrov.`;
  }

  grid.innerHTML = '';
  empty.hidden = list.length > 0;

  for (const { tour, score } of list) {
    grid.appendChild(renderCard(tour, score));
  }
}

function plural(n) {
  if (n === 1) return 'zájazd';
  if (n >= 2 && n <= 4) return 'zájazdy';
  return 'zájazdov';
}

function renderCard(tour, score) {
  const el = document.createElement('article');
  el.className = 'tour-card card';
  const img = tour.image || `https://picsum.photos/seed/${encodeURIComponent(tour.id)}/640/420`;
  const priceHtml = typeof tour.price === 'number'
    ? `${tour.price}&nbsp;€ <small>/os.</small>` : (tour.priceText || 'na dopyt');
  const matchBadge = score != null ? `<span class="tc-match">${score}% zhoda</span>` : '';

  const meta = [];
  if (tour.transport && TRANSPORT_LABELS[tour.transport]) meta.push(TRANSPORT_LABELS[tour.transport]);
  if (tour.nights) meta.push(`🌙 ${tour.nights} ${tour.nights === 1 ? 'noc' : tour.nights < 5 ? 'noci' : 'nocí'}`);
  if (tour.board) meta.push(`🍽️ ${tour.board}`);

  el.innerHTML = `
    <div class="tc-img" style="background-image:url('${img}')">
      ${matchBadge}
      <span class="tc-type">${TYPE_LABELS[tour.type] || '🧳 Zájazd'}</span>
    </div>
    <div class="tc-body">
      <div class="tc-title">${escapeHtml(tour.title)}</div>
      <div class="tc-place">📍 ${escapeHtml([tour.destination, tour.country].filter(Boolean).join(', ')) || '—'}</div>
      ${score != null ? `<div class="tc-quip">${quipFor(tour)}</div>` : ''}
      <div class="tc-meta">${meta.map((m) => `<span class="chip">${m}</span>`).join('')}</div>
      <div class="tc-foot">
        <span class="tc-price">${priceHtml}</span>
        <span class="btn btn-primary" style="padding:8px 16px;font-size:.9rem">Detail</span>
      </div>
    </div>`;
  el.addEventListener('click', () => openModal(tour, score));
  return el;
}

// =========================================================================
//  DETAIL (modálne okno)
// =========================================================================
function openModal(tour, score) {
  const overlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('modal');
  const img = tour.image || `https://picsum.photos/seed/${encodeURIComponent(tour.id)}/800/450`;
  const term = (tour.dateFrom && tour.dateTo) ? `${fmtDate(tour.dateFrom)} – ${fmtDate(tour.dateTo)}` : (tour.dateFrom ? fmtDate(tour.dateFrom) : '');

  const chips = [];
  if (tour.type) chips.push(TYPE_LABELS[tour.type] || tour.type);
  if (tour.transport && TRANSPORT_LABELS[tour.transport]) chips.push(TRANSPORT_LABELS[tour.transport]);
  if (tour.nights) chips.push(`🌙 ${tour.nights} nocí`);
  if (tour.board) chips.push(`🍽️ ${tour.board}`);
  if (tour.accommodation) chips.push(`🏨 ${tour.accommodation}`);
  if (term) chips.push(`📅 ${term}`);

  modal.innerHTML = `
    <img class="modal-img" src="${img}" alt="${escapeHtml(tour.title)}" />
    <div class="modal-content">
      <button class="btn btn-ghost" id="closeModal" style="float:right">✕</button>
      ${score != null ? `<span class="tc-match" style="position:static;display:inline-block;margin-bottom:8px">${score}% zhoda s tvojím zadaním</span>` : ''}
      <h3>${escapeHtml(tour.title)}</h3>
      <div class="tc-place">📍 ${escapeHtml([tour.destination, tour.region, tour.country].filter(Boolean).join(', ')) || '—'}</div>
      <div class="modal-row">${chips.map((c) => `<span class="chip">${escapeHtml(String(c))}</span>`).join('')}</div>
      <p class="modal-desc">${escapeHtml(tour.description || 'Detailný popis nájdeš na stránke zájazdu.')}</p>
      <div class="modal-foot">
        <span class="tc-price">${typeof tour.price === 'number' ? tour.price + ' € /os.' : (tour.priceText || 'cena na dopyt')}</span>
        ${tour.url ? `<a class="btn btn-primary btn-lg" href="${tour.url}" target="_blank" rel="noopener">Mám záujem ↗</a>` : ''}
      </div>
    </div>`;
  overlay.hidden = false;
  document.getElementById('closeModal').addEventListener('click', closeModal);
}
function closeModal() { document.getElementById('modalOverlay').hidden = true; }

// =========================================================================
//  DETAILNÉ FILTRE / BROWSE
// =========================================================================
function populateFilters() {
  fillSelect('fCountry', state.facets.countries || []);
  fillSelect('fType', (state.facets.types || []), (v) => TYPE_LABELS[v] || v);
  fillSelect('fTransport', (state.facets.transports || []), (v) => TRANSPORT_LABELS[v] || v);
  const price = document.getElementById('fPrice');
  document.getElementById('fPriceLabel').textContent = price.max + ' €';
}
function fillSelect(id, values, labelFn) {
  const sel = document.getElementById(id);
  // ponechaj prvú "— všetky —" option
  sel.length = 1;
  for (const v of values) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = labelFn ? labelFn(v) : v;
    sel.appendChild(o);
  }
}

function browseAll() {
  state.mode = 'browse';
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
function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${Number(d)}.${Number(m)}.${y}`;
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// =========================================================================
//  INICIALIZÁCIA + EVENTY
// =========================================================================
function bind() {
  document.getElementById('startQuizBtn').addEventListener('click', startQuiz);
  document.getElementById('browseAllBtn').addEventListener('click', browseAll);
  document.getElementById('nextBtn').addEventListener('click', nextStep);
  document.getElementById('backBtn').addEventListener('click', prevStep);
  document.getElementById('restartBtn').addEventListener('click', startQuiz);

  document.getElementById('toggleFiltersBtn').addEventListener('click', () => {
    const f = document.getElementById('filters');
    f.hidden = !f.hidden;
    if (!f.hidden) { state.mode = 'browse'; renderResults(); }
  });

  // živé filtre
  ['fCountry', 'fType', 'fTransport', 'fMonth', 'fSearch'].forEach((id) =>
    document.getElementById(id).addEventListener('input', () => { state.mode = 'browse'; renderResults(); }));
  const price = document.getElementById('fPrice');
  price.addEventListener('input', () => {
    const v = Number(price.value);
    document.getElementById('fPriceLabel').textContent = v >= Number(price.max) ? 'bez limitu' : v + ' €';
    state.mode = 'browse'; renderResults();
  });

  // refresh feedu
  document.getElementById('refreshBtn').addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = '↻ Načítavam…';
    await fetch('/api/refresh');
    await loadTours();
    if (!document.getElementById('resultsSection').hidden) renderResults();
    e.target.disabled = false; e.target.textContent = '↻ Obnoviť ponuku';
  });

  // zatváranie modalu
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}

(async function init() {
  bind();
  try {
    await loadTours();
  } catch (e) {
    document.getElementById('feedBadge').textContent = 'chyba načítania';
    console.error(e);
  }
})();
