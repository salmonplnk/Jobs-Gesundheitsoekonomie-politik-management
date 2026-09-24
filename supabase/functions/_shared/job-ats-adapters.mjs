import {canonicalUrl, cleanText, decodeEntities, extractVacancies, safePublicUrl} from './job-extraction.mjs';

/** Employer-scoped public GET endpoints, verified against provider references:
 * https://docs.recruitee.com/reference/offers
 * https://docs.recruitee.com/reference/authentication-1
 * https://docs.greenhouse.io/job-board.html
 * https://github.com/lever/postings-api/blob/master/README.md
 * Recruitee announces mandatory Careers tokens from 2027-02-10. Public 401s
 * remain fetch failures, never empty boards; callers retain HTML fallback.
 */
export const ATS_PAGE_SIZE = 100;
const MAX_ROWS = 5000;
const reserved = new Set(['www','api','app','docs','support','help','status','embed','boards','jobs']);
const greenhouseHosts = new Set(['boards.greenhouse.io','job-boards.greenhouse.io']);
const validTenant = value => /^[a-z0-9][a-z0-9_-]{0,99}$/i.test(value || '') && !reserved.has(value.toLowerCase());
const string = value => typeof value === 'string' ? value : '';
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const fragments = values => values.filter(value => typeof value === 'string' && value.trim()).join('\n');

function parseAdapterUrl(raw) {
  const url = safePublicUrl(raw);
  if (!url || /%2f|%5c/i.test(url.pathname)) return null;
  let kind, tenant, boardUrl, apiUrl, pageOffset = 0;
  const recruitee = url.hostname.match(/^([a-z0-9-]+)\.recruitee\.com$/);
  if (recruitee && validTenant(recruitee[1])) {
    kind = 'recruitee'; tenant = recruitee[1];
    boardUrl = `${url.origin}/`; apiUrl = `${url.origin}/api/offers/`;
  } else if (greenhouseHosts.has(url.hostname)) {
    const match = url.pathname.match(/^\/([a-z0-9_-]+)(?:\/(?:jobs\/\d+)?)?\/?$/i);
    if (!match || !validTenant(match[1])) return null;
    kind = 'greenhouse'; tenant = match[1];
    boardUrl = `${url.origin}/${tenant}`;
    apiUrl = `https://boards-api.greenhouse.io/v1/boards/${tenant}/jobs?content=true`;
  } else if (url.hostname === 'boards-api.greenhouse.io') {
    const match = url.pathname.match(/^\/v1\/boards\/([a-z0-9_-]+)\/jobs\/?$/i);
    if (!match || !validTenant(match[1])) return null;
    kind = 'greenhouse'; tenant = match[1];
    boardUrl = `https://boards.greenhouse.io/${tenant}`;
    apiUrl = `${url.origin}/v1/boards/${tenant}/jobs?content=true`;
  } else if (['jobs.lever.co','jobs.eu.lever.co','api.lever.co','api.eu.lever.co'].includes(url.hostname)) {
    const isApi = url.hostname.startsWith('api.');
    const match = url.pathname.match(isApi ? /^\/v0\/postings\/([a-z0-9_-]+)\/?$/i : /^\/([a-z0-9_-]+)(?:\/[a-z0-9-]+)?\/?$/i);
    if (!match || !validTenant(match[1])) return null;
    kind = 'lever'; tenant = match[1];
    const region = url.hostname.includes('.eu.') ? '.eu' : '';
    if (isApi && url.searchParams.has('skip')) {
      const skip = url.searchParams.get('skip');
      if (!/^\d{1,7}$/.test(skip) || Number(skip) > 1000000) return null;
      pageOffset = Number(skip);
    }
    boardUrl = `https://jobs${region}.lever.co/${tenant}`;
    apiUrl = `https://api${region}.lever.co/v0/postings/${tenant}?mode=json&limit=${ATS_PAGE_SIZE}&skip=${pageOffset}`;
  } else return null;
  return {kind,tenant,boardUrl,sourceUrl:canonicalUrl(url.href),apiUrl,pageOffset,pageSize:ATS_PAGE_SIZE};
}

function sameTenant(a,b) {
  return a.kind === b.kind && a.tenant === b.tenant && new URL(a.apiUrl).hostname === new URL(b.apiUrl).hostname;
}

/** Use only catalog sources and links discovered on the employer's own page. */
export function detectAdapter(org, url = org?.jobs) {
  const adapter = parseAdapterUrl(url);
  if (!adapter) return null;
  for (const raw of [org?.jobs,org?.main]) {
    const configured = parseAdapterUrl(raw);
    if (configured && !sameTenant(configured,adapter)) return null;
  }
  return adapter;
}

function validate(adapter,org) {
  const known = detectAdapter(org,adapter?.apiUrl);
  if (!known || !sameTenant(known,adapter) || known.apiUrl !== adapter.apiUrl) throw new Error('Ungültige oder fremde ATS-Quelle.');
  return known;
}

/** HTTPS, public DNS, redirect checks and byte limits remain transport duties. */
export function adapterFetchOrg(adapter,org) {
  validate(adapter,org);
  return {...org,jobs:adapter.apiUrl,allowed_hosts:[...new Set([...(org.allowed_hosts || []),new URL(adapter.apiUrl).hostname])]};
}

function employerHost(url,org) {
  const root = safePublicUrl(org.main);
  if (!root || parseAdapterUrl(root.href)) return false;
  const host = root.hostname.replace(/^www\./,'');
  return url.hostname === host || url.hostname.endsWith(`.${host}`);
}

function scopedDetailUrl(raw,adapter,org) {
  const url = safePublicUrl(raw);
  if (!url) return null;
  const path = url.pathname.replace(/\/+$/,'');
  if (adapter.kind === 'recruitee') {
    if (url.hostname !== new URL(adapter.boardUrl).hostname || !/^\/(?:[a-z]{2}\/)?o\/[^/]+$/i.test(path)) return null;
  } else if (adapter.kind === 'lever') {
    if (url.hostname !== new URL(adapter.boardUrl).hostname || !new RegExp(`^/${adapter.tenant}/[a-z0-9-]+$`,'i').test(path)) return null;
  } else if (greenhouseHosts.has(url.hostname)) {
    const scoped = parseAdapterUrl(url.href);
    if (!scoped || !sameTenant(scoped,adapter) || !/\/jobs\/\d+$/.test(path)) return null;
  } else if (!employerHost(url,org) || !path || canonicalUrl(url.href) === canonicalUrl(org.jobs)) return null;
  return canonicalUrl(url.href);
}

function locations(value) {
  return [].concat(value || []).map(place => {
    if (typeof place === 'string') return {name:place};
    if (!object(place)) return null;
    const city = string(place.city), region = string(place.state), country = string(place.country_code || place.country);
    return city || region || country ? {address:{addressLocality:city,addressRegion:region,addressCountry:country}} : {name:string(place.name)};
  }).filter(Boolean);
}

function postingNode(row,adapter,org) {
  if (!object(row)) return {invalid:true};
  if (adapter.kind === 'recruitee' && ((row.kind && row.kind !== 'job') || (row.status && row.status !== 'published'))) return {excluded:true};
  if (adapter.kind === 'greenhouse' && row.internal_job_id === null) return {excluded:true};
  let node,rawUrl;
  if (adapter.kind === 'recruitee') {
    rawUrl = row.careers_url;
    node = {title:row.title,description:fragments([row.description,row.requirements]),
      jobLocation:locations(row.locations?.length ? row.locations : row.location || {city:row.city,state:row.state,country:row.country,country_code:row.country_code}),
      employmentType:string(row.employment_type_code).replace(/_/g,' ')};
  } else if (adapter.kind === 'greenhouse') {
    rawUrl = row.absolute_url;
    node = {title:row.title,description:decodeEntities(decodeEntities(string(row.content))),
      jobLocation:locations(string(row.location?.name)),validThrough:row.application_deadline};
  } else {
    rawUrl = row.hostedUrl;
    const lists = Array.isArray(row.lists) ? row.lists.map(list => object(list) ? fragments([string(list.text),string(list.content)]) : '') : [];
    node = {title:row.text,description:fragments([row.description || row.descriptionPlain,...lists,row.additional || row.additionalPlain,row.salaryDescription || row.salaryDescriptionPlain]),
      jobLocation:locations(row.categories?.allLocations?.length ? row.categories.allLocations : row.categories?.location),
      employmentType:row.categories?.commitment,jobLocationType:row.workplaceType === 'remote' ? 'TELECOMMUTE' : undefined};
    const salary = object(row.salaryRange) ? row.salaryRange : null;
    if (salary && typeof salary.currency === 'string' && (Number.isFinite(salary.min) || Number.isFinite(salary.max))) {
      node.baseSalary = {currency:salary.currency,value:{minValue:Number.isFinite(salary.min) ? salary.min : undefined,
        maxValue:Number.isFinite(salary.max) ? salary.max : undefined,unitText:string(salary.interval)}};
    }
  }
  node.url = scopedDetailUrl(rawUrl,adapter,org);
  return {node:{'@type':'JobPosting',...node},invalid:!node.url};
}

/** Missing/invalid payloads never prove zero vacancies. Incomplete valid records
 * become detail links for the caller's HTML fallback. */
export function normalizeAdapterPayload(adapter,payload,org,options = {}) {
  validate(adapter,org);
  const result = {jobs:[],links:[],explicitEmpty:false,hasPagination:false,malformed:false,rejected:0,
    method:`${adapter.kind}-api`,complete:false,nextApiUrl:null};
  const rows = adapter.kind === 'recruitee' ? payload?.offers : adapter.kind === 'greenhouse' ? payload?.jobs : payload;
  if (!Array.isArray(rows)) return {...result,malformed:true};
  if (adapter.kind === 'lever' && rows.length >= adapter.pageSize) {
    const next = new URL(adapter.apiUrl); next.searchParams.set('skip',String((adapter.pageOffset || 0) + rows.length));
    result.nextApiUrl = next.href; result.hasPagination = true;
  }
  if (adapter.kind === 'greenhouse' && Number.isFinite(payload.meta?.total) && payload.meta.total > rows.length) result.hasPagination = true;
  if (rows.length > MAX_ROWS) result.hasPagination = true;
  const jobs = new Map(),links = new Map();
  for (const row of rows.slice(0,MAX_ROWS)) {
    const parsed = postingNode(row,adapter,org);
    if (parsed.excluded) continue;
    if (parsed.invalid) { result.rejected++; continue; }
    const html = `<script type="application/ld+json">${JSON.stringify(parsed.node).replace(/</g,'\\u003c')}</script>`;
    const extracted = extractVacancies(html,{...org,jobs:adapter.boardUrl},adapter.apiUrl,
      {fetchedAt:options.fetchedAt,sourceUrl:options.sourceUrl || org.jobs || adapter.sourceUrl});
    if (!extracted.jobs.length) {
      result.rejected++;
      const label = cleanText(parsed.node.title);
      if (label) links.set(parsed.node.url,{url:parsed.node.url,label});
    }
    for (const job of extracted.jobs) {
      const remote = adapter.kind === 'lever' ? ({'on-site':'onsite',remote:'remote',hybrid:'hybrid'})[row.workplaceType] : undefined;
      jobs.set(job.id,{...job,extraction_method:result.method,...(remote ? {remote_mode:remote} : {})});
    }
  }
  result.jobs = [...jobs.values()];
  result.links = [...links.values()].filter(link => !result.jobs.some(job => job.url === link.url));
  result.explicitEmpty = rows.length === 0 && !adapter.pageOffset && !result.hasPagination;
  result.complete = !result.hasPagination && !result.rejected && !result.malformed && !result.jobs.some(job => job.description_truncated);
  return result;
}
