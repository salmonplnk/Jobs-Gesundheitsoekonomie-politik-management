const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const org = {id:'example', name:'Example Hospital', main:'https://hospital.ch', jobs:'https://hospital.ch/careers'};
const description = '<h2>Ihre Aufgaben</h2><p>Sie entwickeln Modelle der Gesundheitsversorgung und analysieren kantonale Daten.</p><h2>Ihr Profil</h2><p>Sie verfügen über einen Hochschulabschluss, sehr gute Deutschkenntnisse und Englischkenntnisse.</p><p>Bitte bewerben Sie sich online. Bewerbungsfrist: 31.10.2026. Homeoffice möglich.</p>';
const posting = (extra = {}) => ({'@type':'JobPosting', title:'Senior Health Economist 80–100%', description, url:'/jobs/health-economist-123', jobLocation:{address:{addressLocality:'Bern', addressCountry:'CH'}}, validThrough:'2026-10-31', ...extra});
const ld = data => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const helpers = import('../supabase/functions/_shared/job-extraction.mjs');
const crawling = import('../supabase/functions/_shared/job-crawler.mjs');

test('catalog remains aligned with original employer data', async () => {
  const app = fs.readFileSync(new URL('../js/app.js', `file://${__filename}`), 'utf8');
  const original = vm.runInNewContext(app.split('/* ======== Helpers ======== */')[0] + '; JSON.stringify(DATA)');
  const catalog = fs.readFileSync(new URL('../data/organizations.json', `file://${__filename}`), 'utf8');
  assert.deepEqual(JSON.parse(catalog), JSON.parse(original));
});

test('extracts real JobPosting graphs with direct URL, full description and conservative metadata', async () => {
  const {extractVacancies} = await helpers;
  const {jobs} = extractVacancies(ld({'@graph':[{'@type':'Organization',name:'Employer'}, posting()]}), org, org.jobs);
  assert.equal(jobs.length, 1);
  const job = jobs[0];
  assert.equal(job.url, 'https://hospital.ch/jobs/health-economist-123');
  assert.equal(job.workload_min, 80);
  assert.equal(job.workload_max, 100);
  assert.equal(job.location, 'Bern, CH');
  assert.equal(job.deadline, '2026-10-31');
  assert.equal(job.remote_mode, 'unknown');
  assert.equal(job.seniority, 'senior');
  assert.equal(job.languages, 'DE, EN');
  assert.equal(job.salary_hint, null);
  assert.match(job.description, /Bewerbungsfrist/);
  assert.equal(job.org_id, 'example');
});

test('extracts ItemList vacancies and never turns an organization overview into a job', async () => {
  const {extractVacancies} = await helpers;
  const overview = '<h1>Karriere</h1><p>Wir sind ein Spital mit vielen Mitarbeitenden und interessanten Aufgaben.</p>';
  assert.equal(extractVacancies(overview, org, org.jobs).jobs.length, 0);
  assert.equal(extractVacancies(ld({itemListElement:[{item:posting()},{item:posting({url:'/jobs/research-456',title:'Researcher'})}]}), org, org.jobs).jobs.length, 2);
  const ambiguous = extractVacancies(ld([posting({url:org.jobs}), posting({url:org.jobs,title:'Project Manager'})]), org, org.jobs);
  assert.equal(ambiguous.jobs.length, 0);
  assert.equal(ambiguous.rejected, 2);
  assert.equal(extractVacancies(ld(posting({url:org.main})), org, org.jobs).jobs.length, 0);
  assert.equal(extractVacancies(ld(posting({url:org.jobs})), org, org.jobs).jobs.length, 0);
});

test('missing direct URL is only accepted on an identifiable detail page', async () => {
  const {extractVacancies} = await helpers;
  const data = posting({url:undefined});
  assert.equal(extractVacancies(ld(data), org, org.jobs).jobs.length, 0);
  const result = extractVacancies('<h1>Senior Health Economist 80–100%</h1>' + ld(data), org, 'https://hospital.ch/jobs/economist');
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].url, 'https://hospital.ch/jobs/economist');
});

test('HTML detail fallback requires title, duties, requirements and an application cue', async () => {
  const {extractVacancies} = await helpers;
  const html = `<nav>Navigation</nav><main><h1>Projektleiter Gesundheit 70%</h1>${description}</main><footer>Footer</footer>`;
  const result = extractVacancies(html, org, 'https://hospital.ch/jobs/project-manager', {detail:true});
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].role, 'project-management');
  assert.equal(result.jobs[0].workload_min, 70);
  assert.doesNotMatch(result.jobs[0].description, /Navigation|Footer/);
  assert.equal(extractVacancies(html.replace('Ihr Profil','Unsere Standorte'), org, org.jobs, {detail:true}).jobs.length, 0);
});

test('description truncation is explicit and snippets are not accepted', async () => {
  const {extractVacancies} = await helpers;
  const long = extractVacancies(ld(posting({description:'A'.repeat(31000)})), org, org.jobs).jobs[0];
  assert.equal(long.description_truncated, true);
  assert.match(long.description, /30’000 Zeichen gekürzt/);
  assert.equal(extractVacancies(ld(posting({description:'An exciting new role.'})), org, org.jobs).jobs.length, 0);
});

test('stable IDs ignore tracking parameters but retain vacancy identifiers', async () => {
  const {canonicalUrl, stableJobId} = await helpers;
  const a = canonicalUrl('https://hospital.ch/job?id=123&utm_source=foo');
  const b = canonicalUrl('https://hospital.ch/job?utm_source=bar&id=123#apply');
  assert.equal(a, b);
  assert.equal(stableJobId('example',a), stableJobId('example',b));
  assert.notEqual(stableJobId('example',a), stableJobId('example',canonicalUrl('https://hospital.ch/job?id=456')));
});

test('rejects unsafe URLs, private networks, lookalike domains, and unapproved hosts', async () => {
  const {safePublicUrl, isAllowedUrl, isPublicAddress} = await helpers;
  for (const url of ['http://hospital.ch','https://127.1','https://2130706433','https://0x7f000001','https://[::1]','https://metadata.google.internal','https://user:pass@hospital.ch','https://hospital.ch:8443']) assert.equal(safePublicUrl(url), null, url);
  for (const ip of ['127.0.0.1','10.0.0.1','172.16.1.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','::1','fc00::1','::ffff:127.0.0.1','2001:db8::1','2002:7f00:1::']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  assert.equal(isAllowedUrl('https://hospital.ch.attacker.com/jobs/test',org), false);
  assert.equal(isAllowedUrl('https://attacker.com/jobs/test',org), false);
  assert.equal(isAllowedUrl('https://recruiting.umantis.com/Vacancies/1234',org), true);
});

test('safe fetch validates DNS and redirects and enforces byte limits', async () => {
  const {fetchPublicPage, CRAWL_LIMITS} = await crawling;
  let fetched = 0;
  await assert.rejects(fetchPublicPage(org.jobs, org, {resolver:async()=>['10.0.0.1'],fetcher:async()=>{fetched++;}}), /Netzwerkadresse/);
  assert.equal(fetched, 0);
  await assert.rejects(fetchPublicPage(org.jobs, org, {resolver:async()=>['8.8.8.8'],fetcher:async()=>new Response('',{status:302,headers:{location:'https://127.0.0.1/private'}})}), /Weiterleitung/);
  const page = await fetchPublicPage(org.jobs, org, {resolver:async()=>['8.8.8.8'],fetcher:async()=>new Response('abcdefghij',{headers:{'content-type':'text/html'}}),limits:{...CRAWL_LIMITS,maxBytes:5}});
  assert.equal(page.html,'abcde');
  assert.equal(page.truncated,true);
});

test('crawl distinguishes empty, unsupported and failed sources; caps remain partial', async () => {
  const {crawlOrganization, CRAWL_LIMITS} = await crawling;
  const page = html => async url => ({url,html,truncated:false});
  assert.equal((await crawlOrganization(org,page('<h1>Karriere</h1><p>Aktuell keine offenen Stellen.</p>'))).source.status,'empty');
  assert.equal((await crawlOrganization(org,page('<div id="app"></div><script src="jobs.js"></script>'))).source.status,'unsupported');
  assert.equal((await crawlOrganization(org,async()=>{throw new Error('HTTP 503')})).source.status,'error');
  const listing = ld(posting()) + '<a href="/jobs/researcher-456">Researcher 100%</a><a href="/jobs/analyst-789">Analyst 80%</a>';
  const result = await crawlOrganization(org, page(listing), {limits:{...CRAWL_LIMITS,maxDetails:0}});
  assert.equal(result.jobs.length,1);
  assert.equal(result.source.status,'partial');
  assert.match(result.source.message,/begrenzt/);
});

test('a failed detail never silently certifies complete coverage', async () => {
  const {crawlOrganization} = await crawling;
  const listing = ld(posting()) + '<a href="/jobs/researcher-456">Researcher 100%</a>';
  const result = await crawlOrganization(org,async url => {
    if (url !== org.jobs) throw new Error('timeout');
    return {url,html:listing,truncated:false};
  });
  assert.equal(result.jobs.length,1);
  assert.equal(result.source.status,'partial');
  assert.match(result.source.message,/Detailseiten/);
});
