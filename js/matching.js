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

  const docs = typeof getDocuments === 'function' ? getDocuments() : [];
  const hasCV = docs.some(d => d.doc_type === 'cv');
  const zeugnisCount = docs.filter(d => d.doc_type === 'zeugnis').length;

  let hint = '';
  if (!isLoggedIn()) {
    hint = '<span class="match-hint">💡 <a onclick="openAuthModal()">Melde dich an</a>, um das KI-Matching zu nutzen.</span>';
  } else if (!hasProfile && !hasFavs) {
    hint = '<span class="match-hint">💡 <a onclick="openProfile()">Erstelle ein Profil</a> und markiere Organisationen mit ⭐ für bessere Ergebnisse.</span>';
  } else if (!hasProfile) {
    hint = '<span class="match-hint">💡 <a onclick="openProfile()">Profil erstellen</a> für genauere Matches.</span>';
  }

  // Document status hint
  let docHint = '';
  if (isLoggedIn()) {
    if (hasCV && zeugnisCount > 0) {
      docHint = `<span class="match-doc-hint match-doc-ready">🧠 CV + ${zeugnisCount} Arbeitszeugnis${zeugnisCount > 1 ? 'se' : ''} werden beim Matching berücksichtigt</span>`;
    } else if (hasCV) {
      docHint = '<span class="match-doc-hint match-doc-partial">🧠 CV wird berücksichtigt · <a onclick="openProfile()">Arbeitszeugnisse hochladen</a> für noch bessere Ergebnisse</span>';
    } else {
      docHint = '<span class="match-doc-hint"><a onclick="openProfile()">📄 CV & Arbeitszeugnisse hochladen</a> für personalisierte Matches</span>';
    }
  }

  // Rate limit info
  const rateInfo = isLoggedIn() ? '<span class="match-rate-info" id="matchRateInfo"></span>' : '';

  section.innerHTML = `
    <div class="match-bar">
      <div class="match-info">
        <span class="match-title">🤖 KI Job-Matching</span>
        <span class="match-desc">Claude analysiert Karriereseiten und findet passende Stellen für dein Profil.</span>
        ${hint}
        ${docHint}
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
          orgs: selectedOrgs.map(o => ({ id: o.id, name: o.name, jobs: o.jobs, loc: o.loc })),
          documents: (typeof getDocuments === 'function' ? getDocuments() : [])
            .filter(d => d.raw_text)
            .map(d => ({ doc_type: d.doc_type, raw_text: d.raw_text, employer: d.employer, period: d.period }))
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
      <div class="match-card-actions">
        <a class="match-link" href="${escapeHtml(m.url)}" target="_blank" rel="noopener">
          💼 Zur Stelle →
        </a>
        <button class="match-apply-btn" data-match-idx="${i}" onclick="openCoverLetterForMatch(${i})">
          ✍️ Bewerbung
        </button>
      </div>
    </div>
  `}).join('');

  // Store matches for cover letter access
  window._lastMatches = data.matches;

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

/* ======== Cover Letter Modal ======== */
let _clCurrentMatch = null;
let _clCurrentLang = 'de';

function openCoverLetterForMatch(idx) {
  const matches = window._lastMatches;
  if (!matches || !matches[idx]) return;

  const docs = typeof getDocuments === 'function' ? getDocuments() : [];
  const cv = docs.find(d => d.doc_type === 'cv');

  if (!cv || !cv.raw_text) {
    // No CV: show hint
    showCoverLetterHint();
    return;
  }

  _clCurrentMatch = matches[idx];
  // Auto-detect language: Westschweiz jobs → offer French
  const isWestschweiz = _clCurrentMatch.location &&
    /westschweiz|lausanne|gen[eè]ve|fribourg|neuch[aâ]tel|sion|valais|vaud/i.test(_clCurrentMatch.location);
  _clCurrentLang = isWestschweiz ? 'fr' : 'de';

  generateCoverLetter();
}

function showCoverLetterHint() {
  if (document.getElementById('clModal')) { document.getElementById('clModal').remove(); }
  const modal = document.createElement('div');
  modal.id = 'clModal';
  modal.className = 'cl-modal open';
  modal.innerHTML = `
    <div class="cl-backdrop" onclick="closeCoverLetter()"></div>
    <div class="cl-panel cl-panel-hint">
      <button class="cl-close" onclick="closeCoverLetter()">✕</button>
      <div class="cl-hint-content">
        <div class="cl-hint-icon">📄</div>
        <h3>CV benötigt</h3>
        <p>Um ein Bewerbungsschreiben zu generieren, lade zuerst deinen Lebenslauf hoch.</p>
        <button class="pf-btn-primary" onclick="closeCoverLetter();openProfile();">📄 CV hochladen</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
}

async function generateCoverLetter() {
  const docs = typeof getDocuments === 'function' ? getDocuments() : [];
  const cv = docs.find(d => d.doc_type === 'cv');
  if (!cv || !_clCurrentMatch) return;

  const zeugnisse = docs.filter(d => d.doc_type === 'zeugnis').map(d => ({
    employer: d.employer,
    period: d.period,
    text: d.raw_text,
    notable_quotes: d.notable_quotes || []
  }));

  // Build/show modal with loading state
  buildCoverLetterModal(true);

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { closeCoverLetter(); openAuthModal(); return; }

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/generate-cover-letter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({
        cv_text: cv.raw_text,
        person_name: cv.person_name || null,
        zeugnisse,
        job: _clCurrentMatch,
        language: _clCurrentLang
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      buildCoverLetterModal(false, data.error || 'Fehler beim Generieren.', null, true);
      return;
    }

    buildCoverLetterModal(false, null, data.letter);
  } catch (err) {
    buildCoverLetterModal(false, 'Netzwerkfehler: ' + err.message, null, true);
  }
}

function buildCoverLetterModal(loading, error, letter, showRetry) {
  let modal = document.getElementById('clModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'clModal';
    modal.className = 'cl-modal';
    document.body.appendChild(modal);
    // Trigger reflow for animation
    requestAnimationFrame(() => modal.classList.add('open'));
  } else {
    modal.classList.add('open');
  }
  document.body.style.overflow = 'hidden';

  const m = _clCurrentMatch;
  const jobInfo = m ? `${escapeHtml(m.title)}${m.pensum ? ' (' + escapeHtml(m.pensum) + ')' : ''} bei ${escapeHtml(m.organization)}${m.location ? ', ' + escapeHtml(m.location) : ''}` : '';

  const langOptions = `
    <select class="cl-lang-select" onchange="_clCurrentLang=this.value;generateCoverLetter();">
      <option value="de" ${_clCurrentLang === 'de' ? 'selected' : ''}>🇩🇪 Deutsch</option>
      <option value="fr" ${_clCurrentLang === 'fr' ? 'selected' : ''}>🇫🇷 Français</option>
    </select>`;

  let content;
  if (loading) {
    content = `
      <div class="cl-loading">
        <div class="match-spinner"></div>
        <p>Claude schreibt dein Bewerbungsschreiben...</p>
      </div>`;
  } else if (error) {
    content = `<div class="cl-error">❌ ${escapeHtml(error)}${showRetry ? '<br><button class="cl-retry-btn" onclick="generateCoverLetter()">🔄 Erneut versuchen</button>' : ''}</div>`;
  } else {
    content = `
      <textarea class="cl-editor" id="clEditor">${escapeHtml(letter || '')}</textarea>
      <div class="cl-actions-bar">
        ${langOptions}
        <div class="cl-actions">
          <button class="cl-action-btn" onclick="copyCoverLetter()">📋 Kopieren</button>
          <button class="cl-action-btn" onclick="downloadCoverLetterTxt()">⬇ .txt</button>
          <button class="cl-action-btn" onclick="downloadCoverLetterHtml()">⬇ .html</button>
          <button class="cl-action-btn cl-action-regen" onclick="generateCoverLetter()">🔄 Neu</button>
        </div>
      </div>`;
  }

  modal.innerHTML = `
    <div class="cl-backdrop" onclick="closeCoverLetter()"></div>
    <div class="cl-panel">
      <div class="cl-header">
        <div>
          <h3>✍️ Bewerbungsschreiben</h3>
          <p class="cl-job-info">${jobInfo}</p>
        </div>
        <button class="cl-close" onclick="closeCoverLetter()">✕</button>
      </div>
      <div class="cl-body">${content}</div>
    </div>`;
}

function closeCoverLetter() {
  const modal = document.getElementById('clModal');
  if (modal) {
    modal.classList.remove('open');
    setTimeout(() => modal.remove(), 300);
  }
  document.body.style.overflow = '';
}

function copyCoverLetter() {
  const editor = document.getElementById('clEditor');
  if (!editor) return;
  navigator.clipboard.writeText(editor.value).then(() => {
    const btn = document.querySelector('.cl-action-btn');
    if (btn) { const orig = btn.innerHTML; btn.innerHTML = '✅ Kopiert!'; setTimeout(() => btn.innerHTML = orig, 2000); }
  });
}

function downloadCoverLetterTxt() {
  const editor = document.getElementById('clEditor');
  if (!editor) return;
  const blob = new Blob([editor.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateTag = new Date().toISOString().slice(0,10);
  a.download = `Bewerbung_${_clCurrentMatch?.organization || 'Job'}_${dateTag}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCoverLetterHtml() {
  const editor = document.getElementById('clEditor');
  if (!editor) return;
  const text = editor.value.replace(/\n/g, '<br>\n');
  const html = `<!DOCTYPE html>
<html lang="${_clCurrentLang}">
<head>
<meta charset="utf-8">
<title>Bewerbung – ${escapeHtml(_clCurrentMatch?.organization || '')}</title>
<style>
body{font-family:'Times New Roman',Georgia,serif;max-width:680px;margin:50px auto;
     line-height:1.7;font-size:12pt;color:#1a1a1a;padding:0 20px;}
@media print{body{margin:20mm;padding:0;}}
</style>
</head>
<body>
${text}
</body>
</html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateTag2 = new Date().toISOString().slice(0,10);
  a.download = `Bewerbung_${_clCurrentMatch?.organization || 'Job'}_${dateTag2}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ======== Init ======== */
buildMatchingSection();
