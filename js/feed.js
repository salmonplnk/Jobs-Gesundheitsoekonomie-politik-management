/* Read-only public snapshots. Personal state changes only after an explicit import. */
(function () {
  'use strict';
  const C = window.JobCore, mount = document.getElementById('publicJobFeed');
  if (!C || !mount) return;
  const DEFAULT_URL = 'https://raw.githubusercontent.com/salmonplnk/Jobs-Gesundheitsoekonomie-politik-management/job-feed-data/data/job-feed/index.json';
  const PAGE_SIZE = 25, MAX_INDEX_BYTES = 24 * 1024 * 1024, MAX_SHARD_BYTES = 12 * 1024 * 1024;
  const MAX_JOBS = 30000, MAX_SHARD_JOBS = 5000, STALE_MS = 48 * 60 * 60 * 1000;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const orgId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(value) && !['constructor', 'prototype', '__proto__'].includes(value);
  const iso = value => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
  const date = value => value ? new Date(value).toLocaleDateString('de-CH') : 'Unbekannt';
  const dateTime = value => value ? new Date(value).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' }) : 'Noch nie';
  const count = value => Number.isInteger(value) && value >= 0 ? Math.min(value, MAX_JOBS) : 0;
  const catalogGroups = typeof DATA !== 'undefined' && Array.isArray(DATA) ? DATA : [];
  const catalog = new Map();
  for (const group of catalogGroups) for (const org of group.orgs || []) if (orgId(org.id)) catalog.set(org.id, { ...org, category: group.key, category_name: group.title });
  const statusNames = { ok: 'Erfasst', empty: 'Keine Stellen gefunden', partial: 'Teilweise erfasst', error: 'Abruf fehlgeschlagen', unsupported: 'Nicht erfasst', pending: 'Noch nicht geprüft' };
  const filters = { q: '', employer: '', category: '', role: '', location: '' };
  let snapshot = null, page = 1, loading = false, error = '', notice = '', epoch = 0, authEpoch = 0, indexController;
  const imports = new Set(), importControllers = new Set();
  const getOwner = () => window.HealthJobs?.getOwner?.() ?? null;

  function configuredUrl() {
    const value = window.HEALTH_JOBS_FEED_URL === undefined ? DEFAULT_URL : window.HEALTH_JOBS_FEED_URL;
    if (typeof value !== 'string' || !value.trim()) throw new Error('Der öffentliche Jobfeed ist noch nicht konfiguriert.');
    const url = C.safeUrl(new URL(value, document.baseURI).href);
    if (!url) throw new Error('Die Adresse des öffentlichen Jobfeeds ist ungültig.');
    const parsed = new URL(url);
    if (parsed.hash || !parsed.pathname.endsWith('/index.json')) throw new Error('Die Feed-Adresse muss auf eine index.json zeigen.');
    return parsed.href;
  }
  function shardUrl(job, baseUrl) {
    if (!orgId(job.org_id) || ![`${job.org_id}.json`, `./${job.org_id}.json`].includes(job.detail_file)) throw new Error('Der Detailverweis dieser Stelle ist ungültig.');
    const base = new URL('.', baseUrl), url = new URL(job.detail_file, base);
    if (url.origin !== base.origin || url.pathname !== base.pathname + job.org_id + '.json' || url.search || url.hash) throw new Error('Der Detailverweis liegt ausserhalb des Jobfeeds.');
    return url.href;
  }
  async function readJson(url, maxBytes, controller) {
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(response.status === 404 ? 'Noch kein veröffentlichter Jobfeed erreichbar (HTTP 404).' : `Der Jobfeed ist gerade nicht erreichbar (HTTP ${response.status || 'unbekannt'}).`);
      if (Number(response.headers?.get('content-length')) > maxBytes) throw new Error('Die Feed-Datei überschreitet die zulässige Grösse.');
      let body = '';
      if (response.body?.getReader && typeof TextDecoder !== 'undefined') {
        const reader = response.body.getReader(), decoder = new TextDecoder(); let size = 0;
        try {
          while (true) {
            const chunk = await reader.read(); if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > maxBytes) { await reader.cancel(); throw new Error('Die Feed-Datei überschreitet die zulässige Grösse.'); }
            body += decoder.decode(chunk.value, { stream: true });
          }
          body += decoder.decode();
        } finally { reader.releaseLock(); }
      } else {
        body = await response.text();
        if ((typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(body).byteLength : body.length * 3) > maxBytes) throw new Error('Die Feed-Datei überschreitet die zulässige Grösse.');
      }
      try { return JSON.parse(body); } catch { throw new Error('Der veröffentlichte Stand enthält keine gültigen JSON-Daten.'); }
    } finally { clearTimeout(timeout); }
  }
  function cleanSource(raw, fallback) {
    const id = raw?.org_id || fallback?.id;
    if (!orgId(id) || (catalog.size && !catalog.has(id))) return null;
    const org = catalog.get(id) || fallback;
    const hasPortal = typeof raw?.has_portal === 'boolean' ? raw.has_portal : !!C.safeUrl(org ? org.jobs : raw?.url);
    return { org_id: id, name: C.text(org?.name || raw?.name || id, 300), url: C.safeUrl(raw?.url) || C.safeUrl(org?.jobs),
      status: typeof raw?.status === 'string' && Object.hasOwn(statusNames, raw.status) ? raw.status : 'pending',
      checked_at: iso(raw?.checked_at), last_success_at: iso(raw?.last_success_at), last_complete_at: iso(raw?.last_complete_at),
      job_count: count(raw?.job_count), stale: raw?.stale === true, message: C.text(raw?.message, 2000), coverage: C.text(raw?.coverage, 300),
      pages_scanned: count(raw?.pages_scanned), detail_pages_scanned: count(raw?.detail_pages_scanned), method: C.text(raw?.method, 120),
      has_portal: hasPortal, no_portal: !hasPortal, category: org?.category || '', category_name: org?.category_name || '' };
  }
  function cleanPublicJob(raw, sources, baseUrl, compact) {
    if (!raw || !orgId(raw.org_id) || !sources.has(raw.org_id) || typeof raw.id !== 'string' || raw.id.length > 180 || !new RegExp('^' + raw.org_id + ':[a-z0-9]+$').test(raw.id)) return null;
    const job = C.cleanJob(raw); if (!job || job.id !== raw.id) return null;
    job.title = C.text(job.title, 500); job.organization = C.text(job.organization, 300).trim() || sources.get(job.org_id).name;
    job.location = C.text(job.location, 300); job.pensum = C.text(job.pensum, 100);
    job.first_seen = iso(raw.first_seen); job.last_seen = iso(raw.last_seen);
    job.category = sources.get(job.org_id).category;
    job.org_ids = [...new Set([job.org_id, ...(Array.isArray(raw.org_ids) ? raw.org_ids.slice(0, 250).filter(id => orgId(id) && sources.has(id)) : [])])];
    job.categories = [...new Set(job.org_ids.map(id => sources.get(id).category).filter(Boolean))];
    job.role = C.roles.includes(job.role) ? job.role : C.classifyRole(job);
    if (compact) { job.description = C.text(job.description, 1000); job.detail_file = C.text(raw.detail_file, 100); try { shardUrl(job, baseUrl); } catch { return null; } }
    return job;
  }
  function validateIndex(raw, url) {
    if (!raw || raw.version !== 1 || !Array.isArray(raw.jobs) || raw.jobs.length > MAX_JOBS || !Array.isArray(raw.sources) || raw.sources.length > 250 || !raw.run || typeof raw.run !== 'object' || Array.isArray(raw.run)) throw new Error('Der veröffentlichte Jobfeed hat ein unbekanntes oder zu grosses Format.');
    const sources = new Map();
    for (const rawSource of raw.sources) { const source = cleanSource(rawSource); if (source && !sources.has(source.org_id)) sources.set(source.org_id, source); }
    for (const org of catalog.values()) if (!sources.has(org.id)) sources.set(org.id, cleanSource(null, org));
    const jobs = [], ids = new Set(); let ignored = 0;
    for (const rawJob of raw.jobs) {
      const job = cleanPublicJob(rawJob, sources, url, true);
      if (!job || ids.has(job.id)) { ignored++; continue; }
      ids.add(job.id); jobs.push(job);
    }
    return { url, generated_at: iso(raw.generated_at), sources, jobs, ignored, run: { id: C.text(raw.run.id, 100), started_at: iso(raw.run.started_at), finished_at: iso(raw.run.finished_at), status: C.text(raw.run.status, 50), total_sources: count(raw.run.total_sources), checked_sources: count(raw.run.checked_sources) } };
  }
  function coverageLabel(value) { const names = { complete: 'Vollständig erfasst', partial: 'Teilweise erfasst', unknown: 'Abdeckung unbekannt' }; return Object.hasOwn(names, value) ? names[value] : value; }
  function isStale(source) { return source.stale || !!source.last_success_at && Date.now() - Date.parse(source.last_success_at) > STALE_MS; }
  function filteredJobs() {
    if (!snapshot) return [];
    const terms = C.normalize(filters.q).split(/\s+/).filter(Boolean);
    return snapshot.jobs.filter(job => {
      if (job.status === 'closed' || (filters.employer && !job.org_ids.includes(filters.employer)) || (filters.category && !job.categories.includes(filters.category)) || (filters.role && job.role !== filters.role)) return false;
      if (filters.location && !C.normalize(job.location).includes(C.normalize(filters.location))) return false;
      const content = C.normalize(`${job.title} ${job.organization} ${job.org_ids.map(id => snapshot.sources.get(id)?.name || '').join(' ')} ${job.description} ${job.location}`);
      return terms.every(term => content.includes(term));
    }).sort((a, b) => (Date.parse(b.first_seen) || 0) - (Date.parse(a.first_seen) || 0) || a.id.localeCompare(b.id));
  }
  function selectOptions(items, selected, placeholder) { return `<option value="">${esc(placeholder)}</option>` + items.map(([value, label]) => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`).join(''); }
  function renderShell() {
    mount.innerHTML = `<div class="jf-shell"><div class="jf-heading"><div><p class="jf-eyebrow">Öffentlich · Ohne Anmeldung</p><h2>Aktuelle Stellen entdecken</h2><p class="jf-intro">Stellen aus dem Schweizer Gesundheitswesen. Gefundenes direkt in deine persönliche Stellensuche übernehmen.</p></div><button type="button" class="jf-button jf-button-secondary" data-feed-action="refresh">Stand neu laden <span aria-hidden="true">↻</span></button></div><div id="jfStatus" aria-live="polite"></div><details class="jf-sources"><summary>Quellen &amp; Aktualität <span id="jfSourceCount"></span></summary><div id="jfSources"></div></details><form class="jf-filters" aria-label="Öffentliche Stellen filtern"><div class="jf-search"><label for="jfQuery">Stichwort</label><input id="jfQuery" type="search" data-feed-filter="q" placeholder="Titel, Stichwort oder Arbeitgeber" autocomplete="off"></div><div><label for="jfEmployer">Arbeitgeber / Quelle</label><select id="jfEmployer" data-feed-filter="employer"></select></div><div><label for="jfCategory">Branche</label><select id="jfCategory" data-feed-filter="category"></select></div><div><label for="jfRole">Tätigkeitsfeld</label><select id="jfRole" data-feed-filter="role"></select></div><div><label for="jfLocation">Ort</label><input id="jfLocation" data-feed-filter="location" type="search" placeholder="z. B. Bern" autocomplete="off"></div><button class="jf-reset" type="button" data-feed-action="reset">Filter zurücksetzen</button></form><div class="jf-results-heading"><p id="jfResultsCount" role="status"></p><span>Neueste zuerst · 25 pro Seite</span></div><p id="jfNotice" class="jf-notice" role="status" hidden></p><div id="jfJobs" class="jf-jobs"></div><nav id="jfPagination" class="jf-pagination" aria-label="Seiten im öffentlichen Jobfeed"></nav><p class="jf-footnote">„Stand neu laden“ lädt den zuletzt veröffentlichten Abruf. Ein neuer Quellenabruf läuft serverseitig. Bitte Verfügbarkeit und Fristen beim Arbeitgeber prüfen.</p></div>`;
    document.getElementById('jfRole').innerHTML = selectOptions(C.roles.map(role => [role, role]), '', 'Alle Tätigkeitsfelder');
    renderFilters(); renderStatus(); renderResults();
  }
  function renderFilters() {
    const sources = snapshot ? [...snapshot.sources.values()] : [...catalog.values()].map(org => cleanSource(null, org));
    document.getElementById('jfEmployer').innerHTML = selectOptions(sources.map(source => [source.org_id, source.name]).sort((a, b) => a[1].localeCompare(b[1], 'de')), filters.employer, 'Alle Arbeitgeber / Quellen');
    document.getElementById('jfCategory').innerHTML = selectOptions(catalogGroups.map(group => [group.key, group.title]), filters.category, 'Alle Branchen');
  }
  function renderStatus() {
    const sources = snapshot ? [...snapshot.sources.values()] : [...catalog.values()].map(org => cleanSource(null, org));
    const total = sources.length || snapshot?.run.total_sources || 85, checked = sources.filter(source => source.checked_at).length;
    const failed = sources.filter(source => source.status === 'error').length, partial = sources.filter(source => source.status === 'partial').length;
    const unsupported = sources.filter(source => source.status === 'unsupported' && !source.no_portal).length;
    const stale = sources.filter(isStale).length, pending = sources.filter(source => source.status === 'pending').length, noPortal = sources.filter(source => source.no_portal).length;
    const latestAttempt = sources.map(source => source.checked_at).filter(Boolean).sort().at(-1) || null;
    const metrics = [[`${checked}/${total}`, 'Quellen geprüft'], [stale, 'Veralteter Stand'], [failed, 'Abruffehler'], [noPortal, 'Ohne Stellenportal'], [pending, 'Noch ungeprüft']];
    const neverRun = snapshot && !snapshot.run.started_at && !checked;
    const runNames = { pending: 'ausstehend', running: 'läuft', complete: 'abgeschlossen', partial: 'mit Einschränkungen', error: 'fehlgeschlagen' };
    const runInfo = snapshot?.run.started_at ? ` · Letzter Lauf: ${snapshot.run.checked_sources}/${snapshot.run.total_sources || total} Quellen (${Object.hasOwn(runNames, snapshot.run.status) ? runNames[snapshot.run.status] : 'Status unbekannt'})` : '';
    document.getElementById('jfStatus').innerHTML = `${loading ? '<p class="jf-state">Veröffentlichten Stand laden …</p>' : ''}${error ? `<p class="jf-error" role="alert">${esc(error)}${snapshot ? ' Der zuvor geladene Stand bleibt sichtbar.' : ' Es werden keine aktuellen Stellen behauptet. Bitte später erneut laden.'}</p>` : ''}<div class="jf-metrics">${metrics.map(([number, label]) => `<div><strong>${esc(number)}</strong><span>${esc(label)}</span></div>`).join('')}</div><p class="jf-updated">${snapshot ? `Veröffentlicht: ${esc(dateTime(snapshot.generated_at))} · Letzter Quellenversuch: ${esc(dateTime(latestAttempt))}${esc(runInfo)}${partial ? ` · ${partial} teilweise erfasst` : ''}${unsupported ? ` · ${unsupported} technisch nicht erfasst` : ''}${neverRun ? ' · Noch kein serverseitiger Abruf durchgeführt.' : ''}` : 'Noch kein öffentlicher Stand geladen.'}</p>${snapshot?.ignored ? `<p class="jf-updated">${snapshot.ignored} ungültige oder doppelte Einträge wurden ausgeblendet.</p>` : ''}`;
    const refresh = mount.querySelector('[data-feed-action="refresh"]'); refresh.disabled = loading; refresh.setAttribute('aria-busy', String(loading));
    document.getElementById('jfSourceCount').textContent = `(${total} Arbeitgeber / Quellen)`;
    document.getElementById('jfSources').innerHTML = `<p class="jf-source-help">Ein Abruffehler oder eine nicht unterstützte Quelle bedeutet nicht, dass der Arbeitgeber keine offenen Stellen hat. Ältere Funde bleiben sichtbar. „Veralteter Stand“ bedeutet ältere beibehaltene Funde, eine unvollständige Aktualisierung oder einen erfolgreichen Abruf vor mehr als 48 Stunden.</p><div class="jf-source-list">${sources.map(source => `<article class="jf-source"><div><h3>${source.url ? `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.name)} <span aria-hidden="true">↗</span></a>` : esc(source.name)}</h3><p>Letzter Versuch: ${esc(dateTime(source.checked_at))} · Erfolgreich: ${esc(dateTime(source.last_success_at))} · ${source.job_count} Stellen</p>${source.message ? `<p>${esc(source.message)}</p>` : ''}${source.coverage || source.pages_scanned || source.detail_pages_scanned ? `<p>${esc(coverageLabel(source.coverage))}${source.coverage ? ' · ' : ''}${source.pages_scanned} Übersichtsseiten · ${source.detail_pages_scanned} Detailseiten</p>` : ''}</div><div class="jf-source-badges"><span class="jf-badge jf-${source.status}">${esc(source.no_portal ? 'Kein Stellenportal' : statusNames[source.status])}</span>${isStale(source) ? '<span class="jf-badge jf-partial">Veralteter Stand</span>' : ''}</div></article>`).join('')}</div>`;
  }
  function renderResults() {
    const jobs = filteredJobs(), pageCount = Math.max(1, Math.ceil(jobs.length / PAGE_SIZE)); page = Math.max(1, Math.min(page, pageCount));
    const start = (page - 1) * PAGE_SIZE, visible = jobs.slice(start, start + PAGE_SIZE);
    document.getElementById('jfResultsCount').textContent = `${jobs.length} ${jobs.length === 1 ? 'Stelle' : 'Stellen'}${jobs.length ? ` · ${start + 1}–${start + visible.length}` : ''}`;
    document.getElementById('jfJobs').innerHTML = visible.length ? visible.map(job => {
      const source = snapshot.sources.get(job.org_id), busy = imports.has(job.id), stale = isStale(source);
      return `<article class="jf-job"><div class="jf-job-main"><p class="jf-organization">${esc(job.organization)}${job.organization !== source.name ? ` <span class="jf-source-label">· Quelle: ${esc(source.name)}</span>` : ''}</p><h3><a href="${esc(job.url)}" target="_blank" rel="noopener noreferrer">${esc(job.title)} <span aria-hidden="true">↗</span></a></h3><p class="jf-job-meta">${[job.location || 'Ort nicht angegeben', job.pensum, job.role].filter(Boolean).map(esc).join(' · ')}</p>${job.description ? `<p class="jf-excerpt">${esc(job.description.slice(0, 240))}${job.description.length > 240 ? '…' : ''}</p>` : ''}<p class="jf-job-dates">Erstmals gefunden: ${esc(date(job.first_seen))} · Zuletzt bestätigt: ${esc(date(job.last_seen))}${stale ? ' · Älterer Quellenstand' : ''}${source.status === 'error' || source.status === 'partial' ? ' · Quelle zuletzt nicht vollständig erfasst' : ''}</p></div><div class="jf-job-action"><button type="button" class="jf-button" data-feed-action="import" data-feed-id="${esc(job.id)}"${busy ? ' disabled aria-busy="true"' : ''}>${busy ? 'Volltext wird geladen …' : 'In meine Stellensuche übernehmen'}</button><a class="jf-original" href="${esc(job.url)}" target="_blank" rel="noopener noreferrer">Originalinserat öffnen <span aria-hidden="true">↗</span></a></div></article>`;
    }).join('') : `<div class="jf-empty-state"><strong>${loading && !snapshot ? 'Stellen werden geladen …' : !snapshot ? 'Noch kein Stellenstand verfügbar' : snapshot.jobs.some(job => job.status !== 'closed') ? 'Keine Stellen für diese Filter' : 'Keine offenen Stellen im veröffentlichten Stand'}</strong><p>${!snapshot ? 'Sobald ein veröffentlichter Abruf erreichbar ist, erscheinen die Stellen hier ohne Anmeldung.' : snapshot.jobs.some(job => job.status !== 'closed') ? 'Versuche ein anderes Stichwort oder setze die Filter zurück.' : 'Prüfe die Quellenübersicht: Ungeprüfte oder fehlgeschlagene Quellen liefern keine Aussage über offene Stellen.'}</p></div>`;
    document.getElementById('jfPagination').innerHTML = jobs.length > PAGE_SIZE ? `<button type="button" class="jf-button jf-button-secondary" data-feed-action="previous"${page === 1 ? ' disabled' : ''}>← Zurück</button><span>Seite ${page} von ${pageCount}</span><button type="button" class="jf-button jf-button-secondary" data-feed-action="next"${page === pageCount ? ' disabled' : ''}>Weiter →</button>` : '';
    renderNotice();
  }
  function renderNotice() { const el = document.getElementById('jfNotice'); el.textContent = notice; el.hidden = !notice; }
  async function refresh() {
    const generation = ++epoch; indexController?.abort(); indexController = new AbortController();
    for (const controller of importControllers) controller.abort();
    imports.clear(); loading = true; error = ''; notice = ''; renderStatus(); renderResults();
    try {
      const url = configuredUrl(), raw = await readJson(url, MAX_INDEX_BYTES, indexController);
      if (generation !== epoch) return;
      snapshot = validateIndex(raw, url); renderFilters();
    } catch (err) {
      if (generation !== epoch) return;
      error = err.name === 'AbortError' ? 'Der Abruf dauerte zu lange. Bitte erneut versuchen.' : C.text(err.message, 500) || 'Der öffentliche Stand konnte nicht geladen werden.';
    } finally { if (generation === epoch) { loading = false; renderStatus(); renderResults(); } }
  }
  async function importJob(jobId) {
    const job = snapshot?.jobs.find(item => item.id === jobId);
    if (!job || imports.has(jobId)) return;
    if (typeof window.HealthJobs?.importPublicJobs !== 'function') { notice = 'Deine persönliche Stellensuche ist noch nicht bereit. Bitte kurz warten und erneut versuchen.'; renderNotice(); return; }
    const owner = getOwner(), ownerGeneration = authEpoch, generation = epoch, source = snapshot.sources.get(job.org_id), baseUrl = snapshot.url;
    const controller = new AbortController(); importControllers.add(controller); imports.add(jobId); notice = ''; renderResults();
    const isCurrent = () => owner === getOwner() && ownerGeneration === authEpoch && generation === epoch;
    try {
      const raw = await readJson(shardUrl(job, baseUrl), MAX_SHARD_BYTES, controller);
      if (!isCurrent()) return;
      if (!raw || raw.version !== 1 || raw.org_id !== job.org_id || raw.source?.org_id !== job.org_id || !Array.isArray(raw.jobs) || raw.jobs.length > MAX_SHARD_JOBS) throw new Error('Der Volltext gehört nicht zur angeforderten Quelle.');
      const matches = raw.jobs.filter(item => item?.id === job.id);
      if (matches.length !== 1) throw new Error('Diese Stelle fehlt im aktuellen Volltext. Bitte den Stand neu laden.');
      const cleanSourceValue = cleanSource(raw.source), full = cleanPublicJob(matches[0], new Map([[source.org_id, cleanSourceValue || source]]), baseUrl, false);
      if (!full || full.org_id !== job.org_id || C.canonicalUrl(full.url) !== C.canonicalUrl(job.url)) throw new Error('Die Volltextdaten stimmen nicht mit der ausgewählten Stelle überein.');
      if (!isCurrent()) return;
      const result = await window.HealthJobs.importPublicJobs([full], [cleanSourceValue || source]);
      if (!isCurrent()) return;
      if (result === false || result?.error) throw new Error('Die Stelle konnte nicht in deine Stellensuche übernommen werden.');
      notice = 'Stelle übernommen. Details, Matching und Bewerbungen findest du unten in deiner Stellensuche.';
    } catch (err) { if (isCurrent()) notice = err.name === 'AbortError' ? 'Der Volltext konnte nicht rechtzeitig geladen werden. Bitte erneut versuchen.' : C.text(err.message, 500) || 'Der Volltext konnte nicht geladen werden.'; }
    finally { importControllers.delete(controller); if (isCurrent()) { imports.delete(jobId); renderResults(); } }
  }
  mount.addEventListener('submit', event => event.preventDefault());
  mount.addEventListener('input', event => {
    const field = event.target.dataset.feedFilter;
    if (!Object.hasOwn(filters, field) || event.target.tagName === 'SELECT') return;
    filters[field] = event.target.value.slice(0, 300); page = 1; renderResults();
  });
  mount.addEventListener('change', event => {
    const field = event.target.dataset.feedFilter;
    if (!Object.hasOwn(filters, field)) return;
    filters[field] = event.target.value.slice(0, 300); page = 1; renderResults();
  });
  mount.addEventListener('click', event => {
    const button = event.target.closest('[data-feed-action]'); if (!button || !mount.contains(button)) return;
    const action = button.dataset.feedAction;
    if (action === 'refresh') refresh();
    else if (action === 'import') importJob(button.dataset.feedId);
    else if (action === 'reset') { for (const key of Object.keys(filters)) filters[key] = ''; mount.querySelectorAll('[data-feed-filter]').forEach(el => { el.value = ''; }); page = 1; renderResults(); }
    else if (action === 'previous' || action === 'next') { page += action === 'next' ? 1 : -1; renderResults(); const countEl = document.getElementById('jfResultsCount'); countEl.setAttribute('tabindex', '-1'); countEl.focus({ preventScroll: true }); }
  });
  window.addEventListener('healthjobs:auth', () => { authEpoch++; for (const controller of importControllers) controller.abort(); imports.clear(); notice = ''; renderResults(); });
  window.PublicJobFeed = { refresh, importJob, getJobs: () => filteredJobs().map(job => ({ ...job, org_ids: [...job.org_ids], categories: [...job.categories] })), getSourceStatus: () => snapshot ? [...snapshot.sources.values()].map(source => ({ ...source })) : [] };
  renderShell();
  // Scripts after feed.js establish the personal workspace before network completion.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => refresh(), { once: true });
  else Promise.resolve().then(() => refresh());
})();
