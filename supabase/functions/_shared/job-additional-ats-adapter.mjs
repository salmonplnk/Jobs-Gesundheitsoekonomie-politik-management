import {canonicalUrl, cleanText, decodeEntities, extractVacancies, safePublicUrl} from './job-extraction.mjs';

/** Public HTML templates verified on 2026-09-24: ÖKK/Umantis published
 * data-pagination-next-href; HOCH/SAP published /search/?startrow=25;
 * FMH/Abacus announcement-container and its explicit domain/row-ID filter;
 * KSW/Solique job/details links. No private API, login or guessed job IDs. */
const SAP_HOSTS = new Set(['jobs.h-och.ch','careers.helsana.ch']);
const attr = (source,name) => decodeEntities(source.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`,'i'))?.[2] || '');
const visibleHtml = html => String(html || '').replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
const pagerKey = key => /^(?:startrow|tc\d+|_search_token\d+)$/i.test(key);

function provider(raw,org) {
  const url=safePublicUrl(raw), source=safePublicUrl(org?.jobs);
  if (!url || !source || url.origin!==source.origin || /%2f|%5c/i.test(url.pathname)) return null;
  if ((/^(?:recruitingapp-\d+\.)?umantis\.com$/i.test(url.hostname) || url.hostname==='jobs.oekk.ch') && /^\/(?:Jobs|Vacancies)\//i.test(url.pathname)) return {kind:'umantis',url,source};
  if (url.hostname.endsWith('.abacuscity.ch') && /^\/[a-z]{2}\/(?:jobportal|job_\d+_\d+)/i.test(url.pathname)) return {kind:'abacus',url,source};
  if (url.hostname==='live.solique.ch') {
    const tenant=source.pathname.split('/')[1]?.toLowerCase();
    if (tenant && url.pathname.split('/')[1]?.toLowerCase()===tenant) return {kind:'solique',tenant,url,source};
  }
  if (SAP_HOSTS.has(url.hostname)) return {kind:'successfactors',url,source};
  return null;
}
function isDetail(p) {
  return p.kind==='umantis' ? /^\/Vacancies\/\d+\/Description\/\d+\/?$/i.test(p.url.pathname) :
    p.kind==='abacus' ? /^\/[a-z]{2}\/job_\d+_\d+\/[^/]+\/?$/i.test(p.url.pathname) :
    p.kind==='solique' ? /^\/[^/]+\/job\/details\/\d+\/?$/i.test(p.url.pathname) :
    /^\/job\/[^/]+\/\d+\/?$/i.test(p.url.pathname);
}
function isListing(p) {
  if(!p?.url)return false;
  return p.kind==='umantis' ? /^\/Jobs\/All\/?$/i.test(p.url.pathname) :
    p.kind==='abacus' ? /^\/[a-z]{2}\/jobportal\/?$/i.test(p.url.pathname) :
    p.kind==='solique' ? /^\/[^/]+(?:\/[a-z]{2}\/internet)?\/?$/i.test(p.url.pathname) :
    /^\/(?:search\/?)?$/.test(p.url.pathname);
}
function preserveFilters(raw,pageUrl,org) {
  const target=safePublicUrl(decodeEntities(raw),pageUrl), current=safePublicUrl(pageUrl), root=safePublicUrl(org.jobs);
  if (!target || target.origin!==current.origin || !isListing(provider(target.href,org)||{})) return null;
  for (const scope of [root,current]) for (const key of new Set(scope.searchParams.keys())) {
    if (pagerKey(key)) continue;
    const wanted=scope.searchParams.getAll(key), got=target.searchParams.getAll(key);
    if(got.length && JSON.stringify(got)!==JSON.stringify(wanted))return null;
    if(!got.length)for(const value of wanted)target.searchParams.append(key,value);
  }
  return canonicalUrl(target.href);
}
export function detectAdditionalAdapter(org,rawUrl=org?.jobs) {
  const p=provider(rawUrl,org);
  if(!p || !isListing(p))return null;
  const url=preserveFilters(rawUrl,org.jobs,org);
  if(!url)return null;
  return {kind:p.kind,format:'html',apiUrl:url,sourceUrl:canonicalUrl(org.jobs),tenant:p.tenant || p.source.hostname};
}
function validate(adapter,org) {
  const known=detectAdditionalAdapter(org,adapter?.apiUrl);
  if(!known || known.kind!==adapter.kind || known.apiUrl!==adapter.apiUrl || known.tenant!==adapter.tenant)throw Error('Nicht zugeordnete öffentliche HTML-Quelle.');
  return known;
}
export function additionalFetchOrg(adapter,org) {validate(adapter,org);return org;}

export function normalizeAdditionalPayload(adapter,html,org,options={}) {
  adapter=validate(adapter,org);
  const result={jobs:[],links:[],listingLinks:[],explicitEmpty:false,hasPagination:false,malformed:false,rejected:0,complete:false,nextApiUrl:null,method:`${adapter.kind}-html`};
  if(typeof html!=='string' || !/<(?:html|body|a|div)\b/i.test(html))return {...result,malformed:true};
  const pageUrl=options.pageUrl || adapter.apiUrl, clean=visibleHtml(html), links=new Map(), listings=new Map();
  for(const match of clean.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const raw=attr(match[1],'href'), target=safePublicUrl(raw,pageUrl);
    if(!target)continue;
    const p=provider(target.href,org); if(!p)continue;
    if(isDetail(p)) {
      // FMH's published page explicitly hides IDs >5999 for domain=FMH.
      if(adapter.kind==='abacus' && p.source.hostname==='karriere-fmh-siwf.abacuscity.ch' && p.source.searchParams.get('domain')==='FMH' && Number(p.url.pathname.match(/job_\d+_(\d+)/)?.[1])>5999)continue;
      const url=canonicalUrl(target.href); links.set(url,{url,label:cleanText(match[2])});
    } else if(adapter.kind==='successfactors' && isListing(p) && /\/search\/?$/.test(p.url.pathname) && (p.url.searchParams.has('startrow') || !p.url.search)) {
      const url=preserveFilters(target.href,pageUrl,org);
      if(url && url!==canonicalUrl(pageUrl))listings.set(url,{url,label:'Weitere Stellen',kind:target.searchParams.has('startrow')?'pagination':'career'});
    }
  }
  let unresolvedPagination=false;
  if(adapter.kind==='umantis') {
    // Umantis publishes the next link on a web component, not as an anchor.
    const metadata=[...html.matchAll(/<table-navigation\b([^>]*)>/gi)].map(m=>{try{return JSON.parse(attr(m[1],'initial-data-string'));}catch{return null;}}).filter(Boolean);
    const data=metadata[0], pageSize=Number(data?.TableMaxEntries), total=Number(data?.TableTotalLines);
    if(data?.TableTotalLines!=null && Number.isFinite(total))result.expectedCount=total;
    const candidates=[...html.matchAll(/\bdata-pagination-next-href\s*=\s*(["'])([\s\S]*?)\1/gi)].map(m=>decodeEntities(m[2]));
    if(data?.NextLink?.EnhancedUrl)candidates.push(decodeEntities(data.NextLink.EnhancedUrl));
    if(links.size && (!pageSize || links.size>=pageSize) && (!Number.isFinite(result.expectedCount) || Number(data?.TableTo)<result.expectedCount)) {
      for(const raw of candidates){const url=preserveFilters(raw,pageUrl,org);if(url && url!==canonicalUrl(pageUrl)){listings.set(url,{url,label:'Nächste Stellen',kind:'pagination'});break;}}
      unresolvedPagination=!listings.size && (!!candidates.length || Number.isFinite(result.expectedCount) && Number(data?.TableTo)<result.expectedCount);
    }
    if(!links.size && /(?:keine (?:Einträge|Stellen)|0 Stellen|keine Suchresultate)/i.test(cleanText(clean)))result.explicitEmpty=true;
  }
  if(adapter.kind==='successfactors') {
    const count=cleanText(clean).match(/Ergebnisse\s+\d+\s*[-–]\s*\d+\s+von\s+(\d+)/i);
    if(count)result.expectedCount=Number(count[1]);
  }
  result.links=[...links.values()]; result.listingLinks=[...listings.values()];
  result.hasPagination=unresolvedPagination || result.listingLinks.some(link=>link.kind==='pagination');
  result.complete=!!(links.size || result.explicitEmpty) && !result.hasPagination;
  result.listingEvidence=!!(links.size || result.explicitEmpty);
  return result;
}

/** Balanced elements retain nested paragraphs/lists instead of cutting at the
 * first inner div. Selectors are only applied to verified provider detail URLs. */
function element(html,predicate) {
  const re=/<([a-z][\w:-]*)\b([^>]*)>/gi;
  for(let start;(start=re.exec(html));){if(!predicate(start[1].toLowerCase(),start[2]))continue;
    const tag=start[1], tokens=new RegExp(`<\\/?${tag}\\b[^>]*>`,'gi'); tokens.lastIndex=re.lastIndex;let depth=1;
    for(let token;(token=tokens.exec(html));){if(/^<\//.test(token[0]))depth--;else if(!/\/\s*>$/.test(token[0]))depth++;if(!depth)return html.slice(re.lastIndex,token.index);}
  }
  return '';
}
const byClass=(html,wanted)=>element(html,(_,a)=>attr(a,'class').split(/\s+/).includes(wanted));
const byTag=(html,wanted)=>element(html,tag=>tag===wanted);
export function extractAdditionalVacancies(html,org,pageUrl,options={}) {
  const native=extractNativeDetail(html,org,pageUrl,options);
  if(native)return native;
  const p=provider(pageUrl,org); if(!p || !isDetail(p))return {jobs:[]};
  const clean=visibleHtml(html);let title='', region='', employer='', location='', workHours='';
  if(p.kind==='abacus') {
    region=byClass(clean,'announcement-container');title=cleanText(byClass(region,'jobtitle'));employer=cleanText(byClass(region,'organization'));
    if(!byClass(region,'tasks') || !(byClass(region,'requirements') || byClass(region,'benefits')))return {jobs:[]};
  } else if(p.kind==='umantis') {
    title=cleanText(byClass(clean,'pubtitle') || byTag(clean,'h1') || byTag(clean,'title'));
    region=byClass(clean,'container_2') || byClass(clean,'content') || byTag(clean,'body');
    workHours=cleanText(byClass(clean,'arbeitsort_pensum'));
    location=workHours.replace(/^\s*\d{1,3}\s*(?:[-–]\s*\d{1,3})?\s*%\s*[,|]?\s*/,'');
  } else if(p.kind==='solique') {
    title=cleanText(byTag(clean,'h1'));region=byTag(clean,'main') || byTag(clean,'body');workHours=cleanText(byClass(clean,'workload'));
  } else {
    title=cleanText(byTag(clean,'h1'));region=byClass(clean,'jobdescription') || element(clean,(_,a)=>attr(a,'itemprop')==='description') || byTag(clean,'main');
  }
  const description=cleanText(region);
  const tasks=/(?:Aufgaben|erwartet dich|dich erwartet|Was Sie bewegen|Was du bewirkst|Herausforderung|Dein Wirkungsfeld|Responsibilities|Your tasks|Vos missions)/i.test(description);
  const requirements=/(?:Profil|bringst du mit|mitbringst|bringen Sie mit|Was Sie auszeichnet|Was dich auszeichnet|Voraussetzungen|Anforderungen|Qualifications|Requirements|Vos atouts)/i.test(description);
  if(!title || description.length<200 || !tasks || !requirements || !/(?:bewerb|bewirb|Bewerbung|apply|postuler|candidature)/i.test(cleanText(clean.replace(/<\/?footer\b[^>]*>/gi,''))))return {jobs:[]};
  const node={'@type':'JobPosting',title,description:region,url:pageUrl,workHours,...(employer?{hiringOrganization:employer}:{}),...(location?{jobLocation:{name:location}}:{})};
  const normalized=extractVacancies(`<script type="application/ld+json">${JSON.stringify(node).replace(/</g,'\\u003c')}</script>`,org,pageUrl,{...options,detail:true});
  // Some public postings offer a fixed-term workload followed by a permanent
  // contract. Keep the full stated terms instead of claiming one contract type.
  const mixedTerms=/\bbefristet\b/i.test(description) && /\bunbefristet\b/i.test(description);
  const terms=mixedTerms ? description.split('\n').filter(line=>/\b(?:un)?befristet\b/i.test(line)).join(' / ') : null;
  return {jobs:normalized.jobs.map(job=>({...job,extraction_method:`${p.kind}-html-detail`,
    ...(mixedTerms ? {employment_type:null,employment_type_raw:terms} : {})}))};
}

/** Exact employer-owned detail templates verified with full public HTML.
 * Avoid the generic first h1 on Uni Luzern and recognise their section labels. */
function extractNativeDetail(html,org,pageUrl,options) {
  const url=safePublicUrl(pageUrl), source=safePublicUrl(org?.jobs);
  if(!url || !source || url.origin!==source.origin)return null;
  const clean=visibleHtml(html);let region='',kind='',workHours='';
  if(org.id==='unilu' && url.hostname==='www.unilu.ch' && /^\/universitaet\/personal\/personaldienst\/offene-stellen\/[^/]+-\d+\/?$/.test(url.pathname)) {
    region=byClass(clean,'vacancy');kind='unilu';
    if(!byClass(region,'duties') || !byClass(region,'requirements'))return {jobs:[]};
  } else if(['wig','zhaw'].includes(org.id) && url.hostname==='www.zhaw.ch' && /^\/(?:de|en)\/jobs\/offene-stellen\/stelleninserat\/job\/detail\/\d+\/?$/.test(url.pathname)) {
    region=byClass(clean,'job-item');kind='zhaw';
  } else if(org.id==='santesuisse' && url.hostname==='www.santeservices.ch' && /^\/offene-stellen\/[^/]+\/?$/.test(url.pathname)) {
    region=element(clean,(tag,a)=>tag==='article' && attr(a,'class').split(/\s+/).includes('type-job'));kind='santeservices';workHours=cleanText(byTag(region,'blockquote'));
  } else return null;
  if(!region)return {jobs:[]};
  const title=cleanText(byTag(region,'h1')), description=cleanText(region);
  const headings=[...region.matchAll(/<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]\s*>/gi)].map(m=>cleanText(m[1])).join('\n');
  const tasks=/^(?:Aufgaben(?:bereich)?|Your role|Deine Mission(?:\s*\|.*)?)$/im.test(headings);
  const requirements=/^(?:(?:Dein |Ihr |Your )?Profil(?:e)?(?:\s*\|.*)?|Anforderungen)$/im.test(headings);
  if(!title || description.length<200 || !tasks || !requirements || !/(?:bewerben|Bewerbung|apply|application)/i.test(cleanText(clean)))return {jobs:[]};
  const node={'@type':'JobPosting',title,description:region,url:pageUrl,workHours};
  const normalized=extractVacancies(`<script type="application/ld+json">${JSON.stringify(node).replace(/</g,'\\u003c')}</script>`,org,pageUrl,{...options,detail:true});
  return {jobs:normalized.jobs.map(job=>({...job,extraction_method:`${kind}-html-detail`}))};
}
