import { lookup } from 'node:dns/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import robotsParser from 'robots-parser';
import { isAllowedUrl, isPublicAddress, safePublicUrl } from '../supabase/functions/_shared/job-extraction.mjs';
import { fetchPublicPage } from '../supabase/functions/_shared/job-crawler.mjs';

export const USER_AGENT = 'SwissHealthJobs/3.0 (+public vacancy index; respects robots.txt)';
export const NETWORK_LIMITS = Object.freeze({maxBytes:2_000_000, timeoutMs:20_000, maxRedirects:5,
  maxDetails:500, maxJobs:2000, maxListingPages:50, maxPendingPages:5000, detailConcurrency:2});
const REDIRECTS = new Set([301,302,303,307,308]);

export async function resolvePublicHost(hostname) {
  return (await lookup(hostname, {all:true, verbatim:true})).map(record => record.address);
}

function withSignal(promise, signal) {
  if (!signal) return promise;
  signal.throwIfAborted();
  let listener;
  return Promise.race([promise, new Promise((_, reject) => {
    listener = () => reject(signal.reason || new Error('Zeitlimit der Quelle erreicht.'));
    signal.addEventListener('abort', listener, {once:true});
  })]).finally(() => signal.removeEventListener('abort', listener));
}

/** Shared hosts (including ATS services) get serial, spaced request starts. */
export function createHostScheduler({delayMs = 1100, clock = Date.now, wait = sleep} = {}) {
  const queues = new Map(), lastAt = new Map();
  return async function schedule(host, crawlDelayMs = 0, signal) {
    const previous = queues.get(host) || Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => {
      signal?.throwIfAborted();
      const delay = lastAt.has(host) ? Math.max(0, lastAt.get(host) + Math.max(delayMs, crawlDelayMs) - clock()) : 0;
      if (delay) await wait(delay, undefined, {signal});
      signal?.throwIfAborted();
      lastAt.set(host, clock());
    });
    queues.set(host, pending);
    await withSignal(pending, signal);
  };
}

async function limitedBody(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { await reader.cancel(); throw new Error('Antwort überschreitet das Grössenlimit.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

export function looksLikeChallenge(html) {
  return /<title[^>]*>\s*(?:just a moment|attention required|access denied|security check|verify (?:you|your)|robot check)/i.test(html) ||
    /(?:cf-chl-(?:widget|challenge)|id=["']challenge-form|please (?:complete|solve) the captcha|verify you are human)/i.test(html);
}

/** Chromium's route handler need not re-run for HTTP redirects. Resolve each one here. */
export async function fetchBrowserResource(network, url, org, options = {}) {
  let current = url;
  for (let redirect = 0; redirect <= network.limits.maxRedirects; redirect++) {
    const response = await network.forOrganization(org)(current, options);
    if (!REDIRECTS.has(response.status)) return {response, url:current};
    const location = response.headers.get('location');
    const next = location ? safePublicUrl(location, current) : null;
    await response.body?.cancel();
    if (!next || redirect === network.limits.maxRedirects) throw new Error('Dynamische Weiterleitung ungültig oder zu lang.');
    current = next.href;
  }
  throw new Error('Dynamische Quelle konnte nicht geladen werden.');
}

/** One guard covers HTML, documented ATS JSON, redirects, and browser resources. */
export function createPublicNetwork({fetcher = fetch, resolver = resolvePublicHost,
  limits = NETWORK_LIMITS, delayMs = 1100, schedule = createHostScheduler({delayMs})} = {}) {
  const robots = new Map();
  async function validate(url, org, signal) {
    const target = safePublicUrl(url);
    if (!target || !isAllowedUrl(target.href, org)) throw new Error('Quelle oder Weiterleitung nicht freigegeben.');
    const addresses = await withSignal(resolver(target.hostname), signal);
    if (!addresses?.length || addresses.some(address => !isPublicAddress(address))) throw new Error('Keine öffentliche Netzwerkadresse.');
    return target;
  }
  async function loadRobots(origin, org) {
    const signal = AbortSignal.timeout(limits.timeoutMs);
    let url = `${origin}/robots.txt`;
    for (let redirects = 0; redirects <= limits.maxRedirects; redirects++) {
      const target = await validate(url, org, signal);
      await schedule(target.hostname, 0, signal);
      const response = await fetcher(target.href, {redirect:'manual', signal,
        headers:{'User-Agent':USER_AGENT, Accept:'text/plain'}});
      if (REDIRECTS.has(response.status)) {
        const location = response.headers.get('location');
        const next = location ? safePublicUrl(location, target.href) : null;
        await response.body?.cancel();
        if (!next || redirects === limits.maxRedirects) throw new Error('robots.txt: ungültige Weiterleitung.');
        url = next.href; continue;
      }
      if ([404,410].includes(response.status)) { await response.body?.cancel(); return robotsParser(`${origin}/robots.txt`, ''); }
      if (!response.ok) { await response.body?.cancel(); throw new Error(`robots.txt nicht verifizierbar (HTTP ${response.status}); Abruf ausgelassen.`); }
      const body = (await limitedBody(response, 512_000)).toString('utf8');
      if (/^\s*(?:<!doctype html|<html)/i.test(body) || looksLikeChallenge(body)) throw new Error('robots.txt liefert eine Schutz- oder HTML-Seite; Abruf ausgelassen.');
      return robotsParser(`${origin}/robots.txt`, body);
    }
    throw new Error('robots.txt konnte nicht geprüft werden.');
  }
  async function allowed(url, org, {signal} = {}) {
    const target = safePublicUrl(url);
    if (!target || !isAllowedUrl(target.href, org)) throw new Error('Quelle nicht freigegeben.');
    if (!robots.has(target.origin)) robots.set(target.origin, loadRobots(target.origin, org));
    const policy = await withSignal(robots.get(target.origin), signal);
    if (policy.isAllowed(target.href, USER_AGENT) === false) throw new Error('robots.txt untersagt diesen Abruf.');
    const seconds = Number(policy.getCrawlDelay(USER_AGENT));
    return {target, crawlDelayMs:Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : 0};
  }
  function forOrganization(org) {
    return async (url, init = {}) => {
      const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(limits.timeoutMs)]) : AbortSignal.timeout(limits.timeoutMs);
      const {target, crawlDelayMs} = await allowed(url, org, {signal});
      await validate(target.href, org, signal);
      await schedule(target.hostname, crawlDelayMs, signal);
      // Deliberately forward neither cookies nor Authorization, even from browser requests.
      return fetcher(target.href, {method:'GET', redirect:'manual', signal,
        headers:{'User-Agent':USER_AGENT, Accept:new Headers(init.headers).get('accept') || '*/*'}});
    };
  }
  async function page(url, org, options = {}) {
    await allowed(url, org, options); // Give robots.txt its own request budget.
    const result = await fetchPublicPage(url, org, {...options, limits, resolver, fetcher:forOrganization(org)});
    if (looksLikeChallenge(result.html)) throw new Error('Zugriffsschutz oder CAPTCHA erkannt; kein Umgehungsversuch.');
    return result;
  }
  async function json(url, org, options = {}) {
    await allowed(url, org, options);
    const {fetchPublicJson} = await import('../supabase/functions/_shared/job-crawler.mjs');
    if (!fetchPublicJson) throw new Error('JSON-Adapter nicht verfügbar.');
    return fetchPublicJson(url, org, {...options, limits, resolver, fetcher:forOrganization(org)});
  }
  return {page, json, allowed, forOrganization, limits};
}

/** Public JS rendering only: no persisted sessions, credentials, forms, or CAPTCHA solving. */
export async function createBrowserRenderer(network, {launch} = {}) {
  const chromium = launch ? null : (await import('playwright')).chromium;
  const browser = await (launch || (options => chromium.launch(options)))({headless:true});
  return {
    async page(url, org, {signal} = {}) {
      const initial = await network.page(url, org, {signal}); // Resolve main redirects before navigation.
      signal?.throwIfAborted();
      const context = await browser.newContext({userAgent:USER_AGENT, serviceWorkers:'block', acceptDownloads:false});
      const onAbort = () => { void context.close().catch(() => {}); };
      signal?.addEventListener('abort', onAbort, {once:true});
      let failures = 0, requests = 0;
      try {
        await context.routeWebSocket('**/*', socket => socket.close());
        await context.route('**/*', async route => {
          const request = route.request();
          if (['image','font','media','stylesheet'].includes(request.resourceType())) return route.abort();
          if (request.method() !== 'GET' || ++requests > 100) { failures++; return route.abort(); }
          try {
            const {response, url:finalUrl} = await fetchBrowserResource(network, request.url(), org, {signal});
            let body = await limitedBody(response, network.limits.maxBytes);
            const headers = Object.fromEntries([...response.headers].filter(([key]) =>
              !['set-cookie','content-encoding','content-length','transfer-encoding','location'].includes(key)));
            if (/html/i.test(headers['content-type'] || '') && looksLikeChallenge(body.toString('utf8'))) throw new Error('Zugriffsschutz erkannt.');
            if (request.resourceType() === 'document' && finalUrl !== request.url()) {
              const escaped = finalUrl.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
              body = Buffer.from(body.toString('utf8').replace(/<head\b[^>]*>/i, match => `${match}<base href="${escaped}">`));
              failures++; // Browser address differs: conservatively label incomplete rendering.
            }
            if (response.status >= 400) failures++;
            await route.fulfill({status:response.status, headers, body});
          } catch { failures++; await route.abort().catch(() => {}); }
        });
        const page = await context.newPage();
        const response = await page.goto(initial.url, {waitUntil:'domcontentloaded', timeout:network.limits.timeoutMs});
        if (response && !response.ok()) throw new Error(`Dynamische Quelle antwortet mit HTTP ${response.status()}.`);
        await page.waitForLoadState('networkidle', {timeout:10_000}).catch(() => { failures++; });
        signal?.throwIfAborted();
        const html = await page.content();
        if (looksLikeChallenge(html)) throw new Error('Zugriffsschutz oder CAPTCHA erkannt; kein Umgehungsversuch.');
        if (!isAllowedUrl(page.url(), org)) throw new Error('Dynamische Weiterleitung nicht freigegeben.');
        return {html:html.slice(0, network.limits.maxBytes), url:page.url(),
          truncated:failures > 0 || initial.truncated || Buffer.byteLength(html) > network.limits.maxBytes, rendered:true};
      } finally {
        signal?.removeEventListener('abort', onAbort);
        await context.close();
      }
    },
    close:() => browser.close(),
  };
}
