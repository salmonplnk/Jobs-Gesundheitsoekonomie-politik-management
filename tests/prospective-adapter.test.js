const {test}=require('node:test');
const assert=require('node:assert/strict');
const adapters=import('../supabase/functions/_shared/job-prospective-adapter.mjs');
const insel={id:'insel',name:'Insel Gruppe',main:'https://www.inselgruppe.ch',jobs:'https://jobs.inselgruppe.ch/?lang=de'};
const bag={id:'bag',name:'Bundesamt für Gesundheit (BAG)',main:'https://www.bag.admin.ch',jobs:'https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083353',scope_terms:['Bundesamt für Gesundheit','BAG']};
const row=(extra={})=>({id:'123',title:'Wissenschaftliche Mitarbeit 80–100%',
  links:{directlink:'https://jobs.inselgruppe.ch/offene-stellen/wissenschaftliche-mitarbeit/123-abc'},
  szas:{sza_tasks:'<ul><li>Sie analysieren schweizerische Gesundheitsdaten und entwickeln wissenschaftliche Studien zur Versorgung.</li></ul>',
    sza_requirements:'<ul><li>Sie bringen einen Hochschulabschluss und sehr gute Deutschkenntnisse sowie Englischkenntnisse mit.</li></ul>',
    sza_benefits:'<p>Wir bieten Weiterbildungen und flexible Arbeitszeiten.</p>',sza_company_profil:'<p>Die Insel Gruppe versorgt die Bevölkerung in der Region Bern.</p>',
    'sza_pensum.min':'80','sza_pensum.max':'100','sza_location.city':'Bern','sza_location.country':'Schweiz',sza_employment_type:'befristet'},
  end_date:'2036-09-18T21:59:59Z',...extra});
const payload=(rows,extra={})=>({medium_id:'1000666',offset:0,total:rows.length,jobs:rows,...extra});

test('Prospective detection uses verified public employer-to-medium mappings',async()=>{
  const {detectProspectiveAdapter,prospectiveFetchOrg}=await adapters;
  const a=detectProspectiveAdapter(insel,insel.jobs);
  assert.equal(a.apiUrl,'https://ohws.prospective.ch/public/v1/medium/1000666/jobs?lang=de&offset=0&limit=100');
  assert.equal(prospectiveFetchOrg(a,insel).allowed_hosts.includes('ohws.prospective.ch'),true);
  assert.equal(detectProspectiveAdapter(insel,'https://jobs.visana.ch'),null);
  assert.equal(detectProspectiveAdapter(insel,'https://ohws.prospective.ch/public/v1/medium/1004518/jobs?lang=de'),null);
  assert.equal(detectProspectiveAdapter(insel,insel.jobs,'<script src="/careercenter/999999/static/app.js"></script>'),null);
  assert.equal(detectProspectiveAdapter({...insel,jobs:'https://unknown.prospective.ch'},'https://unknown.prospective.ch'),null);
  assert.equal(detectProspectiveAdapter({...insel,jobs:insel.jobs+'&intranet=1'}),null);
});

test('federal employer filters remain pinned across all API pages',async()=>{
  const {detectProspectiveAdapter,normalizeProspectivePayload}=await adapters;
  const a=detectProspectiveAdapter(bag,bag.jobs);
  assert.equal(new URL(a.apiUrl).searchParams.get('f'),'verwaltungseinheit:1083353');
  assert.equal(detectProspectiveAdapter(bag,'https://jobs.admin.ch/?lang=de'),null);
  assert.equal(detectProspectiveAdapter({...bag,jobs:'https://jobs.admin.ch/?lang=de'}),null);
  assert.equal(detectProspectiveAdapter(bag,a.apiUrl.replace('1083353','1083356')),null);
  const federal=row({links:{directlink:'https://jobs.admin.ch/offene-stellen/wissenschaftliche-mitarbeit/123-abc'},
    attributes:{verwaltungseinheit:['Eidgenössisches Departement des Innern EDI'],verwaltungseinheit_1083352:['Bundesamt für Gesundheit BAG']}});
  const result=normalizeProspectivePayload(a,payload([federal],{medium_id:'1000624',total:2}),bag);
  assert.equal(result.jobs.length,1); assert.match(result.jobs[0].hiring_organization,/Bundesamt für Gesundheit BAG/);
  assert.equal(new URL(result.nextApiUrl).searchParams.get('f'),'verwaltungseinheit:1083353');
  assert.equal(detectProspectiveAdapter(bag,result.nextApiUrl).pageOffset,1);
});

test('full Prospective fields produce validated vacancies and conservative metadata',async()=>{
  const {detectProspectiveAdapter,normalizeProspectivePayload}=await adapters;
  const result=normalizeProspectivePayload(detectProspectiveAdapter(insel),payload([row()]),insel,{fetchedAt:'2026-09-22T12:00:00Z'});
  assert.equal(result.jobs.length,1); const job=result.jobs[0];
  assert.match(job.description,/Gesundheitsdaten/); assert.match(job.description,/Hochschulabschluss/); assert.match(job.description,/Weiterbildungen/);
  assert.equal(job.workload_min,80); assert.equal(job.workload_max,100); assert.equal(job.employment_type,'temporary');
  assert.equal(job.deadline,null); assert.equal(job.source_url,insel.jobs); assert.equal(job.extraction_method,'prospective-api'); assert.equal(result.complete,true);
});

test('generic department labels and another office cannot become BAG vacancies',async()=>{
  const {detectProspectiveAdapter,normalizeProspectivePayload}=await adapters;
  const other=row({links:{directlink:'https://jobs.admin.ch/offene-stellen/researcher/123-abc'},
    attributes:{verwaltungseinheit:['Eidgenössisches Departement des Innern EDI'],verwaltungseinheit_1083352:['Bundesamt für Statistik BFS']}});
  const result=normalizeProspectivePayload(detectProspectiveAdapter(bag),payload([other],{medium_id:'1000624'}),bag);
  assert.equal(result.jobs.length,0); assert.equal(result.links.length,0); assert.equal(result.rejected,1); assert.equal(result.explicitEmpty,false);
});

test('missing descriptions become verified detail links without claiming company introductions as jobs',async()=>{
  const {detectProspectiveAdapter,normalizeProspectivePayload}=await adapters;
  const short=row({szas:{sza_company_profil:'A long company introduction. '.repeat(20)}});
  const result=normalizeProspectivePayload(detectProspectiveAdapter(insel),payload([short]),insel);
  assert.equal(result.jobs.length,0); assert.deepEqual(result.links,[{url:short.links.directlink,label:short.title}]);
  assert.equal(result.rejected,0); assert.equal(result.complete,true);
});

test('inconsistent medium, pagination and empty/error payloads remain explicit',async()=>{
  const {detectProspectiveAdapter,normalizeProspectivePayload}=await adapters;
  const a=detectProspectiveAdapter(insel);
  for(const bad of [null,{error:'No access'},payload([],{medium_id:'1004518'}),payload([],{offset:10}),payload([],{total:1}),payload([row()],{total:0})]) {
    const result=normalizeProspectivePayload(a,bad,insel);
    assert.equal(result.malformed,true); assert.equal(result.explicitEmpty,false); assert.equal(result.complete,false);
  }
  const empty=normalizeProspectivePayload(a,payload([]),insel);
  assert.equal(empty.explicitEmpty,true); assert.equal(empty.complete,true);
  const first=normalizeProspectivePayload(a,payload([row()],{total:2}),insel); assert.equal(first.complete,false);
  const next=detectProspectiveAdapter(insel,first.nextApiUrl);
  const second=normalizeProspectivePayload(next,payload([row({id:'456'})],{offset:1,total:2}),insel);
  assert.equal(second.nextApiUrl,null); assert.equal(second.complete,true);
});

test('detail links cannot jump employers, private URLs, applications, or overview pages',async()=>{
  const {detectProspectiveAdapter,normalizeProspectivePayload}=await adapters;
  const urls=['https://jobs.visana.ch/offene-stellen/other/123','https://127.0.0.1/offene-stellen/other/123',
    'https://jobs.inselgruppe.ch/','https://jobs.inselgruppe.ch/apply/123','http://jobs.inselgruppe.ch/offene-stellen/other/123'];
  const result=normalizeProspectivePayload(detectProspectiveAdapter(insel),payload(urls.map(url=>row({links:{directlink:url}}))),insel);
  assert.equal(result.jobs.length,0); assert.equal(result.links.length,0); assert.equal(result.rejected,urls.length);
});

test('USB public proxy uses its verified medium and employer detail host',async()=>{
  const {detectProspectiveAdapter,normalizeProspectivePayload,prospectiveFetchOrg}=await adapters;
  const usb={id:'usb',name:'Universitätsspital Basel',main:'https://www.unispital-basel.ch',jobs:'https://www.unispital-basel.ch/jobs-und-karriere/Jobs'};
  const a=detectProspectiveAdapter(usb);
  assert.equal(a.apiUrl,'https://www.unispital-basel.ch/.rest/jobs/search?lang=de&offset=0&limit=100');
  assert.deepEqual(prospectiveFetchOrg(a,usb).allowed_hosts,['www.unispital-basel.ch']);
  const result=normalizeProspectivePayload(a,payload([row({links:{directlink:'https://job.unispital-basel.ch/offene-stellen/forschung/123-abc'}})],{medium_id:'1005524',total:2}),usb);
  assert.equal(result.jobs.length,1); assert.equal(detectProspectiveAdapter(usb,result.nextApiUrl).pageOffset,1);
});

test('AG proxy returns verified detail links for later DGS scope verification',async()=>{
  const {detectProspectiveAdapter,normalizeProspectivePayload}=await adapters;
  const org={id:'ag',name:'Aargau – DGS',main:'https://www.ag.ch',jobs:'https://www.ag.ch/de/ueber-uns/jobs-karriere/offene-stellen',scope_terms:['Departement Gesundheit und Soziales','DGS']};
  const a=detectProspectiveAdapter(org); assert.equal(a.apiUrl,'https://www.ag.ch/io/jobs-proxy/jobs');
  assert.equal(detectProspectiveAdapter(org,a.apiUrl).medium,'ag-public');
  const result=normalizeProspectivePayload(a,{total:1,offset:0,jobs:[{title:'Gesundheitsökonomin 80%',links:{directlink:'https://jobs.ag.ch/offene-stellen/gesundheit/123-abc'}}]},org);
  assert.equal(result.jobs.length,0); assert.equal(result.links.length,1); assert.equal(result.complete,true); assert.equal(result.method,'aargau-public-api');
  const changed=normalizeProspectivePayload(a,{total:2,jobs:[]},org);
  assert.equal(changed.hasPagination,true); assert.equal(changed.complete,false); assert.equal(changed.explicitEmpty,false);
});

test('CHUV is pinned to the public website and summaries only become detail links',async()=>{
  const {detectProspectiveAdapter,normalizeProspectivePayload}=await adapters;
  const org={id:'chuv',name:'CHUV',main:'https://www.chuv.ch',jobs:'https://recrutement.chuv.ch/home.html#filter=p_web_site_id%3D5352'};
  const a=detectProspectiveAdapter(org); assert.equal(new URL(a.apiUrl).searchParams.get('p_published_to'),'WWW');
  assert.equal(detectProspectiveAdapter(org,a.apiUrl.replace('WWW','INTRANET')),null);
  const job={id:123,title:'Chercheur en santé publique',status:'open',web_site_id:5352,publication:{internet:{live:'Y'}},
    summary:'A detailed summary is still not a full vacancy. '.repeat(5),weblink:'https://recrutement.chuv.ch/vacancy/chercheur-123.html'};
  const result=normalizeProspectivePayload(a,{total:1,jobs:[job]},org);
  assert.equal(result.jobs.length,0); assert.equal(result.links[0].url,job.weblink); assert.equal(result.complete,true);
  const unicode=normalizeProspectivePayload(a,{total:1,jobs:[{...job,weblink:'https://recrutement.chuv.ch/vacancy/infirmier·ere-123.html'}]},org);
  assert.equal(unicode.links.length,1);
  const privateOnly=normalizeProspectivePayload(a,{total:1,jobs:[{...job,publication:{internet:{live:'N'}}}]},org);
  assert.equal(privateOnly.links.length,0); assert.equal(privateOnly.rejected,1);
});
