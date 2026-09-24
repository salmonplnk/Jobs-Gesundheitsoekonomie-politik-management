import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { catalogOrganizations, compactIndexJobs, loadPrevious, mergeSourceSnapshot, runFeed, writeFeed } from '../scripts/job-feed.mjs';
import { createHostScheduler, createPublicNetwork, fetchBrowserResource, looksLikeChallenge, NETWORK_LIMITS } from '../scripts/feed-network.mjs';

const org = {id:'health', name:'Health employer', main:'https://health.ch', jobs:'https://health.ch/jobs'};
const time = '2026-09-22T12:00:00.000Z', oldTime = '2026-09-20T12:00:00.000Z';
const job = (id = 'one', extra = {}) => ({id:`health:${id}`, org_id:'health', organization:org.name,
  title:'Health Economics Analyst 80–100%', url:`https://health.ch/jobs/${id}`, description:'A public vacancy description. '.repeat(100),
  fetched_at:oldTime, first_seen:oldTime, last_seen:oldTime, status:'open', ...extra});
const prior = {jobs:[job()], source:{status:'ok', last_success_at:oldTime, last_complete_at:oldTime}};

test('failed and incomplete crawls retain full prior jobs and their observation times', () => {
  for (const status of ['error','unsupported','partial']) {
    const snapshot = mergeSourceSnapshot(org, {jobs:[], source:{status, coverage:'unknown'}}, prior, time);
    assert.deepEqual(snapshot.jobs, prior.jobs);
    assert.equal(snapshot.source.last_success_at, oldTime);
    assert.equal(snapshot.source.stale, true);
    assert.equal(snapshot.source.retained_count, 1);
  }
  assert.equal(mergeSourceSnapshot(org, {jobs:[],source:{status:'empty'}},prior,time).jobs[0].status,'open');
});

test('only verified complete coverage closes missing records and later observations reopen them', () => {
  const closed = mergeSourceSnapshot(org,{jobs:[],source:{status:'empty',coverage:'complete'}},prior,time);
  assert.equal(closed.jobs[0].status,'closed');
  assert.equal(closed.jobs[0].closed_at,time);
  assert.equal(closed.jobs[0].last_seen,oldTime);
  const reopened = mergeSourceSnapshot(org,{jobs:[job()],source:{status:'ok',coverage:'complete'}},closed,time);
  assert.equal(reopened.jobs[0].status,'open');
  assert.equal(reopened.jobs[0].closed_at,null);
  assert.equal(reopened.jobs[0].first_seen,oldTime);
  assert.equal(reopened.jobs[0].last_seen,time);
});

test('public allowlists exclude workspace state and index truncation does not alter full descriptions', () => {
  const unsafe = job('one',{cv:'private CV',user_id:'private',notes:'private note',applications:['private'],assessment:{private:true}});
  const snapshot = mergeSourceSnapshot(org,{jobs:[unsafe],source:{status:'ok',coverage:'complete',access_token:'secret'}},{jobs:[unsafe]},time);
  assert.doesNotMatch(JSON.stringify(snapshot),/private|secret|access_token/);
  const compact = compactIndexJobs([snapshot])[0];
  assert.equal(compact.description.length,1000);
  assert.equal(compact.description_truncated,true);
  assert.equal(compact.detail_file,'./health.json');
  assert(snapshot.jobs[0].description.length > 1000);
});

test('index deduplicates canonical URLs while retaining all source associations and excluding closed jobs', () => {
  const first = job('one');
  const shared = {...job('different'),org_id:'shared',id:'shared:different',url:first.url+'?utm_source=test'};
  const index = compactIndexJobs([{jobs:[first,job('closed',{status:'closed'})]},{jobs:[shared]}]);
  assert.equal(index.length,1);
  assert.deepEqual(index[0].org_ids,['health','shared']);
  assert.equal(index[0].detail_file,'./health.json');
});

test('default run represents and visits all 85 catalogue organisations including entries without URLs', async () => {
  const catalog = JSON.parse(await readFile(new URL('../data/organizations.json',import.meta.url),'utf8'));
  const organizations = catalogOrganizations(catalog), calls=[];
  const result = await runFeed({organizations,now:()=>time,crawl:async organization=>{
    calls.push(organization.id);
    return {jobs:[],source:{status:organization.jobs?'empty':'unsupported',coverage:organization.jobs?'complete':'unknown'}};
  }});
  assert.equal(calls.length,85);
  assert.equal(result.index.sources.length,85);
  assert.equal(result.index.run.total_sources,85);
  assert.equal(result.index.run.checked_sources,85);
  assert.equal(result.index.run.configured,81);
  assert.equal(result.index.run.limited,false);
});

test('limited runs preserve previous full shards and mark unvisited sources pending', async () => {
  const other={...org,id:'other'}, third={...org,id:'third'}, calls=[];
  const result = await runFeed({organizations:[org,other,third],only:['other'],previous:new Map([['health',prior]]),
    now:()=>time,crawl:async organization=>{calls.push(organization.id);return {jobs:[],source:{status:'error'}};}});
  assert.deepEqual(calls,['other']);
  assert.equal(result.shards[0].jobs[0].description,prior.jobs[0].description);
  assert.equal(result.index.sources[2].status,'pending');
  assert.equal(result.index.run.checked_sources,1);
  assert.equal(result.index.run.limited,true);
  await assert.rejects(runFeed({organizations:[org],only:['unknown']}),/Unbekannte Quelle/);
});

test('targeted reruns preserve unrelated fresh sources while existing errors and pending sources remain stale', async () => {
  const failed={...org,id:'failed'}, target={...org,id:'target'}, pending={...org,id:'pending'};
  const fresh=mergeSourceSnapshot(org,{jobs:[job()],source:{status:'ok',coverage:'complete'}},prior,time);
  const oldError=mergeSourceSnapshot(failed,{jobs:[],source:{status:'error',coverage:'unknown'}},{},oldTime);
  const calls=[];
  const result=await runFeed({organizations:[org,failed,target,pending],only:['target'],
    previous:new Map([[org.id,fresh],[failed.id,oldError]]),now:()=>time,
    crawl:async organization=>{calls.push(organization.id);return {jobs:[],source:{status:'error'}};}});
  const sources=new Map(result.index.sources.map(source=>[source.org_id,source]));
  assert.deepEqual(calls,['target']);
  assert.equal(sources.get('health').status,'ok');
  assert.equal(sources.get('health').stale,false);
  assert.equal(sources.get('health').last_success_at,time);
  assert.equal(sources.get('failed').status,'error');
  assert.equal(sources.get('failed').stale,true);
  assert.equal(sources.get('failed').checked_at,oldTime);
  assert.equal(sources.get('target').stale,true);
  assert.equal(sources.get('pending').status,'pending');
  assert.equal(sources.get('pending').stale,true);
});

test('worker concurrency is bounded and a thrown source failure does not stop other employers', async () => {
  let active=0, maximum=0;
  const organizations=Array.from({length:9},(_,i)=>({...org,id:`org${i}`}));
  const result=await runFeed({organizations,concurrency:3,crawl:async organization=>{
    active++;maximum=Math.max(maximum,active);
    await new Promise(resolve=>setImmediate(resolve));active--;
    if(organization.id==='org1')throw new Error('isolated fixture failure');
    return {jobs:[],source:{status:'empty',coverage:'complete'}};
  }});
  assert.equal(maximum,3);
  assert.equal(result.index.sources.filter(source=>source.status==='error').length,1);
  assert.equal(result.index.sources.filter(source=>source.status==='empty').length,8);
});

test('atomic writer and previous loader round-trip full records and reject missing known shards', async () => {
  const directory=await mkdtemp(join(tmpdir(),'health-feed-'));
  try{
    const result=await runFeed({organizations:[org],now:()=>time,crawl:async()=>({jobs:[job()],source:{status:'ok',coverage:'complete'}})});
    await writeFeed(directory,result);
    const previous=await loadPrevious(directory,[org]);
    assert.equal(previous.get(org.id).jobs[0].description,job().description);
    assert.equal(JSON.parse(await readFile(join(directory,'index.json'),'utf8')).version,1);
    await rm(join(directory,'health.json'));
    await assert.rejects(loadPrevious(directory,[org]),/Detailfeed fehlt/);
    await writeFile(join(directory,'index.json'),'broken');
    await assert.rejects(loadPrevious(directory,[org]),/JSON/);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('registry overrides only affect source configuration and unsafe shard ids are rejected', () => {
  const result=catalogOrganizations([{orgs:[org]}],{version:1,sources:{health:{jobs:'https://jobs.health.ch',
    allowed_hosts:['ats.health.ch'],adapter:'public-api',scope_terms:['research'],user_id:'secret'}}});
  assert.equal(result[0].jobs,'https://jobs.health.ch');
  assert.deepEqual(result[0].allowed_hosts,['ats.health.ch']);
  assert.deepEqual(result[0].scope_terms,['research']);
  assert.equal(result[0].user_id,undefined);
  assert.throws(()=>catalogOrganizations([{orgs:[{...org,id:'../escape'}]}]),/Ungültige/);
});

test('current verified scopes remove unrelated old jobs even if the latest crawl fails', () => {
  const scoped={...org,scope_terms:['public health']};
  const result=mergeSourceSnapshot(scoped,{jobs:[],source:{status:'error'}},prior,time);
  assert.equal(result.jobs.length,0);
  assert.equal(result.source.excluded_jobs,1);
  assert.match(result.source.message,/Quellenbereichs/);
  const valid=job('two',{description:'A public health research role. '.repeat(10),hiring_organization:'Actual clinic'});
  assert.equal(mergeSourceSnapshot(scoped,{jobs:[valid],source:{status:'partial'}},{},time).jobs[0].organization,'Actual clinic');
});

test('failed and unselected sources lose off-topic old records while relevant stale vacancies survive', async () => {
  const other={...org,id:'other'};
  const offTopic=job('nurse',{title:'Dipl. Pflegefachperson HF 80%',description:'Sie pflegen unsere Patientinnen und Patienten. Diplom Pflegefachperson HF erforderlich.'});
  const old={...prior,jobs:[job(),offTopic]};
  const otherOld={source:{status:'ok',coverage:'complete',checked_at:oldTime,stale:false},jobs:[{...offTopic,id:'other:nurse',org_id:'other'}]};
  const result=await runFeed({organizations:[org,other],only:[org.id],now:()=>time,
    previous:new Map([[org.id,old],[other.id,otherOld]]),crawl:async()=>{throw new Error('unavailable');}});
  assert.deepEqual(result.index.jobs.map(item=>item.id),['health:one']);
  assert.deepEqual(result.shards[0].jobs.map(item=>item.id),['health:one']);
  assert.equal(result.shards[1].jobs.length,0);
  assert.equal(result.shards[0].jobs[0].last_seen,oldTime);
  assert.equal(result.shards[0].source.status,'error');
  assert.equal(result.shards[0].source.stale,true);
  assert.equal(result.shards[0].source.retained_count,1);
  assert.equal(result.index.scope.retained_jobs,1);
  assert.equal(result.index.scope.relevant_jobs,1);
  assert.equal(result.index.scope.excluded_jobs,1); // Both nursing copies share one canonical URL.
  assert.equal(result.shards[1].source.raw_job_count,1);
  assert.equal(result.shards[1].source.filtered_out_count,1);
});

test('a completely crawled employer with zero relevant jobs remains technically successful',async () => {
  const offTopic=job('nurse',{title:'Dipl. Pflegefachperson HF 80%',description:'Ausbildung als Pflegefachperson HF erforderlich. Sie betreuen unsere Patientinnen und Patienten.'});
  const result=await runFeed({organizations:[org],now:()=>time,crawl:async()=>({jobs:[offTopic],
    source:{status:'ok',coverage:'complete',pages_scanned:1,detail_pages_scanned:1}})});
  const source=result.index.sources[0];
  assert.equal(source.status,'ok');
  assert.equal(source.coverage,'complete');
  assert.equal(source.stale,false);
  assert.equal(source.last_complete_at,time);
  assert.equal(source.raw_job_count,1);
  assert.equal(source.job_count,0);
  assert.equal(source.relevant_job_count,0);
  assert.equal(source.filtered_out_count,1);
  assert.equal(result.index.run.counts.ok,1);
  assert.equal(result.index.run.counts.empty,0);
  assert.equal(result.index.jobs.length,0);
  assert.equal(result.shards[0].jobs.length,0);
});

test('relevance scope counts distinct open URLs while source counters retain individual inventories',async () => {
  const other={...org,id:'other'};
  const good=job('one'),bad=job('kitchen',{title:'Koch / Köchin 100%',description:'Küche und Gastronomie. Zubereitung der Mahlzeiten für unsere Gäste.'});
  const result=await runFeed({organizations:[org,other],now:()=>time,crawl:async organization=>({
    jobs:[good,bad].map(item=>({...item,id:`${organization.id}:${item.id.split(':')[1]}`,org_id:organization.id})),
    source:{status:'ok',coverage:'complete'}})});
  assert.equal(result.index.scope.scanned_jobs,2);
  assert.equal(result.index.scope.relevant_jobs,1);
  assert.equal(result.index.scope.excluded_jobs,1);
  assert.equal(result.index.scope.retained_jobs,0);
  assert.equal(result.index.scope.policy_version,result.index.jobs[0].relevance.policy_version);
  assert.equal(result.index.jobs[0].relevance.eligible,true);
  assert.deepEqual(result.index.jobs[0].org_ids,['health','other']);
  for(const source of result.index.sources) {
    assert.equal(source.scraped_count,2);
    assert.equal(source.raw_job_count,2);
    assert.equal(source.relevant_job_count,1);
    assert.equal(source.filtered_out_count,1);
    assert.equal(source.cached,false);
  }
  assert.equal(result.shards[0].jobs[0].relevance.eligible,true);
});

test('unselected filtered sources retain the raw inventory count from their previous check',async () => {
  const target={...org,id:'target'};
  const previous={jobs:[job()],source:{status:'ok',coverage:'complete',checked_at:oldTime,stale:false,
    raw_job_count:31,relevant_job_count:1,filtered_out_count:30,job_count:1,scraped_count:31,last_success_at:oldTime}};
  const result=await runFeed({organizations:[org,target],only:[target.id],now:()=>time,
    previous:new Map([[org.id,previous]]),crawl:async()=>({jobs:[],source:{status:'empty',coverage:'complete'}})});
  const source=result.index.sources.find(item=>item.org_id===org.id);
  assert.equal(source.raw_job_count,31);
  assert.equal(source.relevant_job_count,1);
  assert.equal(source.filtered_out_count,30);
  assert.equal(source.checked_at,oldTime);
  assert.equal(source.scraped_count,31);
  assert.equal(result.index.scope.scanned_jobs,1); // Only available full records are reclassified now.
  assert.equal(result.index.scope.relevant_jobs,1);
});

test('missing secondary shards are detected despite global canonical deduplication', async () => {
  const directory=await mkdtemp(join(tmpdir(),'health-shared-feed-'));
  try{
    await writeFile(join(directory,'index.json'),JSON.stringify({version:1,sources:[{org_id:'health',job_count:1}],
      jobs:[{org_id:'primary',org_ids:['primary','health']}]}));
    await assert.rejects(loadPrevious(directory,[org]),/Detailfeed fehlt/);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('closed records expire after 90 days while stale open records remain', () => {
  const old=job('closed',{status:'closed',closed_at:'2026-01-01T00:00:00.000Z'});
  const result=mergeSourceSnapshot(org,{jobs:[],source:{status:'error'}},{jobs:[old,job()]},time);
  assert.equal(result.jobs.length,1);
  assert.equal(result.jobs[0].id,'health:one');
});

test('oversized snapshots fail validation before replacing any existing file', async () => {
  const directory=await mkdtemp(join(tmpdir(),'health-large-feed-'));
  try{
    await writeFile(join(directory,'index.json'),'original');
    await assert.rejects(writeFeed(directory,{index:{jobs:[]},shards:[{org_id:'health',jobs:[{description:'x'.repeat(12*1024*1024)}]}]}),/12 MiB/);
    assert.equal(await readFile(join(directory,'index.json'),'utf8'),'original');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('robots prohibition is enforced before requesting an employer listing', async () => {
  const calls=[];
  const network=createPublicNetwork({resolver:async()=>['8.8.8.8'],schedule:async()=>{},fetcher:async url=>{
    calls.push(url);return new Response('User-agent: *\nDisallow: /jobs',{headers:{'content-type':'text/plain'}});
  }});
  await assert.rejects(network.page(org.jobs,org),/robots.txt untersagt/);
  assert.deepEqual(calls,['https://health.ch/robots.txt']);
});

test('robots errors fail closed; 404 permits a bounded public HTML request without credentials', async () => {
  for(const status of [403,429,503]){
    const network=createPublicNetwork({resolver:async()=>['8.8.8.8'],schedule:async()=>{},fetcher:async()=>new Response('',{status})});
    await assert.rejects(network.page(org.jobs,org),/robots.txt nicht verifizierbar/);
  }
  const calls=[];
  const network=createPublicNetwork({resolver:async()=>['8.8.8.8'],schedule:async()=>{},fetcher:async(url,options)=>{
    calls.push({url,options});
    return url.endsWith('/robots.txt')?new Response('',{status:404}):new Response('<h1>Public jobs</h1>',{headers:{'content-type':'text/html'}});
  }});
  assert.match((await network.page(org.jobs,org)).html,/Public jobs/);
  assert.equal(calls.length,2);
  assert.equal(calls[1].options.redirect,'manual');
  assert.equal(calls[1].options.headers.Authorization,undefined);
});

test('redirect target robots rules and private DNS remain enforced', async () => {
  const requests=[];
  const network=createPublicNetwork({resolver:async()=>['8.8.8.8'],schedule:async()=>{},fetcher:async url=>{
    requests.push(url);
    if(url.endsWith('/robots.txt'))return new Response('User-agent: *\nDisallow: /private');
    return new Response('',{status:302,headers:{location:'https://health.ch/private'}});
  }});
  await assert.rejects(network.page(org.jobs,org),/robots.txt untersagt/);
  assert(!requests.includes('https://health.ch/private'));
  let fetched=false;
  const privateNetwork=createPublicNetwork({resolver:async()=>['127.0.0.1'],schedule:async()=>{},fetcher:async()=>{fetched=true;}});
  await assert.rejects(privateNetwork.page(org.jobs,org),/öffentliche|Netzwerkadresse/);
  assert.equal(fetched,false);
});

test('browser redirects are resolved manually with robots and URL checks before the target is fetched', async () => {
  const requests=[];
  const network=createPublicNetwork({resolver:async()=>['8.8.8.8'],schedule:async()=>{},fetcher:async url=>{
    requests.push(url);
    if(url.endsWith('/robots.txt'))return new Response('User-agent: *\nDisallow: /private');
    return new Response('',{status:302,headers:{location:'https://health.ch/private'}});
  }});
  await assert.rejects(fetchBrowserResource(network,org.jobs,org),/robots.txt untersagt/);
  assert.deepEqual(requests,['https://health.ch/robots.txt',org.jobs]);
  const bad=createPublicNetwork({resolver:async()=>['8.8.8.8'],schedule:async()=>{},fetcher:async url=>{
    if(url.endsWith('/robots.txt'))return new Response('');
    return new Response('',{status:302,headers:{location:'https://127.0.0.1/private'}});
  }});
  await assert.rejects(fetchBrowserResource(bad,org.jobs,org),/Weiterleitung ungültig/);
});

test('PDF transport preserves binary bytes and never forwards request credentials',async () => {
  const pdf=Buffer.from([37,80,68,70,45,49,46,55,10,0,255,128]),calls=[];
  const network=createPublicNetwork({resolver:async()=>['8.8.8.8'],schedule:async()=>{},fetcher:async(url,options)=>{
    calls.push({url,options});
    return url.endsWith('/robots.txt')?new Response('',{status:404}):new Response(pdf,{headers:{'content-type':'application/pdf'}});
  }});
  const result=await network.document('https://health.ch/files/job.pdf',org,{headers:{Authorization:'secret',Cookie:'private'}});
  assert.deepEqual(Buffer.from(result.bytes),pdf);
  assert.equal(result.url,'https://health.ch/files/job.pdf');
  assert.equal(result.contentType,'application/pdf');
  assert.equal(result.truncated,false);
  assert.equal(calls.length,2);
  assert.equal(calls[1].options.redirect,'manual');
  assert.equal(new Headers(calls[1].options.headers).has('authorization'),false);
  assert.equal(new Headers(calls[1].options.headers).has('cookie'),false);
});

test('PDF transport rejects oversized declared and streamed bodies, incorrect MIME and bad signatures',async () => {
  for(const fixture of [
    {body:'%PDF-1.7',headers:{'content-type':'application/pdf','content-length':'100'},error:/Grössenlimit/},
    {body:'%PDF-1.7'+'x'.repeat(30),headers:{'content-type':'application/pdf'},error:/Grössenlimit/},
    {body:'%PDF-1.7',headers:{'content-type':'text/html'},error:/kein öffentliches PDF/},
    {body:'<html>blocked',headers:{'content-type':'application/pdf'},error:/PDF-Kennung/},
  ]) {
    const network=createPublicNetwork({limits:{...NETWORK_LIMITS,maxDocumentBytes:16},resolver:async()=>['8.8.8.8'],schedule:async()=>{},
      fetcher:async url=>url.endsWith('/robots.txt')?new Response('',{status:404}):new Response(fixture.body,{headers:fixture.headers})});
    await assert.rejects(network.document('https://health.ch/files/job.pdf',org),fixture.error);
  }
});

test('PDF redirects obey target robots rules and reject private DNS before sending the request',async () => {
  const requests=[];
  const network=createPublicNetwork({resolver:async()=>['8.8.8.8'],schedule:async()=>{},fetcher:async url=>{
    requests.push(url);
    if(url.endsWith('/robots.txt'))return new Response('User-agent: *\nDisallow: /private');
    return new Response('',{status:302,headers:{location:'https://health.ch/private/job.pdf'}});
  }});
  await assert.rejects(network.document('https://health.ch/files/job.pdf',org),/robots.txt untersagt/);
  assert.deepEqual(requests,['https://health.ch/robots.txt','https://health.ch/files/job.pdf']);
  const privateRequests=[];
  const privateNetwork=createPublicNetwork({resolver:async host=>[host==='health.ch'?'8.8.8.8':'127.0.0.1'],schedule:async()=>{},fetcher:async url=>{
    privateRequests.push(url);
    if(url.endsWith('/robots.txt'))return new Response('');
    return new Response('',{status:302,headers:{location:'https://documents.health.ch/job.pdf'}});
  }});
  await assert.rejects(privateNetwork.document('https://health.ch/files/job.pdf',org),/öffentliche Netzwerkadresse/);
  assert(!privateRequests.some(url=>url.includes('documents.health.ch')));
  let calls=0;
  const blocked=createPublicNetwork({resolver:async()=>['8.8.8.8'],schedule:async()=>{},fetcher:async()=>{calls++;return new Response('',{status:403});}});
  await assert.rejects(blocked.document('https://health.ch/files/job.pdf',org),/robots.txt nicht verifizierbar/);
  assert.equal(calls,1);
});

test('host scheduling serializes starts and honors the longer declared crawl delay', async () => {
  let now=0;const waits=[];
  const schedule=createHostScheduler({delayMs:1000,clock:()=>now,wait:async ms=>{waits.push(ms);now+=ms;}});
  await schedule('health.ch');await schedule('health.ch',4000);
  await Promise.all([schedule('health.ch',4000),schedule('health.ch',4000)]);
  assert.deepEqual(waits,[4000,4000,4000]);
});

test('challenge pages are errors, never successful empty employer lists', async () => {
  assert.equal(looksLikeChallenge('<title>Just a moment...</title>'),true);
  const network=createPublicNetwork({resolver:async()=>['8.8.8.8'],schedule:async()=>{},fetcher:async url=>
    url.endsWith('/robots.txt')?new Response('',{status:404}):new Response('<title>Just a moment...</title>',{headers:{'content-type':'text/html'}})});
  await assert.rejects(network.page(org.jobs,org),/CAPTCHA/);
  assert.equal(NETWORK_LIMITS.maxDetails,500);
  assert.equal(NETWORK_LIMITS.maxListingPages,50);
});
