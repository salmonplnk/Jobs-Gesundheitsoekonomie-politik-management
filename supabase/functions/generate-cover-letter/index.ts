// Supabase Edge Function: generate-cover-letter
// Generates a personalized Swiss business cover letter using CV + Arbeitszeugnisse + job details
// Deploy: supabase functions deploy generate-cover-letter

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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

    // Rate limit: 10 cover letters per day
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('search_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', oneDayAgo)

    if ((count ?? 0) >= 15) {
      return new Response(JSON.stringify({
        error: 'Tageslimit erreicht. Maximal 15 Aktionen pro Tag (Matching + Bewerbungen).'
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { cv_text, person_name, zeugnisse, job, language } = await req.json()

    if (!cv_text) {
      return new Response(JSON.stringify({ error: 'Kein CV vorhanden. Bitte lade zuerst deinen Lebenslauf hoch.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!job || !job.title || !job.organization) {
      return new Response(JSON.stringify({ error: 'Keine Stelleninformationen vorhanden.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'API Key nicht konfiguriert' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Format today's date
    const today = new Date()
    const dateStr = language === 'fr'
      ? today.toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })
      : today.toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' })

    // Build Zeugnisse context
    let zeugnisseText = ''
    if (zeugnisse && zeugnisse.length > 0) {
      zeugnisseText = '\n\nARBEITSZEUGNISSE:\n' + zeugnisse.slice(0, 3).map((z: {employer?: string, period?: string, text?: string, notable_quotes?: string[]}) => {
        const parts = []
        if (z.employer) parts.push(`Arbeitgeber: ${z.employer}`)
        if (z.period) parts.push(`Zeitraum: ${z.period}`)
        if (z.notable_quotes?.length) parts.push(`Zitate: ${z.notable_quotes.join(' / ')}`)
        if (z.text) parts.push(`Inhalt: ${z.text.substring(0, 1500)}`)
        return parts.join('\n')
      }).join('\n---\n')
    }

    const isGerman = language !== 'fr'

    const systemPrompt = isGerman
      ? `Du schreibst ein professionelles Bewerbungsschreiben im Schweizer Geschäftsbrief-Format.

FORMAT (exakt einhalten – JEDE Zeile):

${person_name || 'Vorname Nachname'}

${job.location || 'Ort'}, ${dateStr}

${job.organization}
${job.location || ''}

Bewerbung als ${job.title}${job.pensum ? ' (' + job.pensum + ')' : ''}

Sehr geehrte Damen und Herren

[Brieftext: 3-4 Absätze, insgesamt max 300 Wörter]

Freundliche Grüsse

${person_name || 'Vorname Nachname'}

REGELN:
- Schweizer Hochdeutsch (kein ß! "Grüsse" nicht "Grüße", "gross" nicht "groß")
- Name "${person_name || 'Vorname Nachname'}" und Datum "${dateStr}" DIREKT einsetzen – KEINE Platzhalter
- Erster Absatz: Konkreter Bezug zur Stelle und zur Organisation ${job.organization}
- Zweiter Absatz: Relevante Erfahrung und Kompetenzen aus dem Lebenslauf hervorheben
${zeugnisse?.length ? '- Dritter Absatz: Bezug auf Arbeitszeugnisse nehmen, z.B. "Wie in meinem Arbeitszeugnis von [Firma] bestätigt, konnte ich..." oder "Meine Stärke in [X] wurde auch von meinem früheren Arbeitgeber [Y] hervorgehoben."' : ''}
- Schluss: Motivation + Gesprächsbereitschaft
- Personalisierten Bezug zu ${job.organization} herstellen (NICHT generisch!)
- Direkt, überzeugend, professionell – nicht übertrieben oder devot

Antworte NUR mit dem fertigen Bewerbungsschreiben (kein Markdown, keine Erklärungen):`

      : `Tu rédiges une lettre de motivation professionnelle au format suisse.

FORMAT (respecter exactement):

${person_name || 'Prénom Nom'}

${job.location || 'Lieu'}, le ${dateStr}

${job.organization}
${job.location || ''}

Candidature au poste de ${job.title}${job.pensum ? ' (' + job.pensum + ')' : ''}

Madame, Monsieur,

[Texte: 3-4 paragraphes, max 300 mots]

Je vous prie d'agréer, Madame, Monsieur, mes salutations distinguées.

${person_name || 'Prénom Nom'}

RÈGLES:
- Français suisse formel
- Nom "${person_name || 'Prénom Nom'}" et date "${dateStr}" directement insérés – PAS de placeholder
- Premier paragraphe: référence au poste et à ${job.organization}
- Deuxième paragraphe: expérience et compétences du CV
${zeugnisse?.length ? '- Troisième paragraphe: référence aux certificats de travail' : ''}
- Conclusion: motivation + disponibilité pour un entretien

Réponds UNIQUEMENT avec la lettre (pas de markdown, pas d\'explications):`

    const userMessage = `LEBENSLAUF:\n${cv_text.substring(0, 4000)}${zeugnisseText}

STELLE:
Titel: ${job.title}
Organisation: ${job.organization}
Ort: ${job.location || 'nicht angegeben'}
Pensum: ${job.pensum || 'nicht angegeben'}
Warum passend: ${job.reason || ''}
Stärken-Match: ${job.highlights?.join(', ') || ''}`

    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    })

    if (!claudeResp.ok) {
      console.error('Claude API error:', await claudeResp.text())
      return new Response(JSON.stringify({ error: 'Fehler beim Generieren. Bitte erneut versuchen.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const claudeData = await claudeResp.json()
    const letter = claudeData.content?.[0]?.text || ''

    // Log for rate limiting
    supabase.from('search_logs').insert({
      user_id: user.id,
      search_params: { action_type: 'cover_letter', job_title: job.title, org: job.organization },
      results_count: letter.length > 0 ? 1 : 0
    }).then(() => {})

    return new Response(JSON.stringify({ letter, language: language || 'de' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('generate-cover-letter error:', err)
    return new Response(JSON.stringify({ error: 'Interner Fehler: ' + err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
