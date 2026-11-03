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

## 5. Öffentlichen Jobfeed aktivieren

Nach Übernahme des Workflows auf den Hauptbranch `Refresh public job feed` in GitHub Actions starten bzw. den ersten geplanten Lauf prüfen. Seine Entwicklungsbranch-Läufe erzeugen nur Artefakte; die regelmässige Datenveröffentlichung nach `job-feed-data` erfolgt ausschliesslich vom Hauptbranch. Der Workflow benötigt die normale Schreibberechtigung für Repository-Inhalte, keine Supabase- oder KI-Secrets. Den Quellenstatus aller 85 Organisationen kontrollieren und zwei echte Inserate gegen ihre Originale prüfen. Fehlende Portalzugänge sind keine leeren Stellenlisten.

**Einmaliger erster Datenstand vor dem App-Rollout:** Der separate Workflow `Bootstrap public job feed once` startet ausschliesslich durch einen Push des geprüften Codes auf `codex/job-feed-bootstrap-20260924`. Der reguläre Workflow ignoriert diesen Branch und startet deshalb keinen zusätzlichen Abruf. Der Bootstrap darf nur den noch nicht vorhandenen Datenbranch anlegen und prüft dessen Abwesenheit vor dem Abruf sowie unmittelbar vor dem Push erneut. Ein vorhandener Datenbranch wird nicht überschrieben. Regressionstests, ein frischer Browser-gestützter Abruf aller 85 Quellen, vollständige Quelldateien ohne ungeprüfte Quellen und `node scripts/browser-smoke.mjs --require-feed` müssen erfolgreich sein, bevor ausschliesslich `data/job-feed/*.json` veröffentlicht wird. Der Browser-Prüfbericht muss den echten Feed mit passender Quellen- und Stellenzahl bestätigen; lokale Testdaten erfüllen dieses Gate nicht. Feed, Screenshots und Prüfbericht werden als Actions-Artefakt gespeichert. Anschliessend die Datenadresse aus `docs/JOBFEED.md` auf gültiges JSON prüfen.

Der Bootstrap veröffentlicht keinen Anwendungscode, führt keine Supabase-Schritte aus und aktiviert noch keinen Zeitplan. Die regelmässige Aktualisierung setzt weiterhin die spätere Übernahme des regulären Workflows auf den Hauptbranch voraus. Die Freigabe der Gesamtanwendung bleibt an die vorstehenden Backend- und Konto-Prüfungen gebunden.

Die dokumentierte Wiederholung am 24. September übernimmt ausschliesslich das per SHA-256, Commit und erfolgreichen Crawl-Schritten verifizierte Artefakt des ersten Laufs. Sein Alter ist auf 48 Stunden begrenzt. Inventar- und Browserprüfung müssen im neuen Lauf erneut erfolgreich sein; der vorherige fehlgeschlagene Browserbericht wird nicht wiederverwendet. Nach erfolgreichem Bootstrap lässt sich dieser Einmalworkflow nicht zur Aktualisierung eines bestehenden Datenbranches verwenden.

Betrieb und Datenadresse: [docs/JOBFEED.md](docs/JOBFEED.md).

## 6. Frontend veröffentlichen

Nach erfolgreicher Testabnahme dieselbe Migration und dieselben Functions im Produktionsprojekt installieren, dann die statischen Dateien über das bestehende Hosting veröffentlichen. Falls GitHub Pages direkt aus `main` veröffentlicht, diese Reihenfolge vor dem Merge koordinieren. Eine kurze Suche, das erneute Speichern eines Profils und das erneute Laden eines Entwurfs nach dem Rollout kontrollieren.

Bei einem Problem die Daten und Migration erhalten. Einen Frontend-Rollback nur zusammen mit der Kompatibilität seiner Favoriten-/Dokument-Schreibzugriffe beurteilen; das alte Frontend verwendet noch direkte Schreibzugriffe, die die neue Migration absichtlich ersetzt. Neue Tabellen oder bestehende Nutzerdateien nicht zur Fehlerbehebung löschen.

## 7. E-Mail-Jobalarme (optional)

Auch hier gilt: **Ein Commit oder Push deployt nichts.** Migration, Function, Secrets und Resend-Domain müssen manuell eingerichtet werden. Ohne GitHub-Secrets endet der Workflow `Send e-mail job alerts` mit einem Hinweis und Erfolg, ohne etwas zu versenden.

1. **Migration:** `supabase/migrations/202611030001_job_alerts.sql` im SQL Editor ausführen (bestehende Installation) bzw. ist bei Neuinstallationen bereits am Ende von `supabase/schema.sql` enthalten (danach `supabase migration repair 202611030001 --status applied`, falls die CLI verwendet wird). Danach müssen `public.job_alerts`, `private.job_alert_deliveries` und die RPCs `unsubscribe_job_alert`, `claim_due_job_alerts`, `job_alert_delivered_ids`, `record_job_alert_delivery` existieren.
2. **Resend:** Konto bei [resend.com](https://resend.com) anlegen, unter *Domains* die Absenderdomain (z. B. `mail.example.ch`) hinzufügen und die angezeigten DNS-Einträge (SPF/TXT, DKIM/CNAME bzw. TXT, empfohlen zusätzlich DMARC `_dmarc` TXT) beim DNS-Anbieter setzen, bis die Domain als *verified* gilt. Einen API-Key mit Berechtigung *Sending access* erstellen. Ohne verifizierte Domain stellt Resend nur an die eigene Kontoadresse zu.
3. **Function-Secrets** (Dashboard → Edge Functions → Secrets oder `supabase secrets set --project-ref PROJECT_REF NAME=wert`):

   | Secret | Inhalt |
   |---|---|
   | `JOB_ALERTS_CRON_SECRET` | Zufallswert, mindestens 16 Zeichen, z. B. `openssl rand -hex 32` |
   | `RESEND_API_KEY` | Resend-API-Key |
   | `ALERTS_FROM_EMAIL` | Absender auf der verifizierten Domain, z. B. `Gesundheitsjobs <alarm@mail.example.ch>` |
   | `SITE_URL` | Öffentliche Adresse der Website ohne `#`, z. B. `https://salmonplnk.github.io/Jobs-Gesundheitsoekonomie-politik-management` |
   | `JOB_FEED_INDEX_URL` | optional; Standard ist die `raw.githubusercontent.com`-Adresse des Branches `job-feed-data` |
   | `JOB_ALERTS_MAX_PER_RUN` | optional; Alarme pro Aufruf (Standard 50, max. 200) |
   | `JOB_ALERTS_MAX_JOBS_PER_MAIL` | optional; Stellen pro Mail (Standard 25, Rest als «und N weitere») |

   `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` stellt Supabase selbst bereit.
4. **Function deployen** – ohne JWT-Prüfung durch Supabase, weil der Aufruf über `x-cron-secret` geschützt ist:

   ```bash
   supabase functions deploy send-job-alerts --project-ref PROJECT_REF --no-verify-jwt
   ```

5. **GitHub-Secrets** (Repository → Settings → Secrets and variables → Actions): `SUPABASE_FUNCTIONS_URL` = `https://PROJECT_REF.supabase.co/functions/v1` und `JOB_ALERTS_CRON_SECRET` = derselbe Wert wie in Supabase. Der Zeitplan (`47 5 * * *`, 30 Minuten nach dem morgendlichen Feed-Lauf) wird erst auf dem Hauptbranch aktiv.
6. **Abnahme:** Workflow manuell mit `dry_run` starten – er zählt passende neue Stellen (`would_send`), ohne zu senden oder Alarme zu beanspruchen. Danach mit einem Testkonto einen Alarm anlegen, `last_sent_at` im SQL Editor testweise zurücksetzen, einen echten Lauf starten und prüfen: Betreff, Links zu den Originalinseraten, Abmeldelink (deaktiviert den Alarm ohne Login), keine zweite Mail bei erneutem Lauf, keine Mail ohne neue Stellen. Ein zweites Konto darf fremde Alarme weder lesen noch ändern; mehr als zehn Alarme werden abgewiesen.

Direkter Testaufruf:

```bash
curl -sS -X POST "https://PROJECT_REF.supabase.co/functions/v1/send-job-alerts" \
  -H "x-cron-secret: $JOB_ALERTS_CRON_SECRET" -H 'Content-Type: application/json' \
  --data '{"dry_run": true}'
```

Hinweis: Die Mails enthalten einen `List-Unsubscribe`-Header mit dem Website-Link. Ein RFC-8058-One-Click-Endpunkt (`List-Unsubscribe-Post`) ist nicht eingerichtet; bei grösserem Versandvolumen an Gmail/Yahoo nachrüsten.
