/* Public job feed: read-only published snapshots, filters, job detail and source transparency.
 * Personal state changes only when a visitor explicitly saves ("Merken") a vacancy.
 *
 * Contract: dispatches `publicfeed:loaded` {count, generatedAt} and `publicfeed:query` {q};
 * listens to `site:route` (sub 'stelle' opens the detail), `site:search`, `healthjobs:auth`,
 * `healthjobs:profile-changed` and `healthjobs:saved-changed`. */
(function () {
  'use strict';
  const C = window.JobCore, R = window.HealthJobRelevance, F = window.HealthJobFacts, mount = document.getElementById('publicJobFeed');
  if (!C || !mount) return;
  const DEFAULT_URL = 'https://raw.githubusercontent.com/salmonplnk/Jobs-Gesundheitsoekonomie-politik-management/job-feed-data/data/job-feed/index.json';
  const PAGE_SIZE = 25, MAX_PAGES = 400, MAX_INDEX_BYTES = 24 * 1024 * 1024, MAX_SHARD_BYTES = 12 * 1024 * 1024;
  const MAX_JOBS = 30000, MAX_SHARD_JOBS = 5000, STALE_MS = 48 * 60 * 60 * 1000, DAY = 24 * 60 * 60 * 1000;
  const BASE_TITLE = 'Burgener Gesundheitsjobs';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const orgId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(value) && !['constructor', 'prototype', '__proto__'].includes(value);
  const iso = value => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
  const date = value => value ? new Date(value).toLocaleDateString('de-CH') : 'Unbekannt';
  const dateTime = value => value ? new Date(value).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' }) : 'Noch nie';
  const count = value => Number.isInteger(value) && value >= 0 ? Math.min(value, MAX_JOBS) : 0;
  const cssEscape = value => window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&');
  const own = (object, key) => typeof key === 'string' && Object.hasOwn(object, key);
  const catalogGroups = typeof DATA !== 'undefined' && Array.isArray(DATA) ? DATA : [];
  const catalog = new Map();
  for (const group of catalogGroups) for (const org of group.orgs || []) if (orgId(org.id)) catalog.set(org.id, { ...org, category: group.key, category_name: group.title });
  const statusNames = { ok: 'Abruf erfolgreich', empty: 'Keine Inserate gefunden', partial: 'Teilweise erfasst', error: 'Abruf fehlgeschlagen', unsupported: 'Nicht erfasst', pending: 'Noch nicht geprüft' };
  const focusCategories = Array.isArray(R?.CATEGORIES) ? R.CATEGORIES : [];
  const CANTONS = F?.CANTONS || {};
  const SENIORITY_LABELS = { praktikum: 'Praktikum', trainee: 'Trainee', junior: 'Junior', senior: 'Senior', lead: 'Leitung', phd: 'PhD/Doktorat' };
  const REGIONS = [
    ['westschweiz', 'Westschweiz', ['GE', 'VD', 'NE', 'FR', 'JU', 'VS']], ['nordwestschweiz', 'Nordwestschweiz', ['BS', 'BL', 'AG', 'SO']],
    ['zentralschweiz', 'Zentralschweiz', ['LU', 'ZG', 'SZ', 'UR', 'OW', 'NW']], ['ostschweiz', 'Ostschweiz', ['SG', 'TG', 'AR', 'AI', 'GR', 'GL', 'SH']],
    ['ZH', 'Zürich', ['ZH']], ['BE', 'Bern', ['BE']], ['TI', 'Tessin', ['TI']]
  ];
  const regionCodes = value => (REGIONS.find(([key]) => key === value) || [, , own(CANTONS, value) ? [value] : []])[2];
  const SORTS = [['neu', 'Neueste zuerst'], ['frist', 'Frist (nächste zuerst)'], ['pensum', 'Pensum (hoch zuerst)'], ['arbeitgeber', 'Arbeitgeber A–Z'], ['passung', 'Beste Passung']];
  const PARAMS = [['q', 'q'], ['focus', 'fach'], ['canton', 'kanton'], ['seniority', 'stufe'], ['employer', 'ag'], ['category', 'branche'], ['sort', 'sort']];
  const FILTER_LABELS = { q: 'Stichwort', focus: 'Fachbereich', canton: 'Region', seniority: 'Karrierestufe', employer: 'Arbeitgeber', category: 'Branche' };
  const FACT_KEYS = ['deadline', 'start_date', 'seniority', 'salary_hint', 'salary_range', 'canton'];
  const DENSITY_KEY = 'healthjobs.feedDensity';
  const filters = { q: '', focus: '', canton: '', seniority: '', employer: '', category: '', sort: 'neu' };
  let snapshot = null, page = 1, loading = false, error = '', notice = '', epoch = 0, authEpoch = 0, indexController;
  let urlAfterClose = false, stats = null, moreOpen = false, sheetOpen = false, urlTimer = null, density = readDensity();
  const imports = new Set(), importControllers = new Set(), localSaved = new Set(), givenFacts = new Map(), aliases = new Map(), shardCache = new Map();
  let matchCache = new Map();
  const detail = { id: '', full: null, facts: null, loading: false, error: '', fromList: false, returnFocus: null, controller: null, generation: 0, eligible: true };
  const HJ = name => typeof window.HealthJobs?.[name] === 'function' ? window.HealthJobs[name] : null;
  const getOwner = () => window.HealthJobs?.getOwner?.() ?? null;
  const jobHash = id => typeof window.SiteRouter?.jobHash === 'function' ? window.SiteRouter.jobHash(id) : `#stelle-${String(id).replace(':', '-')}`;
  const icon = {
    star: '<svg class="jf-i" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9Z"/></svg>',
    out: '<svg class="jf-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    close: '<svg class="jf-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    filter: '<svg class="jf-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
    chevron: '<svg class="jf-i jf-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    bell: '<svg class="jf-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15ZM10 20a2 2 0 0 0 4 0"/></svg>',
    warn: '<svg class="jf-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 2.8 20h18.4ZM12 10v4M12 17.2v.1"/></svg>',
    list: '<svg class="jf-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    cards: '<svg class="jf-i" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="7" rx="1.5"/><rect x="4" y="13" width="16" height="7" rx="1.5"/></svg>'
  };

  function readDensity() { try { return window.localStorage.getItem(DENSITY_KEY) === 'list' ? 'list' : 'cards'; } catch { return 'cards'; } }

  /* ---------- Loading and validation ---------- */
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
      job_count: count(raw?.job_count), raw_job_count: count(raw?.raw_job_count ?? raw?.job_count), relevant_job_count: count(raw?.relevant_job_count), filtered_out_count: count(raw?.filtered_out_count), stale: raw?.stale === true, message: C.text(raw?.message, 2000), coverage: C.text(raw?.coverage, 300),
      pages_scanned: count(raw?.pages_scanned), detail_pages_scanned: count(raw?.detail_pages_scanned), method: C.text(raw?.method, 120),
      has_portal: hasPortal, no_portal: !hasPortal, category: org?.category || '', category_name: org?.category_name || '' };
  }
  function cleanRange(range) {
    if (!range || typeof range !== 'object' || Array.isArray(range)) return null;
    const num = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 10000000 ? value : null;
    const min = num(range.min), max = num(range.max);
    if ((min == null && max == null) || (min != null && max != null && min > max)) return null;
    return { min, max, currency: typeof range.currency === 'string' && /^[A-Z]{3}$/.test(range.currency) ? range.currency : 'CHF',
      period: ['year', 'month', 'hour'].includes(range.period) ? range.period : 'year', source: C.text(range.source, 120) };
  }
  /** Validated fact fields; missing or malformed values are left out. */
  function cleanFacts(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value.slice(0, 10))) ? value.slice(0, 10) : null;
    if (day(raw.deadline)) out.deadline = day(raw.deadline);
    if (['sofort', 'nach Vereinbarung'].includes(raw.start_date)) out.start_date = raw.start_date; else if (day(raw.start_date)) out.start_date = day(raw.start_date);
    if (own(SENIORITY_LABELS, raw.seniority)) out.seniority = raw.seniority;
    if (typeof raw.salary_hint === 'string' && raw.salary_hint.trim()) out.salary_hint = C.text(raw.salary_hint.trim(), 160);
    const range = cleanRange(raw.salary_range); if (range) out.salary_range = range;
    if (own(CANTONS, raw.canton)) out.canton = raw.canton;
    return out;
  }
  /** Earlier layers win; full extraction runs only when a field is still missing. */
  function factsFor(input, layers, org) {
    const out = {}; let extracted = null;
    for (const key of FACT_KEYS) {
      const hit = layers.find(layer => layer && layer[key] != null);
      if (hit) { out[key] = hit[key]; continue; }
      if (!extracted) { try { extracted = cleanFacts(F?.extractFacts ? F.extractFacts(input, org) : {}); } catch { extracted = {}; } }
      out[key] = extracted[key] ?? null;
    }
    return out;
  }
  const factInput = (job, raw) => ({ ...job, seniority: raw?.seniority, deadline: typeof raw?.deadline === 'string' ? raw.deadline : '', salary_hint: typeof raw?.salary_hint === 'string' ? raw.salary_hint : '' });
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
    if (typeof R?.classify !== 'function') throw new Error('Der fachliche Stellenfilter konnte nicht geladen werden. Bitte die Seite neu laden.');
    const sources = new Map();
    for (const rawSource of raw.sources) { const source = cleanSource(rawSource); if (source && !sources.has(source.org_id)) sources.set(source.org_id, source); }
    for (const org of catalog.values()) if (!sources.has(org.id)) sources.set(org.id, cleanSource(null, org));
    let jobs = []; const ids = new Set(), given = new Map(); let ignored = 0, excluded = 0;
    const scoped = raw.scope?.policy_version === R.POLICY_VERSION;
    const observed = new Map(), accepted = new Map();
    for (const rawJob of raw.jobs) {
      const job = cleanPublicJob(rawJob, sources, url, true);
      if (!job || ids.has(job.id)) { ignored++; continue; }
      ids.add(job.id);
      if (job.status !== 'closed') for (const id of job.org_ids) observed.set(id, (observed.get(id) || 0) + 1);
      // New snapshots carry the full-text classification: compact excerpts may omit
      // its evidence. Older broad snapshots are checked locally before display.
      const evidence = rawJob.relevance;
      const validatedEvidence = scoped && evidence?.policy_version === R.POLICY_VERSION && evidence.eligible === true && focusCategories.includes(evidence.category) && Array.isArray(evidence.reasons) && evidence.reasons.length > 0 && evidence.reasons.every(reason => typeof reason === 'string' && reason.trim());
      job.relevance = validatedEvidence
        ? { eligible: true, category: evidence.category, reasons: evidence.reasons.slice(0, 5).map(reason => C.text(reason, 300)), policy_version: R.POLICY_VERSION }
        : R.classify(job, catalog.get(job.org_id) || sources.get(job.org_id));
      if (!job.relevance.eligible || !focusCategories.includes(job.relevance.category)) { if (job.status !== 'closed') excluded++; continue; }
      // Index fields win; older snapshots without them fall back to local extraction.
      const facts = cleanFacts(rawJob); given.set(job.id, facts);
      Object.assign(job, factsFor(factInput(job, rawJob), [facts], catalog.get(job.org_id)));
      jobs.push(job);
    }
    // Older snapshots still list one posting under several URLs, languages or sources.
    const beforeDedupe = jobs.length, aliasMap = new Map();
    if (typeof F?.dedupeJobs === 'function') {
      jobs = F.dedupeJobs(jobs).map(job => {
        const orgIds = (Array.isArray(job.org_ids) ? job.org_ids : [job.org_id]).filter(id => sources.has(id));
        const merged = { ...job, org_ids: [...new Set([job.org_id, ...orgIds])], duplicate_ids: Array.isArray(job.duplicate_ids) ? job.duplicate_ids.filter(id => typeof id === 'string') : [] };
        merged.categories = [...new Set(merged.org_ids.map(id => sources.get(id).category).filter(Boolean))];
        for (const id of merged.duplicate_ids) aliasMap.set(id, merged.id);
        return merged;
      });
    }
    for (const job of jobs) if (job.status !== 'closed') for (const id of job.org_ids) accepted.set(id, (accepted.get(id) || 0) + 1);
    for (const source of sources.values()) {
      if (!scoped) source.raw_job_count = Math.max(source.raw_job_count, observed.get(source.org_id) || 0);
      source.relevant_job_count = accepted.get(source.org_id) || 0;
      source.filtered_out_count = scoped ? source.filtered_out_count + Math.max(0, (observed.get(source.org_id) || 0) - source.relevant_job_count) : Math.max(0, source.raw_job_count - source.relevant_job_count);
    }
    const scope = { policy_version: R.POLICY_VERSION, excluded_jobs: scoped ? count(raw.scope.excluded_jobs) + excluded : excluded, relevant_jobs: jobs.filter(job => job.status !== 'closed').length, scanned_jobs: scoped ? count(raw.scope.scanned_jobs) : observed.size ? raw.jobs.filter(job => job?.status !== 'closed').length - ignored : 0 };
    return { url, generated_at: iso(raw.generated_at), sources, jobs, ignored, duplicates: beforeDedupe - jobs.length, given, aliases: aliasMap, scope, run: { id: C.text(raw.run.id, 100), started_at: iso(raw.run.started_at), finished_at: iso(raw.run.finished_at), status: C.text(raw.run.status, 50), total_sources: count(raw.run.total_sources), checked_sources: count(raw.run.checked_sources) } };
  }

  /* ---------- Derived values ---------- */
  function coverageLabel(value) { const names = { complete: 'Vollständig erfasst', partial: 'Teilweise erfasst', unknown: 'Abdeckung unbekannt' }; return Object.hasOwn(names, value) ? names[value] : value; }
  function isStale(source) { return (source.raw_job_count > 0 || source.relevant_job_count > 0) && (source.stale || !!source.last_success_at && Date.now() - Date.parse(source.last_success_at) > STALE_MS); }
  function isComplete(source) { return source.coverage === 'complete' && ['ok', 'empty'].includes(source.status) && !source.stale && !!source.last_complete_at && Date.now() - Date.parse(source.last_complete_at) <= STALE_MS; }
  const openJobs = () => snapshot ? snapshot.jobs.filter(job => job.status !== 'closed') : [];
  const findJob = id => snapshot ? snapshot.jobs.find(job => job.id === id) || snapshot.jobs.find(job => job.id === snapshot.aliases.get(id)) || null : null;
  function daysUntil(day) {
    if (!day) return null;
    const [y, m, d] = day.split('-').map(Number), today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((new Date(y, m - 1, d) - today) / DAY);
  }
  const shortDate = day => { const [y, m, d] = String(day).split('-'); return `${d}.${m}.${y}`; };
  function deadlineText(day, long) {
    const days = daysUntil(day); if (days == null) return '';
    const when = days < 0 ? 'abgelaufen' : days === 0 ? 'läuft heute ab' : days === 1 ? 'läuft morgen ab' : `läuft in ${days} Tagen ab`;
    return long ? `${shortDate(day)} · ${when}` : days >= 0 && days <= 7 ? `Frist ${days === 0 ? 'heute' : days === 1 ? 'morgen' : `in ${days} Tagen`}` : days < 0 ? 'Frist abgelaufen' : `Frist ${shortDate(day)}`;
  }
  const urgent = day => { const days = daysUntil(day); return days != null && days >= 0 && days <= 7; };
  const chf = value => `CHF ${Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '’')}`;
  function salaryRangeText(range) {
    if (!range) return '';
    const unit = { year: 'pro Jahr', month: 'pro Monat', hour: 'pro Stunde' }[range.period] || '';
    const amount = range.min != null && range.max != null ? (range.min === range.max ? chf(range.min) : `${chf(range.min)}–${chf(range.max).replace('CHF ', '')}`) : range.min != null ? `ab ${chf(range.min)}` : `bis ${chf(range.max)}`;
    return `ca. ${amount} ${unit}`.trim();
  }
  const pensumText = job => job.pensum || (job.workload_min != null ? (job.workload_min === job.workload_max ? `${job.workload_min} %` : `${job.workload_min}–${job.workload_max} %`) : '');
  function placeText(job) {
    const first = String(job.location || '').split(/[,;/]|\s[–-]\s/)[0].trim();
    if (!first) return job.canton ? CANTONS[job.canton] : '';
    return job.canton && !first.includes(job.canton) ? `${first} (${job.canton})` : first;
  }
  function excerpt(text, max = 220) {
    const flat = String(text || '').replace(/[•●▪◦‣]/g, ' ').replace(/\s+/g, ' ').trim();
    return flat.length > max ? flat.slice(0, max).replace(/\s+\S*$/, '') + ' …' : flat;
  }
  function profileMatch(job) {
    const fn = HJ('getProfileMatch'); if (!fn) return null;
    if (matchCache.has(job.id)) return matchCache.get(job.id);
    let result = null;
    try {
      const raw = fn(job);
      if (raw && typeof raw === 'object' && Number.isFinite(Number(raw.score))) result = { score: Math.max(0, Math.min(100, Math.round(Number(raw.score)))), label: C.text(raw.label, 120), reasons: Array.isArray(raw.reasons) ? raw.reasons.filter(r => typeof r === 'string' && r.trim()).slice(0, 6).map(r => C.text(r, 300)) : [] };
    } catch { result = null; }
    matchCache.set(job.id, result); return result;
  }
  const matchAvailable = () => !!HJ('getProfileMatch') && openJobs().some(job => profileMatch(job));
  function isSavedJob(id) {
    const fn = HJ('isSaved');
    if (fn) { try { return !!fn(id); } catch { return false; } }
    return localSaved.has(id);
  }
  function computeStats() {
    const s = { focus: new Map(), canton: new Map(), seniority: new Map(), employer: new Map(), category: new Map() };
    const add = (map, key) => { if (key) map.set(key, (map.get(key) || 0) + 1); };
    for (const job of openJobs()) {
      add(s.focus, job.relevance.category); add(s.canton, job.canton); add(s.seniority, job.seniority);
      for (const id of job.org_ids) add(s.employer, id);
      for (const key of job.categories) add(s.category, key);
    }
    return s;
  }
  function matchesFilters(job, except) {
    if (job.status === 'closed') return false;
    if (except !== 'employer' && filters.employer && !job.org_ids.includes(filters.employer)) return false;
    if (except !== 'category' && filters.category && !job.categories.includes(filters.category)) return false;
    if (except !== 'focus' && filters.focus && job.relevance.category !== filters.focus) return false;
    if (except !== 'seniority' && filters.seniority && job.seniority !== filters.seniority) return false;
    if (except !== 'canton' && filters.canton && !regionCodes(filters.canton).includes(job.canton)) return false;
    const terms = C.normalize(filters.q).split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    const content = C.normalize(`${job.title} ${job.organization} ${job.org_ids.map(id => snapshot.sources.get(id)?.name || '').join(' ')} ${job.description} ${job.location} ${job.canton ? CANTONS[job.canton] : ''}`);
    return terms.every(term => content.includes(term));
  }
  const recent = (a, b) => (Date.parse(b.first_seen) || 0) - (Date.parse(a.first_seen) || 0) || a.id.localeCompare(b.id);
  function sorter() {
    const sort = filters.sort === 'passung' && !matchAvailable() ? 'neu' : filters.sort;
    if (sort === 'frist') {
      const rank = job => { const days = daysUntil(job.deadline); return days == null ? [2, 0] : days < 0 ? [1, -days] : [0, days]; };
      return (a, b) => { const ra = rank(a), rb = rank(b); return ra[0] - rb[0] || ra[1] - rb[1] || recent(a, b); };
    }
    if (sort === 'pensum') return (a, b) => (b.workload_max ?? -1) - (a.workload_max ?? -1) || (b.workload_min ?? -1) - (a.workload_min ?? -1) || recent(a, b);
    if (sort === 'arbeitgeber') return (a, b) => a.organization.localeCompare(b.organization, 'de') || recent(a, b);
    if (sort === 'passung') return (a, b) => (profileMatch(b)?.score ?? -1) - (profileMatch(a)?.score ?? -1) || recent(a, b);
    return recent;
  }
  function filteredJobs() { return snapshot ? snapshot.jobs.filter(job => matchesFilters(job)).sort(sorter()) : []; }
  const activeFilters = () => Object.keys(FILTER_LABELS).filter(key => filters[key]);

  /* ---------- URL state ---------- */
  function readUrl() {
    let params; try { params = new URLSearchParams(location.search); } catch { return; }
    for (const [key, param] of PARAMS) {
      const value = (params.get(param) || '').slice(0, 300).trim();
      if (!value) continue;
      if (key === 'q') filters.q = value;
      else if (key === 'focus' && focusCategories.includes(value)) filters.focus = value;
      else if (key === 'canton' && regionCodes(value).length) filters.canton = value;
      else if (key === 'seniority' && own(SENIORITY_LABELS, value)) filters.seniority = value;
      else if (key === 'employer' && orgId(value)) filters.employer = value;
      else if (key === 'category' && catalogGroups.some(group => group.key === value)) filters.category = value;
      else if (key === 'sort' && SORTS.some(([s]) => s === value)) filters.sort = value;
    }
    const seite = Number(params.get('seite'));
    if (Number.isInteger(seite) && seite > 1) page = Math.min(seite, MAX_PAGES);
    if (filters.employer || filters.category) moreOpen = true;
  }
  function writeUrl() {
    clearTimeout(urlTimer); urlTimer = null;
    try {
      const params = new URLSearchParams(location.search);
      for (const [key, param] of PARAMS) { const value = key === 'sort' && filters.sort === 'neu' ? '' : filters[key]; if (value) params.set(param, value); else params.delete(param); }
      if (page > 1) params.set('seite', String(page)); else params.delete('seite');
      const query = params.toString(), next = location.pathname + (query ? '?' + query : '') + location.hash;
      if (next !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', next);
    } catch { /* URL state is a convenience only */ }
  }
  const scheduleUrl = () => { clearTimeout(urlTimer); urlTimer = setTimeout(writeUrl, 300); };

  /* ---------- Rendering: Stellen ---------- */
  function selectOptions(items, selected, placeholder) { return `<option value="">${esc(placeholder)}</option>` + items.map(([value, label]) => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`).join(''); }
  const withCount = (label, n) => n != null ? `${label} (${n})` : label;
  function renderShell() {
    mount.innerHTML = `<div class="jf-shell${density === 'list' ? ' is-list' : ''}">
<h2 class="visually-hidden">Stellen</h2>
<div class="jf-mobilebar"><button type="button" class="jf-filter-toggle" data-feed-action="open-filters" aria-expanded="false" aria-controls="jfToolbar">${icon.filter}<span id="jfFilterLabel">Filter</span></button></div>
<div class="jf-sheet-backdrop" data-feed-action="close-filters" hidden></div>
<form class="jf-toolbar" id="jfToolbar" role="search" aria-label="Stellen filtern">
<div class="jf-sheet-head"><h3>Filter</h3><button type="button" class="jf-icon-btn" data-feed-action="close-filters" aria-label="Filter schliessen">${icon.close}</button></div>
<div class="jf-fields">
<div class="jf-field jf-field-q"><label for="jfQuery">Stichwort</label><input id="jfQuery" type="search" data-feed-filter="q" placeholder="Titel, Stichwort, Ort oder Arbeitgeber" autocomplete="off" maxlength="300"></div>
<div class="jf-field"><label for="jfFocus">Fachbereich</label><select id="jfFocus" data-feed-filter="focus"></select></div>
<div class="jf-field"><label for="jfCanton">Region / Kanton</label><select id="jfCanton" data-feed-filter="canton"></select></div>
<div class="jf-field"><label for="jfSeniority">Karrierestufe</label><select id="jfSeniority" data-feed-filter="seniority"></select></div>
<button type="button" class="jf-more-toggle" data-feed-action="more-filters" aria-expanded="false" aria-controls="jfMoreFilters">Mehr Filter${icon.chevron}</button>
</div>
<div class="jf-fields jf-more" id="jfMoreFilters" hidden>
<div class="jf-field"><label for="jfEmployer">Arbeitgeber</label><select id="jfEmployer" data-feed-filter="employer"></select></div>
<div class="jf-field"><label for="jfCategory">Branche</label><select id="jfCategory" data-feed-filter="category"></select></div>
</div>
<div class="jf-sheet-foot"><button type="button" class="btn" data-feed-action="reset">Zurücksetzen</button><button type="button" class="btn btn-primary" data-feed-action="close-filters" id="jfSheetApply">Stellen anzeigen</button></div>
</form>
<div id="jfStatus" class="jf-status" aria-live="polite"></div>
<div id="jfChips" class="jf-chips"></div>
<div class="jf-results-heading">
<p id="jfResultsCount" role="status" tabindex="-1"></p>
<div class="jf-results-tools">
<label class="jf-sort" for="jfSort"><span>Sortieren</span><select id="jfSort" data-feed-filter="sort"></select></label>
<div class="jf-density" role="group" aria-label="Darstellung"><button type="button" data-feed-action="density" data-density="list" aria-pressed="${density === 'list'}" title="Kompakte Liste">${icon.list}<span>Liste</span></button><button type="button" data-feed-action="density" data-density="cards" aria-pressed="${density === 'cards'}" title="Karten mit Auszug">${icon.cards}<span>Karten</span></button></div>
<div class="jf-keys"><button type="button" class="jf-icon-btn" data-feed-action="shortcuts" aria-expanded="false" aria-controls="jfShortcuts" aria-label="Tastenkürzel anzeigen" title="Tastenkürzel (?)" aria-keyshortcuts="?">?</button>
<div class="jf-popover" id="jfShortcuts" hidden><p><strong>Tastenkürzel</strong></p><dl><div><dt><kbd>j</kbd> / <kbd>k</kbd></dt><dd>Nächste / vorherige Stelle</dd></div><div><dt><kbd>Enter</kbd> / <kbd>o</kbd></dt><dd>Details öffnen</dd></div><div><dt><kbd>m</kbd></dt><dd>Merken ein/aus</dd></div><div><dt><kbd>Shift</kbd> + <kbd>O</kbd></dt><dd>Originalinserat öffnen</dd></div><div><dt><kbd>/</kbd></dt><dd>Suche fokussieren</dd></div><div><dt><kbd>?</kbd></dt><dd>Diese Hilfe ein/aus</dd></div></dl></div></div>
</div>
</div>
<p id="jfNotice" class="jf-notice" role="status" hidden></p>
<div id="jfJobs" class="jf-jobs"></div>
<div id="jfPagination" class="jf-pagination"></div>
<p class="jf-footnote">Alle Stellen stammen aus dem zuletzt veröffentlichten Abruf der Arbeitgeberportale und sind nach Aufgaben und Anforderungen gefiltert – ein Arbeitgeber im Gesundheitswesen allein genügt nicht. Angaben ohne Gewähr: Bitte Verfügbarkeit, Lohn und Fristen im Originalinserat prüfen. <a href="#quellen">Quellen &amp; Transparenz</a></p>
</div>`;
    document.getElementById('jfQuery').value = filters.q;
    renderFilters(); renderStatus(); renderResults();
  }
  function renderFilters() {
    stats = snapshot ? computeStats() : null;
    const n = (map, key) => stats ? map.get(key) || 0 : null;
    document.getElementById('jfFocus').innerHTML = selectOptions(focusCategories.map(category => [category, withCount(category, n(stats?.focus, category))]), filters.focus, 'Alle Fachbereiche');
    const regionCount = codes => stats ? codes.reduce((sum, code) => sum + (stats.canton.get(code) || 0), 0) : null;
    const regionKeys = new Set(REGIONS.map(([key]) => key));
    const cantons = stats ? [...stats.canton.keys()].filter(code => !regionKeys.has(code)).sort((a, b) => CANTONS[a].localeCompare(CANTONS[b], 'de')) : [];
    if (filters.canton && own(CANTONS, filters.canton) && !regionKeys.has(filters.canton) && !cantons.includes(filters.canton)) cantons.push(filters.canton);
    const option = (value, label) => `<option value="${esc(value)}"${value === filters.canton ? ' selected' : ''}>${esc(label)}</option>`;
    document.getElementById('jfCanton').innerHTML = `<option value="">Ganze Schweiz</option><optgroup label="Regionen">${REGIONS.map(([key, label, codes]) => option(key, withCount(label, regionCount(codes)))).join('')}</optgroup>${cantons.length ? `<optgroup label="Kantone">${cantons.map(code => option(code, withCount(CANTONS[code], n(stats?.canton, code)))).join('')}</optgroup>` : ''}`;
    document.getElementById('jfSeniority').innerHTML = selectOptions(Object.entries(SENIORITY_LABELS).map(([key, label]) => [key, withCount(label, n(stats?.seniority, key))]), filters.seniority, 'Alle Stufen');
    const sources = snapshot ? [...snapshot.sources.values()] : [...catalog.values()].map(org => cleanSource(null, org)).filter(Boolean);
    const employers = sources.filter(source => !snapshot || source.relevant_job_count > 0 || source.org_id === filters.employer).map(source => [source.org_id, withCount(source.name, n(stats?.employer, source.org_id))]).sort((a, b) => a[1].localeCompare(b[1], 'de'));
    document.getElementById('jfEmployer').innerHTML = selectOptions(employers, filters.employer, 'Alle Arbeitgeber');
    document.getElementById('jfCategory').innerHTML = selectOptions(catalogGroups.filter(group => !stats || stats.category.get(group.key) || group.key === filters.category).map(group => [group.key, withCount(group.title, n(stats?.category, group.key))]), filters.category, 'Alle Branchen');
    const sorts = SORTS.filter(([key]) => key !== 'passung' || matchAvailable() || filters.sort === 'passung');
    document.getElementById('jfSort').innerHTML = sorts.map(([key, label]) => `<option value="${key}"${key === filters.sort ? ' selected' : ''}>${esc(label)}</option>`).join('');
    renderMoreToggle();
  }
  function renderMoreToggle() {
    const toggle = mount.querySelector('[data-feed-action="more-filters"]'), panel = document.getElementById('jfMoreFilters');
    toggle.setAttribute('aria-expanded', String(moreOpen)); panel.hidden = !moreOpen;
    const extra = ['employer', 'category'].filter(key => filters[key]).length;
    toggle.firstChild.textContent = extra ? `Mehr Filter (${extra})` : 'Mehr Filter';
  }
  function chipLabel(key) {
    const value = filters[key];
    if (key === 'q') return `„${value}“`;
    if (key === 'canton') return (REGIONS.find(([k]) => k === value) || [, CANTONS[value]])[1] || value;
    if (key === 'seniority') return SENIORITY_LABELS[value] || value;
    if (key === 'employer') return snapshot?.sources.get(value)?.name || catalog.get(value)?.name || value;
    if (key === 'category') return catalogGroups.find(group => group.key === value)?.title || value;
    return value;
  }
  function renderChips() {
    const active = activeFilters(), el = document.getElementById('jfChips');
    el.innerHTML = active.length ? `<ul class="jf-chip-list" aria-label="Aktive Filter">${active.map(key => `<li><button type="button" class="jf-chip" data-feed-action="clear-filter" data-filter-key="${key}" aria-label="Filter entfernen: ${esc(FILTER_LABELS[key])} ${esc(chipLabel(key))}"><span class="jf-chip-key">${esc(FILTER_LABELS[key])}:</span> ${esc(chipLabel(key))}${icon.close}</button></li>`).join('')}</ul><button type="button" class="jf-link-btn" data-feed-action="reset">Alle Filter zurücksetzen</button>` : '';
    const label = document.getElementById('jfFilterLabel'); label.textContent = active.length ? `Filter (${active.length})` : 'Filter';
  }
  function renderStatus() {
    const el = document.getElementById('jfStatus'), parts = [];
    if (loading && !snapshot) parts.push('<p class="jf-statusline">Veröffentlichten Stand laden …</p>');
    if (error) parts.push(`<p class="jf-error" role="alert">${icon.warn}<span>${esc(error)}${snapshot ? ' Der zuvor geladene Stand bleibt sichtbar.' : ' Es werden keine aktuellen Stellen behauptet. Bitte später erneut laden.'}</span> <button type="button" class="jf-link-btn" data-feed-action="refresh"${loading ? ' disabled' : ''}>Erneut laden</button></p>`);
    if (snapshot) {
      const age = snapshot.generated_at ? Date.now() - Date.parse(snapshot.generated_at) : Infinity;
      // The count, date and link to #quellen are shown in the site hero (js/site.js).
      if (age > STALE_MS) parts.push(`<p class="jf-stale">${icon.warn}<span>Der veröffentlichte Stand ist älter als 48 Stunden. Einzelne Stellen können bereits besetzt sein.</span></p>`);
    }
    el.innerHTML = parts.join('');
    renderSourceStatus();
  }
  function cardHtml(job) {
    const source = snapshot.sources.get(job.org_id), busy = imports.has(job.id), saved = isSavedJob(job.id), match = profileMatch(job);
    const place = placeText(job), pensum = pensumText(job), deadline = job.deadline ? deadlineText(job.deadline) : '';
    const meta = [`<span class="jf-organization">${esc(job.organization)}${job.organization !== source.name ? ` <span class="jf-source-label">· Quelle: ${esc(source.name)}</span>` : ''}</span>`, place && `<span>${esc(place)}</span>`, pensum && `<span>${esc(pensum)}</span>`, deadline && `<span class="jf-deadline${urgent(job.deadline) ? ' is-urgent' : ''}">${esc(deadline)}</span>`].filter(Boolean);
    const isNew = job.first_seen && Date.now() - Date.parse(job.first_seen) < 3 * DAY;
    const chips = [isNew && '<span class="chip chip-brand">Neu</span>', `<span class="chip jf-focus-badge">${esc(job.relevance.category)}</span>`, job.seniority && `<span class="chip">${esc(SENIORITY_LABELS[job.seniority])}</span>`, job.salary_hint && `<span class="chip jf-salary-chip">${esc(job.salary_hint)}</span>`, match && `<span class="chip chip-accent jf-fit" title="${esc(match.label || 'Passung zu deinem Profil')}">${match.score} % Passung</span>`].filter(Boolean);
    const warn = [isStale(source) && 'Älterer Quellenstand', (source.status === 'error' || source.status === 'partial') && 'Quelle zuletzt nicht vollständig erfasst'].filter(Boolean).join('\u00a0· ');
    const title = esc(job.title);
    return `<article class="jf-job" data-job-id="${esc(job.id)}">
<div class="jf-job-main">
<h3><a class="jf-job-link" href="${esc(jobHash(job.id))}" data-job-link="${esc(job.id)}">${title}</a></h3>
<p class="jf-job-meta">${meta.join('<span class="jf-sep" aria-hidden="true">\u00a0· </span>')}</p>
<div class="jf-job-tags">${chips.join('')}</div>
${job.description ? `<p class="jf-excerpt">${esc(excerpt(job.description))}</p>` : ''}
${warn ? `<p class="jf-job-dates">Zuletzt bestätigt ${esc(date(job.last_seen))} · ${esc(warn)}</p>` : ''}
</div>
<div class="jf-job-actions">
<button type="button" class="jf-save" data-feed-action="save" data-feed-id="${esc(job.id)}" aria-pressed="${saved}" aria-label="${saved ? 'Gemerkt' : 'Merken'}: ${title}"${busy ? ' disabled aria-busy="true"' : ''}>${icon.star}<span>${busy ? 'Wird gemerkt …' : saved ? 'Gemerkt' : 'Merken'}</span></button>
<a class="jf-original" href="${esc(job.url)}" target="_blank" rel="noopener noreferrer" aria-label="Originalinserat öffnen: ${title} (neues Fenster)">Original${icon.out}</a>
</div>
</article>`;
  }
  const skeletonCards = () => Array.from({ length: 5 }, () => '<div class="jf-job jf-job-skeleton" aria-hidden="true"><div class="jf-job-main"><div class="skeleton jf-sk-title"></div><div class="skeleton jf-sk-meta"></div><div class="skeleton jf-sk-line"></div></div></div>').join('');
  function renderResults() {
    const jobs = filteredJobs(), maxPage = Math.max(1, Math.ceil(jobs.length / PAGE_SIZE));
    if (snapshot) page = Math.max(1, Math.min(page, maxPage));
    const visible = jobs.slice(0, page * PAGE_SIZE), total = snapshot ? snapshot.scope.relevant_jobs : 0, list = document.getElementById('jfJobs');
    const countEl = document.getElementById('jfResultsCount');
    countEl.textContent = !snapshot ? (loading ? 'Stellen werden geladen …' : 'Keine Stellen geladen') : `${jobs.length} ${jobs.length === 1 ? 'fachlich passende Stelle' : 'fachlich passende Stellen'}${activeFilters().length && jobs.length !== total ? ` von ${total}` : ''}`;
    list.setAttribute('aria-busy', String(loading && !snapshot));
    list.innerHTML = loading && !snapshot ? skeletonCards() : visible.length ? visible.map(cardHtml).join('') : `<div class="jf-empty-state"><strong>${!snapshot ? 'Noch kein Stellenstand verfügbar' : snapshot.jobs.some(job => job.status !== 'closed') ? 'Keine Stellen für diese Filter' : 'Keine fachlich passenden Stellen im veröffentlichten Stand'}</strong><p>${!snapshot ? 'Sobald ein veröffentlichter Abruf erreichbar ist, erscheinen die Stellen hier ohne Anmeldung.' : snapshot.jobs.some(job => job.status !== 'closed') ? 'Versuche ein anderes Stichwort oder entferne einzelne Filter.' : 'Das bedeutet nicht, dass es keine passenden Stellen gibt. Unvollständig erfasste Quellen bleiben offen.'}</p>${snapshot && activeFilters().length ? '<button type="button" class="btn" data-feed-action="reset">Alle Filter zurücksetzen</button>' : !snapshot ? '<a class="btn" href="#quellen">Quellen &amp; Transparenz</a>' : ''}</div>`;
    const rest = jobs.length - visible.length;
    document.getElementById('jfPagination').innerHTML = rest > 0 ? `<button type="button" class="btn jf-more-btn" data-feed-action="more">Mehr laden <span class="jf-muted">(${Math.min(PAGE_SIZE, rest)} von ${rest} weiteren)</span></button><p class="jf-muted">${visible.length} von ${jobs.length} angezeigt</p>` : '';
    renderChips(); renderNotice();
  }
  function renderNotice() { const el = document.getElementById('jfNotice'); el.textContent = notice; el.hidden = !notice; }
  function preserveFocus(fn) {
    const active = document.activeElement, action = active?.dataset?.feedAction, id = active?.dataset?.feedId || active?.dataset?.jobLink;
    fn();
    if (!active || active.isConnected || !id) return;
    const next = document.querySelector(action ? `[data-feed-action="${cssEscape(action)}"][data-feed-id="${cssEscape(id)}"]` : `[data-job-link="${cssEscape(id)}"]`);
    next?.focus({ preventScroll: true });
  }
  const rerender = () => preserveFocus(() => { renderResults(); if (detail.id) renderDetail(); });

  /* ---------- Rendering: Quellen & Transparenz ---------- */
  function renderSourceStatus() {
    const target = document.getElementById('sourceStatus'); if (!target) return;
    const sources = snapshot ? [...snapshot.sources.values()] : [...catalog.values()].map(org => cleanSource(null, org)).filter(Boolean);
    const total = sources.length || snapshot?.run.total_sources || 85, checked = sources.filter(source => source.checked_at).length;
    const failed = sources.filter(source => source.status === 'error').length, partial = sources.filter(source => source.status === 'partial').length;
    const unsupported = sources.filter(source => source.status === 'unsupported' && !source.no_portal).length;
    const stale = sources.filter(isStale).length, pending = sources.filter(source => source.status === 'pending').length, noPortal = sources.filter(source => source.no_portal).length;
    const complete = sources.filter(isComplete).length, withMatches = sources.filter(source => source.relevant_job_count > 0).length;
    const latestAttempt = sources.map(source => source.checked_at).filter(Boolean).sort().at(-1) || null;
    const metrics = [[snapshot ? snapshot.scope.relevant_jobs : '–', 'Fachlich passende Stellen'], [`${complete}/${total}`, 'Quellen vollständig abgerufen'], [withMatches, 'Quellen mit passenden Stellen'], [total - complete, 'Nicht vollständig erfasst']];
    const neverRun = snapshot && !snapshot.run.started_at && !checked;
    const runNames = { pending: 'ausstehend', running: 'läuft', complete: 'abgeschlossen', partial: 'mit Einschränkungen', error: 'fehlgeschlagen' };
    const runInfo = snapshot?.run.started_at ? ` · Letzter Lauf: ${snapshot.run.checked_sources}/${snapshot.run.total_sources || total} Quellen versucht (${Object.hasOwn(runNames, snapshot.run.status) ? runNames[snapshot.run.status] : 'Status unbekannt'})` : '';
    const sorted = [...sources].sort((a, b) => b.relevant_job_count - a.relevant_job_count || a.name.localeCompare(b.name, 'de'));
    target.innerHTML = `<div class="jf-sources-view">
<div class="view-head"><div><p class="eyebrow">Transparenz</p><h2>Quellen &amp; Transparenz</h2><p>Woher die Stellen stammen, wie aktuell der Stand ist und welche Quellen nicht vollständig erfasst wurden.</p></div><button type="button" class="btn" data-feed-action="refresh"${loading ? ' disabled aria-busy="true"' : ' aria-busy="false"'}>${loading ? 'Stand wird geladen …' : 'Stand neu laden'}</button></div>
<div id="jfSourceSummary">
${loading ? '<p class="jf-state">Veröffentlichten Stand laden …</p>' : ''}${error ? `<p class="jf-error" role="alert">${esc(error)}${snapshot ? ' Der zuvor geladene Stand bleibt sichtbar.' : ' Es werden keine aktuellen Stellen behauptet. Bitte später erneut laden.'}</p>` : ''}
<div class="jf-metrics">${metrics.map(([number, label]) => `<div><strong>${esc(number)}</strong><span>${esc(label)}</span></div>`).join('')}</div>
<p class="jf-updated">${snapshot ? `Veröffentlicht: ${esc(dateTime(snapshot.generated_at))} · Letzter Quellenversuch: ${esc(dateTime(latestAttempt))}${esc(runInfo)}${neverRun ? ' · Noch kein serverseitiger Abruf durchgeführt.' : ''}` : 'Noch kein öffentlicher Stand geladen.'}</p>
<p class="jf-updated">${checked}/${total} Quellen bisher geprüft · ${partial} teilweise erfasst · ${unsupported} technisch nicht erfasst · ${failed} Abruffehler · ${noPortal} ohne Stellenportal · ${pending} Noch ungeprüft${stale ? ` · ${stale} mit älteren Funden` : ''}</p>
${snapshot?.scope.excluded_jobs ? `<p class="jf-scope-summary">${snapshot.scope.excluded_jobs} fachfremde oder fachlich nicht eindeutig belegte Inserate ausgeblendet. Die Stellenzahl sagt nichts über die Vollständigkeit der Quellen aus.</p>` : ''}
${snapshot?.duplicates ? `<p class="jf-updated">${snapshot.duplicates} mehrfach veröffentlichte Inserate (gleiche Stelle unter mehreren Adressen, Sprachen oder Portalen) wurden zusammengeführt.</p>` : ''}
${snapshot?.ignored ? `<p class="jf-updated">${snapshot.ignored} ungültige oder doppelte Einträge wurden ausgeblendet.</p>` : ''}
</div>
<div class="jf-explain">
<section class="panel"><h3>Fachlicher Filter</h3><p>Gezeigt werden Stellen in Gesundheitsökonomie / HTA, Gesundheitspolitik, Public Health, Versorgungsforschung, Gesundheitsmanagement und Gesundheitsdaten. Gefiltert wird nach Aufgaben und Anforderungen im Inserat. Ein Arbeitgeber im Gesundheitswesen allein genügt nicht.</p></section>
<section class="panel"><h3>Was „vollständig abgerufen“ heisst</h3><p class="jf-source-help">Vollständig abgerufen bedeutet: Die Quelle wurde innerhalb der letzten 48 Stunden ohne offene Seiten oder Abruffehler erfasst. Das ist unabhängig davon, ob fachlich passende Stellen gefunden wurden. Ein Abruffehler oder eine nicht unterstützte Quelle ist keine Aussage über offene Stellen. Ältere bestätigte Funde bleiben gekennzeichnet sichtbar.</p></section>
<section class="panel"><h3>Aktualisierung</h3><p>„Stand neu laden“ lädt den zuletzt veröffentlichten Abruf. Ein neuer Quellenabruf läuft serverseitig nach Zeitplan. Fristen, Lohn und Karrierestufe werden aus dem Inserat gelesen und können fehlen oder ungenau sein.</p></section>
</div>
<section class="jf-source-section" aria-labelledby="jfSourcesHeading"><h3 id="jfSourcesHeading">Alle Quellen <span class="jf-muted">(${complete}/${total} vollständig abgerufen)</span></h3>
<div id="jfSources" class="jf-source-list">${sorted.map(source => {
      const completeSource = isComplete(source);
      const result = source.relevant_job_count ? `${source.relevant_job_count} fachlich passende Stellen` : completeSource ? 'Keine fachlich passenden Stellen im vollständigen Abruf' : 'Keine bestätigten passenden Funde; Angebot unbekannt';
      return `<article class="jf-source"><div><h4>${source.url ? `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.name)} <span aria-hidden="true">↗</span></a>` : esc(source.name)}</h4><p>${esc(result)}${source.raw_job_count ? ` · ${source.raw_job_count} Inserate erfasst · ${source.filtered_out_count} fachlich ausgeblendet` : ''}</p><p>Letzter Versuch: ${esc(dateTime(source.checked_at))} · Vollständig: ${esc(dateTime(source.last_complete_at))}</p>${source.message ? (source.message.length > 260 ? `<details class="jf-source-message"><summary>${esc(source.message.slice(0, 220).replace(/\s+\S*$/, ''))} … <span>Mehr anzeigen</span></summary><p>${esc(source.message)}</p></details>` : `<p>${esc(source.message)}</p>`) : ''}${source.coverage || source.pages_scanned || source.detail_pages_scanned ? `<p>${esc(coverageLabel(source.coverage))}${source.coverage ? ' · ' : ''}${source.pages_scanned} Übersichtsseiten · ${source.detail_pages_scanned} Detailseiten</p>` : ''}</div><div class="jf-source-badges"><span class="jf-badge jf-${source.status}">${esc(source.no_portal ? 'Kein Stellenportal' : completeSource ? 'Vollständig abgerufen' : statusNames[source.status])}</span>${isStale(source) ? '<span class="jf-badge jf-partial">Veralteter Stand</span>' : ''}</div></article>`;
    }).join('')}</div></section>
</div>`;
  }

  /* ---------- Full text (shards) ---------- */
  async function loadFull(job, controller, isCurrent) {
    const baseUrl = snapshot.url, source = snapshot.sources.get(job.org_id);
    let raw = shardCache.get(job.org_id);
    if (!raw) {
      raw = await readJson(shardUrl(job, baseUrl), MAX_SHARD_BYTES, controller);
      if (!isCurrent()) return null;
      if (!raw || raw.version !== 1 || raw.org_id !== job.org_id || raw.source?.org_id !== job.org_id || !Array.isArray(raw.jobs) || raw.jobs.length > MAX_SHARD_JOBS) throw new Error('Der Volltext gehört nicht zur angeforderten Quelle.');
      shardCache.set(job.org_id, raw);
    }
    const matches = raw.jobs.filter(item => item?.id === job.id);
    if (matches.length !== 1) throw new Error('Diese Stelle fehlt im aktuellen Volltext. Bitte den Stand neu laden.');
    const cleanSourceValue = cleanSource(raw.source), full = cleanPublicJob(matches[0], new Map([[source.org_id, cleanSourceValue || source]]), baseUrl, false);
    if (!full || full.org_id !== job.org_id || C.canonicalUrl(full.url) !== C.canonicalUrl(job.url)) throw new Error('Die Volltextdaten stimmen nicht mit der ausgewählten Stelle überein.');
    full.relevance = R.classify(full, catalog.get(full.org_id) || source);
    const facts = factsFor(factInput(full, matches[0]), [snapshot.given.get(job.id), cleanFacts(matches[0])], catalog.get(full.org_id));
    for (const key of FACT_KEYS) full[key] = facts[key] ?? job[key] ?? null;
    full.org_ids = [...job.org_ids]; full.categories = [...job.categories];
    return { full, source: cleanSourceValue || source, eligible: !!full.relevance.eligible };
  }
  async function importJob(jobId) {
    const job = findJob(jobId);
    if (!job || imports.has(job.id) || job.status === 'closed') return;
    const toggle = HJ('toggleSaved');
    if (!toggle && !HJ('importPublicJobs')) { notice = 'Deine persönliche Stellensuche ist noch nicht bereit. Bitte kurz warten und erneut versuchen.'; rerender(); return; }
    const owner = getOwner(), ownerGeneration = authEpoch, generation = epoch, id = job.id;
    const controller = new AbortController(); importControllers.add(controller); imports.add(id); notice = ''; rerender();
    const isCurrent = () => owner === getOwner() && ownerGeneration === authEpoch && generation === epoch;
    try {
      const loaded = await loadFull(job, controller, isCurrent);
      if (!loaded || !isCurrent()) return;
      if (!loaded.eligible) throw new Error('Im aktuellen Volltext ist der fachliche Bezug nicht mehr bestätigt. Bitte den Stand neu laden.');
      const result = toggle ? await toggle(loaded.full, loaded.source) : await window.HealthJobs.importPublicJobs([loaded.full], [loaded.source]);
      if (!isCurrent()) return;
      if (result?.error || (!toggle && result === false)) throw new Error('Die Stelle konnte nicht gemerkt werden.');
      localSaved.add(id); matchCache.delete(id);
      notice = 'Gemerkt und in deine Stellensuche übernommen. Du findest die Stelle unter „Meine Suche“.';
    } catch (err) { if (isCurrent()) notice = err.name === 'AbortError' ? 'Der Volltext konnte nicht rechtzeitig geladen werden. Bitte erneut versuchen.' : C.text(err.message, 500) || 'Der Volltext konnte nicht geladen werden.'; }
    finally { importControllers.delete(controller); if (isCurrent()) { imports.delete(id); rerender(); } }
  }
  async function toggleSave(jobId) {
    const job = findJob(jobId); if (!job || imports.has(job.id)) return;
    if (!isSavedJob(job.id)) return importJob(job.id);
    const toggle = HJ('toggleSaved');
    if (toggle) {
      try {
        const result = await toggle(job);
        if (result?.blocked) { notice = C.text(result.message, 300) || 'Diese Stelle hat bereits einen Bewerbungsstatus oder Notizen und bleibt deshalb gemerkt. Du findest sie unter «Meine Suche».'; rerender(); return; }
        if (result?.error) throw new Error();
        notice = 'Nicht mehr gemerkt.';
      } catch { notice = 'Die Stelle konnte nicht entfernt werden. Bitte erneut versuchen.'; }
    } else notice = 'Die Stelle bleibt in deiner Stellensuche. Entfernen kannst du sie unter „Meine Suche“.';
    localSaved.delete(job.id); rerender();
  }

  /* ---------- Job detail ---------- */
  const dialog = document.createElement('dialog');
  dialog.id = 'jfDetail'; dialog.className = 'jf-detail'; dialog.setAttribute('aria-labelledby', 'jfDetailTitle');
  dialog.innerHTML = '<div class="jf-detail-inner" id="jfDetailInner"></div>';
  document.body.appendChild(dialog);
  const dialogOpen = () => dialog.open || dialog.hasAttribute('open');
  function showDialog() {
    if (dialogOpen()) return;
    detail.returnFocus = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    try { if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); } catch { dialog.setAttribute('open', ''); }
    document.documentElement.classList.add('jf-noscroll');
  }
  /** Aggregator sources list many hiring employers: compare the employer, not the source. */
  const employerKey = job => C.normalize(job.organization).replace(/[^a-z0-9]+/g, ' ').trim();
  const sameEmployer = (a, b) => employerKey(a) === employerKey(b);
  function similarJobs(job) {
    const others = openJobs().filter(other => other.id !== job.id && other.relevance.category === job.relevance.category && ((job.canton && other.canton === job.canton) || sameEmployer(other, job)));
    const score = other => (job.canton && other.canton === job.canton ? 2 : 0) + (sameEmployer(other, job) ? 1 : 0) + (job.seniority && other.seniority === job.seniority ? 1 : 0);
    return others.sort((a, b) => score(b) - score(a) || recent(a, b)).slice(0, 5);
  }
  const miniList = jobs => `<ul class="jf-mini-list">${jobs.map(other => `<li><a href="${esc(jobHash(other.id))}" data-job-link="${esc(other.id)}"><strong>${esc(other.title)}</strong><span>${esc([other.organization, placeText(other), pensumText(other), other.deadline ? deadlineText(other.deadline) : ''].filter(Boolean).join(' · '))}</span></a></li>`).join('')}</ul>`;
  function renderDetail() {
    const inner = document.getElementById('jfDetailInner'); if (!inner || !detail.id) return;
    const job = findJob(detail.id);
    const close = `<button type="button" class="jf-icon-btn jf-detail-close" data-feed-action="close-detail" aria-label="Details schliessen">${icon.close}</button>`;
    if (!job) {
      const pending = loading || !snapshot && !error;
      inner.innerHTML = `<div class="jf-detail-top"><p class="eyebrow">Stelle</p>${close}</div>${pending ? '<h2 id="jfDetailTitle" tabindex="-1" class="visually-hidden">Stelle wird geladen</h2><div class="skeleton jf-sk-title" style="height:2rem;width:70%"></div><div class="skeleton jf-sk-meta"></div><div class="skeleton jf-sk-block"></div>' : `<h2 id="jfDetailTitle" tabindex="-1">Stelle nicht gefunden</h2><p class="jf-detail-lead">Diese Stelle ist im aktuellen veröffentlichten Stand nicht (mehr) enthalten. Möglicherweise wurde sie besetzt oder vom Arbeitgeber entfernt.</p><p><button type="button" class="btn btn-primary" data-feed-action="close-detail">Zu allen Stellen</button></p>`}`;
      setLd(null); document.title = `Stelle | ${BASE_TITLE}`;
      return;
    }
    const source = snapshot.sources.get(job.org_id), full = detail.full, facts = full || job, saved = isSavedJob(job.id), busy = imports.has(job.id), match = profileMatch(job);
    const org = catalog.get(job.org_id), employer = org ? `<a href="#arbeitgeber-${esc(org.id)}">${esc(job.organization)}</a>` : esc(job.organization);
    const relevance = job.relevance;
    const salary = [facts.salary_hint, salaryRangeText(facts.salary_range) && `${salaryRangeText(facts.salary_range)}${facts.salary_range.source ? ` · Quelle: ${facts.salary_range.source}` : ''}`].filter(Boolean);
    const start = facts.start_date ? (/^\d{4}-/.test(facts.start_date) ? shortDate(facts.start_date) : facts.start_date === 'sofort' ? 'Per sofort' : 'Nach Vereinbarung') : '';
    const row = (label, value, extra = '') => `<div class="jf-fact${extra}"><dt>${esc(label)}</dt><dd>${value || '<span class="jf-muted">Keine Angabe</span>'}</dd></div>`;
    const location = [job.location, facts.canton && !String(job.location).includes(CANTONS[facts.canton]) ? `Kanton ${CANTONS[facts.canton]}` : ''].filter(Boolean).join(' · ');
    const similar = similarJobs(job), employerJobs = openJobs().filter(other => other.id !== job.id && sameEmployer(other, job)), moreEmployer = employerJobs.filter(other => !similar.includes(other)).slice(0, 4);
    const alert = HJ('openAlertDialog');
    inner.innerHTML = `<div class="jf-detail-top"><p class="eyebrow">${esc(relevance.category)}</p>${close}</div>
<h2 id="jfDetailTitle" tabindex="-1">${esc(job.title)}</h2>
<p class="jf-detail-employer">${employer}${job.organization !== source.name ? ` <span class="jf-muted">· Quelle: ${esc(source.name)}</span>` : ''}</p>
<div class="jf-detail-actions">
<button type="button" class="btn jf-save-btn" data-feed-action="save" data-feed-id="${esc(job.id)}" aria-pressed="${saved}"${busy ? ' disabled aria-busy="true"' : ''}>${icon.star}${busy ? 'Wird gemerkt …' : saved ? 'Gemerkt' : 'Merken'}</button>
<a class="btn btn-primary" href="${esc(job.url)}" target="_blank" rel="noopener noreferrer">Original öffnen${icon.out}<span class="visually-hidden"> (neues Fenster)</span></a>
${alert ? `<button type="button" class="btn btn-ghost" data-feed-action="alert" data-feed-id="${esc(job.id)}">${icon.bell}Jobalarm für ähnliche Stellen</button>` : ''}
</div>
${notice && detail.id ? `<p class="jf-notice" role="status">${esc(notice)}</p>` : ''}
${match ? `<section class="jf-fit-box" aria-label="Passung zu deinem Profil"><p><strong>${match.score} % Passung</strong>${match.label ? ` · ${esc(match.label)}` : ''}</p>${match.reasons.length ? `<ul>${match.reasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul>` : ''}</section>` : ''}
<dl class="jf-facts">
${row('Ort / Kanton', esc(location))}
${row('Pensum', esc(pensumText(job)))}
${row('Karrierestufe', esc(SENIORITY_LABELS[facts.seniority] || ''))}
${row('Bewerbungsfrist', facts.deadline ? `<span class="jf-deadline${urgent(facts.deadline) ? ' is-urgent' : ''}">${esc(deadlineText(facts.deadline, true))}</span>` : '', urgent(facts.deadline) ? ' is-urgent' : '')}
${row('Stellenantritt', esc(start))}
${row('Lohn', salary.map(esc).join('<br>'))}
${row('Fachbereich', `${esc(relevance.category)}${relevance.reasons?.length ? `<ul class="jf-relevance">${relevance.reasons.slice(0, 3).map(reason => `<li>${esc(reason)}</li>`).join('')}</ul>` : ''}`, ' jf-fact-wide')}
${row('Im Feed', `Erstmals gefunden ${esc(date(job.first_seen))} · Zuletzt bestätigt ${esc(date(job.last_seen))}${isStale(source) ? ' · Älterer Quellenstand' : ''}`, ' jf-fact-wide')}
</dl>
<section class="jf-description" aria-labelledby="jfDescHeading"><h3 id="jfDescHeading">Stellenbeschreibung</h3><div id="jfDetailText" class="jf-detail-text"></div></section>
${similar.length ? `<section class="jf-related" aria-labelledby="jfSimilarHeading"><h3 id="jfSimilarHeading">Ähnliche Stellen</h3>${miniList(similar)}</section>` : ''}
${employerJobs.length ? `<section class="jf-related" aria-labelledby="jfEmployerHeading"><h3 id="jfEmployerHeading">Mehr von ${esc(job.organization)}</h3>${moreEmployer.length ? miniList(moreEmployer) : ''}<button type="button" class="jf-link-btn" data-feed-action="employer-jobs" data-feed-id="${esc(job.id)}">Alle ${employerJobs.length + 1} Stellen von ${esc(job.organization)} anzeigen</button></section>` : ''}
<p class="jf-detail-note">Angaben ohne Gewähr. Frist, Lohn und Karrierestufe werden automatisch aus dem Inserat gelesen – bitte im Originalinserat prüfen.</p>`;
    const text = document.getElementById('jfDetailText');
    if (full) renderText(text, full.description || '');
    else if (detail.loading) { text.innerHTML = '<div class="skeleton jf-sk-line"></div><div class="skeleton jf-sk-line"></div><div class="skeleton jf-sk-line" style="width:60%"></div>'; text.setAttribute('aria-busy', 'true'); }
    else {
      const p = document.createElement('p'); p.className = 'jf-muted'; p.textContent = detail.error ? `${detail.error} Hier der Auszug aus der Übersicht:` : 'Auszug aus der Übersicht:';
      text.append(p); renderText(text, job.description || '', true);
    }
    document.title = `${job.title} – ${job.organization} | ${BASE_TITLE}`;
    setLd(full ? jobPostingLd(job, full) : jobPostingLd(job, null));
    if (dialogOpen() && !dialog.contains(document.activeElement)) document.getElementById('jfDetailTitle')?.focus({ preventScroll: true });
  }
  /** Paragraphs, headings and bullet lists from plain text; nodes only, never HTML. */
  function renderText(container, value, append) {
    if (!append) container.replaceChildren();
    const make = (tag, content) => { const node = document.createElement(tag); if (content != null) node.textContent = content; return node; };
    const blocks = String(value || '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/);
    for (const block of blocks) {
      const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
      let list = null, para = null;
      lines.forEach((line, index) => {
        const bullet = line.match(/^(?:[•●▪◦‣·]\s*|[*–-]\s+)(.+)$/);
        if (bullet) { para = null; if (!list) { list = make('ul'); container.append(list); } list.append(make('li', bullet[1])); return; }
        list = null;
        const heading = line.length <= 80 && (/:$/.test(line) || (line.length <= 48 && line.split(/\s+/).length <= 6 && !/[.,;!?)]$/.test(line) && (index < lines.length - 1 || lines.length === 1)));
        if (heading) { para = null; container.append(make('h4', line.replace(/:$/, ''))); return; }
        if (!para) { para = make('p'); container.append(para); } else para.append(document.createElement('br'));
        para.append(document.createTextNode(line));
      });
    }
  }
  function jobPostingLd(job, full) {
    const facts = full || job, org = catalog.get(job.org_id), sameAs = C.safeUrl(org?.main);
    const text = String((full || job).description || '').replace(/[•●▪◦‣]/g, '-').trim(), locality = String(job.location || '').split(/[,;/]/)[0].trim();
    const ld = { '@context': 'https://schema.org', '@type': 'JobPosting', title: job.title, description: text || job.title, directApply: false,
      url: location.origin + location.pathname + jobHash(job.id),
      hiringOrganization: { '@type': 'Organization', name: job.organization, ...(sameAs ? { sameAs } : {}) },
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', ...(locality ? { addressLocality: locality } : {}), ...(facts.canton ? { addressRegion: facts.canton } : {}), addressCountry: 'CH' } } };
    if (job.first_seen) ld.datePosted = job.first_seen.slice(0, 10);
    if (facts.deadline) ld.validThrough = facts.deadline;
    if (job.workload_max != null) ld.employmentType = job.workload_max >= 80 ? 'FULL_TIME' : 'PART_TIME';
    const range = facts.salary_range;
    if (range && (range.min != null || range.max != null)) ld.baseSalary = { '@type': 'MonetaryAmount', currency: range.currency || 'CHF', value: { '@type': 'QuantitativeValue', ...(range.min != null ? { minValue: range.min } : {}), ...(range.max != null ? { maxValue: range.max } : {}), unitText: { year: 'YEAR', month: 'MONTH', hour: 'HOUR' }[range.period] || 'YEAR' } };
    return ld;
  }
  function setLd(data) {
    let script = document.getElementById('jobPostingLd');
    if (!data) { script?.remove(); return; }
    if (!script) { script = document.createElement('script'); script.type = 'application/ld+json'; script.id = 'jobPostingLd'; document.head.appendChild(script); }
    script.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
  }
  async function loadDetailText() {
    const job = findJob(detail.id); if (!job) return;
    if (detail.full?.id === job.id) return;
    detail.controller?.abort(); const controller = detail.controller = new AbortController();
    const generation = ++detail.generation, feedGeneration = epoch;
    const isCurrent = () => generation === detail.generation && feedGeneration === epoch && detail.id === job.id;
    detail.loading = true; detail.error = ''; renderDetail();
    try {
      const loaded = await loadFull(job, controller, isCurrent);
      if (!loaded || !isCurrent()) return;
      detail.full = loaded.full;
    } catch (err) { if (isCurrent()) detail.error = err.name === 'AbortError' ? 'Der Volltext konnte nicht rechtzeitig geladen werden.' : C.text(err.message, 300) || 'Der Volltext konnte nicht geladen werden.'; }
    finally { if (isCurrent()) { detail.loading = false; preserveFocus(renderDetail); } }
  }
  function openDetail(id) {
    const job = findJob(id), resolved = job ? job.id : id;
    const same = detail.id === resolved && dialogOpen();
    if (!same) { detail.id = resolved; detail.full = null; detail.error = ''; detail.loading = false; detail.controller?.abort(); notice = ''; }
    showDialog(); renderDetail();
    if (!same) { dialog.scrollTop = 0; document.getElementById('jfDetailTitle')?.focus({ preventScroll: true }); }
    if (job) loadDetailText();
  }
  function closeDetail() {
    if (!detail.id && !dialogOpen()) return;
    const id = detail.id;
    detail.id = ''; detail.full = null; detail.controller?.abort(); detail.generation++;
    try { if (typeof dialog.close === 'function' && dialog.open) dialog.close(); } catch { /* jsdom */ }
    dialog.removeAttribute('open');
    document.documentElement.classList.remove('jf-noscroll');
    setLd(null);
    const target = mount.querySelector(`[data-job-link="${cssEscape(id)}"]`) || (detail.returnFocus?.isConnected ? detail.returnFocus : null);
    detail.returnFocus = null;
    target?.focus({ preventScroll: false });
  }
  /** Leaves the detail URL; the resulting route change closes the dialog. */
  function requestClose() {
    if (detail.fromList && history.length > 1) { detail.fromList = false; history.back(); return; }
    detail.fromList = false;
    if (typeof window.SiteRouter?.go === 'function') window.SiteRouter.go('#stellen');
    else { location.hash = '#stellen'; closeDetail(); if (urlAfterClose) { urlAfterClose = false; writeUrl(); } }
  }
  dialog.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); requestClose(); return; }
    if (event.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')].filter(el => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) return;
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement) || document.activeElement.id === 'jfDetailTitle')) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) requestClose(); else onClick(event); });

  /* ---------- Loading ---------- */
  async function refresh() {
    const generation = ++epoch; indexController?.abort(); indexController = new AbortController();
    for (const controller of importControllers) controller.abort();
    detail.controller?.abort();
    imports.clear(); shardCache.clear(); loading = true; error = ''; notice = ''; renderStatus(); renderResults();
    let loaded = false;
    try {
      const url = configuredUrl(), raw = await readJson(url, MAX_INDEX_BYTES, indexController);
      if (generation !== epoch) return;
      snapshot = validateIndex(raw, url); matchCache = new Map(); loaded = true;
      if (filters.employer && !snapshot.sources.has(filters.employer)) filters.employer = '';
    } catch (err) {
      if (generation !== epoch) return;
      error = err.name === 'AbortError' ? 'Der Abruf dauerte zu lange. Bitte erneut versuchen.' : C.text(err.message, 500) || 'Der öffentliche Stand konnte nicht geladen werden.';
    } finally {
      if (generation === epoch) {
        loading = false; renderFilters(); renderStatus(); renderResults();
        if (detail.id) { detail.full = null; openDetail(detail.id); }
        if (loaded) window.dispatchEvent(new CustomEvent('publicfeed:loaded', { detail: { count: snapshot.scope.relevant_jobs, generatedAt: snapshot.generated_at } }));
        else if (!snapshot) window.dispatchEvent(new CustomEvent('publicfeed:loaded', { detail: { count: null, generatedAt: null, error } }));
      }
    }
  }

  /* ---------- Interaction ---------- */
  function setFilter(key, value, { fromHeader = false } = {}) {
    if (!Object.hasOwn(filters, key)) return;
    const next = String(value ?? '').slice(0, 300);
    if (filters[key] === next) return;
    filters[key] = next; if (key !== 'sort') page = 1;
    if (key === 'q') {
      const input = document.getElementById('jfQuery'); if (input && input.value !== next) input.value = next;
      if (!fromHeader) window.dispatchEvent(new CustomEvent('publicfeed:query', { detail: { q: next } }));
    }
    renderResults();
    if (key === 'q') scheduleUrl(); else writeUrl();
  }
  function resetFilters() {
    const hadQuery = !!filters.q;
    for (const key of Object.keys(FILTER_LABELS)) filters[key] = '';
    page = 1; document.getElementById('jfQuery').value = '';
    renderFilters(); renderResults(); writeUrl();
    if (hadQuery) window.dispatchEvent(new CustomEvent('publicfeed:query', { detail: { q: '' } }));
  }
  function setSheet(open) {
    sheetOpen = open;
    const shell = mount.querySelector('.jf-shell'), toggle = mount.querySelector('[data-feed-action="open-filters"]');
    shell.classList.toggle('filters-open', open); toggle.setAttribute('aria-expanded', String(open));
    mount.querySelector('.jf-sheet-backdrop').hidden = !open;
    document.documentElement.classList.toggle('jf-noscroll', open || dialogOpen());
    document.documentElement.classList.toggle('jf-sheet-open', open);
    if (open) { const count = filteredJobs().length; document.getElementById('jfSheetApply').textContent = `${count} ${count === 1 ? 'Stelle' : 'Stellen'} anzeigen`; document.getElementById('jfQuery').focus(); }
    else toggle.focus({ preventScroll: true });
  }
  function onClick(event) {
    const link = event.target.closest('[data-job-link]');
    if (link && !event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) { detail.fromList = true; return; }
    const button = event.target.closest('[data-feed-action]'); if (!button) return;
    const action = button.dataset.feedAction, id = button.dataset.feedId;
    if (action === 'refresh') refresh();
    else if (action === 'save' || action === 'import') toggleSave(id);
    else if (action === 'reset') resetFilters();
    else if (action === 'clear-filter') { const key = button.dataset.filterKey; if (Object.hasOwn(FILTER_LABELS, key)) { if (key === 'q') setFilter('q', ''); else { filters[key] = ''; page = 1; renderFilters(); renderResults(); writeUrl(); } document.getElementById('jfResultsCount').focus?.(); } }
    else if (action === 'more') { const before = page * PAGE_SIZE; page++; renderResults(); writeUrl(); mount.querySelectorAll('.jf-job-link')[before]?.focus({ preventScroll: false }); }
    else if (action === 'more-filters') { moreOpen = !moreOpen; renderMoreToggle(); if (moreOpen) document.getElementById('jfEmployer').focus(); }
    else if (action === 'density') { density = button.dataset.density === 'list' ? 'list' : 'cards'; try { window.localStorage.setItem(DENSITY_KEY, density); } catch { /* optional */ } mount.querySelector('.jf-shell').classList.toggle('is-list', density === 'list'); mount.querySelectorAll('[data-feed-action="density"]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.density === density))); }
    else if (action === 'shortcuts') toggleShortcuts();
    else if (action === 'open-filters') setSheet(true);
    else if (action === 'close-filters') setSheet(false);
    else if (action === 'close-detail') requestClose();
    else if (action === 'alert') { const job = findJob(id), fn = HJ('openAlertDialog'); if (job && fn) { try { fn({ focus: job.relevance.category, canton: job.canton || '' }); } catch { /* optional */ } } }
    else if (action === 'employer-jobs') {
      const job = findJob(id); if (!job) return;
      const source = snapshot.sources.get(job.org_id), ownSource = employerKey({ organization: source.name }) === employerKey(job) || openJobs().every(other => other.org_id !== job.org_id || sameEmployer(other, job));
      for (const key of Object.keys(FILTER_LABELS)) filters[key] = '';
      // Own portal: filter by employer. Aggregator: search the hiring employer's name.
      if (ownSource) { filters.employer = job.org_id; moreOpen = true; } else filters.q = job.organization.slice(0, 300);
      page = 1; document.getElementById('jfQuery').value = filters.q; renderFilters(); renderResults(); urlAfterClose = true; requestClose();
      window.dispatchEvent(new CustomEvent('publicfeed:query', { detail: { q: filters.q } }));
    }
  }
  function toggleShortcuts(force) {
    const button = mount.querySelector('[data-feed-action="shortcuts"]'), pop = document.getElementById('jfShortcuts');
    const open = force ?? pop.hidden; pop.hidden = !open; button.setAttribute('aria-expanded', String(open));
  }
  mount.addEventListener('submit', event => { event.preventDefault(); if (sheetOpen) setSheet(false); });
  mount.addEventListener('input', event => {
    const field = event.target.dataset.feedFilter;
    if (!Object.hasOwn(filters, field) || event.target.tagName === 'SELECT') return;
    setFilter(field, event.target.value);
    if (sheetOpen) { const count = filteredJobs().length; document.getElementById('jfSheetApply').textContent = `${count} ${count === 1 ? 'Stelle' : 'Stellen'} anzeigen`; }
  });
  mount.addEventListener('change', event => {
    const field = event.target.dataset.feedFilter;
    if (!Object.hasOwn(filters, field) || event.target.tagName !== 'SELECT') return;
    setFilter(field, event.target.value);
    renderMoreToggle();
    if (sheetOpen) { const count = filteredJobs().length; document.getElementById('jfSheetApply').textContent = `${count} ${count === 1 ? 'Stelle' : 'Stellen'} anzeigen`; }
  });
  mount.addEventListener('click', onClick);
  mount.addEventListener('keydown', event => {
    if (!sheetOpen) return;
    if (event.key === 'Escape') { event.preventDefault(); setSheet(false); return; }
    if (event.key !== 'Tab') return;
    const items = [...document.getElementById('jfToolbar').querySelectorAll('input, select, button:not([disabled])')].filter(el => !el.closest('[hidden]') && el.getClientRects().length);
    if (!items.length) return;
    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
  });
  document.getElementById('sourceStatus')?.addEventListener('click', onClick);
  document.addEventListener('click', event => { const pop = document.getElementById('jfShortcuts'); if (pop && !pop.hidden && !event.target.closest('.jf-keys')) toggleShortcuts(false); });

  /* Keyboard shortcuts for the list (j/k, Enter/o, m, Shift+O, ?). */
  const feedVisible = () => !mount.closest('[hidden]') && (!document.body.dataset.view || document.body.dataset.view === 'stellen');
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || !feedVisible()) return;
    const t = event.target, editing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (editing || dialogOpen() || sheetOpen || document.querySelector('dialog[open], .profile-modal.open, .auth-modal.open')) return;
    const pop = document.getElementById('jfShortcuts');
    if (event.key === 'Escape' && pop && !pop.hidden) { toggleShortcuts(false); mount.querySelector('[data-feed-action="shortcuts"]').focus(); return; }
    if (event.key === '?') { event.preventDefault(); toggleShortcuts(); return; }
    const cards = [...mount.querySelectorAll('.jf-job[data-job-id]')]; if (!cards.length) return;
    const current = t?.closest?.('.jf-job[data-job-id]'), index = current ? cards.indexOf(current) : -1;
    if (event.key === 'j' || event.key === 'k') {
      event.preventDefault();
      const next = cards[event.key === 'j' ? Math.min(cards.length - 1, index + 1) : Math.max(0, index < 0 ? 0 : index - 1)];
      const link = next.querySelector('.jf-job-link'); link.focus({ preventScroll: true });
      next.scrollIntoView?.({ block: 'nearest', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth' });
      return;
    }
    if (!current) return;
    const id = current.dataset.jobId, job = findJob(id); if (!job) return;
    if (event.key === 'o' && !event.shiftKey) { event.preventDefault(); detail.fromList = true; location.hash = jobHash(id); }
    else if (event.key === 'm') { event.preventDefault(); toggleSave(id); }
    else if (event.key === 'O' && event.shiftKey) { event.preventDefault(); window.open(job.url, '_blank', 'noopener,noreferrer'); }
  });

  window.addEventListener('site:route', event => {
    const route = event.detail || {};
    if (route.sub === 'stelle' && typeof route.param === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}:[a-z0-9]{1,100}$/.test(route.param)) openDetail(route.param);
    else if (detail.id || dialogOpen()) { detail.fromList = false; closeDetail(); }
    if (route.sub !== 'stelle' && urlAfterClose) { urlAfterClose = false; writeUrl(); }
  });
  window.addEventListener('site:search', event => { setFilter('q', typeof event.detail?.q === 'string' ? event.detail.q.trim() : '', { fromHeader: true }); writeUrl(); });
  window.addEventListener('healthjobs:auth', () => { authEpoch++; for (const controller of importControllers) controller.abort(); imports.clear(); localSaved.clear(); matchCache = new Map(); notice = ''; dropUnavailableSort(); renderFilters(); rerender(); });
  const dropUnavailableSort = () => { if (filters.sort === 'passung' && snapshot && !matchAvailable()) { filters.sort = 'neu'; writeUrl(); } };
  for (const name of ['healthjobs:profile-changed', 'healthjobs:saved-changed']) window.addEventListener(name, () => { matchCache = new Map(); if (name.endsWith('profile-changed')) { dropUnavailableSort(); renderFilters(); } rerender(); });

  const copyJob = job => ({ ...job, org_ids: [...job.org_ids], categories: [...job.categories], relevance: { ...job.relevance, reasons: [...(job.relevance.reasons || [])] }, salary_range: job.salary_range ? { ...job.salary_range } : null, duplicate_ids: [...(job.duplicate_ids || [])] });
  const sourceCopies = () => snapshot ? [...snapshot.sources.values()].map(source => ({ ...source })) : [];
  window.PublicJobFeed = {
    refresh, importJob, toggleSaved: toggleSave, openDetail: id => { detail.fromList = true; location.hash = jobHash(id); },
    getJobs: () => filteredJobs().map(copyJob), getAllJobs: () => openJobs().map(copyJob),
    getSourceStatus: sourceCopies, getSources: sourceCopies,
    getFilters: () => ({ ...filters, page }), isLoaded: () => !!snapshot
  };
  readUrl(); renderShell();
  if (filters.q) window.dispatchEvent(new CustomEvent('publicfeed:query', { detail: { q: filters.q } }));
  // Scripts after feed.js establish the personal workspace before network completion.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => refresh(), { once: true });
  else Promise.resolve().then(() => refresh());
})();
