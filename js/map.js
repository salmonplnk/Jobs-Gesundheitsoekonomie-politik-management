/* ======== Directory map, search and category filters ======== */
let activeLocs = [];
let activeCats = [];
const searchInput = document.getElementById('searchInput');
let _searchDebounce = null;

function normalize(str) {
  return String(str).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/é|è|ê/g, 'e').replace(/à|â/g, 'a').replace(/ç/g, 'c').replace(/ß/g, 'ss');
}
function fuzzyMatch(text, query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return words.every(word => normalize(text).includes(word));
}

// Canonical directory records only: favourite cards must never double the count.
// With locations:false, markers show the available choices for the other filters.
function getFilteredOrganizations({ locations = true } = {}) {
  const query = searchInput.value.trim();
  return DATA.filter(cat => !activeCats.length || activeCats.includes(cat.key))
    .flatMap(cat => cat.orgs).filter(org =>
      (!locations || !activeLocs.length || activeLocs.includes(org.loc)) &&
      fuzzyMatch(`${org.name} ${org.loc} ${org.desc}`, query));
}

function filterAll() {
  const matches = getFilteredOrganizations();
  const ids = new Set(matches.map(org => org.id));
  document.querySelectorAll('#categories .org-card, #fav-grid .org-card').forEach(card => {
    card.style.display = ids.has(card.dataset.id) ? '' : 'none';
  });
  document.querySelectorAll('#categories .category').forEach(section => {
    const count = [...section.querySelectorAll('.org-card')].filter(card => ids.has(card.dataset.id)).length;
    section.style.display = count ? '' : 'none';
    section.querySelector('.cat-count').textContent = count;
  });
  document.getElementById('fav-sec').style.display = getFavs().some(id => ids.has(id)) ? 'block' : 'none';
  updateBubbleCounts();
  updateMapResults(matches);
}

function updateMapResults(matches) {
  const total = allOrgs().length;
  const searchable = matches.filter(org => org.jobs).length;
  document.getElementById('mapSummary').textContent = `${matches.length} von ${total} Organisationen · ${searchable} mit Stellenportal`;
  document.getElementById('mapEmpty').hidden = matches.length !== 0;
  const choose = document.getElementById('mapChooseEmployers');
  choose.disabled = searchable === 0;
  choose.textContent = `${searchable} Arbeitgeber übernehmen`;
  document.getElementById('mapReset').disabled = !activeLocs.length && !activeCats.length && !searchInput.value;
}

function setPressed(element, selected, className = 'active') {
  element.classList.toggle(className, selected);
  element.setAttribute('aria-pressed', String(selected));
}
function syncLocationUI() {
  document.querySelectorAll('.loc-btn, .canton-chip, .map-region-btn').forEach(button => {
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
function toggleLocation(loc) {
  if (loc === 'alle') activeLocs = [];
  else if (!allOrgs().some(org => org.loc === loc)) return;
  else activeLocs = activeLocs.includes(loc) ? activeLocs.filter(value => value !== loc) : [...activeLocs, loc];
  syncLocationUI();
}
function toggleCategory(cat) {
  if (cat === 'alle') activeCats = [];
  else if (!DATA.some(item => item.key === cat)) return;
  else activeCats = activeCats.includes(cat) ? activeCats.filter(value => value !== cat) : [...activeCats, cat];
  syncLocationUI();
}
function resetMapFilters() {
  clearTimeout(_searchDebounce);
  searchInput.value = ''; activeLocs = []; activeCats = [];
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
    const width = Math.round(location.id.length * 7.5 + 48);
    const endX = Math.max(lx, Math.min(lx + width, x));
    const endY = Math.max(ly, Math.min(ly + 32, y));
    return `<g class="city-bubble" data-loc="${escapeHtml(location.id)}" role="button" tabindex="0" aria-pressed="false">
      <title>${escapeHtml(location.id)}</title>
      <path class="map-leader" d="M${x.toFixed(2)},${y.toFixed(2)} L${endX},${endY}"/>
      <circle class="bubble-fill" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="7"/>
      <circle class="map-anchor" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2"/>
      <rect class="map-label-bg" x="${lx}" y="${ly}" width="${width}" height="32" rx="8"/>
      <text class="city-name" x="${lx + 10}" y="${ly + 21}">${escapeHtml(location.id)}</text>
      <text class="city-count" x="${lx + width - 17}" y="${ly + 21}">0</text>
    </g>`;
  }).join('');
  document.querySelectorAll('.city-bubble').forEach(marker => {
    marker.addEventListener('click', () => toggleLocation(marker.dataset.loc));
    marker.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!event.repeat) toggleLocation(marker.dataset.loc);
      }
    });
  });
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
    + DATA.map(cat => `<button type="button" class="cat-chip" data-cat="${escapeHtml(cat.key)}">${cat.emoji} ${escapeHtml(cat.title.split('/')[0].trim())}</button>`).join('');
  container.querySelectorAll('.cat-chip').forEach(button => button.addEventListener('click', () => toggleCategory(button.dataset.cat)));
}
function updateBubbleCounts() {
  const available = getFilteredOrganizations({ locations: false });
  const counts = new Map();
  available.forEach(org => counts.set(org.loc, (counts.get(org.loc) || 0) + 1));
  document.querySelectorAll('.city-bubble, .canton-chip, .map-region-btn').forEach(control => {
    const count = control.dataset.loc === 'alle' ? available.length : counts.get(control.dataset.loc) || 0;
    control.querySelector('.city-count, .location-count, .map-region-count').textContent = count;
    control.classList.toggle('is-empty', count === 0);
    control.setAttribute('aria-label', `${control.dataset.loc === 'alle' ? 'Alle Standorte' : control.dataset.loc}: ${count} ${count === 1 ? 'Organisation' : 'Organisationen'}`);
    // Zero-count locations remain operable, so selected filters can always be removed.
    const circle = control.querySelector('.bubble-fill');
    if (circle) circle.setAttribute('r', count ? (4 + Math.sqrt(count) * 1.8).toFixed(1) : '4');
  });
}
function setMapView(view) {
  const map = view === 'map';
  document.getElementById('mapCanvas').hidden = !map;
  document.getElementById('mapLocationList').hidden = map;
  setPressed(document.getElementById('mapViewMap'), map);
  setPressed(document.getElementById('mapViewList'), !map);
}

searchInput.addEventListener('input', () => {
  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(filterAll, 150);
});
document.addEventListener('keydown', event => {
  const editing = document.activeElement.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]');
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !editing && !document.querySelector('dialog[open]')) {
    event.preventDefault(); document.getElementById('organisationDirectory').open = true; searchInput.focus();
  }
  if (event.key === 'Escape' && document.activeElement === searchInput) {
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
document.getElementById('mapReset').addEventListener('click', () => { resetMapFilters(); searchInput.focus(); });
document.getElementById('mapViewMap').addEventListener('click', () => setMapView('map'));
document.getElementById('mapViewList').addEventListener('click', () => setMapView('list'));
document.getElementById('mapChooseEmployers').addEventListener('click', () => {
  const ids = getFilteredOrganizations().filter(org => org.jobs).map(org => org.id);
  if (ids.length && window.HealthJobs) window.HealthJobs.openEmployerSelection(ids);
});

/* ======== Favourite toggle ======== */
function handleFavToggle(event) {
  const star = event.target.closest('[data-fav]');
  if (!star) return;
  event.preventDefault();
  const id = star.dataset.fav, favs = getFavs();
  saveFavs(favs.includes(id) ? favs.filter(value => value !== id) : [...favs, id]);
  renderAll();
}
document.addEventListener('click', handleFavToggle);
document.addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('[data-fav]')) handleFavToggle(event);
});

buildMap();
buildMobileCantonChips();
buildCategoryChips();
setMapView((window.matchMedia ? window.matchMedia('(max-width: 600px)').matches : window.innerWidth <= 600) ? 'list' : 'map');
renderAll();
syncLocationUI();
if (typeof onAppReady === 'function') onAppReady();
