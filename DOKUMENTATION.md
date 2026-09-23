# Technische Dokumentation

## Architektur

Die App wird als statische Website ausgeliefert. Browser-JavaScript nutzt Supabase Auth, PostgREST/RPC und Storage. Die Edge Functions authentifizieren die Benutzer. Die Stellensuche liest freigegebene Quellen aus; Dokumentanalyse, optionale KI-Einschätzungen einzelner Stellen und Anschreiben führen Anthropic-Anfragen aus. Die Erfüllung gewichteter Kriterien wird direkt im Browser berechnet. Eine zusätzlich angeforderte KI-Einschätzung ergänzt diesen Vergleich mit Profil- und CV-Belegen; sie verändert den deterministischen Kriterienwert nicht. Der Service-Role-Key bleibt ausschliesslich im Backend; er wird für den gemeinsamen Quellencache benötigt.

| Modul | Verantwortung |
|---|---|
| `js/app.js`, `js/map.js` | Organisationskatalog, Karte, Suche und Favoriten |
| `js/auth.js` | Authentifizierung, Benutzerwechsel und Synchronisierung |
| `js/profile.js` | Profil und persönliche Dokumente |
| `js/matching.js` | Anschluss der neuen Arbeitsfläche an die bestehende Oberfläche |
| `js/job-core.js` | Stellenidentität, Änderungserkennung, Filter und deterministischer Kriterienvergleich |
| `js/workspace.js` | Stellensuche, Suchprofile, Vergleich, Bewerbungen und Cloud-Synchronisierung |
| `js/letters.js` | Anschreiben, Entwurfsversionen und Exporte |
| `supabase/functions/match-jobs/` | Quellenauslesung, Stellenextraktion, Cache und Suchabdeckung |
| `supabase/functions/parse-cv/` | PDF-Analyse und überprüftes Speichern der Dokumente |
| `supabase/functions/assess-job/` | Optionale KI-Einschätzung einer Stelle anhand Profil, CV und belegbarer Inseratsangaben |
| `supabase/functions/generate-cover-letter/` | Anschreiben anhand Inserat und bereitgestellter Erfahrungen |

## Arbeitgeberkarte

Die Schweizer Landesform (Natural Earth) und 16 Ortsanker (© swisstopo) liegen in `js/map-geography.js`. Es werden keine externen Karten-APIs geladen. Beide verwenden dieselbe Projektion; nur die mit Linien verbundenen Beschriftungen sind zur Lesbarkeit verschoben. [Herkunft, Lizenz und Projektionsformel](data/map-geography-source.md).

`getFilteredOrganizations()` in `js/map.js` ist die gemeinsame Grundlage für Verzeichnis, Favoritenanzeige und Übergabe an `HealthJobs.openEmployerSelection(ids)`. Eine leere Standortauswahl bedeutet alle Standorte. Marker- und Listenzahlen berücksichtigen Suchtext und Kategorien; die Ergebniszeile berücksichtigt zusätzlich die Standortauswahl. Die Zahlen stehen für Organisationen, nicht für offene Stellen. Von 85 Verzeichniseinträgen haben 81 eine hinterlegte Stellenportal-URL. Favoriten-Duplikate werden nie mitgezählt.

«Westschweiz» bleibt der vorhandene Sammelfilter mit acht Organisationen und erhält keinen einzelnen Stadtpunkt. Neuenburg mit zwei Organisationen ist separat. Community-Vorschläge stehen in einem ausdrücklich als ungefiltert gekennzeichneten Abschnitt und werden nicht in die Suchauswahl übernommen.

Bis 600 Pixel startet die Ansicht mit einer Standortliste; die Karte bleibt über einen Umschalter zugänglich und horizontal scrollbar. Standortmarker sind auch per Enter/Leertaste bedienbar. Einzelne Standortchips oder alle Filter lassen sich entfernen. Der Arbeitgeberbutton öffnet eine vorausgewählte Liste; erst deren Bestätigung startet einen Suchlauf. Das Schliessen des Dialogs ändert keine gespeicherte Auswahl. Bei bereits laufender Suche werden ein Hinweis und der Pausieren-Button im Workspace fokussiert.

## Dauerhafte Daten

| Tabelle | Inhalt | Benutzerzugriff |
|---|---|---|
| `profiles` | Ausbildung, Erfahrung, Regionen, Pensum und weitere Präferenzen | Eigenes Profil lesen/schreiben |
| `favorites` | Ausgewählte Arbeitgeber | Eigene lesen; atomarer Ersatz via RPC |
| `job_workspaces` | Stellen, Suchprofile, Bewerbungen, Entwürfe, Quellenstatus und Verlauf | Eigene lesen; revisionsgeprüfter Ersatz via RPC |
| `cv_uploads` | Metadaten und extrahierte Inhalte der eigenen Dokumente | Eigene lesen/löschen; Registrierung via RPC |
| `job_cache` | Profilunabhängige Stellen- und Quellendaten mit Ablaufdatum | Lesen; schreiben nur Service Role |
| `search_logs` | Eigene Suchereignisse und Ergebniszahlen | Eigene lesen/einfügen |
| `community_orgs`, `community_categories` | Organisations- und Kategorievorschläge | Genehmigte oder eigene lesen; eigene einreichen |
| `private.job_quotas` | Verbrauch pro Benutzer und Aktion | Kein direkter Benutzerzugriff |

`job_workspaces.data` ist ein JSON-Objekt mit den Bereichen `jobs`, `searchProfiles`, `applications`, `drafts`, `sources` und `runs` sowie Kriterien, Filter und eine fortsetzbare Suchwarteschlange. Die Arbeitsfläche wird als Ganzes gespeichert. Browserdaten sind benutzerbezogen; der Cloud-Stand wird bei der Anmeldung geladen. Fehlgeschlagene Speicherungen dürfen nicht als erfolgreich angezeigt werden. Bei einem neueren Cloud-Stand verhindert die Revision ein stilles Überschreiben.

Bestehende Profile, Favoriten und Dokumente werden durch die Migration erhalten. Historische Daten mit unbekannten Feldern bleiben gespeichert. Die Dateien in `cv-uploads` sind privat und liegen unter `cvs/<auth.uid()>/<Dateiname>`.

## RPC-Verträge

### `save_job_workspace(payload jsonb, expected_revision bigint)`

Nur für authentifizierte Aufrufer. Die Benutzer-ID stammt aus `auth.uid()` und ist kein übergebbarer Parameter. Der erste Schreibvorgang erwartet Revision `0` und erzeugt Revision `1`. Jeder erfolgreiche Schreibvorgang erhöht die Revision um eins und liefert ein einzelnes JSON-Objekt:

```json
{
  "data": {"jobs": {}, "searchProfiles": []},
  "revision": 1,
  "updated_at": "2026-09-22T12:00:00+00:00"
}
```

Ein veralteter Schreibversuch endet mit SQLSTATE `40001` und Meldung `WORKSPACE_CONFLICT`; weder die bestehenden Daten noch die lokale, noch nicht gespeicherte Arbeit sollen dadurch verloren gehen. Ein erneutes Speichern muss vom aktuellen Cloud-Stand ausgehen. Direkte INSERT-, UPDATE- und DELETE-Rechte auf der Tabelle fehlen für Browser-Clients.

### `replace_favorites(org_ids text[])`

Ersetzt die eigenen Favoriten in einer Transaktion. Leere Einträge werden entfernt, IDs bereinigt und dedupliziert. Gleichzeitige Aufrufe desselben Benutzers werden serialisiert. Bereits vorhandene Favoriten behalten ihr ursprüngliches Erstellungsdatum. Rückgabe: `{"org_ids":["bag","usz"]}`. Ein leeres Array entfernt die eigenen Favoriten.

### `register_cv_upload(file_name text, storage_path text, extracted_profile jsonb)`

Voraussetzung: Die PDF-Datei wurde erfolgreich in den privaten Bucket hochgeladen. Die Funktion prüft Pfad, Existenz und Eigentümerschaft; `extracted_profile.doc_type` ist `cv`, `zeugnis` oder `andere`. Maximal ein CV und fünf weitere Dokumente sind erlaubt. Ein neues CV ersetzt die alten CV-Metadaten atomar. Rückgabe: der gespeicherte `cv_uploads`-Datensatz samt `replaced_storage_paths` als Array. Erst nach erfolgreicher Registrierung bereinigt das Backend die alten Dateien. Ein Fehler vor der Registrierung lässt das bisherige CV unverändert.

### `consume_job_quota(action_name text, max_requests integer, window_seconds integer)`

Reserviert atomar einen Aufruf und liefert `true` oder bei erschöpftem Kontingent `false`. Die beiden Zahlenparameter gehören zum Aufrufvertrag; die Datenbank ignoriert ihren Inhalt und erzwingt diese festen Regeln:

| Aktion | Aufrufe pro Stunde und Benutzer |
|---|---:|
| `match-jobs` | 60 |
| `generate-cover-letter` | 10 |
| `parse-cv` | 10 |
| `assess-job` | 10 |

Das Stundenfenster beginnt mit dem ersten reservierten Aufruf. Unbekannte Aktionen werden abgewiesen. Parallel eingehende Anfragen teilen denselben Zähler. Fehlgeschlagene Anbieteraufrufe verbrauchen ihre Reservierung ebenfalls. Pro Matching-Aufruf werden höchstens drei Arbeitgeber verarbeitet; eine grössere Suche nutzt mehrere Aufrufe.

## Stellen und Suchabdeckung

Die Suchoberfläche arbeitet die gesamte ausgewählte Arbeitgeberliste in Paketen ab und zeigt den tatsächlichen Fortschritt. Ein Quellenstatus dokumentiert den erfolgreichen Abruf, eine nur teilweise Auslesung oder einen Fehler. Der Cache speichert nur profilunabhängige Quellendaten; persönliche Bewertungen entstehen anhand der aktuell gewählten Kriterien im Browser.

Eine Stelle wird über ihre Quellenidentität bzw. ihren kanonischen Direktlink wiedererkannt. Änderungen werden gegenüber dem gespeicherten Inserat sichtbar. Nicht vorhandene Angaben erscheinen als unbekannt; sie werden nicht durch vermutete Löhne, Fristen oder Homeoffice-Zusagen ergänzt. Filter für verfügbare Kriterien sowie ein Vergleich von zwei bis vier Stellen unterstützen die Auswahl.

Ein fehlendes Inserat in einer Teilmenge, ein Timeout oder ein Abruffehler ist kein Schliessungsnachweis. Das Verschwinden aus einer Suche schliesst eine Stelle auch bei einem erfolgreichen Abruf nicht automatisch. Ein Schliessungsstatus wird ausdrücklich hinterlegt, etwa durch die entsprechende Aktion in den Stellendetails. Blockierte und ausschliesslich im Browser gerenderte Seiten können unvollständig bleiben; die Originalquelle ist direkt verlinkt.

Suchprofile speichern Kriterien und Arbeitgeberauswahl getrennt vom persönlichen Grundprofil. Matching-Kriterien unterscheiden erfüllt, unklar und nicht erfüllt sowie zwingend und bevorzugt. Die Kriterienpassung ist eine gewichtete Text- und Feldprüfung, keine KI-Einschätzung der beruflichen Eignung. Inserat- und CV-Textbelege werden angezeigt, sofern vorhanden; ein Texttreffer bestätigt keine vollständige Qualifikation.

Über «KI-Einschätzung mit CV» kann für eine einzelne Stelle zusätzlich eine Analyse angefordert werden. Sie verwendet das Inserat, das persönliche Profil und bereitgestellte Dokumenttexte. Angezeigte Quellenzitate müssen im jeweiligen Ausgangstext vorkommen; unbelegte Aussagen dürfen nicht als verifizierter Nachweis erscheinen. Die Einschätzung dient der persönlichen Prüfung und ergänzt die bestehenden Kriterien und Filter.

## Bewerbungen und Entwürfe

Gespeicherte Stellen können mit Bewerbungsstatus, Notizen, Datum, Kontakt und nächstem Schritt ergänzt werden. Bewerbungsentwürfe gehören zur jeweiligen Stelle, enthalten deren Inseratstext als Grundlage und werden als Versionen gespeichert. Bearbeitung, Kopieren und Exporte ermöglichen die weitere Verwendung ausserhalb der App. Der DOCX-Export erzeugt ein echtes OOXML-Dokument lokal im Browser. Für PDF öffnet die App eine Druckansicht; im Druckdialog wird «Als PDF speichern» gewählt. Diese Exporte benötigen keine zusätzlichen Bibliotheken.

Die App verschickt keine Bewerbungen. Es gibt keinen zeitgesteuerten Scraper und keine automatische Benachrichtigung. Der GitHub-Workflow führt ausschliesslich Syntax-, Daten- und Regressionstests aus.

## Installation und Betrieb

Neue Projekte verwenden `supabase/schema.sql`; bestehende Projekte die additive Migration `supabase/migrations/202609220001_job_workspace.sql`. Das vollständige Schema enthält exakt dieselbe Migration am Ende. Migration und Edge Functions müssen zusammen ausgerollt werden, bevor die neue Oberfläche produktiv verwendet wird. Siehe [DEPLOYMENT.md](DEPLOYMENT.md).

Lokale Tests prüfen die Logik ohne API-Kosten. Ein bestandener JavaScript-Testlauf bestätigt keine produktiven RLS-Policies, Storage-Berechtigungen, PDF-Auslesung durch Anthropic oder Erreichbarkeit jeder Karriereseite; dafür sind die dokumentierten Abnahmefälle in einer Supabase-Testinstanz vorgesehen.


## Öffentlicher Jobfeed

`js/feed.js` lädt einen öffentlichen kompakten Index und bei bewusster Übernahme die vollständige Quelldatei. `HealthJobs.importPublicJobs(jobs, sources)` prüft bekannte Organisationen, IDs, URLs und Zeitstempel, erhält neuere/manuelle Stellenstände und persönliche Bewerbungsnotizen. Abrufe überstehen Konto- und Aktualisierungswechsel ohne Übernahme ins falsche Konto.

Der Node-Runner in `scripts/` und der serverseitige Such-Endpunkt verwenden denselben Extraktionscode. Der regelmässige Feed wird getrennt vom Anwendungscode veröffentlicht. Beschreibung, Quellenstatus, Abdeckungsgrenzen und Betrieb: [docs/JOBFEED.md](docs/JOBFEED.md).
