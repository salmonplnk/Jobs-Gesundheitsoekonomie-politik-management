/* The career workspace: durable user-scoped data, searches, jobs and applications. */
(function () {
  'use strict';
  const C = window.JobCore;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('de-CH') : 'Unbekannt';
  const dateTime = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('de-CH') : 'Noch nie';
  const uid = () => typeof currentUser !== 'undefined' && currentUser ? currentUser.id : null;
  const id = () => crypto.randomUUID();
  let owner = uid(), generation = 0, state = C.emptyState(), revision = 0, dirty = false;
  let syncing = false, syncAgain = false, reloadAfterSave = false, mutation = 0, syncTimer, remoteConflict = null, syncMessage = '', notice = '';
  let searchToken = 0;
  let view = 'jobs', compared = new Set(), searching = false, abortController = null;
  const entryTimes = new Map();
  const assessmentControllers = new Set();
  const mount = () => document.getElementById('jobWorkspace');
  const key = () => 'healthjobs.workspace.v1.' + (owner || 'guest');
  const activeProfile = () => state.searchProfiles.find(x => x.id === state.activeSearchProfileId && !x.archived);
  const criteria = () => state.criteriaConfigured || state.criteria.length ? state.criteria : C.defaultCriteria(typeof getProfile === 'function' ? getProfile() : {});
  const documents = () => typeof getDocuments === 'function' ? getDocuments() : [];
  const matches = job => C.evaluate(job, criteria(), documents());
  function persist(markDirty = true) {
    if (markDirty) { dirty = true; mutation++; }
    try { localStorage.setItem(key(), JSON.stringify({ data: state, revision, dirty })); }
    catch { notice = 'Der Browserspeicher ist voll. Bitte Daten exportieren; Änderungen sind noch nicht lokal gesichert.'; }
    if (owner && dirty && !remoteConflict) { clearTimeout(syncTimer); syncTimer = setTimeout(syncCloud, 700); }
  }
  async function switchOwner(nextOwner) {
    if (nextOwner === owner && mount()?.dataset.ready) { render(); return; }
    cancelSearch(); for (const c of assessmentControllers) c.abort(); assessmentControllers.clear(); generation++; owner = nextOwner; compared = new Set(); remoteConflict = null; syncing = false; syncAgain = false;
    clearTimeout(syncTimer); revision = 0; dirty = false; notice = ''; syncMessage = '';
    try { const stored = JSON.parse(localStorage.getItem(key()) || 'null'); state = C.hydrate(stored?.data); revision = stored?.revision || 0; dirty = !!stored?.dirty; }
    catch { state = C.emptyState(); notice = 'Lokale Daten konnten nicht gelesen werden. Der gespeicherte Rohstand wurde nicht überschrieben.'; }
    const entryKey = owner || 'guest';
    if (!entryTimes.has(entryKey)) entryTimes.set(entryKey, { current: C.now(), previous: state.lastVisitAt });
    state.lastVisitAt = entryTimes.get(entryKey).previous;
    document.querySelectorAll('.jw-dialog[open]').forEach(d => d.close());
    render(); if (owner) await loadCloud();
  }
  async function loadCloud() {
    const epoch = generation, target = owner; if (!target) return;
    if (syncing) { reloadAfterSave = true; return; }
    const startMutation = mutation, startRevision = revision;
    syncMessage = 'Konto wird geladen …'; renderStatus();
    try {
      const { data, error } = await supabaseClient.from('job_workspaces').select('data,revision,updated_at').eq('user_id', target).maybeSingle();
      if (epoch !== generation) return;
      if (error) throw error;
      if (startMutation !== mutation || startRevision !== revision || (data && data.revision < revision)) { if (dirty) syncCloud(); return; }
      if (data && dirty && data.revision !== revision) { remoteConflict = data; syncMessage = 'Ein anderer Gerätestand liegt vor. Deine lokalen Änderungen bleiben erhalten.'; }
      else if (data && !dirty) { state = C.hydrate(data.data); revision = data.revision; state.lastVisitAt = entryTimes.get(target).previous || state.lastVisitAt; syncMessage = 'Mit Konto synchronisiert'; persist(false); }
      else syncMessage = dirty ? 'Änderungen zur Übertragung vorgemerkt' : 'Konto bereit';
      render(); if (dirty && !remoteConflict) await syncCloud();
    } catch (e) { if (epoch === generation) { syncMessage = 'Lokal verfügbar · Konto konnte nicht geladen werden. Erneut versuchen.'; renderStatus(); } }
  }
  async function syncCloud() {
    if (!owner || !dirty || remoteConflict) return;
    if (syncing) { syncAgain = true; return; }
    syncing = true; syncAgain = false;
    const epoch = generation, serialized = JSON.stringify(state), expected = revision;
    syncMessage = 'Änderungen werden synchronisiert …'; renderStatus();
    try {
      const { data, error } = await supabaseClient.rpc('save_job_workspace', { payload: JSON.parse(serialized), expected_revision: expected });
      if (epoch !== generation) return;
      if (error) { if (String(error.message).includes('WORKSPACE_CONFLICT')) { syncing = false; await loadCloud(); return; } throw error; }
      if (!data || !Number.isFinite(Number(data.revision))) throw new Error('Ungültige Speicherantwort');
      revision = Number(data.revision); dirty = serialized !== JSON.stringify(state);
      syncMessage = dirty ? 'Weitere Änderungen vorgemerkt' : 'Mit Konto synchronisiert'; persist(false);
    } catch (e) { if (epoch === generation) syncMessage = 'Nur lokal gespeichert · Übertragung ausstehend. Erneut versuchen.'; }
    finally { if (epoch === generation) { syncing = false; renderStatus(); if (reloadAfterSave) { reloadAfterSave = false; setTimeout(loadCloud, 0); } else if (syncAgain) { syncAgain = false; setTimeout(syncCloud, 500); } } }
  }
  function renderStatus() {
    const status = document.getElementById('jwSync'); if (!status) return;
    status.textContent = owner ? syncMessage || (dirty ? 'Änderungen vorgemerkt' : 'Konto bereit') : 'Auf diesem Gerät gespeichert · Anmeldung für Kontosynchronisierung';
    const conflict = document.getElementById('jwConflict');
    if (conflict) { conflict.hidden = !remoteConflict; conflict.innerHTML = remoteConflict ? 'Dein Konto enthält einen neueren Stand. Vor dem Laden wird dein lokaler Stand als Sicherung heruntergeladen. <button class="jw-btn" data-action="cloud-load">Kontostand laden + lokale Sicherung</button>' : ''; }
  }
  function download(name, content, type = 'application/json') { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function exportState() { download('Gesundheits-Jobs_' + C.now().slice(0, 10) + '.json', JSON.stringify({ format: 'healthjobs-workspace', version: 1, exported_at: C.now(), data: state }, null, 2)); }
  function setNotice(message) { notice = message; const el = document.getElementById('jwNotice'); if (el) { el.textContent = message; el.hidden = !message; } }
  const option = (value, label, selected) => `<option value="${esc(value)}"${String(selected ?? '') === String(value) ? ' selected' : ''}>${esc(label)}</option>`;
  const button = (action, label, jobId = '', primary = false) => `<button type="button" class="jw-btn${primary ? ' primary' : ''}" data-action="${action}"${jobId ? ` data-id="${esc(jobId)}"` : ''}>${label}</button>`;
  function summary() {
    const jobs = Object.values(state.jobs), apps = Object.values(state.applications);
    const fresh = jobs.filter(j => C.freshness(j, state.lastVisitAt) === 'new').length;
    return `<div class="jw-summary"><div class="jw-stat"><strong>${jobs.filter(j => j.status !== 'closed').length}</strong><span>Erfasste Stellen</span></div><div class="jw-stat"><strong>${fresh}</strong><span>Neu für dich</span></div><div class="jw-stat"><strong>${apps.length}</strong><span>Auf deiner Liste</span></div><div class="jw-stat"><strong>${apps.filter(a => ['applied', 'interview', 'offer'].includes(a.stage)).length}</strong><span>Laufende Bewerbungen</span></div></div>`;
  }
  function render() {
    const root = mount(); if (!root) return;
    root.dataset.ready = '1'; const p = activeProfile();
    root.innerHTML = `<div class="jw-shell"><div class="jw-top"><div><p class="jw-small jw-muted">DEIN KARRIEREARBEITSPLATZ</p><h2>Stellen finden. Den nächsten Schritt planen.</h2><p class="jw-muted">${p ? 'Aktive Suche: ' + esc(p.name) : 'Wähle Arbeitgeber aus und starte deine Suche.'}</p></div><div class="jw-actions">${button('search-dialog', searching ? 'Suchlauf ansehen' : 'Stellen suchen', '', true)}${button('manual', '+ Inserat erfassen')}</div></div>
      ${summary()}<nav class="jw-nav" aria-label="Stellenbereich">${[['jobs', 'Stellen'], ['applications', 'Bewerbungen'], ['searches', 'Suchprofile'], ['compare', `Vergleich (${compared.size})`], ['sources', 'Quellen & Verlauf']].map(([v, l]) => `<button data-view="${v}" class="${v === view ? 'active' : ''}" aria-current="${v === view ? 'page' : 'false'}">${l}</button>`).join('')}</nav>
      <div id="jwNotice" class="jw-notice" role="status"${notice ? '' : ' hidden'}>${esc(notice)}</div><div id="jwConflict" class="jw-notice warning" hidden></div>
      <div id="jwProgress">${progressHtml()}</div><div id="jwContent">${viewHtml()}</div>
      <div class="jw-toolbar jw-small"><span id="jwSync" role="status"></span>${button('sync', 'Erneut synchronisieren')}${button('export', 'Daten exportieren')}${button('import', 'Sicherung importieren')}<input type="file" id="jwImportFile" accept="application/json,.json" hidden></div></div>`;
    renderStatus();
  }
  function progressHtml() {
    const q = state.queue; if (!q) return '';
    const done = q.total - q.remaining.length;
    return `<div class="jw-progress"><strong>${searching ? 'Suche läuft' : q.remaining.length ? 'Suche pausiert' : 'Suche abgeschlossen'}: ${done} von ${q.total} Arbeitgebern geprüft</strong><progress max="${q.total || 1}" value="${done}"></progress><span class="jw-small">${esc(q.message || '')}</span><div class="jw-actions">${searching ? button('cancel', 'Pausieren') : q.remaining.length ? button('resume', 'Fortsetzen', '', true) : ''}</div></div>`;
  }
  function viewHtml() { return view === 'jobs' ? jobsHtml() : view === 'applications' ? applicationsHtml() : view === 'searches' ? searchesHtml() : view === 'compare' ? compareHtml() : sourcesHtml(); }
  function filtersHtml() {
    const f = state.filters, jobs = Object.values(state.jobs);
    const distinct = field => [...new Set(jobs.map(j => j[field]).filter(Boolean))].sort();
    const select = (key, label, values) => `<label>${label}<select data-filter="${key}">${option('', 'Alle', f[key])}${values.map(v => option(Array.isArray(v) ? v[0] : v, Array.isArray(v) ? v[1] : v, f[key])).join('')}</select></label>`;
    return `<div class="jw-filters"><label class="jw-wide">Stichwort<input data-filter="q" type="search" value="${esc(f.q || '')}" placeholder="Titel, Arbeitgeber oder Aufgaben"></label>${select('role', 'Tätigkeitsfeld', C.roles)}${select('location', 'Arbeitsort', distinct('location'))}${select('remote_mode', 'Arbeitsmodell', [['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'Vor Ort'], ['unknown', 'Unbekannt']])}${select('workload', 'Pensum (Überschneidung)', ['40-60%', '60-80%', '80-100%'])}${select('seniority', 'Erfahrungsniveau', distinct('seniority'))}${select('employment_type', 'Anstellung', distinct('employment_type'))}<label>Sprache<input data-filter="languages" value="${esc(f.languages || '')}" placeholder="z. B. Deutsch"></label>${select('freshness', 'Veränderungen', [['new', 'Neu'], ['changed', 'Geändert'], ['seen', 'Bereits gesehen'], ['closed', 'Geschlossen']])}${select('sort', 'Sortieren', [['newest', 'Neueste zuerst'], ['score', 'Kriterienpassung'], ['deadline', 'Bewerbungsfrist'], ['organization', 'Arbeitgeber']])}</div>
      <div class="jw-toolbar"><label><input type="checkbox" data-filter="saved"${f.saved ? ' checked' : ''}> Nur gemerkte Stellen</label><label><input type="checkbox" data-filter="showClosed"${f.showClosed ? ' checked' : ''}> Geschlossene einschliessen</label><label><input type="checkbox" data-filter="showIneligible"${f.showIneligible ? ' checked' : ''}> Auch ungeklärte / nicht erfüllte Muss-Kriterien</label>${button('filters-reset', 'Filter zurücksetzen')}${button('criteria', 'Matching einstellen')}</div>`;
  }
  function jobsHtml() { return filtersHtml() + `<div id="jwJobList">${jobListHtml()}</div>`; }
  function jobListHtml() {
    const jobs = C.filterJobs(Object.values(state.jobs), state.filters, state, criteria());
    return `<p class="jw-small jw-muted">${jobs.length} Treffer · ${Object.keys(state.jobs).length} erfasst. Unbekannte Angaben bleiben als solche sichtbar.</p>` + (jobs.length ? `<div class="jw-grid">${jobs.map(jobCard).join('')}</div>` : `<div class="jw-empty"><h3>${Object.keys(state.jobs).length ? 'Keine Stelle passt zu diesen Filtern.' : 'Hier beginnt deine Stellensuche.'}</h3><p>${Object.keys(state.jobs).length ? 'Lockere einen Filter oder prüfe die Muss-Kriterien.' : 'Wähle Arbeitgeber aus dem Verzeichnis. Du kannst auch ein Inserat mit Link und Text selbst erfassen.'}</p>${button('search-dialog', 'Arbeitgeber auswählen', '', true)}</div>`);
  }
  const freshnessLabels = { new: 'Neu', changed: 'Geändert', seen: 'Gesehen', closed: 'Geschlossen' };
  function jobCard(job) {
    const match = matches(job), fresh = C.freshness(job, state.lastVisitAt), app = state.applications[job.id];
    return `<article class="jw-card"><div class="jw-card-head"><span class="jw-badge ${fresh}">${freshnessLabels[fresh]}</span><label class="jw-small"><input type="checkbox" data-compare="${esc(job.id)}"${compared.has(job.id) ? ' checked' : ''}> Vergleichen</label></div><p class="jw-small jw-muted">${esc(job.organization)}</p><h3><button class="jw-link" data-action="detail" data-id="${esc(job.id)}">${esc(job.title)}</button></h3><div class="jw-meta"><span>${esc(job.location || 'Arbeitsort unbekannt')}</span><span>${esc(job.pensum || 'Pensum unbekannt')}</span><span>${esc({ remote: 'Remote', hybrid: 'Hybrid', onsite: 'Vor Ort', unknown: 'Arbeitsmodell unbekannt' }[job.remote_mode])}</span></div><p class="jw-small">${esc(job.role)} · Frist: ${date(job.deadline)}</p><p class="jw-small">${match.score == null ? 'Noch keine Suchkriterien festgelegt' : `${match.score}% Kriterienpassung · ${match.coverage}% beurteilbar`}${match.eligible ? '' : ' · Muss-Kriterien offen'}</p>${job.change_fields?.length && fresh === 'changed' ? `<p class="jw-small">Geändert: ${esc(job.change_fields.map(fieldLabel).join(', '))}</p>` : ''}${app ? `<span class="jw-badge">${C.stages[app.stage] || 'Interessant'}</span>` : ''}<div class="jw-actions">${button('detail', 'Details & Belege', job.id)}${button('save-job', app ? 'Bewerbung bearbeiten' : 'Merken', job.id)}<a class="jw-btn" href="${esc(C.safeUrl(job.url))}" target="_blank" rel="noopener noreferrer">Inserat ↗</a></div></article>`;
  }
  function fieldLabel(field) { return ({ title: 'Titel', description: 'Beschreibung', pensum: 'Pensum', location: 'Arbeitsort', languages: 'Sprachen', salary_hint: 'Lohn', deadline: 'Frist', remote_mode: 'Arbeitsmodell', employment_type: 'Anstellung', status: 'Status' })[field] || field; }
  function dialog(title, body, modalId = 'jwDialog') {
    let d = document.getElementById(modalId); if (d) d.remove(); d = document.createElement('dialog'); d.id = modalId; d.className = 'jw-dialog';
    d.setAttribute('aria-labelledby', modalId + 'Title');
    d.innerHTML = `<div class="jw-dialog-head"><h2 id="${modalId}Title">${esc(title)}</h2><button class="jw-btn" data-action="close-dialog" aria-label="Schliessen">✕</button></div><div class="jw-dialog-body">${body}</div>`;
    document.body.appendChild(d); d.showModal(); return d;
  }
  function criteriaTable(job) {
    const m = matches(job); if (!m.criteria.length) return '<p>Lege Suchkriterien fest, um die Passung zu beurteilen.</p>';
    return `<p class="jw-small">Textbasierter Kriterienvergleich. Ein Texttreffer belegt keine vollständige Qualifikation. Unbekannte Angaben zählen nicht als erfüllt.</p><div class="jw-compare-wrapper"><table class="jw-table"><thead><tr><th>Kriterium</th><th>Ergebnis</th><th>Beleg aus Inserat</th><th>CV / Zeugnis</th></tr></thead><tbody>${m.criteria.map(c => `<tr><th>${esc(c.label || c.field)}<br><small>${esc(c.value)} · ${c.mode === 'must' ? 'Muss' : 'Wunsch'} · Gewicht ${c.weight}</small></th><td>${({ met: 'Erfüllt', unmet: 'Nicht erfüllt', unknown: 'Unklar' })[c.status]}</td><td>${esc(c.evidence || 'Keine belegte Angabe')}</td><td>${esc(c.profileEvidence || 'Kein Textbeleg zugeordnet')}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function openDetail(jobId) {
    const job = state.jobs[jobId]; if (!job) return;
    job.seen_at = C.now(); persist();
    dialog(job.title, `<p>${esc(job.organization)} · ${esc(job.location || 'Arbeitsort unbekannt')}</p><div class="jw-actions"><a class="jw-btn primary" href="${esc(C.safeUrl(job.url))}" target="_blank" rel="noopener noreferrer">Originalinserat ↗</a>${button('application', 'Bewerbung verwalten', job.id)}${button('letter', 'Schreiben erstellen', job.id)}${button('close-job', job.status === 'closed' ? 'Als offen markieren' : 'Als geschlossen markieren', job.id)}</div><h3>Passung zu deiner Suche</h3>${criteriaTable(job)}<h3>KI-Prüfung mit CV-Belegen</h3>${assessmentHtml(job)}<div class="jw-actions">${button('assess', 'KI-Einschätzung mit CV', job.id)}</div><p class="jw-small jw-muted">Optional: Inserat, Profil und hochgeladene Dokumente werden für eine belegte Einschätzung verarbeitet.</p><h3>Stellenbeschreibung</h3><p class="jw-small jw-muted">${job.source_type === 'manual' ? 'Von dir erfasst' : 'Aus der Quelle erfasst'} · Letzter Abruf ${dateTime(job.fetched_at)}${job.description_truncated ? ' · Beschreibung wurde wegen ihrer Länge gekürzt; Original prüfen.' : ''}</p><div class="jw-description">${esc(job.description || 'Keine vollständige Beschreibung verfügbar. Bitte Originalinserat öffnen.')}</div><h3>Verlauf</h3><p class="jw-small">Erstmals erfasst ${dateTime(job.first_seen)} · Zuletzt gesehen ${dateTime(job.last_seen)}</p>${(job.changes || []).slice().reverse().map(c => `<p class="jw-history">${dateTime(c.at)}: ${esc(c.fields.map(fieldLabel).join(', '))}</p>`).join('') || '<p>Noch keine Änderungen erfasst.</p>'}`);
    render();
  }
  function assessmentContext(job) { return C.fingerprint(JSON.stringify({ description: job.description, criteria: criteria(), profile: getProfile(), documents: documents().map(d => ({ id: d.id, text: d.raw_text })) })); }
  function assessmentHtml(job) {
    const a = job.assessment;
    if (!a) return '<p class="jw-small">Noch keine KI-Einschätzung gespeichert.</p>';
    if (job.assessment_context !== assessmentContext(job)) return '<p class="jw-small">Inserat, Profil oder Kriterien wurden geändert. Bitte die KI-Einschätzung aktualisieren.</p>';
    return `<p>${esc(a.summary || '')}</p><div class="jw-compare-wrapper"><table class="jw-table"><thead><tr><th>Kriterium</th><th>Einschätzung</th><th>Originalbelege</th></tr></thead><tbody>${(a.criteria || []).map(c => `<tr><th>${esc(c.label || c.criterion)}</th><td>${({ met: 'Erfüllt', unmet: 'Nicht erfüllt', unknown: 'Unklar' })[c.status] || 'Unklar'}<br>${esc(c.reason || '')}</td><td><strong>Inserat:</strong> ${esc(c.job_quote || 'Kein überprüfbarer Beleg')}<br><strong>Dokument:</strong> ${esc(c.document_quote || 'Kein überprüfbarer Beleg')}</td></tr>`).join('')}</tbody></table></div>`;
  }
  async function assessJob(jobId, btn) {
    if (!owner) { setNotice('Bitte melde dich für die KI-Einschätzung an.'); openAuthModal(); return; }
    const docs = documents().filter(d => d.raw_text);
    if (!docs.length) { setNotice('Bitte lade zunächst deinen CV im persönlichen Profil hoch.'); btn.closest('dialog')?.close(); openProfile(); return; }
    const job = state.jobs[jobId], epoch = generation, context = assessmentContext(job), controller = new AbortController();
    assessmentControllers.add(controller); const timeout = setTimeout(() => controller.abort(), 95000);
    btn.disabled = true; btn.textContent = 'Belege werden geprüft …';
    try {
      const { data: { session } } = await supabaseClient.auth.getSession(); if (!session || epoch !== generation) return;
      const response = await fetch(SUPABASE_URL + '/functions/v1/assess-job', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token, apikey: SUPABASE_KEY }, signal: controller.signal, body: JSON.stringify({ job: { id: job.id, title: job.title, organization: job.organization, url: job.url, description: job.description, description_truncated: job.description_truncated }, profile: getProfile(), documents: docs.map((d, i) => ({ id: String(d.id || d.storage_path || i), doc_type: d.doc_type, raw_text: d.raw_text })), criteria: criteria().filter(c => c.mode !== 'off') }) });
      const result = await response.json(); if (epoch !== generation) return;
      if (!response.ok || !result.assessment) throw new Error(result.error || 'Die KI-Einschätzung konnte nicht abgeschlossen werden.');
      state.jobs[jobId].assessment = result.assessment; state.jobs[jobId].assessment_context = context; persist(); openDetail(jobId);
    } catch (error) { if (epoch === generation) { btn.disabled = false; btn.textContent = error.name === 'AbortError' ? 'Zeitüberschreitung · Erneut versuchen' : 'Fehlgeschlagen · Erneut versuchen'; const message = document.createElement('p'); message.className = 'jw-notice warning'; message.textContent = error.name === 'AbortError' ? 'Die Anfrage dauerte zu lange.' : error.message; btn.parentElement?.appendChild(message); } }
    finally { clearTimeout(timeout); assessmentControllers.delete(controller); }
  }
  function applicationsHtml() {
    const entries = Object.entries(state.applications).filter(([jobId]) => state.jobs[jobId]);
    if (!entries.length) return '<div class="jw-empty"><h3>Deine Bewerbungen im Blick</h3><p>Merke eine Stelle, um Status, Notizen, Kontakte und nächste Schritte festzuhalten.</p></div>';
    return `<div class="jw-board">${Object.entries(C.stages).map(([stage, label]) => `<section class="jw-column"><h3>${label} <small>${entries.filter(([, a]) => a.stage === stage).length}</small></h3>${entries.filter(([, a]) => a.stage === stage).map(([jobId, app]) => `<article class="jw-card"><p class="jw-small">${esc(state.jobs[jobId].organization)}</p><h4>${esc(state.jobs[jobId].title)}</h4><p class="jw-small">${esc(app.next_step || 'Nächsten Schritt festlegen')}</p>${app.next_date ? `<p class="jw-small">Termin: ${date(app.next_date)}</p>` : ''}${button('application', 'Bearbeiten', jobId)}${button('letter', 'Entwürfe', jobId)}</article>`).join('')}</section>`).join('')}</div>`;
  }
  function patchApplication(jobId, patch) { if (!state.jobs[jobId]) throw new Error('Stelle nicht gefunden'); state.applications[jobId] = { stage: 'interested', created_at: C.now(), ...state.applications[jobId], ...patch, updated_at: C.now() }; persist(); render(); return state.applications[jobId]; }
  function openApplication(jobId) {
    const job = state.jobs[jobId]; if (!job) return;
    const app = state.applications[jobId] || { stage: 'interested' };
    dialog('Bewerbung · ' + job.title, `<form class="jw-form" data-form="application" data-id="${esc(jobId)}"><label>Status<select name="stage">${Object.entries(C.stages).map(([s, label]) => option(s, label, app.stage)).join('')}</select></label><label>Bewerbung eingereicht am<input type="date" name="applied_at" value="${esc(app.applied_at || '')}"></label><label>Kontaktperson<input name="contact" maxlength="300" value="${esc(app.contact || '')}"></label><label>Nächster Schritt<input name="next_step" maxlength="500" value="${esc(app.next_step || '')}"></label><label>Termin für nächsten Schritt<input type="date" name="next_date" value="${esc(app.next_date || '')}"></label><label>Notizen<textarea name="notes" rows="6" maxlength="20000">${esc(app.notes || '')}</textarea></label><div class="jw-actions"><button type="submit" class="jw-btn primary">Speichern</button>${button('letter', 'Bewerbungsschreiben', jobId)}</div></form>`);
  }
  function searchesHtml() {
    const profiles = state.searchProfiles.filter(p => !p.archived);
    return `<div class="jw-toolbar">${button('save-search', 'Aktuelle Suche als Profil speichern', '', true)}${button('criteria', 'Kriterien bearbeiten')}</div><p class="jw-small jw-muted">Jedes Suchprofil speichert Arbeitgeberauswahl, Ergebnisfilter und Matching-Kriterien. Dein persönliches CV-Profil bleibt davon unabhängig.</p><div class="jw-grid">${profiles.map(p => `<article class="jw-card"><h3>${esc(p.name)}</h3><p>${p.orgIds.length} Arbeitgeber · ${p.criteria.length} Kriterien</p><p class="jw-small">Geändert ${date(p.updated_at)}</p><div class="jw-actions">${button('load-search', p.id === state.activeSearchProfileId ? 'Erneut anwenden' : 'Anwenden', p.id, true)}${button('update-search', 'Mit aktueller Suche aktualisieren', p.id)}${button('archive-search', 'Archivieren', p.id)}</div></article>`).join('') || '<div class="jw-empty">Noch keine Suchprofile. Richte deine erste Suche ein und speichere sie hier.</div>'}</div>`;
  }
  function selectedOrgIds() { return state.selectedOrgIds || activeProfile()?.orgIds || (typeof getFavs === 'function' ? getFavs() : []); }
  function searchDialog(initialIds) {
    if (searching) {
      notice = 'Es läuft bereits eine Suche. Pausiere sie, um eine neue Arbeitgeberauswahl zu öffnen.';
      view = 'sources'; render(); document.querySelector('#jwProgress [data-action=cancel]')?.focus(); return;
    }
    const selected = new Set(Array.isArray(initialIds) ? initialIds : selectedOrgIds());
    const orgs = allOrgs().filter(o => o.jobs);
    const d = dialog('Arbeitgeber für diesen Suchlauf', `<p>Alle ausgewählten Arbeitgeber werden in Paketen von drei geprüft. Nicht lesbare Portale werden im Quellenstatus ausgewiesen.</p><div class="jw-toolbar">${button('choose-favorites', 'Favoriten übernehmen')}${button('choose-region', 'Aktuelle Kartenfilter übernehmen')}${button('choose-all', 'Alle auswählen')}${button('choose-none', 'Auswahl leeren')}</div><label>Arbeitgeber suchen<input type="search" id="jwOrgQuery" placeholder="Name oder Ort"></label><form data-form="search" class="jw-form"><div class="jw-org-list">${orgs.map(o => `<label class="jw-org-row" data-org-name="${esc(C.normalize(o.name + ' ' + o.loc))}"><input type="checkbox" name="org" value="${esc(o.id)}"${selected.has(o.id) ? ' checked' : ''}> <span><strong>${esc(o.name)}</strong><small> ${esc(o.loc)}</small></span></label>`).join('')}</div><p id="jwSelectedCount" class="jw-small"></p><button class="jw-btn primary" type="submit">Ausgewählte Arbeitgeber prüfen</button></form>`);
    const updateCount = () => d.querySelector('#jwSelectedCount').textContent = `${d.querySelectorAll('[name=org]:checked').length} Arbeitgeber ausgewählt`;
    updateCount(); d.addEventListener('change', updateCount);
    d.querySelector('#jwOrgQuery').addEventListener('input', e => d.querySelectorAll('.jw-org-row').forEach(row => { row.hidden = !row.dataset.orgName.includes(C.normalize(e.target.value)); }));
  }
  function criteriaDialog() {
    const fields = [['keywords', 'Fachliche Stichwörter (Komma = ODER)'], ['location', 'Arbeitsorte (Komma = ODER)'], ['workload', 'Pensum, z. B. 80-100%'], ['remote_mode', 'Arbeitsmodell: remote, hybrid, onsite'], ['languages', 'Sprachen (wie im Inserat)'], ['seniority', 'Erfahrungsniveau'], ['employment_type', 'Anstellung'], ['exclude', 'Ausschlusswörter (Komma = ODER)']];
    const current = criteria();
    dialog('Deine Matching-Kriterien', `<p>Muss-Kriterien müssen belegt erfüllt sein. Wünsche fliessen gewichtet in die Passung ein. Die Bewertung ist ein transparenter Textvergleich, keine KI-Prognose.</p><form class="jw-form" data-form="criteria">${fields.map(([field, label]) => { const c = current.find(x => x.field === field) || {}; return `<fieldset class="jw-panel" data-criterion="${field}"><legend>${label}</legend><label>Wert<input name="value" value="${esc(c.value || '')}" maxlength="400"></label><div class="jw-split"><label>Verbindlichkeit<select name="mode">${option('wish', 'Wunsch', c.mode || 'wish')}${option('must', 'Muss', c.mode)}${option('off', 'Nicht berücksichtigen', c.mode)}</select></label><label>Gewicht<select name="weight">${[1, 2, 3, 4, 5].map(w => option(w, w, c.weight || 2)).join('')}</select></label></div></fieldset>`; }).join('')}<button class="jw-btn primary" type="submit">Kriterien übernehmen</button></form>`);
  }
  function compareHtml() {
    const jobs = [...compared].map(jobId => state.jobs[jobId]).filter(Boolean);
    if (jobs.length < 2) return '<div class="jw-empty"><h3>Welche Stelle passt besser?</h3><p>Markiere zwei bis vier Stellen über «Vergleichen» auf den Stellenkarten.</p></div>';
    const fields = [['organization', 'Arbeitgeber'], ['location', 'Arbeitsort'], ['pensum', 'Pensum'], ['remote_mode', 'Arbeitsmodell'], ['languages', 'Sprachen'], ['employment_type', 'Anstellung'], ['salary_hint', 'Lohnangabe'], ['deadline', 'Bewerbungsfrist'], ['seniority', 'Erfahrungsniveau']];
    return `<div class="jw-compare-wrapper"><table class="jw-table"><thead><tr><th>Vergleich</th>${jobs.map(j => `<th>${esc(j.title)}<br>${button('compare-remove', 'Entfernen', j.id)}</th>`).join('')}</tr></thead><tbody>${fields.map(([f, label]) => `<tr><th>${label}</th>${jobs.map(j => `<td>${esc(j[f] && j[f] !== 'unknown' ? j[f] : 'Unbekannt')}</td>`).join('')}</tr>`).join('')}<tr><th>Kriterienpassung</th>${jobs.map(j => `<td>${matches(j).score == null ? 'Keine Kriterien' : matches(j).score + '% · ' + matches(j).coverage + '% beurteilbar'}</td>`).join('')}</tr><tr><th>Aufgaben / Beschreibung</th>${jobs.map(j => `<td><details><summary>Beschreibung lesen</summary><div class="jw-description">${esc(j.description || 'Unbekannt')}</div></details></td>`).join('')}</tr><tr><th>Nächster Schritt</th>${jobs.map(j => `<td>${button('application', 'Bewerbung verwalten', j.id)}${button('detail', 'Details', j.id)}</td>`).join('')}</tr></tbody></table></div>`;
  }
  const sourceLabels = { ok: 'Erfolgreich geprüft', empty: 'Keine offenen Stellen', partial: 'Teilweise geprüft', error: 'Abruf fehlgeschlagen', unsupported: 'Nicht automatisch lesbar' };
  function sourcesHtml() {
    const sources = Object.values(state.sources).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));
    return `<p class="jw-small jw-muted">Ein erfolgloser Abruf schliesst keine gespeicherte Stelle. Auch ein erfolgreicher Abruf garantiert nicht, dass ein Portal vollständig erfasst wurde.</p><div class="jw-stack">${sources.map(s => `<article class="jw-source"><div><strong>${esc(s.name || s.org_id)}</strong><span class="jw-badge ${s.status === 'ok' || s.status === 'empty' ? 'success' : 'warning'}">${sourceLabels[s.status] || 'Unbekannt'}</span><p class="jw-small">${Number(s.job_count) || 0} Inserate · ${dateTime(s.checked_at)}${s.cached ? ' · Zwischengespeichert' : ''}</p><p class="jw-small">${esc(s.message || '')}</p></div><div class="jw-actions">${button('retry-source', 'Erneut prüfen', s.org_id)}<a class="jw-btn" href="${esc(C.safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">Karriereseite ↗</a></div></article>`).join('') || '<div class="jw-empty">Nach dem ersten Suchlauf siehst du hier die Ergebnisse pro Arbeitgeber.</div>'}</div><h3>Suchverlauf</h3>${state.runs.slice().reverse().map(r => `<div class="jw-history"><strong>${dateTime(r.started_at)}</strong> · ${r.checked || 0}/${r.total} Arbeitgeber · ${r.added || 0} neu · ${r.changed || 0} geändert · ${esc(r.status)}</div>`).join('') || '<p>Noch kein Suchlauf.</p>'}`;
  }
  function manualDialog() {
    dialog('Inserat selbst erfassen', `<p>Für Stellen aus Portalen, die sich nicht automatisch lesen lassen. Übernimm die Angaben aus dem Original; lasse unbekannte Felder leer.</p><form class="jw-form" data-form="manual"><label>Direktlink zum Inserat<input type="url" name="url" required></label><label>Stellentitel<input name="title" required maxlength="300"></label><label>Arbeitgeber<input name="organization" required maxlength="300"></label><div class="jw-split"><label>Arbeitsort<input name="location" maxlength="300"></label><label>Pensum<input name="pensum" placeholder="80–100%" maxlength="100"></label></div><label>Arbeitsmodell<select name="remote_mode">${option('unknown', 'Unbekannt', 'unknown')}${option('onsite', 'Vor Ort')}${option('hybrid', 'Hybrid')}${option('remote', 'Remote')}</select></label><label>Sprachen<input name="languages" maxlength="300"></label><label>Bewerbungsfrist<input name="deadline" type="date"></label><label>Vollständiger Stellenbeschrieb<textarea name="description" required rows="10" maxlength="30000"></textarea></label><button type="submit" class="jw-btn primary">Inserat speichern</button></form>`);
  }
  async function startSearch(orgIds, resume = false, refresh = false) {
    if (searching) return;
    if (!owner) { setNotice('Melde dich an, um Karriereseiten abzurufen. Eigene Inserate kannst du bereits lokal erfassen.'); if (typeof openAuthModal === 'function') openAuthModal(); return; }
    if (!resume && !orgIds) { searchDialog(); return; }
    const valid = new Set(allOrgs().filter(o => o.jobs).map(o => o.id));
    if (!resume) {
      const ids = [...new Set(orgIds || [])].filter(orgId => valid.has(orgId));
      if (!ids.length) { setNotice('Bitte mindestens einen Arbeitgeber auswählen.'); return; }
      if (!refresh) state.selectedOrgIds = ids; state.queue = { id: id(), total: ids.length, remaining: ids, started_at: C.now(), refresh, message: '', added: 0, changed: 0 };
      state.runs.push({ id: state.queue.id, started_at: state.queue.started_at, total: ids.length, checked: 0, added: 0, changed: 0, status: 'läuft' }); state.runs = state.runs.slice(-100); persist();
    }
    if (!state.queue?.remaining.length) return;
    searching = true; abortController = new AbortController(); const controller = abortController, epoch = generation, token = ++searchToken, runId = state.queue.id;
    const isCurrent = () => epoch === generation && token === searchToken && state.queue?.id === runId;
    view = 'sources'; render();
    try {
      const { data, error } = await supabaseClient.auth.getSession(); if (!isCurrent()) return; if (error || !data.session) throw new Error('Sitzung abgelaufen. Bitte erneut anmelden.');
      while (state.queue.remaining.length && !controller.signal.aborted && isCurrent()) {
        const batch = state.queue.remaining.slice(0, 3);
        state.queue.message = batch.map(orgId => allOrgs().find(o => o.id === orgId)?.name || orgId).join(', '); render();
        const response = await fetch(SUPABASE_URL + '/functions/v1/match-jobs', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token, apikey: SUPABASE_KEY }, body: JSON.stringify({ orgs: batch.map(orgId => ({ id: orgId })), refresh: !!state.queue.refresh }), signal: controller.signal });
        let result; try { result = await response.json(); } catch { throw new Error('Die Suche lieferte keine lesbare Antwort. Der Suchlauf kann fortgesetzt werden.'); }
        if (!isCurrent() || controller.signal.aborted) return;
        if (!response.ok) throw new Error(result.error || `Abruf fehlgeschlagen (${response.status}).`);
        if (!Array.isArray(result.jobs) || !Array.isArray(result.sources) || batch.some(orgId => !result.sources.some(s => s.org_id === orgId))) throw new Error('Die Suche lieferte keinen vollständigen Quellenstatus. Bitte Backend aktualisieren; Suchlauf bleibt pausiert.');
        const counts = C.ingest(state, result.jobs, result.sources); state.queue.added += counts.added; state.queue.changed += counts.changed;
        state.queue.remaining = state.queue.remaining.slice(batch.length);
        if (result.warnings?.length) notice = result.warnings.join(' ');
        const run = state.runs.find(r => r.id === state.queue.id); if (run) Object.assign(run, { checked: state.queue.total - state.queue.remaining.length, added: state.queue.added, changed: state.queue.changed });
        persist(); render();
      }
      if (isCurrent() && !controller.signal.aborted) { state.queue.message = `${state.queue.added} neue und ${state.queue.changed} geänderte Inserate.`; const run = state.runs.find(r => r.id === state.queue.id); if (run) { run.status = 'abgeschlossen'; run.finished_at = C.now(); } setNotice(state.queue.message); }
    } catch (e) { if (isCurrent() && e.name !== 'AbortError') { state.queue.message = e.message; setNotice(e.message); } }
    finally {
      if (isCurrent()) { searching = false; abortController = null; const run = state.runs.find(r => r.id === state.queue?.id); if (run && state.queue.remaining.length) run.status = 'pausiert'; persist(); render(); }
    }
  }
  function cancelSearch() { searchToken++; if (abortController) abortController.abort(); searching = false; abortController = null; if (state.queue?.remaining.length) { const run = state.runs.find(r => r.id === state.queue.id); if (run) run.status = 'pausiert'; persist(); } }
  function saveDraft(jobId, draft) {
    if (!state.jobs[jobId]) throw new Error('Stelle nicht gefunden');
    const value = { ...draft, id: id(), created_at: C.now() }; state.drafts[jobId] = [...(state.drafts[jobId] || []), value]; persist(); render(); return value;
  }
  async function handleAction(action, jobId, target) {
    if (action === 'close-dialog') { target.closest('dialog').close(); return; }
    if (action === 'search-dialog') searchDialog();
    else if (action === 'manual') manualDialog();
    else if (action === 'criteria') criteriaDialog();
    else if (action === 'detail') openDetail(jobId);
    else if (action === 'save-job') { if (state.applications[jobId]) openApplication(jobId); else { patchApplication(jobId, {}); setNotice('Stelle auf deiner Bewerbungsliste gespeichert.'); } }
    else if (action === 'application') openApplication(jobId);
    else if (action === 'assess') await assessJob(jobId, target);
    else if (action === 'letter') { target.closest('dialog')?.close(); if (typeof openJobLetter === 'function') openJobLetter(jobId); }
    else if (action === 'close-job') { const job = state.jobs[jobId]; job.status = job.status === 'closed' ? 'open' : 'closed'; job.changed_at = C.now(); job.change_fields = ['status']; (job.changes ||= []).push({ at: job.changed_at, fields: ['status'], manual: true }); persist(); openDetail(jobId); }
    else if (action === 'cancel') { cancelSearch(); if (state.queue) state.queue.message = 'Suchlauf pausiert. Bereits geprüfte Quellen bleiben gespeichert.'; render(); }
    else if (action === 'resume') await startSearch(null, true);
    else if (action === 'retry-source') await startSearch([jobId], false, true);
    else if (action === 'filters-reset') { state.filters = {}; persist(); render(); }
    else if (action === 'compare-remove') { compared.delete(jobId); render(); }
    else if (action === 'export') exportState();
    else if (action === 'import') document.getElementById('jwImportFile').click();
    else if (action === 'sync') { if (owner) await loadCloud(); else if (typeof openAuthModal === 'function') openAuthModal(); }
    else if (action === 'cloud-load' && remoteConflict) { cancelSearch(); exportState(); state = C.hydrate(remoteConflict.data); revision = remoteConflict.revision; remoteConflict = null; dirty = false; notice = 'Kontostand geladen. Dein vorheriger lokaler Stand wurde als Sicherung heruntergeladen.'; persist(false); render(); }
    else if (action === 'save-search') {
      dialog('Suchprofil speichern', '<form data-form="save-search" class="jw-form"><label>Name<input name="name" required maxlength="100" placeholder="z. B. HTA und Versorgungsforschung"></label><button class="jw-btn primary" type="submit">Speichern</button></form>');
    } else if (action === 'load-search') { const p = state.searchProfiles.find(p => p.id === jobId); if (p) { state.activeSearchProfileId = p.id; state.selectedOrgIds = p.orgIds.slice(); state.criteria = structuredClone(p.criteria); state.criteriaConfigured = true; state.filters = { ...p.filters }; persist(); view = 'jobs'; render(); } }
    else if (action === 'update-search') { const p = state.searchProfiles.find(p => p.id === jobId); if (p) { Object.assign(p, { orgIds: selectedOrgIds().slice(), criteria: structuredClone(criteria()), filters: { ...state.filters }, updated_at: C.now() }); persist(); render(); } }
    else if (action === 'archive-search') { const p = state.searchProfiles.find(p => p.id === jobId); if (p) { p.archived = true; p.updated_at = C.now(); if (state.activeSearchProfileId === p.id) state.activeSearchProfileId = null; persist(); render(); } }
    else if (action.startsWith('choose-')) {
      const d = target.closest('dialog'); let ids = [];
      if (action === 'choose-favorites') ids = getFavs();
      if (action === 'choose-all') ids = allOrgs().map(o => o.id);
      if (action === 'choose-region') ids = getFilteredOrganizations().filter(o => o.jobs).map(o => o.id);
      d.querySelectorAll('[name=org]').forEach(el => { el.checked = ids.includes(el.value); }); d.dispatchEvent(new Event('change'));
    }
  }
  document.addEventListener('click', e => {
    const tab = e.target.closest('[data-view]'); if (tab && mount()?.contains(tab)) { view = tab.dataset.view; render(); return; }
    const target = e.target.closest('[data-action]'); if (!target || !(mount()?.contains(target) || target.closest('.jw-dialog'))) return;
    e.preventDefault(); Promise.resolve(handleAction(target.dataset.action, target.dataset.id, target)).catch(err => setNotice(err.message || 'Aktion konnte nicht abgeschlossen werden.'));
  });
  document.addEventListener('input', e => {
    const el = e.target; if (!el.dataset.filter || !mount()?.contains(el)) return;
    state.filters[el.dataset.filter] = el.type === 'checkbox' ? el.checked : el.value; persist();
    document.getElementById('jwJobList').innerHTML = jobListHtml();
  });
  document.addEventListener('change', async e => {
    const el = e.target;
    if (el.dataset.compare) { if (el.checked && compared.size >= 4) { el.checked = false; setNotice('Du kannst höchstens vier Stellen vergleichen.'); return; } el.checked ? compared.add(el.dataset.compare) : compared.delete(el.dataset.compare); const tab = document.querySelector('[data-view=compare]'); if (tab) tab.textContent = `Vergleich (${compared.size})`; }
    if (el.id === 'jwImportFile' && el.files[0]) {
      const epoch = generation;
      try {
        const file = el.files[0]; if (file.size > 15000000) throw new Error('Die Sicherung ist zu gross (max. 15 MB).');
        const input = JSON.parse(await file.text()); if (epoch !== generation) return;
        if (input.format !== 'healthjobs-workspace' || input.version !== 1 || !input.data?.jobs) throw new Error('Keine gültige Gesundheits-Jobs-Sicherung.');
        const incoming = C.hydrate(input.data);
        // Import adds records. Existing jobs, drafts and notes always remain intact.
        for (const [jobId, raw] of Object.entries(incoming.jobs)) { const clean = C.cleanJob(raw); if (clean && !state.jobs[jobId]) state.jobs[jobId] = { ...clean, id: jobId, first_seen: raw.first_seen || C.now(), last_seen: raw.last_seen || C.now(), changes: [] }; }
        for (const [jobId, app] of Object.entries(incoming.applications)) if (state.jobs[jobId] && !state.applications[jobId] && app && typeof app === 'object') state.applications[jobId] = { ...app, stage: C.stages[app.stage] ? app.stage : 'interested' };
        for (const [jobId, drafts] of Object.entries(incoming.drafts)) if (state.jobs[jobId] && Array.isArray(drafts)) { const existing = state.drafts[jobId] || []; state.drafts[jobId] = [...existing, ...drafts.filter(d => d && typeof d.text === 'string' && !existing.some(x => x.id === d.id))]; }
        for (const p of incoming.searchProfiles) if (p && Array.isArray(p.orgIds) && Array.isArray(p.criteria) && !state.searchProfiles.some(x => x.id === p.id)) state.searchProfiles.push(p);
        persist(); notice = 'Sicherung ergänzt. Bereits vorhandene Einträge wurden beibehalten.'; render();
      } catch (err) { setNotice(err.message); }
    }
  });
  document.addEventListener('submit', e => {
    const form = e.target; if (!form.dataset.form || !form.closest('.jw-dialog')) return;
    e.preventDefault(); const data = Object.fromEntries(new FormData(form)), type = form.dataset.form;
    if (type === 'application') { patchApplication(form.dataset.id, data); form.closest('dialog').close(); }
    else if (type === 'manual') { if (!C.safeUrl(data.url)) { setNotice('Bitte einen gültigen HTTPS-Link angeben.'); return; } C.ingest(state, [{ ...data, source_type: 'manual' }]); persist(); form.closest('dialog').close(); view = 'jobs'; render(); }
    else if (type === 'criteria') { state.criteriaConfigured = true; state.criteria = [...form.querySelectorAll('[data-criterion]')].map(row => ({ field: row.dataset.criterion, label: row.querySelector('legend').textContent, value: row.querySelector('[name=value]').value.trim(), mode: row.querySelector('[name=mode]').value, weight: Number(row.querySelector('[name=weight]').value) })).filter(c => c.value); persist(); form.closest('dialog').close(); render(); }
    else if (type === 'save-search') { const profile = { id: id(), name: data.name.trim(), orgIds: selectedOrgIds().slice(), criteria: structuredClone(criteria()), filters: { ...state.filters }, updated_at: C.now() }; state.searchProfiles.push(profile); state.activeSearchProfileId = profile.id; persist(); form.closest('dialog').close(); view = 'searches'; render(); }
    else if (type === 'search') { const ids = new FormData(form).getAll('org'); if (!ids.length) { form.querySelector('#jwSelectedCount').textContent = 'Bitte mindestens einen Arbeitgeber wählen.'; return; } state.selectedOrgIds = ids; persist(); form.closest('dialog').close(); startSearch(ids); }
  });
  window.HealthJobs = {
    render, startSearch, cancelSearch, openEmployerSelection: searchDialog, sync: syncCloud, getJob: jobId => state.jobs[jobId], getApplication: jobId => state.applications[jobId], patchApplication,
    getDrafts: jobId => state.drafts[jobId] || [], saveDraft, getSender: () => state.sender,
    saveSender: sender => { state.sender = { ...sender }; persist(); return state.sender; }, getCriteria: matches,
    getOwner: () => owner, exportState
  };
  window.addEventListener('healthjobs:auth', e => switchOwner(e.detail?.userId || null));
  window.addEventListener('online', () => { if (owner) loadCloud(); });
  window.addEventListener('pagehide', () => { state.lastVisitAt = entryTimes.get(owner || 'guest')?.current || C.now(); persist(); });
  switchOwner(owner);
})();
