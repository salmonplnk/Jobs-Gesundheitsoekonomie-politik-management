const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..');
const groups = JSON.parse(fs.readFileSync(path.join(root, 'data/organizations.json'), 'utf8'));
const CATALOG_SIZE = groups.reduce((sum, group) => sum + group.orgs.length, 0);
const tick = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };
const stamp = new Date().toISOString(), url = 'https://feed.example/public/index.json';
const isoDay = offset => { const d = new Date(Date.now() + offset * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const source = { org_id: 'bag', name: 'BAG', url: 'https://jobs.admin.ch/', status: 'ok', checked_at: stamp, last_success_at: stamp, last_complete_at: stamp, coverage: 'complete', job_count: 1, message: '', pages_scanned: 1 };
const vacancy = { id: 'bag:a1', org_id: 'bag', title: 'Gesundheitsökonomie Projektleitung', organization: 'BAG', url: 'https://jobs.admin.ch/jobs/1', location: 'Bern', description: 'Planung und Analyse im Gesundheitswesen.', pensum: '80–100%', first_seen: stamp, last_seen: stamp, fetched_at: stamp, detail_file: './bag.json', status: 'open', role: 'Gesundheitsökonomie / HTA', description_truncated: true };
const job = (n, extra = {}) => ({ ...vacancy, id: 'bag:' + n.toString(16), url: `https://jobs.admin.ch/jobs/${n}`, title: `Gesundheitsökonomie Analyse ${n}`, ...extra });
function manifest(overrides = {}) { return { version: 1, generated_at: stamp, run: { id: 'test', status: 'complete', started_at: stamp, finished_at: stamp, total_sources: CATALOG_SIZE, checked_sources: 1 }, jobs: [vacancy], sources: [source], ...overrides }; }
const FULL_TEXT = 'Volltext: Hier steht eine ausführliche Stellenbeschreibung.\n\nIhre Aufgaben\n• Analysen erstellen\n• <script>alert(1)</script> Berichte schreiben\n\nWir bieten ein gutes Umfeld.';
function shard(item = vacancy, overrides = {}) { const items = Array.isArray(item) ? item : [item]; return { version: 1, org_id: 'bag', source, jobs: items.map(entry => ({ ...entry, description: FULL_TEXT, description_truncated: false })), ...overrides }; }
function response(value, extras = {}) { return { ok: true, status: 200, text: async () => JSON.stringify(value), headers: { get: () => null }, ...extras }; }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function setup({ index = manifest(), fetcher, configured = url, owner = null, location = 'https://site.example/', healthJobs = {}, wait = true } = {}) {
  const errors = [], requests = [], imports = [], events = [], vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM('<!doctype html><html><head></head><body><section class="site-view" data-view="stellen"><div id="publicJobFeed"></div></section><section class="site-view" data-view="quellen"><div id="sourceStatus"></div></section></body></html>', { url: location, runScripts: 'outside-only', virtualConsole: vc });
  const w = dom.window; w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  w.HEALTH_JOBS_FEED_URL = configured;
  w.HealthJobs = { getOwner: () => owner, importPublicJobs: (jobs, sources) => { imports.push({ jobs, sources, owner }); return { added: 1 }; }, ...healthJobs };
  w.fetch = async (requestUrl, options) => { requests.push({ url: requestUrl, options }); return fetcher ? fetcher(requestUrl, options, requests.length) : response(requestUrl.endsWith('index.json') ? index : shard()); };
  for (const name of ['publicfeed:loaded', 'publicfeed:query']) w.addEventListener(name, event => events.push({ name, detail: event.detail }));
  vm.runInContext('const DATA = ' + JSON.stringify(groups), dom.getInternalVMContext());
  for (const file of ['job-core.js', 'job-relevance.js', 'job-facts.js', 'feed.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  if (wait) await settle();
  const $ = selector => w.document.querySelector(selector), $$ = selector => Array.from(w.document.querySelectorAll(selector));
  return { w, dom, $, $$, imports, requests, errors, events,
    setOwner(next) { owner = next; w.dispatchEvent(new w.CustomEvent('healthjobs:auth', { detail: { userId: next } })); },
    filter(key, value) { const el = $(`[data-feed-filter="${key}"]`); el.value = value; assert.equal(el.value, value, `option ${value} for ${key}`); el.dispatchEvent(new w.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); },
    click(action) { const el = $(`[data-feed-action="${action}"]`); assert.ok(el, action); el.click(); },
    async route(id) { w.location.hash = id ? `#stelle-${id.replace(':', '-')}` : '#stellen'; w.dispatchEvent(new w.CustomEvent('site:route', { detail: id ? { view: 'stellen', sub: 'stelle', param: id, hash: w.location.hash } : { view: 'stellen', sub: '', param: '', hash: '#stellen' } })); await settle(); },
    key(key, target = w.document.activeElement || w.document.body, extra = {}) { target.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })); },
    titles: () => $$('.jf-job h3').map(el => el.textContent.trim()) };
}

test('public feed auto-loads without login or personal writes and covers all catalog sources', async t => {
  const x = await setup(); t.after(() => x.w.close());
  assert.equal(x.requests.length, 1); assert.equal(x.requests[0].options.credentials, 'omit');
  assert.equal(x.$$('.jf-job').length, 1);
  assert.equal(x.w.PublicJobFeed.getSourceStatus().length, CATALOG_SIZE);
  assert.equal(x.w.PublicJobFeed.getSources().length, CATALOG_SIZE);
  assert.match(x.$('#sourceStatus').textContent, /Noch ungeprüft/);
  assert.equal(x.w.localStorage.length, 0); assert.equal(x.imports.length, 0);
  assert.match(x.$('.jf-footnote').textContent, /zuletzt veröffentlichten Abruf/);
  assert.deepEqual(x.errors, []);
});

test('Stellen starts with a compact toolbar and a hero status; full source details live in the Quellen view', async t => {
  const x = await setup(); t.after(() => x.w.close());
  assert.equal(x.$('#publicJobFeed h2').className, 'visually-hidden');
  assert.doesNotMatch(x.$('#publicJobFeed').textContent, /Gesundheitsökonomie, Politik & Management/);
  assert.equal(x.$('#publicJobFeed .jf-metrics'), null); assert.equal(x.$('#publicJobFeed .jf-source'), null);
  // Count, date and the link to #quellen live in the site hero; the feed only adds warnings.
  assert.equal(x.$('#jfStatus .jf-statusline'), null);
  assert.equal(x.$('#jfStatus .jf-stale'), null);
  assert.ok(x.$('#sourceStatus .view-head h2')); assert.ok(x.$$('#sourceStatus .jf-source').length >= CATALOG_SIZE);
  assert.deepEqual(plain(x.events.filter(e => e.name === 'publicfeed:loaded').map(e => e.detail)), [{ count: 1, generatedAt: stamp }]);
  const y = await setup({ index: manifest({ generated_at: new Date(Date.now() - 3 * 86400000).toISOString() }) }); t.after(() => y.w.close());
  assert.match(y.$('#jfStatus .jf-stale').textContent, /älter als 48 Stunden/);
});

test('skeleton placeholders keep the layout stable while the snapshot loads', async t => {
  const pending = deferred();
  const x = await setup({ fetcher: requestUrl => requestUrl.endsWith('index.json') ? pending.promise : response(shard()) }); t.after(() => x.w.close());
  assert.equal(x.$$('#jfJobs .jf-job-skeleton').length, 5); assert.equal(x.$('#jfJobs').getAttribute('aria-busy'), 'true');
  pending.resolve(response(manifest())); await settle();
  assert.equal(x.$$('#jfJobs .skeleton').length, 0); assert.equal(x.$$('.jf-job').length, 1);
});

test('filters and "Mehr laden" include associated employers without duplicating vacancies', async t => {
  const jobs = Array.from({ length: 27 }, (_, i) => job(i + 1, { title: i === 26 ? 'Gesundheitsökonomie Datenanalyse' : 'Gesundheitsökonomie Projektleitung ' + i, org_ids: ['bag', 'suva'], first_seen: new Date(Date.UTC(2026, 0, i + 1)).toISOString() }));
  const x = await setup({ index: manifest({ jobs, sources: [source, { ...source, org_id: 'suva' }] }) }); t.after(() => x.w.close());
  assert.equal(x.$$('.jf-job').length, 25);
  assert.match(x.$('.jf-job h3').textContent, /Datenanalyse/);
  x.click('more'); assert.equal(x.$$('.jf-job').length, 27); assert.equal(x.$('#jfPagination').textContent, '');
  assert.match(x.w.location.search, /seite=2/);
  x.filter('employer', 'suva'); assert.match(x.$('#jfResultsCount').textContent, /^27 fachlich passende Stellen/);
  x.filter('q', 'Datenanalyse'); assert.equal(x.$$('.jf-job').length, 1);
  x.filter('canton', 'ZH'); assert.equal(x.$$('.jf-job').length, 0);
  assert.deepEqual(x.$$('.jf-chip').map(el => el.dataset.filterKey), ['q', 'canton', 'employer']);
  x.click('reset'); x.filter('category', 'bund'); x.filter('focus', 'Gesundheitsökonomie / HTA'); assert.equal(x.$$('.jf-job').length, 25);
  assert.equal(x.requests.length, 1); assert.equal(x.imports.length, 0);
});

test('active filter chips are removable and the result count reflects the filtered total', async t => {
  const x = await setup({ index: manifest({ jobs: [job(1, { location: 'Lausanne' }), job(2, { location: 'Bern' }), job(3, { location: 'Zürich', title: 'Junior Gesundheitsökonomin' })] }) }); t.after(() => x.w.close());
  x.filter('canton', 'westschweiz'); assert.match(x.$('#jfResultsCount').textContent, /^1 fachlich passende Stelle von 3/);
  assert.match(x.$('.jf-chip').textContent, /Region:.*Westschweiz/);
  x.$('.jf-chip').click(); assert.equal(x.$$('.jf-job').length, 3); assert.equal(x.$('#jfCanton').value, '');
  x.filter('seniority', 'junior'); assert.deepEqual(x.titles(), ['Junior Gesundheitsökonomin']);
  assert.match(x.$('#jfFilterLabel').textContent, /Filter \(1\)/);
});

test('facts prefer index fields and fall back to local extraction for older snapshots', async t => {
  const deadline = isoDay(5);
  const jobs = [
    job(1, { title: 'Senior Gesundheitsökonom', location: 'Bern', deadline, seniority: 'lead', canton: 'ZH', salary_range: { min: 100000, max: 120000, currency: 'CHF', period: 'year', source: 'Inserat' }, salary_hint: 'CHF 100’000–120’000 pro Jahr', start_date: 'sofort' }),
    job(2, { title: 'Junior Gesundheitsökonomin', location: 'Lausanne', description: 'Analyse im Gesundheitswesen. Bewerbungsfrist: ' + deadline.split('-').reverse().join('.') + '. Stellenantritt per sofort.' })
  ];
  const x = await setup({ index: manifest({ jobs }) }); t.after(() => x.w.close());
  const [indexed, extracted] = ['bag:1', 'bag:2'].map(id => x.w.PublicJobFeed.getAllJobs().find(item => item.id === id));
  assert.equal(indexed.seniority, 'lead'); assert.equal(indexed.canton, 'ZH'); assert.equal(indexed.deadline, deadline); assert.equal(indexed.salary_range.max, 120000);
  assert.equal(extracted.seniority, 'junior'); assert.equal(extracted.canton, 'VD'); assert.equal(extracted.deadline, deadline); assert.equal(extracted.start_date, 'sofort');
  const card = x.$('[data-job-id="bag:1"]');
  assert.match(card.textContent, /Leitung/); assert.match(card.textContent, /Frist in 5 Tagen/); assert.ok(card.querySelector('.jf-deadline.is-urgent'));
});

test('duplicate postings from older snapshots are merged; a duplicate detail URL resolves to the kept vacancy', async t => {
  const x = await setup({ index: manifest({ jobs: [job(1, { url: 'https://jobs.admin.ch/de/jobs/7?utm_source=x' }), job(2, { url: 'https://jobs.admin.ch/fr/jobs/7' }), job(3)] }) }); t.after(() => x.w.close());
  assert.equal(x.w.PublicJobFeed.getAllJobs().length, 2);
  const merged = x.w.PublicJobFeed.getAllJobs().find(item => item.duplicate_ids.length);
  assert.ok(merged); assert.match(x.$('#sourceStatus').textContent, /1 mehrfach veröffentlichte/);
  await x.route(merged.duplicate_ids[0]);
  assert.equal(x.$('#jfDetailTitle').textContent, merged.title);
});

test('sorting by deadline, workload and employer', async t => {
  const jobs = [
    job(1, { title: 'Gesundheitsökonomie A', deadline: isoDay(20), pensum: '50%', organization: 'Zeta' }),
    job(2, { title: 'Gesundheitsökonomie B', pensum: '100%', organization: 'Alpha' }),
    job(3, { title: 'Gesundheitsökonomie C', deadline: isoDay(3), pensum: '60–80%', organization: 'Mitte' })
  ];
  const x = await setup({ index: manifest({ jobs }) }); t.after(() => x.w.close());
  assert.deepEqual(Array.from(x.$('#jfSort').options, o => o.value), ['neu', 'frist', 'pensum', 'arbeitgeber']);
  x.filter('sort', 'frist'); assert.deepEqual(x.titles(), ['Gesundheitsökonomie C', 'Gesundheitsökonomie A', 'Gesundheitsökonomie B']);
  x.filter('sort', 'pensum'); assert.deepEqual(x.titles(), ['Gesundheitsökonomie B', 'Gesundheitsökonomie C', 'Gesundheitsökonomie A']);
  x.filter('sort', 'arbeitgeber'); assert.deepEqual(x.titles(), ['Gesundheitsökonomie B', 'Gesundheitsökonomie C', 'Gesundheitsökonomie A']);
  assert.match(x.w.location.search, /sort=arbeitgeber/);
});

test('filters, sort and page are restored from and written to the query string; header search stays in sync', async t => {
  const jobs = Array.from({ length: 30 }, (_, i) => job(i + 1, { title: `Gesundheitsökonomie Daten ${i}`, location: i % 2 ? 'Bern' : 'Basel' }));
  const x = await setup({ index: manifest({ jobs }), location: 'https://site.example/?q=Daten&kanton=BE&stufe=bogus&sort=frist&seite=2&foo=1#stellen' }); t.after(() => x.w.close());
  assert.equal(x.$('#jfQuery').value, 'Daten'); assert.equal(x.$('#jfCanton').value, 'BE'); assert.equal(x.$('#jfSeniority').value, ''); assert.equal(x.$('#jfSort').value, 'frist');
  assert.equal(x.$$('.jf-job').length, 15);
  assert.deepEqual(plain(x.events.find(e => e.name === 'publicfeed:query').detail), { q: 'Daten' });
  x.filter('focus', 'Gesundheitsökonomie / HTA');
  const params = new x.w.URLSearchParams(x.w.location.search);
  assert.equal(params.get('fach'), 'Gesundheitsökonomie / HTA'); assert.equal(params.get('seite'), null); assert.equal(params.get('foo'), '1'); assert.equal(x.w.location.hash, '#stellen');
  x.w.dispatchEvent(new x.w.CustomEvent('site:search', { detail: { q: 'Basel' } }));
  assert.equal(x.$('#jfQuery').value, 'Basel'); assert.equal(new x.w.URLSearchParams(x.w.location.search).get('q'), 'Basel');
  x.events.length = 0; x.filter('q', 'Bern'); assert.deepEqual(plain(x.events.map(e => e.detail)), [{ q: 'Bern' }]);
});

test('job detail route loads the full text safely, shows facts, related jobs and JSON-LD, and closes back to the list', async t => {
  const deadline = isoDay(4);
  const main = job(1, { title: 'Gesundheitsökonomin HTA', deadline, salary_range: { min: null, max: 131870, currency: 'CHF', period: 'year', source: 'Lohnklasse 20 (Bund)' }, salary_hint: 'Lohnklasse 20', seniority: 'senior', pensum: '80–100%' });
  const others = [job(2, { title: 'Gesundheitsökonomie Analyst' }), job(3, { title: 'Gesundheitsökonomie Projekt' })];
  const x = await setup({ index: manifest({ jobs: [main, ...others] }), fetcher: requestUrl => response(requestUrl.endsWith('index.json') ? manifest({ jobs: [main, ...others] }) : shard([main, ...others])) }); t.after(() => x.w.close());
  await x.route('bag:1');
  const dialog = x.$('#jfDetail');
  assert.ok(dialog.hasAttribute('open')); assert.equal(x.$('#jfDetailTitle').textContent, 'Gesundheitsökonomin HTA');
  assert.equal(x.requests.length, 2); assert.equal(x.requests[1].url, 'https://feed.example/public/bag.json');
  assert.match(x.w.document.title, /^Gesundheitsökonomin HTA – BAG/);
  assert.equal(dialog.querySelectorAll('script, img').length, 0);
  assert.deepEqual(Array.from(dialog.querySelectorAll('.jf-detail-text li'), li => li.textContent), ['Analysen erstellen', '<script>alert(1)</script> Berichte schreiben']);
  assert.equal(dialog.querySelector('.jf-detail-text h4').textContent, 'Ihre Aufgaben');
  assert.match(dialog.querySelector('.jf-facts').textContent, /läuft in 4 Tagen ab/); assert.ok(dialog.querySelector('.jf-fact.is-urgent'));
  assert.match(dialog.querySelector('.jf-facts').textContent, /ca\. bis CHF 131’870 pro Jahr · Quelle: Lohnklasse 20 \(Bund\)/);
  assert.match(dialog.querySelector('.jf-facts').textContent, /Senior/);
  assert.equal(dialog.querySelector('.jf-detail-employer a').getAttribute('href'), '#arbeitgeber-bag');
  assert.equal(dialog.querySelectorAll('#jfSimilarHeading + .jf-mini-list li').length, 2);
  assert.match(dialog.textContent, /Mehr von BAG/);
  const ld = JSON.parse(x.$('#jobPostingLd').textContent);
  assert.equal(ld['@type'], 'JobPosting'); assert.equal(ld.validThrough, deadline); assert.equal(ld.employmentType, 'FULL_TIME');
  assert.equal(ld.hiringOrganization.name, 'BAG'); assert.ok(ld.hiringOrganization.sameAs.startsWith('https://'));
  assert.equal(ld.jobLocation.address.addressRegion, 'BE'); assert.equal(ld.jobLocation.address.addressCountry, 'CH');
  assert.equal(ld.baseSalary.value.maxValue, 131870); assert.equal(ld.directApply, false); assert.match(ld.description, /Volltext/);
  assert.equal(ld.url, 'https://site.example/#stelle-bag-1');
  x.key('Escape', dialog);
  assert.equal(x.w.location.hash, '#stellen'); assert.equal(dialog.hasAttribute('open'), false); assert.equal(x.$('#jobPostingLd'), null);
  assert.equal(x.w.document.activeElement, x.$('[data-job-link="bag:1"]'));
});

test('a direct detail URL waits for the feed and reports vacancies that are gone', async t => {
  const pending = deferred();
  const x = await setup({ fetcher: requestUrl => requestUrl.endsWith('index.json') ? pending.promise : response(shard()) }); t.after(() => x.w.close());
  await x.route('bag:a1');
  assert.ok(x.$('#jfDetail').hasAttribute('open')); assert.ok(x.$('#jfDetail .skeleton'));
  pending.resolve(response(manifest())); await settle();
  assert.equal(x.$('#jfDetailTitle').textContent, vacancy.title); assert.match(x.$('#jfDetailText').textContent, /Volltext/);
  await x.route('bag:ffff');
  assert.equal(x.$('#jfDetailTitle').textContent, 'Stelle nicht gefunden'); assert.equal(x.$('#jobPostingLd'), null);
});

test('Merken saves through HealthJobs.toggleSaved with the full text, and unsaves without a download', async t => {
  const saved = new Set(), calls = [];
  const healthJobs = { isSaved: id => saved.has(id), toggleSaved: (item, src) => { calls.push({ item, src }); if (saved.has(item.id)) saved.delete(item.id); else saved.add(item.id); return { saved: saved.has(item.id) }; } };
  const x = await setup({ healthJobs }); t.after(() => x.w.close());
  const star = () => x.$('.jf-save');
  assert.equal(star().getAttribute('aria-pressed'), 'false'); assert.equal(x.$$('#publicJobFeed .btn-primary').filter(el => /übernehmen/.test(el.textContent)).length, 0);
  star().click(); await settle();
  assert.equal(calls.length, 1); assert.match(calls[0].item.description, /^Volltext:/); assert.equal(calls[0].src.org_id, 'bag'); assert.equal(x.imports.length, 0);
  assert.equal(star().getAttribute('aria-pressed'), 'true'); assert.match(x.$('#jfNotice').textContent, /Gemerkt/);
  star().click(); await settle();
  assert.equal(calls.length, 2); assert.equal(x.requests.length, 2); assert.equal(star().getAttribute('aria-pressed'), 'false');
});

test('explicit save without toggleSaved lazily loads the shard and hands safe full records to the workspace', async t => {
  const x = await setup(); t.after(() => x.w.close());
  await x.w.PublicJobFeed.importJob(vacancy.id);
  assert.equal(x.requests.length, 2); assert.equal(x.requests[1].url, 'https://feed.example/public/bag.json');
  assert.equal(x.imports.length, 1); assert.match(x.imports[0].jobs[0].description, /^Volltext:/);
  assert.equal(x.imports[0].jobs[0].description_truncated, false); assert.equal(x.imports[0].sources[0].org_id, 'bag');
  assert.equal(x.w.localStorage.length, 0); assert.match(x.$('#jfNotice').textContent, /übernommen/);
  assert.equal(x.$('.jf-save').getAttribute('aria-pressed'), 'true');
});

test('profile fit badges, reasons and the best-fit sort appear only with a profile match', async t => {
  let active = true;
  const healthJobs = { getProfileMatch: item => active ? { score: item.id === 'bag:2' ? 82 : 40, label: 'Gute Passung', reasons: ['Pensum passt'] } : null };
  const x = await setup({ index: manifest({ jobs: [job(1), job(2, { first_seen: new Date(Date.now() - 86400000).toISOString() })] }), healthJobs }); t.after(() => x.w.close());
  assert.match(x.$('[data-job-id="bag:2"] .jf-fit').textContent, /82 % Passung/);
  assert.ok(Array.from(x.$('#jfSort').options, o => o.value).includes('passung'));
  x.filter('sort', 'passung'); assert.equal(x.$('.jf-job').dataset.jobId, 'bag:2');
  await x.route('bag:2'); assert.match(x.$('.jf-fit-box').textContent, /Pensum passt/);
  await x.route('');
  active = false; x.w.dispatchEvent(new x.w.CustomEvent('healthjobs:profile-changed'));
  assert.equal(x.$$('.jf-fit').length, 0); assert.ok(!Array.from(x.$('#jfSort').options, o => o.value).includes('passung'));
});

test('job alarm from the detail is prefilled with focus and canton', async t => {
  const prefills = [];
  const x = await setup({ healthJobs: { openAlertDialog: prefill => prefills.push(prefill) } }); t.after(() => x.w.close());
  await x.route('bag:a1'); x.$('#jfDetail [data-feed-action="alert"]').click();
  assert.deepEqual(plain(prefills), [{ focus: 'Gesundheitsökonomie / HTA', canton: 'BE' }]);
});

test('keyboard shortcuts move between cards, toggle Merken and open details', async t => {
  const saved = new Set();
  const jobs = [job(1, { first_seen: new Date(Date.now() - 1000).toISOString() }), job(2, { first_seen: new Date(Date.now() - 2000).toISOString() })];
  const x = await setup({ fetcher: requestUrl => response(requestUrl.endsWith('index.json') ? manifest({ jobs }) : shard(jobs)), healthJobs: { isSaved: id => saved.has(id), toggleSaved: item => { saved.add(item.id); return {}; } } }); t.after(() => x.w.close());
  x.key('j', x.w.document.body); assert.equal(x.w.document.activeElement.dataset.jobLink, 'bag:1');
  x.key('j'); assert.equal(x.w.document.activeElement.dataset.jobLink, 'bag:2');
  x.key('k'); assert.equal(x.w.document.activeElement.dataset.jobLink, 'bag:1');
  x.key('m'); await settle(); assert.ok(saved.has('bag:1'));
  x.key('?'); assert.equal(x.$('#jfShortcuts').hidden, false); x.key('?'); assert.equal(x.$('#jfShortcuts').hidden, true);
  x.$('#jfQuery').focus(); x.key('j'); assert.equal(x.w.document.activeElement, x.$('#jfQuery'));
  x.$('[data-job-link="bag:2"]').focus(); x.key('o'); assert.equal(x.w.location.hash, '#stelle-bag-2');
});

test('density toggle is remembered per browser', async t => {
  const x = await setup(); t.after(() => x.w.close());
  x.$('[data-density="list"]').click();
  assert.ok(x.$('.jf-shell').classList.contains('is-list')); assert.equal(x.w.localStorage.getItem('healthjobs.feedDensity'), 'list');
});

test('account switches and A-B-A switches cannot import a pending full-text request', async t => {
  const pending = deferred(); const x = await setup({ owner: 'A', fetcher: requestUrl => requestUrl.endsWith('index.json') ? response(manifest()) : pending.promise }); t.after(() => x.w.close());
  const operation = x.w.PublicJobFeed.importJob(vacancy.id);
  x.setOwner('B'); x.setOwner('A'); pending.resolve(response(shard())); await operation;
  assert.equal(x.imports.length, 0); assert.equal(x.$('[data-feed-action="save"]').disabled, false);
});

test('late manifest responses cannot replace the latest requested snapshot', async t => {
  const oldIndex = deferred(); let indexCalls = 0;
  const x = await setup({ fetcher: requestUrl => {
    if (!requestUrl.endsWith('index.json')) return response(shard());
    indexCalls++; return indexCalls === 2 ? oldIndex.promise : response(manifest({ jobs: [{ ...vacancy, title: indexCalls > 2 ? 'Neuer Stand Gesundheitsökonomie' : 'Erster Stand Gesundheitsökonomie' }] }));
  } }); t.after(() => x.w.close());
  const old = x.w.PublicJobFeed.refresh(); await x.w.PublicJobFeed.refresh(); oldIndex.resolve(response(manifest({ jobs: [{ ...vacancy, title: 'Veraltete Antwort Gesundheitsökonomie' }] }))); await old;
  assert.equal(x.w.PublicJobFeed.getJobs()[0].title, 'Neuer Stand Gesundheitsökonomie');
});

test('unsafe URLs, path traversal and unknown catalog IDs are rejected; text is inert', async t => {
  const unsafe = [
    { ...vacancy, id: 'bag:a2', url: 'javascript:alert(1)' },
    { ...vacancy, id: 'bag:a3', detail_file: '../bag.json' },
    { ...vacancy, id: 'bag:a4', detail_file: 'https://evil.example/bag.json' },
    { ...vacancy, id: 'bag:a5', detail_file: './%2e%2e/bag.json' },
    { ...vacancy, id: '__proto__:a6', org_id: '__proto__' }
  ];
  const x = await setup({ index: manifest({ jobs: [{ ...vacancy, title: 'Gesundheitsökonomie <img src=x onerror=alert(1)>', description: '<script>alert(2)</script>' }, ...unsafe], sources: [{ ...source, message: '<img src=x onerror=alert(3)>', url: 'javascript:alert(4)' }] }) }); t.after(() => x.w.close());
  assert.equal(x.w.PublicJobFeed.getJobs().length, 1); assert.equal(x.$$('body img, body script').length, 0);
  assert.match(x.$('.jf-job h3').textContent, /<img/);
  assert.equal(x.$$('a[href^="javascript:"]').length, 0);
  assert.match(x.$('#sourceStatus').textContent, /5 ungültige/);
  await x.route(vacancy.id);
  assert.equal(x.$$('body img, body script').length, 0); assert.doesNotMatch(x.$('#jobPostingLd').textContent, /<\/?script|<img/);
});

test('full-text source, job ID and canonical URL must match the selected index record', async t => {
  const invalids = [shard(vacancy, { org_id: 'suva' }), shard(vacancy, { source: { ...source, org_id: 'suva' } }), shard({ ...vacancy, id: 'bag:ffff' }), shard({ ...vacancy, url: 'https://other.example/jobs/1' }), shard({ ...vacancy, org_id: 'suva' })];
  for (const value of invalids) {
    const x = await setup({ fetcher: requestUrl => response(requestUrl.endsWith('index.json') ? manifest() : value) }); t.after(() => x.w.close());
    await x.w.PublicJobFeed.importJob(vacancy.id); assert.equal(x.imports.length, 0); assert.notEqual(x.$('#jfNotice').textContent, '');
    await x.route(vacancy.id); assert.doesNotMatch(x.$('#jfDetailText').textContent, /Volltext:/); assert.match(x.$('#jfDetailText').textContent, /Auszug/);
  }
});

test('byte and item bounds reject oversized downloads before showing or importing them', async t => {
  const x = await setup({ fetcher: async () => response(manifest(), { headers: { get: () => String(25 * 1024 * 1024) }, text: async () => { throw new Error('Body must not be consumed'); } }) }); t.after(() => x.w.close());
  assert.match(x.$('#jfStatus').textContent, /zulässige Grösse/); assert.equal(x.w.PublicJobFeed.getJobs().length, 0);
  assert.deepEqual(x.events.find(e => e.name === 'publicfeed:loaded').detail.count, null);
  const y = await setup({ index: manifest({ jobs: Array(30001).fill(vacancy) }) }); t.after(() => y.w.close());
  assert.match(y.$('#jfStatus').textContent, /zu grosses Format/);
});

test('unconfigured, unavailable and never-crawled feeds present honest empty states', async t => {
  const x = await setup({ configured: '' }); t.after(() => x.w.close());
  assert.equal(x.requests.length, 0); assert.match(x.$('#jfStatus').textContent, /noch nicht konfiguriert/);
  const y = await setup({ fetcher: async () => response(null, { ok: false, status: 404 }) }); t.after(() => y.w.close());
  assert.match(y.$('#jfStatus').textContent, /HTTP 404/); assert.equal(y.$$('.jf-job').length, 0);
  const z = await setup({ index: manifest({ generated_at: null, sources: [], jobs: [], run: { status: 'pending', total_sources: CATALOG_SIZE, checked_sources: 0 } }) }); t.after(() => z.w.close());
  assert.match(z.$('#sourceStatus').textContent, /Noch kein serverseitiger Abruf/);
  assert.equal(z.w.PublicJobFeed.getSourceStatus().filter(s => s.status === 'pending').length, CATALOG_SIZE);
});

test('source freshness, last confirmation and refresh failures preserve the last published data honestly', async t => {
  let calls = 0;
  const x = await setup({ fetcher: async () => ++calls === 1 ? response(manifest({ sources: [{ ...source, status: 'error', stale: true, message: 'Zeitüberschreitung' }] })) : response(null, { ok: false, status: 503 }) }); t.after(() => x.w.close());
  assert.match(x.$('#jfSources').textContent, /Veralteter Stand/);
  assert.match(x.$('.jf-job-dates').textContent, /Zuletzt bestätigt/);
  assert.match(x.$('.jf-job-dates').textContent, /Quelle zuletzt nicht vollständig/);
  await x.w.PublicJobFeed.refresh(); assert.equal(x.w.PublicJobFeed.getJobs().length, 1);
  assert.match(x.$('#jfStatus').textContent, /zuvor geladene Stand bleibt sichtbar/);
  assert.match(x.$('#sourceStatus').textContent, /zuvor geladene Stand bleibt sichtbar/);
});

test('refresh cancels a pending import so data from different snapshots cannot mix', async t => {
  const pending = deferred();
  const x = await setup({ fetcher: requestUrl => requestUrl.endsWith('index.json') ? response(manifest()) : pending.promise }); t.after(() => x.w.close());
  const importing = x.w.PublicJobFeed.importJob(vacancy.id);
  await x.w.PublicJobFeed.refresh(); pending.resolve(response(shard())); await importing;
  assert.equal(x.imports.length, 0); assert.equal(x.$('[data-feed-action="save"]').disabled, false);
});

test('streaming readers enforce bytes without trusting content-length headers', async t => {
  let cancelled = false, unlocked = false;
  const x = await setup({ fetcher: async () => response(null, { body: { getReader: () => ({ read: async () => ({ done: false, value: new Uint8Array(25 * 1024 * 1024) }), cancel: async () => { cancelled = true; }, releaseLock: () => { unlocked = true; } }) } }) }); t.after(() => x.w.close());
  assert.equal(cancelled, true); assert.equal(unlocked, true);
  assert.match(x.$('#jfStatus').textContent, /zulässige Grösse/); assert.equal(x.imports.length, 0);
});

test('hiring employer is preserved for aggregator sources and portal overrides control source status', async t => {
  const noPortal = groups.flatMap(group => group.orgs).find(org => !org.jobs); assert.ok(noPortal);
  const aggregatorJob = { ...vacancy, organization: 'Spitex Beispielstadt' };
  const index = manifest({ jobs: [aggregatorJob], sources: [source, { org_id: noPortal.id, name: noPortal.name, url: 'https://example.org/jobs', has_portal: true, status: 'ok' }] });
  const x = await setup({ fetcher: requestUrl => response(requestUrl.endsWith('index.json') ? index : shard(aggregatorJob)) }); t.after(() => x.w.close());
  assert.equal(x.w.PublicJobFeed.getJobs()[0].organization, 'Spitex Beispielstadt');
  assert.match(x.$('.jf-organization').textContent, /Quelle: Bundesamt/);
  assert.equal(x.w.PublicJobFeed.getSourceStatus().find(item => item.org_id === noPortal.id).no_portal, false);
  x.filter('q', 'Bundesamt'); assert.equal(x.$$('.jf-job').length, 1);
  await x.w.PublicJobFeed.importJob(vacancy.id); assert.equal(x.imports[0].jobs[0].organization, 'Spitex Beispielstadt');
});

test('older broad snapshots are filtered by professional focus before display, search or import', async t => {
  const unrelated = [
    { ...vacancy, id: 'bag:c1', title: 'Dipl. Pflegefachperson 80–100%', description: 'Patientenbetreuung und Pflege auf einer medizinischen Station.' },
    { ...vacancy, id: 'bag:c2', title: 'Oberärztin Innere Medizin', description: 'Ärztliche Behandlung im Spital. Wir sind innovativ in der Gesundheitsökonomie.' },
    { ...vacancy, id: 'bag:c3', title: 'Koch / Köchin', description: 'Verantwortung für die Speiseproduktion im Gesundheitswesen.' },
  ];
  const x = await setup({ index: manifest({ jobs: [vacancy, ...unrelated], sources: [{ ...source, job_count: 4 }] }) }); t.after(() => x.w.close());
  assert.deepEqual(Array.from(x.w.PublicJobFeed.getJobs(), item => item.id), [vacancy.id]);
  assert.match(x.$('#sourceStatus').textContent, /3 fachfremde oder fachlich nicht eindeutig belegte Inserate ausgeblendet/);
  x.filter('q', 'Pflegefachperson'); assert.equal(x.$$('.jf-job').length, 0);
  x.click('reset'); assert.equal(x.w.PublicJobFeed.getJobs().length, 1);
  await x.w.PublicJobFeed.importJob('bag:c1'); assert.equal(x.requests.length, 1); assert.equal(x.imports.length, 0);
  assert.match(x.$('.jf-focus-badge').textContent, /Gesundheitsökonomie/);
  assert.ok(!Array.from(x.$$('#jfFocus option'), option => option.textContent).some(label => /Weitere|fachfremd/.test(label)));
});

test('new scoped snapshots preserve full-text evidence absent from a compact excerpt', async t => {
  const relevance = { eligible: true, category: 'Versorgungsforschung / Public Health', reasons: ['Versorgungsforschung in den Anforderungen belegt.'], policy_version: 2 };
  const x = await setup({ index: manifest({ scope: { policy_version: 2, scanned_jobs: 100, relevant_jobs: 1, excluded_jobs: 99 }, jobs: [{ ...vacancy, title: 'Wissenschaftliche Mitarbeit', description: 'Willkommen an unserer Hochschule.', relevance }], sources: [{ ...source, raw_job_count: 100, relevant_job_count: 1, filtered_out_count: 99 }] }) }); t.after(() => x.w.close());
  assert.equal(x.w.PublicJobFeed.getJobs().length, 1);
  assert.equal(x.w.PublicJobFeed.getJobs()[0].relevance.category, relevance.category);
  x.filter('focus', 'Gesundheitsökonomie / HTA'); assert.equal(x.w.PublicJobFeed.getJobs().length, 0);
  x.filter('focus', relevance.category); assert.equal(x.w.PublicJobFeed.getJobs().length, 1);
  assert.match(x.$('#sourceStatus').textContent, /99 fachfremde/);
  await x.route(vacancy.id); assert.match(x.$('#jfDetail .jf-relevance').textContent, /Anforderungen belegt/);
});

test('technical coverage is independent of matching jobs; failed empty sources never claim old vacancies', async t => {
  const x = await setup({ index: manifest({ jobs: [vacancy], sources: [
    { ...source, status: 'partial', coverage: 'partial', stale: true, job_count: 1 },
    { ...source, org_id: 'suva', status: 'ok', coverage: 'complete', job_count: 0 },
    { ...source, org_id: 'obsan', status: 'error', coverage: 'unknown', stale: true, job_count: 0, checked_at: stamp, last_success_at: null, last_complete_at: null },
  ] }) }); t.after(() => x.w.close());
  const metrics = x.$$('#sourceStatus .jf-metrics > div').map(node => node.textContent);
  assert.deepEqual(metrics, ['1Fachlich passende Stellen', `1/${CATALOG_SIZE}Quellen vollständig abgerufen`, '1Quellen mit passenden Stellen', `${CATALOG_SIZE - 1}Nicht vollständig erfasst`]);
  const sourceRows = x.$$('.jf-source');
  const suva = sourceRows.find(node => /Suva/.test(node.querySelector('h4').textContent));
  const obsan = sourceRows.find(node => /Obsan/.test(node.querySelector('h4').textContent));
  assert.match(suva.textContent, /Keine fachlich passenden Stellen im vollständigen Abruf/);
  assert.match(obsan.textContent, /Angebot unbekannt/);
  assert.doesNotMatch(obsan.textContent, /Veralteter Stand/);
});

test('full-text import refuses a now unrelated vacancy instead of adding it to the workspace', async t => {
  const x = await setup({ fetcher: requestUrl => response(requestUrl.endsWith('index.json') ? manifest() : shard({ ...vacancy, title: 'Dipl. Pflegefachperson' })) }); t.after(() => x.w.close());
  await x.w.PublicJobFeed.importJob(vacancy.id);
  assert.equal(x.imports.length, 0);
  assert.match(x.$('#jfNotice').textContent, /fachliche Bezug nicht mehr bestätigt/);
});

test('"Mehr von" groups by the hiring employer, also for aggregator sources', async t => {
  const jobs = [job(1, { organization: 'Spital Alpha' }), job(2, { organization: 'Spital Alpha', title: 'Gesundheitsökonomie Controlling' }), job(3, { organization: 'Spital Beta', location: 'Genf' })];
  const x = await setup({ fetcher: requestUrl => response(requestUrl.endsWith('index.json') ? manifest({ jobs }) : shard(jobs)) }); t.after(() => x.w.close());
  await x.route('bag:1');
  assert.match(x.$('#jfEmployerHeading').textContent, /Mehr von Spital Alpha/);
  assert.doesNotMatch(x.$('#jfDetail').textContent, /Spital Beta/);
  x.$('[data-feed-action="employer-jobs"]').click();
  assert.equal(x.w.location.hash, '#stellen'); assert.equal(x.$('#jfQuery').value, 'Spital Alpha');
  assert.deepEqual(x.$$('.jf-job').map(el => el.dataset.jobId).sort(), ['bag:1', 'bag:2']);
  assert.equal(new x.w.URLSearchParams(x.w.location.search).get('q'), 'Spital Alpha');
});
