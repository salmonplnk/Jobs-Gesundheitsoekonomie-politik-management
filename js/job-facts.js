/* Deterministic vacancy facts and duplicate detection. Pure functions only:
 * shared by the feed builder (Node) and the browser (older snapshots). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HealthJobFacts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DAY = 24 * 60 * 60 * 1000;
  const SENIORITY = Object.freeze(['praktikum', 'trainee', 'junior', 'senior', 'lead', 'phd']);
  const CANTONS = Object.freeze({
    AG: 'Aargau', AI: 'Appenzell Innerrhoden', AR: 'Appenzell Ausserrhoden', BE: 'Bern', BL: 'Basel-Landschaft',
    BS: 'Basel-Stadt', FR: 'Freiburg', GE: 'Genf', GL: 'Glarus', GR: 'Graubünden', JU: 'Jura', LU: 'Luzern',
    NE: 'Neuenburg', NW: 'Nidwalden', OW: 'Obwalden', SG: 'St. Gallen', SH: 'Schaffhausen', SO: 'Solothurn',
    SZ: 'Schwyz', TG: 'Thurgau', TI: 'Tessin', UR: 'Uri', VD: 'Waadt', VS: 'Wallis', ZG: 'Zug', ZH: 'Zürich'
  });
  // Official maxima (Höchstbeträge, 100 %, without Ortszuschlag) of the federal
  // pay scale valid from 1.1.2026, Art. 36 BPV; EPA "Lohntabelle ab Januar 2026".
  // The EPA publishes no minimum per class, so salary_range.min stays null.
  const BUND_LOHNKLASSEN_2026 = Object.freeze([null,
    66517, 67595, 68688, 69778, 71802, 75142, 78473, 81767, 85145, 88507,
    91831, 95237, 98703, 102265, 106508, 110810, 115425, 120923, 126391, 131870,
    137341, 142832, 149807, 158954, 167271, 175617, 183953, 192316, 201876, 216611,
    226481, 236364, 256214, 276303, 296574, 317069, 337766, 405656]);

  const str = value => typeof value === 'string' ? value : value == null ? '' : String(value);
  const norm = value => str(value).toLowerCase().normalize('NFD').replace(/[̀-ͯ­​]/g, '')
    .replace(/ß/g, 'ss').replace(/[  ]/g, ' ').replace(/[‐‑–—]/g, '-').replace(/[’`´]/g, "'");

  // ---------- Dates ----------
  const MONTHS = [
    [1, 'januar|janner|jan|janvier|january|gennaio'], [2, 'februar|feb|fevrier|february|febbraio'],
    [3, 'marz|maerz|mars|march|marzo|mar'], [4, 'april|avril|aprile|apr'], [5, 'mai|may|maggio'],
    [6, 'juni|juin|june|giugno|jun'], [7, 'juli|juillet|july|luglio|jul'], [8, 'august|aout|agosto|aug'],
    [9, 'september|septembre|settembre|sept|sep'], [10, 'oktober|octobre|october|ottobre|okt|oct'],
    [11, 'november|novembre|nov'], [12, 'dezember|decembre|december|dicembre|dez|dec']
  ];
  const MONTH_NAMES = MONTHS.map(([, names]) => names).join('|');
  const monthNumber = name => (MONTHS.find(([, names]) => new RegExp(`^(?:${names})$`).test(name)) || [null])[0];
  const pad = n => String(n).padStart(2, '0');
  function isoDate(year, month, day) {
    if (!(year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCMonth() === month - 1 ? `${year}-${pad(month)}-${pad(day)}` : null;
  }
  function withYear(year, month, day, reference) {
    if (year) return isoDate(year < 100 ? 2000 + year : year, month, day);
    const ref = new Date(reference);
    let candidate = isoDate(ref.getUTCFullYear(), month, day);
    if (candidate && Date.parse(candidate) < reference - 31 * DAY) candidate = isoDate(ref.getUTCFullYear() + 1, month, day);
    return candidate;
  }
  const DATE_PATTERNS = [
    [/\b(\d{4})-(\d{2})-(\d{2})\b/, m => isoDate(+m[1], +m[2], +m[3])],
    [/\b(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{4}|\d{2})\b/, (m, r) => withYear(+m[3], +m[2], +m[1], r)],
    [new RegExp(`\\b(\\d{1,2})(?:\\.|er|st|nd|rd|th)?\\s*(${MONTH_NAMES})\\.?(?:\\s*,?\\s*(\\d{4}))?\\b`), (m, r) => withYear(m[3] ? +m[3] : 0, monthNumber(m[2]), +m[1], r)],
    [new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(\\d{4}))?`), (m, r) => withYear(m[3] ? +m[3] : 0, monthNumber(m[1]), +m[2], r)],
    [/\b(\d{1,2})\.(\d{1,2})\.(?!\d)/, (m, r) => withYear(0, +m[2], +m[1], r)]
  ];
  /** First date in a short normalised window, ISO yyyy-mm-dd or null. */
  function parseDate(text, reference = Date.now()) {
    const window = norm(text);
    let best = null;
    for (const [pattern, build] of DATE_PATTERNS) {
      const match = window.match(pattern);
      if (!match) continue;
      const value = build(match, reference);
      if (value && (!best || match.index < best.index)) best = { index: match.index, value };
    }
    return best ? best.value : null;
  }
  function referenceTime(job) {
    for (const value of [job.fetched_at, job.first_seen, job.last_seen]) { const t = Date.parse(value); if (Number.isFinite(t)) return t; }
    return Date.now();
  }
  const within = (iso, reference, before, after) => {
    const t = Date.parse(iso);
    return Number.isFinite(t) && t >= reference - before * DAY && t <= reference + after * DAY;
  };

  const DEADLINE_CUE = /(?:bewerbungs(?:frist|schluss|termin|eingang)|anmelde(?:schluss|frist)|eingabe(?:frist|termin)|einsendeschluss|ausschreibungsfrist|bewerb\w*[^.\n]{0,60}?\bbis\b(?:\s+(?:zum|am|spatestens))*|\bbis\s+(?:spatestens|zum)\b|date limite(?: de (?:postulation|candidature|depot))?|delai de (?:postulation|candidature|depot|reponse)|postule[rz]?[^.\n]{0,40}?(?:jusqu'?(?:au|a)|avant le)|candidatures?[^.\n]{0,40}?(?:jusqu'?(?:au|a)|avant le)|application deadline|closing date|apply (?:by|before|until)|applications?[^.\n]{0,30}?(?:by|before|until)|\bdeadline\b|termine (?:di candidatura|d'iscrizione|di presentazione)|scadenza)\s*:?/g;
  function extractDeadline(job, reference) {
    const text = norm(job.description);
    for (const match of text.matchAll(DEADLINE_CUE)) {
      const value = parseDate(text.slice(match.index + match[0].length, match.index + match[0].length + 45), reference);
      if (value && within(value, reference, 60, 400)) return value;
    }
    const given = typeof job.deadline === 'string' && /^\d{4}-\d{2}-\d{2}/.test(job.deadline) ? job.deadline.slice(0, 10) : null;
    // Machine validThrough values far in the future (e.g. +10 years) are not deadlines.
    return given && within(given, reference, 60, 400) ? given : null;
  }

  const START_CUE = /(?:stellenantritt|eintritt(?:sdatum|stermin)?|arbeitsbeginn|stellenbeginn|stellenantrittsdatum|(?:fruhest\w* )?beginn|antritt|start(?:ing)? date|start(?:ing)?|entree en (?:fonction|service)|date d'entree|date de debut|debut d'activite|prise de fonction|entrata in servizio|data d'inizio|inizio)\s*:?\s*/g;
  const IMMEDIATE = /^(?:(?:per|ab|ist|dès|des|from|a partir de|da)\s+)?(?:sofort|per sofort|ab sofort|umgehend|immediately|immediate|as soon as possible|asap|des que possible|de suite|tout de suite|immediatement|subito|immediatamente|al piu presto)/;
  const AGREEMENT = /^(?:(?:per|ab)\s+)?(?:nach (?:vereinbarung|absprache|ubereinkunft)|a convenir|a definir|by (?:mutual )?agreement|to be agreed|negotiable|da (?:concordare|convenire))/;
  const START_HEAD = new RegExp(`^(?:\\d|(?:${MONTH_NAMES})\\b)`);
  function startValue(window, reference) {
    const text = window.replace(/^(?:ist |am |zum |per |ab |le |the |on |il |dal |des le |dès le |a partir du )+/, '');
    if (IMMEDIATE.test(text) || IMMEDIATE.test(window)) return 'sofort';
    if (AGREEMENT.test(text)) return 'nach Vereinbarung';
    const head = text.slice(0, 30);
    const value = /\d|[a-z]{3}/.test(head) ? parseDate(head, reference) : null;
    // A date must open the window ("per 1. März 2027"), not appear later in prose.
    if (value && START_HEAD.test(head)) return within(value, reference, 60, 730) ? value : null;
    return null;
  }
  function extractStartDate(job, reference) {
    const text = norm(`${job.title || ''}\n${job.description || ''}`);
    for (const match of text.matchAll(START_CUE)) {
      const value = startValue(text.slice(match.index + match[0].length, match.index + match[0].length + 60), reference);
      if (value) return value;
    }
    // Swiss ads: "Wir suchen per sofort oder nach Vereinbarung", "per 1. Januar 2027".
    for (const match of text.matchAll(/\b(?:per|ab)\s+(?=sofort|\d{1,2}[. ]|(?:nach vereinbarung))/g)) {
      const value = startValue(text.slice(match.index, match.index + 60), reference);
      if (value) return value;
    }
    return /\b(?:des que possible|de suite ou a convenir|as soon as possible)\b/.test(text) ? 'sofort' : null;
  }

  // ---------- Seniority ----------
  function normalizeSeniority(title, raw) {
    const t = norm(title);
    if (/\b(?:phd|ph\.d|doktorand|doktorat|doctoral|doctorant|dottorand)/.test(t)) return 'phd';
    if (/praktik|\bintern(?:ship)?\b|\bstagiaire|\bstage\b|\bstagista|volontariat|werkstudent/.test(t)) return 'praktikum';
    if (/\btrainee|graduate (?:program|programme)|nachwuchsprogramm/.test(t)) return 'trainee';
    if (/\bjunior|\bjr\.?(?=\s)|berufseinst|einsteiger|\bentry[- ]level|\bgraduate\b/.test(t)) return 'junior';
    // "Projektleiter" leads a project, not a team: it stays at its own level.
    const leadText = t.replace(/(?:teil)?projekt-?\s?leit\w*|programm-?leit\w*|bau-?leit\w*|studien-?leit\w*|kursleit\w*|project lead\w*/g, ' ');
    if (/leiter|leitung|leitend|vorsteher|geschaftsfuhr|\bhead\b|\bdirekt(?:or|orin)\b|\bdirector|\bdirect(?:eur|rice)\b|\bchief\b|\bchef(?:in|fe)?\b|\bresponsable\b|\bteam ?lead|\blead\b|\bceo\b|\bcfo\b|\bcoo\b|\bmanaging director/.test(leadText)) return 'lead';
    if (/\bsenior|\bsr\.?(?=\s)|\bprincipal\b|\bexpert(?:e|in)?\b/.test(t)) return 'senior';
    if (SENIORITY.includes(raw)) return raw;
    if (raw === 'entry') return /trainee/.test(t) ? 'trainee' : 'praktikum';
    return null;
  }

  // ---------- Salary ----------
  function federal(job, org) {
    let host = '';
    try { host = new URL(job.url).hostname; } catch { /* no URL */ }
    return /(?:^|\.)admin\.ch$/.test(host) || (org && org.category === 'bund' && /(?:^|\.)admin\.ch$/.test(str(org.jobs).replace(/^https?:\/\/([^/?#]+).*/, '$1')))
      || /bundesamt|eidgenossisch|staatssekretariat|bundesverwaltung|office federal|confederation suisse/.test(norm(`${job.hiring_organization || ''} ${job.organization || ''}`));
  }
  function amount(raw) {
    const t = str(raw).trim().toLowerCase();
    if (!/\d/.test(t)) return null;
    const k = /k$/.test(t);
    const cleaned = t.replace(/k$/, '').replace(/[.,]-+$|\.–$/, '').trim();
    let value;
    if (/^\d{1,3}(?:['’ .,]\d{3})+(?:[.,]\d{1,2})?$/.test(cleaned)) value = Number(cleaned.replace(/[.,]\d{1,2}$/, m => /^[.,]\d{3}$/.test(m) ? m : '').replace(/['’ .,]/g, ''));
    else value = Number(cleaned.replace(',', '.'));
    if (!Number.isFinite(value)) return null;
    return k ? Math.round(value * 1000) : value;
  }
  const NUM = String.raw`\d{1,3}(?:['’ .,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d+)?\s?k|\d{4,6}`;
  const CURRENCY = String.raw`(?:chf|sfr\.?|fr\.)`;
  const MONEY = new RegExp(String.raw`(?:${CURRENCY}\s*(${NUM})(?:\.[-–]{1,2})?(?:\s*(?:-|bis|to|a|à)\s*(?:${CURRENCY}\s*)?(${NUM}))?|(${NUM})(?:\s*(?:-|bis|to|a|à)\s*(${NUM}))?\s*(?:\.-\s*)?${CURRENCY})`, 'g');
  function salaryFrom(text) {
    const t = norm(text);
    for (const match of t.matchAll(MONEY)) {
      const low = amount(match[1] || match[3]), high = amount(match[2] || match[4]);
      if (low == null) continue;
      const after = t.slice(match.index + match[0].length, match.index + match[0].length + 40);
      const before = t.slice(Math.max(0, match.index - 100), match.index);
      const context = `${before} ${after}`;
      const period = /(?:pro|per|par|\/|al)\s*(?:stunde|std|hour|heure|ora)\b|stundenlohn|hourly|horaire/.test(after) ? 'hour'
        : /(?:pro|per|par|\/|al)\s*(?:monat|month|mois|mese)\b|monatlich|monthly|mensuel|x\s*13|13 ?x/.test(after + before.slice(-30)) ? 'month' : 'year';
      const bounds = { year: [30000, 600000], month: [2000, 50000], hour: [20, 300] }[period];
      const values = [low, high].filter(v => v != null);
      if (values.some(v => v < bounds[0] || v > bounds[1]) || (high != null && high < low)) continue;
      if (high == null && !/lohn|gehalt|salar|salaire|salary|vergutung|remuneration|retribuzione|stipendio|compensation|\bpay\b|einkommen|jahresbrutto/.test(context)) continue;
      const fmt = v => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
      const unit = { year: 'pro Jahr', month: 'pro Monat', hour: 'pro Stunde' }[period];
      return { hint: `CHF ${fmt(low)}${high != null && high !== low ? `–${fmt(high)}` : ''} ${unit}`, range: { min: low, max: high != null ? high : low, currency: 'CHF', period, source: 'Inserat' } };
    }
    return null;
  }
  const PAY_CLASS = /\b(?:lohnklassen?|gehaltsklassen?|besoldungsklassen?|lohnstufe|\blk|classes? (?:de )?salaire|classe salariale|classi? (?:di )?stipendio)\s*:?\s*(\d{1,2})(?:\s*(?:-|bis|a|à|\/)\s*(\d{1,2}))?\b/;
  function extractSalary(job, org) {
    const text = norm(`${job.salary_hint || ''}\n${job.title || ''}\n${job.description || ''}`);
    const pay = text.match(PAY_CLASS);
    if (pay) {
      const low = +pay[1], high = pay[2] ? +pay[2] : low;
      if (low >= 1 && high <= 38 && low <= high) {
        const label = low === high ? `Lohnklasse ${low}` : `Lohnklassen ${low}–${high}`;
        const range = federal(job, org) && BUND_LOHNKLASSEN_2026[high]
          ? { min: null, max: BUND_LOHNKLASSEN_2026[high], currency: 'CHF', period: 'year', source: `${label} (Bund)` } : null;
        return { salary_hint: label, salary_range: range };
      }
    }
    const explicit = salaryFrom(`${job.salary_hint || ''}\n${job.description || ''}`);
    if (explicit) return { salary_hint: explicit.hint, salary_range: explicit.range };
    const hint = str(job.salary_hint).trim();
    return { salary_hint: hint && !/^keine angabe$/i.test(hint) ? hint.slice(0, 120) : null, salary_range: null };
  }

  // ---------- Canton ----------
  const PLACES = Object.entries({
    AG: 'aargau|argovie|aarau|baden|brugg|wettingen|wohlen|zofingen|lenzburg|rheinfelden|kaiseraugst|windisch',
    AI: 'appenzell innerrhoden|appenzell',
    AR: 'appenzell ausserrhoden|herisau|teufen|heiden',
    BE: 'bern|berne|biel|bienne|thun|burgdorf|langenthal|koniz|ittigen|liebefeld|zollikofen|ostermundigen|muri bei bern|interlaken|worb|munsingen',
    BL: 'basel-landschaft|baselland|bale-campagne|liestal|allschwil|muttenz|pratteln|binningen|reinach|arlesheim|munchenstein|birsfelden',
    BS: 'basel-stadt|basel|bale|basle|riehen',
    FR: 'fribourg|freiburg|bulle|murten|morat|villars-sur-glane|givisiez',
    GE: 'geneve|genf|geneva|ginevra|meyrin|carouge|vernier|lancy|onex|plan-les-ouates|chene-bourg|thonex|grand-saconnex|cointrin|versoix',
    GL: 'glarus',
    GR: 'graubunden|grisons|grigioni|chur|davos|st\\.? moritz|landquart|ilanz',
    JU: 'jura|delemont|porrentruy',
    LU: 'luzern|lucerne|emmen|kriens|sursee|horw|ebikon|root',
    NE: 'neuchatel|neuenburg|la chaux-de-fonds|le locle',
    NW: 'nidwalden|stans',
    OW: 'obwalden|sarnen',
    SG: 'st\\.? ?gallen|saint-gall|wil|rapperswil|rapperswil-jona|rorschach|buchs|gossau|uzwil|altstatten|walenstadt',
    SH: 'schaffhausen|schaffhouse',
    SO: 'solothurn|soleure|olten|grenchen',
    SZ: 'schwyz|pfaffikon|einsiedeln|lachen|freienbach',
    TG: 'thurgau|thurgovie|frauenfeld|kreuzlingen|weinfelden|munsterlingen|arbon|amriswil',
    TI: 'ticino|tessin|bellinzona|lugano|locarno|mendrisio|manno|chiasso',
    UR: 'uri|altdorf',
    VD: 'vaud|waadt|lausanne|morges|nyon|yverdon(?:-les-bains)?|vevey|montreux|renens|epalinges|prilly|pully|aigle|tolochenaz|ecublens|gland|rolle',
    VS: 'valais|wallis|sion|sitten|sierre|siders|visp|brig|martigny|monthey',
    ZG: 'zug|zoug|baar|cham|rotkreuz|risch|steinhausen|hunenberg',
    ZH: 'zurich|winterthur|uster|dubendorf|opfikon|glattbrugg|wallisellen|kloten|schlieren|dietikon|wadenswil|horgen|bulach|kusnacht|ruschlikon|adliswil|thalwil|meilen|zollikon|regensdorf|wetzikon|affoltern am albis|zumikon|stafa|volketswil|oerlikon|altstetten'
  }).map(([code, names]) => [code, new RegExp(`(?:^|[^a-z-])(?:${names})(?=$|[^a-z-])`)]);
  function cantonFromLocation(location) {
    const raw = str(location);
    const coded = raw.match(/\(\s*([A-Z]{2})\s*\)/);
    if (coded && Object.prototype.hasOwnProperty.call(CANTONS, coded[1])) return coded[1];
    // Region labels list several cantons, e.g. "Espace Mittelland (BE, FR, JU...)".
    const t = norm(raw).replace(/\([^)]*\)/g, ' ');
    let best = null;
    for (const [code, pattern] of PLACES) {
      const match = t.match(pattern);
      if (match && (!best || match.index < best.index)) best = { index: match.index, code };
    }
    return best ? best.code : null;
  }

  /** Facts for filtering/sorting. Missing evidence stays null; nothing is guessed. */
  function extractFacts(job, org) {
    job = job && typeof job === 'object' ? job : {};
    const reference = referenceTime(job);
    const salary = extractSalary(job, org);
    return {
      deadline: extractDeadline(job, reference),
      start_date: extractStartDate(job, reference),
      seniority: normalizeSeniority(job.title, job.seniority),
      salary_hint: salary.salary_hint,
      salary_range: salary.salary_range,
      canton: cantonFromLocation(job.location) || (str(job.location).trim() ? null : cantonFromLocation(org && org.loc))
    };
  }

  // ---------- Duplicates ----------
  const UUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
  const BOARDS = /(?:^|\.)(?:jobs\.ch|jobup\.ch|jobscout24\.ch|jobwinner\.ch|topjobs\.ch|alpha\.ch|jobs\.admin\.ch)$/;
  /** Language-independent identity of a posting URL. */
  function canonicalJobKey(raw) {
    let url;
    try { url = new URL(str(raw)); } catch { return str(raw).trim(); }
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const uuid = url.pathname.match(UUID);
    if (uuid && BOARDS.test(host)) return `${host}#${uuid[1].toLowerCase()}`;
    const path = url.pathname.replace(/^\/(?:de|fr|it|en|rm)(?:[-_][a-z]{2})?(?=\/|$)/i, '').replace(/\/+$/, '') || '/';
    const params = [...url.searchParams.entries()]
      .filter(([key]) => !/^(?:lang|language|locale|lng|hl|utm_.*|pk_.*|mtm_.*|fbclid|gclid|msclkid|source|ref|referrer)$/i.test(key))
      .sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
    const hash = /^#\/?(?:jobs?|positions?|stellen?|vacanc(?:y|ies))\//i.test(url.hash) ? url.hash : '';
    return `${host}${path.toLowerCase()}${params.length ? '?' + new URLSearchParams(params) : ''}${hash}`;
  }
  const employerKey = value => norm(value).replace(/\b(?:ag|sa|gmbh|sarl|ltd|inc|ch|schweiz|suisse)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  function titleKey(value) {
    return norm(value)
      .replace(/\(\s*(?:[mwfdxa](?:\s*[/|,]\s*[mwfdxa])*|all genders?|alle|a)\s*\)/g, ' ')
      .replace(/\b[mwfd]\s*\/\s*[mwfd](?:\s*\/\s*[mwfdx])?\b/g, ' ')
      .replace(/\d{1,3}\s*(?:-|bis|a)?\s*\d{0,3}\s*%/g, ' ')
      .replace(/[:*_]in(?:nen)?\b|\/-?in(?:nen)?\b|\/-?r\b|\(in\)/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  const locationKey = value => norm(value).replace(/\b(?:ch|schweiz|suisse|switzerland|svizzera)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  function words(value) { return new Set(norm(value).split(/[^a-z0-9]+/).filter(word => word.length > 3)); }
  function similarDescriptions(a, b) {
    const da = str(a.description), db = str(b.description);
    if (da.length < 200 || db.length < 200) return true; // One-line board teasers cannot disprove identity.
    const wa = words(da.slice(0, 4000)), wb = words(db.slice(0, 4000));
    let common = 0; for (const word of wa) if (wb.has(word)) common++;
    return common / Math.max(1, Math.min(wa.size, wb.size)) >= 0.6;
  }
  function nearDuplicateKey(job) {
    const employer = employerKey(job.organization || job.hiring_organization), title = titleKey(job.title), place = locationKey(job.location);
    return employer && title && place ? `${employer}|${title}|${place}` : null;
  }
  const time = value => { const t = Date.parse(value); return Number.isFinite(t) ? t : 0; };
  function completeness(job) {
    return ['deadline', 'start_date', 'salary_hint', 'location', 'pensum', 'seniority', 'canton'].filter(key => job[key] != null && job[key] !== '').length
      + Math.min(3, Math.floor(str(job.description).length / 1000));
  }
  /** Newer observation first, then more complete record, then stable id. */
  function better(a, b) {
    return (time(b.last_seen || b.fetched_at) - time(a.last_seen || a.fetched_at)) || (completeness(b) - completeness(a))
      || (str(b.description).length - str(a.description).length) || str(a.id).localeCompare(str(b.id));
  }
  function mergeGroup(group) {
    const [keep, ...rest] = [...group].sort(better);
    if (!rest.length) return keep;
    const merged = { ...keep };
    const orgIds = [...new Set(group.flatMap(job => Array.isArray(job.org_ids) ? job.org_ids : job.org_id ? [job.org_id] : []))];
    if (orgIds.length) merged.org_ids = [keep.org_id, ...orgIds.filter(id => id !== keep.org_id)].filter(Boolean);
    const firstSeen = group.map(job => job.first_seen).filter(value => time(value)).sort((a, b) => time(a) - time(b))[0];
    if (firstSeen) merged.first_seen = firstSeen;
    for (const key of ['deadline', 'start_date', 'salary_hint', 'salary_range', 'seniority', 'canton', 'location', 'pensum']) {
      if (merged[key] == null || merged[key] === '') { const donor = rest.find(job => job[key] != null && job[key] !== ''); if (donor) merged[key] = donor[key]; }
    }
    merged.duplicate_ids = rest.map(job => job.id).filter(Boolean);
    return merged;
  }
  /** Removes the same posting under several URLs/languages and repeated postings
   * (same employer + normalised title + location). Input order is kept. */
  function dedupeJobs(jobs) {
    const list = (Array.isArray(jobs) ? jobs : []).filter(job => job && typeof job === 'object');
    const parent = list.map((_, i) => i);
    const find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
    const byUrl = new Map(), byKey = new Map();
    list.forEach((job, i) => {
      const urlKey = job.url ? canonicalJobKey(job.url) : null;
      if (urlKey) { if (byUrl.has(urlKey)) union(byUrl.get(urlKey), i); else byUrl.set(urlKey, i); }
      const key = nearDuplicateKey(job);
      if (!key) return;
      const candidates = byKey.get(key) || [];
      for (const j of candidates) if (similarDescriptions(list[j], job)) { union(j, i); break; }
      candidates.push(i); byKey.set(key, candidates);
    });
    const groups = new Map();
    list.forEach((job, i) => { const root = find(i); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(job); });
    return [...groups.keys()].sort((a, b) => a - b).map(root => mergeGroup(groups.get(root)));
  }

  return Object.freeze({ SENIORITY, CANTONS, BUND_LOHNKLASSEN_2026, parseDate, normalizeSeniority, cantonFromLocation,
    extractFacts, canonicalJobKey, nearDuplicateKey, dedupeJobs });
});
