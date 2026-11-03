// Pure helpers for e-mail job alerts: filter normalisation, matching against the
// public feed index, due/new-since logic and German e-mail rendering. No network,
// no Deno APIs, so the same module runs in the Edge Function and in node tests.

export const ALERT_FOCUS_CATEGORIES = Object.freeze([
  'Gesundheitsökonomie / HTA', 'Gesundheitspolitik / Tarife',
  'Versorgungsforschung / Public Health', 'Projektmanagement Gesundheit',
  'Management / Controlling Gesundheit', 'Gesundheitsdaten / Analytics',
]);
export const ALERT_SENIORITY_LEVELS = Object.freeze(['praktikum', 'trainee', 'junior', 'senior', 'lead', 'phd']);
export const SENIORITY_LABELS = Object.freeze({ praktikum: 'Praktikum', trainee: 'Trainee', junior: 'Junior', senior: 'Senior', lead: 'Leitung', phd: 'PhD / Doktorat' });
export const CANTONS = Object.freeze(['AG', 'AI', 'AR', 'BE', 'BL', 'BS', 'FR', 'GE', 'GL', 'GR', 'JU', 'LU', 'NE', 'NW', 'OW', 'SG', 'SH', 'SO', 'SZ', 'TG', 'TI', 'UR', 'VD', 'VS', 'ZG', 'ZH']);
export const ALERT_FILTER_KEYS = Object.freeze(['q', 'focus', 'category', 'canton', 'seniority', 'employer', 'min_workload']);
export const DEFAULT_MAX_JOBS_PER_MAIL = 25;
export const DUE_AFTER_MS = Object.freeze({ daily: 20 * 3600e3, weekly: 6.5 * 24 * 3600e3 });

const CANTON_SET = new Set(CANTONS);
const SLUG = /^[a-z0-9_-]{1,80}$/;

export function normalizeText(value) {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ­​]/g, '')
    .replace(/ß/g, 'ss').replace(/\s+/g, ' ').trim();
}

/** Returns only valid, non-empty filter values; unknown keys and invalid values are dropped. */
export function normalizeAlertFilters(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const str = value => (typeof value === 'string' ? value.trim() : '');
  const q = str(raw.q);
  if (q && q.length <= 200) out.q = q;
  if (ALERT_FOCUS_CATEGORIES.includes(str(raw.focus))) out.focus = str(raw.focus);
  if (SLUG.test(str(raw.category))) out.category = str(raw.category);
  const canton = str(raw.canton).toUpperCase();
  if (CANTON_SET.has(canton)) out.canton = canton;
  if (ALERT_SENIORITY_LEVELS.includes(str(raw.seniority))) out.seniority = str(raw.seniority);
  if (SLUG.test(str(raw.employer))) out.employer = str(raw.employer);
  if (typeof raw.min_workload === 'number' && Number.isFinite(raw.min_workload) && raw.min_workload > 0 && raw.min_workload <= 100) out.min_workload = raw.min_workload;
  return out;
}

/** org_id -> {category, title, name, loc} from data/organizations.json. */
export function buildOrgIndex(catalog) {
  const index = new Map();
  for (const group of Array.isArray(catalog) ? catalog : []) {
    for (const org of Array.isArray(group?.orgs) ? group.orgs : []) {
      if (org?.id) index.set(org.id, { category: group.key, title: group.title, name: org.name, loc: org.loc });
    }
  }
  return index;
}

// Small place -> canton map: cantonal capitals, larger towns and the places seen in
// the feed. Keys are normalizeText()-ed. Ambiguous names use the more common canton.
const CITY_CANTON = Object.freeze({
  aarau: 'AG', baden: 'AG', brugg: 'AG', lenzburg: 'AG', wettingen: 'AG', villmergen: 'AG', wurenlingen: 'AG',
  'schinznach bad': 'AG', rheinfelden: 'AG', wohlen: 'AG', zofingen: 'AG',
  herisau: 'AR', appenzell: 'AI',
  bern: 'BE', berne: 'BE', koniz: 'BE', liebefeld: 'BE', biel: 'BE', bienne: 'BE', thun: 'BE', burgdorf: 'BE', langenthal: 'BE', ittigen: 'BE', ostermundigen: 'BE',
  liestal: 'BL', muttenz: 'BL', allschwil: 'BL', binningen: 'BL', pratteln: 'BL',
  basel: 'BS', bale: 'BS', riehen: 'BS', 'basel-stadt': 'BS',
  fribourg: 'FR', freiburg: 'FR', bulle: 'FR',
  geneve: 'GE', genf: 'GE', geneva: 'GE', carouge: 'GE',
  glarus: 'GL',
  chur: 'GR', landquart: 'GR', davos: 'GR',
  delemont: 'JU', porrentruy: 'JU',
  luzern: 'LU', lucerne: 'LU', emmen: 'LU', kriens: 'LU', sursee: 'LU', malters: 'LU', horw: 'LU', ebikon: 'LU',
  neuchatel: 'NE', neuenburg: 'NE', 'la chaux-de-fonds': 'NE',
  stans: 'NW', sarnen: 'OW', alpnach: 'OW',
  'st. gallen': 'SG', 'st gallen': 'SG', 'sankt gallen': 'SG', rapperswil: 'SG', 'rapperswil-jona': 'SG', wil: 'SG', gossau: 'SG',
  schaffhausen: 'SH',
  solothurn: 'SO', olten: 'SO', trimbach: 'SO', grenchen: 'SO',
  schwyz: 'SZ', einsiedeln: 'SZ', 'pfaffikon sz': 'SZ', lachen: 'SZ',
  frauenfeld: 'TG', kreuzlingen: 'TG', weinfelden: 'TG', munsterlingen: 'TG',
  bellinzona: 'TI', lugano: 'TI', locarno: 'TI', mendrisio: 'TI',
  altdorf: 'UR', schattdorf: 'UR',
  lausanne: 'VD', yverdon: 'VD', 'yverdon-les-bains': 'VD', montreux: 'VD', vevey: 'VD', nyon: 'VD', morges: 'VD', epalinges: 'VD', chesieres: 'VD',
  sion: 'VS', sitten: 'VS', visp: 'VS', brig: 'VS', martigny: 'VS', monthey: 'VS', sierre: 'VS',
  zug: 'ZG', baar: 'ZG', cham: 'ZG',
  zurich: 'ZH', winterthur: 'ZH', uster: 'ZH', dubendorf: 'ZH', kloten: 'ZH', wallisellen: 'ZH', hinwil: 'ZH', kusnacht: 'ZH', maur: 'ZH',
  rumlang: 'ZH', wetzikon: 'ZH', zumikon: 'ZH', pfaffikon: 'ZH', 'pfaffikon zh': 'ZH', horgen: 'ZH', meilen: 'ZH', schlieren: 'ZH', dietikon: 'ZH',
  opfikon: 'ZH', bulach: 'ZH', regensdorf: 'ZH', thalwil: 'ZH', adliswil: 'ZH', 'wadenswil': 'ZH',
});
const CITY_KEYS = Object.keys(CITY_CANTON).sort((a, b) => b.length - a.length);
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CITY_PATTERNS = CITY_KEYS.map(key => [new RegExp(`(?:^|[^a-z])${escapeRegExp(key)}(?:$|[^a-z])`), CITY_CANTON[key]]);

/** Cantons named by one location string (e.g. "Küsnacht ZH, CH", "Chesières (VD)", "Bern, Schweiz"). */
export function cantonsFromLocation(location) {
  const found = new Set();
  for (const rawSegment of String(location ?? '').split(/[,;/|]|\s-\s/)) {
    const segment = rawSegment.trim();
    if (!segment) continue;
    // A single explicit code: "Chesières (VD)", "Küsnacht ZH". Lists such as
    // "Espace Mittelland (BE, FR, JU, NE, SO)" describe a region, not the workplace.
    const explicit = segment.match(/\(([A-Z]{2})\)|(?:^|\s)([A-Z]{2})$/);
    const code = explicit && (explicit[1] || explicit[2]);
    if (code && CANTON_SET.has(code) && segment.length > 2) { found.add(code); continue; }
    const normalized = normalizeText(segment.replace(/\([^)]*\)/g, ' '));
    if (CITY_CANTON[normalized]) { found.add(CITY_CANTON[normalized]); continue; }
    for (const [pattern, canton] of CITY_PATTERNS) {
      if (pattern.test(normalized)) { found.add(canton); break; }
    }
  }
  return found;
}

/** Feed `canton` field when present, else derived from location, else from the employer's catalog location. */
export function jobCantons(job, orgIndex = new Map()) {
  const explicit = typeof job?.canton === 'string' ? job.canton.trim().toUpperCase() : '';
  if (CANTON_SET.has(explicit)) return new Set([explicit]);
  const fromLocation = cantonsFromLocation(job?.location);
  if (fromLocation.size) return fromLocation;
  const fallback = new Set();
  for (const id of jobOrgIds(job)) for (const canton of cantonsFromLocation(orgIndex.get(id)?.loc)) fallback.add(canton);
  return fallback;
}

export function jobOrgIds(job) {
  const ids = new Set();
  if (typeof job?.org_id === 'string' && job.org_id) ids.add(job.org_id);
  if (Array.isArray(job?.org_ids)) for (const id of job.org_ids) if (typeof id === 'string' && id) ids.add(id);
  return ids;
}

/**
 * All set filters must match (AND). Free text: every word must occur in title,
 * organization, description or location. Unknown workload is not excluded by
 * min_workload (most postings omit it); unknown seniority/canton never match a set filter.
 */
export function jobMatchesFilters(job, rawFilters, orgIndex = new Map()) {
  if (!job || typeof job !== 'object') return false;
  const filters = normalizeAlertFilters(rawFilters);
  if (filters.q) {
    const haystack = normalizeText([job.title, job.organization, job.description, job.location].filter(v => typeof v === 'string').join(' '));
    if (!normalizeText(filters.q).split(' ').every(word => haystack.includes(word))) return false;
  }
  if (filters.focus && job.relevance?.category !== filters.focus) return false;
  const orgIds = jobOrgIds(job);
  if (filters.employer && !orgIds.has(filters.employer)) return false;
  if (filters.category && ![...orgIds].some(id => orgIndex.get(id)?.category === filters.category)) return false;
  if (filters.seniority && job.seniority !== filters.seniority) return false;
  if (filters.canton && !jobCantons(job, orgIndex).has(filters.canton)) return false;
  if (filters.min_workload != null) {
    const max = Number.isFinite(job.workload_max) ? job.workload_max : Number.isFinite(job.workload_min) ? job.workload_min : null;
    if (max != null && max < filters.min_workload) return false;
  }
  return true;
}

const time = value => { const t = Date.parse(value); return Number.isFinite(t) ? t : null; };

/** Daily alerts are due after ~20 h, weekly after ~6.5 days; never-sent alerts are due immediately. */
export function isAlertDue(alert, now = Date.now()) {
  if (!alert || alert.active === false) return false;
  const interval = DUE_AFTER_MS[alert.frequency];
  if (!interval) return false;
  const last = time(alert.last_sent_at);
  return last == null || now - last >= interval;
}

/** Jobs counted as new: first_seen strictly after last_sent_at (or after created_at for a never-sent alert). */
export function alertSince(alert) {
  return time(alert?.last_sent_at) ?? time(alert?.created_at) ?? 0;
}

/**
 * New, open, matching jobs, newest first, deduplicated by id and URL and against
 * ids already delivered for this alert. Returns {jobs (capped), total}.
 */
export function selectNewJobs({ jobs, alert, orgIndex = new Map(), deliveredIds = [], limit = DEFAULT_MAX_JOBS_PER_MAIL, now = Date.now() }) {
  const since = alertSince(alert);
  const delivered = new Set(deliveredIds);
  const seenIds = new Set(), seenUrls = new Set(), matches = [];
  for (const job of Array.isArray(jobs) ? jobs : []) {
    if (!job || typeof job.id !== 'string' || !job.id || typeof job.title !== 'string') continue;
    if (job.status && job.status !== 'open') continue;
    const firstSeen = time(job.first_seen);
    if (firstSeen == null || firstSeen <= since || firstSeen > now + 3600e3) continue;
    if (delivered.has(job.id) || seenIds.has(job.id)) continue;
    const urlKey = typeof job.url === 'string' ? job.url.trim().replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase() : '';
    if (urlKey && seenUrls.has(urlKey)) continue;
    if (!jobMatchesFilters(job, alert?.filters, orgIndex)) continue;
    seenIds.add(job.id); if (urlKey) seenUrls.add(urlKey);
    matches.push({ job, firstSeen });
  }
  matches.sort((a, b) => b.firstSeen - a.firstSeen || String(a.job.title).localeCompare(String(b.job.title), 'de'));
  const cap = Math.max(1, Math.floor(limit) || DEFAULT_MAX_JOBS_PER_MAIL);
  return { jobs: matches.slice(0, cap).map(m => m.job), total: matches.length };
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

export function safeHttpUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch { return ''; }
}

const oneLine = (value, max = 300) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function formatPensum(job) {
  const min = Number.isFinite(job?.workload_min) ? job.workload_min : null;
  const max = Number.isFinite(job?.workload_max) ? job.workload_max : null;
  if (min != null && max != null) return min === max ? `${min}%` : `${min}–${max}%`;
  if (min != null || max != null) return `${min ?? max}%`;
  return oneLine(job?.pensum, 40);
}

export function formatDeadline(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : oneLine(value, 40);
}

export function describeFilters(rawFilters, orgIndex = new Map(), categoryTitles = {}) {
  const f = normalizeAlertFilters(rawFilters), parts = [];
  if (f.q) parts.push(`Suchbegriff «${f.q}»`);
  if (f.focus) parts.push(`Fachgebiet ${f.focus}`);
  if (f.category) parts.push(`Arbeitgebertyp ${categoryTitles[f.category] || [...orgIndex.values()].find(o => o.category === f.category)?.title || f.category}`);
  if (f.employer) parts.push(`Arbeitgeber ${orgIndex.get(f.employer)?.name || f.employer}`);
  if (f.canton) parts.push(`Kanton ${f.canton}`);
  if (f.seniority) parts.push(`Stufe ${SENIORITY_LABELS[f.seniority]}`);
  if (f.min_workload != null) parts.push(`Pensum ab ${f.min_workload}%`);
  return parts.length ? parts.join(', ') : 'alle Stellen im Jobfeed';
}

export function alertDisplayName(alert) {
  return oneLine(alert?.name, 120) || 'Ihr Jobalarm';
}

export function buildAlertLinks(siteUrl, token) {
  const base = String(siteUrl ?? '').trim().replace(/[#?].*$/, '').replace(/\/+$/, '');
  return { manage: `${base}/#jobalarme`, unsubscribe: `${base}/#abmelden-${encodeURIComponent(String(token ?? ''))}` };
}

/** Renders {subject, html, text}. `total` may exceed jobs.length; the remainder is announced as "und N weitere". */
export function renderAlertEmail({ alert, jobs, total = jobs?.length ?? 0, siteUrl, orgIndex = new Map() }) {
  const list = Array.isArray(jobs) ? jobs : [];
  const count = Math.max(total, list.length);
  const name = alertDisplayName(alert);
  const subject = oneLine(`${count} ${count === 1 ? 'neue Stelle' : 'neue Stellen'}: ${name}`, 180);
  const links = buildAlertLinks(siteUrl, alert?.unsubscribe_token);
  const criteria = describeFilters(alert?.filters, orgIndex);
  const rest = count - list.length;
  const intro = `${count === 1 ? 'Seit der letzten Benachrichtigung ist eine neue Stelle' : `Seit der letzten Benachrichtigung sind ${count} neue Stellen`} zu Ihrem Jobalarm «${name}» erschienen (${criteria}).`;

  const rows = list.map(job => {
    const meta = [oneLine(job.organization, 200), oneLine(job.location, 160), formatPensum(job)].filter(Boolean);
    const deadline = job.deadline ? formatDeadline(job.deadline) : '';
    return { title: oneLine(job.title, 250), url: safeHttpUrl(job.url), meta, deadline };
  });

  const text = [
    intro, '',
    ...rows.flatMap(row => [
      `• ${row.title}`,
      ...(row.meta.length ? [`  ${row.meta.join(' · ')}`] : []),
      ...(row.deadline ? [`  Bewerbungsfrist: ${row.deadline}`] : []),
      ...(row.url ? [`  ${row.url}`] : []),
      '',
    ]),
    ...(rest > 0 ? [`… und ${rest} weitere ${rest === 1 ? 'Stelle' : 'Stellen'} auf der Website.`, ''] : []),
    `Jobalarme verwalten: ${links.manage}`,
    `Diesen Jobalarm abbestellen: ${links.unsubscribe}`,
    '',
    'Die Angaben stammen aus den Originalinseraten der Arbeitgeber. Massgebend ist jeweils das verlinkte Inserat.',
  ].join('\n');

  const css = { a: 'color:#0b5cad;text-decoration:none;font-weight:600', muted: 'color:#555;font-size:14px;margin:4px 0 0' };
  const htmlRows = rows.map(row => {
    const title = row.url ? `<a href="${escapeHtml(row.url)}" style="${css.a}">${escapeHtml(row.title)}</a>` : escapeHtml(row.title);
    return `<tr><td style="padding:14px 0;border-bottom:1px solid #e5e5e5">
<div style="font-size:16px;line-height:1.4">${title}</div>
${row.meta.length ? `<p style="${css.muted}">${row.meta.map(escapeHtml).join(' · ')}</p>` : ''}
${row.deadline ? `<p style="${css.muted}">Bewerbungsfrist: ${escapeHtml(row.deadline)}</p>` : ''}
</td></tr>`;
  }).join('\n');
  const html = `<!doctype html>
<html lang="de-CH"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f6f6f4;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1d1b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:8px;padding:24px">
<tr><td><h1 style="font-size:20px;margin:0 0 8px">${escapeHtml(subject)}</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 8px">${escapeHtml(intro)}</p></td></tr>
${htmlRows}
${rest > 0 ? `<tr><td style="padding:14px 0;font-size:15px">… und ${rest} weitere ${rest === 1 ? 'Stelle' : 'Stellen'} – <a href="${escapeHtml(links.manage)}" style="${css.a}">auf der Website ansehen</a>.</td></tr>` : ''}
<tr><td style="padding-top:20px;font-size:13px;line-height:1.5;color:#555">
<a href="${escapeHtml(links.manage)}" style="color:#0b5cad">Jobalarme verwalten</a> · <a href="${escapeHtml(links.unsubscribe)}" style="color:#0b5cad">Diesen Jobalarm abbestellen</a><br>
Die Angaben stammen aus den Originalinseraten der Arbeitgeber. Massgebend ist jeweils das verlinkte Inserat.
</td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text, unsubscribeUrl: links.unsubscribe, manageUrl: links.manage };
}
