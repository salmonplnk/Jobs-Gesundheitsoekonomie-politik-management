# Deployment und Abnahme

Dieses Änderungspaket enthält den Code und die SQL-Migration. **Es wurde dadurch keine Supabase-Migration ausgeführt und keine Edge Function deployt.** Der neue Frontend-Code benötigt die Migration und alle vier Functions. Ein GitHub-Push allein aktualisiert diese Backend-Bestandteile nicht.

## 1. Datenbank zuerst

Vor dem produktiven Update eine Datenbanksicherung erstellen. Die Migration ist additiv und erhält vorhandene Profile, Favoriten und Dokumente. Sie entfernt keine Nutzerdaten. Die gleichzeitige Verwendung eines alten Frontends während des Updates vermeiden: Favoriten- und Dokument-Schreibzugriffe wechseln auf RPCs.

**Bestehende Installation:** `supabase/migrations/202609220001_job_workspace.sql` vollständig im Supabase SQL Editor ausführen. Alternativ bei bereits mit der CLI verwalteter Migrationshistorie:

```bash
supabase link --project-ref PROJECT_REF
supabase db push
```

**Neue Installation:** das vollständige `supabase/schema.sql` im SQL Editor ausführen. Es enthält sowohl die Basistabellen als auch die neue Migration. Falls danach die CLI verwendet wird, die bereits ausgeführte Migration in deren Historie markieren:

```bash
supabase link --project-ref PROJECT_REF
supabase migration repair 202609220001 --status applied
```

Nicht das neue vollständige Schema als Ersatz für bestehende Tabellen einsetzen. Für vorhandene Datenbanken ist die einzelne Migration vorgesehen. Nach der Ausführung müssen `job_workspaces` und die vier RPCs `save_job_workspace`, `replace_favorites`, `register_cv_upload`, `consume_job_quota` existieren; `cv-uploads` muss privat sein.

## 2. Secrets und Auth konfigurieren

Im Supabase Dashboard unter Edge Functions → Secrets `ANTHROPIC_API_KEY` hinterlegen. Ein gültiges Anthropic-Konto mit Freigabe für das im jeweiligen Handler konfigurierte Modell ist nötig. Standardmodell ist `claude-sonnet-4-6`, überschreibbar über `ANTHROPIC_MODEL` bzw. `COVER_LETTER_MODEL` und `ASSESSMENT_MODEL`. Das bisherige `claude-sonnet-4-20250514` wurde laut [Anthropic-Modellstatus](https://platform.claude.com/docs/en/about-claude/model-deprecations) am 15.06.2026 eingestellt (geprüft am 22.09.2026). Den Schlüssel nicht in Git, Browserdateien oder Screenshots aufnehmen.

Die Functions verwenden zusätzlich die von Supabase bereitgestellten Umgebungsvariablen `SUPABASE_URL`, `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY`. Letzterer ermöglicht ausschliesslich serverseitige Cache-Schreibzugriffe. Im Frontend bleiben Projekt-URL und öffentlicher Publishable-/Anon-Key (`js/auth.js`).

Unter Authentication die Site-URL und erlaubten Redirect-URLs der Website festlegen; für lokale Entwicklung `http://localhost:8080` ergänzen. E-Mail-Bestätigung und optional Google OAuth im Testprojekt prüfen.

## 3. Alle vier Functions deployen

Vom Repository-Verzeichnis aus, nach Verknüpfung mit dem richtigen Projekt:

```bash
supabase functions deploy match-jobs --project-ref PROJECT_REF
supabase functions deploy parse-cv --project-ref PROJECT_REF
supabase functions deploy assess-job --project-ref PROJECT_REF
supabase functions deploy generate-cover-letter --project-ref PROJECT_REF
```

`PROJECT_REF` jeweils durch das konkrete Test- oder Produktionsprojekt ersetzen. Die Functions benötigen einen gültigen Benutzer-Access-Token. Keinen Service-Role-Key als Browser-Login verwenden.

## 4. Testinstanz abnehmen

Mit zwei separaten Testkonten prüfen:

1. Profil zweimal hintereinander ändern und nach Ab-/Anmeldung prüfen. Ein absichtlich fehlgeschlagener Speichervorgang zeigt einen Fehler und erhält die lokale Arbeit.
2. Favoriten hinzufügen und entfernen; danach neu anmelden. Erzwungene RPC-Fehler dürfen keine teilweise geleerte Favoritenliste erzeugen.
3. Suchprofil, Stelle, Bewerbung und Entwurf speichern und auf einem zweiten Browser desselben Kontos wieder laden. Ein anderes Konto darf diese Daten weder per Oberfläche noch direkter Tabellenabfrage lesen.
4. Zwei Browser vom selben Workspace-Stand aus öffnen. Im ersten speichern, dann im zweiten: der zweite Schreibversuch erhält `WORKSPACE_CONFLICT`; der neuere Cloud-Stand bleibt erhalten.
5. Ein Text-PDF und ein gescanntes PDF analysieren. Erfolgreiche Dokumente bleiben nach erneutem Login vorhanden. Einen neuen CV hochladen und simulierte Fehler vor Registrierung prüfen: das alte CV bleibt erhalten. Mehr als fünf weitere Dokumente werden abgewiesen.
6. CV-Dateien eines anderen Kontos über Storage nicht lesen, überschreiben oder löschen können. Öffentliche Bucket-URLs dürfen keine PDFs liefern. Bestehende Dateien unter `cvs/<Benutzer-ID>/…` bleiben für ihren Eigentümer erreichbar.
7. Mehr als zehn Arbeitgeber auswählen: alle werden abgearbeitet oder ausdrücklich als fehlgeschlagen/unvollständig angezeigt. Ein Paket darf nie stillschweigend Arbeitgeber abschneiden. Direktlinks und Inseratstexte gegen zwei Originalinserate prüfen.
8. Einen Quellenabruf scheitern lassen. Bereits gespeicherte Stellen dieser Quelle dürfen nicht als geschlossen markiert werden. Eine teilweise ausgelesene Quelle wird ebenfalls nicht als vollständige Bestandsaufnahme behandelt.
9. Filter, zwei bis vier Vergleichsstellen, Statuswechsel und Anschreiben-Versionen prüfen; DOCX öffnen und PDF mit Umlauten sowie längeren Absätzen auf Vollständigkeit prüfen. Für eine Stelle «KI-Einschätzung mit CV» anfordern, Inserat-/CV-Zitate am Ausgangstext prüfen und bestätigen, dass der gewichtete Kriterienwert unverändert bleibt.
10. Quoten mit isolierten Testkonten über die RPC prüfen: selbst übergebene höhere `max_requests` oder kleinere `window_seconds` ändern die festgelegten 60 Aufrufe für `match-jobs` sowie je 10 für `parse-cv`, `assess-job` und `generate-cover-letter` pro Stunde nicht. Unbekannte Aktionen werden abgewiesen; parallele Aufrufe überschreiten das Limit nicht.

11. Karte auf Desktop und bei 390 Pixel Breite prüfen: mobile Standortliste, optional scrollbar zugängliche Karte, Tastaturfokus, heller/dunkler Modus, Auswahl Bern + Zürich und Suchtext/Kategorie. Bern zeigt ohne weitere Filter 28 Organisationen und übernimmt 25 Arbeitgeber mit Stellenportal. Nulltreffer, Entfernen einzelner Standortchips und Reset prüfen. Übernahme öffnet den Arbeitgeberdialog; Abbrechen startet keinen Abruf.

Zusätzlich `npm ci --ignore-scripts` und danach `npm test` ausführen und die GitHub-Prüfungen bestehen lassen. Nicht produktive Kontingente für einen Lasttest verbrauchen.

## 5. Frontend veröffentlichen

Nach erfolgreicher Testabnahme dieselbe Migration und dieselben Functions im Produktionsprojekt installieren, dann die statischen Dateien über das bestehende Hosting veröffentlichen. Falls GitHub Pages direkt aus `main` veröffentlicht, diese Reihenfolge vor dem Merge koordinieren. Eine kurze Suche, das erneute Speichern eines Profils und das erneute Laden eines Entwurfs nach dem Rollout kontrollieren.

Bei einem Problem die Daten und Migration erhalten. Einen Frontend-Rollback nur zusammen mit der Kompatibilität seiner Favoriten-/Dokument-Schreibzugriffe beurteilen; das alte Frontend verwendet noch direkte Schreibzugriffe, die die neue Migration absichtlich ersetzt. Neue Tabellen oder bestehende Nutzerdateien nicht zur Fehlerbehebung löschen.
