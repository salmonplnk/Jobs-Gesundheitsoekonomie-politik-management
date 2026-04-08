// Supabase Edge Function: parse-cv
// Accepts a PDF CV, extracts text, sends to Claude for profile extraction
// Deploy: supabase functions deploy parse-cv
// Env var: ANTHROPIC_API_KEY

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

    // Rate limit: max 3 CV parses per day
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('cv_uploads')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('uploaded_at', oneDayAgo)

    if ((count ?? 0) >= 3) {
      return new Response(JSON.stringify({
        error: 'Maximal 3 CV-Uploads pro Tag. Bitte versuche es morgen erneut.'
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Parse multipart form data
    const formData = await req.formData()
    const file = formData.get('cv')

    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'Keine Datei hochgeladen' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Validate file
    if (file.size > 5 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'Datei zu gross. Maximal 5 MB.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const allowedTypes = ['application/pdf']
    if (!allowedTypes.includes(file.type)) {
      return new Response(JSON.stringify({ error: 'Nur PDF-Dateien werden akzeptiert.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Read file content
    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)

    // Extract text from PDF (simple text extraction – works for most modern PDFs)
    const pdfText = extractTextFromPdf(bytes)

    if (!pdfText || pdfText.trim().length < 50) {
      return new Response(JSON.stringify({
        error: 'CV konnte nicht gelesen werden. Bitte stelle sicher, dass das PDF Text enthält (kein Scan/Bild).'
      }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Upload to Supabase Storage
    const storagePath = `cvs/${user.id}/${Date.now()}_${file.name}`
    const { error: uploadError } = await supabase.storage
      .from('cv-uploads')
      .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      // Continue without storage – parsing is more important
    }

    // Send to Claude for extraction
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
        system: `Du bist ein CV-Parser für eine Schweizer Gesundheitswesen-Jobplattform.
Extrahiere aus dem Lebenslauf die folgenden Informationen und antworte AUSSCHLIESSLICH im JSON-Format:

{
  "education": "lehre" | "bachelor" | "master" | "phd" | "andere" | null,
  "field_of_study": "Fachrichtung (z.B. Pflege, Gesundheitsökonomie, Medizin, Public Health)" | null,
  "experience": "0-2" | "2-5" | "5-10" | "10+" | null,
  "languages": {
    "de": "grundkenntnisse" | "fliessend" | "muttersprachlich" | null,
    "fr": "grundkenntnisse" | "fliessend" | "muttersprachlich" | null,
    "it": "grundkenntnisse" | "fliessend" | "muttersprachlich" | null,
    "en": "grundkenntnisse" | "fliessend" | "muttersprachlich" | null
  },
  "keywords": "Komma-getrennte Stichwörter zu Skills/Fachgebieten",
  "summary": "2-3 Sätze Zusammenfassung des Profils auf Deutsch"
}

Regeln:
- Berechne Berufserfahrung basierend auf dem Zeitraum der relevanten Stellen
- Erkenne Schweizer Bildungsabschlüsse (EFZ, HF, FH, Uni)
- Extrahiere nur vorhandene Informationen – keine Annahmen
- Setze nicht erkannte Felder auf null`,
        messages: [{ role: 'user', content: `Hier ist der Lebenslauf:\n\n${pdfText.substring(0, 8000)}` }]
      })
    })

    if (!claudeResp.ok) {
      console.error('Claude API error:', await claudeResp.text())
      return new Response(JSON.stringify({ error: 'Fehler beim Analysieren des CVs.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const claudeData = await claudeResp.json()
    const content = claudeData.content?.[0]?.text || '{}'

    let extracted
    try {
      extracted = JSON.parse(content)
    } catch {
      extracted = { error: 'CV konnte nicht strukturiert werden', raw: content }
    }

    // Store in cv_uploads table
    await supabase.from('cv_uploads').insert({
      user_id: user.id,
      file_name: file.name,
      storage_path: storagePath,
      extracted_profile: extracted
    })

    return new Response(JSON.stringify({
      extracted,
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

/**
 * Simple PDF text extraction using raw stream parsing.
 * Works for most modern PDFs with embedded text (not scanned images).
 */
function extractTextFromPdf(bytes: Uint8Array): string {
  const raw = new TextDecoder('latin1').decode(bytes)
  const textParts: string[] = []

  // Method 1: Extract text between BT...ET (text objects)
  const btEtRegex = /BT\s([\s\S]*?)ET/g
  let match
  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1]
    // Extract text from Tj and TJ operators
    const tjRegex = /\(([^)]*)\)\s*Tj/g
    let tj
    while ((tj = tjRegex.exec(block)) !== null) {
      textParts.push(tj[1])
    }
    // TJ arrays: [(text) kern (text) kern ...]
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

  // Method 2: If method 1 got very little, try stream decompression markers
  if (textParts.join('').length < 100) {
    // Fallback: extract anything that looks like readable text
    const readable = raw.match(/[\w\säöüÄÖÜéèêàâçß.,;:!?()\-–/@&]{20,}/g)
    if (readable) {
      return readable.join('\n').substring(0, 10000)
    }
  }

  // Clean up extracted text
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
