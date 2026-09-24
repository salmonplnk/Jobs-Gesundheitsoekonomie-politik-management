import {attributes, extractVacancies, isAllowedUrl, safePublicUrl} from './job-extraction.mjs';

/** Verified SRK public board. No guessed API, tenant changes, or form requests.
 * https://www.redcross.ch/de/arbeiten-beim-srk-sinnvoll-und-herausfordernd
 * https://rexx.redcross.ch/
 * The table's order/reset links only change the same listing's UI. Treating
 * these as fresh employer scopes makes a complete board falsely partial.
 */
export function detectRexxAdapter(org, raw = org?.jobs) {
  const target = safePublicUrl(raw);
  if (org?.id !== 'srk' || !target || target.hostname !== 'rexx.redcross.ch' || !isAllowedUrl(target.href,org)) return null;
  return {kind:'rexx-html',host:target.hostname};
}

export function normalizeRexxPage(html, org, pageUrl, options = {}) {
  if (!detectRexxAdapter(org,pageUrl)) throw new Error('Unbekannte Rexx-Arbeitgeberquelle.');
  const board = safePublicUrl(org.jobs);
  // A configured filter must never be silently discarded by this adapter.
  const filteredBoard = board && [...board.searchParams.keys()].some(key => !/^(?:lang(?:uage)?|locale)$/i.test(key));
  const cleaned = filteredBoard ? String(html) : String(html).replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi,(whole,tag) => {
    const href = attributes(tag).href;
    const target = href && safePublicUrl(href,pageUrl);
    if (!target || target.hostname !== 'rexx.redcross.ch' || target.pathname !== '/stellenangebote.html') return whole;
    const keys = [...target.searchParams.keys()];
    return keys.length && keys.every(key => /^(?:order\[(?:dir|field)\]|reset_search)$/i.test(key)) ? '' : whole;
  });
  const parsed = extractVacancies(cleaned,org,pageUrl,options);
  return {...parsed,method:'rexx-html'};
}
