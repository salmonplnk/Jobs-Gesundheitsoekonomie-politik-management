// Authenticated, bounded vacancy retrieval. Matching is transparent in the client.
// Deploy after the job-workspace SQL migration; requires SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import catalog from '../../../data/organizations.json' with { type: 'json' }
import { CACHE_VERSION, isAllowedUrl } from '../_shared/job-extraction.mjs'
import { crawlOrganization, fetchPublicPage } from '../_shared/job-crawler.mjs'

type Organization = { id: string; name: string; main: string; jobs: string }
const organizations = new Map<string, Organization>(catalog.flatMap(category => category.orgs).map(org => [org.id, org]))
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: {...corsHeaders, 'Content-Type':'application/json', 'Cache-Control':'no-store'},
})

async function publicAddresses(host: string): Promise<string[]> {
  const results = await Promise.allSettled([Deno.resolveDns(host, 'A'), Deno.resolveDns(host, 'AAAA')])
  return results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers:corsHeaders})
  if (req.method !== 'POST') return json({error:'Nur POST ist erlaubt.'}, 405)
  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return json({error:'Bitte melde dich für die Stellensuche an.'}, 401)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({error:'Die Stellensuche ist noch nicht vollständig eingerichtet. Supabase URL, Anon-Key und Service-Role-Key müssen serverseitig konfiguriert sein.', code:'deployment_required'}, 503)
    }
    const client = createClient(supabaseUrl, anonKey, {
      global:{headers:{Authorization:authorization}}, auth:{persistSession:false, autoRefreshToken:false},
    })
    const {data:{user}, error:authError} = await client.auth.getUser()
    if (authError || !user) return json({error:'Sitzung abgelaufen. Bitte melde dich erneut an.'}, 401)
    const body = await req.text()
    if (body.length > 30000) return json({error:'Anfrage zu gross. Sende nur die ausgewählten Organisations-IDs.'}, 413)
    let input
    try { input = JSON.parse(body) } catch { return json({error:'Ungültiges JSON.'}, 400) }
    if (!Array.isArray(input.orgs) || !input.orgs.length) return json({error:'Keine Organisationen ausgewählt.'}, 400)
    // Reject oversize batches explicitly; no selected employer is silently dropped.
    if (input.orgs.length > 3) return json({error:'Maximal drei Organisationen pro Anfrage. Bitte die Suche in Paketen durchführen.', code:'batch_too_large'}, 400)
    const ids = input.orgs.map((item: unknown) => typeof item === 'string' ? item : (item as {id?:unknown})?.id)
    if (ids.some((id: unknown) => typeof id !== 'string' || !organizations.has(id))) {
      return json({error:'Mindestens eine Organisation ist nicht im freigegebenen Katalog. Eigene URLs werden nicht abgerufen.', code:'unknown_organization'}, 400)
    }
    const selected = [...new Set<string>(ids)].map(id => organizations.get(id)!)
    const {data:quota, error:quotaError} = await client.rpc('consume_job_quota', {
      action_name:'match-jobs', max_requests:60, window_seconds:3600,
    })
    if (quotaError) {
      console.error('Quota RPC unavailable:', quotaError.code)
      return json({error:'Die Datenbank-Erweiterung für die Stellensuche fehlt oder ist nicht erreichbar. Bitte die Job-Workspace-Migration installieren.', code:'migration_required'}, 503)
    }
    const allowed = quota === true || quota?.allowed === true || quota?.[0]?.allowed === true
    if (!allowed) return json({error:'Maximal 60 Suchpakete pro Stunde. Bitte warte bis zur nächsten Stunde.', code:'rate_limit'}, 429)
    const admin = createClient(supabaseUrl, serviceKey, {auth:{persistSession:false, autoRefreshToken:false}})
    const signal = AbortSignal.timeout(45000)
    const warnings = new Set<string>()
    const result = await Promise.all(selected.map(async org => {
      const {data:row, error:readError} = await admin.from('job_cache')
        .select('url, extracted_jobs, fetched_at, expires_at').eq('org_id', org.id)
        .gte('expires_at', new Date().toISOString()).maybeSingle()
      if (readError) warnings.add('Der gemeinsame Cache konnte nicht gelesen werden; Quellen wurden direkt abgefragt.')
      const cached = row?.extracted_jobs
      if (input.refresh !== true && !readError && row?.url === org.jobs && cached?.version === CACHE_VERSION &&
          Array.isArray(cached.jobs) && cached.source?.org_id === org.id &&
          ['ok','empty','partial'].includes(cached.source.status) &&
          cached.jobs.every((job: {org_id:string;url:string;description:string}) => job.org_id === org.id && typeof job.description === 'string' && isAllowedUrl(job.url, org))) {
        return {jobs:cached.jobs, source:{...cached.source, cached:true}}
      }
      const fresh = await crawlOrganization(org, (url: string, source: Organization, options: {signal?:AbortSignal}) =>
        fetchPublicPage(url, source, {...options, resolver:publicAddresses}), {signal})
      if (['ok','empty','partial'].includes(fresh.source.status)) {
        const {error:writeError} = await admin.from('job_cache').upsert({
          org_id:org.id, url:org.jobs, raw_html:null,
          extracted_jobs:{version:CACHE_VERSION, jobs:fresh.jobs, source:fresh.source},
          fetched_at:fresh.source.checked_at, expires_at:new Date(Date.now() + 24*60*60*1000).toISOString(),
        }, {onConflict:'org_id'})
        if (writeError) warnings.add('Suchergebnisse sind verfügbar, konnten aber nicht im gemeinsamen Cache gespeichert werden.')
      }
      return fresh
    }))
    const jobs = [...new Map(result.flatMap(item => item.jobs).map(job => [job.id, job])).values()]
    const sources = result.map(item => item.source)
    const complete = sources.filter(source => ['ok','empty'].includes(source.status)).length
    const {error:logError} = await client.from('search_logs').insert({
      user_id:user.id, search_params:{org_ids:selected.map(org => org.id), org_count:selected.length}, results_count:jobs.length,
    })
    if (logError) warnings.add('Das Suchprotokoll konnte nicht gespeichert werden.')
    return json({jobs, matches:jobs, sources,
      summary:`${jobs.length} Einzelstellen aus ${selected.length} Organisationen; ${complete} Quellen ohne erkannte Einschränkung geprüft.`,
      warnings:[...warnings], fetched_at:new Date().toISOString()})
  } catch (error) {
    console.error('match-jobs failed:', error instanceof Error ? error.name : 'unknown')
    return json({error:'Die Stellensuche konnte nicht abgeschlossen werden. Bitte erneut versuchen.', code:'retrieval_error'}, 500)
  }
})
