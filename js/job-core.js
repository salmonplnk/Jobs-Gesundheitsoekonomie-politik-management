/* Pure data operations shared by the workspace and its regression tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JobCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const normalize = value => String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss');
  const now = () => new Date().toISOString();
  const text = (v, max = 30000) => typeof v === 'string' ? v.slice(0, max) : Array.isArray(v) ? v.map(x => text(x, 200)).join(', ') : '';
  const stages = { interested: 'Interessant', preparing: 'In Vorbereitung', applied: 'Beworben', interview: 'Gespräch', offer: 'Angebot', rejected: 'Absage', withdrawn: 'Zurückgezogen' };
  // Feed/backend keys -> readable labels. "entry" only occurs in older stored data.
  const seniorityLabels = { praktikum: 'Praktikum', trainee: 'Trainee', junior: 'Junior', senior: 'Senior', lead: 'Leitung', phd: 'PhD / Doktorat', entry: 'Berufseinstieg' };
  const roles = ['Gesundheitsökonomie / HTA', 'Projektmanagement', 'Forschung / PhD', 'Data / Analytics', 'Gesundheitspolitik', 'Management', 'Weitere'];
  function safeUrl(value) {
    try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
  }
  function canonicalUrl(value) {
    const safe = safeUrl(value); if (!safe) return '';
    const u = new URL(safe); if (!/^#(!?\/|.*(?:job|vacanc|stelle).*\d)/i.test(u.hash)) u.hash = '';
    [...u.searchParams.keys()].forEach(k => { if (/^(utm_|fbclid$|gclid$)/i.test(k)) u.searchParams.delete(k); });
    u.searchParams.sort(); return u.href.replace(/\/$/, '');
  }
  function hash(value) { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(36); }
  const safeKey = value => typeof value === 'string' && value.length > 0 && value.length <= 180 && !['__proto__', 'prototype', 'constructor'].includes(value);
  function identity(job) { return (safeKey(job.id) ? job.id : '') || 'job_' + hash(canonicalUrl(job.url) || `${job.organization}|${job.title}|${job.location}`); }
  function workload(value) {
    const m = text(value).match(/(\d{1,3})\s*(?:[–−—-]|bis|to)\s*(\d{1,3})\s*%/i);
    if (m) { const a = +m[1], b = +m[2]; if (a >= 0 && a <= b && b <= 100) return [a, b]; }
    const single = text(value).match(/\b(\d{1,3})\s*%/); return single && +single[1] <= 100 ? [+single[1], +single[1]] : null;
  }
  function classifyRole(job) {
    const t = normalize(job.title);
    if (/hta|health econom|gesundheits.okonom|heor/.test(t)) return roles[0];
    if (/projekt|project|programm|program manager/.test(t)) return roles[1];
    if (/phd|doktor|research|forsch|wissenschaft|postdoc/.test(t)) return roles[2];
    if (/data|daten|analytics|statist|biometr/.test(t)) return roles[3];
    if (/politik|policy|public affairs/.test(t)) return roles[4];
    if (/leiter|leitung|director|manager|head of|geschaftsfuhr/.test(t)) return roles[5];
    return roles[6];
  }
  function cleanJob(raw, timestamp = now()) {
    if (!raw || typeof raw !== 'object' || !text(raw.title).trim()) return null;
    const url = safeUrl(raw.url); if (!url) return null;
    const job = {};
    for (const k of ['title', 'organization', 'org_id', 'description', 'pensum', 'location', 'languages', 'salary_hint', 'deadline', 'employment_type', 'seniority', 'requirements', 'source_type']) job[k] = text(raw[k]);
    job.url = url; job.source_url = safeUrl(raw.source_url) || url; job.id = identity({ ...raw, url });
    job.remote_mode = ['remote', 'hybrid', 'onsite'].includes(raw.remote_mode) ? raw.remote_mode : 'unknown';
    const roleMap = { 'health-economics': roles[0], 'project-management': roles[1], research: roles[2], 'data-analytics': roles[3], 'public-health': roles[4] };
    job.role = roles.includes(raw.role) ? raw.role : roleMap[raw.role] || classifyRole(job);
    const languageMap = { DE: 'Deutsch', FR: 'Französisch', IT: 'Italienisch', EN: 'Englisch' };
    job.languages = job.languages.replace(/\b(DE|FR|IT|EN)\b/g, k => languageMap[k]);
    job.seniority = seniorityLabels[job.seniority] || job.seniority;
    const contractMap = { permanent: 'Unbefristet', temporary: 'Befristet', internship: 'Praktikum' };
    job.employment_type = contractMap[job.employment_type] || job.employment_type;
    job.description_truncated = !!raw.description_truncated;
    const validRange = Number.isFinite(raw.workload_min) && Number.isFinite(raw.workload_max) && raw.workload_min >= 0 && raw.workload_max <= 100 && raw.workload_min <= raw.workload_max;
    const range = validRange ? [raw.workload_min, raw.workload_max] : workload(job.pensum);
    job.workload_min = range ? range[0] : null; job.workload_max = range ? range[1] : null;
    job.status = raw.status === 'closed' ? 'closed' : 'open';
    job.fetched_at = Number.isFinite(Date.parse(raw.fetched_at)) ? raw.fetched_at : timestamp;
    return job;
  }
  const sanitizeCriteria = value => Array.isArray(value) ? value.filter(c => c && typeof c === 'object' && ['keywords', 'location', 'workload', 'remote_mode', 'languages', 'seniority', 'employment_type', 'exclude'].includes(c.field)).map(c => ({ field: c.field, label: text(c.label, 150), value: text(c.value, 400), mode: ['must', 'wish', 'off'].includes(c.mode) ? c.mode : 'wish', weight: Math.max(1, Math.min(5, Number(c.weight) || 1)) })) : [];
  function emptyState() { return { version: 1, jobs: Object.create(null), sources: Object.create(null), searchProfiles: [], applications: Object.create(null), drafts: Object.create(null), sender: {}, runs: [], queue: null, criteria: [], filters: {}, lastVisitAt: null }; }
  function hydrate(value) {
    const base = emptyState(); if (!value || typeof value !== 'object' || Array.isArray(value)) return base;
    const entries = record => record && typeof record === 'object' && !Array.isArray(record) ? Object.entries(record).filter(([k]) => safeKey(k)) : [];
    for (const [key, raw] of entries(value.jobs)) {
      const job = cleanJob(raw); if (!job) continue;
      if (raw.assessment && typeof raw.assessment === 'object' && Array.isArray(raw.assessment.criteria)) job.assessment = raw.assessment;
      if (raw.assessment_context) job.assessment_context = text(raw.assessment_context, 100);
      base.jobs[key] = { ...job, id: key, first_seen: text(raw.first_seen) || now(), last_seen: text(raw.last_seen) || now(), seen_at: text(raw.seen_at) || null, changed_at: text(raw.changed_at) || null,
        change_fields: Array.isArray(raw.change_fields) ? raw.change_fields.filter(x => typeof x === 'string') : [],
        changes: Array.isArray(raw.changes) ? raw.changes.filter(c => c && typeof c.at === 'string' && Array.isArray(c.fields)).map(c => ({ at: c.at, fields: c.fields.filter(x => typeof x === 'string') })).slice(-30) : [] };
    }
    for (const [key, raw] of entries(value.sources)) if (raw && typeof raw === 'object') base.sources[key] = {
      org_id: key, name: text(raw.name, 300), url: safeUrl(raw.url), status: ['pending','ok','empty','partial','error','unsupported'].includes(raw.status) ? raw.status : 'error',
      checked_at: text(raw.checked_at), last_success_at: text(raw.last_success_at), job_count: Math.max(0, Number(raw.job_count) || 0), message: text(raw.message, 2000), cached: !!raw.cached, stale: !!raw.stale,
      coverage: ['complete','partial','unknown'].includes(raw.coverage) ? raw.coverage : 'unknown', method: text(raw.method, 100),
      pages_scanned: Math.max(0, Number(raw.pages_scanned) || 0), detail_pages_scanned: Math.max(0, Number(raw.detail_pages_scanned) || 0), pending_pages: Math.max(0, Number(raw.pending_pages) || 0)
    };
    for (const [key, raw] of entries(value.applications)) if (base.jobs[key] && raw && typeof raw === 'object') base.applications[key] = Object.fromEntries(['contact','notes','next_step','next_date','applied_at','created_at','updated_at','saved_via'].map(k => [k, text(raw[k])]).concat([['stage', stages[raw.stage] ? raw.stage : 'interested']]));
    for (const [key, drafts] of entries(value.drafts)) if (base.jobs[key] && Array.isArray(drafts)) base.drafts[key] = drafts.filter(d => d && typeof d.text === 'string').map(d => ({ ...d, id: safeKey(d.id) ? d.id : 'draft_' + hash(d.text), name: text(d.name, 200), text: text(d.text, 50000), created_at: text(d.created_at), language: d.language === 'fr' ? 'fr' : 'de' }));
    if (value.sender && typeof value.sender === 'object') base.sender = Object.fromEntries(['name','address','postcode','city'].map(k => [k, text(value.sender[k], 500)]));
    if (Array.isArray(value.searchProfiles)) base.searchProfiles = value.searchProfiles.filter(p => p && safeKey(p.id) && typeof p.name === 'string' && Array.isArray(p.orgIds)).map(p => ({ id: p.id, name: text(p.name, 100), orgIds: p.orgIds.filter(safeKey), criteria: sanitizeCriteria(p.criteria), filters: p.filters && typeof p.filters === 'object' ? p.filters : {}, updated_at: text(p.updated_at), archived: !!p.archived }));
    if (Array.isArray(value.runs)) base.runs = value.runs.filter(r => r && safeKey(r.id)).map(r => ({ id: r.id, started_at: text(r.started_at), finished_at: text(r.finished_at), total: Math.max(0, Number(r.total) || 0), checked: Math.max(0, Number(r.checked) || 0), added: Math.max(0, Number(r.added) || 0), changed: Math.max(0, Number(r.changed) || 0), status: text(r.status, 50) })).slice(-100);
    base.criteria = sanitizeCriteria(value.criteria);
    for (const [k, v] of entries(value.filters)) if (typeof v === 'string' || typeof v === 'boolean') base.filters[k] = v;
    if (value.queue && safeKey(value.queue.id) && Array.isArray(value.queue.remaining)) base.queue = { id: value.queue.id, remaining: value.queue.remaining.filter(safeKey), refresh: !!value.queue.refresh, total: Math.max(value.queue.remaining.length, Number(value.queue.total) || 0), started_at: text(value.queue.started_at), message: text(value.queue.message, 2000), added: Math.max(0, Number(value.queue.added) || 0), changed: Math.max(0, Number(value.queue.changed) || 0) };
    base.lastVisitAt = typeof value.lastVisitAt === 'string' ? value.lastVisitAt : null;
    base.selectedOrgIds = Array.isArray(value.selectedOrgIds) ? value.selectedOrgIds.filter(safeKey) : undefined;
    base.criteriaConfigured = !!value.criteriaConfigured;
    base.activeSearchProfileId = safeKey(value.activeSearchProfileId) ? value.activeSearchProfileId : null;
    return base;
  }
  const trackedFields = ['title', 'description', 'pensum', 'location', 'languages', 'salary_hint', 'deadline', 'remote_mode', 'employment_type', 'status'];
  function ingest(state, rawJobs, sources = [], timestamp = now()) {
    let added = 0, changed = 0;
    for (const raw of rawJobs || []) {
      const job = cleanJob(raw, timestamp); if (!job) continue;
      // Different catalog entries may lead to the same vacancy URL.
      const previous = state.jobs[job.id] || Object.values(state.jobs).find(x => canonicalUrl(x.url) === canonicalUrl(job.url));
      if (previous) job.id = previous.id;
      const fields = previous ? trackedFields.filter(k => (previous[k] || '') !== (job[k] || '')) : [];
      state.jobs[job.id] = { ...previous, ...job, first_seen: previous?.first_seen || timestamp, last_seen: timestamp,
        seen_at: previous?.seen_at || null, changed_at: fields.length ? timestamp : previous?.changed_at || null,
        change_fields: fields.length ? fields : previous?.change_fields || [],
        changes: fields.length ? [...(previous?.changes || []), { at: timestamp, fields, before: Object.fromEntries(fields.filter(k => k !== 'description').map(k => [k, previous[k]])) }].slice(-30) : previous?.changes || [] };
      if (!previous) added++; else if (fields.length) changed++;
    }
    // Missing records and unavailable sources never imply closure.
    for (const source of sources) if (source && typeof source.org_id === 'string') state.sources[source.org_id] = { ...source, checked_at: source.checked_at || timestamp };
    return { added, changed };
  }
  function freshness(job, lastVisit) {
    if (job.status === 'closed') return 'closed';
    const since = Math.max(Date.parse(lastVisit) || 0, Date.parse(job.seen_at) || 0);
    if (Date.parse(job.first_seen) > since) return 'new';
    if (Date.parse(job.changed_at) > since) return 'changed';
    return 'seen';
  }
  const cityCantons = { BE: 'bern', ZH: 'zurich', BS: 'basel', BL: 'basel', LU: 'luzern', SG: 'st. gallen', AG: 'aarau', SO: 'solothurn', NE: 'neuenburg', GR: 'chur', ZG: 'zug', TG: 'frauenfeld', GE: 'genf', VD: 'lausanne', VS: 'wallis', FR: 'freiburg', SZ: 'schwyz', UR: 'altdorf' };
  function defaultCriteria(profile = {}) {
    const result = [];
    if (profile.keywords) result.push({ field: 'keywords', label: 'Fachliche Stichwörter', value: profile.keywords, mode: 'wish', weight: 3 });
    if (profile.desired_regions?.length && !profile.desired_regions.includes('*')) result.push({ field: 'location', label: 'Region', value: profile.desired_regions.filter(x => x !== 'remote').map(x => cityCantons[x] || x).join(', '), mode: 'wish', weight: 2 });
    if (profile.workload_min != null || profile.workload_max != null) result.push({ field: 'workload', label: 'Pensum', value: `${profile.workload_min ?? 0}-${profile.workload_max ?? 100}%`, mode: 'wish', weight: 2 });
    if (profile.desired_regions?.includes('remote')) result.push({ field: 'remote_mode', label: 'Arbeitsmodell', value: 'remote', mode: 'wish', weight: 2 });
    if (profile.exclusions_freetext) result.push({ field: 'exclude', label: 'Ausschlusswörter', value: profile.exclusions_freetext, mode: 'must', weight: 1 });
    return result.filter(x => x.value);
  }
  const split = s => normalize(s).split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
  function snippet(haystack, needle) { const pos = normalize(haystack).indexOf(normalize(needle)); return pos < 0 ? '' : text(haystack).slice(Math.max(0, pos - 55), pos + needle.length + 100); }
  function evaluate(job, criteria = [], documents = []) {
    let points = 0, possible = 0, known = 0;
    const result = criteria.filter(c => c && c.mode !== 'off' && c.value).map(c => {
      let status = 'unknown', evidence = '', profileEvidence = '';
      const terms = split(c.value), field = c.field;
      if (field === 'workload') {
        const desired = workload(c.value);
        if (desired && job.workload_min != null && job.workload_max != null) { status = job.workload_max >= desired[0] && job.workload_min <= desired[1] ? 'met' : 'unmet'; evidence = job.pensum || `${job.workload_min}–${job.workload_max}%`; }
      } else if (field === 'keywords' || field === 'exclude') {
        const content = `${job.title}\n${job.description || ''}`;
        const found = terms.filter(t => normalize(content).includes(t));
        if (found.length) { status = field === 'exclude' ? 'unmet' : 'met'; evidence = snippet(content, found[0]); }
        else if (job.description && !job.description_truncated) { status = field === 'exclude' ? 'met' : 'unmet'; evidence = 'Kein Texttreffer im erfassten Inserat.'; }
        if (field === 'keywords' && found.length) {
          const doc = documents.find(d => found.some(t => normalize(d.raw_text).includes(t)));
          if (doc) profileEvidence = snippet(doc.raw_text, found.find(t => normalize(doc.raw_text).includes(t)));
        }
      } else {
        const value = text(job[field]);
        if (value && value !== 'unknown') { status = terms.some(t => normalize(value).includes(t)) ? 'met' : 'unmet'; evidence = value; }
      }
      const weight = Math.max(1, Math.min(5, Number(c.weight) || 1));
      possible += weight; if (status !== 'unknown') known += weight; if (status === 'met') points += weight;
      return { ...c, status, evidence, profileEvidence };
    });
    return { criteria: result, score: possible ? Math.round(points / possible * 100) : null, coverage: possible ? Math.round(known / possible * 100) : 0, eligible: !result.some(c => c.mode === 'must' && c.status !== 'met') };
  }
  function filterJobs(jobs, filters = {}, state = emptyState(), criteria = []) {
    return jobs.filter(j => {
      const content = normalize(`${j.title} ${j.organization} ${j.description} ${j.location}`);
      if (filters.q && !normalize(filters.q).split(/\s+/).every(t => content.includes(t))) return false;
      for (const field of ['role', 'remote_mode', 'seniority', 'employment_type']) if (filters[field] && j[field] !== filters[field]) return false;
      for (const field of ['location', 'languages']) if (filters[field] && !normalize(j[field]).includes(normalize(filters[field]))) return false;
      if (filters.workload) { const r = workload(filters.workload); if (r && (j.workload_min == null || j.workload_max < r[0] || j.workload_min > r[1])) return false; }
      if (filters.freshness && freshness(j, state.lastVisitAt) !== filters.freshness) return false;
      if (!filters.showClosed && filters.freshness !== 'closed' && j.status === 'closed') return false;
      if (filters.saved && !state.applications[j.id]) return false;
      if (!filters.showIneligible && !evaluate(j, criteria).eligible) return false;
      return true;
    }).sort((a, b) => {
      if (filters.sort === 'deadline') return (Date.parse(a.deadline) || Infinity) - (Date.parse(b.deadline) || Infinity);
      if (filters.sort === 'organization') return a.organization.localeCompare(b.organization, 'de');
      if (filters.sort === 'score') return (evaluate(b, criteria).score ?? -1) - (evaluate(a, criteria).score ?? -1);
      return (Date.parse(b.first_seen) || 0) - (Date.parse(a.first_seen) || 0);
    });
  }
  function seniorityKey(value) {
    const n = normalize(value).trim(); if (!n) return null;
    for (const [key, label] of Object.entries(seniorityLabels)) if (n === key || n === normalize(label)) return key;
    return null;
  }
  /** ISO day (YYYY-MM-DD) of a deadline text, or null when it is not a plain date. */
  function deadlineDay(value) {
    const t = text(value, 100).trim(); let m;
    if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
    if ((m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
  }
  /** Whole days from today (local) until an ISO day; negative = past. */
  function daysUntil(day, today = new Date()) {
    if (!day) return null;
    const [y, mo, d] = day.split('-').map(Number), start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((new Date(y, mo - 1, d) - start) / 86400000);
  }

  // Deterministic personal fit: saved profile plus explicitly configured search criteria.
  // Unknown facts are left out (never counted as fit); the result says what was compared.
  const languageKeys = { deutsch: 'de', german: 'de', franzosisch: 'fr', french: 'fr', francais: 'fr', italienisch: 'it', italian: 'it', englisch: 'en', english: 'en' };
  const languageNames = { de: 'Deutsch', fr: 'Französisch', it: 'Italienisch', en: 'Englisch' };
  const experienceFit = {
    '0-2': { praktikum: 1, trainee: 1, junior: 1, entry: 1, phd: 1, senior: 0, lead: 0 },
    '2-5': { praktikum: 0, trainee: .5, junior: 1, entry: 1, phd: 1, senior: .5, lead: 0 },
    '5-10': { praktikum: 0, trainee: 0, junior: .5, entry: 0, phd: .5, senior: 1, lead: 1 },
    '10+': { praktikum: 0, trainee: 0, junior: 0, entry: 0, phd: 0, senior: 1, lead: 1 }
  };
  const exclusionPatterns = {
    administrativ: /sachbearbeit|administrat|sekretariat|assistenz|assistant/, klinisch: /pflege|arzt|arztin|klinisch|clinical|station|therapeut/,
    forschung: /forsch|research|wissenschaftl|postdoc|\bphd\b|doktorand/, it: /\bit\b|informatik|software|entwickler|developer|devops|system engineer/,
    management: /leiter|leitung|head of|manager|direktor|director|geschaftsfuhr/
  };
  const cantonCode = value => /^[A-Z]{2}$/.test(value || '') ? value : null;
  function profileConfigured(profile) {
    const p = profile && typeof profile === 'object' ? profile : {};
    return !!((Array.isArray(p.desired_regions) && p.desired_regions.length) || text(p.keywords).trim() || text(p.field_of_study).trim() || p.experience
      || (p.languages && typeof p.languages === 'object' && Object.keys(p.languages).length) || (Array.isArray(p.exclusions) && p.exclusions.length) || text(p.exclusions_freetext).trim()
      || (p.updated_at && (p.workload_min != null || p.workload_max != null)));
  }
  function profileMatch(job, profile = {}, options = {}) {
    if (!job || typeof job !== 'object') return null;
    const p = profile && typeof profile === 'object' ? profile : {};
    const criteria = Array.isArray(options.criteria) ? options.criteria.filter(c => c && c.mode !== 'off' && c.value) : [];
    if (!profileConfigured(p) && !criteria.length) return null;
    const factors = [], title = normalize(job.title), content = normalize(`${job.title}\n${job.relevance?.category || ''}\n${job.description || ''}`);
    const add = (weight, points, reason, kind) => factors.push({ weight, points, reason, kind });
    // Region
    const regions = Array.isArray(p.desired_regions) ? p.desired_regions : [];
    const cantons = regions.map(cantonCode).filter(Boolean), remoteOk = regions.includes('remote');
    if (cantons.length || remoteOk) {
      const canton = cantonCode(job.canton) || (typeof options.cantonOf === 'function' ? cantonCode(options.cantonOf(job.location)) : null);
      if (remoteOk && job.remote_mode === 'remote') add(3, 1, 'Remote möglich', 'location');
      else if (canton && cantons.includes(canton)) add(3, 1, `Arbeitsort in deiner Wunschregion (${canton})`, 'location');
      else if (remoteOk && job.remote_mode === 'hybrid') add(3, .5, 'Hybrid, teilweise remote', 'location');
      else if (canton && cantons.length) add(3, 0, `Arbeitsort ausserhalb deiner Wunschregion (${canton})`, 'location');
    }
    // Workload overlap
    const min = Number(p.workload_min), max = Number(p.workload_max);
    if (p.updated_at && Number.isFinite(min) && Number.isFinite(max) && job.workload_min != null && job.workload_max != null) {
      const range = job.workload_min === job.workload_max ? `${job.workload_min}%` : `${job.workload_min}–${job.workload_max}%`;
      if (job.workload_max >= min && job.workload_min <= max) add(2, 1, `Pensum ${range} passt`, 'workload');
      else add(2, 0, `Pensum ${range} ausserhalb deines Wunsches (${min}–${max}%)`, 'workload');
    }
    // Experience vs career level
    const level = seniorityKey(job.seniority) || (typeof options.seniorityOf === 'function' ? seniorityKey(options.seniorityOf(job)) : null);
    const fit = experienceFit[p.experience];
    if (fit && level) {
      const points = fit[level] ?? .5, label = seniorityLabels[level];
      add(2, points, points >= 1 ? `Karrierestufe ${label} passt zu deiner Erfahrung` : points > 0 ? `Karrierestufe ${label} passt teilweise` : `Karrierestufe ${label} passt nicht zu deiner Erfahrung`);
    }
    // Languages
    const spoken = p.languages && typeof p.languages === 'object' ? p.languages : {};
    if (Object.keys(spoken).length) {
      const required = [...new Set(normalize(job.languages).split(/[^a-z]+/).map(w => languageKeys[w]).filter(Boolean))];
      if (required.length) {
        const missing = required.filter(k => !spoken[k] || spoken[k] === 'grundkenntnisse');
        if (!missing.length) add(1, 1, `Sprachen passen (${required.map(k => languageNames[k]).join(', ')})`);
        else add(1, missing.length < required.length ? .5 : 0, `Verlangt ${missing.map(k => languageNames[k]).join(', ')}`);
      }
    }
    // Subject keywords and field of study
    const terms = [...new Set([...split(p.keywords), ...split(p.field_of_study).flatMap(t => t.split(/\s*(?:\/|\bund\b|&)\s*/))].map(t => t.trim()).filter(t => t.length >= 3))];
    if (terms.length) {
      const found = terms.filter(t => content.includes(t));
      if (found.length) add(3, 1, `Stichwort «${found[0]}» im Inserat`, 'keywords');
      else if ((job.description || '').length > 200) add(1.5, 0, 'Deine Stichwörter kommen im Inserat nicht vor', 'keywords');
    }
    // Explicit matching criteria from "Meine Suche"
    for (const c of evaluate(job, criteria).criteria) {
      if (c.status === 'unknown' || ['keywords', 'location', 'workload'].includes(c.field) && factors.some(f => f.kind === c.field)) continue;
      add(Math.max(1, Math.min(5, Number(c.weight) || 1)), c.status === 'met' ? 1 : 0, `${c.label || c.field}: ${c.status === 'met' ? 'erfüllt' : 'nicht erfüllt'}`, c.mode === 'must' && c.status !== 'met' ? 'must' : c.field);
    }
    // Exclusions cap the score; they never raise it.
    const excluded = [...split(p.exclusions_freetext).filter(t => t.length >= 3 && title.includes(t)).map(t => `Enthält dein Ausschlusswort «${t}»`),
      ...(Array.isArray(p.exclusions) ? p.exclusions : []).filter(k => exclusionPatterns[k]?.test(title)).map(k => `Bereich «${k}» möchtest du ausschliessen`)];
    const possible = factors.reduce((sum, f) => sum + f.weight, 0);
    if (!possible && !excluded.length) return null;
    let score = possible ? Math.round(factors.reduce((sum, f) => sum + f.weight * f.points, 0) / possible * 100) : 0;
    if (excluded.length) score = Math.min(score, 20);
    if (factors.some(f => f.kind === 'must')) score = Math.min(score, 40);
    const label = excluded.length ? 'Ausschlusskriterium' : score >= 80 ? 'Sehr gute Passung' : score >= 60 ? 'Gute Passung' : score >= 40 ? 'Teilweise passend' : 'Wenig Passung';
    const ordered = [...factors].sort((a, b) => b.points - a.points || b.weight - a.weight);
    const reasons = [...excluded, ...ordered.filter(f => f.points >= .5).slice(0, 3).map(f => f.reason), ...ordered.filter(f => f.points < .5).slice(0, 2).map(f => f.reason)].slice(0, 5);
    return { score, label, level: excluded.length || score < 40 ? 'low' : score < 70 ? 'medium' : 'high', reasons, compared: factors.length };
  }

  // Same rules as the e-mail sender (DOKUMENTATION.md, «E-Mail-Jobalarme»), for previews.
  function matchesAlert(job, filters = {}, context = {}) {
    if (!job || job.status === 'closed') return false;
    const f = filters || {};
    if (f.q) { const hay = normalize(`${job.title} ${job.organization} ${job.description || ''} ${job.location}`); if (!normalize(f.q).split(/\s+/).filter(Boolean).every(t => hay.includes(t))) return false; }
    if (f.focus && job.relevance?.category !== f.focus) return false;
    const orgIds = Array.isArray(job.org_ids) && job.org_ids.length ? job.org_ids : [job.org_id];
    if (f.employer && !orgIds.includes(f.employer)) return false;
    if (f.category) { const cats = Array.isArray(job.categories) ? job.categories : orgIds.map(id => context.categoryOf?.(id)); if (!cats.includes(f.category)) return false; }
    if (f.canton) { const canton = cantonCode(job.canton) || context.cantonOf?.(job.location) || null; if (canton !== f.canton) return false; }
    if (f.seniority && (seniorityKey(job.seniority) || seniorityKey(context.seniorityOf?.(job))) !== f.seniority) return false;
    if (f.min_workload) { const top = job.workload_max ?? job.workload_min; if (top != null && top < Number(f.min_workload)) return false; }
    return true;
  }
  return { fingerprint: hash, normalize, now, text, stages, roles, seniorityLabels, seniorityKey, deadlineDay, daysUntil, profileConfigured, profileMatch, matchesAlert, safeUrl, canonicalUrl, identity, workload, cleanJob, classifyRole, emptyState, hydrate, ingest, freshness, defaultCriteria, evaluate, filterJobs };
});
