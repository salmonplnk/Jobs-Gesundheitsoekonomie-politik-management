import { canonicalUrl, extractVacancies, isAllowedUrl, isPublicAddress, safePublicUrl, scopedListingUrl, matchesOrganizationScope } from './job-extraction.mjs';

export const CRAWL_LIMITS = Object.freeze({maxListingPages:8,maxDetails:12,maxJobs:60,maxPendingPages:5000,detailConcurrency:2,maxBytes:1500000,timeoutMs:7000,maxRedirects:3});

/** Resolver injection makes DNS checks testable without performing network requests. */
async function fetchPublicDocument(url,org,{resolver,fetcher = fetch,signal,limits:configuredLimits = CRAWL_LIMITS} = {},format = 'html') {
  const limits = {...CRAWL_LIMITS,...configuredLimits};
  if (typeof resolver !== 'function') throw new Error('Öffentliche DNS-Prüfung nicht verfügbar.');
  let current = url;
  for (let redirect = 0; redirect <= limits.maxRedirects; redirect++) {
    if (!isAllowedUrl(current, org)) throw new Error('Weiterleitung oder Link zu einer nicht freigegebenen Quelle.');
    const target = safePublicUrl(current);
    const timeout = AbortSignal.timeout(limits.timeoutMs);
    const localSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    localSignal.throwIfAborted();
    let onAbort;
    const addresses = await Promise.race([
      resolver(target.hostname),
      new Promise((_,reject) => { onAbort = () => reject(new Error('Zeitlimit der Quelle erreicht.')); localSignal.addEventListener('abort',onAbort,{once:true}); }),
    ]).finally(() => localSignal.removeEventListener('abort',onAbort));
    if (!Array.isArray(addresses) || !addresses.length || addresses.some(address => !isPublicAddress(address))) {
      throw new Error('Quelle besitzt keine sicher prüfbare öffentliche Netzwerkadresse.');
    }
    const response = await fetcher(target.href, {
      redirect:'manual', signal:localSignal,
      headers:{'User-Agent':'SwissHealthJobs/2.0 (+vacancy index; bounded requests)', Accept:format === 'json' ? 'application/json' : 'text/html,application/xhtml+xml'},
    });
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirect === limits.maxRedirects) throw new Error('Zu viele oder ungültige Weiterleitungen.');
      const next = safePublicUrl(location, target.href);
      if (!next || !isAllowedUrl(next.href, org)) throw new Error('Weiterleitung zu einer nicht freigegebenen Quelle.');
      current = next.href;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Quelle antwortet mit HTTP ${response.status}.`);
    }
    const mime = response.headers.get('content-type') || '';
    const acceptedMime = format === 'json' ? /^(?:application\/(?:[a-z0-9.-]+\+)?json)(?:;|$)/i : /^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i;
    if (!acceptedMime.test(mime)) {
      await response.body?.cancel();
      throw new Error(format === 'json' ? 'Quelle liefert keine auslesbaren JSON-Daten.' : 'Quelle liefert keine auslesbare HTML-Seite.');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Quelle liefert keinen Inhalt.');
    const decoder = new TextDecoder();
    let bytes = 0, html = '', truncated = false;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        if (bytes + value.length > limits.maxBytes) {
          html += decoder.decode(value.subarray(0, Math.max(0, limits.maxBytes - bytes)), {stream:true});
          truncated = true;
          await reader.cancel();
          break;
        }
        bytes += value.length;
        html += decoder.decode(value, {stream:true});
      }
      html += decoder.decode();
    } finally { reader.releaseLock(); }
    if (format === 'json') {
      if (truncated) throw new Error('JSON-Quelle überschreitet das Grössenlimit.');
      try { return {data:JSON.parse(html),url:target.href,truncated:false}; }
      catch { throw new Error('JSON-Quelle liefert ungültige Daten.'); }
    }
    return {html,url:target.href,truncated};
  }
  throw new Error('Quelle konnte nicht geladen werden.');
}


/** Public HTTPS transport; callers apply robots and host pacing policy. */
export function fetchPublicPage(url,org,options = {}) { return fetchPublicDocument(url,org,options,'html'); }
export function fetchPublicJson(url,org,options = {}) { return fetchPublicDocument(url,org,options,'json'); }

async function mapLimited(items,concurrency,fn) {
  let next = 0;
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

/** Bounded breadth-first listing traversal followed by deduplicated details.
 * Limits are per employer; scheduled workers may raise the Edge defaults.
 * Missing content from an incomplete source never implies a vacancy has closed.
 */
export async function crawlOrganization(org,fetchPage,{signal,limits:configuredLimits = CRAWL_LIMITS,now = () => new Date().toISOString(),fetchJson,previousJobs = []} = {}) {
  const limits = {...CRAWL_LIMITS,...configuredLimits};
  for (const key of ['maxListingPages','maxDetails','maxJobs','maxPendingPages','detailConcurrency']) {
    if (!Number.isInteger(limits[key]) || limits[key] < 0) throw new TypeError(`Invalid crawl limit: ${key}`);
  }
  const checkedAt = now();
  const source = {org_id:org.id,name:org.name,url:org.jobs || org.main || '',status:'unsupported',
    checked_at:checkedAt,job_count:0,message:'',cached:false,pages_scanned:0,detail_pages_scanned:0,
    pending_pages:0,coverage:'unknown',method:'html',excluded_jobs:0};
  if (!org.jobs) return {jobs:[],source:{...source,message:'Keine Karriereseite im Katalog hinterlegt.'}};
  const root = canonicalUrl(org.jobs);
  if (!root || !isAllowedUrl(root,org)) return {jobs:[],source:{...source,status:'error',message:'Keine sichere öffentliche HTTPS-Karriereseite hinterlegt.'}};
  const queue = [{url:root,kind:'entry'}],queued = new Set([root]),visited = new Set(),details = new Map(),jobs = new Map();
  const notes = new Set(),methods = new Set(),unresolved = new Set(),excluded = new Set();
  const scoped = Array.isArray(org.scope_terms) && org.scope_terms.some(term => typeof term === 'string' && term.trim());
  let listingAttempts = 0,listingFailures = 0,detailFailures = 0,detailUnsupported = 0;
  let listingEvidence = false,explicitEmpty = false,terminalUnknown = 0,expectedCount = 0;
  const remember = job => {
    if (!matchesOrganizationScope(job,org)) { if (!jobs.has(job.id)) excluded.add(job.id); return; }
    excluded.delete(job.id);
    if (jobs.has(job.id) || jobs.size < limits.maxJobs) jobs.set(job.id,job);
    else { unresolved.add(job.url); notes.add(`Ergebnis auf ${limits.maxJobs} Stellen begrenzt.`); }
  };
  const enqueueListing = link => {
    const key = canonicalUrl(link.url);
    if (!key || queued.has(key) || visited.has(key)) return;
    if (queued.size + details.size >= limits.maxPendingPages) { unresolved.add(key); notes.add('Seiten-Warteschlange erreicht das Sicherheitslimit.'); return; }
    queued.add(key); queue.push({...link,url:key});
  };
  const enqueueDetail = link => {
    const key = canonicalUrl(link.url);
    if (!key || visited.has(key) || details.has(key) || queued.has(key)) return;
    if (queued.size + details.size >= limits.maxPendingPages) { unresolved.add(key); notes.add('Seiten-Warteschlange erreicht das Sicherheitslimit.'); return; }
    details.set(key,{...link,url:key});
  };
  const providers = [];
  if (fetchJson) {
    const [ats,prospective] = await Promise.all([import('./job-ats-adapters.mjs'),import('./job-prospective-adapter.mjs')]);
    providers.push({detect:ats.detectAdapter,fetchOrg:ats.adapterFetchOrg,normalize:ats.normalizeAdapterPayload},
      {detect:prospective.detectProspectiveAdapter,fetchOrg:prospective.prospectiveFetchOrg,normalize:prospective.normalizeProspectivePayload});
  }
  while (queue.length && listingAttempts < limits.maxListingPages && !signal?.aborted) {
    const entry = queue.shift();
    if (visited.has(entry.url)) continue;
    visited.add(entry.url); listingAttempts++;
    let page,parsed,usedAdapter = false;
    try {
      const selected = providers.map(provider => ({provider,adapter:provider.detect(org,entry.url)})).find(item => item.adapter);
      if (selected) {
        const {adapter,provider} = selected;
        try {
          const data = await fetchJson(adapter.apiUrl,provider.fetchOrg(adapter,org),{signal,limits});
          parsed = provider.normalize(adapter,data.data,org,{fetchedAt:checkedAt,sourceUrl:org.jobs});
          if (data.truncated) throw new Error('Datenantwort unvollständig.');
          page = {url:entry.url,truncated:false}; usedAdapter = true;
          methods.add(parsed.method || adapter.kind);
          if (parsed.nextApiUrl) enqueueListing({url:parsed.nextApiUrl,kind:'adapter'});
        } catch (error) {
          notes.add(`Öffentlicher Datenadapter nicht vollständig verfügbar: ${error?.message || 'Abruf fehlgeschlagen'}`);
          if (entry.kind === 'adapter') throw error;
        }
      }
      if (!usedAdapter) {
        page = await fetchPage(entry.url,org,{signal,limits});
        const pageKey = canonicalUrl(page.url);
        if (!pageKey || !isAllowedUrl(pageKey,org) || !scopedListingUrl(pageKey,entry.url,org)) throw new Error('Arbeitgeberfilter ging bei einer Weiterleitung verloren oder die Quelle ist nicht freigegeben.');
        if (pageKey !== entry.url && visited.has(pageKey)) continue;
        visited.add(pageKey);
        parsed = extractVacancies(page.html,org,page.url,{fetchedAt:checkedAt});
        methods.add('html');
      }
      source.pages_scanned++;
      if (page.truncated) { unresolved.add(entry.url); notes.add('Mindestens eine Listenseite überschreitet das Grössenlimit.'); }
      if (parsed.malformed) { unresolved.add(entry.url); notes.add('Strukturierte Quelldaten sind teilweise ungültig.'); }
      if (parsed.rejected) { unresolved.add(entry.url); notes.add(`${parsed.rejected} Einträge ohne verifizierbaren Einzellink oder vollständigen Beschrieb.`); }
      if (parsed.dynamicPagination || parsed.blockedPagination) { unresolved.add(entry.url); notes.add('Weitere Ergebnisse benötigen einen Datenadapter oder einen unverändert gefilterten Folgeseitenlink.'); }
      if (usedAdapter && parsed.hasPagination && !parsed.nextApiUrl) { unresolved.add(entry.url); notes.add('Der Datenadapter meldet weitere Ergebnisse ohne sicher auslesbaren Folgeseitenlink.'); }
      if (parsed.blockedEntries) { unresolved.add(entry.url); notes.add('Mindestens ein Karriereportal konnte nicht sicher im Arbeitgeberfilter verfolgt werden.'); }
      if (parsed.unsupportedDetails?.length) {
        for (const link of parsed.unsupportedDetails) unresolved.add(link.url);
        notes.add(`${parsed.unsupportedDetails.length} Stellenbeschriebe in Dokumentdateien benötigen einen eigenen Extraktor.`);
      }
      if (Number.isFinite(parsed.expectedCount)) expectedCount = Math.max(expectedCount,parsed.expectedCount);
      const evidence = usedAdapter ? parsed.complete || parsed.jobs.length > 0 || parsed.explicitEmpty : parsed.listingEvidence;
      listingEvidence ||= !!evidence;
      explicitEmpty ||= !!parsed.explicitEmpty;
      const nextListings = parsed.listingLinks || [];
      if (!evidence && !nextListings.length && !parsed.nextApiUrl) terminalUnknown++;
      for (const job of parsed.jobs) {
        remember(job);
        // Full public API records already contain complete vacancy descriptions.
        if (!usedAdapter && job.url !== canonicalUrl(page.url)) enqueueDetail({url:job.url,label:job.title});
      }
      for (const link of parsed.links || []) enqueueDetail(link);
      for (const link of nextListings) enqueueListing(link);
    } catch (error) {
      listingFailures++; unresolved.add(entry.url);
      notes.add(error?.message || 'Listenseite konnte nicht abgerufen werden.');
    }
  }
  if (queue.length) notes.add(`Listenabruf auf ${limits.maxListingPages} Seiten begrenzt; ${queue.length} Folgeseiten offen.`);
  const previous = new Map((Array.isArray(previousJobs) ? previousJobs : []).map(job => [canonicalUrl(job.url),job]));
  const lastSeen = link => {
    const job = previous.get(link.url);
    return job ? (Date.parse(job.last_seen || job.last_seen_at || job.fetched_at || '') || 0) : -Infinity;
  };
  const detailQueue = [...details.values()].filter(link => !visited.has(link.url)).sort((a,b) => lastSeen(a) - lastSeen(b));
  if (detailQueue.length > limits.maxDetails) notes.add(`Detailabruf auf ${limits.maxDetails} von ${detailQueue.length} Links begrenzt.`);
  await mapLimited(detailQueue.slice(0,limits.maxDetails),Math.max(1,limits.detailConcurrency),async link => {
    if (signal?.aborted) return;
    visited.add(link.url);
    try {
      const page = await fetchPage(link.url,org,{signal,limits});
      if (!isAllowedUrl(page.url,org)) throw new Error('Nicht freigegebene Detailquelle.');
      source.detail_pages_scanned++;
      const parsed = extractVacancies(page.html,org,page.url,{fetchedAt:checkedAt,detail:true});
      if (page.truncated || parsed.rejected || parsed.malformed) { detailFailures++; unresolved.add(link.url); }
      if (!parsed.jobs.length) { detailUnsupported++; unresolved.add(link.url); }
      for (const job of parsed.jobs) remember(job);
    } catch { detailFailures++; unresolved.add(link.url); }
  });
  if (signal?.aborted) notes.add('Zeitlimit erreicht; die Quelle wurde nicht vollständig geprüft.');
  if (detailFailures) notes.add(`${detailFailures} Detailseiten nicht vollständig abrufbar.`);
  if (detailUnsupported) notes.add(`${detailUnsupported} Links liefern keine sicher auslesbare Einzelstelle.`);
  const returned = [...jobs.values()];
  source.excluded_jobs = excluded.size;
  if (expectedCount > jobs.size + excluded.size) { unresolved.add(root); notes.add(`Die Quelle nennt ${expectedCount} Stellen; ${jobs.size + excluded.size} vollständige Beschriebe wurden erfasst.`); }
  if (excluded.size) notes.add(`${excluded.size} Stellen ohne belegte Zugehörigkeit zur gewählten Organisation ausgeschlossen.`);
  if (scoped && !returned.length) notes.add('Keine Stelle ist anhand der konfigurierten Organisationsbegriffe sicher zuordenbar; daraus folgt keine Leermeldung des Arbeitgebers.');
  if (returned.some(job => job.description_truncated)) notes.add('Mindestens ein Stellenbeschrieb wurde bei 30’000 Zeichen gekürzt.');
  source.pending_pages = new Set([...queue.filter(link => !visited.has(link.url)).map(link => link.url),...detailQueue.filter(link => !visited.has(link.url)).map(link => link.url),...unresolved]).size;
  const incomplete = notes.size > 0 || source.pending_pages > 0 || terminalUnknown > 0;
  source.coverage = listingEvidence ? (incomplete ? 'partial' : 'complete') : 'unknown';
  if (scoped && !returned.length) source.coverage = 'unknown';
  source.status = returned.length ? (source.coverage === 'complete' ? 'ok' : 'partial') :
    (explicitEmpty && source.coverage === 'complete' ? 'empty' : (listingFailures && !source.pages_scanned ? 'error' : 'unsupported'));
  source.method = [...methods].join('+') || 'html';
  source.job_count = returned.length;
  source.message = [...notes].join(' ') || (source.status === 'ok' ? (methods.has('html') ? 'Alle erkannten Listen- und Einzelstellen-Seiten vollständig durchlaufen.' : 'Öffentliche Stellenliste und vollständige Beschriebe über den Datenadapter erfasst.') :
    source.status === 'empty' ? 'Die Quelle meldet ausdrücklich keine offenen Stellen.' :
    'Keine verlässlich vollständig auslesbare Stellenliste; die Quelle benötigt möglicherweise JavaScript oder einen eigenen Datenadapter.');
  return {jobs:returned,source};
}
