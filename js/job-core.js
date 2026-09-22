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
    const seniorityMap = { phd: 'PhD / Doktorat', entry: 'Berufseinstieg', junior: 'Junior', lead: 'Führung', senior: 'Senior' };
    job.seniority = seniorityMap[job.seniority] || job.seniority;
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
    for (const [key, raw] of entries(value.sources)) if (raw && typeof raw === 'object') base.sources[key] = { org_id: key, name: text(raw.name, 300), url: safeUrl(raw.url), status: ['ok','empty','partial','error','unsupported'].includes(raw.status) ? raw.status : 'error', checked_at: text(raw.checked_at), job_count: Math.max(0, Number(raw.job_count) || 0), message: text(raw.message, 2000), cached: !!raw.cached };
    for (const [key, raw] of entries(value.applications)) if (base.jobs[key] && raw && typeof raw === 'object') base.applications[key] = Object.fromEntries(['contact','notes','next_step','next_date','applied_at','created_at','updated_at'].map(k => [k, text(raw[k])]).concat([['stage', stages[raw.stage] ? raw.stage : 'interested']]));
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
  return { fingerprint: hash, normalize, now, text, stages, roles, safeUrl, canonicalUrl, identity, workload, cleanJob, classifyRole, emptyState, hydrate, ingest, freshness, defaultCriteria, evaluate, filterJobs };
});
