import {canonicalUrl, cleanText, extractVacancies, matchesOrganizationScope, safePublicUrl} from './job-extraction.mjs';

/** Public feeds explicitly declared by official employer frontends, verified
 * 2026-09-22 with HTTP 200 and matching medium_id (no endpoint guessing):
 * jobs.admin.ch/careercenter/1000624/static/index-B28v8xCu.js
 * jobs.inselgruppe.ch/careercenter/1000666/static/bundle.js
 * jobs.visana.ch/careercenter/1004518/static/index-BhLnfCCv.js
 * jobs.usz.ch/careercenter/1001134/static/index-eME6Qz9W.js
 * These set baseUrl=https://ohws.prospective.ch/public/v1/medium/{id} and GET
 * /jobs with lang, offset, limit, repeated f filters. USB's public Jobs bundle
 * GETs /.rest/jobs/search; its response medium_id is 1005524.
 */
const BOARDS = Object.freeze({
  'jobs.admin.ch':{medium:'1000624',shared:true},
  'jobs.inselgruppe.ch':{medium:'1000666'},
  'jobs.visana.ch':{medium:'1004518'},
  'jobs.usz.ch':{medium:'1001134'},
  'www.unispital-basel.ch':{medium:'1005524',apiBase:'https://www.unispital-basel.ch/.rest/jobs/search',
    detailHost:'job.unispital-basel.ch',sourcePaths:['/jobs-und-karriere/Jobs']},
});
const API_ORIGIN = 'https://ohws.prospective.ch';
const PAGE_SIZE = 100;
// AG asset-manifest -> frontend bundle fetch(`${n}/jobs`). CHUV home.html form
// data-url + local.js GET(serialized form + p_summary/order). Listings only.
const LISTING_FEEDS = Object.freeze({
  ag:{medium:'ag-public',apiUrl:'https://www.ag.ch/io/jobs-proxy/jobs',boardUrl:'https://jobs.ag.ch',method:'aargau-public-api',
    sources:['https://www.ag.ch/de/ueber-uns/jobs-karriere','https://www.ag.ch/de/ueber-uns/jobs-karriere/offene-stellen']},
  chuv:{medium:'chuv-public',
    apiUrl:'https://recrutement.chuv.ch/utf8/ic_job_feeds.feed_engine?p_web_site_id=5352&p_published_to=WWW&p_language=DEFAULT&p_direct=Y&p_format=MOBILE&p_summary=Y&p_order=DATE_ON',
    boardUrl:'https://recrutement.chuv.ch',method:'chuv-public-api',
    sources:['https://recrutement.chuv.ch/home.html','https://www.chuv.ch/fr/chuv-home/recrutement']},
});
const string = value => typeof value === 'string' ? value : '';
const text = value => cleanText(string(value));
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const filters = url => url.searchParams.getAll('f').sort();

function listingFeed(org,url) {
  const feed = LISTING_FEEDS[org?.id];
  if (!feed) return null;
  const source = safePublicUrl(org.jobs);
  if (!source || !feed.sources.includes(`${source.origin}${source.pathname.replace(/\/$/,'')}`)) return null;
  const isApi = canonicalUrl(url.href) === canonicalUrl(feed.apiUrl);
  if (!isApi && !feed.sources.includes(`${url.origin}${url.pathname.replace(/\/$/,'')}`)) return null;
  if (!isApi && url.search) return null;
  return {kind:'prospective',flavor:'listing-links',tenant:feed.medium,medium:feed.medium,boardUrl:feed.boardUrl,
    sourceUrl:canonicalUrl(org.jobs),apiUrl:feed.apiUrl,pageOffset:0,pageSize:5000,shared:false,method:feed.method};
}

function boardForOrganization(org,candidate) {
  const source = safePublicUrl(org?.jobs);
  if (source && BOARDS[source.hostname]) return {source,board:BOARDS[source.hostname]};
  const main = safePublicUrl(org?.main),root = main?.hostname.replace(/^www\./,'');
  if (!root) return null;
  const match = Object.entries(BOARDS).find(([host,board]) => !board.shared && (host === root || host.endsWith(`.${root}`)) &&
    (candidate.hostname === host || candidate.pathname === `/public/v1/medium/${board.medium}/jobs`));
  return match ? {source:new URL(`https://${match[0]}/`),board:match[1]} : null;
}

/** An optional HTML script declaration must match the verified career center. */
export function detectProspectiveAdapter(org,rawUrl = org?.jobs,html = '') {
  const url = safePublicUrl(rawUrl);
  if (!url || url.searchParams.has('intranet')) return null;
  const linkedFeed = listingFeed(org,url);
  if (linkedFeed) return linkedFeed;
  const known = boardForOrganization(org,url);
  if (!known) return null;
  const {source,board} = known;
  if (source.searchParams.has('intranet')) return null;
  const endpoint = new URL(board.apiBase || `${API_ORIGIN}/public/v1/medium/${board.medium}/jobs`);
  const isApi = url.origin === endpoint.origin && url.pathname === endpoint.pathname;
  if (!isApi && url.hostname !== source.hostname) return null;
  if (!isApi && url.pathname !== '/' && !/^\/careercenter\//.test(url.pathname) && !board.sourcePaths?.includes(url.pathname)) return null;
  const declared = [...String(html).matchAll(/\/careercenter\/(\d+)\/static\//g)].map(match => match[1]);
  if (declared.length && !declared.every(id => id === board.medium)) return null;
  const sourceFilters = filters(source);
  if (sourceFilters.some(value => !/^[a-z0-9_-]+:\d+(?:,\d+)*$/i.test(value))) return null;
  if (board.shared && !sourceFilters.some(value => /^verwaltungseinheit(?:_\d+)?:\d+(?:,\d+)*$/.test(value))) return null;
  if (JSON.stringify(filters(url)) !== JSON.stringify(sourceFilters)) return null;
  const language = source.searchParams.get('lang') || 'de';
  if (!['de','fr','it','en'].includes(language)) return null;
  const offsetText = isApi ? (url.searchParams.get('offset') || '0') : '0';
  if (!/^\d{1,7}$/.test(offsetText) || Number(offsetText) > 1000000) return null;
  if (isApi && url.searchParams.get('lang') !== language) return null;
  const apiUrl = new URL(endpoint.href);
  apiUrl.searchParams.set('lang',language); apiUrl.searchParams.set('offset',offsetText); apiUrl.searchParams.set('limit',String(PAGE_SIZE));
  for (const filter of sourceFilters) apiUrl.searchParams.append('f',filter);
  return {kind:'prospective',tenant:board.medium,medium:board.medium,boardUrl:`https://${board.detailHost || source.hostname}`,
    sourceUrl:canonicalUrl(source.href),apiUrl:apiUrl.href,pageOffset:Number(offsetText),pageSize:PAGE_SIZE,shared:!!board.shared};
}

function validate(adapter,org) {
  const known = detectProspectiveAdapter(org,adapter?.apiUrl);
  if (!known || known.apiUrl !== adapter.apiUrl || known.medium !== adapter.medium || known.boardUrl !== adapter.boardUrl || known.flavor !== adapter.flavor) {
    throw new Error('Ungültige oder nicht zugeordnete Prospective-Quelle.');
  }
  return known;
}

export function prospectiveFetchOrg(adapter,org) {
  validate(adapter,org);
  return {...org,jobs:adapter.apiUrl,allowed_hosts:[...new Set([...(org.allowed_hosts || []),new URL(adapter.apiUrl).hostname])]};
}

function employerLabels(row) {
  return Object.entries(object(row.attributes) ? row.attributes : {}).filter(([key]) => /^verwaltungseinheit(?:_\d+)?$/.test(key))
    .flatMap(([,value]) => Array.isArray(value) ? value : [value]).filter(value => typeof value === 'string');
}

function description(szas) {
  const parts = [string(szas.sza_introduction),string(szas.sza_description)];
  for (const [label,keys] of [
    ['Aufgaben',['sza_tasks']],['Anforderungen',['sza_requirements']],['Angebot',['sza_benefits','sza_benefits_2']],
    ['Über den Arbeitgeber',['sza_company_profil']],['Weitere Informationen',['sza_additional_information','sza_contact']],
  ]) {
    const content = keys.map(key => string(szas[key])).filter(Boolean).join('\n');
    if (content) parts.push(`<h2>${label}</h2>${content}`);
  }
  return [...new Set(parts.filter(Boolean))].join('\n');
}

/** Publication end_date is not treated as an application deadline. Listing-only
 * rows are queued as detail links and never promoted from summaries to jobs. */
export function normalizeProspectivePayload(adapter,payload,org,options = {}) {
  adapter = validate(adapter,org);
  const result = {jobs:[],links:[],explicitEmpty:false,hasPagination:false,malformed:false,rejected:0,
    method:adapter.method || 'prospective-api',complete:false,nextApiUrl:null};
  if (adapter.flavor === 'listing-links') return normalizeListingFeed(adapter,payload,result);
  if (!object(payload) || String(payload.medium_id) !== adapter.medium || !Array.isArray(payload.jobs) ||
      !Number.isInteger(payload.total) || payload.total < 0 || !Number.isInteger(payload.offset) || payload.offset !== adapter.pageOffset ||
      payload.jobs.length > adapter.pageSize || payload.offset + payload.jobs.length > payload.total) return {...result,malformed:true};
  const more = payload.offset + payload.jobs.length < payload.total;
  result.hasPagination = more;
  if (more && payload.jobs.length) {
    const next = new URL(adapter.apiUrl); next.searchParams.set('offset',String(payload.offset + payload.jobs.length)); result.nextApiUrl = next.href;
  } else if (more) result.malformed = true;
  const jobs = new Map(),links = new Map();
  for (const row of payload.jobs) {
    if (!object(row)) { result.rejected++; continue; }
    const url = safePublicUrl(row.links?.directlink),title = text(row.title);
    if (!url || url.origin !== adapter.boardUrl || !/^\/(?:offene-stellen|open-positions|postes-vacants|offerte-di-lavoro)\/[^/]+\/[^/]+\/?$/i.test(url.pathname) || title.length < 4) {
      result.rejected++; continue;
    }
    const szas = object(row.szas) ? row.szas : {},labels = employerLabels(row),body = description(szas);
    const evidence = {title,hiring_organization:labels.join(' / '),description:cleanText(body)};
    const scope = {...org,scope_terms:org.scope_terms?.length ? org.scope_terms : [String(org.name || '').replace(/\([^)]*\)/g,'').trim()]};
    if (adapter.shared && !matchesOrganizationScope(evidence,scope)) { result.rejected++; continue; }
    const direct = canonicalUrl(url.href);
    if (text(szas.sza_tasks).length < 20 || text(szas.sza_requirements).length < 20) { links.set(direct,{url:direct,label:title}); continue; }
    const min = Number(szas['sza_pensum.min']),max = Number(szas['sza_pensum.max']);
    const workHours = min >= 1 && max <= 100 && min <= max ? `${min}–${max}%` : string(szas.sza_pensum);
    const employment = text(szas.sza_employment_type);
    const node = {'@type':'JobPosting',title,url:direct,description:body,workHours,
      hiringOrganization:labels.length ? {name:labels.join(' / ')} : undefined,
      jobLocation:{address:{addressLocality:szas['sza_location.city'] || szas['sza_workplace.city'],
        addressRegion:szas['sza_location.region'] || szas['sza_workplace.region'],addressCountry:szas['sza_location.country'] || szas['sza_workplace.country']}},
      employmentType:employment === 'Festanstellung' ? 'permanent' : employment,languageRequirements:szas.sza_language_requirements};
    const html = `<script type="application/ld+json">${JSON.stringify(node).replace(/</g,'\\u003c')}</script>`;
    const parsed = extractVacancies(html,{...org,jobs:adapter.boardUrl},adapter.apiUrl,{fetchedAt:options.fetchedAt,sourceUrl:options.sourceUrl || org.jobs});
    if (!parsed.jobs.length) { links.set(direct,{url:direct,label:title}); continue; }
    for (const job of parsed.jobs) jobs.set(job.id,{...job,extraction_method:result.method});
  }
  result.jobs = [...jobs.values()]; result.links = [...links.values()].filter(link => !result.jobs.some(job => job.url === link.url));
  result.explicitEmpty = payload.total === 0 && payload.offset === 0 && !result.malformed;
  result.complete = !result.hasPagination && !result.malformed && !result.rejected && !result.jobs.some(job => job.description_truncated);
  return result;
}

function normalizeListingFeed(adapter,payload,result) {
  if (!object(payload) || !Array.isArray(payload.jobs) || !Number.isInteger(payload.total) || payload.total < 0 ||
      payload.jobs.length > 5000 || payload.jobs.length > payload.total || (payload.offset != null && payload.offset !== 0)) return {...result,malformed:true};
  result.hasPagination = payload.total > payload.jobs.length;
  const links = new Map();
  for (const row of payload.jobs) {
    if (!object(row)) { result.rejected++; continue; }
    const chuv = adapter.medium === 'chuv-public';
    if (chuv && (row.status !== 'open' || row.publication?.internet?.live !== 'Y' || row.web_site_id !== 5352)) { result.rejected++; continue; }
    const url = safePublicUrl(chuv ? row.weblink : row.links?.directlink),title = text(row.title);
    const validPath = url && !/%2f|%5c/i.test(url.pathname) && (chuv ? /^\/vacancy\/[^/]+-\d+\.html$/i.test(url.pathname) : /^\/offene-stellen\/[^/]+\/[^/]+\/?$/.test(url.pathname));
    if (!url || url.origin !== adapter.boardUrl || !validPath || title.length < 4) { result.rejected++; continue; }
    const direct = canonicalUrl(url.href); links.set(direct,{url:direct,label:title});
  }
  result.links = [...links.values()]; result.explicitEmpty = payload.total === 0 && !result.rejected;
  result.complete = !result.hasPagination && !result.rejected;
  return result;
}
