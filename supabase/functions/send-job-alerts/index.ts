// Scheduled e-mail job alerts. Called by .github/workflows/job-alerts.yml, never by browsers.
// Requires the 202611030001_job_alerts.sql migration and the secrets listed in DEPLOYMENT.md.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import catalog from '../../../data/organizations.json' with { type: 'json' }
import { buildOrgIndex, DEFAULT_MAX_JOBS_PER_MAIL, normalizeAlertFilters, renderAlertEmail, selectNewJobs } from '../_shared/job-alerts.mjs'

const DEFAULT_FEED_URL = 'https://raw.githubusercontent.com/salmonplnk/Jobs-Gesundheitsoekonomie-politik-management/job-feed-data/data/job-feed/index.json'
const MAX_FEED_BYTES = 25 * 1024 * 1024
const DEFAULT_ALERTS_PER_RUN = 50
const SEND_DELAY_MS = 600 // Resend's default limit is 2 requests per second.
const orgIndex = buildOrgIndex(catalog)

type Alert = {
  id: string; user_id: string; name: string | null; filters: Record<string, unknown>; frequency: 'daily' | 'weekly'
  active: boolean; email: string | null; unsubscribe_token: string; last_sent_at: string | null; created_at: string
}
type Outcome = { alert_id: string; status: 'sent' | 'no_new_jobs' | 'no_email' | 'failed' | 'dry_run'; jobs?: number; error?: string }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function secretMatches(given: string | null, expected: string) {
  const a = new TextEncoder().encode(given ?? ''), b = new TextEncoder().encode(expected)
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function fetchFeedJobs(url: string) {
  const response = await fetch(url, {signal:AbortSignal.timeout(30000), headers:{Accept:'application/json'}})
  if (!response.ok) { await response.body?.cancel(); throw new Error(`FEED_HTTP_${response.status}`) }
  const raw = await response.text()
  if (raw.length > MAX_FEED_BYTES) throw new Error('FEED_TOO_LARGE')
  const feed = JSON.parse(raw)
  if (!feed || !Array.isArray(feed.jobs)) throw new Error('FEED_INVALID')
  return {jobs:feed.jobs as Record<string, unknown>[], generatedAt:typeof feed.generated_at === 'string' ? feed.generated_at : null}
}

Deno.serve(async req => {
  if (req.method !== 'POST') return json({error:'Nur POST ist erlaubt.'}, 405)
  const cronSecret = Deno.env.get('JOB_ALERTS_CRON_SECRET')
  if (!cronSecret || cronSecret.length < 16) return json({error:'Jobalarme sind nicht eingerichtet (JOB_ALERTS_CRON_SECRET fehlt).'}, 503)
  if (!secretMatches(req.headers.get('x-cron-secret'), cronSecret)) return json({error:'Nicht berechtigt.'}, 401)

  const url = Deno.env.get('SUPABASE_URL'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY'), from = Deno.env.get('ALERTS_FROM_EMAIL'), siteUrl = Deno.env.get('SITE_URL')
  const feedUrl = Deno.env.get('JOB_FEED_INDEX_URL') || DEFAULT_FEED_URL
  let body: {dry_run?: unknown; max_alerts?: unknown} = {}
  try { const raw = await req.text(); body = raw.trim() ? JSON.parse(raw) : {} } catch { return json({error:'Ungültige Anfrage.'}, 400) }
  const dryRun = body.dry_run === true
  if (!url || !serviceKey || !siteUrl || (!dryRun && (!resendKey || !from))) {
    return json({error:'Jobalarme sind nicht vollständig eingerichtet (SUPABASE_SERVICE_ROLE_KEY, SITE_URL, RESEND_API_KEY oder ALERTS_FROM_EMAIL fehlt).'}, 503)
  }
  try { if (!['https:','http:'].includes(new URL(siteUrl).protocol) || new URL(feedUrl).protocol !== 'https:') throw new Error() }
  catch { return json({error:'SITE_URL oder JOB_FEED_INDEX_URL ist ungültig.'}, 503) }
  const configuredMax = Number(Deno.env.get('JOB_ALERTS_MAX_PER_RUN')) || DEFAULT_ALERTS_PER_RUN
  const maxAlerts = Math.max(1, Math.min(200, Number.isInteger(body.max_alerts) ? Number(body.max_alerts) : configuredMax))
  const maxJobs = Math.max(1, Math.min(100, Number(Deno.env.get('JOB_ALERTS_MAX_JOBS_PER_MAIL')) || DEFAULT_MAX_JOBS_PER_MAIL))

  const admin = createClient(url, serviceKey, {auth:{persistSession:false, autoRefreshToken:false}})
  let feed
  try { feed = await fetchFeedJobs(feedUrl) }
  catch (error) {
    console.error('send-job-alerts feed unavailable:', error instanceof Error ? error.message : 'unknown')
    return json({error:'Der öffentliche Jobfeed ist nicht erreichbar.'}, 502)
  }

  // A dry run must not claim alerts, so it reads due rows directly.
  const claim = dryRun
    ? await admin.from('job_alerts').select('*').eq('active', true).limit(maxAlerts)
    : await admin.rpc('claim_due_job_alerts', {max_alerts:maxAlerts})
  if (claim.error) {
    console.error('send-job-alerts claim failed:', claim.error.code)
    return json({error:'Fällige Jobalarme konnten nicht geladen werden. Ist die Migration 202611030001 installiert?'}, 503)
  }
  const alerts = (claim.data ?? []) as Alert[]
  const outcomes: Outcome[] = []
  const emails = new Map<string, string | null>()
  let rateLimited = false

  for (const alert of alerts) {
    if (rateLimited) break
    try {
      const delivered = dryRun ? {data:[], error:null} : await admin.rpc('job_alert_delivered_ids', {alert_id:alert.id})
      if (delivered.error) throw new Error(`DELIVERED_IDS_${delivered.error.code}`)
      // All new matches are selected (and later logged as delivered); the mail lists the first maxJobs.
      const matches = selectNewJobs({jobs:feed.jobs, alert:{...alert, filters:normalizeAlertFilters(alert.filters)}, orgIndex, deliveredIds:delivered.data ?? [], limit:Number.MAX_SAFE_INTEGER})
      const total = matches.total, jobs = matches.jobs.slice(0, maxJobs), allIds = matches.jobs.map(job => String(job.id))
      if (!total) { outcomes.push({alert_id:alert.id, status:'no_new_jobs'}); continue }

      let to = alert.email
      if (!to) {
        if (!emails.has(alert.user_id)) {
          const {data, error} = await admin.auth.admin.getUserById(alert.user_id)
          const user = data?.user
          emails.set(alert.user_id, !error && user?.email && user.email_confirmed_at ? user.email : null)
        }
        to = emails.get(alert.user_id) ?? null
      }
      if (!to) { outcomes.push({alert_id:alert.id, status:'no_email'}); continue }

      const mail = renderAlertEmail({alert, jobs, total, siteUrl, orgIndex})
      if (dryRun) { outcomes.push({alert_id:alert.id, status:'dry_run', jobs:total}); continue }

      // Same alert + same jobs => same key, so a retried run cannot send a duplicate (Resend keeps keys 24 h).
      const idempotencyKey = `job-alert-${await sha256Hex(`${alert.id}:${[...allIds].sort().join(',')}`)}`
      const response = await fetch('https://api.resend.com/emails', {
        method:'POST', signal:AbortSignal.timeout(20000),
        headers:{'Authorization':`Bearer ${resendKey}`, 'Content-Type':'application/json', 'Idempotency-Key':idempotencyKey},
        body:JSON.stringify({from, to:[to], subject:mail.subject, html:mail.html, text:mail.text,
          headers:{'List-Unsubscribe':`<${mail.unsubscribeUrl}>`}, tags:[{name:'type', value:'job_alert'}]}),
      })
      if (response.status === 429) { await response.body?.cancel(); rateLimited = true; outcomes.push({alert_id:alert.id, status:'failed', error:'RATE_LIMITED'}); break }
      if (!response.ok) { await response.body?.cancel(); throw new Error(`RESEND_HTTP_${response.status}`) }
      const result = await response.json().catch(() => ({}))
      // Only after the provider accepted the message: log delivery and advance last_sent_at.
      // All matching ids are recorded, including those beyond the per-mail cap ("und N weitere").
      const recorded = await admin.rpc('record_job_alert_delivery', {alert_id:alert.id, job_ids:allIds, provider_message_id:typeof result?.id === 'string' ? result.id : null})
      if (recorded.error) console.error('send-job-alerts record failed:', alert.id, recorded.error.code)
      outcomes.push({alert_id:alert.id, status:'sent', jobs:total})
      await sleep(SEND_DELAY_MS)
    } catch (error) {
      const message = error instanceof Error ? (error.name === 'TimeoutError' ? 'TIMEOUT' : error.message) : 'UNKNOWN'
      console.error('send-job-alerts alert failed:', alert.id, message)
      outcomes.push({alert_id:alert.id, status:'failed', error:message.slice(0, 80)})
    }
  }

  const count = (status: Outcome['status']) => outcomes.filter(item => item.status === status).length
  return json({
    dry_run:dryRun, feed_generated_at:feed.generatedAt, feed_jobs:feed.jobs.length,
    claimed:alerts.length, sent:count('sent'), no_new_jobs:count('no_new_jobs'), no_email:count('no_email'),
    failed:count('failed'), would_send:count('dry_run'), rate_limited:rateLimited,
    // More due alerts may exist: the workflow calls again while this is true.
    remaining:!dryRun && !rateLimited && alerts.length >= maxAlerts,
    outcomes,
  })
})
