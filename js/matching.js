/* ========================================
   MATCHING — KI Job-Matching UI + API
   ======================================== */

let matchingInProgress = false;
let matchAbortController = null;

/* ======== Build Matching Section ======== */
function buildMatchingSection() {
  const section = document.getElementById('matchingSection');
  if (!section) return;

  const profile = getProfile();
  const favs = getFavs();
  const hasProfile = isProfileFilled();
  const hasFavs = favs.length > 0;

  let hint = '';
  if (!isLoggedIn()) {
    hint = '<span class="match-hint">💡 <a onclick="openAuthModal()">Melde dich an</a>, um das KI-Matching zu nutzen.</span>';
  } else if (!hasProfile && !hasFavs) {
    hint = '<span class="match-hint">💡 <a onclick="openProfile()">Erstelle ein Profil</a> und markiere Organisationen mit ⭐ für bessere Ergebnisse.</span>';
  } else if (!hasProfile) {
    hint = '<span class="match-hint">💡 <a onclick="openProfile()">Profil erstellen</a> für genauere Matches.</span>';
  }

  // Rate limit info
  const rateInfo = isLoggedIn() ? '<span class="match-rate-info" id="matchRateInfo"></span>' : '';

  section.innerHTML = `
    <div class="match-bar">
      <div class="match-info">
        <span class="match-title">🤖 KI Job-Matching</span>
        <span class="match-desc">Claude analysiert Karriereseiten und findet passende Stellen für dein Profil.</span>
        ${hint}
        ${rateInfo}
      </div>
      <div class="match-actions">
        <button class="match-btn" id="matchBtn" onclick="startMatching()"
          ${!isLoggedIn() ? 'disabled title="Bitte zuerst anmelden"' : ''}>
          🔍 Jobs finden
        </button>
        <button class="match-btn-cancel" id="matchCancelBtn" onclick="cancelMatching()" style="display:none;">
          ✕ Abbrechen
        </button>
      </div>
    </div>
    <div id="matchResults"></div>`;

  // Restore last results if available
  restoreLastResults();
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

  // If nothing selected, warn the user instead of silently using random orgs
  if (selectedOrgs.length === 0) {
    showMatchError('Bitte markiere zuerst Organisationen mit ⭐ oder wähle Standorte auf der Karte, damit die KI weiss, wo sie suchen soll.');
    return;
  }

  // Filter to orgs that have a jobs URL
  const orgsFull = selectedOrgs;
  selectedOrgs = selectedOrgs.filter(o => o.jobs);

  if (selectedOrgs.length === 0) {
    const noJobsNames = orgsFull.slice(0, 5).map(o => o.name).join(', ');
    showMatchError(`Keine der ausgewählten Organisationen (${noJobsNames}${orgsFull.length > 5 ? '...' : ''}) hat eine Karriereseite hinterlegt.`);
    return;
  }

  matchingInProgress = true;
  matchAbortController = new AbortController();

  const btn = document.getElementById('matchBtn');
  const cancelBtn = document.getElementById('matchCancelBtn');
  btn.disabled = true;
  btn.innerHTML = '⏳ Analysiere...';
  if (cancelBtn) cancelBtn.style.display = '';

  const orgNames = selectedOrgs.slice(0, 5).map(o => o.name).join(', ');
  const moreText = selectedOrgs.length > 5 ? ` und ${selectedOrgs.length - 5} weitere` : '';

  const results = document.getElementById('matchResults');
  results.innerHTML = `
    <div class="match-loading">
      <div class="match-spinner"></div>
      <p><strong>Claude analysiert ${selectedOrgs.length} Karriereseiten...</strong></p>
      <p class="match-loading-orgs">${escapeHtml(orgNames)}${moreText}</p>
      <p class="match-loading-sub">Karriereseiten werden parallel geladen. Dauer: ca. 10–20 Sekunden.</p>
      <div class="match-progress" id="matchProgress">
        <div class="match-progress-bar" id="matchProgressBar"></div>
      </div>
    </div>`;

  // Animate progress bar (fake but reassuring)
  animateProgress();

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
        }),
        signal: matchAbortController.signal
      }
    );

    const data = await response.json();

    if (!response.ok) {
      showMatchError(data.error || 'Fehler bei der Analyse.');
      return;
    }

    // Persist results
    saveMatchResults(data, selectedOrgs);

    renderMatchResults(data, false);
  } catch (err) {
    if (err.name === 'AbortError') {
      showMatchInfo('Suche abgebrochen.');
    } else {
      showMatchError('Netzwerkfehler: ' + err.message);
    }
  } finally {
    matchingInProgress = false;
    matchAbortController = null;
    btn.disabled = false;
    btn.innerHTML = '🔍 Jobs finden';
    if (cancelBtn) cancelBtn.style.display = 'none';
  }
}

/* ======== Cancel ======== */
function cancelMatching() {
  if (matchAbortController) {
    matchAbortController.abort();
  }
}

/* ======== Progress Animation ======== */
function animateProgress() {
  const bar = document.getElementById('matchProgressBar');
  if (!bar) return;
  let pct = 0;
  const iv = setInterval(() => {
    if (!matchingInProgress || !document.getElementById('matchProgressBar')) {
      clearInterval(iv);
      return;
    }
    // Fast to 60%, then slow crawl to 90%, never hits 100% until done
    if (pct < 60) pct += 3;
    else if (pct < 85) pct += 0.5;
    else if (pct < 95) pct += 0.1;
    bar.style.width = pct + '%';
  }, 200);
}

/* ======== Persist Results ======== */
function saveMatchResults(data, orgs) {
  try {
    const saved = {
      data,
      orgNames: orgs.map(o => o.name),
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('lastMatchResults', JSON.stringify(saved));
  } catch (e) { /* localStorage full – ignore */ }
}

function restoreLastResults() {
  try {
    const raw = localStorage.getItem('lastMatchResults');
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved.data || !saved.data.matches || saved.data.matches.length === 0) return;

    // Only show if less than 24h old
    const age = Date.now() - new Date(saved.timestamp).getTime();
    if (age > 24 * 60 * 60 * 1000) { localStorage.removeItem('lastMatchResults'); return; }

    renderMatchResults(saved.data, true, saved.timestamp);
  } catch (e) { /* corrupt data – ignore */ }
}

function clearSavedResults() {
  localStorage.removeItem('lastMatchResults');
  const results = document.getElementById('matchResults');
  if (results) results.innerHTML = '';
}

/* ======== Render Results ======== */
function renderMatchResults(data, isRestored, timestamp) {
  const results = document.getElementById('matchResults');
  if (!data || !data.matches || data.matches.length === 0) {
    results.innerHTML = `
      <div class="match-empty">
        <p>😕 Keine passenden Stellen gefunden.</p>
        ${data?.summary ? `<p class="match-summary">${escapeHtml(data.summary)}</p>` : ''}
        ${data?.tips ? `<p class="match-tips">💡 ${escapeHtml(data.tips)}</p>` : ''}
      </div>`;
    return;
  }

  const timeLabel = timestamp ? formatTimeAgo(timestamp) : 'Gerade eben';
  const restoredBar = isRestored ? `
    <div class="match-restored-bar">
      <span>📋 Letzte Suche (${escapeHtml(timeLabel)}) · ${data.matches.length} Treffer</span>
      <div class="match-restored-actions">
        <button class="match-btn-small" onclick="startMatching()">🔄 Neue Suche</button>
        <button class="match-btn-small match-btn-clear" onclick="clearSavedResults()">✕ Löschen</button>
      </div>
    </div>` : '';

  const matchCards = data.matches.map((m, i) => {
    const scoreClass = m.score >= 4 ? 'match-score-high' : m.score >= 3 ? 'match-score-mid' : 'match-score-low';

    // Build metadata badges
    const badges = [];
    if (m.pensum) badges.push(`<span class="match-badge match-badge-pensum">⏱ ${escapeHtml(m.pensum)}</span>`);
    if (m.location) badges.push(`<span class="match-badge match-badge-loc">📍 ${escapeHtml(m.location)}</span>`);
    if (m.languages) badges.push(`<span class="match-badge match-badge-lang">🌐 ${escapeHtml(m.languages)}</span>`);
    if (m.salary_hint) badges.push(`<span class="match-badge match-badge-salary">💰 ${escapeHtml(m.salary_hint)}</span>`);
    if (m.deadline) badges.push(`<span class="match-badge match-badge-deadline">📅 bis ${escapeHtml(m.deadline)}</span>`);

    return `
    <div class="match-card ${scoreClass}" style="animation-delay:${i * 0.06}s">
      <div class="match-card-header">
        <div class="match-score">${'⭐'.repeat(m.score)}${'☆'.repeat(5 - m.score)}</div>
        <span class="match-org">${escapeHtml(m.organization)}</span>
      </div>
      <h3 class="match-job-title">${escapeHtml(m.title)}</h3>
      ${badges.length ? `<div class="match-badges">${badges.join('')}</div>` : ''}
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
  `}).join('');

  results.innerHTML = `
    ${restoredBar}
    ${data.summary ? `<div class="match-summary-bar"><p>${escapeHtml(data.summary)}</p></div>` : ''}
    <div class="match-grid">${matchCards}</div>
    ${data.tips ? `<div class="match-tips-bar">💡 ${escapeHtml(data.tips)}</div>` : ''}`;
}

/* ======== Helpers ======== */
function showMatchError(msg) {
  const results = document.getElementById('matchResults');
  if (results) {
    results.innerHTML = `<div class="match-error">❌ ${escapeHtml(msg)}</div>`;
  }
  matchingInProgress = false;
  const btn = document.getElementById('matchBtn');
  if (btn) { btn.disabled = false; btn.innerHTML = '🔍 Jobs finden'; }
  const cancelBtn = document.getElementById('matchCancelBtn');
  if (cancelBtn) cancelBtn.style.display = 'none';
}

function showMatchInfo(msg) {
  const results = document.getElementById('matchResults');
  if (results) {
    results.innerHTML = `<div class="match-info-bar">ℹ️ ${escapeHtml(msg)}</div>`;
  }
}

function formatTimeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `vor ${hrs} Std.`;
  return 'vor mehr als einem Tag';
}

/* ======== Init ======== */
buildMatchingSection();
