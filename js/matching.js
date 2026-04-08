/* ========================================
   MATCHING — KI Job-Matching UI + API
   ======================================== */

let matchingInProgress = false;

/* ======== Build Matching Section ======== */
function buildMatchingSection() {
  const section = document.getElementById('matchingSection');
  if (!section) return;

  const profile = getProfile();
  const favs = getFavs();
  const hasProfile = isProfileFilled();
  const hasFavs = favs.length > 0;
  const hasSelection = favs.length > 0 || activeLocs.length > 0;

  let hint = '';
  if (!isLoggedIn()) {
    hint = '<span class="match-hint">💡 <a onclick="openAuthModal()">Melde dich an</a>, um das KI-Matching zu nutzen.</span>';
  } else if (!hasProfile && !hasFavs) {
    hint = '<span class="match-hint">💡 <a onclick="openProfile()">Erstelle ein Profil</a> und markiere Organisationen mit ⭐ für bessere Ergebnisse.</span>';
  } else if (!hasProfile) {
    hint = '<span class="match-hint">💡 <a onclick="openProfile()">Profil erstellen</a> für genauere Matches.</span>';
  }

  section.innerHTML = `
    <div class="match-bar">
      <div class="match-info">
        <span class="match-title">🤖 KI Job-Matching</span>
        <span class="match-desc">Claude analysiert Karriereseiten und findet passende Stellen für dein Profil.</span>
        ${hint}
      </div>
      <button class="match-btn" id="matchBtn" onclick="startMatching()"
        ${!isLoggedIn() ? 'disabled title="Bitte zuerst anmelden"' : ''}>
        🔍 Jobs finden
      </button>
    </div>
    <div id="matchResults"></div>`;
}

/* ======== Start Matching ======== */
async function startMatching() {
  if (matchingInProgress) return;
  if (!isLoggedIn()) { openAuthModal(); return; }

  const profile = getProfile();
  const favs = getFavs();

  // Collect orgs: favorites + location-filtered orgs
  let selectedOrgs = [];
  const all = allOrgs();

  if (favs.length > 0) {
    selectedOrgs = all.filter(o => favs.includes(o.id));
  }

  if (activeLocs.length > 0) {
    const locOrgs = all.filter(o => activeLocs.some(l => o.loc.includes(l)));
    locOrgs.forEach(o => {
      if (!selectedOrgs.find(s => s.id === o.id)) selectedOrgs.push(o);
    });
  }

  // If nothing selected, use all favorited orgs or all orgs up to 15
  if (selectedOrgs.length === 0) {
    selectedOrgs = all.slice(0, 15);
  }

  // Filter to orgs that have a jobs URL
  selectedOrgs = selectedOrgs.filter(o => o.jobs);

  if (selectedOrgs.length === 0) {
    showMatchError('Keine Organisationen mit Karriereseite ausgewählt.');
    return;
  }

  matchingInProgress = true;
  const btn = document.getElementById('matchBtn');
  btn.disabled = true;
  btn.innerHTML = '⏳ Analysiere...';

  const results = document.getElementById('matchResults');
  results.innerHTML = `
    <div class="match-loading">
      <div class="match-spinner"></div>
      <p><strong>Claude analysiert ${selectedOrgs.length} Karriereseiten...</strong></p>
      <p class="match-loading-sub">Das kann 10–30 Sekunden dauern.</p>
    </div>`;

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { openAuthModal(); return; }

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/match-jobs`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_KEY
        },
        body: JSON.stringify({
          profile: profile,
          orgs: selectedOrgs.map(o => ({ id: o.id, name: o.name, jobs: o.jobs, loc: o.loc }))
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      showMatchError(data.error || 'Fehler bei der Analyse.');
      return;
    }

    renderMatchResults(data);
  } catch (err) {
    showMatchError('Netzwerkfehler: ' + err.message);
  } finally {
    matchingInProgress = false;
    btn.disabled = false;
    btn.innerHTML = '🔍 Jobs finden';
  }
}

/* ======== Render Results ======== */
function renderMatchResults(data) {
  const results = document.getElementById('matchResults');
  if (!data || !data.matches || data.matches.length === 0) {
    results.innerHTML = `
      <div class="match-empty">
        <p>😕 Keine passenden Stellen gefunden.</p>
        ${data?.summary ? `<p class="match-summary">${data.summary}</p>` : ''}
        ${data?.tips ? `<p class="match-tips">💡 ${data.tips}</p>` : ''}
      </div>`;
    return;
  }

  const matchCards = data.matches.map((m, i) => `
    <div class="match-card" style="animation-delay:${i * 0.08}s">
      <div class="match-card-header">
        <div class="match-score">${'⭐'.repeat(m.score)}${'☆'.repeat(5 - m.score)}</div>
        <span class="match-org">${escapeHtml(m.organization)}</span>
      </div>
      <h3 class="match-job-title">${escapeHtml(m.title)}</h3>
      <p class="match-reason">${escapeHtml(m.reason)}</p>
      ${m.highlights?.length ? `
        <div class="match-tags">
          ${m.highlights.map(h => `<span class="match-tag match-tag-good">✓ ${escapeHtml(h)}</span>`).join('')}
          ${(m.concerns || []).map(c => `<span class="match-tag match-tag-warn">⚠ ${escapeHtml(c)}</span>`).join('')}
        </div>` : ''}
      <a class="match-link" href="${escapeHtml(m.url)}" target="_blank" rel="noopener">
        💼 Zur Stelle →
      </a>
    </div>
  `).join('');

  results.innerHTML = `
    ${data.summary ? `<div class="match-summary-bar"><p>${escapeHtml(data.summary)}</p></div>` : ''}
    <div class="match-grid">${matchCards}</div>
    ${data.tips ? `<div class="match-tips-bar">💡 ${escapeHtml(data.tips)}</div>` : ''}`;
}

function showMatchError(msg) {
  const results = document.getElementById('matchResults');
  if (results) {
    results.innerHTML = `<div class="match-error">❌ ${escapeHtml(msg)}</div>`;
  }
  matchingInProgress = false;
  const btn = document.getElementById('matchBtn');
  if (btn) { btn.disabled = false; btn.innerHTML = '🔍 Jobs finden'; }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ======== Init ======== */
buildMatchingSection();
