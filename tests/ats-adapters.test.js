const {test} = require('node:test');
const assert = require('node:assert/strict');
const adapters = import('../supabase/functions/_shared/job-ats-adapters.mjs');
const org = {id:'hospital',name:'Example Hospital',main:'https://hospital.ch',jobs:'https://hospital.ch/careers'};
const description = '<h2>Ihre Aufgaben</h2><p>Sie entwickeln Modelle der Gesundheitsversorgung und analysieren kantonale Daten.</p><h2>Ihr Profil</h2><p>Sie verfügen über einen Hochschulabschluss und sehr gute Deutschkenntnisse. Bewerben Sie sich online.</p>';
const timestamp = '2026-09-22T10:00:00.000Z';

test('ATS detection requires exact public provider hosts and specific tenants',async()=>{
  const {detectAdapter}=await adapters;
  assert.equal(detectAdapter(org,'https://hospital.recruitee.com').apiUrl,'https://hospital.recruitee.com/api/offers/');
  assert.equal(detectAdapter(org,'https://job-boards.greenhouse.io/hospital').apiUrl,'https://boards-api.greenhouse.io/v1/boards/hospital/jobs?content=true');
  assert.equal(detectAdapter(org,'https://jobs.eu.lever.co/hospital').apiUrl,'https://api.eu.lever.co/v0/postings/hospital?mode=json&limit=100&skip=0');
  for(const url of ['http://hospital.recruitee.com','https://www.recruitee.com','https://api.recruitee.com/c/12/offers','https://recruitee.com',
    'https://boards.greenhouse.io','https://boards.greenhouse.io/embed','https://jobs.lever.co','https://jobs.lever.co.attacker.ch/hospital',
    'https://hospital.recruitee.com.attacker.ch','https://user@jobs.lever.co/hospital','https://jobs.lever.co/hospital%2fother','https://jobs.lever.co:8443/hospital']) {
    assert.equal(detectAdapter(org,url),null,url);
  }
});

test('configured tenants cannot switch employers or Lever regions',async()=>{
  const {detectAdapter,adapterFetchOrg}=await adapters;
  const configured={...org,jobs:'https://jobs.lever.co/hospital'};
  assert.equal(detectAdapter(configured,'https://jobs.lever.co/other'),null);
  assert.equal(detectAdapter(configured,'https://jobs.eu.lever.co/hospital'),null);
  const adapter=detectAdapter(configured,configured.jobs);
  assert.deepEqual(adapterFetchOrg(adapter,configured).allowed_hosts,['api.lever.co']);
  assert.throws(()=>adapterFetchOrg({...adapter,apiUrl:'https://attacker.ch'},configured),/ATS/);
});

test('Recruitee offers use full shared vacancy validation and preserve source metadata',async()=>{
  const {detectAdapter,normalizeAdapterPayload}=await adapters;
  const result=normalizeAdapterPayload(detectAdapter(org,'https://hospital.recruitee.com'),{offers:[{
    id:123,kind:'job',status:'published',title:'Health Economist 80–100%',description,
    requirements:'<p>Englischkenntnisse sind erwünscht.</p>',careers_url:'https://hospital.recruitee.com/o/health-economist',
    locations:[{city:'Bern',country_code:'CH'}]}]},org,{fetchedAt:timestamp});
  assert.equal(result.jobs.length,1);
  const job=result.jobs[0];
  assert.equal(job.org_id,org.id); assert.equal(job.workload_min,80); assert.equal(job.location,'Bern, CH');
  assert.equal(job.fetched_at,timestamp); assert.equal(job.source_url,org.jobs); assert.equal(job.extraction_method,'recruitee-api');
  assert.match(job.description,/Englischkenntnisse/); assert.equal(result.complete,true); assert.deepEqual(result.links,[]);
});

test('Greenhouse decodes entity-encoded HTML and excludes prospect posts',async()=>{
  const {detectAdapter,normalizeAdapterPayload}=await adapters;
  const row={id:42,internal_job_id:24,title:'Senior Researcher 60%',content:description.replace(/</g,'&amp;lt;').replace(/>/g,'&amp;gt;'),
    absolute_url:'https://boards.greenhouse.io/hospital/jobs/42',location:{name:'Basel, Switzerland'}};
  const result=normalizeAdapterPayload(detectAdapter(org,'https://boards.greenhouse.io/hospital'),{jobs:[row,{...row,id:43,internal_job_id:null}],meta:{total:2}},org);
  assert.equal(result.jobs.length,1); assert.match(result.jobs[0].description,/Ihre Aufgaben/);
  assert.doesNotMatch(result.jobs[0].description,/<h2>|&lt;/); assert.equal(result.jobs[0].location,'Basel, Switzerland'); assert.equal(result.complete,true);
});

test('Lever preserves lists, closing content, salary, location, and explicit work mode',async()=>{
  const {detectAdapter,normalizeAdapterPayload}=await adapters;
  const result=normalizeAdapterPayload(detectAdapter(org,'https://jobs.eu.lever.co/hospital'),[{
    id:'abc-def',text:'Public Health Analyst 100%',description,lists:[{text:'Benefits',content:'<li>Weiterbildung und gute Betreuung</li>'}],
    additional:'<p>Bitte jetzt bewerben.</p>',hostedUrl:'https://jobs.eu.lever.co/hospital/abc-def',
    categories:{location:'Zürich',allLocations:['Zürich','Bern'],commitment:'Permanent'},workplaceType:'hybrid',
    salaryRange:{currency:'CHF',min:90000,max:110000,interval:'year'}}],org);
  assert.equal(result.jobs.length,1); const job=result.jobs[0];
  assert.match(job.description,/Benefits\n.*Weiterbildung/s); assert.match(job.description,/jetzt bewerben/);
  assert.equal(job.location,'Zürich / Bern'); assert.equal(job.salary_hint,'CHF 90000–110000 year');
  assert.equal(job.remote_mode,'hybrid'); assert.equal(job.employment_type,'permanent'); assert.equal(result.complete,true);
});

test('adapter records cannot attribute another tenant or arbitrary external site',async()=>{
  const {detectAdapter,normalizeAdapterPayload}=await adapters;
  for(const [board,payload] of [
    ['https://hospital.recruitee.com',{offers:[{title:'Health Analyst',description,careers_url:'https://other.recruitee.com/o/health-analyst'}]}],
    ['https://boards.greenhouse.io/hospital',{jobs:[{title:'Health Analyst',content:description,absolute_url:'https://boards.greenhouse.io/other/jobs/123'}]}],
    ['https://jobs.lever.co/hospital',[{text:'Health Analyst',description,hostedUrl:'https://jobs.lever.co/hospital-other/123'}]],
    ['https://boards.greenhouse.io/hospital',{jobs:[{title:'Health Analyst',content:description,absolute_url:'https://attacker.ch/jobs/123'}]}],
  ]) {
    const result=normalizeAdapterPayload(detectAdapter(org,board),payload,org);
    assert.equal(result.jobs.length,0,board); assert.equal(result.rejected,1,board); assert.equal(result.complete,false,board); assert.deepEqual(result.links,[],board);
  }
});

test('Greenhouse accepts a supplied direct job URL on the employer website',async()=>{
  const {detectAdapter,normalizeAdapterPayload}=await adapters;
  const result=normalizeAdapterPayload(detectAdapter(org,'https://boards.greenhouse.io/hospital'),{
    jobs:[{title:'Health Analyst',content:description,absolute_url:'https://hospital.ch/careers?gh_jid=123'}]},org);
  assert.equal(result.jobs.length,1); assert.equal(result.jobs[0].url,'https://hospital.ch/careers?gh_jid=123');
});

test('malformed/error payloads and invalid rows never report healthy empty boards',async()=>{
  const {detectAdapter,normalizeAdapterPayload}=await adapters;
  const adapter=detectAdapter(org,'https://hospital.recruitee.com');
  for(const payload of [null,{},{error:'Unauthorized'},{offers:null}]) {
    const result=normalizeAdapterPayload(adapter,payload,org);
    assert.equal(result.explicitEmpty,false); assert.equal(result.complete,false); assert.equal(result.malformed,true);
  }
  const invalid=normalizeAdapterPayload(adapter,{offers:[null,123,{}]},org);
  assert.equal(invalid.rejected,3); assert.equal(invalid.explicitEmpty,false);
  assert.equal(normalizeAdapterPayload(adapter,{offers:[]},org).explicitEmpty,true);
});

test('incomplete descriptions become verified detail links instead of fake jobs',async()=>{
  const {detectAdapter,normalizeAdapterPayload}=await adapters;
  const result=normalizeAdapterPayload(detectAdapter(org,'https://hospital.recruitee.com'),{offers:[{
    title:'Health Analyst',description:'A short preview.',careers_url:'https://hospital.recruitee.com/o/analyst'}]},org);
  assert.equal(result.jobs.length,0); assert.equal(result.links[0].url,'https://hospital.recruitee.com/o/analyst');
  assert.equal(result.complete,false); assert.equal(result.rejected,1);
});

test('Lever pagination is explicit and its final empty page does not mean empty employer',async()=>{
  const {detectAdapter,normalizeAdapterPayload}=await adapters;
  const adapter=detectAdapter(org,'https://jobs.lever.co/hospital');
  const rows=Array.from({length:100},(_,id)=>({id:String(id),text:`Health Analyst ${id}`,description,hostedUrl:`https://jobs.lever.co/hospital/${id}`}));
  const first=normalizeAdapterPayload(adapter,rows,org);
  assert.equal(first.jobs.length,100); assert.equal(first.hasPagination,true); assert.equal(first.complete,false);
  const next=detectAdapter(org,first.nextApiUrl); assert.equal(next.pageOffset,100);
  const last=normalizeAdapterPayload(next,[],org);
  assert.equal(last.complete,true); assert.equal(last.explicitEmpty,false); assert.equal(last.nextApiUrl,null);
  assert.equal(detectAdapter(org,'https://api.lever.co/v0/postings/hospital?skip=-1'),null);
});

test('Greenhouse totals and non-job Recruitee offers retain conservative coverage',async()=>{
  const {detectAdapter,normalizeAdapterPayload}=await adapters;
  const missing=normalizeAdapterPayload(detectAdapter(org,'https://boards.greenhouse.io/hospital'),{jobs:[],meta:{total:2}},org);
  assert.equal(missing.hasPagination,true); assert.equal(missing.explicitEmpty,false); assert.equal(missing.complete,false);
  const excluded=normalizeAdapterPayload(detectAdapter(org,'https://hospital.recruitee.com'),{offers:[
    {title:'Talent Pool',kind:'talent_pool'},{title:'Old role',kind:'job',status:'closed'}]},org);
  assert.equal(excluded.jobs.length,0); assert.equal(excluded.explicitEmpty,false);
});

test('description text cannot break JSON script wrapper and tracking does not duplicate jobs',async()=>{
  const {detectAdapter,normalizeAdapterPayload}=await adapters;
  const row={title:'Health Analyst',description:description+'<script>ignored</script>',careers_url:'https://hospital.recruitee.com/o/analyst'};
  const result=normalizeAdapterPayload(detectAdapter(org,'https://hospital.recruitee.com'),{offers:[row,{...row,careers_url:row.careers_url+'?utm_source=newsletter'}]},org);
  assert.equal(result.jobs.length,1); assert.doesNotMatch(result.jobs[0].description,/ignored/);
});
