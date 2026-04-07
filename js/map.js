/* ======== Search & Filter (Multi-Select via simple click) ======== */
let activeLocs = [];
const searchInput = document.getElementById('searchInput');

function filterAll() {
  const q = searchInput.value.toLowerCase().trim();
  document.querySelectorAll('.org-card').forEach(card => {
    const text = card.dataset.search || '';
    const loc = card.dataset.loc || '';
    const matchQ = !q || text.includes(q);
    const matchL = activeLocs.length === 0 || activeLocs.some(l => loc.includes(l));
    card.style.display = (matchQ && matchL) ? '' : 'none';
  });
  document.querySelectorAll('.category').forEach(sec => {
    const visible = sec.querySelectorAll('.org-card:not([style*="display: none"])').length;
    sec.style.display = visible ? '' : 'none';
  });
}

// Sync all UI elements (buttons, map bubbles, mobile chips) with activeLocs
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

searchInput.addEventListener('input', filterAll);

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

/* ======== Favorite Toggle ======== */
document.addEventListener('click', e => {
  const star = e.target.closest('[data-fav]');
  if (!star) return;
  e.preventDefault();
  const id = star.dataset.fav;
  let favs = getFavs();
  favs = favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id];
  saveFavs(favs);
  renderAll();
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
