// Supabase Edge Function: match-jobs
// Proxy for Claude API – matches user profile against job listings
// Deploy: supabase functions deploy match-jobs
// Env var: ANTHROPIC_API_KEY (set via supabase secrets set ANTHROPIC_API_KEY=sk-ant-...)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Rate limiting: max 5 requests per user per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('search_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', oneHourAgo)

    if ((count ?? 0) >= 5) {
      return new Response(JSON.stringify({
        error: 'Rate Limit erreicht. Maximal 5 Anfragen pro Stunde. Bitte warte etwas.'
      }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Parse request
    const { profile, orgs } = await req.json()
    if (!orgs || !orgs.length) {
      return new Response(JSON.stringify({ error: 'Keine Organisationen ausgewählt' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch job pages in PARALLEL (check cache first, then fetch live)
    const selectedOrgs = orgs.slice(0, 10) // max 10 orgs per request
    const jobData = await Promise.all(selectedOrgs.map(async (org) => {
      // Check cache first
      const { data: cacheRow } = await supabase
        .from('job_cache')
        .select('*')
        .eq('org_id', org.id)
        .gte('expires_at', new Date().toISOString())
        .single()

      if (cacheRow && cacheRow.extracted_jobs) {
        return {
          org_name: org.name, org_id: org.id, url: org.jobs,
          page_content: JSON.stringify(cacheRow.extracted_jobs)
        }
      }

      if (!org.jobs) return null

      // Fetch live
      try {
        const resp = await fetch(org.jobs, {
          headers: { 'User-Agent': 'SwissHealthJobs/1.0' },
          signal: AbortSignal.timeout(8000)
        })
        if (resp.ok) {
          const html = await resp.text()
          const truncated = html.replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 4000) // 4k chars per org to keep payload manageable

          // Update cache (fire-and-forget)
          supabase.from('job_cache').upsert({
            org_id: org.id, url: org.jobs, raw_html: truncated,
            fetched_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          }, { onConflict: 'org_id' }).then(() => {})

          return {
            org_name: org.name, org_id: org.id, url: org.jobs,
            page_content: truncated
          }
        }
      } catch (fetchErr) {
        return {
          org_name: org.name, org_id: org.id, url: org.jobs,
          page_content: '(Karriereseite konnte nicht geladen werden)'
        }
      }
      return null
    }))

    const validJobData = jobData.filter(Boolean)

    // Build Claude prompt
    const profileText = buildProfileText(profile)
    const jobsText = validJobData.map((j, i) =>
      `--- ${i + 1}. ${j.org_name} (${j.url}) ---\n${j.page_content}`
    ).join('\n\n')

    const systemPrompt = `Du bist ein Schweizer Gesundheitswesen-Jobberater. Du erhältst:
1. Ein Profil eines Stellensuchenden
2. Karriereseiten-Inhalte von Schweizer Gesundheitsorganisationen

Deine Aufgabe:
- Analysiere die Inhalte und finde passende Stellen für das Profil
- Bewerte jede passende Stelle mit einem Matching-Score (1-5 Sterne)
- Begründe kurz, warum die Stelle passt
- Sortiere nach Relevanz
- Antworte auf Deutsch
- Berücksichtige: Ausbildungsniveau, Fachrichtung, Erfahrung, Region, Pensum, Sprache
- Wenn keine passenden Stellen gefunden wurden, erkläre warum und gib Tipps
- Maximal 10 beste Matches

Antworte AUSSCHLIESSLICH im folgenden JSON-Format (kein Markdown, kein anderer Text):
{
  "matches": [
    {
      "title": "Stellentitel",
      "organization": "Organisation",
      "url": "Link zur Stelle oder Karriereseite",
      "score": 4,
      "reason": "Kurze Begründung warum passend",
      "highlights": ["Passt zu Erfahrung", "Richtige Region"],
      "concerns": ["Evtl. Überqualifiziert"]
    }
  ],
  "summary": "Zusammenfassung der Suche in 1-2 Sätzen",
  "tips": "Optionale Tipps für die weitere Suche"
}`

    const userMessage = `PROFIL DES STELLENSUCHENDEN:\n${profileText}\n\nKARRIERESEITEN-INHALTE:\n${jobsText}`

    // Call Claude API
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'Claude API Key nicht konfiguriert' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    })

    if (!claudeResp.ok) {
      const errText = await claudeResp.text()
      console.error('Claude API error:', errText)
      return new Response(JSON.stringify({ error: 'Claude API Fehler. Bitte versuche es später erneut.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const claudeData = await claudeResp.json()
    const content = claudeData.content?.[0]?.text || '{}'

    // Parse Claude's JSON response
    let result
    try {
      result = JSON.parse(content)
    } catch {
      // If Claude didn't return valid JSON, wrap it
      result = { matches: [], summary: content, tips: '' }
    }

    // Log search (async, fire-and-forget)
    supabase.from('search_logs').insert({
      user_id: user.id,
      search_params: { profile, org_count: orgs.length },
      results_count: result.matches?.length || 0
    }).then(() => {})

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Edge function error:', err)
    return new Response(JSON.stringify({ error: 'Interner Fehler: ' + err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function buildProfileText(p) {
  if (!p) return 'Kein Profil angegeben.'
  const parts = []
  if (p.education) parts.push(`Ausbildung: ${p.education}`)
  if (p.field_of_study) parts.push(`Fachrichtung: ${p.field_of_study}`)
  if (p.experience) parts.push(`Berufserfahrung: ${p.experience} Jahre`)
  if (p.desired_regions?.length) parts.push(`Gewünschte Regionen: ${p.desired_regions.join(', ')}`)
  if (p.workload_min || p.workload_max) parts.push(`Pensum: ${p.workload_min || 50}% – ${p.workload_max || 100}%`)
  if (p.languages && Object.keys(p.languages).length) {
    const langs = Object.entries(p.languages).map(([k, v]) => `${k.toUpperCase()}: ${v}`).join(', ')
    parts.push(`Sprachen: ${langs}`)
  }
  if (p.keywords) parts.push(`Stichwörter: ${p.keywords}`)
  if (p.exclusions?.length) parts.push(`Ausschlüsse: ${p.exclusions.join(', ')}`)
  if (p.exclusions_freetext) parts.push(`Weitere Ausschlüsse: ${p.exclusions_freetext}`)
  if (p.start_date) parts.push(`Starttermin: ${p.start_date}`)
  return parts.join('\n') || 'Kein Profil angegeben.'
}
