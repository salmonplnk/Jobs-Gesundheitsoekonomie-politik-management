#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { crawlOrganization } from '../supabase/functions/_shared/job-crawler.mjs';
import { canonicalUrl, isAllowedUrl, matchesOrganizationScope } from '../supabase/functions/_shared/job-extraction.mjs';
import { createPublicNetwork, createBrowserRenderer, NETWORK_LIMITS } from './feed-network.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_STATUSES = new Set(['ok','empty','partial','unsupported','error','pending']);
const JOB_FIELDS = ['id','org_id','organization','title','url','source_url','fetched_at','description','description_truncated',
  'location','hiring_organization','pensum','workload_min','workload_max','languages','salary_hint','deadline','remote_mode',
  'employment_type','employment_type_raw','seniority','role','first_seen','last_seen','status','closed_at'];
const SOURCE_FIELDS = ['org_id','name','url','status','checked_at','job_count','message','coverage','pages_scanned',
  'detail_pages_scanned','pending_pages','method','cached','last_success_at','last_complete_at','stale','retained_count',
  'scraped_count','has_portal','excluded_jobs'];
const pick = (object, fields) => Object.fromEntries(fields.filter(key => object[key] !== undefined).map(key => [key, object[key]]));
const validId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(id);
export const FEED_BYTE_LIMITS = Object.freeze({index:24 * 1024 * 1024, shard:12 * 1024 * 1024});

export function catalogOrganizations(catalog, overrides = {version:1, sources:{}}) {
  if (!Array.isArray(catalog)) throw new Error('Ungültiger Organisationskatalog.');
  if (overrides.version !== 1 || !overrides.sources || typeof overrides.sources !== 'object') throw new Error('Ungültige Quellenkorrekturen.');
  const seen = new Set();
  return catalog.flatMap(group => group.orgs || []).map(org => {
    if (!validId(org.id) || seen.has(org.id)) throw new Error(`Ungültige oder doppelte Organisations-ID: ${org.id}`);
    seen.add(org.id);
    return {...org, ...pick(overrides.sources[org.id] || {}, ['jobs','allowed_hosts','adapter','scope_terms'])};
  });
}

/** The public feed cannot carry CVs, accounts, applications, notes, or other workspace state. */
export function publicJob(raw, org) {
  if (!raw || raw.org_id !== org.id || typeof raw.id !== 'string' || !raw.id.startsWith(`${org.id}:`) ||
    typeof raw.title !== 'string' || typeof raw.description !== 'string' || !isAllowedUrl(raw.url, org) ||
    !matchesOrganizationScope(raw, org)) return null;
  const url = canonicalUrl(raw.url);
  if (!url) return null;
  const job = pick(raw, JOB_FIELDS);
  job.organization = [raw.hiring_organization, raw.organization, org.name]
    .find(name => typeof name === 'string' && name.trim())?.trim() || org.name;
  job.url = url;
  job.status = job.status === 'closed' ? 'closed' : 'open';
  return job;
}

export function mergeSourceSnapshot(org, fresh, previous = {}, checkedAt = new Date().toISOString()) {
  const source = {...pick(fresh.source || {}, SOURCE_FIELDS), org_id:org.id, name:org.name,
    url:org.jobs || org.main || '', has_portal:Boolean(org.jobs), checked_at:checkedAt};
  if (!SOURCE_STATUSES.has(source.status)) source.status = 'error';
  const before = new Map((previous.jobs || []).map(raw => publicJob(raw, org)).filter(Boolean).map(job => [job.id, job]));
  const excludedPrevious = (previous.jobs || []).filter(job => job && typeof job === 'object' && !matchesOrganizationScope(job, org)).length;
  const observed = new Map((fresh.jobs || []).map(raw => publicJob(raw, org)).filter(Boolean).map(job => [job.id, job]));
  const verified = ['ok','empty'].includes(source.status) && source.coverage === 'complete';
  const successful = ['ok','empty','partial'].includes(source.status) && (observed.size > 0 || verified);
  const jobs = new Map(before);
  for (const [id, job] of observed) {
    const old = before.get(id);
    jobs.set(id, {...job, first_seen:old?.first_seen || old?.fetched_at || checkedAt,
      last_seen:checkedAt, status:'open', closed_at:null});
  }
  let retained = 0;
  for (const [id, job] of before) {
    if (observed.has(id)) continue;
    // A failed, unsupported, partial, timed-out or truncated source proves no closure.
    jobs.set(id, verified ? {...job, status:'closed', closed_at:job.closed_at || checkedAt} : job);
    if (job.status !== 'closed' && !verified) retained++;
  }
  source.scraped_count = observed.size;
  source.retained_count = retained;
  source.job_count = [...jobs.values()].filter(job => job.status !== 'closed').length;
  source.last_success_at = successful ? checkedAt : previous.source?.last_success_at || null;
  source.last_complete_at = verified ? checkedAt : previous.source?.last_complete_at || null;
  source.stale = !successful || retained > 0;
  source.cached = retained > 0;
  if (excludedPrevious) {
    source.excluded_jobs = (source.excluded_jobs || 0) + excludedPrevious;
    source.message = `${source.message || ''} ${excludedPrevious} frühere Stellen ausserhalb des verifizierten Quellenbereichs entfernt.`.trim();
  }
  const cutoff = Date.parse(checkedAt) - 90 * 24 * 60 * 60 * 1000;
  for (const [id, job] of jobs) if (job.status === 'closed' && Date.parse(job.closed_at) < cutoff) jobs.delete(id);
  return {version:1, org_id:org.id, jobs:[...jobs.values()].sort((a,b) => a.id.localeCompare(b.id)), source};
}

export function compactJob(job) {
  const compact = pick(job, ['id','org_id','title','organization','url','location','pensum','workload_min','workload_max',
    'role','languages','remote_mode','employment_type','seniority','salary_hint','deadline','first_seen','last_seen','fetched_at','status']);
  compact.description = job.description.slice(0, 1000);
  compact.description_truncated = Boolean(job.description_truncated || job.description.length > 1000);
  compact.detail_file = `./${job.org_id}.json`;
  return compact;
}

export function compactIndexJobs(shards) {
  const byUrl = new Map();
  for (const job of shards.flatMap(shard => shard.jobs).filter(job => job.status !== 'closed')) {
    const key = canonicalUrl(job.url);
    const existing = byUrl.get(key);
    if (!existing) byUrl.set(key, {...compactJob(job), org_ids:[job.org_id]});
    else if (!existing.org_ids.includes(job.org_id)) existing.org_ids.push(job.org_id);
  }
  return [...byUrl.values()];
}

export async function loadPrevious(directory, organizations) {
  const previous = new Map();
  if (!directory) return previous;
  let index;
  try { index = JSON.parse(await readFile(join(directory, 'index.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return previous; throw error; }
  if (index.version !== 1 || !Array.isArray(index.sources)) throw new Error('Vorheriger Feed ist ungültig; kein Überschreiben.');
  for (const org of organizations) {
    try {
      const shard = JSON.parse(await readFile(join(directory, `${org.id}.json`), 'utf8'));
      if (shard.version !== 1 || shard.org_id !== org.id || !Array.isArray(shard.jobs)) throw new Error(`Ungültiger Feed für ${org.id}.`);
      previous.set(org.id, {jobs:shard.jobs, source:shard.source || index.sources.find(source => source.org_id === org.id)});
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // Canonical index deduplication may put a different organisation in primary org_id.
      if (index.sources.some(source => source.org_id === org.id && source.job_count > 0) ||
        (index.jobs || []).some(job => job.org_id === org.id || job.org_ids?.includes(org.id))) {
        throw new Error(`Vorheriger Detailfeed fehlt: ${org.id}.`);
      }
    }
  }
  return previous;
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), {recursive:true});
  const temporary = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, {encoding:'utf8', mode:0o644});
  await rename(temporary, path);
}

export async function writeFeed(directory, feed) {
  // Preflight the whole snapshot before any replacement; client limits match these budgets.
  if (Buffer.byteLength(JSON.stringify(feed.index)) + 1 > FEED_BYTE_LIMITS.index) throw new Error('Index überschreitet 24 MiB; bestehender Feed bleibt erhalten.');
  for (const shard of feed.shards) {
    if (!validId(shard.org_id)) throw new Error('Ungültige Detailfeed-ID.');
    if (Buffer.byteLength(JSON.stringify(shard)) + 1 > FEED_BYTE_LIMITS.shard) throw new Error(`Detailfeed ${shard.org_id} überschreitet 12 MiB; bestehender Feed bleibt erhalten.`);
  }
  // Every rename is atomic. Publish the index after every referenced shard exists.
  for (const shard of feed.shards) await atomicJson(join(directory, `${shard.org_id}.json`), shard);
  await atomicJson(join(directory, 'index.json'), feed.index);
}

export async function runFeed({organizations, previous = new Map(), only = [], maxSources = Infinity,
  concurrency = 6, sourceTimeoutMs = 300_000, fetchPage, fetchJson, renderPage,
  crawl = crawlOrganization, limits = NETWORK_LIMITS, now = () => new Date().toISOString(), onSource = () => {}}) {
  if (!Array.isArray(organizations) || !organizations.length) throw new Error('Leerer Quellenkatalog.');
  for (const id of only) if (!organizations.some(org => org.id === id)) throw new Error(`Unbekannte Quelle: ${id}`);
  const startedAt = now();
  const selected = new Set(organizations.filter(org => !only.length || only.includes(org.id)).slice(0, maxSources).map(org => org.id));
  const shards = new Array(organizations.length);
  let next = 0;
  await Promise.all(Array.from({length:Math.min(Math.max(1, concurrency), organizations.length)}, async () => {
    while (next < organizations.length) {
      const index = next++, org = organizations[index], prior = previous.get(org.id);
      if (!selected.has(org.id)) {
        const jobs = (prior?.jobs || []).map(raw => publicJob(raw, org)).filter(Boolean);
        shards[index] = {version:1, org_id:org.id, jobs,
          source:{...pick(prior?.source || {}, SOURCE_FIELDS), org_id:org.id, name:org.name, url:org.jobs || org.main || '',
            has_portal:Boolean(org.jobs), status:prior?.source?.status || 'pending', checked_at:prior?.source?.checked_at || null,
            job_count:jobs.filter(job => job.status !== 'closed').length,
            last_success_at:prior?.source?.last_success_at || null, stale:prior?.source ? Boolean(prior.source.stale) : true,
            message:prior?.source?.message || 'In diesem begrenzten Testlauf nicht abgerufen.'}};
        continue;
      }
      const signal = AbortSignal.timeout(sourceTimeoutMs);
      const checkedAt = now();
      let result;
      try {
        const options = {signal, limits, now:() => checkedAt, fetchJson, previousJobs:prior?.jobs || []};
        result = await crawl(org, fetchPage, options);
        if (renderPage && org.jobs && result.source.status === 'unsupported' && !signal.aborted) {
          const rendered = await crawl(org, renderPage, options);
          if (rendered.jobs.length || rendered.source.status === 'empty') result = rendered;
          else result.source.message += ` Dynamischer Abruf: ${rendered.source.message}`;
          result.source.method = rendered.jobs.length ? 'browser' : result.source.method || 'html';
        }
      } catch (error) {
        result = {jobs:[], source:{status:'error', coverage:'unknown', message:error?.message || 'Abruf fehlgeschlagen.'}};
      }
      const shard = mergeSourceSnapshot(org, result, prior, checkedAt);
      shards[index] = shard;
      await onSource(shard.source, shard);
    }
  }));
  const sources = shards.map(shard => shard.source);
  const counts = Object.fromEntries([...SOURCE_STATUSES].map(status => [status, sources.filter(source => source.status === status).length]));
  const finishedAt = now();
  return {shards, index:{version:1, generated_at:finishedAt,
    run:{id:randomUUID(), started_at:startedAt, finished_at:finishedAt, total:organizations.length, checked:selected.size,
      total_sources:organizations.length, checked_sources:selected.size,
      configured:organizations.filter(org => org.jobs).length, concurrency, source_timeout_ms:sourceTimeoutMs,
      limited:selected.size < organizations.length,
      status:selected.size < organizations.length || counts.error || counts.partial || counts.unsupported ? 'partial' : 'complete', counts},
    sources, jobs:compactIndexJobs(shards)}};
}

export async function main(argv = process.argv.slice(2)) {
  const {values} = parseArgs({args:argv, options:{
    catalog:{type:'string', default:join(ROOT, 'data/organizations.json')},
    overrides:{type:'string', default:join(ROOT, 'data/job-source-overrides.json')},
    output:{type:'string', default:join(ROOT, 'data/job-feed')}, previous:{type:'string'},
    only:{type:'string', multiple:true}, 'max-sources':{type:'string'}, concurrency:{type:'string', default:'6'},
    'source-timeout-ms':{type:'string', default:'300000'}, browser:{type:'boolean', default:false}, help:{type:'boolean'},
  }});
  if (values.help) {
    console.log('Usage: npm run feed:refresh -- [--only bag,bsv] [--max-sources 5] [--browser] [--previous DIR] [--output DIR]\nDefault: every organisation, six concurrent sources, 300 seconds per source; robots.txt and host delays enforced.');
    return;
  }
  const integer = (value, name, min, max) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > max) throw new Error(`Ungültiges ${name}: ${value}`);
    return number;
  };
  const catalog = JSON.parse(await readFile(resolve(values.catalog), 'utf8'));
  let overrides;
  try { overrides = JSON.parse(await readFile(resolve(values.overrides), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const organizations = catalogOrganizations(catalog, overrides);
  const output = resolve(values.output);
  const previous = await loadPrevious(resolve(values.previous || output), organizations);
  const network = createPublicNetwork();
  let renderer;
  try {
    if (values.browser) {
      try { renderer = await createBrowserRenderer(network); }
      catch { console.warn('Chromium nicht verfügbar; öffentliche HTML- und API-Quellen werden weiterhin geprüft.'); }
    }
    const feed = await runFeed({organizations, previous,
      only:(values.only || []).flatMap(value => value.split(',')).filter(Boolean),
      maxSources:values['max-sources'] ? integer(values['max-sources'], 'max-sources', 1, organizations.length) : Infinity,
      concurrency:integer(values.concurrency, 'concurrency', 1, 12),
      sourceTimeoutMs:integer(values['source-timeout-ms'], 'source-timeout-ms', 1000, 600000),
      fetchPage:network.page, fetchJson:network.json, renderPage:renderer?.page,
      onSource:source => console.log(`${source.org_id}: ${source.status}; ${source.scraped_count} fetched, ${source.retained_count} retained; ${source.message}`),
    });
    feed.index.run.browser = values.browser ? (renderer ? 'enabled' : 'unavailable') : 'disabled';
    await writeFeed(output, feed);
    console.log(JSON.stringify({output, ...feed.index.run, jobs:feed.index.jobs.length}));
  } finally { await renderer?.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
