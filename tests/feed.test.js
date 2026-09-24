const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..');
const groups = JSON.parse(fs.readFileSync(path.join(root, 'data/organizations.json'), 'utf8'));
const tick = () => new Promise(resolve => setImmediate(resolve));
const stamp = new Date().toISOString(), url = 'https://feed.example/public/index.json';
const source = { org_id: 'bag', name: 'BAG', url: 'https://jobs.admin.ch/', status: 'ok', checked_at: stamp, last_success_at: stamp, last_complete_at: stamp, coverage: 'complete', job_count: 1, message: '', pages_scanned: 1 };
const vacancy = { id: 'bag:a1', org_id: 'bag', title: 'Gesundheitsökonomie Projektleitung', organization: 'BAG', url: 'https://jobs.admin.ch/jobs/1', location: 'Bern', description: 'Planung und Analyse im Gesundheitswesen.', pensum: '80–100%', first_seen: stamp, last_seen: stamp, fetched_at: stamp, detail_file: './bag.json', status: 'open', role: 'Gesundheitsökonomie / HTA', description_truncated: true };
function manifest(overrides = {}) { return { version: 1, generated_at: stamp, run: { id: 'test', status: 'complete', started_at: stamp, finished_at: stamp, total_sources: 85, checked_sources: 1 }, jobs: [vacancy], sources: [source], ...overrides }; }
function shard(job = vacancy, overrides = {}) { return { version: 1, org_id: 'bag', source, jobs: [{ ...job, description: 'Volltext: Hier steht eine ausführliche Stellenbeschreibung.', description_truncated: false }], ...overrides }; }
function response(value, extras = {}) { return { ok: true, status: 200, text: async () => JSON.stringify(value), headers: { get: () => null }, ...extras }; }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function setup({ index = manifest(), fetcher, configured = url, owner = null } = {}) {
  const errors = [], requests = [], imports = [], vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM('<!doctype html><html><body><section id="publicJobFeed" aria-label="Öffentlicher Jobfeed"></section></body></html>', { url: 'https://site.example/', runScripts: 'outside-only', virtualConsole: vc });
  const w = dom.window; w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  w.HEALTH_JOBS_FEED_URL = configured;
  w.HealthJobs = { getOwner: () => owner, importPublicJobs: (jobs, sources) => { imports.push({ jobs, sources, owner }); return { added: 1 }; } };
  w.fetch = async (requestUrl, options) => { requests.push({ url: requestUrl, options }); return fetcher ? fetcher(requestUrl, options, requests.length) : response(requestUrl.endsWith('index.json') ? index : shard()); };
  vm.runInContext('const DATA = ' + JSON.stringify(groups), dom.getInternalVMContext());
  for (const file of ['job-core.js', 'job-relevance.js', 'feed.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  await tick(); await tick();
  return { w, dom, imports, requests, errors, setOwner(next) { owner = next; w.dispatchEvent(new w.CustomEvent('healthjobs:auth', { detail: { userId: next } })); }, filter(key, value) { const el = w.document.querySelector(`[data-feed-filter="${key}"]`); el.value = value; el.dispatchEvent(new w.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }, click(action) { const el = w.document.querySelector(`[data-feed-action="${action}"]`); assert.ok(el, action); el.click(); } };
}

test('public feed auto-loads without login or personal writes and covers all catalog sources', async t => {
  const x = await setup(); t.after(() => x.w.close());
  assert.equal(x.requests.length, 1); assert.equal(x.requests[0].options.credentials, 'omit');
  assert.equal(x.w.document.querySelectorAll('.jf-job').length, 1);
  assert.equal(x.w.PublicJobFeed.getSourceStatus().length, 85);
  assert.match(x.w.document.getElementById('jfStatus').textContent, /Noch ungeprüft/);
  assert.equal(x.w.localStorage.length, 0); assert.equal(x.imports.length, 0);
  assert.match(x.w.document.querySelector('.jf-footnote').textContent, /zuletzt veröffentlichten Abruf/);
  assert.deepEqual(x.errors, []);
});

test('filters and recent-first pagination include associated employers without duplicating vacancies', async t => {
  const jobs = Array.from({ length: 27 }, (_, i) => ({ ...vacancy, id: 'bag:' + (i + 1).toString(16), title: i === 26 ? 'Gesundheitsökonomie Datenanalyse' : 'Gesundheitsökonomie Projektleitung ' + i, org_ids: ['bag', 'suva'], first_seen: new Date(Date.UTC(2026, 0, i + 1)).toISOString() }));
  const x = await setup({ index: manifest({ jobs, sources: [source, { ...source, org_id: 'suva' }] }) }); t.after(() => x.w.close());
  assert.equal(x.w.document.querySelectorAll('.jf-job').length, 25);
  assert.match(x.w.document.querySelector('.jf-job h3').textContent, /Datenanalyse/);
  x.click('next'); assert.equal(x.w.document.querySelectorAll('.jf-job').length, 2);
  x.filter('employer', 'suva'); assert.match(x.w.document.getElementById('jfResultsCount').textContent, /^27 fachlich passende Stellen/);
  x.filter('q', 'Datenanalyse'); assert.equal(x.w.document.querySelectorAll('.jf-job').length, 1);
  x.filter('location', 'Zürich'); assert.equal(x.w.document.querySelectorAll('.jf-job').length, 0);
  x.click('reset'); x.filter('category', 'bund'); x.filter('focus', 'Gesundheitsökonomie / HTA'); assert.equal(x.w.document.querySelectorAll('.jf-job').length, 25);
  assert.equal(x.requests.length, 1); assert.equal(x.imports.length, 0);
});

test('explicit import lazily loads full shard and hands safe full records to the workspace', async t => {
  const x = await setup(); t.after(() => x.w.close());
  await x.w.PublicJobFeed.importJob(vacancy.id);
  assert.equal(x.requests.length, 2); assert.equal(x.requests[1].url, 'https://feed.example/public/bag.json');
  assert.equal(x.imports.length, 1); assert.match(x.imports[0].jobs[0].description, /^Volltext:/);
  assert.equal(x.imports[0].jobs[0].description_truncated, false); assert.equal(x.imports[0].sources[0].org_id, 'bag');
  assert.equal(x.w.localStorage.length, 0); assert.match(x.w.document.getElementById('jfNotice').textContent, /übernommen/);
});

test('account switches and A-B-A switches cannot import a pending full-text request', async t => {
  const pending = deferred(); const x = await setup({ owner: 'A', fetcher: requestUrl => requestUrl.endsWith('index.json') ? response(manifest()) : pending.promise }); t.after(() => x.w.close());
  const operation = x.w.PublicJobFeed.importJob(vacancy.id);
  x.setOwner('B'); x.setOwner('A'); pending.resolve(response(shard())); await operation;
  assert.equal(x.imports.length, 0); assert.equal(x.w.document.querySelector('[data-feed-action="import"]').disabled, false);
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
  assert.equal(x.w.PublicJobFeed.getJobs().length, 1); assert.equal(x.w.document.querySelectorAll('img,script').length, 0);
  assert.match(x.w.document.querySelector('.jf-job h3').textContent, /<img/);
  assert.equal(x.w.document.querySelectorAll('a[href^="javascript:"]').length, 0);
  assert.match(x.w.document.getElementById('jfStatus').textContent, /5 ungültige/);
});

test('full-text source, job ID and canonical URL must match the selected index record', async t => {
  const invalids = [shard(vacancy, { org_id: 'suva' }), shard(vacancy, { source: { ...source, org_id: 'suva' } }), shard({ ...vacancy, id: 'bag:ffff' }), shard({ ...vacancy, url: 'https://other.example/jobs/1' }), shard({ ...vacancy, org_id: 'suva' })];
  for (const value of invalids) {
    const x = await setup({ fetcher: requestUrl => response(requestUrl.endsWith('index.json') ? manifest() : value) }); t.after(() => x.w.close());
    await x.w.PublicJobFeed.importJob(vacancy.id); assert.equal(x.imports.length, 0); assert.notEqual(x.w.document.getElementById('jfNotice').textContent, '');
  }
});

test('byte and item bounds reject oversized downloads before showing or importing them', async t => {
  const x = await setup({ fetcher: async () => response(manifest(), { headers: { get: () => String(25 * 1024 * 1024) }, text: async () => { throw new Error('Body must not be consumed'); } }) }); t.after(() => x.w.close());
  assert.match(x.w.document.getElementById('jfStatus').textContent, /zulässige Grösse/); assert.equal(x.w.PublicJobFeed.getJobs().length, 0);
  const y = await setup({ index: manifest({ jobs: Array(30001).fill(vacancy) }) }); t.after(() => y.w.close());
  assert.match(y.w.document.getElementById('jfStatus').textContent, /zu grosses Format/);
});

test('unconfigured, unavailable and never-crawled feeds present honest empty states', async t => {
  const x = await setup({ configured: '' }); t.after(() => x.w.close());
  assert.equal(x.requests.length, 0); assert.match(x.w.document.getElementById('jfStatus').textContent, /noch nicht konfiguriert/);
  const y = await setup({ fetcher: async () => response(null, { ok: false, status: 404 }) }); t.after(() => y.w.close());
  assert.match(y.w.document.getElementById('jfStatus').textContent, /HTTP 404/); assert.equal(y.w.document.querySelectorAll('.jf-job').length, 0);
  const z = await setup({ index: manifest({ generated_at: null, sources: [], jobs: [], run: { status: 'pending', total_sources: 85, checked_sources: 0 } }) }); t.after(() => z.w.close());
  assert.match(z.w.document.getElementById('jfStatus').textContent, /Noch kein serverseitiger Abruf/);
  assert.equal(z.w.PublicJobFeed.getSourceStatus().filter(s => s.status === 'pending').length, 85);
});

test('source freshness, last confirmation and refresh failures preserve the last published data honestly', async t => {
  let calls = 0;
  const x = await setup({ fetcher: async () => ++calls === 1 ? response(manifest({ sources: [{ ...source, status: 'error', stale: true, message: 'Zeitüberschreitung' }] })) : response(null, { ok: false, status: 503 }) }); t.after(() => x.w.close());
  assert.match(x.w.document.getElementById('jfSources').textContent, /Veralteter Stand/);
  assert.match(x.w.document.querySelector('.jf-job-dates').textContent, /Zuletzt bestätigt/);
  assert.match(x.w.document.querySelector('.jf-job-dates').textContent, /Quelle zuletzt nicht vollständig/);
  await x.w.PublicJobFeed.refresh(); assert.equal(x.w.PublicJobFeed.getJobs().length, 1);
  assert.match(x.w.document.getElementById('jfStatus').textContent, /zuvor geladene Stand bleibt sichtbar/);
});

test('refresh cancels a pending import so data from different snapshots cannot mix', async t => {
  const pending = deferred();
  const x = await setup({ fetcher: requestUrl => requestUrl.endsWith('index.json') ? response(manifest()) : pending.promise }); t.after(() => x.w.close());
  const importing = x.w.PublicJobFeed.importJob(vacancy.id);
  await x.w.PublicJobFeed.refresh(); pending.resolve(response(shard())); await importing;
  assert.equal(x.imports.length, 0); assert.equal(x.w.document.querySelector('[data-feed-action="import"]').disabled, false);
});

test('streaming readers enforce bytes without trusting content-length headers', async t => {
  let cancelled = false, unlocked = false;
  const x = await setup({ fetcher: async () => response(null, { body: { getReader: () => ({ read: async () => ({ done: false, value: new Uint8Array(25 * 1024 * 1024) }), cancel: async () => { cancelled = true; }, releaseLock: () => { unlocked = true; } }) } }) }); t.after(() => x.w.close());
  assert.equal(cancelled, true); assert.equal(unlocked, true);
  assert.match(x.w.document.getElementById('jfStatus').textContent, /zulässige Grösse/); assert.equal(x.imports.length, 0);
});

test('hiring employer is preserved for aggregator sources and portal overrides control source status', async t => {
  const noPortal = groups.flatMap(group => group.orgs).find(org => !org.jobs); assert.ok(noPortal);
  const aggregatorJob = { ...vacancy, organization: 'Spitex Beispielstadt' };
  const index = manifest({ jobs: [aggregatorJob], sources: [source, { org_id: noPortal.id, name: noPortal.name, url: 'https://example.org/jobs', has_portal: true, status: 'ok' }] });
  const x = await setup({ fetcher: requestUrl => response(requestUrl.endsWith('index.json') ? index : shard(aggregatorJob)) }); t.after(() => x.w.close());
  assert.equal(x.w.PublicJobFeed.getJobs()[0].organization, 'Spitex Beispielstadt');
  assert.match(x.w.document.querySelector('.jf-organization').textContent, /Quelle: Bundesamt/);
  assert.equal(x.w.PublicJobFeed.getSourceStatus().find(item => item.org_id === noPortal.id).no_portal, false);
  x.filter('q', 'Bundesamt'); assert.equal(x.w.document.querySelectorAll('.jf-job').length, 1);
  await x.w.PublicJobFeed.importJob(vacancy.id); assert.equal(x.imports[0].jobs[0].organization, 'Spitex Beispielstadt');
});


test('older broad snapshots are filtered by professional focus before display, search or import', async t => {
  const unrelated = [
    { ...vacancy, id: 'bag:c1', title: 'Dipl. Pflegefachperson 80–100%', description: 'Patientenbetreuung und Pflege auf einer medizinischen Station.' },
    { ...vacancy, id: 'bag:c2', title: 'Oberärztin Innere Medizin', description: 'Ärztliche Behandlung im Spital. Wir sind innovativ in der Gesundheitsökonomie.' },
    { ...vacancy, id: 'bag:c3', title: 'Koch / Köchin', description: 'Verantwortung für die Speiseproduktion im Gesundheitswesen.' },
  ];
  const x = await setup({ index: manifest({ jobs: [vacancy, ...unrelated], sources: [{ ...source, job_count: 4 }] }) }); t.after(() => x.w.close());
  assert.deepEqual(Array.from(x.w.PublicJobFeed.getJobs(), job => job.id), [vacancy.id]);
  assert.match(x.w.document.getElementById('jfStatus').textContent, /3 fachfremde oder fachlich nicht eindeutig belegte Inserate ausgeblendet/);
  x.filter('q', 'Pflegefachperson'); assert.equal(x.w.document.querySelectorAll('.jf-job').length, 0);
  x.click('reset'); assert.equal(x.w.PublicJobFeed.getJobs().length, 1);
  await x.w.PublicJobFeed.importJob('bag:c1'); assert.equal(x.requests.length, 1); assert.equal(x.imports.length, 0);
  assert.match(x.w.document.querySelector('.jf-relevance').textContent, /Gesundheitsökonomie/);
  assert.ok(!Array.from(x.w.document.querySelectorAll('#jfFocus option'), option => option.textContent).some(label => /Weitere|fachfremd/.test(label)));
});

test('new scoped snapshots preserve full-text evidence absent from a compact excerpt', async t => {
  const relevance = { eligible: true, category: 'Versorgungsforschung / Public Health', reasons: ['Versorgungsforschung in den Anforderungen belegt.'], policy_version: 1 };
  const x = await setup({ index: manifest({ scope: { policy_version: 1, scanned_jobs: 100, relevant_jobs: 1, excluded_jobs: 99 }, jobs: [{ ...vacancy, title: 'Wissenschaftliche Mitarbeit', description: 'Willkommen an unserer Hochschule.', relevance }], sources: [{ ...source, raw_job_count: 100, relevant_job_count: 1, filtered_out_count: 99 }] }) }); t.after(() => x.w.close());
  assert.equal(x.w.PublicJobFeed.getJobs().length, 1);
  assert.equal(x.w.PublicJobFeed.getJobs()[0].relevance.category, relevance.category);
  assert.match(x.w.document.querySelector('.jf-relevance').textContent, /Anforderungen belegt/);
  x.filter('focus', 'Gesundheitsökonomie / HTA'); assert.equal(x.w.PublicJobFeed.getJobs().length, 0);
  x.filter('focus', relevance.category); assert.equal(x.w.PublicJobFeed.getJobs().length, 1);
  assert.match(x.w.document.getElementById('jfStatus').textContent, /99 fachfremde/);
});

test('technical coverage is independent of matching jobs; failed empty sources never claim old vacancies', async t => {
  const x = await setup({ index: manifest({ jobs: [vacancy], sources: [
    { ...source, status: 'partial', coverage: 'partial', stale: true, job_count: 1 },
    { ...source, org_id: 'suva', status: 'ok', coverage: 'complete', job_count: 0 },
    { ...source, org_id: 'obsan', status: 'error', coverage: 'unknown', stale: true, job_count: 0, checked_at: stamp, last_success_at: null, last_complete_at: null },
  ] }) }); t.after(() => x.w.close());
  const metrics = Array.from(x.w.document.querySelectorAll('.jf-metrics > div'), node => node.textContent);
  assert.deepEqual(metrics, ['1Fachlich passende Stellen', '1/85Quellen vollständig abgerufen', '1Quellen mit passenden Stellen', '84Nicht vollständig erfasst']);
  const sourceRows = Array.from(x.w.document.querySelectorAll('.jf-source'));
  const suva = sourceRows.find(node => /Suva/.test(node.querySelector('h3').textContent));
  const obsan = sourceRows.find(node => /Obsan/.test(node.querySelector('h3').textContent));
  assert.match(suva.textContent, /Keine fachlich passenden Stellen im vollständigen Abruf/);
  assert.match(obsan.textContent, /Angebot unbekannt/);
  assert.doesNotMatch(obsan.textContent, /Veralteter Stand/);
});

test('full-text import refuses a now unrelated vacancy instead of adding it to the workspace', async t => {
  const x = await setup({ fetcher: requestUrl => response(requestUrl.endsWith('index.json') ? manifest() : shard({ ...vacancy, title: 'Dipl. Pflegefachperson' })) }); t.after(() => x.w.close());
  await x.w.PublicJobFeed.importJob(vacancy.id);
  assert.equal(x.imports.length, 0);
  assert.match(x.w.document.getElementById('jfNotice').textContent, /fachliche Bezug nicht mehr bestätigt/);
});
