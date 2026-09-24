import { attributes, canonicalUrl, cleanText, extractVacancies, isAllowedUrl } from './job-extraction.mjs';

export const DOCUMENT_LIMITS = Object.freeze({maxBytes:8 * 1024 * 1024, maxTextChars:150_000});
const PDF_PATH = /\.pdf(?:$|[?#])/i;
const JOB_LABEL = /(?:stellen(?:ausschreibung|inserat|angebot)|job\s*(?:description|advert)|offre d.emploi|\d{1,3}\s*%)/i;
const JOB_FILE = /(?:job.?inserat|stellen?(?:ausschreibung|inserat|angebot)|(?:stelle|vacancy|job)[_-])/i;
const ROLE = /(?:\b(?:Projekt|Project|Programm|Program|Fach|Sach|Wissenschaft|Research|Data|Daten|Pflege|Applikations|Aussen|Außen|Verwaltungs|Geschäfts|Geschaefts|Stabs|Bereichs|Team|Stations|Abteilungs|Berat|Leit|Mitarbeit|Spezialist|Specialist|Manager|Analyst|Controller|Consultant|Referent|Ökonom|Oekonom|Economist|Jurist|Direktor|Director|Head|Senior|Junior|Responsable|Chef|Collaborat|Conseill|Infirm|Gestionnaire|Assistant|Scientist|Praktik|Doktorand|PhD|Diplomiert)[\p{L}/:*.-]*)/iu;
const GENERIC_TITLE = /^(?:Stellenausschreibung|Stelleninserat|Stellenangebot|Jobs?|PDF|Download|Mehr erfahren|Offre d.emploi)$/i;
const BROCHURE = /(?:Geschäftsbericht|Jahresbericht|Annual report|Broschüre|Versicherungsbedingungen|Datenschutz|Factsheet|Leitbild)/i;
const normalized = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const reject = reason => ({jobs:[],rejected:1,reason});

export function isJobDocumentUrl(url) { return typeof url === 'string' && PDF_PATH.test(url); }

/** Only documents linked as vacancies from an already verified public listing.
 * A filename is discovery evidence, never a job title or proof of a vacancy.
 */
export function discoverJobDocuments(html, pageUrl, org) {
  const found = new Map();
  const visible = String(html || '').replace(/<!--[^]*?-->/g,'').replace(/<(script|style|template|nav|footer)\b[^>]*>[^]*?<\/\1\s*>/gi,'');
  for (const match of visible.matchAll(/<a\b([^>]*)>([^]*?)<\/a\s*>/gi)) {
    const a = attributes(match[1]), url = canonicalUrl(a.href,pageUrl);
    if (!url || !PDF_PATH.test(url) || !isAllowedUrl(url,org)) continue;
    const label = cleanText(match[2] || a.title || a['aria-label'] || '');
    if (BROCHURE.test(label)) continue;
    let filename = new URL(url).pathname;
    try { filename = decodeURIComponent(filename); } catch { /* Malformed escapes are not evidence. */ }
    if (JOB_LABEL.test(label) || JOB_FILE.test(filename)) found.set(url,{url,label,kind:'document',sourceUrl:pageUrl});
  }
  return [...found.values()];
}

function trimLabel(label) {
  const cleaned = cleanText(label);
  // Some cards place date, role, employer and CTA inside one anchor. Use only a
  // clearly separated role line; never infer a title from the employer or CTA.
  const roleLine = cleaned.split('\n').map(line => line.trim()).find(line => plausibleTitle(line) && /\d{1,3}\s*%/.test(line));
  return (roleLine || cleaned)
    .replace(/^\d{1,2}\.\d{1,2}\.\d{4}\s+/,'')
    .replace(/\s*\(?publiziert(?: am)?\s+[^)]*\)?[^]*$/i,'')
    .replace(/\s*\(?\s*pdf\s*[,·:]?\s*\d+(?:[.,]\d+)?\s*[KM]B\s*\)?\s*$/i,'')
    .replace(/\s*[,;]\s*Arbeitsort\b[^]*$/i,'').trim();
}

function plausibleTitle(value) {
  return value.length >= 8 && value.length <= 240 && ROLE.test(value) && !GENERIC_TITLE.test(value) &&
    !BROCHURE.test(value) && !/^(?:wir |sie |ihr |ihre |unser |unsere |für |per |in dieser |als |the |we |you |nous |vous )/i.test(value) &&
    !/[.!?]$/.test(value);
}

/** A listing label may supply the title only when its words occur in the PDF.
 * Otherwise require an early document heading containing a role and workload.
 */
function verifiedTitle(text,label) {
  const cleaned = trimLabel(label), head = text.slice(0,6000), headNormalized = normalized(head);
  const words = normalized(cleaned).split(' ').filter(word => word.length > 2 && !/^\d+$/.test(word));
  const workloads = value => [...value.matchAll(/(\d{1,3})\s*(?:%?\s*[–—-]\s*(\d{1,3}))?\s*%/g)].map(match => `${Number(match[1])}-${Number(match[2] || match[1])}`);
  const advertisedWorkloads = workloads(cleaned), documentWorkloads = new Set(workloads(head));
  const workloadVerified = advertisedWorkloads.every(value => documentWorkloads.has(value));
  if (plausibleTitle(cleaned) && words.length >= 2 && workloadVerified && words.every(word => headNormalized.includes(word))) return cleaned;
  const lines = head.split('\n').map(line => line.trim()).filter(Boolean);
  for (let i = 0; i < Math.min(lines.length,45); i++) {
    const line = lines[i];
    // Workload often wraps onto the following line in a PDF heading.
    const workloadLine = /^(?:\(?\s*(?:[mwfd](?:\s*\/\s*[mwfd]){1,3}|all genders)\s*\)?\s*)?\(?\s*\d{1,3}\s*(?:[–—-]\s*\d{1,3}\s*)?%\)?/i;
    const candidate = !/\d{1,3}\s*%/.test(line) && workloadLine.test(lines[i+1] || '') ? `${line} ${lines[i+1]}` : line;
    if (plausibleTitle(candidate) && /\d{1,3}\s*%/.test(candidate)) return candidate;
  }
  return null;
}

/** The PDF must contain a real role, duties, requirements and application cue.
 * This adapter proves extraction only; the feed's relevance filter runs later.
 */
export function normalizeDocumentText(rawText, org, url, {fetchedAt = new Date().toISOString(), label = '', sourceUrl = org.jobs} = {}) {
  const canonical = canonicalUrl(url);
  if (!canonical || !isAllowedUrl(canonical,org) || !PDF_PATH.test(canonical)) return reject('Keine freigegebene PDF-Einzelstelle.');
  if (typeof rawText !== 'string' || rawText.length > DOCUMENT_LIMITS.maxTextChars) return reject('PDF-Text fehlt oder überschreitet das Grössenlimit.');
  const text = rawText.normalize('NFKC').replace(/\r\n?/g,'\n').replace(/\f/g,'\n\n').replace(/[\u0000-\u0008\u000b\u000e-\u001f]/g,'')
    .replace(/\u00ad/g,'').replace(/[\t ]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  if (text.length < 300) return reject('PDF enthält keinen vollständigen auslesbaren Stellenbeschrieb.');
  const title = verifiedTitle(text,label);
  if (!title) return reject('Kein im PDF belegter Stellentitel.');
  const duties = /(?:Aufgaben|Tätigkeiten|Tätigkeit|Verantwortung|verantworten|Sie (?:bearbeiten|prüfen|führen|leiten|entwickeln|beraten|unterstützen|übernehmen)|Du (?:bearbeitest|leitest|entwickelst|unterstützt)|Responsibilities|Your (?:role|tasks)|Vos (?:missions|tâches)|Vous (?:assurez|gérez))/i.test(text);
  const requirements = /(?:Profil|Anforderungen|Voraussetzungen|Qualifikation|Ausbildung|Grundbildung|Studium|Abschluss|Erfahrung|Sie verfügen|Sie bringen|Du bringst|Requirements|Qualifications|Your profile|Votre profil|Formation|Expérience)/i.test(text);
  const application = /(?:bewerb(?:en|ung|ungs)|apply\b|application\b|postuler|candidature)/i.test(text);
  if (!duties || !requirements || !application) return reject('PDF ist nicht als vollständige Stellenanzeige verifizierbar.');
  // Reuse canonical IDs, metadata and the shared 30,000-character truncation rule.
  // Escape angle brackets before embedding JSON so document text cannot terminate it.
  const node = {'@type':'JobPosting',title,description:text,url:canonical};
  const json = JSON.stringify(node).replace(/</g,'\\u003c').replace(/>/g,'\\u003e');
  const parsed = extractVacancies(`<script type="application/ld+json">${json}</script>`,org,canonical,{detail:true,fetchedAt,sourceUrl});
  if (!parsed.jobs.length) return reject('PDF-Stelle besteht die gemeinsame Datensatzprüfung nicht.');
  return {jobs:parsed.jobs.map(job => ({...job,extraction_method:'pdf-document'})),rejected:0,reason:null};
}

/** Fetching belongs to the caller's robots/DNS/redirect guard. No URL is fetched
 * by the extractor; a bounded binary is passed to a separately injected reader.
 */
export async function extractDocumentVacancy(document, org, {extractText,signal,...options} = {}) {
  if (document?.truncated) return reject('PDF wurde unvollständig abgerufen.');
  const bytes = document?.bytes;
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > DOCUMENT_LIMITS.maxBytes) return reject('PDF fehlt oder überschreitet das Grössenlimit.');
  if (document.contentType && !/^(?:application\/pdf|application\/octet-stream)(?:\s*;|$)/i.test(document.contentType)) return reject('Quelle liefert keine PDF-Datei.');
  if (new TextDecoder().decode(bytes.subarray(0,5)) !== '%PDF-') return reject('Datei besitzt keine PDF-Signatur.');
  if (typeof extractText !== 'function') return reject('PDF-Textleser ist in dieser Laufzeit nicht verfügbar.');
  signal?.throwIfAborted();
  const text = await extractText(bytes,{signal});
  signal?.throwIfAborted();
  return normalizeDocumentText(text,org,document.url,options);
}
