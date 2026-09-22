import { canonicalUrl, extractVacancies, isAllowedUrl, isPublicAddress, safePublicUrl } from './job-extraction.mjs';

export const CRAWL_LIMITS = Object.freeze({maxDetails:12, maxJobs:60, maxBytes:1500000, timeoutMs:7000, maxRedirects:3});

/** Resolver injection makes DNS checks testable without performing network requests. */
export async function fetchPublicPage(url, org, {resolver, fetcher = fetch, signal, limits = CRAWL_LIMITS} = {}) {
  if (typeof resolver !== 'function') throw new Error('Öffentliche DNS-Prüfung nicht verfügbar.');
  let current = url;
  for (let redirect = 0; redirect <= limits.maxRedirects; redirect++) {
    if (!isAllowedUrl(current, org)) throw new Error('Weiterleitung oder Link zu einer nicht freigegebenen Quelle.');
    const target = safePublicUrl(current);
    const timeout = AbortSignal.timeout(limits.timeoutMs);
    const localSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    localSignal.throwIfAborted();
    const addresses = await Promise.race([
      resolver(target.hostname),
      new Promise((_, reject) => localSignal.addEventListener('abort', () => reject(new Error('Zeitlimit der Quelle erreicht.')), {once:true})),
    ]);
    if (!Array.isArray(addresses) || !addresses.length || addresses.some(address => !isPublicAddress(address))) {
      throw new Error('Quelle besitzt keine sicher prüfbare öffentliche Netzwerkadresse.');
    }
    const response = await fetcher(target.href, {
      redirect:'manual', signal:localSignal,
      headers:{'User-Agent':'SwissHealthJobs/2.0 (+vacancy index; bounded requests)', Accept:'text/html,application/xhtml+xml'},
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
    if (!/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(mime)) {
      await response.body?.cancel();
      throw new Error('Quelle liefert keine auslesbare HTML-Seite.');
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
    return {html, url:target.href, truncated};
  }
  throw new Error('Quelle konnte nicht geladen werden.');
}

async function mapLimited(items, concurrency, fn) {
  const result = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({length:Math.min(concurrency, items.length)}, async () => {
    while (next < items.length) {
      const index = next++;
      result[index] = await fn(items[index]);
    }
  }));
  return result;
}

export async function crawlOrganization(org, fetchPage, {signal, limits = CRAWL_LIMITS, now = () => new Date().toISOString()} = {}) {
  const checkedAt = now();
  const source = {org_id:org.id, name:org.name, url:org.jobs || org.main || '', status:'unsupported',
    checked_at:checkedAt, job_count:0, message:'', cached:false};
  if (!org.jobs) return {jobs:[], source:{...source, message:'Keine Karriereseite im Katalog hinterlegt.'}};
  try {
    const page = await fetchPage(org.jobs, org, {signal});
    const parsed = extractVacancies(page.html, org, page.url, {fetchedAt:checkedAt});
    const jobs = new Map(parsed.jobs.map(job => [job.id, job]));
    const notes = [];
    if (page.truncated) notes.push('Die Karriereseite überschreitet das Grössenlimit.');
    if (parsed.malformed) notes.push('Strukturierte Quelldaten sind teilweise ungültig.');
    if (parsed.rejected) notes.push(`${parsed.rejected} Einträge ohne verifizierbaren Einzellink oder vollständigen Beschrieb.`);
    if (parsed.hasPagination) notes.push('Weitere Ergebnisse auf Folgeseiten werden nicht vollständig erfasst.');
    if (parsed.links.length > limits.maxDetails) notes.push(`Detailabruf auf ${limits.maxDetails} von ${parsed.links.length} Links begrenzt.`);
    const links = parsed.links.slice(0, limits.maxDetails);
    let detailFailures = 0, detailUnsupported = 0;
    await mapLimited(links, 2, async link => {
      try {
        if (signal?.aborted) throw new Error('Zeitlimit');
        const detail = await fetchPage(link.url, org, {signal});
        const result = extractVacancies(detail.html, org, detail.url, {fetchedAt:checkedAt, detail:true});
        if (detail.truncated || result.rejected || result.malformed || result.hasPagination) detailFailures++;
        if (!result.jobs.length) detailUnsupported++;
        for (const job of result.jobs) jobs.set(job.id, job);
      } catch { detailFailures++; }
    });
    if (detailFailures) notes.push(`${detailFailures} Detailseiten nicht vollständig abrufbar.`);
    if (detailUnsupported) notes.push(`${detailUnsupported} Links liefern keine sicher auslesbare Einzelstelle.`);
    const allJobs = [...jobs.values()];
    if (allJobs.length > limits.maxJobs) notes.push(`Ergebnis auf ${limits.maxJobs} von ${allJobs.length} Stellen begrenzt.`);
    const returned = allJobs.slice(0, limits.maxJobs);
    // Absence of extractable content is not evidence that an employer has no openings.
    let status = returned.length ? (notes.length ? 'partial' : 'ok') :
      (parsed.explicitEmpty && !notes.length && !links.length ? 'empty' : (detailFailures && !detailUnsupported ? 'error' : 'unsupported'));
    if (status === 'ok' && returned.some(job => job.description_truncated)) {
      status = 'partial'; notes.push('Mindestens ein Stellenbeschrieb wurde bei 30’000 Zeichen gekürzt.');
    }
    const message = notes.join(' ') || (status === 'ok' ? 'Auslesbare Einzelstellen erfasst.' :
      status === 'empty' ? 'Die Quelle meldet ausdrücklich keine offenen Stellen.' :
      'Keine verlässlich auslesbaren Einzelstellen; die Seite benötigt möglicherweise JavaScript oder einen eigenen Datenadapter.');
    return {jobs:returned, source:{...source, status, job_count:returned.length, message}};
  } catch (error) {
    return {jobs:[], source:{...source, status:'error', message:error?.message || 'Quelle konnte nicht abgerufen werden.'}};
  }
}
