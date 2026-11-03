/* ======== Directory map, search and filters ========
 *
 * Two counting modes share one set of markers:
 *  - "Organisationen": catalogue organisations by their seat (DATA[].orgs[].loc).
 *  - "Stellen": open jobs from the public feed by their place of work.
 *
 * Job → map anchor (documented mapping, see jobAnchor()):
 *  1. A job without any location text inherits its employer's catalogue seat.
 *  2. A Zürich (or canton-less) location that names Winterthur goes to the
 *     Winterthur anchor (the only anchor sharing a canton with another, Zürich).
 *  3. Otherwise the canton (feed field `canton`, else HealthJobFacts) decides via
 *     CANTON_ANCHOR: each canton goes to the anchor of its capital; BL joins Basel,
 *     OW/NW join Luzern; GE, VD, VS, FR and JU form the "Westschweiz" bucket.
 *  4. GL, SH, TI and unspecific places ("CH", "Home-Office") have no anchor and are
 *     reported as "ohne Kartenort" instead of being guessed.
 */
var activeLocs = [];
var activeCats = [];
var favOnly = false;
var mapCountMode = 'orgs';
var _mapModeTouched = false;
const searchInput = document.getElementById('searchInput');
let _searchDebounce = null;

const CANTON_ANCHOR = Object.freeze({
  BE: 'Bern', ZH: 'Zürich', BS: 'Basel', BL: 'Basel', LU: 'Luzern', OW: 'Luzern', NW: 'Luzern',
  SG: 'St. Gallen', SO: 'Solothurn', AG: 'Aarau', NE: 'Neuenburg', GR: 'Chur', ZG: 'Zug',
  TG: 'Frauenfeld', SZ: 'Schwyz', UR: 'Altdorf', AI: 'Appenzell', AR: 'Herisau',
  GE: 'Westschweiz', VD: 'Westschweiz', VS: 'Westschweiz', FR: 'Westschweiz', JU: 'Westschweiz'
});
const ANCHOR_CANTON = Object.freeze({
  Bern: 'BE', Zürich: 'ZH', Winterthur: 'ZH', Basel: 'BS', Luzern: 'LU', 'St. Gallen': 'SG', Solothurn: 'SO',
  Aarau: 'AG', Neuenburg: 'NE', Chur: 'GR', Zug: 'ZG', Frauenfeld: 'TG', Schwyz: 'SZ', Altdorf: 'UR',
  Appenzell: 'AI', Herisau: 'AR'
});
const cantonName = code => window.HealthJobFacts?.CANTONS?.[code] || code;

function normalize(str) {
  return String(str).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/é|è|ê/g, 'e').replace(/à|â/g, 'a').replace(/ç/g, 'c').replace(/ß/g, 'ss');
}
function fuzzyMatch(text, query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return words.every(word => normalize(text).includes(word));
}

/** Map anchor of one job: {anchor, canton} or null when it has no place on the map. */
function jobAnchor(job) {
  const location = String(job?.location || '');
  if (!location.trim()) {
    const org = orgById(job?.org_id);
    if (org && (ANCHOR_CANTON[org.loc] || org.loc === 'Westschweiz')) return { anchor: org.loc, canton: ANCHOR_CANTON[org.loc] || null };
  }
  const canton = jobFacts(job).canton || window.HealthJobFacts?.cantonFromLocation?.(location) || null;
  if (/winterthur/i.test(location) && (!canton || canton === 'ZH')) return { anchor: 'Winterthur', canton: 'ZH' };
  return canton && CANTON_ANCHOR[canton] ? { anchor: CANTON_ANCHOR[canton], canton } : null;
}

// Canonical directory records only. With locations:false, markers show the
// available choices for the other filters.
function getFilteredOrganizations({ locations = true } = {}) {
  const query = searchInput.value.trim();
  const favs = favOnly ? new Set(getFavs()) : null;
  return DATA.filter(cat => !activeCats.length || activeCats.includes(cat.key))
    .flatMap(cat => cat.orgs).filter(org =>
      (!favs || favs.has(org.id)) &&
      (!locations || !activeLocs.length || activeLocs.includes(org.loc)) &&
      fuzzyMatch(`${org.name} ${org.loc} ${org.desc}`, query));
}

/** Open jobs of the currently filtered employers, grouped by map anchor. */
function jobsByAnchor() {
  const orgIds = new Set(getFilteredOrganizations({ locations: false }).map(org => org.id));
  const byAnchor = new Map(); let unplaced = 0, total = 0;
  for (const job of EmployerFeed.jobs) {
    if (!jobOrgIds(job).some(id => orgIds.has(id))) continue;
    total++;
    const place = jobAnchor(job);
    if (!place) { unplaced++; continue; }
    if (!byAnchor.has(place.anchor)) byAnchor.set(place.anchor, { jobs: [], cantons: new Map() });
    const entry = byAnchor.get(place.anchor);
    entry.jobs.push(job);
    if (place.canton) entry.cantons.set(place.canton, (entry.cantons.get(place.canton) || 0) + 1);
  }
  return { byAnchor, unplaced, total };
}

function filterAll() {
  const matches = getFilteredOrganizations();
  const ids = new Set(matches.map(org => org.id));
  const searching = !!searchInput.value.trim();
  document.querySelectorAll('#categories .org-row').forEach(row => { row.hidden = !ids.has(row.dataset.id); });
  document.querySelectorAll('#categories .dir-group').forEach(group => {
    const count = [...group.querySelectorAll('.org-row')].filter(row => ids.has(row.dataset.id)).length;
    group.hidden = !count;
    group.querySelector('.dir-group-count').textContent = count;
    if (searching && count) group.open = true;
  });
  const total = allOrgs().length, favCount = getFavs().length;
  const dirCount = document.getElementById('dirCount');
  if (dirCount) dirCount.textContent = `${matches.length} von ${total} Arbeitgebern${favOnly ? ' · nur Favoriten' : ''}`;
  const favButton = document.getElementById('favOnly');
  if (favButton) { favButton.setAttribute('aria-pressed', String(favOnly)); favButton.querySelector('.dir-favcount').textContent = favCount; }
  const empty = document.getElementById('dirEmpty');
  if (empty) {
    empty.hidden = matches.length !== 0;
    empty.textContent = favOnly && !favCount ? 'Noch keine Favoriten. Markiere Arbeitgeber mit dem Stern, um sie hier zu sammeln.' : 'Keine Arbeitgeber für diese Auswahl. Entferne einen Filter oder setze alle zurück.';
  }
  updateBubbleCounts();
  updateMapResults(matches);
  renderJobsOffer();
}

function updateMapResults(matches) {
  const total = allOrgs().length;
  const searchable = matches.filter(org => org.jobs).length;
  document.getElementById('mapSummary').textContent = `${matches.length} von ${total} Organisationen · ${searchable} mit Stellenportal`;
  document.getElementById('mapEmpty').hidden = matches.length !== 0;
  const choose = document.getElementById('mapChooseEmployers');
  choose.disabled = searchable === 0;
  choose.textContent = `${searchable} Arbeitgeber in meine Suche übernehmen`;
  document.getElementById('mapReset').disabled = !activeLocs.length && !activeCats.length && !searchInput.value && !favOnly;
}

function setPressed(element, selected, className = 'active') {
  element.classList.toggle(className, selected);
  element.setAttribute('aria-pressed', String(selected));
}
function syncLocationUI() {
  document.querySelectorAll('.canton-chip, .map-region-btn').forEach(button => {
    setPressed(button, button.dataset.loc === 'alle' ? !activeLocs.length : activeLocs.includes(button.dataset.loc));
  });
  document.querySelectorAll('.city-bubble').forEach(marker => setPressed(marker, activeLocs.includes(marker.dataset.loc), 'selected'));
  document.querySelectorAll('.cat-chip').forEach(button => setPressed(button, button.dataset.cat === 'alle' ? !activeCats.length : activeCats.includes(button.dataset.cat)));
  const chips = document.getElementById('activeLocs');
  chips.innerHTML = activeLocs.length
    ? activeLocs.map(loc => `<button type="button" data-remove-loc="${escapeHtml(loc)}" aria-label="Standort ${escapeHtml(loc)} entfernen">${escapeHtml(loc)} <span aria-hidden="true">×</span></button>`).join('')
    : '<span class="map-all-locations">Alle Standorte</span>';
  filterAll();
}
const knownLocation = loc => allOrgs().some(org => org.loc === loc) || Object.hasOwn(ANCHOR_CANTON, loc);
function toggleLocation(loc) {
  if (loc === 'alle') activeLocs = [];
  else if (!knownLocation(loc)) return;
  else activeLocs = activeLocs.includes(loc) ? activeLocs.filter(value => value !== loc) : [...activeLocs, loc];
  syncLocationUI();
}
function toggleCategory(cat) {
  if (cat === 'alle') activeCats = [];
  else if (!DATA.some(item => item.key === cat)) return;
  else activeCats = activeCats.includes(cat) ? activeCats.filter(value => value !== cat) : [...activeCats, cat];
  syncLocationUI();
}
function toggleFavOnly(force) {
  favOnly = typeof force === 'boolean' ? force : !favOnly;
  filterAll();
}
function resetMapFilters() {
  clearTimeout(_searchDebounce);
  searchInput.value = ''; activeLocs = []; activeCats = []; favOnly = false;
  syncLocationUI();
}

function buildMap() {
  const geo = window.SWISS_MAP_GEOGRAPHY;
  document.getElementById('swissMap').setAttribute('viewBox', geo.viewBox);
  document.getElementById('swissMapOutline').setAttribute('d', geo.countryPath);
  // Only labels move for legibility; every circle stays on its gazetteer anchor.
  const labels = {
    Bern: [282, 292], Zürich: [415, 164], Basel: [230, 79], Luzern: [345, 235],
    Winterthur: [425, 36], 'St. Gallen': [670, 111], Solothurn: [209, 162],
    Aarau: [365, 85], Neuenburg: [109, 225], Chur: [670, 284], Zug: [548, 191],
    Frauenfeld: [570, 63], Schwyz: [554, 239], Altdorf: [482, 309],
    Appenzell: [670, 205], Herisau: [696, 158]
  };
  document.getElementById('mapMarkers').innerHTML = geo.locations.map(location => {
    const { x, y } = geo.project(location.lon, location.lat);
    const [lx, ly] = labels[location.id];
    const width = Math.round(location.id.length * 7.5 + 52);
    const endX = Math.max(lx, Math.min(lx + width, x));
    const endY = Math.max(ly, Math.min(ly + 32, y));
    return `<g class="city-bubble" data-loc="${escapeHtml(location.id)}" role="button" tabindex="0" aria-pressed="false" aria-describedby="mapTip">
      <path class="map-leader" d="M${x.toFixed(2)},${y.toFixed(2)} L${endX},${endY}"/>
      <circle class="bubble-fill" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="7"/>
      <circle class="map-anchor" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2"/>
      <rect class="map-label-bg" x="${lx}" y="${ly}" width="${width}" height="32" rx="8"/>
      <text class="city-name" x="${lx + 10}" y="${ly + 21}">${escapeHtml(location.id)}</text>
      <text class="city-count" x="${lx + width - 19}" y="${ly + 21}">0</text>
    </g>`;
  }).join('');
  document.querySelectorAll('.city-bubble').forEach(marker => {
    marker.addEventListener('click', () => toggleLocation(marker.dataset.loc));
    marker.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!event.repeat) toggleLocation(marker.dataset.loc);
      } else if (event.key === 'Escape') hideMapTip();
    });
    marker.addEventListener('mouseenter', () => showMapTip(marker));
    marker.addEventListener('focus', () => showMapTip(marker));
    marker.addEventListener('mouseleave', hideMapTip);
    marker.addEventListener('blur', hideMapTip);
  });
}

/* ---------- Counting mode toggle and tooltip ---------- */
function buildCountSwitch() {
  const heading = document.querySelector('.map-heading');
  const viewSwitch = document.querySelector('.map-view-switch');
  if (!heading || !viewSwitch || document.getElementById('mapCountJobs')) return;
  const wrap = document.createElement('div');
  wrap.className = 'map-switches';
  wrap.innerHTML = `<div class="map-view-switch map-count-switch" role="group" aria-label="Zahlen auf der Karte">
      <button type="button" id="mapCountJobs" aria-pressed="false">Stellen</button>
      <button type="button" id="mapCountOrgs" aria-pressed="true">Organisationen</button>
    </div>`;
  viewSwitch.replaceWith(wrap);
  wrap.appendChild(viewSwitch);
  document.getElementById('mapCountJobs').addEventListener('click', () => { _mapModeTouched = true; setCountMode('jobs'); });
  document.getElementById('mapCountOrgs').addEventListener('click', () => { _mapModeTouched = true; setCountMode('orgs'); });
  const container = document.querySelector('.map-container');
  if (container && !document.getElementById('mapTip')) {
    const tip = document.createElement('div');
    tip.id = 'mapTip'; tip.className = 'map-tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
    container.appendChild(tip);
  }
  const selection = document.querySelector('.map-selection');
  if (selection && !document.getElementById('mapJobsOffer')) {
    const offer = document.createElement('div');
    offer.id = 'mapJobsOffer'; offer.className = 'map-offer'; offer.hidden = true;
    offer.setAttribute('aria-live', 'polite');
    selection.after(offer);
  }
}
function setCountMode(mode) {
  mapCountMode = mode === 'jobs' ? 'jobs' : 'orgs';
  setPressed(document.getElementById('mapCountJobs'), mapCountMode === 'jobs');
  setPressed(document.getElementById('mapCountOrgs'), mapCountMode === 'orgs');
  document.querySelector('.map-section')?.setAttribute('data-count', mapCountMode);
  const desc = document.getElementById('swissMapDesc');
  if (desc) desc.textContent = mapCountMode === 'jobs'
    ? 'Standorte mit der Maus, Enter oder Leertaste auswählen. Die Zahlen zeigen offene Stellen nach Arbeitsort.'
    : 'Standorte mit der Maus, Enter oder Leertaste auswählen. Die Zahlen zeigen Organisationen nach Sitz, keine offenen Stellen.';
  hideMapTip();
  filterAll();
}
function showMapTip(marker) {
  const tip = document.getElementById('mapTip');
  if (!tip || mapCountMode !== 'jobs' || !feedReady()) return;
  const loc = marker.dataset.loc, entry = jobsByAnchor().byAnchor.get(loc);
  const jobs = entry ? entry.jobs : [];
  tip.innerHTML = `<strong>${escapeHtml(loc)} · ${jobs.length} ${jobs.length === 1 ? 'offene Stelle' : 'offene Stellen'}</strong>${jobs.length
    ? `<ul>${jobs.slice(0, 3).map(job => `<li><span>${escapeHtml(job.title)}</span><small>${escapeHtml(job.organization || orgById(job.org_id)?.name || '')}</small></li>`).join('')}</ul>${jobs.length > 3 ? `<p>und ${jobs.length - 3} weitere · auswählen für alle</p>` : '<p>Auswählen für Details</p>'}`
    : '<p>Keine offenen Stellen im aktuellen Stand.</p>'}`;
  tip.hidden = false;
  const container = tip.parentElement, circle = marker.querySelector('.bubble-fill');
  const box = container.getBoundingClientRect(), dot = (circle || marker).getBoundingClientRect();
  const width = tip.offsetWidth || 260;
  let left = dot.left - box.left + dot.width / 2 - width / 2;
  left = Math.max(8, Math.min(left, box.width - width - 8));
  let top = dot.top - box.top + dot.height + 8;
  if (top + (tip.offsetHeight || 120) > box.height - 8) top = Math.max(8, dot.top - box.top - (tip.offsetHeight || 120) - 8);
  tip.style.left = `${Math.round(left)}px`; tip.style.top = `${Math.round(top)}px`;
}
function hideMapTip() { const tip = document.getElementById('mapTip'); if (tip) tip.hidden = true; }

/** After a location is chosen: offer the matching jobs in the feed. */
function renderJobsOffer() {
  const offer = document.getElementById('mapJobsOffer');
  if (!offer) return;
  if (!feedReady() || !activeLocs.length) { offer.hidden = true; offer.innerHTML = ''; return; }
  const { byAnchor } = jobsByAnchor();
  offer.hidden = false;
  offer.innerHTML = `<h3 class="map-offer-title">Offene Stellen am gewählten Ort</h3><div class="map-offer-grid">${activeLocs.map(loc => {
    const entry = byAnchor.get(loc), jobs = entry ? entry.jobs : [];
    const cantons = entry ? [...entry.cantons.entries()].sort((a, b) => b[1] - a[1]) : [];
    const links = cantons.length === 1
      ? `<a class="btn btn-primary" href="?kanton=${cantons[0][0]}#stellen">Stellen in ${escapeHtml(loc === 'Westschweiz' ? cantonName(cantons[0][0]) : loc)} anzeigen</a>`
      : cantons.map(([code, n]) => `<a class="btn" href="?kanton=${code}#stellen">Kanton ${escapeHtml(cantonName(code))} <span class="num">(${n})</span></a>`).join('');
    return `<section class="map-offer-item" aria-label="${escapeHtml(loc)}">
      <p class="map-offer-head"><strong>${escapeHtml(loc)}</strong> <span>${jobs.length} ${jobs.length === 1 ? 'offene Stelle' : 'offene Stellen'}</span></p>
      ${jobs.length ? `<ul>${jobs.slice(0, 3).map(job => `<li><a href="${escapeHtml(jobHref(job.id))}">${escapeHtml(job.title)}</a><small>${escapeHtml(job.organization || orgById(job.org_id)?.name || '')}</small></li>`).join('')}</ul>
      <div class="map-offer-links">${links}</div>` : '<p class="map-offer-none">Im aktuellen Stand gibt es hier keine fachlich passenden offenen Stellen der gefilterten Arbeitgeber.</p>'}
    </section>`;
  }).join('')}</div>`;
}

function buildMobileCantonChips() {
  const locations = [...new Set(allOrgs().map(org => org.loc))]
    .filter(loc => loc !== 'Westschweiz').sort((a, b) => a.localeCompare(b, 'de'));
  document.getElementById('cantonChips').innerHTML = '<button type="button" class="canton-chip" data-loc="alle">Alle Standorte <span class="location-count"></span></button>'
    + locations.map(loc => `<button type="button" class="canton-chip" data-loc="${escapeHtml(loc)}"><span>${escapeHtml(loc)}</span><span class="location-count">0</span></button>`).join('');
  document.querySelectorAll('.canton-chip, .map-region-btn').forEach(button => button.addEventListener('click', () => toggleLocation(button.dataset.loc)));
}
function buildCategoryChips() {
  const container = document.getElementById('catFilter');
  container.innerHTML = '<button type="button" class="cat-chip" data-cat="alle">Alle Kategorien</button>'
    + DATA.map(cat => `<button type="button" class="cat-chip" data-cat="${escapeHtml(cat.key)}" title="${escapeHtml(cat.title)}">${escapeHtml(categoryShort(cat.key))}</button>`).join('');
  container.querySelectorAll('.cat-chip').forEach(button => button.addEventListener('click', () => toggleCategory(button.dataset.cat)));
}
function updateBubbleCounts() {
  const jobsMode = mapCountMode === 'jobs';
  const available = getFilteredOrganizations({ locations: false });
  const counts = new Map();
  let allCount = available.length, unplaced = 0;
  if (jobsMode && feedReady()) {
    const data = jobsByAnchor();
    data.byAnchor.forEach((entry, loc) => counts.set(loc, entry.jobs.length));
    allCount = data.total; unplaced = data.unplaced;
  } else if (!jobsMode) available.forEach(org => counts.set(org.loc, (counts.get(org.loc) || 0) + 1));
  const unknown = jobsMode && !feedReady();
  const noun = n => jobsMode ? (n === 1 ? 'offene Stelle' : 'offene Stellen') : (n === 1 ? 'Organisation' : 'Organisationen');
  document.querySelectorAll('.city-bubble, .canton-chip, .map-region-btn').forEach(control => {
    const count = control.dataset.loc === 'alle' ? allCount : counts.get(control.dataset.loc) || 0;
    control.querySelector('.city-count, .location-count, .map-region-count').textContent = unknown ? '–' : count;
    control.classList.toggle('is-empty', !unknown && count === 0);
    const name = control.dataset.loc === 'alle' ? 'Alle Standorte' : control.dataset.loc;
    control.setAttribute('aria-label', unknown ? `${name}: Stellenzahl wird geladen` : `${name}: ${count} ${noun(count)}`);
    // Zero-count locations remain operable, so selected filters can always be removed.
    const circle = control.querySelector('.bubble-fill');
    if (circle) circle.setAttribute('r', unknown || !count ? '4' : (jobsMode ? 4 + Math.sqrt(count) * 2.4 : 4 + Math.sqrt(count) * 1.8).toFixed(1));
  });
  const hint = document.querySelector('.map-count-hint');
  if (hint) hint.textContent = !jobsMode ? 'Standortzahlen: Organisationen nach Sitz, gefiltert nach Suchtext, Kategorien und Favoriten.'
    : unknown ? 'Stellenzahlen werden geladen …'
    : `Standortzahlen: offene Stellen der gefilterten Arbeitgeber nach Arbeitsort.${unplaced ? ` ${unplaced} ${unplaced === 1 ? 'Stelle ohne eindeutigen Ort ist' : 'Stellen ohne eindeutigen Ort (z. B. «CH», Home-Office, Tessin) sind'} nicht auf der Karte.` : ''}`;
}
function setMapView(view) {
  const map = view === 'map';
  document.getElementById('mapCanvas').hidden = !map;
  document.getElementById('mapLocationList').hidden = map;
  setPressed(document.getElementById('mapViewMap'), map);
  setPressed(document.getElementById('mapViewList'), !map);
  if (!map) hideMapTip();
}

searchInput.addEventListener('input', () => {
  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(filterAll, 150);
});
// The "/" shortcut is handled globally in js/site.js.
searchInput.addEventListener('keydown', event => {
  if (event.key === 'Escape' && searchInput.value) {
    clearTimeout(_searchDebounce); searchInput.value = ''; filterAll();
  }
});
document.getElementById('activeLocs').addEventListener('click', event => {
  const button = event.target.closest('[data-remove-loc]');
  if (!button) return;
  toggleLocation(button.dataset.removeLoc);
  // The clicked chip was removed. Preserve a useful keyboard focus target.
  (document.querySelector('#activeLocs button') || document.getElementById('mapViewList')).focus();
});
document.getElementById('categories')?.addEventListener('click', event => {
  if (event.target.closest('#favOnly')) toggleFavOnly();
});
document.getElementById('mapReset').addEventListener('click', () => { resetMapFilters(); searchInput.focus(); });
document.getElementById('mapViewMap').addEventListener('click', () => setMapView('map'));
document.getElementById('mapViewList').addEventListener('click', () => setMapView('list'));
document.getElementById('mapChooseEmployers').addEventListener('click', () => {
  const ids = getFilteredOrganizations().filter(org => org.jobs).map(org => org.id);
  if (ids.length && window.HealthJobs) window.HealthJobs.openEmployerSelection(ids);
});
document.querySelector('.map-scroll')?.addEventListener('scroll', hideMapTip, { passive: true });
window.addEventListener('publicfeed:loaded', () => {
  // Show open jobs as soon as they exist, unless the visitor chose a mode.
  if (feedReady() && !_mapModeTouched && mapCountMode !== 'jobs') setCountMode('jobs');
  else filterAll();
});

buildMap();
buildCountSwitch();
buildMobileCantonChips();
buildCategoryChips();
setMapView((window.matchMedia ? window.matchMedia('(max-width: 600px)').matches : window.innerWidth <= 600) ? 'list' : 'map');
renderAll();
setCountMode(mapCountMode);
syncLocationUI();
if (typeof onAppReady === 'function') onAppReady();
