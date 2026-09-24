import {attributes, canonicalUrl, cleanText, extractVacancies, isAllowedUrl, safePublicUrl} from './job-extraction.mjs';

// Official Hirslanden page redirects to this board. The board config and its
// public j2w.searchResults.min.js describe the GET tile endpoint and 50-row
// cursor. Verified pages have sequential data-row-index and employer URLs.
const HOST='careers.mediclinic.com', CATEGORY='5071201', SIZE=50, MAX=5000;
const boardPath=/^\/Hirslanden\/go\/Search-By-Keyword-MCCH\/5071201\/?$/;
const tilePath=/^\/Hirslanden\/tile-search-results\/category\/5071201\/?$/;
const detailPath=/^\/Hirslanden\/job\/[^/]+\/\d+\/?$/;
const allowedQuery=url=>[...url.searchParams.keys()].every(key=>['locale','startrow'].includes(key));

function descriptionRegion(html) {
  // Provider descriptions contain nested spans; stop at the matching closing
  // tag, not the first child's closing span and never at the global footer.
  const clean=String(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
  const tags=/<\/?span\b([^>]*)>/gi;
  let opening,depth=0;
  for(const tag of clean.matchAll(tags)) {
    const closing=/^<\//.test(tag[0]);
    if(opening===undefined) {
      if(!closing && attributes(tag[1]).itemprop==='description') {opening=tag.index+tag[0].length;depth=1;}
    } else {
      depth+=closing?-1:1;
      if(depth===0) return clean.slice(opening,tag.index);
    }
  }
  return null;
}

export function detectSuccessFactorsAdapter(org,raw=org?.jobs) {
  const root=safePublicUrl(org?.jobs), target=safePublicUrl(raw);
  if(org?.id!=='hirslanden'||!root||!target||root.hostname!==HOST||target.hostname!==HOST||!boardPath.test(root.pathname)||!allowedQuery(root)||!allowedQuery(target)||!isAllowedUrl(target.href,org)) return null;
  if(detailPath.test(target.pathname)) return {kind:'successfactors-html',detail:true};
  if(boardPath.test(target.pathname) && !target.searchParams.has('startrow')) return {kind:'successfactors-html',offset:0};
  if(!tilePath.test(target.pathname)) return null;
  const offset=target.searchParams.get('startrow');
  if(!/^\d{1,4}$/.test(offset||'')||Number(offset)<SIZE||Number(offset)>MAX||Number(offset)%SIZE) return null;
  return {kind:'successfactors-html',offset:Number(offset)};
}

export function normalizeSuccessFactorsPage(html,org,pageUrl,options={}) {
  const adapter=detectSuccessFactorsAdapter(org,pageUrl);
  if(!adapter) throw new Error('Unbekannte SuccessFactors-Arbeitgeberquelle.');
  const parsed=extractVacancies(html,org,pageUrl,options);
  if(adapter.detail) {
    const description=descriptionRegion(html),title=parsed.jobs[0]?.title||cleanText(String(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i)?.[1]||'');
    if(description&&title) {
      const location=cleanText(description).match(/Arbeitsort:\s*[^\n|]+\|\s*([^\n]+)/)?.[1];
      const node={'@type':'JobPosting',title,description,url:pageUrl,...(location?{jobLocation:{address:{addressLocality:location}}}:{})};
      const normalized=extractVacancies(`<script type="application/ld+json">${JSON.stringify(node).replace(/</g,'\\u003c')}</script>`,org,pageUrl,options);
      return {...normalized,method:adapter.kind,jobs:normalized.jobs.map(job=>({...job,extraction_method:adapter.kind}))};
    }
    // A genuine JSON-LD record remains valid; a whole-page fallback with cookie
    // controls is not a reliable replacement for the expected description.
    const jobs=parsed.jobs.filter(job=>job.extraction_method!=='html-detail');
    return {...parsed,jobs,rejected:parsed.rejected+(parsed.jobs.length-jobs.length),method:adapter.kind};
  }
  const result={...parsed,jobs:[],links:[],listingLinks:[],paginationLinks:[],hasPagination:false,
    dynamicPagination:false,blockedPagination:0,blockedEntries:0,explicitEmpty:false,
    listingEvidence:false,expectedCount:adapter.offset>0&&Number.isInteger(options.expectedCount)&&options.expectedCount>0&&options.expectedCount<=MAX?options.expectedCount:null,method:adapter.kind};
  const links=new Map(), rows=[];
  let invalid=0;
  for(const match of String(html).matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li\s*>/gi)) {
    const a=attributes(match[1]);
    if(!/(?:^|\s)job-tile(?:\s|$)/.test(a.class||'')) continue;
    const url=safePublicUrl(a['data-url'],pageUrl), index=Number(a['data-row-index']);
    const title=[...match[2].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)].find(link=>/(?:^|\s)jobTitle-link(?:\s|$)/.test(attributes(link[1]).class||''));
    const label=title && cleanText(title[2]);
    if(!url||url.hostname!==HOST||!detailPath.test(url.pathname)||!label||!Number.isInteger(index)||index!==adapter.offset+rows.length+1) {invalid++;continue;}
    rows.push(index); links.set(canonicalUrl(url.href),{url:canonicalUrl(url.href),label});
  }
  result.links=[...links.values()];
  result.listingEvidence=rows.length>0;
  result.malformed ||= invalid>0 || links.size!==rows.length || rows.length>SIZE;
  if(adapter.offset===0) {
    const endpoint=String(html).match(/apiEndpoint\s*:\s*["']([^"']+)["']/)?.[1];
    const count=String(html).match(/jobRecordsFound\s*:\s*parseInt\(\s*["'](\d+)["']\s*\)/)?.[1];
    const size=String(html).match(/jobRecordsPerPage\s*:\s*parseInt\(\s*["'](\d+)["']\s*\)/)?.[1];
    const search=String(html).match(/searchQuery\s*:\s*["']([^"']*)["']/)?.[1];
    const total=count!==undefined?Number(count):NaN;
    if(endpoint!==`tile-search-results/category/${CATEGORY}`||Number(size)!==SIZE||!Number.isSafeInteger(total)||total>MAX||search!==''||rows.length!==Math.min(total,SIZE)) result.malformed=true;
    else {
      result.expectedCount=total;
      // A provider's zero count is accepted only in its valid complete listing
      // configuration; arbitrary blank/error HTML never closes vacancies.
      result.explicitEmpty=total===0&&!rows.length;
      result.listingEvidence ||= result.explicitEmpty;
    }
  } else if(!rows.length) {
    // A blank fragment can also be a transient provider error. Reaching the
    // exact end at a multiple of 50 stays partial unless the root proves it.
    result.malformed=true;
  }
  if(!result.malformed && rows.length===SIZE && (result.expectedCount===null || result.expectedCount>adapter.offset+rows.length)) {
    const offset=adapter.offset+SIZE;
    if(offset>MAX) result.malformed=true;
    else {
      const next=new URL(`https://${HOST}/Hirslanden/tile-search-results/category/${CATEGORY}/`);
      next.searchParams.set('startrow',String(offset));
      const locale=new URL(pageUrl).searchParams.get('locale');
      if(locale) next.searchParams.set('locale',locale);
      const link={url:next.href,label:'Weitere Stellen',kind:'pagination'};
      result.listingLinks=[link];result.paginationLinks=[link];result.hasPagination=true;
    }
  }
  return result;
}
