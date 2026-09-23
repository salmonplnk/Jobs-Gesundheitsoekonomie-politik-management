/** Deterministic vacancy extraction, shared by the Edge function and Node tests. */
export const CACHE_VERSION = 4;
export const DESCRIPTION_LIMIT = 30000;
const ATS_DOMAINS = [
  'umantis.com', 'rexx-systems.com', 'successfactors.eu', 'successfactors.com',
  'myworkdayjobs.com', 'solique.ch', 'csod.com', 'recruitee.com', 'softgarden.io',
  'jobbase.io', 'jobcloud.io', 'jobs.ch', 'hr4you.org', 'hr4you.com',
  'recruitingapp-2721.umantis.com', 'apply.admin.ch', 'stellen.admin.ch',
  'greenhouse.io', 'lever.co',
];
const ENTITIES = {amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ',
  auml:'ä', ouml:'ö', uuml:'ü', Auml:'Ä', Ouml:'Ö', Uuml:'Ü', szlig:'ß',
  eacute:'é', egrave:'è', agrave:'à', ecirc:'ê', ndash:'–', mdash:'—', bull:'•'};

export function decodeEntities(value) {
  return String(value ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (all, key) => {
    if (key[0] !== '#') return ENTITIES[key] ?? all;
    const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
      ? String.fromCodePoint(n) : '';
  });
}

export function cleanText(html) {
  return decodeEntities(String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|nav|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\s*(?:br|\/p|\/div|\/h[1-6]|\/li|\/section|\/article|\/tr)\b[^>]*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, ' '))
    .replace(/[\t\r\f ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function attributes(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4]);
  }
  return attrs;
}

/** Only public HTTPS names; literals, credentials and alternative ports are never fetched. */
export function safePublicUrl(raw, base) {
  try {
    const u = new URL(raw, base);
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
    if (!host.includes('.') || host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host)) return null;
    if (/(?:^|\.)(?:localhost|local|internal|invalid|test|example|onion)$/.test(host)) return null;
    if (!/^[a-z0-9.-]+$/.test(host) || host.includes('..') || host === 'metadata.google.internal') return null;
    u.hostname = host;
    return u;
  } catch { return null; }
}

export function isPublicAddress(address) {
  const ip = String(address).toLowerCase();
  if (ip.includes(':')) {
    // Accept only global unicast IPv6. Reject mapped IPv4, local, multicast,
    // documentation ranges and special-purpose 2001::/23 allocations.
    if (!/^[0-9a-f:]+$/.test(ip) || !/^[23][0-9a-f]{0,3}:/.test(ip)) return false;
    if (/^2001:(?:0{1,3}[0-9a-f]{0,2}|1[0-9a-f]{0,2}|db8):/.test(ip)) return false;
    return !ip.startsWith('2002:'); // 6to4 can encode an internal IPv4 target.
  }
  const parts = ip.split('.');
  if (parts.length !== 4 || parts.some(p => !/^\d+$/.test(p) || Number(p) > 255)) return false;
  const [a,b,c] = parts.map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

function hostWithin(host, root) { return host === root || host.endsWith('.' + root); }
export function isAllowedUrl(raw, org, base = org.jobs) {
  const url = safePublicUrl(raw, base);
  if (!url) return false;
  const roots = [org.jobs, org.main].map(x => safePublicUrl(x)?.hostname.replace(/^www\./, '')).filter(Boolean);
  // Supplied only by the server-owned source registry, never by requesting browsers.
  const extra = (Array.isArray(org.allowed_hosts) ? org.allowed_hosts : []).map(host =>
    safePublicUrl(String(host).includes('://') ? host : `https://${host}`)?.hostname).filter(Boolean);
  return roots.some(root => hostWithin(url.hostname, root)) || extra.includes(url.hostname) || ATS_DOMAINS.some(root => hostWithin(url.hostname, root));
}

export function canonicalUrl(raw, base) {
  const u = safePublicUrl(raw, base);
  if (!u) return null;
  for (const key of [...u.searchParams.keys()]) {
    if (/^(?:utm_|pk_|mtm_)/i.test(key) || /^(?:fbclid|gclid|msclkid|dclid|referrer|tracking)$/i.test(key)) u.searchParams.delete(key);
  }
  u.searchParams.sort();
  // Preserve meaningful SPA job routes, discard ordinary section anchors.
  if (!/^#\/?(?:jobs?|positions?|stellen?|vacanc(?:y|ies))\//i.test(u.hash)) u.hash = '';
  if (u.pathname !== '/') u.pathname = u.pathname.replace(/\/+$/, '');
  return u.href;
}

export function stableJobId(orgId, url) {
  let h = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(url)) h = BigInt.asUintN(64, (h ^ BigInt(byte)) * 0x100000001b3n);
  return `${orgId}:${h.toString(16).padStart(16, '0')}`;
}

const genericTitle = /^(?:jobs?|karriere|career[s]?|offene stellen(?:angebote)?|stellen(?:markt|angebote|portal)?|vacanc(?:y|ies)|join us|emplois?|nos offres|offres d.emploi|arbeiten bei .+)$/i;
const overviewTitle = /\b(?:Karriere|Careers?|Stellenangebote|Stellenportal|Stellenmarkt|Jobsuche|offene Stellen|our vacancies|nos offres)\b/i;
const detailPath = /(?:\/(?:jobs?|positions?|stellen?|vacanc(?:y|ies)|requisition|offene-stellen|stellenangebote)\/[^/?#]{4,}|\/(?:Vacancies|liste-offres)\/\d+|[?&](?:job_?id|vacancy_?id|position_?id|requisition_?id|jid)=\w+|\/(?:job|stelle|emploi)[-_][^/?#]{4,}|\/[a-z\d-]+-j\d+\.html)/i;
const listingEnd = /\/(?:careers?|karriere|jobs?|jobs?-karriere|jobs?-und-karriere|stellen(?:angebote|portal|markt)?|offene-stellen|vacancies|positions?|job-search|jobboerse|emplois?|offres?|offres-d-?emploi)(?:\.html?)?\/?$/i;
const pageParameter = /^(?:page|p|offset|start|skip|from|cursor|next|pageNumber|pageIndex|currentPage|tx_[^\[]+\[(?:page|currentPage)\])$/i;
const paginationPath = /\/(?:page|seite)\/\d+(?:\/|$)/i;
const blockedLink = /(?:bewerbungsprozess|job[-_]?alert|privacy|datenschutz|login|register|anmelden|\/apply(?:\/|$)|\/application(?:\/|$))/i;
const careerNavigation = /\/(?:[^/]*(?:bewerbung|benefit|vorteile|kultur|werte|entwicklung|arbeiten-|berufsbild|lehrstellen|ausbildung|arbeitswelt|stellenvermittlung|job-finder|sitesearch|offres-stage|uebrige-institutionen|personalvermittler)[^/]*)$/i;
export function looksLikeDetailUrl(raw) {
  const url = safePublicUrl(raw);
  if (!url || paginationPath.test(url.pathname)) return false;
  if ([...url.searchParams.keys()].some(key => /^(?:job_?id|vacancy_?id|position_?id|requisition_?id|jid)$/i.test(key))) return true;
  if (listingEnd.test(url.pathname) || [...url.searchParams.keys()].some(key => pageParameter.test(key)) || careerNavigation.test(url.pathname)) return false;
  return detailPath.test(url.href);
}

function jsonPostings(html) {
  const nodes = [];
  let malformed = false;
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if ((attributes(script[1]).type || '').toLowerCase().split(';')[0].trim() !== 'application/ld+json') continue;
    let data;
    try { data = JSON.parse(script[2].replace(/^\s*<!--|-->\s*$/g, '').trim()); }
    catch { malformed = true; continue; }
    const queue = [data];
    for (let i = 0; i < queue.length && i < 5000; i++) {
      const value = queue[i];
      if (!value || typeof value !== 'object') continue;
      if ([].concat(value['@type'] || []).some(t => /(?:^|\/)JobPosting$/i.test(String(t)))) nodes.push(value);
      for (const nested of Object.values(value)) if (nested && typeof nested === 'object') queue.push(...(Array.isArray(nested) ? nested : [nested]));
    }
  }
  return {nodes, malformed};
}

function textValue(value) {
  if (typeof value === 'string' || typeof value === 'number') return cleanText(value) || null;
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(', ') || null;
  return value && typeof value === 'object' ? textValue(value.name ?? value.value) : null;
}
function locationValue(value) {
  return [].concat(value ?? []).map(place => {
    if (typeof place === 'string') return cleanText(place);
    const a = place?.address;
    if (typeof a === 'string') return cleanText(a);
    if (a) return [textValue(a.addressLocality), textValue(a.addressRegion), textValue(a.addressCountry)].filter(Boolean).join(', ');
    return textValue(place?.name);
  }).filter(Boolean).join(' / ') || null;
}
function salaryValue(value) {
  if (!value) return null;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  const v = value.value;
  if (v && typeof v === 'object') {
    const amount = v.value ?? (v.minValue != null && v.maxValue != null ? `${v.minValue}–${v.maxValue}` : v.minValue ?? v.maxValue);
    return amount != null ? [value.currency, amount, v.unitText].filter(Boolean).join(' ') : null;
  }
  return v != null ? [value.currency, v].filter(Boolean).join(' ') : null;
}
function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d(?:T|$)/.test(value)) return null;
  return Number.isFinite(Date.parse(value)) ? value.slice(0, 10) : null;
}

function inferMetadata(title, description, node = {}) {
  const text = `${title}\n${description}`;
  const workloadText = `${title}\n${textValue(node.workHours) || ''}\n${(description.match(/(?:Pensum|Arbeitspensum|Beschäftigungsgrad|Workload|Taux d.activit[eé])[^\n.]{0,70}/i) || [''])[0]}`;
  const workload = workloadText.match(/\b(\d{1,3})\s*%?\s*(?:[–—-]|bis|to|à)\s*(\d{1,3})\s*%/) || workloadText.match(/\b(\d{1,3})\s*%/);
  let min = workload ? Number(workload[1]) : null;
  let max = workload ? Number(workload[2] ?? workload[1]) : null;
  if (min != null && (min < 1 || max > 100 || min > max)) min = max = null;
  const languageLines = description.split('\n').filter(line => /(?:sprach|language|langue|kenntnisse|fluent|fließend|fliessend|maternelle|courant|ma[iî]tris|bilingu)/i.test(line));
  const langs = [];
  const explicitLanguages = textValue(node.qualifications?.inLanguage ?? node.languageRequirements);
  if (explicitLanguages) langs.push(explicitLanguages);
  for (const [code,re] of [['DE',/\b(?:Deutsch|German|allemand)/i],['FR',/\b(?:Französisch|French|fran[çc]ais)/i],['EN',/\b(?:Englisch|English|anglais)/i],['IT',/\b(?:Italienisch|Italian|italien)/i]]) {
    if (languageLines.some(line => re.test(line))) langs.push(code);
  }
  let remote = 'unknown';
  if (/\b(?:kein(?:e|en)? Homeoffice|no remote|ausschliesslich vor Ort|ausschließlich vor Ort)\b/i.test(text)) remote = 'onsite';
  else if (/\b(?:hybrid|teilweise Homeoffice|partiel(?:lement)? .{0,12}télétravail)\b/i.test(text)) remote = 'hybrid';
  else if (String(node.jobLocationType).toUpperCase() === 'TELECOMMUTE' || /\b(?:fully remote|100\s*%\s*remote|vollst[aä]ndig remote|complete remote)\b/i.test(text)) remote = 'remote';
  // A Homeoffice benefit alone does not prove a fully remote or hybrid contract.
  const employmentRaw = textValue(node.employmentType);
  let employment = null;
  if (/\b(?:unbefristet|permanent|indefinite|dur[eé]e ind[eé]termin[eé]e|CDI)\b/i.test(`${employmentRaw || ''} ${text}`)) employment = 'permanent';
  else if (/\b(?:befristet|temporary|contract|fixed[- ]term|dur[eé]e d[eé]termin[eé]e|CDD)\b/i.test(`${employmentRaw || ''} ${text}`)) employment = 'temporary';
  else if (/\b(?:internship|praktikum|stage)\b/i.test(`${employmentRaw || ''} ${title}`)) employment = 'internship';
  let seniority = null;
  if (/\b(?:PhD|Doktorand|doctoral)\w*/i.test(title)) seniority = 'phd';
  else if (/\b(?:Praktik|Intern(?:ship)?|Trainee)\w*/i.test(title)) seniority = 'entry';
  else if (/\b(?:Junior|Berufseinsteiger|Graduate)\w*/i.test(title)) seniority = 'junior';
  else if (/\b(?:Leiter|Leitung|Head|Direktor|Director|Chief)\w*/i.test(title)) seniority = 'lead';
  else if (/\bSenior\b/i.test(title)) seniority = 'senior';
  let role = null;
  if (/\b(?:Health Economics?|Gesundheitsökonom|HTA|HEOR)\w*/i.test(title)) role = 'health-economics';
  else if (/\b(?:Public Health|Versorgungsforschung|Epidemiolog)\w*/i.test(title)) role = 'public-health';
  else if (/\b(?:Projekt|Project|Programm|Program)\w*/i.test(title)) role = 'project-management';
  else if (/\b(?:Data|Daten|Analyst|Analytics|Statistik|Statisti|Biostatisti)\w*/i.test(title)) role = 'data-analytics';
  else if (/\b(?:PhD|Doktorand|Research|Wissenschaft|Forschung)\w*/i.test(title)) role = 'research';
  const salary = salaryValue(node.baseSalary) || (description.match(/(?:CHF\s*[\d'’.,]+(?:\s*[–—-]\s*(?:CHF\s*)?[\d'’.,]+)?(?:\s*(?:pro Jahr|\/Jahr|p\.a\.|per year))?|Lohnklasse\s*\d+(?:\s*[–—-]\s*\d+)?)/i) || [null])[0];
  const textualDeadline = description.match(/(?:Bewerbungsfrist|bewerben[^\n.]{0,25}bis|date limite|application deadline)\s*:?\s*(\d{1,2})[./](\d{1,2})[./](\d{4})/i);
  return {pensum: min != null ? (min === max ? `${min}%` : `${min}–${max}%`) : null,
    workload_min:min, workload_max:max, languages: langs.length ? [...new Set(langs)].join(', ') : null,
    salary_hint:salary, deadline:dateValue(node.validThrough) || (textualDeadline ? dateValue(`${textualDeadline[3]}-${textualDeadline[2].padStart(2,'0')}-${textualDeadline[1].padStart(2,'0')}`) : null),
    remote_mode:remote, employment_type:employment, employment_type_raw:employmentRaw, seniority, role};
}

function jobRecord(node, org, pageUrl, sourceUrl, fetchedAt, allowPageUrl) {
  const title = textValue(node.title);
  const description = textValue(node.description);
  if (!title || title.length < 4 || title.length > 400 || genericTitle.test(title) || !description || description.length < 80) return null;
  const rawUrl = textValue(node.url) || textValue(node.mainEntityOfPage?.['@id']) || (allowPageUrl ? pageUrl : null);
  if (!rawUrl || !isAllowedUrl(rawUrl, org, pageUrl)) return null;
  const url = canonicalUrl(rawUrl, pageUrl);
  if (!url || url === canonicalUrl(org.main)) return null;
  const target = new URL(url);
  if ((target.pathname === '/' || /\/(?:careers?|jobs?|karriere|stellen|offene-stellen)\/?$/i.test(target.pathname)) && !target.search && !target.hash) return null;
  const truncated = description.length > DESCRIPTION_LIMIT;
  return {id:stableJobId(org.id, url), org_id:org.id, organization:org.name, title, url,
    source_url:sourceUrl, fetched_at:fetchedAt, description: truncated ? `${description.slice(0, DESCRIPTION_LIMIT)}\n[Beschreibung nach 30’000 Zeichen gekürzt.]` : description,
    description_truncated:truncated, location:locationValue(node.jobLocation),
    hiring_organization:textValue(node.hiringOrganization),
    ...inferMetadata(title, description, node)};
}

/** Preserve employer and search filters when a pager emits only its changing cursor. */
export function scopedListingUrl(raw, pageUrl, org, {pagination = false} = {}) {
  const target = safePublicUrl(raw, pageUrl), current = safePublicUrl(pageUrl), root = safePublicUrl(org.jobs);
  if (!target || !current || !isAllowedUrl(target.href, org)) return null;
  if (pagination && target.origin !== current.origin) return null;
  if (pagination) {
    for (const [key] of current.searchParams) {
      if (pageParameter.test(key) || /^(?:utm_|pk_|mtm_)/i.test(key)) continue;
      const values = current.searchParams.getAll(key), incoming = target.searchParams.getAll(key);
      if (incoming.length && (incoming.length !== values.length || incoming.some((value, i) => value !== values[i]))) return null;
      if (!incoming.length) for (const value of values) target.searchParams.append(key, value);
    }
  }
  for (const scope of [root, current].filter(Boolean)) {
    if (!scope.search) continue;
    for (const [key] of scope.searchParams) {
      if (pageParameter.test(key) || /^(?:utm_|pk_|mtm_|lang(?:uage)?$|locale$)/i.test(key)) continue;
      // A career iframe can narrow a department beyond the original catalog URL.
      if (scope === root && scope.hostname !== target.hostname && scope.hostname !== current.hostname) continue;
      const expected = scope.searchParams.getAll(key), actual = target.searchParams.getAll(key);
      if (actual.length !== expected.length || actual.some((value, i) => value !== expected[i])) return null;
    }
  }
  return canonicalUrl(target.href);
}

/** Listing routes, pagers and career iframes are distinct from vacancy details. */
export function discoverJobPages(html, pageUrl, org) {
  html = String(html).replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const details = new Map(), listings = new Map(), unsupportedDetails = new Map();
  let blockedPagination = 0, blockedEntries = 0;
  const current = canonicalUrl(pageUrl);
  const addListing = (raw, label, kind) => {
    const url = scopedListingUrl(raw, pageUrl, org, {pagination:kind === 'pagination'});
    if (!url) { if (kind === 'pagination') blockedPagination++; else blockedEntries++; return; }
    if (url !== current) listings.set(url, {url, label, kind});
  };
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>|<link\b([^>]*)>/gi)) {
    const a = attributes(match[1] ?? match[3]);
    if (!a.href || /^(?:#|mailto:|tel:|javascript:)/i.test(a.href)) continue;
    const label = cleanText(match[2] || a.title || a['aria-label'] || '');
    const url = canonicalUrl(a.href, pageUrl);
    if (!url || blockedLink.test(url)) continue;
    if (/\.(?:pdf|docx?|xlsx?|zip|png|jpe?g|svg)(?:$|\?)/i.test(url)) {
      if (/\.(?:pdf|docx?)(?:$|\?)/i.test(url) && isAllowedUrl(url, org) && (looksLikeDetailUrl(url) || /\d{1,3}\s*%/.test(label))) unsupportedDetails.set(url,{url,label});
      continue;
    }
    const target = new URL(url);
    const signals = `${a.class || ''} ${a['data-testid'] || ''} ${a.itemprop || ''}`;
    if (match[3] != null && !/(?:^|\s)next(?:\s|$)/i.test(a.rel || '')) continue;
    const isPager = /(?:^|\s)next(?:\s|$)/i.test(a.rel || '') || paginationPath.test(target.pathname) ||
      [...target.searchParams.keys()].some(key => pageParameter.test(key) && (!/^p$/i.test(key) || /^\d+$/.test(label))) ||
      (/^(?:next(?: page)?|weiter|nächste(?: seite)?|suivant(?:e)?|›|»|→)$/i.test(label) && /(?:pag|next|weiter)/i.test(signals + ' ' + (a.rel || '')));
    if (isPager) { addListing(a.href,label,'pagination'); continue; }
    if (match[3] != null || !isAllowedUrl(url,org) || url === current) continue;
    const careerLabel = (genericTitle.test(label) && !/^arbeiten bei .+/i.test(label)) || /^(?:alle|aktuelle|unsere|zu den|see all|view all|search|find|open|current|toutes les|tous les)\s+(?:offenen?\s+)?(?:stellen(?:angebote)?|jobs|vacancies|positions|offres|emplois)(?:\s+.+)?$/i.test(label);
    const isListing = careerLabel || listingEnd.test(target.pathname) || /\/(?:jobs?|stellen|vacancies)\/(?:all|search|overview)\/?$/i.test(target.pathname);
    if (isListing) { addListing(a.href,label,'career'); continue; }
    const jobClass = /(?:job|vacancy|position|stelle)[_-]?(?:title|link|detail|item|card)/i.test(signals);
    const jobLabel = /\d{1,3}\s*%|\b(?:m\/w|w\/m|all genders|PhD|Doktorand|Projektleiter|Scientist|Analyst)\b/i.test(label);
    if (looksLikeDetailUrl(url) || jobClass || jobLabel) details.set(url,{url,label});
  }
  for (const match of html.matchAll(/<iframe\b([^>]*)>/gi)) {
    const a = attributes(match[1]), raw = a.src || a['data-src'];
    if (!raw) continue;
    const target = safePublicUrl(raw,pageUrl);
    if (!target || !isAllowedUrl(target.href,org) || /\/(?:header|footer|tracking|captcha|cookie)[^/]*(?:\/|$)/i.test(target.pathname)) continue;
    if (/job|career|karriere|stellen|vacanc|recruit|solique|umantis|rexx|greenhouse|lever\.co|recruitee|softgarden|successfactors|csod/i.test(`${target.href} ${a.title || ''} ${a.id || ''}`)) addListing(raw,a.title || 'Karriereportal','iframe');
  }
  const visible = cleanText(html);
  const dynamicPagination = /(?:mehr (?:Stellen|Jobs) laden|load more(?: (?:jobs|positions))?|weitere Stellen anzeigen|plus d.offres|mehr laden)/i.test(visible) ||
    /<(?:button|a)\b[^>]*(?:data-(?:next-page|cursor)|(?:class|id)=["'][^"']*load[-_]?more)/i.test(html);
  const listingLinks = [...listings.values()];
  return {links:[...details.values()],listingLinks,paginationLinks:listingLinks.filter(link => link.kind === 'pagination'),
    unsupportedDetails:[...unsupportedDetails.values()],dynamicPagination,blockedPagination,blockedEntries};
}

export function extractDetailLinks(html,pageUrl,org) { return discoverJobPages(html,pageUrl,org).links; }

/** A registry-owned department scope must be evidenced by the vacancy itself. */
export function matchesOrganizationScope(job,org) {
  const terms = (Array.isArray(org.scope_terms) ? org.scope_terms : []).filter(term => typeof term === 'string' && term.trim());
  if (!terms.length) return true;
  const normalize = text => String(text || '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const evidence = ` ${normalize(`${job.title || ''}\n${job.hiring_organization || ''}\n${job.description || ''}`)} `;
  return terms.some(term => { const wanted = normalize(term); return wanted && evidence.includes(` ${wanted} `); });
}

export function extractVacancies(html, org, pageUrl, options = {}) {
  const sourceUrl = options.sourceUrl || org.jobs;
  const fetchedAt = options.fetchedAt || new Date().toISOString();
  const {nodes, malformed} = jsonPostings(html);
  const h1 = cleanText((html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i) || [,''])[1]);
  const jobs = [];
  let rejected = 0;
  for (const node of nodes) {
    const sameTitle = h1 && textValue(node.title) && h1.toLowerCase().includes(textValue(node.title).toLowerCase());
    const job = jobRecord(node, org, pageUrl, sourceUrl, fetchedAt, options.detail === true || (nodes.length === 1 && sameTitle));
    // A listing page URL shared by several JobPostings cannot identify an individual vacancy.
    const ownPageIsDetail = options.detail === true || (nodes.length === 1 && sameTitle && !overviewTitle.test(h1));
    if (job && (job.url !== canonicalUrl(pageUrl) || ownPageIsDetail)) jobs.push(job); else rejected++;
  }
  if (!jobs.length && !nodes.length && options.detail === true && h1 && !genericTitle.test(h1) && !overviewTitle.test(h1)) {
    // Some employer templates split one vacancy across several sibling articles.
    // Match the corresponding main closing tag; an inner article must not cut it short.
    const mainRegion = html.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i)?.[1];
    const articles = [...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/gi)].map(match => match[1]);
    const main = mainRegion || (articles.length ? articles.join('\n') : html);
    const description = cleanText(main);
    const hasTasks = /(?:Ihre Aufgaben|Deine Aufgaben|Aufgabenbereich|Ihre neue Herausforderung|Your (?:tasks|responsibilities)|Responsibilities|Vos missions|Vos tâches|Ce qui vous attend)/i.test(description);
    const hasRequirements = /(?:Ihr Profil|Dein Profil|Anforderungen|Voraussetzungen|Requirements|Qualifications|Votre profil|Your profile|Das bringen Sie mit)/i.test(description);
    const hasApplication = /(?:bewerben|Bewerbung|apply|application|postuler|candidature)/i.test(description);
    if (description.length >= 150 && hasTasks && hasRequirements && hasApplication) {
      const node = {title:h1, description, url:pageUrl};
      const job = jobRecord(node, org, pageUrl, sourceUrl, fetchedAt, true);
      if (job) jobs.push({...job, extraction_method:'html-detail'});
    }
  }
  const unique = [...new Map(jobs.map(j => [j.id, j])).values()];
  const discovery = discoverJobPages(html, pageUrl, org);
  const links = discovery.links.filter(link => !unique.some(job => job.url === link.url));
  const visible = cleanText(html);
  const explicitEmpty = /(?:keine (?:offenen |passenden |freien |aktuellen )?(?:Stellen|Vakanzen)|aktuell (?:keine|nicht auf der Suche)|no (?:open |current |matching )?(?:jobs|vacancies|positions)|aucun(?:e)? (?:poste|offre|emploi))/i.test(visible);
  const hasPagination = discovery.paginationLinks.length > 0 || discovery.dynamicPagination || discovery.blockedPagination > 0;
  const listingEvidence = explicitEmpty || discovery.links.length > 0 || nodes.length > 1 || (nodes.length > 0 && !looksLikeDetailUrl(pageUrl));
  const countMatch = visible.match(/\b(\d{1,5})\s+(?:offene Stellen|Stellenangebote|open positions|jobs found|offres d.emploi)\b/i) ||
    visible.match(/(?:Ergebnisse|results|Stellen)\s+\d+\s*[-–]\s*\d+\s+(?:von|of|sur)\s+(\d{1,5})\b/i);
  return {jobs:unique,...discovery,links,explicitEmpty,hasPagination,listingEvidence,expectedCount:countMatch ? Number(countMatch[1]) : null,malformed,rejected};
}
