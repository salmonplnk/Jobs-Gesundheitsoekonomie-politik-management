/* ======== Search & Filter (Multi-Select + Category + Fuzzy) ======== */
let activeLocs = [];
let activeCats = [];
const searchInput = document.getElementById('searchInput');
let _searchDebounce = null;

/* === Normalize for fuzzy matching (umlauts, case) === */
function normalize(str) {
  return str.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/é|è|ê/g, 'e').replace(/à|â/g, 'a').replace(/ç/g, 'c')
    .replace(/ß/g, 'ss');
}

/* === Fuzzy match: checks if query words are all present (in any order) === */
function fuzzyMatch(text, query) {
  if (!query) return true;
  const normText = normalize(text);
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return words.every(w => normText.includes(w));
}

function filterAll() {
  const q = searchInput.value.trim();
  document.querySelectorAll('.org-card').forEach(card => {
    const text = card.dataset.search || '';
    const loc = card.dataset.loc || '';
    const matchQ = fuzzyMatch(text, q);
    const matchL = activeLocs.length === 0 || activeLocs.some(l => loc.includes(l));
    card.style.display = (matchQ && matchL) ? '' : 'none';
  });
  // Category filter: hide entire sections not in activeCats
  document.querySelectorAll('.category').forEach(sec => {
    const cat = sec.dataset.cat || '';
    const catMatch = activeCats.length === 0 || activeCats.includes(cat);
    if (!catMatch) {
      sec.style.display = 'none';
      return;
    }
    const visible = sec.querySelectorAll('.org-card:not([style*="display: none"])').length;
    sec.style.display = visible ? '' : 'none';
  });
}

// Sync all UI elements (buttons, map bubbles, mobile chips, category chips) with activeLocs/activeCats
function syncLocationUI() {
  // Filter buttons
  document.querySelectorAll('.loc-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.loc === 'alle' ? activeLocs.length === 0 : activeLocs.includes(b.dataset.loc));
  });
  // Map bubbles
  document.querySelectorAll('.city-bubble').forEach(b => {
    b.classList.toggle('selected', activeLocs.includes(b.dataset.loc));
  });
  // Mobile canton chips
  document.querySelectorAll('.canton-chip').forEach(c => {
    const isAll = c.dataset.loc === 'alle';
    c.classList.toggle('active', isAll ? activeLocs.length === 0 : activeLocs.includes(c.dataset.loc));
  });
  // Category chips
  document.querySelectorAll('.cat-chip').forEach(c => {
    const isAll = c.dataset.cat === 'alle';
    c.classList.toggle('active', isAll ? activeCats.length === 0 : activeCats.includes(c.dataset.cat));
  });
  filterAll();
}

// Toggle a location in/out of the active set
function toggleLocation(loc) {
  if (loc === 'alle') {
    activeLocs = [];
  } else {
    if (activeLocs.includes(loc)) {
      activeLocs = activeLocs.filter(x => x !== loc);
    } else {
      activeLocs.push(loc);
    }
  }
  syncLocationUI();
}

// Toggle a category filter
function toggleCategory(cat) {
  if (cat === 'alle') {
    activeCats = [];
  } else {
    if (activeCats.includes(cat)) {
      activeCats = activeCats.filter(x => x !== cat);
    } else {
      activeCats.push(cat);
    }
  }
  syncLocationUI();
}

// Debounced search
searchInput.addEventListener('input', () => {
  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(filterAll, 150);
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // "/" to focus search (unless in input/textarea)
  if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
    e.preventDefault();
    searchInput.focus();
  }
  // Escape to clear search (when search is focused)
  if (e.key === 'Escape' && document.activeElement === searchInput) {
    searchInput.value = '';
    searchInput.blur();
    filterAll();
  }
});

// Location filter buttons – simple click toggles
document.querySelectorAll('.loc-btn').forEach(btn => {
  btn.addEventListener('click', () => toggleLocation(btn.dataset.loc));
});

// Map bubbles – simple click toggles (no Ctrl/Cmd needed)
document.querySelectorAll('.city-bubble').forEach(bubble => {
  bubble.addEventListener('click', () => toggleLocation(bubble.dataset.loc));
});

// Mobile canton chips – build and bind
function buildMobileCantonChips() {
  const container = document.getElementById('cantonChips');
  if (!container) return;
  const locations = [];
  allOrgs().forEach(o => { if (!locations.includes(o.loc)) locations.push(o.loc); });
  locations.sort((a, b) => a.localeCompare(b, 'de'));
  container.innerHTML = `<button class="canton-chip active" data-loc="alle">Alle</button>`
    + locations.map(loc => `<button class="canton-chip" data-loc="${loc}">${loc}</button>`).join('');
  container.querySelectorAll('.canton-chip').forEach(chip => {
    chip.addEventListener('click', () => toggleLocation(chip.dataset.loc));
  });
}

// Build category filter chips
function buildCategoryChips() {
  const container = document.getElementById('catFilter');
  if (!container) return;
  container.innerHTML = `<button class="cat-chip active" data-cat="alle">Alle</button>`
    + DATA.map(c => `<button class="cat-chip" data-cat="${c.key}">${c.emoji} ${c.title.split('/')[0].trim()}</button>`).join('');
  container.querySelectorAll('.cat-chip').forEach(chip => {
    chip.addEventListener('click', () => toggleCategory(chip.dataset.cat));
  });
}

/* ======== Favorite Toggle ======== */
function handleFavToggle(e) {
  const star = e.target.closest('[data-fav]');
  if (!star) return;
  e.preventDefault();
  const id = star.dataset.fav;
  let favs = getFavs();
  favs = favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id];
  saveFavs(favs);
  renderAll();
}
document.addEventListener('click', handleFavToggle);
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-fav]')) {
    e.preventDefault();
    handleFavToggle(e);
  }
});

/* ======== Update Bubble Counts (responsive labels) ======== */
function updateBubbleCounts() {
  const locationCounts = {};
  allOrgs().forEach(org => {
    locationCounts[org.loc] = (locationCounts[org.loc] || 0) + 1;
  });
  Object.entries(locationCounts).forEach(([loc, count]) => {
    const el = document.getElementById('count-' + loc);
    if (!el) return;
    // Responsive label: ≥12 → "N Unternehmen", ≥5 → "N Orgs", <5 → just number
    if (count >= 12) {
      el.textContent = count + ' Unternehmen';
    } else if (count >= 5) {
      el.textContent = count + ' Orgs';
    } else {
      el.textContent = count;
    }
  });
}

/* ======== Init ======== */
renderAll();
updateBubbleCounts();
buildMobileCantonChips();
buildCategoryChips();

// Signal to auth.js that the app is initialized and ready for Supabase sync
if (typeof onAppReady === 'function') onAppReady();
