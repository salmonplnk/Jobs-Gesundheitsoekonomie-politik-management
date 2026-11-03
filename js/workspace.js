/* "Meine Suche": durable user-scoped data, saved jobs, applications board,
   searches and the entry point for job alerts (js/alerts.js). */
(function () {
  'use strict';
  const C = window.JobCore;
  const F = () => window.HealthJobFacts;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const attr = value => String(value ?? '').replace(/["\\]/g, '\\$&');
  const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('de-CH') : 'Unbekannt';
  const dateTime = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('de-CH') : 'Noch nie';
  const uid = () => typeof currentUser !== 'undefined' && currentUser ? currentUser.id : null;
  const id = () => crypto.randomUUID();
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  let owner = uid(), generation = 0, state = C.emptyState(), revision = 0, dirty = false;
  let syncing = false, syncAgain = false, reloadAfterSave = false, mutation = 0, syncTimer, remoteConflict = null, syncMessage = '', notice = '';
  let searchToken = 0;
  let view = 'jobs', compared = new Set(), searching = false, abortController = null, moreFilters = false, dragId = null;
  const entryTimes = new Map();
  const assessmentControllers = new Set();
  const ONBOARDING_KEY = 'healthjobs.onboarding.v1';
  const TABS = [['jobs', 'Gemerkt'], ['applications', 'Bewerbungen'], ['alerts', 'Jobalarme'], ['searches', 'Suchprofile'], ['compare', 'Vergleich'], ['sources', 'Quellen & Verlauf']];
  const STAGES = Object.keys(C.stages);
  const RUNNING = ['applied', 'interview', 'offer'];
  const mount = () => document.getElementById('jobWorkspace');
  const key = () => 'healthjobs.workspace.v1.' + (owner || 'guest');
  const activeProfile = () => state.searchProfiles.find(x => x.id === state.activeSearchProfileId && !x.archived);
  const userProfile = () => typeof getProfile === 'function' ? getProfile() || {} : {};
  const criteria = () => state.criteriaConfigured || state.criteria.length ? state.criteria : C.defaultCriteria(userProfile());
  const documents = () => typeof getDocuments === 'function' ? getDocuments() : [];
  const matches = job => C.evaluate(job, criteria(), documents());
  const alertsApi = () => window.HealthJobAlerts;

  /* ---------- Icons (inline, stroke = currentColor) ---------- */
  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>', bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>', external: '<path d="M14 4h6v6M20 4 10 14M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>', close: '<path d="M18 6 6 18M6 6l12 12"/>', filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    building: '<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/>', edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'
  };
  const icon = (name, cls = 'jw-i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;

  /* ---------- Persistence and sync (unchanged contract) ---------- */
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
    render(); emitSaved(null, null); if (owner) await loadCloud();
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
      else if (data && !dirty) { state = C.hydrate(data.data); revision = data.revision; state.lastVisitAt = entryTimes.get(target).previous || state.lastVisitAt; syncMessage = 'Mit Konto synchronisiert'; persist(false); emitSaved(null, null); }
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
    if (conflict) { conflict.hidden = !remoteConflict; conflict.innerHTML = remoteConflict ? 'Dein Konto enthält einen neueren Stand. Vor dem Laden wird dein lokaler Stand als Sicherung heruntergeladen. <button type="button" class="btn btn-sm" data-action="cloud-load">Kontostand laden + lokale Sicherung</button>' : ''; }
  }
  function download(name, content, type = 'application/json') { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function exportState() { download('Gesundheits-Jobs_' + C.now().slice(0, 10) + '.json', JSON.stringify({ format: 'healthjobs-workspace', version: 1, exported_at: C.now(), data: state }, null, 2)); }
  function setNotice(message) { notice = message; const el = document.getElementById('jwNotice'); if (el) { el.textContent = message; el.hidden = !message; } }

  /* ---------- Saved jobs ("Merken") ---------- */
  const isSavedId = jobId => !!(jobId && state.jobs[jobId] && state.applications[jobId]);
  function storedIdFor(jobOrId) {
    if (!jobOrId) return null;
    if (typeof jobOrId === 'string') return state.jobs[jobOrId] ? jobOrId : null;
    if (typeof jobOrId.id === 'string' && state.jobs[jobOrId.id]) return jobOrId.id;
    const url = C.canonicalUrl(jobOrId.url); if (!url) return null;
    return Object.values(state.jobs).find(j => C.canonicalUrl(j.url) === url)?.id || null;
  }
  const savedJobs = () => Object.values(state.jobs).filter(j => isSavedId(j.id));
  function hasProgress(jobId) { const a = state.applications[jobId]; return !!a && (a.stage !== 'interested' || ['notes', 'contact', 'next_step', 'next_date', 'applied_at'].some(k => String(a[k] || '').trim())); }
  function markSaved(jobId, via) { if (!state.applications[jobId]) state.applications[jobId] = { stage: 'interested', created_at: C.now(), updated_at: C.now(), ...(via ? { saved_via: via } : {}) }; }
  function emitSaved(jobId, saved) { window.dispatchEvent(new CustomEvent('healthjobs:saved-changed', { detail: { jobId, saved, ...(jobId == null ? { reset: true } : {}) } })); }
  function unsave(jobId, { fromFeed = false } = {}) {
    const app = state.applications[jobId]; if (!app) return { saved: false, jobId };
    if (hasProgress(jobId)) {
      if (fromFeed) { const message = 'Diese Stelle hat bereits Status oder Notizen in deinen Bewerbungen. Verwalte sie unter «Meine Suche › Bewerbungen».'; setNotice(message); return { saved: true, jobId, blocked: true, message, error: message }; }
      if (!confirm('Stelle nicht mehr merken? Status, Termine und Notizen dieser Bewerbung werden gelöscht. Entwürfe bleiben erhalten.')) return { saved: true, jobId, cancelled: true };
    }
    delete state.applications[jobId];
    const job = state.jobs[jobId];
    // A bookmark taken straight from the public feed leaves no trace once it is removed.
    if (app.saved_via === 'feed' && job && job.source_type !== 'manual' && !job.assessment && !(state.drafts[jobId] || []).length) { delete state.jobs[jobId]; compared.delete(jobId); }
    persist(); render(); emitSaved(jobId, false);
    return { saved: false, jobId };
  }
  function ingestPublic(rawJobs, rawSources = []) {
    if (!Array.isArray(rawJobs) || !rawJobs.length || rawJobs.length > 100) throw new Error('Bitte 1 bis 100 gültige Inserate übernehmen.');
    const known = new Set(allOrgs().map(org => org.id));
    const incoming = rawJobs.map(raw => {
      const job = C.cleanJob(raw);
      if (!job || !known.has(job.org_id) || !job.id.startsWith(job.org_id + ':') || !Number.isFinite(Date.parse(raw.fetched_at))) throw new Error('Ungültiges Inserat oder unbekannte Quelle.');
      const byId = state.jobs[job.id];
      if (byId && C.canonicalUrl(byId.url) !== C.canonicalUrl(job.url)) throw new Error('Die Inserat-ID gehört bereits zu einem anderen Link.');
      const previous = byId || Object.values(state.jobs).find(item => C.canonicalUrl(item.url) === C.canonicalUrl(job.url));
      return { job, previous, keepPrevious: previous && (previous.source_type === 'manual' || Date.parse(previous.fetched_at) > Date.parse(job.fetched_at)) };
    });
    const relevant = new Set(incoming.map(item => item.job.org_id));
    const sanitized = C.hydrate({ sources: Object.fromEntries((Array.isArray(rawSources) ? rawSources : []).filter(source => relevant.has(source?.org_id)).map(source => [source.org_id, source])) }).sources;
    const sources = Object.values(sanitized).filter(source => !state.sources[source.org_id] || (Date.parse(source.checked_at) || 0) >= (Date.parse(state.sources[source.org_id].checked_at) || 0));
    const counts = C.ingest(state, incoming.filter(item => !item.keepPrevious).map(item => item.job), sources);
    return { counts, ids: incoming.map(item => item.previous?.id || item.job.id), incoming };
  }
  function importPublicJobs(rawJobs, rawSources = []) {
    const { counts, ids } = ingestPublic(rawJobs, rawSources);
    const newlySaved = ids.filter(jobId => !state.applications[jobId]);
    for (const jobId of newlySaved) markSaved(jobId, 'feed');
    persist(); view = 'jobs'; notice = `${counts.added} Inserate ergänzt · ${counts.changed} aktualisiert. Gemerkte Stellen und Bewerbungsnotizen bleiben erhalten.`; render();
    for (const jobId of newlySaved) emitSaved(jobId, true);
    if (ids.length === 1) openDetail(ids[0]);
    return counts;
  }
  function toggleSaved(publicJob, source) {
    if (!publicJob || typeof publicJob !== 'object') throw new Error('Ungültige Stelle.');
    const existing = storedIdFor(publicJob), publicId = typeof publicJob.id === 'string' ? publicJob.id : existing;
    if (isSavedId(existing)) { const result = unsave(existing, { fromFeed: true }); if (!result.saved && publicId !== existing) emitSaved(publicId, false); return result; }
    let storedId = existing;
    if (!storedId) {
      const raw = { ...publicJob, fetched_at: publicJob.fetched_at || publicJob.last_seen || C.now() };
      // Feed list entries carry an excerpt; the detail dialog then points to the original.
      if (raw.detail_file && String(raw.description || '').length >= 990 && raw.description_truncated !== false) raw.description_truncated = true;
      storedId = ingestPublic([raw], source && typeof source === 'object' ? [source] : []).ids[0];
      markSaved(storedId, 'feed');
    } else markSaved(storedId);
    persist(); render(); emitSaved(publicId, true); if (publicId !== storedId) emitSaved(storedId, true);
    return { saved: true, jobId: storedId };
  }

  /* ---------- Personal fit for the public feed ---------- */
  const matchCache = new Map(); let matchCacheKey = '';
  function getProfileMatch(job) {
    if (!job || typeof job !== 'object') return null;
    const profile = userProfile(), configured = state.criteriaConfigured ? state.criteria : [];
    const cacheKey = JSON.stringify([profile, configured]);
    if (cacheKey !== matchCacheKey) { matchCache.clear(); matchCacheKey = cacheKey; }
    const cacheId = typeof job.id === 'string' ? `${job.id}|${job.fetched_at || ''}|${String(job.description || '').length}|${job.relevance?.category || ''}` : null;
    if (cacheId && matchCache.has(cacheId)) return matchCache.get(cacheId);
    const facts = F();
    const result = C.profileMatch(job, profile, { criteria: configured, cantonOf: facts?.cantonFromLocation, seniorityOf: j => facts?.extractFacts ? facts.extractFacts(j).seniority : null });
    if (cacheId) { if (matchCache.size > 3000) matchCache.clear(); matchCache.set(cacheId, result); }
    return result;
  }
  let lastProfile = null;
  try { lastProfile = localStorage.getItem('userProfile'); } catch {}
  function checkProfileChange() {
    let current = null; try { current = localStorage.getItem('userProfile'); } catch {}
    if (current === lastProfile) return;
    lastProfile = current; window.dispatchEvent(new CustomEvent('healthjobs:profile-changed', { detail: { source: 'account' } }));
  }

  /* ---------- Shell ---------- */
  const option = (value, label, selected) => `<option value="${esc(value)}"${String(selected ?? '') === String(value) ? ' selected' : ''}>${esc(label)}</option>`;
  const button = (action, label, jobId = '', variant = '') => `<button type="button" class="btn btn-sm${variant ? ' btn-' + variant : ''}" data-action="${action}"${jobId ? ` data-id="${esc(jobId)}"` : ''}>${label}</button>`;
  function deadlineChip(job) {
    const day = C.deadlineDay(job.deadline); if (!day) return job.deadline ? `<span class="chip">Frist: ${esc(job.deadline)}</span>` : '';
    const days = C.daysUntil(day), shown = date(day);
    if (days < 0) return `<span class="chip chip-danger">Frist abgelaufen · ${shown}</span>`;
    if (days === 0) return '<span class="chip chip-danger">Frist heute</span>';
    if (days <= 7) return `<span class="chip chip-accent">Frist in ${days} ${days === 1 ? 'Tag' : 'Tagen'} · ${shown}</span>`;
    return `<span class="chip">Frist ${shown}</span>`;
  }
  function summary() {
    const saved = savedJobs(), apps = Object.entries(state.applications).filter(([jobId]) => state.jobs[jobId]).map(([, a]) => a);
    const fresh = Object.values(state.jobs).filter(j => C.freshness(j, state.lastVisitAt) === 'new').length;
    const dueSoon = saved.filter(j => { const days = C.daysUntil(C.deadlineDay(j.deadline)); return j.status !== 'closed' && days != null && days >= 0 && days <= 7 && ['interested', 'preparing'].includes(state.applications[j.id].stage); }).length;
    const items = [[saved.length, saved.length === 1 ? 'Stelle gemerkt' : 'Stellen gemerkt'], [apps.filter(a => RUNNING.includes(a.stage)).length, 'laufende Bewerbungen'], [dueSoon, 'Fristen in 7 Tagen', 'accent'], [fresh, 'neu seit deinem letzten Besuch']].filter(([n]) => n > 0);
    if (!items.length) return '';
    return `<ul class="jw-stats" aria-label="Überblick">${items.map(([n, label, tone]) => `<li${tone ? ` class="is-${tone}"` : ''}><strong>${n}</strong> ${label}</li>`).join('')}</ul>`;
  }
  function tabCount(tab) {
    if (tab === 'jobs') return savedJobs().length;
    if (tab === 'applications') return Object.entries(state.applications).filter(([jobId, a]) => state.jobs[jobId] && a.stage !== 'interested').length;
    if (tab === 'alerts') return alertsApi()?.count?.() || 0;
    if (tab === 'compare') return compared.size;
    return 0;
  }
  function tabsHtml() {
    return `<div class="jw-tabs" role="tablist" aria-label="Bereiche in Meine Suche">${TABS.map(([tab, label]) => { const n = tabCount(tab), active = tab === view; return `<button type="button" role="tab" id="jwTab-${tab}" data-tab="${tab}" aria-selected="${active}" aria-controls="jwContent" tabindex="${active ? 0 : -1}" class="${active ? 'active' : ''}">${label}<span class="jw-tab-count"${n ? '' : ' hidden'}>${n}</span></button>`; }).join('')}</div>`;
  }
  function headHtml() {
    const p = activeProfile();
    return `<header class="view-head jw-head"><div><h2>Meine Suche</h2><p>Gemerkte Stellen, Bewerbungen und Jobalarme an einem Ort${owner ? ', mit deinem Konto synchronisiert' : ', vorerst auf diesem Gerät gespeichert'}.${p ? ` Aktives Suchprofil: <strong>${esc(p.name)}</strong>.` : ''}</p></div><div class="jw-head-actions"><button type="button" class="btn" data-action="manual">${icon('plus')}Inserat erfassen</button><button type="button" class="btn btn-primary" data-action="search-dialog">${icon(searching ? 'search' : 'building')}${searching ? 'Suchlauf ansehen' : 'Arbeitgeber prüfen'}</button></div></header>`;
  }
  function onboardingSteps() {
    const profile = userProfile(), loggedIn = !!owner, alerts = alertsApi();
    return [
      { done: !!((profile.desired_regions || []).length || String(profile.field_of_study || '').trim() || String(profile.keywords || '').trim()), title: 'Fachbereich & Region wählen', text: 'Fachrichtung, Stichwörter und Wunschregion bestimmen, wie gut eine Stelle zu dir passt.', action: 'onboarding-profile', label: 'Profil ausfüllen', icon: 'user' },
      { done: documents().some(d => d.doc_type === 'cv'), title: 'CV hochladen', text: loggedIn ? 'Dein CV belegt die Passung und hilft beim Bewerbungsschreiben.' : 'Mit einem Konto lädst du deinen CV hoch. Er belegt die Passung.', action: loggedIn ? 'onboarding-cv' : 'onboarding-login', label: loggedIn ? 'CV hochladen' : 'Anmelden', icon: 'file' },
      { done: (alerts?.count?.() || 0) > 0, title: 'Jobalarm einrichten', text: 'Neue passende Stellen kommen täglich oder wöchentlich per E-Mail.', action: 'onboarding-alert', label: 'Jobalarm einrichten', icon: 'bell' }
    ];
  }
  function onboardingDismissed() { try { return localStorage.getItem(ONBOARDING_KEY) === 'dismissed'; } catch { return false; } }
  function onboardingHtml() {
    if (onboardingDismissed()) return '';
    const steps = onboardingSteps(), done = steps.filter(s => s.done).length;
    if (done === steps.length) return '';
    return `<section class="jw-onboarding" aria-labelledby="jwOnbTitle"><div class="jw-onb-head"><div><p class="eyebrow">Erste Schritte · ${done} von ${steps.length} erledigt</p><h3 id="jwOnbTitle">Richte deine Suche in drei Schritten ein</h3></div><button type="button" class="btn btn-ghost btn-sm" data-action="onboarding-dismiss">Ausblenden</button></div><ol class="jw-steps">${steps.map((s, i) => `<li class="jw-step${s.done ? ' is-done' : ''}"><span class="jw-step-mark" aria-hidden="true">${s.done ? icon('check') : i + 1}</span><div class="jw-step-body"><h4>${s.title}<span class="visually-hidden">${s.done ? ' (erledigt)' : ' (offen)'}</span></h4><p>${s.text}</p>${s.done ? `<p class="jw-step-done">${icon('check')}Erledigt</p>` : `<button type="button" class="btn btn-sm${i === steps.findIndex(x => !x.done) ? ' btn-primary' : ''}" data-action="${s.action}">${s.label}</button>`}</div></li>`).join('')}</ol></section>`;
  }
  function focusSelector(el) {
    const root = mount(); if (!el || !root?.contains(el)) return null;
    for (const name of ['data-stage-select', 'data-filter', 'data-tab', 'data-compare']) if (el.hasAttribute(name)) return `[${name}="${attr(el.getAttribute(name))}"]`;
    if (el.dataset.alertAction) return `[data-alert-action="${attr(el.dataset.alertAction)}"]${el.dataset.alertId ? `[data-alert-id="${attr(el.dataset.alertId)}"]` : ''}`;
    if (el.dataset.action) return `[data-action="${attr(el.dataset.action)}"]${el.dataset.id ? `[data-id="${attr(el.dataset.id)}"]` : ''}`;
    return null;
  }
  function render() {
    const root = mount(); if (!root) return;
    root.dataset.ready = '1';
    const active = document.activeElement, selector = focusSelector(active), movedId = active?.dataset?.id || active?.dataset?.stageSelect;
    root.innerHTML = `<div class="jw-shell">${headHtml()}${onboardingHtml()}${summary()}${tabsHtml()}
      <div id="jwNotice" class="jw-notice" role="status"${notice ? '' : ' hidden'}>${esc(notice)}</div><div id="jwConflict" class="jw-notice warning" hidden></div>
      <div id="jwProgress">${progressHtml()}</div><div id="jwContent" class="jw-content" role="tabpanel" aria-labelledby="jwTab-${view}" tabindex="-1">${viewHtml()}</div>
      <footer class="jw-footer"><span id="jwSync" role="status"></span><div class="jw-footer-actions">${button('sync', 'Erneut synchronisieren', '', 'ghost')}${button('export', 'Daten exportieren', '', 'ghost')}${button('import', 'Sicherung importieren', '', 'ghost')}</div><input type="file" id="jwImportFile" accept="application/json,.json" hidden></footer></div>`;
    renderStatus();
    if (view === 'alerts') alertsApi()?.render?.(document.getElementById('jwAlerts'));
    if (selector) (root.querySelector(selector) || (movedId ? root.querySelector(`[data-stage-select="${attr(movedId)}"]`) : null))?.focus({ preventScroll: true });
    checkProfileChange();
  }
  function progressHtml() {
    const q = state.queue; if (!q) return '';
    const done = q.total - q.remaining.length;
    return `<div class="jw-progress"><strong>${searching ? 'Suche läuft' : q.remaining.length ? 'Suche pausiert' : 'Suche abgeschlossen'}: ${done} von ${q.total} Arbeitgebern geprüft</strong><progress max="${q.total || 1}" value="${done}"></progress><span class="jw-small">${esc(q.message || '')}</span><div class="jw-actions">${searching ? button('cancel', 'Pausieren') : q.remaining.length ? button('resume', 'Fortsetzen', '', 'primary') : ''}</div></div>`;
  }
  function viewHtml() {
    return view === 'jobs' ? jobsHtml() : view === 'applications' ? applicationsHtml() : view === 'alerts' ? alertsHtml() : view === 'searches' ? searchesHtml() : view === 'compare' ? compareHtml() : sourcesHtml();
  }
  function showTab(tab, { focus = false } = {}) {
    if (!TABS.some(([t]) => t === tab)) return;
    view = tab; render();
    if (focus) document.getElementById('jwTab-' + tab)?.focus();
  }

  /* ---------- Gemerkt ---------- */
  function startHtml() {
    return `<div class="jw-start"><div class="jw-start-intro"><span class="jw-start-mark">${icon('bookmark')}</span><h3>Noch keine Stellen gemerkt</h3><p>Merke dir Stellen aus dem Feed, prüfe die Karriereseiten ausgewählter Arbeitgeber oder erfasse ein Inserat selbst. Hier verfolgst du danach Status, Fristen und Notizen.</p></div>
      <ul class="jw-start-actions"><li><a class="jw-start-card is-primary" href="#stellen">${icon('search')}<span><strong>Stellen entdecken</strong><small>Fachlich geprüfte Stellen durchsuchen und mit einem Klick merken.</small></span></a></li><li><button type="button" class="jw-start-card" data-action="search-dialog">${icon('building')}<span><strong>Arbeitgeber auswählen</strong><small>Karriereseiten von Spitälern, Versicherern und Behörden gezielt prüfen.</small></span></button></li><li><button type="button" class="jw-start-card" data-action="manual">${icon('plus')}<span><strong>Inserat selbst erfassen</strong><small>Für Stellen aus Portalen, die sich nicht automatisch lesen lassen.</small></span></button></li></ul></div>`;
  }
  const extraFilterKeys = ['role', 'location', 'remote_mode', 'workload', 'seniority', 'employment_type', 'languages', 'freshness', 'showClosed', 'showIneligible'];
  const activeExtraFilters = () => extraFilterKeys.filter(k => state.filters[k]).length;
  const moreLabel = () => { const n = activeExtraFilters(); return `Mehr Filter${n ? ` (${n} aktiv)` : ''}`; };
  function scope() { const s = state.filters.scope; return s === 'all' || s === 'saved' ? s : savedJobs().length ? 'saved' : 'all'; }
  function filtersHtml() {
    const f = state.filters, jobs = Object.values(state.jobs);
    const distinct = field => [...new Set(jobs.map(j => j[field]).filter(Boolean))].sort();
    const select = (key, label, values) => `<label class="jw-field">${label}<select data-filter="${key}">${option('', 'Alle', f[key])}${values.map(v => option(Array.isArray(v) ? v[0] : v, Array.isArray(v) ? v[1] : v, f[key])).join('')}</select></label>`;
    return `<div class="jw-filterbar"><label class="jw-field jw-grow">Stichwort<input data-filter="q" type="search" value="${esc(f.q || '')}" placeholder="Titel, Arbeitgeber oder Aufgaben" autocomplete="off"></label><label class="jw-field">Sortieren<select data-filter="sort">${[['newest', 'Neueste zuerst'], ['score', 'Kriterienpassung'], ['deadline', 'Bewerbungsfrist'], ['organization', 'Arbeitgeber']].map(([v, l]) => option(v, l, f.sort || 'newest')).join('')}</select></label><button type="button" class="btn jw-more-toggle" data-action="more-filters" aria-expanded="${moreFilters}" aria-controls="jwMoreFilters">${icon('filter')}<span data-more-label>${moreLabel()}</span></button></div>
      <div id="jwMoreFilters" class="jw-more"${moreFilters ? '' : ' hidden'}><div class="jw-filters">${select('role', 'Tätigkeitsfeld', C.roles)}${select('location', 'Arbeitsort', distinct('location'))}${select('remote_mode', 'Arbeitsmodell', [['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'Vor Ort'], ['unknown', 'Unbekannt']])}${select('workload', 'Pensum (Überschneidung)', ['40-60%', '60-80%', '80-100%'])}${select('seniority', 'Karrierestufe', distinct('seniority'))}${select('employment_type', 'Anstellung', distinct('employment_type'))}<label class="jw-field">Sprache<input data-filter="languages" value="${esc(f.languages || '')}" placeholder="z. B. Deutsch"></label>${select('freshness', 'Veränderungen', [['new', 'Neu'], ['changed', 'Geändert'], ['seen', 'Bereits gesehen'], ['closed', 'Geschlossen']])}</div>
      <div class="jw-checks"><label><input type="checkbox" data-filter="showClosed"${f.showClosed ? ' checked' : ''}> Geschlossene einschliessen</label><label><input type="checkbox" data-filter="showIneligible"${f.showIneligible ? ' checked' : ''}> Auch ungeklärte / nicht erfüllte Muss-Kriterien</label></div>
      <div class="jw-actions">${button('filters-reset', 'Filter zurücksetzen')}${button('criteria', 'Matching-Kriterien einstellen')}</div></div>`;
  }
  function scopeHtml() {
    const total = Object.keys(state.jobs).length, saved = savedJobs().length; if (total === saved) return '';
    const s = scope();
    return `<div class="jw-segment" role="group" aria-label="Welche Stellen anzeigen"><button type="button" data-action="scope" data-id="saved" aria-pressed="${s === 'saved'}">Gemerkt <span>${saved}</span></button><button type="button" data-action="scope" data-id="all" aria-pressed="${s === 'all'}">Alle erfassten <span>${total}</span></button></div>`;
  }
  function jobsHtml() { return Object.keys(state.jobs).length ? scopeHtml() + filtersHtml() + `<div id="jwJobList">${jobListHtml()}</div>` : startHtml(); }
  function jobListHtml() {
    const s = scope(), base = Object.values(state.jobs).filter(j => s === 'all' || isSavedId(j.id));
    // Explicitly saved jobs stay visible even when must-criteria are open.
    const jobs = C.filterJobs(base, { ...state.filters, saved: false, showIneligible: s === 'saved' || state.filters.showIneligible }, state, criteria());
    const head = `<p class="jw-count">${jobs.length === base.length ? `${jobs.length} ${jobs.length === 1 ? 'Stelle' : 'Stellen'}` : `${jobs.length} von ${base.length} Stellen`}</p>`;
    if (jobs.length) return head + `<div class="jw-grid">${jobs.map(jobCard).join('')}</div>`;
    if (!base.length) return `<div class="jw-empty"><h3>Noch nichts gemerkt</h3><p>Merke Stellen aus deinen Suchläufen oder aus dem Feed. Sie erscheinen dann hier.</p><div class="jw-actions">${button('scope', 'Alle erfassten Stellen zeigen', 'all', 'primary')}<a class="btn btn-sm" href="#stellen">Stellen entdecken</a></div></div>`;
    return head + `<div class="jw-empty"><h3>Keine Stelle passt zu diesen Filtern</h3><p>Lockere einen Filter oder prüfe die Muss-Kriterien.</p><div class="jw-actions">${button('filters-reset', 'Filter zurücksetzen', '', 'primary')}</div></div>`;
  }
  const freshnessLabels = { new: 'Neu', changed: 'Geändert', seen: 'Gesehen', closed: 'Geschlossen' };
  const freshnessTone = { new: 'chip-brand', changed: 'chip-accent', closed: 'chip-danger' };
  function fitHtml(job) {
    const fit = getProfileMatch(job), m = matches(job);
    const parts = [];
    if (fit) parts.push(`<span class="jw-fit is-${fit.level}" title="${esc(fit.reasons.join(' · '))}"><span class="jw-fit-bar" aria-hidden="true"><span style="width:${fit.score}%"></span></span>${esc(fit.label)} · ${fit.score}%</span>`);
    else if (m.score != null) parts.push(`<span class="jw-fit is-${m.score >= 70 ? 'high' : m.score >= 40 ? 'medium' : 'low'}">${m.score}% Kriterienpassung · ${m.coverage}% beurteilbar</span>`);
    if (m.score != null && !m.eligible) parts.push('<span class="chip chip-accent">Muss-Kriterien offen</span>');
    return parts.length ? `<div class="jw-card-fit">${parts.join('')}</div>` : '';
  }
  function jobCard(job) {
    const fresh = C.freshness(job, state.lastVisitAt), app = state.applications[job.id], saved = !!app;
    const meta = [job.location || 'Arbeitsort unbekannt', job.pensum || 'Pensum unbekannt', { remote: 'Remote', hybrid: 'Hybrid', onsite: 'Vor Ort' }[job.remote_mode]].filter(Boolean);
    const chips = [fresh !== 'seen' ? `<span class="chip ${freshnessTone[fresh] || ''}">${freshnessLabels[fresh]}</span>` : '', app && app.stage !== 'interested' ? `<span class="chip chip-brand">${esc(C.stages[app.stage])}</span>` : '', deadlineChip(job)].filter(Boolean).join('');
    return `<article class="jw-card jw-job"><p class="jw-org">${esc(job.organization)}</p><h3><button type="button" class="jw-link" data-action="detail" data-id="${esc(job.id)}">${esc(job.title)}</button></h3><p class="jw-meta">${meta.map(esc).join('<span aria-hidden="true"> · </span>')}</p>${chips ? `<div class="jw-chips">${chips}</div>` : ''}${fitHtml(job)}${job.change_fields?.length && fresh === 'changed' ? `<p class="jw-small jw-muted">Geändert: ${esc(job.change_fields.map(fieldLabel).join(', '))}</p>` : ''}
      <div class="jw-card-actions"><button type="button" class="btn btn-sm jw-save${saved ? ' is-saved' : ''}" data-action="toggle-save" data-id="${esc(job.id)}" aria-pressed="${saved}">${icon('bookmark')}${saved ? 'Gemerkt' : 'Merken'}</button>${saved ? button('application', 'Bewerbung', job.id) : ''}<a class="btn btn-sm btn-ghost" href="${esc(C.safeUrl(job.url))}" target="_blank" rel="noopener noreferrer">Inserat${icon('external')}<span class="visually-hidden"> (öffnet neues Fenster)</span></a><label class="jw-compare-check"><input type="checkbox" data-compare="${esc(job.id)}"${compared.has(job.id) ? ' checked' : ''}> Vergleichen</label></div></article>`;
  }
  function fieldLabel(field) { return ({ title: 'Titel', description: 'Beschreibung', pensum: 'Pensum', location: 'Arbeitsort', languages: 'Sprachen', salary_hint: 'Lohn', deadline: 'Frist', remote_mode: 'Arbeitsmodell', employment_type: 'Anstellung', status: 'Status' })[field] || field; }
  function dialog(title, body, modalId = 'jwDialog') {
    let d = document.getElementById(modalId); if (d) d.remove(); d = document.createElement('dialog'); d.id = modalId; d.className = 'jw-dialog';
    d.setAttribute('aria-labelledby', modalId + 'Title');
    d.innerHTML = `<div class="jw-dialog-head"><h2 id="${modalId}Title">${esc(title)}</h2><button type="button" class="jw-icon-btn" data-action="close-dialog" aria-label="Schliessen">${icon('close')}</button></div><div class="jw-dialog-body">${body}</div>`;
    document.body.appendChild(d); d.showModal(); return d;
  }
  function criteriaTable(job) {
    const m = matches(job); if (!m.criteria.length) return '<p>Lege Suchkriterien fest, um die Passung zu beurteilen.</p>';
    return `<p class="jw-small">Textbasierter Kriterienvergleich. Ein Texttreffer belegt keine vollständige Qualifikation. Unbekannte Angaben zählen nicht als erfüllt.</p><div class="jw-compare-wrapper"><table class="jw-table"><thead><tr><th>Kriterium</th><th>Ergebnis</th><th>Beleg aus Inserat</th><th>CV / Zeugnis</th></tr></thead><tbody>${m.criteria.map(c => `<tr><th>${esc(c.label || c.field)}<br><small>${esc(c.value)} · ${c.mode === 'must' ? 'Muss' : 'Wunsch'} · Gewicht ${c.weight}</small></th><td>${({ met: 'Erfüllt', unmet: 'Nicht erfüllt', unknown: 'Unklar' })[c.status]}</td><td>${esc(c.evidence || 'Keine belegte Angabe')}</td><td>${esc(c.profileEvidence || 'Kein Textbeleg zugeordnet')}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function openDetail(jobId) {
    const job = state.jobs[jobId]; if (!job) return;
    job.seen_at = C.now(); persist();
    const saved = isSavedId(jobId), fit = getProfileMatch(job);
    dialog(job.title, `<p>${esc(job.organization)} · ${esc(job.location || 'Arbeitsort unbekannt')}</p><div class="jw-chips">${deadlineChip(job)}${saved ? `<span class="chip chip-brand">${esc(C.stages[state.applications[jobId].stage])}</span>` : ''}</div><div class="jw-actions"><a class="btn btn-sm btn-primary" href="${esc(C.safeUrl(job.url))}" target="_blank" rel="noopener noreferrer">Originalinserat${icon('external')}</a><button type="button" class="btn btn-sm jw-save${saved ? ' is-saved' : ''}" data-action="toggle-save" data-id="${esc(job.id)}" aria-pressed="${saved}">${icon('bookmark')}${saved ? 'Gemerkt' : 'Merken'}</button>${button('application', 'Bewerbung verwalten', job.id)}${button('letter', 'Schreiben erstellen', job.id)}${button('close-job', job.status === 'closed' ? 'Als offen markieren' : 'Als geschlossen markieren', job.id)}</div>${fit ? `<h3>Passung zu deinem Profil</h3><p><strong>${esc(fit.label)} · ${fit.score}%</strong></p><ul class="jw-reasons">${fit.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}<h3>Passung zu deinen Kriterien</h3>${criteriaTable(job)}<h3>KI-Prüfung mit CV-Belegen</h3>${assessmentHtml(job)}<div class="jw-actions">${button('assess', 'KI-Einschätzung mit CV', job.id)}</div><p class="jw-small jw-muted">Optional: Inserat, Profil und hochgeladene Dokumente werden für eine belegte Einschätzung verarbeitet.</p><h3>Stellenbeschreibung</h3><p class="jw-small jw-muted">${job.source_type === 'manual' ? 'Von dir erfasst' : 'Aus der Quelle erfasst'} · Letzter Abruf ${dateTime(job.fetched_at)}${job.description_truncated ? ' · Beschreibung ist gekürzt; Original prüfen.' : ''}</p><div class="jw-description">${esc(job.description || 'Keine vollständige Beschreibung verfügbar. Bitte Originalinserat öffnen.')}</div><h3>Verlauf</h3><p class="jw-small">Erstmals erfasst ${dateTime(job.first_seen)} · Zuletzt gesehen ${dateTime(job.last_seen)}</p>${(job.changes || []).slice().reverse().map(c => `<p class="jw-history">${dateTime(c.at)}: ${esc(c.fields.map(fieldLabel).join(', '))}</p>`).join('') || '<p>Noch keine Änderungen erfasst.</p>'}`);
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

  /* ---------- Bewerbungen: Kanban board ---------- */
  function boardCard(jobId, app, index) {
    const job = state.jobs[jobId], pos = STAGES.indexOf(app.stage), prev = STAGES[pos - 1], next = STAGES[pos + 1];
    const nextDays = C.daysUntil(C.deadlineDay(app.next_date));
    return `<article class="jw-kcard" draggable="true" data-drag-id="${esc(jobId)}" aria-label="${esc(job.title)}, ${esc(job.organization)}"><p class="jw-org">${esc(job.organization)}</p><h4><button type="button" class="jw-link" data-action="application" data-id="${esc(jobId)}">${esc(job.title)}</button></h4>
      <dl class="jw-kmeta"><div><dt>Nächster Schritt</dt><dd>${app.next_step ? esc(app.next_step) : '<span class="jw-muted">Noch offen</span>'}</dd></div>${app.next_date ? `<div><dt>Termin</dt><dd${nextDays != null && nextDays < 0 ? ' class="is-overdue"' : ''}>${date(app.next_date)}${nextDays != null && nextDays < 0 ? ' · überfällig' : ''}</dd></div>` : ''}${app.applied_at ? `<div><dt>Beworben</dt><dd>${date(app.applied_at)}</dd></div>` : ''}</dl>
      ${job.deadline && ['interested', 'preparing'].includes(app.stage) ? `<div class="jw-chips">${deadlineChip(job)}</div>` : ''}
      <div class="jw-kcard-foot"><button type="button" class="jw-icon-btn" data-action="move-prev" data-id="${esc(jobId)}"${prev ? ` aria-label="Zurück nach «${esc(C.stages[prev])}»"` : ' aria-label="Bereits in der ersten Spalte" disabled'}>${icon('left')}</button><label class="visually-hidden" for="jwStage${index}">Status von «${esc(job.title)}»</label><select id="jwStage${index}" data-stage-select="${esc(jobId)}">${STAGES.map(s => option(s, C.stages[s], app.stage)).join('')}</select><button type="button" class="jw-icon-btn" data-action="move-next" data-id="${esc(jobId)}"${next ? ` aria-label="Weiter nach «${esc(C.stages[next])}»"` : ' aria-label="Bereits in der letzten Spalte" disabled'}>${icon('right')}</button></div></article>`;
  }
  function applicationsHtml() {
    const entries = Object.entries(state.applications).filter(([jobId]) => state.jobs[jobId]);
    if (!entries.length) return `<div class="jw-empty"><h3>Deine Bewerbungen im Blick</h3><p>Jede gemerkte Stelle erscheint hier in der Spalte «Interessant». Von dort ziehst du sie weiter oder wählst den Status auf der Karte.</p><div class="jw-actions"><a class="btn btn-sm btn-primary" href="#stellen">Stellen entdecken</a>${button('manual', 'Inserat erfassen')}</div></div>`;
    const sortKey = ([, a]) => [a.next_date || '9999', a.updated_at || ''];
    let index = 0;
    return `<p class="jw-board-hint jw-small jw-muted">Karten mit der Maus in eine andere Spalte ziehen oder den Status direkt auf der Karte ändern.</p><div class="jw-board">${STAGES.map(stage => {
      const cards = entries.filter(([, a]) => a.stage === stage).sort((a, b) => { const [ad, au] = sortKey(a), [bd, bu] = sortKey(b); return ad.localeCompare(bd) || bu.localeCompare(au); });
      return `<section class="jw-column" data-stage="${stage}" aria-labelledby="jwCol-${stage}"><header class="jw-column-head"><h3 id="jwCol-${stage}">${C.stages[stage]}</h3><span class="jw-column-count" aria-label="${cards.length} Karten">${cards.length}</span></header><div class="jw-column-body">${cards.map(([jobId, app]) => boardCard(jobId, app, index++)).join('') || '<p class="jw-drop-hint">Hierher ziehen</p>'}</div></section>`;
    }).join('')}</div>`;
  }
  function patchApplication(jobId, patch) { if (!state.jobs[jobId]) throw new Error('Stelle nicht gefunden'); state.applications[jobId] = { stage: 'interested', created_at: C.now(), ...state.applications[jobId], ...patch, updated_at: C.now() }; persist(); render(); return state.applications[jobId]; }
  function moveApplication(jobId, stage) {
    const app = state.applications[jobId]; if (!app || !C.stages[stage] || app.stage === stage) return;
    const patch = { stage }; if (stage === 'applied' && !app.applied_at) patch.applied_at = today();
    notice = `«${state.jobs[jobId].title}» ist jetzt in «${C.stages[stage]}».`;
    patchApplication(jobId, patch);
  }
  function openApplication(jobId) {
    const job = state.jobs[jobId]; if (!job) return;
    const app = state.applications[jobId] || { stage: 'interested' };
    dialog('Bewerbung · ' + job.title, `<form class="jw-form" data-form="application" data-id="${esc(jobId)}"><div class="jw-split"><label>Status<select name="stage">${Object.entries(C.stages).map(([s, label]) => option(s, label, app.stage)).join('')}</select></label><label>Bewerbung eingereicht am<input type="date" name="applied_at" value="${esc(app.applied_at || '')}"></label></div><label>Kontaktperson<input name="contact" maxlength="300" value="${esc(app.contact || '')}"></label><div class="jw-split"><label>Nächster Schritt<input name="next_step" maxlength="500" value="${esc(app.next_step || '')}" placeholder="z. B. Nachfassen per Mail"></label><label>Termin für nächsten Schritt<input type="date" name="next_date" value="${esc(app.next_date || '')}"></label></div><label>Notizen<textarea name="notes" rows="6" maxlength="20000">${esc(app.notes || '')}</textarea></label><div class="jw-actions jw-form-actions"><button type="submit" class="btn btn-primary">Speichern</button>${button('letter', 'Bewerbungsschreiben', jobId)}</div></form>`);
  }

  /* ---------- Jobalarme (UI in js/alerts.js) ---------- */
  function alertsHtml() {
    return alertsApi() ? '<div id="jwAlerts" class="jw-alerts"></div>' : '<div class="jw-empty"><h3>Jobalarme sind gerade nicht verfügbar</h3><p>Der Baustein für Jobalarme wurde nicht geladen. Bitte lade die Seite neu.</p></div>';
  }
  function openAlertDialog(prefill = {}) {
    view = 'alerts';
    const route = window.SiteRouter?.current?.();
    if (!route || route.view !== 'meine-suche' || route.sub !== 'jobalarme') { try { location.hash = '#jobalarme'; } catch {} }
    render();
    if (alertsApi()?.openDialog) alertsApi().openDialog(prefill || {});
    else setNotice('Jobalarme sind gerade nicht verfügbar. Bitte lade die Seite neu.');
  }

  /* ---------- Suchprofile, Arbeitgeber, Vergleich, Quellen ---------- */
  function searchesHtml() {
    const profiles = state.searchProfiles.filter(p => !p.archived);
    return `<div class="jw-actions jw-section-actions">${button('save-search', 'Aktuelle Suche als Profil speichern', '', 'primary')}${button('criteria', 'Kriterien bearbeiten')}</div><p class="jw-small jw-muted">Jedes Suchprofil speichert Arbeitgeberauswahl, Ergebnisfilter und Matching-Kriterien. Dein persönliches CV-Profil bleibt davon unabhängig.</p><div class="jw-grid">${profiles.map(p => `<article class="jw-card"><h3>${esc(p.name)}</h3><p>${p.orgIds.length} Arbeitgeber · ${p.criteria.length} Kriterien</p><p class="jw-small jw-muted">Geändert ${date(p.updated_at)}</p><div class="jw-actions">${button('load-search', p.id === state.activeSearchProfileId ? 'Erneut anwenden' : 'Anwenden', p.id, 'primary')}${button('update-search', 'Mit aktueller Suche aktualisieren', p.id)}${button('archive-search', 'Archivieren', p.id)}</div></article>`).join('') || '<div class="jw-empty"><h3>Noch keine Suchprofile</h3><p>Richte eine Suche ein (Arbeitgeber, Filter, Kriterien) und speichere sie hier, um sie später wieder anzuwenden.</p></div>'}</div>`;
  }
  function selectedOrgIds() { return state.selectedOrgIds || activeProfile()?.orgIds || (typeof getFavs === 'function' ? getFavs() : []); }
  function searchDialog(initialIds) {
    if (searching) {
      notice = 'Es läuft bereits eine Suche. Pausiere sie, um eine neue Arbeitgeberauswahl zu öffnen.';
      view = 'sources'; render(); document.querySelector('#jwProgress [data-action=cancel]')?.focus(); return;
    }
    const selected = new Set(Array.isArray(initialIds) ? initialIds : selectedOrgIds());
    const orgs = allOrgs().filter(o => o.jobs);
    const d = dialog('Arbeitgeber für diesen Suchlauf', `<p>Alle ausgewählten Arbeitgeber werden in Paketen von drei geprüft. Nicht lesbare Portale werden im Quellenstatus ausgewiesen.</p><div class="jw-actions">${button('choose-favorites', 'Favoriten übernehmen')}${button('choose-region', 'Aktuelle Kartenfilter übernehmen')}${button('choose-all', 'Alle auswählen')}${button('choose-none', 'Auswahl leeren')}</div><label class="jw-field">Arbeitgeber suchen<input type="search" id="jwOrgQuery" placeholder="Name oder Ort"></label><form data-form="search" class="jw-form"><div class="jw-org-list">${orgs.map(o => `<label class="jw-org-row" data-org-name="${esc(C.normalize(o.name + ' ' + o.loc))}"><input type="checkbox" name="org" value="${esc(o.id)}"${selected.has(o.id) ? ' checked' : ''}> <span><strong>${esc(o.name)}</strong><small> ${esc(o.loc)}</small></span></label>`).join('')}</div><p id="jwSelectedCount" class="jw-small" role="status"></p><div class="jw-form-actions"><button class="btn btn-primary" type="submit">Ausgewählte Arbeitgeber prüfen</button></div></form>`);
    const updateCount = () => d.querySelector('#jwSelectedCount').textContent = `${d.querySelectorAll('[name=org]:checked').length} Arbeitgeber ausgewählt`;
    updateCount(); d.addEventListener('change', updateCount);
    d.querySelector('#jwOrgQuery').addEventListener('input', e => d.querySelectorAll('.jw-org-row').forEach(row => { row.hidden = !row.dataset.orgName.includes(C.normalize(e.target.value)); }));
  }
  function criteriaDialog() {
    const fields = [['keywords', 'Fachliche Stichwörter (Komma = ODER)'], ['location', 'Arbeitsorte (Komma = ODER)'], ['workload', 'Pensum, z. B. 80-100%'], ['remote_mode', 'Arbeitsmodell: remote, hybrid, onsite'], ['languages', 'Sprachen (wie im Inserat)'], ['seniority', 'Karrierestufe'], ['employment_type', 'Anstellung'], ['exclude', 'Ausschlusswörter (Komma = ODER)']];
    const current = criteria();
    dialog('Deine Matching-Kriterien', `<p>Muss-Kriterien müssen belegt erfüllt sein. Wünsche fliessen gewichtet in die Passung ein. Die Bewertung ist ein transparenter Textvergleich, keine KI-Prognose.</p><form class="jw-form" data-form="criteria">${fields.map(([field, label]) => { const c = current.find(x => x.field === field) || {}; return `<fieldset data-criterion="${field}"><legend>${label}</legend><label>Wert<input name="value" value="${esc(c.value || '')}" maxlength="400"></label><div class="jw-split"><label>Verbindlichkeit<select name="mode">${option('wish', 'Wunsch', c.mode || 'wish')}${option('must', 'Muss', c.mode)}${option('off', 'Nicht berücksichtigen', c.mode)}</select></label><label>Gewicht<select name="weight">${[1, 2, 3, 4, 5].map(w => option(w, w, c.weight || 2)).join('')}</select></label></div></fieldset>`; }).join('')}<div class="jw-form-actions"><button class="btn btn-primary" type="submit">Kriterien übernehmen</button></div></form>`);
  }
  function compareHtml() {
    const jobs = [...compared].map(jobId => state.jobs[jobId]).filter(Boolean);
    if (jobs.length < 2) return `<div class="jw-empty"><h3>Welche Stelle passt besser?</h3><p>Markiere zwei bis vier Stellen über «Vergleichen» auf den Stellenkarten.</p><div class="jw-actions">${button('go-tab', 'Zu den gemerkten Stellen', 'jobs', 'primary')}</div></div>`;
    const fields = [['organization', 'Arbeitgeber'], ['location', 'Arbeitsort'], ['pensum', 'Pensum'], ['remote_mode', 'Arbeitsmodell'], ['languages', 'Sprachen'], ['employment_type', 'Anstellung'], ['salary_hint', 'Lohnangabe'], ['deadline', 'Bewerbungsfrist'], ['seniority', 'Karrierestufe']];
    return `<div class="jw-compare-wrapper"><table class="jw-table"><thead><tr><th>Vergleich</th>${jobs.map(j => `<th>${esc(j.title)}<br>${button('compare-remove', 'Entfernen', j.id)}</th>`).join('')}</tr></thead><tbody>${fields.map(([f, label]) => `<tr><th>${label}</th>${jobs.map(j => `<td>${esc(j[f] && j[f] !== 'unknown' ? j[f] : 'Unbekannt')}</td>`).join('')}</tr>`).join('')}<tr><th>Passung</th>${jobs.map(j => { const fit = getProfileMatch(j), m = matches(j); return `<td>${fit ? `${esc(fit.label)} · ${fit.score}%<br>` : ''}${m.score == null ? 'Keine Kriterien' : m.score + '% Kriterien · ' + m.coverage + '% beurteilbar'}</td>`; }).join('')}</tr><tr><th>Aufgaben / Beschreibung</th>${jobs.map(j => `<td><details><summary>Beschreibung lesen</summary><div class="jw-description">${esc(j.description || 'Unbekannt')}</div></details></td>`).join('')}</tr><tr><th>Nächster Schritt</th>${jobs.map(j => `<td>${button('application', 'Bewerbung verwalten', j.id)}${button('detail', 'Details', j.id)}</td>`).join('')}</tr></tbody></table></div>`;
  }
  const sourceLabels = { pending: 'Noch nicht geprüft', ok: 'Erfolgreich geprüft', empty: 'Keine offenen Stellen', partial: 'Teilweise geprüft', error: 'Abruf fehlgeschlagen', unsupported: 'Nicht automatisch lesbar' };
  function sourcesHtml() {
    const sources = Object.values(state.sources).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));
    return `<p class="jw-small jw-muted">Ein erfolgloser Abruf schliesst keine gespeicherte Stelle. Auch ein erfolgreicher Abruf garantiert nicht, dass ein Portal vollständig erfasst wurde.</p><div class="jw-stack">${sources.map(s => `<article class="jw-source"><div><strong>${esc(s.name || s.org_id)}</strong> <span class="chip ${s.status === 'ok' || s.status === 'empty' ? 'chip-brand' : 'chip-accent'}">${sourceLabels[s.status] || 'Unbekannt'}</span><p class="jw-small">${Number(s.job_count) || 0} Inserate · ${dateTime(s.checked_at)}${s.cached ? ' · Zwischengespeichert' : ''}</p><p class="jw-small">${esc(s.message || '')}</p></div><div class="jw-actions">${button('retry-source', 'Erneut prüfen', s.org_id)}<a class="btn btn-sm btn-ghost" href="${esc(C.safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">Karriereseite${icon('external')}</a></div></article>`).join('') || `<div class="jw-empty"><h3>Noch kein Suchlauf</h3><p>Nach dem ersten Suchlauf siehst du hier das Ergebnis pro Arbeitgeber.</p><div class="jw-actions">${button('search-dialog', 'Arbeitgeber auswählen', '', 'primary')}</div></div>`}</div><h3>Suchverlauf</h3>${state.runs.slice().reverse().map(r => `<div class="jw-history"><strong>${dateTime(r.started_at)}</strong> · ${r.checked || 0}/${r.total} Arbeitgeber · ${r.added || 0} neu · ${r.changed || 0} geändert · ${esc(r.status)}</div>`).join('') || '<p class="jw-small jw-muted">Noch kein Suchlauf.</p>'}`;
  }
  function manualDialog() {
    dialog('Inserat selbst erfassen', `<p>Für Stellen aus Portalen, die sich nicht automatisch lesen lassen. Übernimm die Angaben aus dem Original; lasse unbekannte Felder leer. Erfasste Inserate werden automatisch gemerkt.</p><form class="jw-form" data-form="manual"><label>Direktlink zum Inserat<input type="url" name="url" required placeholder="https://"></label><label>Stellentitel<input name="title" required maxlength="300"></label><label>Arbeitgeber<input name="organization" required maxlength="300"></label><div class="jw-split"><label>Arbeitsort<input name="location" maxlength="300"></label><label>Pensum<input name="pensum" placeholder="80–100%" maxlength="100"></label></div><div class="jw-split"><label>Arbeitsmodell<select name="remote_mode">${option('unknown', 'Unbekannt', 'unknown')}${option('onsite', 'Vor Ort')}${option('hybrid', 'Hybrid')}${option('remote', 'Remote')}</select></label><label>Bewerbungsfrist<input name="deadline" type="date"></label></div><label>Sprachen<input name="languages" maxlength="300"></label><label>Vollständiger Stellenbeschrieb<textarea name="description" required rows="10" maxlength="30000"></textarea></label><div class="jw-form-actions"><button type="submit" class="btn btn-primary">Inserat speichern</button></div></form>`);
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
      if (isCurrent() && !controller.signal.aborted) { state.queue.message = `${state.queue.added} neue und ${state.queue.changed} geänderte Inserate.`; if (state.queue.added) state.filters.scope = 'all'; const run = state.runs.find(r => r.id === state.queue.id); if (run) { run.status = 'abgeschlossen'; run.finished_at = C.now(); } setNotice(state.queue.message + (state.queue.added ? ' Du findest sie unter «Gemerkt › Alle erfassten».' : '')); }
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

  /* ---------- Events ---------- */
  function openCvUpload() {
    if (typeof openProfile !== 'function') return;
    openProfile();
    requestAnimationFrame(() => { const zone = document.getElementById('cvDropzone'); if (zone) { zone.scrollIntoView({ block: 'center' }); zone.setAttribute('tabindex', '0'); zone.focus({ preventScroll: true }); } });
  }
  async function handleAction(action, jobId, target) {
    if (action === 'close-dialog') { target.closest('dialog').close(); return; }
    if (action === 'search-dialog') searchDialog();
    else if (action === 'manual') manualDialog();
    else if (action === 'criteria') criteriaDialog();
    else if (action === 'detail') openDetail(jobId);
    else if (action === 'toggle-save') { const inDialog = target.closest('dialog'); if (isSavedId(jobId)) unsave(jobId); else { markSaved(jobId); persist(); render(); emitSaved(jobId, true); } if (inDialog && state.jobs[jobId]) openDetail(jobId); else inDialog?.close(); }
    else if (action === 'application') openApplication(jobId);
    else if (action === 'move-prev' || action === 'move-next') { const app = state.applications[jobId]; if (app) moveApplication(jobId, STAGES[STAGES.indexOf(app.stage) + (action === 'move-next' ? 1 : -1)]); }
    else if (action === 'assess') await assessJob(jobId, target);
    else if (action === 'letter') { target.closest('dialog')?.close(); if (typeof openJobLetter === 'function') openJobLetter(jobId); }
    else if (action === 'close-job') { const job = state.jobs[jobId]; job.status = job.status === 'closed' ? 'open' : 'closed'; job.changed_at = C.now(); job.change_fields = ['status']; (job.changes ||= []).push({ at: job.changed_at, fields: ['status'], manual: true }); persist(); openDetail(jobId); }
    else if (action === 'cancel') { cancelSearch(); if (state.queue) state.queue.message = 'Suchlauf pausiert. Bereits geprüfte Quellen bleiben gespeichert.'; render(); }
    else if (action === 'resume') await startSearch(null, true);
    else if (action === 'retry-source') await startSearch([jobId], false, true);
    else if (action === 'filters-reset') { state.filters = state.filters.scope ? { scope: state.filters.scope } : {}; persist(); render(); }
    else if (action === 'more-filters') { moreFilters = !moreFilters; const panel = document.getElementById('jwMoreFilters'); if (panel) panel.hidden = !moreFilters; target.setAttribute('aria-expanded', String(moreFilters)); if (moreFilters) panel?.querySelector('select, input')?.focus(); }
    else if (action === 'scope') { state.filters.scope = jobId === 'all' ? 'all' : 'saved'; persist(); render(); }
    else if (action === 'go-tab') showTab(jobId, { focus: true });
    else if (action === 'compare-remove') { compared.delete(jobId); render(); }
    else if (action === 'export') exportState();
    else if (action === 'import') document.getElementById('jwImportFile').click();
    else if (action === 'sync') { if (owner) await loadCloud(); else if (typeof openAuthModal === 'function') openAuthModal(); }
    else if (action === 'cloud-load' && remoteConflict) { cancelSearch(); exportState(); state = C.hydrate(remoteConflict.data); revision = remoteConflict.revision; remoteConflict = null; dirty = false; notice = 'Kontostand geladen. Dein vorheriger lokaler Stand wurde als Sicherung heruntergeladen.'; persist(false); render(); emitSaved(null, null); }
    else if (action === 'onboarding-dismiss') { try { localStorage.setItem(ONBOARDING_KEY, 'dismissed'); } catch {} render(); document.getElementById('jwTab-' + view)?.focus(); }
    else if (action === 'onboarding-profile') { if (typeof openProfile === 'function') openProfile(); }
    else if (action === 'onboarding-cv') openCvUpload();
    else if (action === 'onboarding-login') { if (typeof openAuthModal === 'function') openAuthModal(); }
    else if (action === 'onboarding-alert') openAlertDialog({});
    else if (action === 'save-search') {
      dialog('Suchprofil speichern', '<form data-form="save-search" class="jw-form"><label>Name<input name="name" required maxlength="100" placeholder="z. B. HTA und Versorgungsforschung"></label><div class="jw-form-actions"><button class="btn btn-primary" type="submit">Speichern</button></div></form>');
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
    const tab = e.target.closest('[data-tab]'); if (tab && mount()?.contains(tab)) { showTab(tab.dataset.tab); return; }
    const target = e.target.closest('[data-action]'); if (!target || !(mount()?.contains(target) || target.closest('.jw-dialog'))) return;
    e.preventDefault(); Promise.resolve(handleAction(target.dataset.action, target.dataset.id, target)).catch(err => setNotice(err.message || 'Aktion konnte nicht abgeschlossen werden.'));
  });
  document.addEventListener('keydown', e => {
    const tab = e.target.closest?.('[role=tab][data-tab]'); if (!tab || !mount()?.contains(tab)) return;
    const order = TABS.map(([t]) => t), i = order.indexOf(tab.dataset.tab);
    const next = e.key === 'ArrowRight' ? order[(i + 1) % order.length] : e.key === 'ArrowLeft' ? order[(i - 1 + order.length) % order.length] : e.key === 'Home' ? order[0] : e.key === 'End' ? order.at(-1) : null;
    if (next) { e.preventDefault(); showTab(next, { focus: true }); }
  });
  document.addEventListener('input', e => {
    const el = e.target; if (!el.dataset?.filter || !mount()?.contains(el)) return;
    state.filters[el.dataset.filter] = el.type === 'checkbox' ? el.checked : el.value; persist();
    const list = document.getElementById('jwJobList'); if (list) list.innerHTML = jobListHtml();
    const label = mount().querySelector('[data-more-label]'); if (label) label.textContent = moreLabel();
  });
  // HTML5 drag and drop between board columns (mouse, pen); select and arrows cover keyboard and touch.
  document.addEventListener('dragstart', e => {
    const card = e.target.closest?.('[data-drag-id]'); if (!card || !mount()?.contains(card)) return;
    dragId = card.dataset.dragId; card.classList.add('is-dragging');
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); } catch {}
  });
  document.addEventListener('dragover', e => {
    if (!dragId) return; const column = e.target.closest?.('.jw-column'); if (!column || !mount()?.contains(column)) return;
    e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch {}
    mount().querySelectorAll('.jw-column.is-over').forEach(c => { if (c !== column) c.classList.remove('is-over'); }); column.classList.add('is-over');
  });
  document.addEventListener('drop', e => {
    if (!dragId) return; const column = e.target.closest?.('.jw-column'); if (!column || !mount()?.contains(column)) return;
    e.preventDefault(); const jobId = dragId; dragId = null; moveApplication(jobId, column.dataset.stage);
  });
  document.addEventListener('dragend', () => { dragId = null; mount()?.querySelectorAll('.is-dragging, .is-over').forEach(el => el.classList.remove('is-dragging', 'is-over')); });
  document.addEventListener('change', async e => {
    const el = e.target;
    if (el.dataset?.stageSelect && mount()?.contains(el)) { moveApplication(el.dataset.stageSelect, el.value); return; }
    if (el.dataset?.compare) { if (el.checked && compared.size >= 4) { el.checked = false; setNotice('Du kannst höchstens vier Stellen vergleichen.'); return; } el.checked ? compared.add(el.dataset.compare) : compared.delete(el.dataset.compare); const count = document.querySelector('#jwTab-compare .jw-tab-count'); if (count) { count.textContent = compared.size; count.hidden = !compared.size; } }
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
        persist(); notice = 'Sicherung ergänzt. Bereits vorhandene Einträge wurden beibehalten.'; render(); emitSaved(null, null);
      } catch (err) { setNotice(err.message); }
    }
  });
  document.addEventListener('submit', e => {
    const form = e.target; if (!form.dataset.form || !form.closest('.jw-dialog')) return;
    e.preventDefault(); const data = Object.fromEntries(new FormData(form)), type = form.dataset.form;
    if (type === 'application') { patchApplication(form.dataset.id, data); form.closest('dialog').close(); }
    else if (type === 'manual') {
      if (!C.safeUrl(data.url)) { setNotice('Bitte einen gültigen HTTPS-Link angeben.'); return; }
      const before = new Set(Object.keys(state.jobs)); C.ingest(state, [{ ...data, source_type: 'manual' }]);
      const url = C.canonicalUrl(data.url), jobId = Object.keys(state.jobs).find(k => !before.has(k)) || Object.values(state.jobs).find(j => C.canonicalUrl(j.url) === url)?.id;
      if (jobId) markSaved(jobId, 'manual');
      persist(); form.closest('dialog').close(); view = 'jobs'; state.filters.scope = 'saved'; render(); if (jobId) emitSaved(jobId, true);
    }
    else if (type === 'criteria') { state.criteriaConfigured = true; state.criteria = [...form.querySelectorAll('[data-criterion]')].map(row => ({ field: row.dataset.criterion, label: row.querySelector('legend').textContent, value: row.querySelector('[name=value]').value.trim(), mode: row.querySelector('[name=mode]').value, weight: Number(row.querySelector('[name=weight]').value) })).filter(c => c.value); persist(); form.closest('dialog').close(); render(); window.dispatchEvent(new CustomEvent('healthjobs:profile-changed', { detail: { source: 'criteria' } })); }
    else if (type === 'save-search') { const profile = { id: id(), name: data.name.trim(), orgIds: selectedOrgIds().slice(), criteria: structuredClone(criteria()), filters: { ...state.filters }, updated_at: C.now() }; state.searchProfiles.push(profile); state.activeSearchProfileId = profile.id; persist(); form.closest('dialog').close(); view = 'searches'; render(); }
    else if (type === 'search') { const ids = new FormData(form).getAll('org'); if (!ids.length) { form.querySelector('#jwSelectedCount').textContent = 'Bitte mindestens einen Arbeitgeber wählen.'; return; } state.selectedOrgIds = ids; persist(); form.closest('dialog').close(); startSearch(ids); }
  });

  window.HealthJobs = {
    render, startSearch, cancelSearch, openEmployerSelection: searchDialog, sync: syncCloud, getJob: jobId => state.jobs[jobId], getApplication: jobId => state.applications[jobId], patchApplication,
    getDrafts: jobId => state.drafts[jobId] || [], saveDraft, getSender: () => state.sender,
    saveSender: sender => { state.sender = { ...sender }; persist(); return state.sender; }, getCriteria: matches,
    getOwner: () => owner, exportState, importPublicJobs,
    isSaved, toggleSaved, getSavedIds: () => savedJobs().map(j => j.id), getProfileMatch, openAlertDialog, showTab
  };
  function isSaved(jobOrId) { return isSavedId(storedIdFor(jobOrId)); }
  window.addEventListener('healthjobs:auth', e => switchOwner(e.detail?.userId || null));
  window.addEventListener('healthjobs:profile-changed', e => { try { lastProfile = localStorage.getItem('userProfile'); } catch {} matchCacheKey = ''; if (e.detail?.source !== 'account' && e.detail?.source !== 'criteria' && mount()?.dataset.ready) render(); });
  window.addEventListener('healthjobs:alerts-changed', () => { if (mount()?.dataset.ready) render(); });
  window.addEventListener('site:route', e => {
    const { view: page, sub, param } = e.detail || {};
    if (page !== 'meine-suche') return;
    if (sub === 'jobalarme') { if (view !== 'alerts') { view = 'alerts'; render(); } }
    else if (sub === 'abmelden' && param) {
      view = 'alerts'; render();
      if (alertsApi()?.unsubscribe) alertsApi().unsubscribe(param); else setNotice('Die Abmeldung konnte nicht geladen werden. Bitte lade die Seite neu.');
      window.SiteRouter?.replace?.('#jobalarme');
    }
  });
  window.addEventListener('online', () => { if (owner) loadCloud(); });
  window.addEventListener('pagehide', () => { state.lastVisitAt = entryTimes.get(owner || 'guest')?.current || C.now(); persist(); });
  switchOwner(owner);
})();
