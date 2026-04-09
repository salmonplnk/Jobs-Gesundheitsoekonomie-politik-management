# Schweizer Gesundheits-Jobs – Technische Dokumentation

## Überblick

Single-Page-Applikation für Stellensuchende im Schweizer Gesundheitswesen. Bietet eine durchsuchbare Datenbank von 85+ Organisationen, KI-gestütztes Job-Matching via Claude API, CV/Zeugnisse-Upload, und automatisierte Bewerbungsschreiben-Generierung.

**Stack:** HTML5 · CSS3 · Vanilla JS (ES6+) · Supabase (Auth, DB, Storage, Edge Functions) · Claude API

---

## Architektur

```
┌──────────────────────────────────────────────────────┐
│                    Frontend (SPA)                     │
│  index.html · css/styles.css · js/*.js               │
├──────────┬───────────┬────────────┬──────────────────┤
│  app.js  │  auth.js  │  map.js   │  profile.js      │
│  (Data,  │  (Supa-   │  (Search, │  (Profil-Form,   │
│  Render) │  base     │  Filter,  │  CV-Upload)      │
│          │  Auth)    │  Favs)    │                   │
├──────────┴───────────┴────────────┴──────────────────┤
│  matching.js          │  community.js                │
│  (KI-Matching,        │  (Community Orgs/Cats)       │
│  Cover Letter Modal)  │                              │
└──────────┬────────────┴──────────────┬───────────────┘
           │  Supabase Client          │
           ▼                           ▼
┌──────────────────────┐  ┌────────────────────────────┐
│  Supabase Auth       │  │  Supabase Edge Functions    │
│  (E-Mail, Google)    │  │  ├─ match-jobs              │
├──────────────────────┤  │  ├─ parse-cv                │
│  Supabase DB (RLS)   │  │  └─ generate-cover-letter   │
│  ├─ profiles         │  └──────────┬─────────────────┘
│  ├─ favorites        │             │
│  ├─ community_orgs   │             ▼
│  ├─ community_cats   │  ┌────────────────────────────┐
│  ├─ cv_uploads       │  │  Claude API (Anthropic)     │
│  ├─ job_cache        │  │  claude-sonnet-4-20250514   │
│  └─ search_logs      │  └────────────────────────────┘
├──────────────────────┤
│  Supabase Storage    │
│  └─ cv-uploads/      │
└──────────────────────┘
```

---

## Dateien

| Datei | Zeilen | Beschreibung |
|-------|--------|-------------|
| `index.html` | 245 | HTML-Template, SVG-Karte, alle Sections |
| `css/styles.css` | 527 | Komplettes Styling inkl. Dark Mode, Responsive, Modals |
| `js/app.js` | ~400 | Daten (85 Orgs), Rendering, Favoriten, Onboarding |
| `js/auth.js` | 429 | Supabase Auth, Sync, Fehlermeldungen (DE) |
| `js/map.js` | 199 | Suche (Fuzzy), Filter (Standort + Kategorie), Keyboard-Shortcuts |
| `js/profile.js` | 542 | Profil-Formular, CV/Zeugnis-Upload, Dokument-Verwaltung |
| `js/matching.js` | 559 | KI-Matching, Ergebnis-Persistenz, Bewerbungsschreiben-Modal |
| `js/community.js` | 285 | Community-Vorschläge (Orgs + Kategorien) |
| `supabase/functions/match-jobs/index.ts` | 283 | Job-Matching via Claude (Karriereseiten crawlen + analysieren) |
| `supabase/functions/parse-cv/index.ts` | 221 | PDF-Text-Extraktion + Claude-Klassifikation |
| `supabase/functions/generate-cover-letter/index.ts` | 212 | Bewerbungsschreiben via Claude (DE/FR) |
| `supabase/schema.sql` | 171 | 7 Tabellen, RLS-Policies, Trigger |

---

## Datenmodell

### Organisations-Datenbank (`js/app.js`)

85 Organisationen in 7 Kategorien:

```javascript
const DATA = [
  { key: 'bund',          emoji: '🏛️', title: 'Bund / bundesnahe Institutionen',       orgs: [/* 10 */] },
  { key: 'kantone',       emoji: '🏔️', title: 'Kantonale Verwaltungen',                orgs: [/* 16 */] },
  { key: 'versicherungen',emoji: '🛡️', title: 'Versicherungen',                        orgs: [/* 13 */] },
  { key: 'branchen',      emoji: '⚖️', title: 'Branchen- / Tariforganisationen',       orgs: [/* 9 */]  },
  { key: 'spitaeler',     emoji: '🏥', title: 'Leistungserbringer (Spitäler/Kliniken)', orgs: [/* 14 */] },
  { key: 'beratung',      emoji: '🔬', title: 'Beratung / Forschung',                  orgs: [/* 12 */] },
  { key: 'stiftungen',    emoji: '💚', title: 'Stiftungen / Non-Profits',              orgs: [/* 11 */] },
];
```

Jede Organisation:
```javascript
{
  id: 'bag',
  name: 'Bundesamt für Gesundheit (BAG)',
  loc: 'Bern',
  main: 'https://www.bag.admin.ch',
  jobs: 'https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083353',
  desc: 'Nationale Gesundheitspolitik, Prävention und Krankenversicherung.'
}
```

### Supabase-Tabellen (`supabase/schema.sql`)

```sql
-- Benutzerprofil (erweitert auth.users)
profiles (id, email, education, field_of_study, experience,
          desired_regions[], workload_min, workload_max,
          languages JSONB, keywords, exclusions[], start_date, cv_path)

-- Favoriten
favorites (id, user_id, org_id, created_at)  -- UNIQUE(user_id, org_id)

-- Community-Vorschläge
community_orgs (id, submitted_by, name, url, description, category, canton, city, org_type, approved)
community_categories (id, user_id, name, slug UNIQUE, description, approved)

-- Job-Cache (24h TTL)
job_cache (id, org_id UNIQUE, url, raw_html, extracted_jobs JSONB, fetched_at, expires_at)

-- CV-Uploads
cv_uploads (id, user_id, file_name, storage_path, extracted_profile JSONB, uploaded_at)

-- Such-Logs (Rate Limiting + Analytics)
search_logs (id, user_id, search_params JSONB, results_count, clicked_jobs JSONB, created_at)
```

### localStorage-Keys

| Key | Inhalt | Lifetime |
|-----|--------|----------|
| `favOrgs` | `["bag","css","usz"]` | Permanent |
| `darkMode` | `"1"` oder `"0"` | Permanent |
| `onboardingDismissed` | `"1"` | Permanent |
| `userProfile` | JSON-Profildaten mit `updated_at` | Permanent |
| `userDocuments` | Array von CV/Zeugnis-Objekten | Gelöscht bei Logout |
| `lastMatchResults` | Matching-Ergebnisse mit Timestamp | 24h TTL, gelöscht bei Logout |

---

## Features & Code-Snippets

### 1. Interaktive SVG-Karte

14 Städte-Bubbles mit Multi-Select. Bubble-Grösse proportional zur Org-Anzahl.

```html
<!-- index.html -->
<g class="city-bubble" data-loc="Bern">
  <circle class="bubble-fill" cx="330" cy="218" r="48"/>
  <text class="city-name" x="330" y="214">Bern</text>
  <text class="city-count" x="330" y="230" id="count-Bern">29 Unternehmen</text>
</g>
```

```javascript
// js/map.js – Klick-Toggle
function toggleLocation(loc) {
  if (loc === 'alle') { activeLocs = []; }
  else if (activeLocs.includes(loc)) { activeLocs = activeLocs.filter(x => x !== loc); }
  else { activeLocs.push(loc); }
  syncLocationUI();
}

// Responsive Labels je nach Org-Anzahl
function updateBubbleCounts() {
  Object.entries(locationCounts).forEach(([loc, count]) => {
    if (count >= 12) el.textContent = count + ' Unternehmen';
    else if (count >= 5) el.textContent = count + ' Orgs';
    else el.textContent = count;
  });
}
```

### 2. Fuzzy-Suche mit Umlaut-Normalisierung

```javascript
// js/map.js
function normalize(str) {
  return str.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/é|è|ê/g, 'e').replace(/à|â/g, 'a').replace(/ç/g, 'c')
    .replace(/ß/g, 'ss');
}

function fuzzyMatch(text, query) {
  if (!query) return true;
  const normText = normalize(text);
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return words.every(w => normText.includes(w));  // alle Wörter müssen vorkommen
}
```

**Keyboard-Shortcuts:** `/` fokussiert Suche, `Escape` leert sie.

### 3. Kategorie-Filter

```javascript
// js/map.js – Chips werden dynamisch aus DATA erzeugt
function buildCategoryChips() {
  container.innerHTML = `<button class="cat-chip active" data-cat="alle">Alle</button>`
    + DATA.map(c => `<button class="cat-chip" data-cat="${c.key}">${c.emoji} ${c.title.split('/')[0].trim()}</button>`).join('');
}

// Filterlogik: Kategorie UND Standort gleichzeitig
function filterAll() {
  document.querySelectorAll('.org-card').forEach(card => {
    const matchQ = fuzzyMatch(text, q);
    const matchL = activeLocs.length === 0 || activeLocs.some(l => loc.includes(l));
    card.style.display = (matchQ && matchL) ? '' : 'none';
  });
  document.querySelectorAll('.category').forEach(sec => {
    const catMatch = activeCats.length === 0 || activeCats.includes(sec.dataset.cat);
    if (!catMatch) { sec.style.display = 'none'; return; }
    sec.style.display = sec.querySelectorAll('.org-card:not([style*="display: none"])').length ? '' : 'none';
  });
}
```

### 4. Authentifizierung (Supabase)

```javascript
// js/auth.js
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// E-Mail + Passwort
async function handleAuthSubmit(e) {
  if (authMode === 'login') {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  } else {
    const { error } = await supabaseClient.auth.signUp({ email, password });
  }
}

// Google OAuth
async function handleGoogleLogin() {
  await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
}

// Auth-State-Change → Sync Favoriten + Profil
supabaseClient.auth.onAuthStateChange((event, session) => {
  currentUser = session?.user || null;
  if (event === 'SIGNED_IN') {
    syncFavoritesOnLogin();
    syncProfileOnLogin();
  }
  if (event === 'SIGNED_OUT') { renderAll(); }
});
```

**13 deutsche Fehlermeldungen:**
```javascript
const AUTH_ERRORS = {
  'Invalid login credentials': 'E-Mail oder Passwort falsch.',
  'User already registered': 'Diese E-Mail ist bereits registriert.',
  'Email rate limit exceeded': 'Zu viele Versuche – bitte warte einen Moment.',
  // ... 10 weitere
};
```

### 5. Profil-System

```javascript
// js/profile.js – Datenstruktur
{
  education: "master",
  field_of_study: "Gesundheitsökonomie",
  experience: "5-10",
  desired_regions: ["BE", "ZH"],
  workload_min: 80, workload_max: 100,
  languages: { de: "muttersprachlich", fr: "fliessend" },
  keywords: "Tarifwesen, Datenanalyse",
  exclusions: ["klinisch"],
  start_date: "sofort",
  updated_at: "2026-04-08T..."
}
```

**Pensum-Validierung** (min kann max nicht übersteigen):
```javascript
function constrainPensum(which, val) {
  if (which === 'min' && minVal > maxVal) { maxVal = minVal; maxEl.value = maxVal; }
  if (which === 'max' && maxVal < minVal) { minVal = maxVal; minEl.value = minVal; }
}
```

### 6. Dokument-Upload (CV + Arbeitszeugnisse)

```javascript
// js/profile.js – Multi-Dokument-Support
// Max: 1 CV + 5 Arbeitszeugnisse
async function handleDocUpload(file) {
  const formData = new FormData();
  formData.append('cv', file);
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/parse-cv`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_KEY },
    body: formData
  });
  // Response: { doc_type, person_name, summary, key_skills, raw_text, ... }
}
```

**Edge Function (parse-cv)** – PDF-Text-Extraktion + Claude-Klassifikation:
```typescript
// supabase/functions/parse-cv/index.ts
// 1. PDF-Text extrahieren (BT/ET Regex)
// 2. Claude klassifiziert: "cv" | "zeugnis" | "andere"
// 3. Extrahiert: Name, Zusammenfassung, Skills, Arbeitgeber, Zitate
// 4. Speichert in cv_uploads + Supabase Storage
```

### 7. KI-Matching (Kernfunktion)

**Frontend → Edge Function → Claude → Ergebnisse**

```javascript
// js/matching.js
async function startMatching() {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/match-jobs`, {
    method: 'POST',
    body: JSON.stringify({
      profile: getProfile(),
      orgs: selectedOrgs.map(o => ({ id: o.id, name: o.name, jobs: o.jobs, loc: o.loc })),
      documents: getDocuments()
        .filter(d => d.raw_text)
        .map(d => ({ doc_type: d.doc_type, raw_text: d.raw_text, employer: d.employer, period: d.period }))
    })
  });
}
```

**Edge Function – Ablauf:**
```typescript
// supabase/functions/match-jobs/index.ts
// 1. Auth-Check + Rate-Limit (5/Stunde)
// 2. Karriereseiten PARALLEL fetchen (max 10 Orgs, 8s Timeout, 3.5k chars/Org)
// 3. Cache prüfen (job_cache Tabelle, 24h TTL)
// 4. Claude-Prompt zusammenbauen:
//    - Profil-Präferenzen (buildProfileText)
//    - CV + Arbeitszeugnisse (buildDocumentsText)
//    - Karriereseiten-Inhalte
// 5. Claude antwortet mit JSON: matches[], summary, tips
```

**Claude-Prompt-Aufbau:**
```
PROFIL DES STELLENSUCHENDEN (Präferenzen):
Ausbildung: master
Pensum: 80% – 100%
Sprachen: DE: muttersprachlich, FR: fliessend
...

LEBENSLAUF:
[CV raw_text, max 4000 Zeichen]

ARBEITSZEUGNISSE:
--- santésuisse (2018–2023) ---
[Zeugnis-Text, max 2000 Zeichen]

KARRIERESEITEN-INHALTE:
--- 1. Insel Gruppe (https://jobs.inselgruppe.ch) ---
[Karriereseite-Text, max 3500 Zeichen]
```

**Match-Ergebnis-Struktur:**
```json
{
  "matches": [{
    "title": "Projektleiter/in Tarifwesen",
    "organization": "santésuisse",
    "url": "https://...",
    "score": 4,
    "reason": "Erfahrung im Tarifwesen passt perfekt",
    "highlights": ["5+ Jahre Erfahrung", "Region Bern"],
    "concerns": ["Evtl. Überqualifiziert"],
    "pensum": "80–100%",
    "location": "Bern",
    "languages": "DE (fliessend), FR (Grundkenntnisse)",
    "salary_hint": "Lohnklasse 18–22",
    "deadline": "30.04.2026"
  }],
  "summary": "3 passende Stellen im Tarifbereich gefunden.",
  "tips": "Auch bei Versicherungen nach Tarifpositionen suchen."
}
```

**Match-Card-Rendering mit Score-Differenzierung:**
```javascript
const scoreClass = m.score >= 4 ? 'match-score-high'   // grüner Rand
                 : m.score >= 3 ? 'match-score-mid'    // blauer Rand
                 : 'match-score-low';                    // grauer Rand

// Badges für neue Felder
if (m.pensum) badges.push(`<span class="match-badge match-badge-pensum">⏱ ${m.pensum}</span>`);
if (m.location) badges.push(`<span class="match-badge match-badge-loc">📍 ${m.location}</span>`);
if (m.languages) badges.push(`<span class="match-badge match-badge-lang">🌐 ${m.languages}</span>`);
if (m.salary_hint) badges.push(`<span class="match-badge match-badge-salary">💰 ${m.salary_hint}</span>`);
if (m.deadline) badges.push(`<span class="match-badge match-badge-deadline">📅 bis ${m.deadline}</span>`);
```

### 8. Bewerbungsschreiben-Generator

```javascript
// js/matching.js – Jede Match-Card hat einen Button
<button class="match-apply-btn" onclick="openCoverLetterForMatch(${i})">
  ✍️ Bewerbung
</button>
```

**Edge Function:**
```typescript
// supabase/functions/generate-cover-letter/index.ts
// Input: cv_text, person_name, zeugnisse[], job, language ("de"|"fr")
// Claude generiert fertigen Schweizer Geschäftsbrief:
//   - Name + Datum direkt eingesetzt (keine Platzhalter)
//   - Arbeitszeugnisse als Hintergrundwissen (nicht zitiert)
//   - Schweizer Hochdeutsch (kein ß)
//   - Optional Französisch für Westschweiz-Stellen
```

**Cover-Letter-Modal:**
```javascript
// Kopieren, Download als .txt oder .html (druckbar)
function copyCoverLetter() {
  navigator.clipboard.writeText(editor.value);
}
function downloadCoverLetterHtml() {
  // Generiert standalone HTML mit Times New Roman, @media print
  const html = `<!DOCTYPE html>
    <html><head><style>
      body{font-family:'Times New Roman';max-width:680px;margin:50px auto;line-height:1.7;font-size:12pt;}
      @media print{body{margin:20mm;padding:0;}}
    </style></head><body>${text}</body></html>`;
}
```

### 9. Community-Vorschläge

```javascript
// js/community.js
async function submitOrg(e) {
  await supabaseClient.from('community_orgs').insert({
    submitted_by: currentUser.id,
    name, url: website, description: desc, category: cat,
    canton, city, org_type: type, approved: false
  });
}
// Genehmigte Orgs werden in separater Sektion angezeigt
```

### 10. Dark Mode

```javascript
// js/app.js
const isDark = localStorage.getItem('darkMode') === '1';
document.body.classList.toggle('dark', isDark);
themeBtn.addEventListener('click', () => {
  const dark = document.body.classList.toggle('dark');
  localStorage.setItem('darkMode', dark ? '1' : '0');
});
```

```css
/* css/styles.css – CSS Custom Properties */
:root { --bg:#f4f7fb; --card:#fff; --text:#1a2332; --accent:#0b83d9; }
body.dark { --bg:#12151a; --card:#1c2029; --text:#e2e6ed; --accent:#5ab0ff; }
```

### 11. Favoriten-Sync (Local ↔ Supabase)

```javascript
// js/auth.js – Bidirektionaler Merge bei Login
async function syncFavoritesOnLogin() {
  const localFavs = JSON.parse(localStorage.getItem('favOrgs') || '[]');
  const { data: remoteFavs } = await supabase.from('favorites')
    .select('org_id').eq('user_id', user.id);
  // Merge: Union beider Sets
  const merged = [...new Set([...localFavs, ...remoteFavs.map(r => r.org_id)])];
  localStorage.setItem('favOrgs', JSON.stringify(merged));
}
```

### 12. XSS-Schutz

```javascript
// js/app.js – Zentrale Escape-Funktion, überall verwendet
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
```

---

## Rate Limits

| Aktion | Limit | Zeitraum |
|--------|-------|----------|
| KI-Matching | 5 Anfragen | pro Stunde |
| Bewerbungsschreiben | 15 Aktionen (total) | pro Tag |
| Dokument-Upload | 5 Dokumente | pro Tag |

---

## Responsive Design

| Breakpoint | Verhalten |
|------------|-----------|
| `≤400px` | Kleine Header-Buttons, kompakte Auth |
| `≤500px` | Sprach-Grid 1 Spalte |
| `≤600px` | SVG-Karte → Canton-Chips, E-Mail ausgeblendet |
| `≤700px` | Card-Grid 1 Spalte, Stats vertikal |
| `≤768px` | iOS Zoom-Fix (font-size 16px auf Inputs) |
| `≥900px` | Card-Grid 3 Spalten |
| `≥1100px` | Max-Width 1200px |

---

## Accessibility

- `aria-label` auf Profil-Button, Theme-Toggle, Favoriten-Sterne
- `role="button"` + `tabindex="0"` auf Stern-Favoriten
- Keyboard: Enter/Space toggled Favoriten, `/` fokussiert Suche, `Escape` leert Suche
- `:focus-visible` Outlines auf allen interaktiven Elementen
- `touch-action: manipulation` auf SVG-Bubbles (kein iOS 300ms Delay)

---

## Deployment

```bash
# Edge Functions deployen
supabase functions deploy match-jobs
supabase functions deploy parse-cv
supabase functions deploy generate-cover-letter

# Secrets setzen
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# Storage Bucket erstellen
# → Supabase Dashboard: Storage → "cv-uploads" Bucket erstellen

# Schema ausführen
# → Supabase Dashboard: SQL Editor → schema.sql einfügen und ausführen
```
