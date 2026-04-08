// Supabase Edge Function: parse-cv (document parser)
// Accepts a PDF (CV or Arbeitszeugnis), extracts text, classifies and summarizes via Claude
// Deploy: supabase functions deploy parse-cv

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

    // Rate limit: 5 document uploads per day
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('cv_uploads')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('uploaded_at', oneDayAgo)

    if ((count ?? 0) >= 5) {
      return new Response(JSON.stringify({
        error: 'Maximal 5 Dokumente pro Tag. Bitte versuche es morgen erneut.'
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const formData = await req.formData()
    const file = formData.get('cv')

    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'Keine Datei hochgeladen' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (file.size > 5 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'Datei zu gross. Maximal 5 MB.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (file.type !== 'application/pdf') {
      return new Response(JSON.stringify({ error: 'Nur PDF-Dateien werden akzeptiert.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    const pdfText = extractTextFromPdf(bytes)

    if (!pdfText || pdfText.trim().length < 50) {
      return new Response(JSON.stringify({
        error: 'Dokument konnte nicht gelesen werden. Bitte stelle sicher, dass das PDF Text enthält (kein Scan/Bild).'
      }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Upload to Supabase Storage (fire-and-forget)
    const storagePath = `cvs/${user.id}/${Date.now()}_${file.name}`
    supabase.storage
      .from('cv-uploads')
      .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false })
      .then(() => {})

    // Classify and summarize via Claude
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'API Key nicht konfiguriert' }), {
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
        max_tokens: 1024,
        system: `Du analysierst ein Dokument einer stellensuchenden Person im Schweizer Gesundheitswesen.

Bestimme zuerst den Dokumenttyp:
- "cv" = Lebenslauf / Curriculum Vitae
- "zeugnis" = Arbeitszeugnis / Referenzschreiben / Zwischenzeugnis
- "andere" = Anderes Dokument (Diplom, Zertifikat, etc.)

Antworte AUSSCHLIESSLICH im JSON-Format:
{
  "doc_type": "cv" | "zeugnis" | "andere",
  "person_name": "Vor- und Nachname der Person (wenn erkennbar, sonst null)",
  "summary": "3-5 Sätze Zusammenfassung des Dokuments auf Deutsch",
  "key_skills": ["Relevante Fähigkeiten und Kompetenzen (max 10)"],
  "employer": "Arbeitgeber-Name (nur bei Zeugnis, sonst null)",
  "period": "Zeitraum (nur bei Zeugnis, z.B. '2018–2023', sonst null)",
  "notable_quotes": ["Wörtliche Zitate die Stärken belegen (nur bei Zeugnis, max 3, sonst [])"]
}

Regeln:
- Bei CVs: Erkenne Schweizer Abschlüsse (EFZ, HF, FH, Uni), berechne Erfahrungsjahre
- Bei Zeugnissen: Extrahiere die besten Bewertungen und Stärken als Zitate
- Name: Suche nach dem vollständigen Namen (Vorname + Nachname)
- Setze unbekannte Felder auf null, erfinde NICHTS`,
        messages: [{ role: 'user', content: `Hier ist das Dokument:\n\n${pdfText.substring(0, 8000)}` }]
      })
    })

    if (!claudeResp.ok) {
      console.error('Claude API error:', await claudeResp.text())
      return new Response(JSON.stringify({ error: 'Fehler beim Analysieren des Dokuments.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const claudeData = await claudeResp.json()
    const content = claudeData.content?.[0]?.text || '{}'

    let extracted: Record<string, unknown>
    try {
      extracted = JSON.parse(content)
    } catch {
      extracted = { doc_type: 'andere', summary: 'Dokument konnte nicht strukturiert werden.' }
    }

    // Store in cv_uploads table
    await supabase.from('cv_uploads').insert({
      user_id: user.id,
      file_name: file.name,
      storage_path: storagePath,
      extracted_profile: {
        ...extracted,
        raw_text: pdfText.substring(0, 5000)
      }
    })

    return new Response(JSON.stringify({
      ...extracted,
      raw_text: pdfText.substring(0, 5000),
      file_name: file.name
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('parse-cv error:', err)
    return new Response(JSON.stringify({ error: 'Interner Fehler: ' + err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function extractTextFromPdf(bytes: Uint8Array): string {
  const raw = new TextDecoder('latin1').decode(bytes)
  const textParts: string[] = []

  const btEtRegex = /BT\s([\s\S]*?)ET/g
  let match
  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1]
    const tjRegex = /\(([^)]*)\)\s*Tj/g
    let tj
    while ((tj = tjRegex.exec(block)) !== null) {
      textParts.push(tj[1])
    }
    const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g
    let tja
    while ((tja = tjArrayRegex.exec(block)) !== null) {
      const inner = tja[1]
      const parts = inner.match(/\(([^)]*)\)/g)
      if (parts) {
        textParts.push(parts.map(p => p.slice(1, -1)).join(''))
      }
    }
  }

  if (textParts.join('').length < 100) {
    const readable = raw.match(/[\w\säöüÄÖÜéèêàâçß.,;:!?()\-–/@&]{20,}/g)
    if (readable) {
      return readable.join('\n').substring(0, 10000)
    }
  }

  let text = textParts.join(' ')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, ' ')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\s+/g, ' ')
    .trim()

  return text.substring(0, 10000)
}
