/* Market insights (#markt): a small, honest dashboard computed from the current
 * snapshot of the curated public feed. Pure computation lives in compute() so it
 * can be tested without a browser; rendering uses plain HTML/CSS bars drawn to
 * scale from a zero baseline (no chart library). */
(function () {
  'use strict';
  const mount = document.getElementById('marketInsights');
  const DAY = 24 * 60 * 60 * 1000;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const feedHref = params => `?${new URLSearchParams(params)}#stellen`;

  /* Curated requirement keywords: [label, pattern over title + description, feed query or null]. */
  const KEYWORDS = Object.freeze([
    ['Englisch', /englisch|english|anglais|inglese/i, 'Englisch'],
    ['Französisch', /französisch|franzoesisch|français|francais|\bfrench\b|francese/i, 'Französisch'],
    ['Italienisch', /italienisch|italiano|\bitalian\b/i, 'Italienisch'],
    ['Master', /\bmaster|\bmsc\b|\bm\.\s?sc\b/i, 'Master'],
    ['PhD / Doktorat', /\bph\.?\s?d\b|doktorat|doktorand|doctorat|promotion\b/i, 'PhD'],
    ['Statistik', /statisti/i, 'Statistik'],
    ['Epidemiologie', /epidemiolog|épidémiolog|epidemiolog/i, 'Epidemiologie'],
    ['Gesundheitsökonomie', /gesundheitsökonom|gesundheitsoekonom|health econom|économie de la santé|economie de la sante/i, 'Gesundheitsökonomie'],
    ['HTA', /\bHTA\b|health technology assessment/, 'HTA'],
    ['Projektmanagement', /projekt\s?management|projektmanagement|projektleitung|project management|gestion de projet/i, 'Projektmanagement'],
    ['R', /(?:^|[\s,;(/])R(?=$|[\s,;)/.])/, null],
    ['Python', /\bpython\b/i, 'Python'],
    ['SQL', /\bsql\b/i, 'SQL'],
    ['Stata', /\bstata\b/i, 'Stata'],
    ['SAS', /\bSAS\b/, 'SAS'],
    ['Excel', /\bexcel\b/i, 'Excel'],
    ['Power BI', /power\s?bi\b/i, 'Power BI']
  ]);
  const SENIORITY_LABELS = Object.freeze({ praktikum: 'Praktikum', trainee: 'Trainee', junior: 'Junior / Einstieg', senior: 'Senior / Expertise', lead: 'Leitung', phd: 'Doktorat / PhD' });
  const PENSUM_BUCKETS = Object.freeze(['90–100 %', 'Spanne bis 100 %', '60–80 %', 'unter 60 %', 'nicht angegeben']);

  const catalogue = () => (typeof DATA !== 'undefined' && Array.isArray(DATA) ? DATA : []);
  const orgName = id => catalogue().flatMap(c => c.orgs).find(o => o.id === id)?.name || id;
  function factsOf(job) {
    if (typeof jobFacts === 'function') return jobFacts(job);
    const derived = window.HealthJobFacts?.extractFacts ? window.HealthJobFacts.extractFacts(job) : {};
    return { ...derived, ...Object.fromEntries(Object.entries(job).filter(([k, v]) => v != null && k in derived)) };
  }
  function pensumRange(job) {
    let min = Number.isFinite(job.workload_min) ? job.workload_min : null, max = Number.isFinite(job.workload_max) ? job.workload_max : null;
    if (min == null && max == null) {
      const nums = String(job.pensum || '').match(/\d{1,3}(?=\s*%|\s*[-–]\s*\d{1,3}\s*%)/g);
      if (nums) { const values = nums.map(Number).filter(n => n > 0 && n <= 100); if (values.length) { min = Math.min(...values); max = Math.max(...values); } }
    }
    if (min == null && max == null) return null;
    return { min: min ?? max, max: max ?? min };
  }
  function pensumBucket(job) {
    const range = pensumRange(job);
    if (!range) return 'nicht angegeben';
    if (range.min >= 90) return '90–100 %';
    if (range.max >= 90) return 'Spanne bis 100 %';
    if (range.max >= 60) return '60–80 %';
    return 'unter 60 %';
  }
  const tally = (map, key, n = 1) => map.set(key, (map.get(key) || 0) + n);
  const sorted = map => [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'de'));

  /** All figures of the dashboard from a list of open jobs. */
  function compute(jobs, now = Date.now()) {
    const open = (Array.isArray(jobs) ? jobs : []).filter(job => job && job.status !== 'closed');
    const focus = new Map(), canton = new Map(), seniority = new Map(), branche = new Map(), pensum = new Map(), employers = new Map(), keywords = new Map();
    const categories = window.HealthJobRelevance?.CATEGORIES || [];
    categories.forEach(c => focus.set(c, 0));
    Object.keys(SENIORITY_LABELS).forEach(k => seniority.set(k, 0));
    PENSUM_BUCKETS.forEach(k => pensum.set(k, 0));
    let new7 = 0, new30 = 0, deadline = 0, salary = 0, cantonUnknown = 0, seniorityUnknown = 0, earliest = null;
    for (const job of open) {
      const seen = Date.parse(job.first_seen);
      if (Number.isFinite(seen)) {
        if (now - seen <= 7 * DAY) new7++;
        if (now - seen <= 30 * DAY) new30++;
        if (earliest == null || seen < earliest) earliest = seen;
      }
      const f = factsOf(job);
      if (job.relevance?.category) tally(focus, job.relevance.category);
      const code = f.canton || window.HealthJobFacts?.cantonFromLocation?.(job.location) || null;
      if (code) tally(canton, code); else cantonUnknown++;
      if (f.seniority && Object.hasOwn(SENIORITY_LABELS, f.seniority)) tally(seniority, f.seniority); else seniorityUnknown++;
      if (job.category) tally(branche, job.category);
      tally(pensum, pensumBucket(job));
      if (job.org_id) tally(employers, job.org_id);
      if (f.deadline) deadline++;
      if (f.salary_hint || f.salary_range) salary++;
      const text = `${job.title || ''}\n${job.description || ''}`;
      for (const [label, pattern] of KEYWORDS) if (pattern.test(text)) tally(keywords, label);
    }
    return {
      total: open.length, new7, new30, deadline, salary, earliest: earliest ? new Date(earliest).toISOString() : null,
      focus: sorted(focus), canton: sorted(canton), cantonUnknown,
      seniority: [...seniority.entries()], seniorityUnknown,
      branche: sorted(branche), pensum: PENSUM_BUCKETS.map(k => [k, pensum.get(k) || 0]),
      employers: sorted(employers).slice(0, 10), keywords: sorted(keywords)
    };
  }

  /* ---------- Rendering ---------- */
  const pct = (n, total) => total ? Math.round(n / total * 100) : 0;
  const nf = n => Number(n).toLocaleString('de-CH');
  function bars(rows, total, { unit = 'Stellen' } = {}) {
    const max = Math.max(1, ...rows.map(r => r.n));
    return `<ol class="mi-bars" role="list">${rows.map(r => {
      const inner = `<span class="mi-label">${esc(r.label)}</span><span class="mi-track" aria-hidden="true"><span class="mi-fill${r.n ? '' : ' mi-zero'}" style="width:${(r.n / max * 100).toFixed(1)}%"></span></span><span class="mi-value"><strong>${nf(r.n)}</strong><small>${pct(r.n, total)} %</small></span><span class="visually-hidden"> ${unit}${r.href ? ', im Stellenfeed anzeigen' : ''}</span>`;
      return `<li>${r.href ? `<a class="mi-row" href="${esc(r.href)}"${r.title ? ` title="${esc(r.title)}"` : ''}>${inner}</a>` : `<div class="mi-row">${inner}</div>`}</li>`;
    }).join('')}</ol>`;
  }
  function figure(id, title, note, body, wide = false) {
    return `<figure class="mi-chart${wide ? ' mi-wide' : ''}" aria-labelledby="${id}"><figcaption><h3 id="${id}">${esc(title)}</h3>${note ? `<p>${note}</p>` : ''}</figcaption>${body}</figure>`;
  }
  function kpi(value, label, href, sub) {
    const inner = `<strong>${esc(value)}</strong><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    return href ? `<a class="mi-kpi" href="${esc(href)}">${inner}</a>` : `<div class="mi-kpi">${inner}</div>`;
  }
  function head(stamp) {
    return `<div class="view-head mi-head"><div><p class="eyebrow">Arbeitsmarkt</p><h2>Was der Stellenfeed gerade zeigt</h2>
      <p>Kennzahlen aus dem aktuellen Stand des kuratierten Feeds: fachlich geprüfte, offene Stellen bei den erfassten Arbeitgebern. Sie beschreiben diese Auswahl, nicht den gesamten Schweizer Arbeitsmarkt. <a href="#quellen">Quellen und Abdeckung</a></p></div>
      ${stamp ? `<p class="mi-stamp">Stand ${esc(stamp)}</p>` : ''}</div>`;
  }
  function state() {
    if (typeof EmployerFeed !== 'undefined') return { status: EmployerFeed.status, jobs: EmployerFeed.jobs, generatedAt: EmployerFeed.generatedAt };
    return { status: 'pending', jobs: [], generatedAt: null };
  }
  function render() {
    if (!mount) return;
    const { status, jobs, generatedAt } = state();
    if (status !== 'ready') {
      mount.innerHTML = head('') + (status === 'error'
        ? '<p class="mi-message" role="alert">Der aktuelle Stand des Stellenfeeds ist gerade nicht erreichbar. Ohne Daten zeigen wir keine Zahlen. Bitte später erneut versuchen.</p>'
        : `<div class="mi-kpis" aria-busy="true">${'<div class="mi-kpi"><span class="skeleton" style="height:2rem;width:60%"></span><span class="skeleton" style="height:.8rem;width:80%"></span></div>'.repeat(4)}</div><p class="visually-hidden" role="status">Kennzahlen werden geladen …</p>`);
      return;
    }
    const s = compute(jobs);
    const stamp = generatedAt ? new Date(generatedAt).toLocaleString('de-CH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    if (!s.total) { mount.innerHTML = head(stamp) + '<p class="mi-message">Im aktuellen Stand sind keine offenen, fachlich passenden Stellen enthalten. Das heisst nicht, dass es keine gibt – siehe <a href="#quellen">Quellen</a>.</p>'; return; }
    const cantons = window.HealthJobFacts?.CANTONS || {};
    const catTitle = key => catalogue().find(c => c.key === key)?.title || key;
    const since = s.earliest ? new Date(s.earliest).toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const cantonRows = s.canton.slice(0, 12).map(([code, n]) => ({ label: cantons[code] || code, n, href: feedHref({ kanton: code }) }));
    const restCantons = s.canton.slice(12).reduce((sum, [, n]) => sum + n, 0);
    if (restCantons) cantonRows.push({ label: 'Übrige Kantone', n: restCantons });
    if (s.cantonUnknown) cantonRows.push({ label: 'Ohne eindeutigen Kanton', n: s.cantonUnknown });
    const seniorityRows = s.seniority.map(([key, n]) => ({ label: SENIORITY_LABELS[key], n, href: n ? feedHref({ stufe: key }) : null }));
    seniorityRows.push({ label: 'Keine Stufe erkennbar', n: s.seniorityUnknown });
    mount.innerHTML = `${head(stamp)}
      <div class="mi-kpis">
        ${kpi(nf(s.total), 'offene Stellen im Feed', '#stellen')}
        ${kpi(nf(s.new7), 'in den letzten 7 Tagen neu', null, 'erstmals vom Abruf gefunden')}
        ${kpi(nf(s.new30), 'in den letzten 30 Tagen neu', null)}
        ${kpi(`${pct(s.deadline, s.total)} %`, 'nennen eine Bewerbungsfrist', null, `${nf(s.deadline)} von ${nf(s.total)}`)}
        ${kpi(`${pct(s.salary, s.total)} %`, 'nennen Lohn oder Lohnklasse', null, `${nf(s.salary)} von ${nf(s.total)}`)}
      </div>
      <div class="mi-grid">
        ${figure('miFocus', 'Nach Fachbereich', 'Fachliche Einordnung jeder Stelle. Klick filtert den Stellenfeed.', bars(s.focus.map(([label, n]) => ({ label, n, href: n ? feedHref({ fach: label }) : null })), s.total))}
        ${figure('miCanton', 'Nach Kanton', 'Aus der Ortsangabe des Inserats. «CH» oder Home-Office lassen sich keinem Kanton zuordnen.', bars(cantonRows, s.total))}
        ${figure('miSeniority', 'Nach Karrierestufe', 'Aus dem Stellentitel abgeleitet. Ohne klare Angabe bleibt die Stufe offen.', bars(seniorityRows, s.total))}
        ${figure('miBranche', 'Nach Arbeitgeberkategorie', 'Kategorie des Arbeitgebers im Verzeichnis.', bars(s.branche.map(([key, n]) => ({ label: catTitle(key), n, href: feedHref({ branche: key }) })), s.total))}
        ${figure('miPensum', 'Pensum', '«Spanne bis 100 %» heisst z. B. 60–100 %, Pensum nach Absprache.', bars(s.pensum.map(([label, n]) => ({ label, n })), s.total))}
        ${figure('miEmployers', 'Arbeitgeber mit den meisten Stellen', 'Top 10 im aktuellen Stand.', bars(s.employers.map(([id, n]) => ({ label: orgName(id), n, href: feedHref({ ag: id }) })), s.total))}
        ${figure('miKeywords', 'Häufige Anforderungen', 'Einfache Zählung ausgewählter Begriffe in Titel und Kurzbeschreibung (eine Stelle zählt pro Begriff höchstens einmal). Die Kurzbeschreibung ist nicht das ganze Inserat; die Werte sind Untergrenzen.', bars(s.keywords.map(([label, n]) => { const q = KEYWORDS.find(k => k[0] === label)?.[2]; return { label, n, href: q ? feedHref({ q }) : null, title: q ? `Stellenfeed nach «${q}» durchsuchen` : null }; }), s.total), true)}
      </div>
      <p class="mi-footnote">Prozentwerte beziehen sich auf alle ${nf(s.total)} offenen Stellen im Feed. «Neu» bedeutet erstmals vom automatischen Abruf gefunden${since ? `; die Erfassung reicht bis ${esc(since)} zurück` : ''}. Geschlossene Inserate sind nicht enthalten, Verläufe über die Zeit sind deshalb nicht ableitbar. <a href="#quellen">Wie die Daten entstehen</a></p>`;
  }

  window.MarketInsights = Object.freeze({ compute, render, KEYWORDS, pensumBucket });
  if (!mount) return;
  window.addEventListener('publicfeed:loaded', () => render());
  window.addEventListener('site:route', event => { if (event.detail?.view === 'markt') render(); });
  render();
})();
