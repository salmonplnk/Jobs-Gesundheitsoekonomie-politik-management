# Schweizer Gesundheits-Jobs

Stellen suchen, die Passung zum eigenen Profil prüfen und Bewerbungen organisieren: eine statische Web-App für Gesundheitsökonomie, Gesundheitspolitik und Management in der Schweiz. HTML, CSS und JavaScript im Browser; Supabase übernimmt Anmeldung, private Daten, Dokumente und vier Edge Functions. Dokumentanalyse, optionale KI-Einschätzungen einzelner Stellen mit CV-Belegen und Anschreiben nutzen Anthropic; der gewichtete Kriterienvergleich erfolgt nachvollziehbar im Browser.

## Funktionen

- Öffentlicher Jobfeed ohne Anmeldung: Fachfilter für Gesundheitsökonomie, Politik, Public Health, Gesundheitsmanagement und Gesundheitsdaten. Alle 85 Katalogquellen erhalten einen eigenen Abrufstatus; passende Stellen durchsuchen und bei Bedarf in die persönliche Arbeitsfläche übernehmen.

- Arbeitgeber auf einer geografischen Schweizer Karte oder in der mobilen Standortliste auswählen. Suchtext und Kategorien grenzen die Auswahl ein; gefilterte Arbeitgeber direkt in den Suchdialog übernehmen und als Favoriten speichern.
- Einzelne Stellen mit Direktlink, Inseratstext und verfügbaren Angaben zu Pensum, Ort und Frist durchsuchen und vergleichen.
- Suchprofile mit eigenen Kriterien und Arbeitgebern speichern; Anforderungen als zwingend oder bevorzugt gewichten.
- Für eine einzelne Stelle eine zusätzliche KI-Einschätzung mit Belegen aus Inserat und CV anfordern.
- Ergebnisse filtern und sortieren; neue, geänderte und bereits angesehene Stellen unterscheiden.
- Die Suchabdeckung pro Arbeitgeber sehen: erfolgreich, unvollständig, fehlgeschlagen oder noch ungeprüft. Grössere Auswahlen werden in Paketen abgearbeitet.
- Bewerbungen mit Status, Notizen, Kontakt und nächstem Schritt verwalten.
- Anschreiben auf Deutsch oder Französisch erstellen, bearbeiten und als Versionen je Stelle speichern; Export als TXT, HTML und DOCX sowie PDF über den Druckdialog.
- CV und bis zu fünf weitere Dokumente im privaten Benutzerkonto verwalten.

Der Feed-Workflow ist für zwei Aktualisierungen täglich vorbereitet; der Zeitplan wird erst mit seiner Übernahme auf den Hauptbranch aktiv. Der getrennt veröffentlichte Datenstand kann bereits geladen werden. Persönliche Suchläufe bleiben zusätzlich auf Anforderung möglich. Es gibt keinen automatischen E-Mail-Versand. Dynamische oder geschützte Karriereseiten lassen sich teilweise nicht vollständig auslesen; die Oberfläche weist dies aus. Fachliche Passung und technische Quellenabdeckung werden getrennt gezählt. Ein fehlgeschlagener oder unvollständiger Abruf schliesst keine gespeicherten Stellen.

## Lokal öffnen

Im Repository-Verzeichnis einen statischen HTTP-Server starten:

```bash
python3 -m http.server 8080
```

Danach `http://localhost:8080` öffnen. Es ist kein Frontend-Build nötig. Anmeldung, Stellensuche, Dokumentanalyse, Anschreiben und Synchronisierung benötigen eine konfigurierte Supabase-Instanz und Internetzugang. Die Supabase-Bibliothek wird über CDN geladen. DOCX-Dateien entstehen lokal im Browser; für PDF wird die Druckansicht geöffnet.

Details zu Quellen, Abruf, Datenveröffentlichung und Betrieb stehen in [docs/JOBFEED.md](docs/JOBFEED.md). Der öffentliche Feed benötigt kein Supabase-Konto und keinen KI-Schlüssel.

## Supabase einrichten

1. Bei einer neuen Supabase-Instanz `supabase/schema.sql` im SQL Editor ausführen. Bei einer bestehenden Installation nur `supabase/migrations/202609220001_job_workspace.sql` ausführen; keine Tabellen löschen.
2. In `js/auth.js` `SUPABASE_URL` und den öffentlichen Publishable-/Anon-Key des eigenen Projekts eintragen. Niemals einen Service-Role- oder Anthropic-Key in Frontend-Dateien setzen.
3. Unter Supabase Authentication die produktive Site-URL und erlaubte Redirect-URLs setzen; für die lokale Entwicklung `http://localhost:8080` ergänzen. Optional Google als Auth-Provider konfigurieren.
4. `ANTHROPIC_API_KEY` als Supabase Edge Function Secret hinterlegen und `match-jobs`, `parse-cv`, `assess-job` sowie `generate-cover-letter` deployen.
5. Datenzugriffe, Uploads, Konfliktbehandlung und eine echte Suche zunächst in einer Testinstanz prüfen.

Die Migration erstellt den privaten Storage-Bucket `cv-uploads`, die dauerhafte Arbeitsfläche und ihre RPCs. Die vollständige Reihenfolge und Abnahmefälle stehen in [DEPLOYMENT.md](DEPLOYMENT.md). Ein Code-Commit führt die SQL-Migration oder das Deployment der Edge Functions **nicht** aus.

## Prüfen

```bash
npm ci --ignore-scripts
npm test
```

Der GitHub-Workflow prüft zusätzlich die Syntax aller Browser-JavaScript-Dateien und den Organisationskatalog. Er benötigt keine API-Secrets und verändert keine Stellen- oder Nutzerdaten. Datenbank-RLS, echte Authentifizierung und Anbieteraufrufe müssen separat in Supabase getestet werden.

## Aufbau

| Pfad | Zweck |
|---|---|
| `index.html`, `css/styles.css` | Oberfläche und Darstellung |
| `js/` | Arbeitgeberkatalog, Auth, Profil, Suche und persönliche Arbeitsfläche |
| `js/map-geography.js`, `css/map.css` | Lokale Kartengeometrie, Ortsanker und Darstellung; [Quellen](data/map-geography-source.md) |
| `js/feed.js`, `css/feed.css` | Öffentlicher Jobfeed mit Quellenstatus und Übernahme einzelner Inserate |
| `scripts/job-feed.mjs`, `scripts/feed-network.mjs` | Regelmässiger Abruf und begrenzter öffentlicher Netzwerkzugriff |
| `data/job-source-overrides.json` | Verifizierte Portaladressen und Abteilungsfilter |
| `data/organizations.json` | Organisationsdaten für die serverseitige Quellenauswahl |
| `supabase/functions/` | Stellensuche, Dokumentanalyse und Anschreiben |
| `supabase/schema.sql` | Vollständiges Schema für eine neue Installation |
| `supabase/migrations/` | Updates bestehender Installationen |
| `tests/` | Regressionstests ohne produktive API-Aufrufe |

Details zu Persistenz, Schnittstellen und Grenzen: [DOKUMENTATION.md](DOKUMENTATION.md).
