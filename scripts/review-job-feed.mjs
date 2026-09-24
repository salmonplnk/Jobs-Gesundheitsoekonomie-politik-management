import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {catalogOrganizations,compactIndexJobs,focusFeed,writeFeed} from './job-feed.mjs';

// One-time review of the immutable, successful full crawl. The workflow verifies
// its run, commit and archive digest before this script receives the JSON files.
// Reclassifying the available full texts only tightens the existing selection;
// it is not another source crawl and cannot recover previously excluded jobs.
const SOURCE_RUN_ID = 35972131067;
const SOURCE_COMMIT = 'c90b503d7ea7c7ba6921d99b941b5ec349b95e3d';
const CRAWL_ID = 'f1b47f81-8eee-4ab9-99fd-5b0a96e56349';

export function reviewFeed(feed,organizations,now = new Date().toISOString()) {
  const original=feed.index;
  assert.equal(original.run.id,CRAWL_ID,'This review only accepts the pinned complete crawl.');
  assert.equal(original.run.checked_sources,85);
  assert.equal(original.run.limited,false);
  assert.equal(original.scope.policy_version,1);
  assert.equal(original.scope.scanned_jobs,1789);
  assert.equal(original.jobs.length,39);
  assert.equal(original.review,undefined,'The correction must not be applied twice.');
  assert.deepEqual(original.jobs,compactIndexJobs(feed.shards));
  assert.ok(Date.parse(now)>=Date.parse(original.generated_at));
  assert.ok(Date.parse(now)-Date.parse(original.generated_at)<48*60*60*1000);

  const corrected=focusFeed(feed,organizations);
  const priorIds=new Set(original.jobs.map(job=>job.id));
  assert.ok(corrected.index.jobs.every(job=>priorIds.has(job.id)),'Review cannot add unobserved vacancies.');
  const kept=new Set(corrected.index.jobs.map(job=>job.id));
  const removed=original.jobs.filter(job=>!kept.has(job.id)).map(job=>job.id);
  assert.ok(removed.includes('unilu:c6946c6f97064a69'),'Studies administration must be excluded.');
  assert.ok(removed.includes('kssg:1c9479a17ad2849c'),'Operational security must be excluded.');
  assert.ok(corrected.index.jobs.length>0);

  // The checked page embeds OSTENDISJOBS.embed(publicationHash,"DE",selector,{}).
  // The earlier parser mistook argument 1 for the selector and missed this list.
  // Its one regional PDF proves a successful partial extraction, not completion.
  const cancer=corrected.shards.find(shard=>shard.org_id==='krebsliga');
  assert.equal(cancer.source.url,'https://www.krebsliga.ch/ueber-uns/jobs');
  assert.equal(cancer.source.raw_job_count,1);
  assert.equal(cancer.source.coverage,'complete');
  Object.assign(cancer.source,{status:'partial',coverage:'partial',last_complete_at:null,
    pending_pages:Math.max(1,cancer.source.pending_pages || 0),
    message:'Ein regionales PDF-Inserat wurde vollständig gelesen. Die zusätzlich eingebettete Ostendis-Stellenliste ist nicht erfasst; keine vollständige Quellenabdeckung.'});
  corrected.index.sources=corrected.shards.map(shard=>shard.source);
  corrected.index.run={...original.run,counts:Object.fromEntries(Object.keys(original.run.counts)
    .map(status=>[status,corrected.index.sources.filter(source=>source.status===status).length]))};
  corrected.index.scope={...corrected.index.scope,scanned_jobs:original.scope.scanned_jobs,
    excluded_jobs:original.scope.scanned_jobs-corrected.index.jobs.length};
  corrected.index.generated_at=now;
  corrected.index.review={source_run_id:SOURCE_RUN_ID,source_commit:SOURCE_COMMIT,
    reviewed_at:now,removed_job_ids:removed,source_corrections:['krebsliga']};
  // Preserve the real observation dates and full texts; the review updates
  // classification and honest coverage, never the freshness of a source.
  for (const shard of corrected.shards) {
    const before=feed.shards.find(item=>item.org_id===shard.org_id);
    assert.equal(shard.source.checked_at,before.source.checked_at);
    for (const job of shard.jobs) {
      const previous=before.jobs.find(item=>item.id===job.id);
      assert.ok(previous);
      assert.equal(job.description,previous.description);
      assert.equal(job.last_seen,previous.last_seen);
    }
  }
  return corrected;
}

async function main() {
  const root=fileURLToPath(new URL('../',import.meta.url));
  const json=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
  const organizations=catalogOrganizations(await json('data/organizations.json'),await json('data/job-source-overrides.json'));
  const directory=resolve(root,'data/job-feed');
  assert.deepEqual((await readdir(directory)).sort(),['index.json',...organizations.map(org=>`${org.id}.json`)].sort());
  const feed={index:await json('data/job-feed/index.json'),shards:await Promise.all(organizations.map(org=>json(`data/job-feed/${org.id}.json`)))};
  const reviewed=reviewFeed(feed,organizations);
  await writeFeed(directory,reviewed);
  console.log(JSON.stringify({jobs:reviewed.index.jobs.length,scope:reviewed.index.scope,review:reviewed.index.review,counts:reviewed.index.run.counts}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error);process.exitCode=1;});
