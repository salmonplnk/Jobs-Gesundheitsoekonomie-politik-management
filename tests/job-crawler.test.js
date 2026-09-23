const {test} = require('node:test');
const assert = require('node:assert/strict');
const helpers = import('../supabase/functions/_shared/job-extraction.mjs');
const crawler = import('../supabase/functions/_shared/job-crawler.mjs');
const org = {id:'hospital',name:'Hospital',main:'https://hospital.ch',jobs:'https://hospital.ch/careers'};
const description = 'Ihre Aufgaben: Sie untersuchen und verbessern die Gesundheitsversorgung. Ihr Profil: Hochschulabschluss und Erfahrung mit klinischen Datenanalysen. Bitte bewerben Sie sich online.';
const detail = title => `<main><h1>${title}</h1><p>${description}</p></main>`;
const fixtures = pages => {
  const calls = [];
  return {calls,fetch:async url => { calls.push(url); assert.ok(Object.hasOwn(pages,url),`Unexpected URL ${url}`); return {url,html:pages[url],truncated:false}; }};
};

test('career and Solique iframe entry routes remain distinct from vacancy details',async () => {
  const {discoverJobPages,looksLikeDetailUrl} = await helpers;
  const html = '<a href="/de/jobs/stellenangebote">Offene Stellen</a><iframe src="https://live.solique.ch/kanton-appenzell-ausserrhoden/"></iframe>' +
    '<a href="/swissmedic/de/home/ueber-uns/offene-stellen/fico-controlling.html">Senior Controller/in (80 - 100%)</a><a href="/jobs?page=2">2</a>';
  const result = discoverJobPages(html,org.jobs,org);
  assert.equal(result.links.length,1);
  assert.match(result.links[0].url,/fico-controlling/);
  assert.equal(result.listingLinks.length,3);
  assert.equal(result.listingLinks.find(link=>link.kind==='iframe').url,'https://live.solique.ch/kanton-appenzell-ausserrhoden');
  assert.equal(looksLikeDetailUrl('https://hospital.ch/de/jobs/stellenangebote'),false);
  assert.equal(looksLikeDetailUrl('https://hospital.ch/jobs?page=2'),false);
});

test('pager preserves employer filters and repeated values, rejecting a switch of employer',async () => {
  const {discoverJobPages} = await helpers;
  const scoped = {...org,jobs:'https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083353&f=type:permanent'};
  const result = discoverJobPages('<link rel="next" href="?page=2"><a href="?page=3&f=verwaltungseinheit:OTHER">3</a>',scoped.jobs,scoped);
  assert.equal(result.paginationLinks.length,1);
  const next = new URL(result.paginationLinks[0].url);
  assert.deepEqual(next.searchParams.getAll('f'),['verwaltungseinheit:1083353','type:permanent']);
  assert.equal(next.searchParams.get('lang'),'de');
  assert.equal(result.blockedPagination,1);
});

test('breadth-first listing traversal deduplicates cycles and scans every discovered detail',async () => {
  const {crawlOrganization} = await crawler;
  const f = fixtures({
    'https://hospital.ch/careers':'<h1>Karriere</h1><a href="/jobs">Offene Stellen</a>',
    'https://hospital.ch/jobs':'<a href="/jobs/research-one">Researcher 80%</a><a rel="next" href="/jobs?page=2">Weiter</a>',
    'https://hospital.ch/jobs?page=2':'<a href="/jobs/research-two">Researcher 100%</a><a href="/jobs">Alle Jobs</a><a href="/jobs/research-one">Researcher 80%</a>',
    'https://hospital.ch/jobs/research-one':detail('Researcher 80%'),
    'https://hospital.ch/jobs/research-two':detail('Researcher 100%'),
  });
  const result = await crawlOrganization(org,f.fetch);
  assert.equal(result.jobs.length,2);
  assert.deepEqual(f.calls.slice(0,3),['https://hospital.ch/careers','https://hospital.ch/jobs','https://hospital.ch/jobs?page=2']);
  assert.equal(new Set(f.calls).size,f.calls.length);
  assert.equal(result.source.pages_scanned,3);
  assert.equal(result.source.detail_pages_scanned,2);
  assert.equal(result.source.pending_pages,0);
  assert.equal(result.source.coverage,'complete');
});

test('listing limits, abortion and JavaScript continuation remain explicitly incomplete',async () => {
  const {crawlOrganization} = await crawler;
  const page = async url => ({url,html:'<a href="/jobs/research-one">Researcher 80%</a><a rel="next" href="?page=2">Weiter</a>',truncated:false});
  const result = await crawlOrganization(org,page,{limits:{maxListingPages:1,maxDetails:0}});
  assert.equal(result.source.coverage,'partial');
  assert.equal(result.source.pending_pages,2);
  assert.match(result.source.message,/Listenabruf.*begrenzt/);
  const dynamic = await crawlOrganization(org,async url=>({url,html:'<p>Keine passenden Stellen</p><button>Mehr Stellen laden</button>'}));
  assert.notEqual(dynamic.source.status,'empty');
  assert.equal(dynamic.source.coverage,'partial');
  const controller = new AbortController(); controller.abort();
  const aborted = await crawlOrganization(org,async()=>{throw new Error('should not fetch')},{signal:controller.signal});
  assert.equal(aborted.source.pending_pages,1);
  assert.notEqual(aborted.source.coverage,'complete');
});

test('redirects dropping shared-board filters cannot import another employer vacancies',async () => {
  const {crawlOrganization} = await crawler;
  const scoped = {...org,jobs:'https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083353'};
  const result = await crawlOrganization(scoped,async()=>({url:'https://jobs.admin.ch/?lang=de',html:'<a href="/jobs/other-agency-role">Analyst 80%</a>'}));
  assert.equal(result.jobs.length,0);
  assert.equal(result.source.status,'error');
  assert.equal(result.source.coverage,'unknown');
  assert.match(result.source.message,/Arbeitgeberfilter/);
});

test('scheduled scans prioritize unseen details before previously observed links',async () => {
  const {crawlOrganization} = await crawler;
  const f = fixtures({
    'https://hospital.ch/careers':'<a href="/jobs/known-role">Analyst 80%</a><a href="/jobs/new-role">Researcher 80%</a>',
    'https://hospital.ch/jobs/new-role':detail('Researcher 80%'),
  });
  const result = await crawlOrganization(org,f.fetch,{limits:{maxDetails:1},previousJobs:[{url:'https://hospital.ch/jobs/known-role',fetched_at:'2026-09-20'}]});
  assert.equal(f.calls[1],'https://hospital.ch/jobs/new-role');
  assert.equal(result.source.coverage,'partial');
});

test('complete ATS records do not need redundant detail HTML requests',async () => {
  const {crawlOrganization} = await crawler;
  const ats = {...org,jobs:'https://jobs.lever.co/hospital'};
  const result = await crawlOrganization(ats,async()=>{throw new Error('HTML should not be fetched')},{fetchJson:async url=>({url,data:[{
    id:'abc-123',text:'Research Scientist 80%',hostedUrl:'https://jobs.lever.co/hospital/abc-123',description,categories:{location:'Bern'},
  }]})});
  assert.equal(result.jobs.length,1);
  assert.equal(result.source.coverage,'complete');
  assert.equal(result.source.method,'lever-api');
  assert.equal(result.source.pages_scanned,1);
  assert.equal(result.source.detail_pages_scanned,0);
});

test('JSON transport enforces public network, MIME and byte limits',async () => {
  const {fetchPublicJson} = await crawler;
  const options = {resolver:async()=>['8.8.8.8'],fetcher:async()=>new Response('{"jobs":[]}',{headers:{'content-type':'application/json'}})};
  assert.deepEqual((await fetchPublicJson(org.jobs,org,options)).data,{jobs:[]});
  await assert.rejects(fetchPublicJson(org.jobs,org,{...options,resolver:async()=>['127.0.0.1']}),/Netzwerkadresse/);
  await assert.rejects(fetchPublicJson(org.jobs,org,{...options,limits:{maxBytes:3}}),/Grössenlimit/);
  await assert.rejects(fetchPublicJson(org.jobs,org,{...options,fetcher:async()=>new Response('{}',{headers:{'content-type':'text/html'}})}),/JSON/);
});

test('department scopes require whole words in job evidence and never infer employer empty',async () => {
  const {matchesOrganizationScope} = await helpers;
  const {crawlOrganization} = await crawler;
  const scoped = {...org,scope_terms:['WIG','Winterthurer Institut für Gesundheitsökonomie']};
  assert.equal(matchesOrganizationScope({title:'Wiggle research position'},scoped),false);
  assert.equal(matchesOrganizationScope({hiring_organization:'Winterthurer Institut für Gesundheitsökonomie (WIG)'},scoped),true);
  assert.equal(matchesOrganizationScope({description:'Wir sind am WIG tätig.'},scoped),true);
  const f = fixtures({'https://hospital.ch/careers':'<a href="/jobs/other-department">Analyst 80%</a>','https://hospital.ch/jobs/other-department':detail('Analyst 80%')});
  const result = await crawlOrganization(scoped,f.fetch);
  assert.equal(result.jobs.length,0);
  assert.equal(result.source.excluded_jobs,1);
  assert.equal(result.source.coverage,'unknown');
  assert.notEqual(result.source.status,'empty');
});

test('site search, career information and WordPress shortlinks are not vacancy pages',async () => {
  const {discoverJobPages} = await helpers;
  const result = discoverJobPages('<link rel="shortlink" href="/?p=4756"><a href="/search">Suchen</a><a href="/jobs/benefits">Benefits</a><a href="/offre-en-soins/systemes">Offre en soins</a><iframe src="https://hospital.ch/header.html"></iframe>',org.jobs,org);
  assert.equal(result.links.length,0);
  assert.equal(result.listingLinks.length,0);
});

test('an iframe department filter survives paging and cannot be dropped on redirect',async () => {
  const {scopedListingUrl} = await helpers;
  const scoped = {...org,allowed_hosts:['karriere-fmh-siwf.abacuscity.ch']};
  const frame = 'https://karriere-fmh-siwf.abacuscity.ch/de/jobportal?jobportal_desc_filter_text=FMH&domain=FMH';
  const next = scopedListingUrl('?page=2',frame,scoped,{pagination:true});
  assert.equal(new URL(next).searchParams.get('domain'),'FMH');
  assert.equal(scopedListingUrl('https://karriere-fmh-siwf.abacuscity.ch/de/jobportal',frame,scoped),null);
});

test('unhandled documents and advertised result totals prevent false completeness',async () => {
  const {crawlOrganization} = await crawler;
  const f = fixtures({
    'https://hospital.ch/careers':'<h1>3 offene Stellen</h1><a href="/jobs/analyst-role">Analyst 80%</a><a href="/downloads/nurse.pdf">Pflegefachperson 100%</a>',
    'https://hospital.ch/jobs/analyst-role':detail('Analyst 80%'),
  });
  const result = await crawlOrganization(org,f.fetch);
  assert.equal(result.jobs.length,1);
  assert.equal(result.source.coverage,'partial');
  assert.equal(result.source.pending_pages,2);
  assert.match(result.source.message,/Dokumentdateien/);
  assert.match(result.source.message,/Quelle nennt 3/);
});

test('Prospective pagination preserves federal filters and verifies office attribution',async () => {
  const {crawlOrganization} = await crawler;
  const bag = {id:'bag',name:'Bundesamt für Gesundheit (BAG)',main:'https://www.bag.admin.ch',jobs:'https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083353',scope_terms:['Bundesamt für Gesundheit']};
  const seen = [];
  const result = await crawlOrganization(bag,async()=>{throw new Error('HTML unnecessary for full feed')},{fetchJson:async raw => {
    const url = new URL(raw); seen.push(raw);
    assert.equal(url.searchParams.get('f'),'verwaltungseinheit:1083353');
    const offset = Number(url.searchParams.get('offset'));
    return {url:raw,data:{medium_id:1000624,total:2,offset,jobs:[{
      title:`Research Scientist ${offset + 1}`,links:{directlink:`https://jobs.admin.ch/offene-stellen/research-scientist/abc-${offset + 1}`},
      attributes:{verwaltungseinheit:['Eidgenössisches Departement des Innern EDI'],verwaltungseinheit_1083352:['Bundesamt für Gesundheit BAG']},
      szas:{sza_tasks:'Sie untersuchen die Gesundheitsversorgung und entwickeln neue statistische Methoden.',sza_requirements:'Sie verfügen über einen Hochschulabschluss und Erfahrung mit klinischen Datenanalysen.'},
    }]}};
  }});
  assert.equal(result.jobs.length,2);
  assert.equal(seen.length,2);
  assert.equal(result.source.method,'prospective-api');
  assert.equal(result.source.coverage,'complete');
  assert.equal(result.source.pages_scanned,2);
  assert.match(result.jobs[0].hiring_organization,/Bundesamt für Gesundheit/);
});

test('Swissmedic observed responsibilities heading produces a complete HTML description',async () => {
  const {extractVacancies} = await helpers;
  const html = '<h1>Senior Controller/in (80–100%)</h1><article><p>Eine kurze Vorstellung des Arbeitgebers.</p></article><article><h2>Ihre neue Herausforderung</h2><p>Sie analysieren die Finanzentwicklung und beraten unsere Führungskräfte in der Planung, Steuerung und Berichterstattung.</p><h2>Ihr Profil</h2><p>Sie verfügen über fundierte Kenntnisse in Controlling und Rechnungswesen.</p><p>Wir freuen uns auf Ihre Bewerbung!</p></article>';
  for (const page of [html,`<main>${html}</main>`]) {
    const result = extractVacancies(page,org,'https://hospital.ch/offene-stellen/fico-controlling.html',{detail:true});
    assert.equal(result.jobs.length,1);
    assert.equal(result.jobs[0].workload_min,80);
    assert.match(result.jobs[0].description,/Ihre neue Herausforderung/);
  }
});
