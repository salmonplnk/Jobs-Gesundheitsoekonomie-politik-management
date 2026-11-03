# Öffentlicher Jobfeed

Der Feed steht oberhalb der persönlichen Arbeitsfläche und benötigt keine Anmeldung. Er zeigt fachlich passende Stellen mit Direktlink, Arbeitgeber, Ort, Pensum und Abrufdatum. Der gemeinsame Fachfilter prüft die vollständigen Aufgaben und Anforderungen auf Gesundheitsökonomie/HTA, Gesundheitspolitik/Tarife, Versorgungsforschung/Public Health, nichtklinisches Gesundheitsmanagement, Gesundheitsprojekte und Gesundheitsdaten. Ein Gesundheitsarbeitgeber allein genügt nicht. Klinische Versorgung, verpflichtende klinische Berufsqualifikationen, Pflege, allgemeine Verwaltung, Verkauf und fachfremder IT-Betrieb sind ausgeschlossen. Grenzfälle ohne belegten Fachbezug werden ausgeblendet. Dies ist ein Fachfilter, keine Garantie persönlicher Eignung.

Der Quellenbereich zeigt für jede der 97 Katalogorganisationen, ob der technische Abruf vollständig, teilweise oder nicht gelungen ist. Quellen mit passenden Stellen und die Zahl passender Inserate werden separat gezählt. Das Öffnen einer Originalquelle startet keine persönliche Suche und keinen KI-Aufruf.

## Ablauf

1. Der Node-Runner lädt `data/organizations.json` und die verifizierten Korrekturen in `data/job-source-overrides.json`.
2. Der gemeinsame Crawler verfolgt erlaubte Karriereseiten, eingebettete Portale, Folgeseiten und Einzelinserate. Für unterstützte Bewerberportale nutzt er deren öffentliche Stellendaten.
3. Nach Abgleich des Quellenbestands prüft er die Arbeitgeberzuordnung, ergänzt die Stellenfakten aus `js/job-facts.js` und wendet `js/job-relevance.js` auf jeden Volltext an, einschliesslich älterer übernommener Inserate. Nur passende Inserate werden mit Fachbereich und Begründung in einer JSON-Datei je Organisation und im kompakten, deduplizierten `index.json` veröffentlicht. Bei gemeinsamen Inseraten bleiben alle zugehörigen Katalogquellen in `org_ids` erhalten. Der Index trägt die Filterversion in `scope.policy_version` (aktuell 2).
4. Der Browser lädt zunächst nur den Index. Erst «Übernehmen» lädt den vollständigen Datensatz der Quelle und fügt die gewählte Stelle der persönlichen Arbeitsfläche hinzu. Vorhandene Bewerbungsnotizen, neuere Stellenstände und manuelle Beschreibungen bleiben erhalten.

Der öffentliche Datenbestand enthält ausschliesslich Informationen aus den Stellenportalen. Lebensläufe, Profile, Entwürfe, Notizen und Bewerbungsstände werden niemals in den Feed geschrieben.

## Abdeckung und Grenzen

Jede Quelle erhält einen Status: noch ungeprüft, erfolgreich, keine offenen Stellen, teilweise geprüft, nicht lesbar oder Fehler. Quellen ohne bestätigtes Stellenportal sind ausdrücklich gekennzeichnet. Erfolgreiche HTTP-Antworten allein gelten nicht als Beleg für eine vollständige Stellenliste.

Zählungen für Listen-/Detailseiten und ausstehende Seiten sowie `coverage` unterscheiden vollständige, begrenzte und ungeklärte Abrufe. `raw_job_count`, `relevant_job_count` und `filtered_out_count` trennen den Quellenbestand von passenden Stellen. Eine vollständig erfasste Quelle mit null passenden Inseraten ist keine Leermeldung des Arbeitgebers. Zeitlimits, geschützte Portale, nicht erfasste Dokument-Inserate und nicht unterstützte dynamische Seiten führen zu einem sichtbaren Hinweis. Kein CAPTCHA, Login oder sonstiger Zugangsschutz wird umgangen.

Öffentlich verlinkte PDF-Inserate werden mit Poppler vollständig als Text gelesen. Titel, Aufgaben, Anforderungen und Bewerbungshinweis müssen im Dokument belegt sein. Bildscans ohne ausreichenden Text und andere Dokumentformate bleiben als unvollständig erfasst sichtbar. Die Begrenzungen für Dateigrösse, Zeit, öffentliche Netzwerkadressen, erlaubte Hosts und robots.txt gelten auch für Dokumente.

Bei eingeschränkten oder fehlgeschlagenen Abrufen bleiben bisherige Inserate erhalten und werden als älterer Stand gekennzeichnet. Nur ein nachweislich vollständiger erfolgreicher Abruf kann fehlende Inserate schliessen. Geschlossene Inserate werden aus dem öffentlichen Index entfernt und nach 90 Tagen aus den Quelldateien gelöscht. Vor dem Schreiben gelten Grössenlimits von 24 MiB für den Index und 12 MiB pro Quelldatei. Abteilungsfilter verhindern, dass Stellen anderer Bereiche eines gemeinsamen Portals unbemerkt unter BAG, BSV oder einer Fakultät erscheinen. Der tatsächlich genannte Arbeitgeber bleibt sichtbar.

## Arbeitgeberzuordnung

Eine Quelle veröffentlicht nur Stellen der eigenen Organisation oder einer verifizierten Untereinheit. Nennt ein Inserat (`hiring_organization` bzw. `organization`) einen anderen Arbeitgeber, wird es ausgeschlossen, sobald es nicht auf einem eigenen Karrierehost der Organisation liegt (Katalog-URLs und `allowed_hosts`). Stellenbörsen wie jobs.ch, jobup.ch oder jobscout24.ch gelten nie als eigener Host. Kliniken einer Spitalgruppe oder Ämter einer Verwaltung auf deren eigenem Portal bleiben erhalten. Der Ausschluss wird in `excluded_jobs` und nach Grund in `excluded_reasons` (`scope`, `other_employer`, `department`) gezählt und im Quellenhinweis genannt. Bereits veröffentlichte fremde Inserate werden auch bei einem fehlgeschlagenen Abruf entfernt.

Auslöser war die Gemeinsame Einrichtung KVG: kvg.org verlinkt «Jetzt bewerben» in die allgemeine jobs.ch-Suche, worauf der Crawler den ganzen jobs.ch-Katalog verfolgte (145 fremde Inserate). Die Korrektur in `data/job-source-overrides.json` sperrt mit `blocked_hosts` Stellenbörsen für diese Quelle. Ausgewertet werden die eigenen PDF-Stellenausschreibungen auf kvg.org, weil jobs.ch keine verlässlich serverseitig gefilterte Firmenliste bietet.

Auch der Fachfilter (Version 2) verwendet den Status einer Gesundheitsorganisation nur noch für deren eigene Inserate. Ein Management- oder Controllingtitel eines fremden Arbeitgebers wird nicht mehr als «Management / Controlling Gesundheit» akzeptiert.

Weitere Korrekturfelder: `employer_aliases` (zusätzliche Arbeitgebernamen) und `include_terms` (Fachbereichsfilter für sehr grosse Portale). Bei Roche, Novartis, Takeda und IQVIA müssen Titel oder Beschrieb Begriffe wie Market Access, HEOR, Health Economics, Real World Evidence, Pricing/Reimbursement, HTA, Epidemiologie oder Public Health enthalten. Bei Deloitte, KPMG und EY muss ein Gesundheits- oder Life-Sciences-Bezug vorliegen. Danach entscheidet weiterhin der Fachfilter.

## Dubletten

Der Index fasst dieselbe Stelle zusammen. Das betrifft zum einen dieselbe Stellenbörsen-ID in mehreren Sprachen, etwa jobs.ch `/de/stellenangebote/detail/<uuid>`, `/fr/offres-emplois/detail/<uuid>` und `/en/vacancies/detail/<uuid>`. Sprachpräfixe und `lang`-Parameter werden ebenfalls ignoriert. Zum anderen betrifft es wiederholte Ausschreibungen mit gleichem Arbeitgeber, gleichem normalisiertem Titel und gleichem Ort. Pensum, Genderzusätze und `:in`-Formen werden dabei ignoriert. Bei langen, deutlich verschiedenen Beschrieben bleiben die Stellen getrennt. Behalten wird der neueste und vollständigste Datensatz. `org_ids` vereinigt die Quellen, `first_seen` übernimmt das früheste Datum, und `duplicate_ids` nennt die zusammengeführten IDs. Die Detaildateien je Quelle bleiben unverändert. Der Browser kann ältere Stände mit `HealthJobFacts.dedupeJobs(jobs)` aus `js/job-facts.js` ebenso bereinigen.

## Stellenfakten

`js/job-facts.js` (UMD, im Builder und im Browser nutzbar) liefert mit `extractFacts(job, org)` die folgenden Felder. Sie stehen in den Detaildateien und im Index.

| Feld | Inhalt |
| --- | --- |
| `deadline` | Bewerbungsfrist `JJJJ-MM-TT` aus «Bewerbungsfrist», «bewerben bis», «Anmeldeschluss», «date limite», «délai de postulation», «application deadline» u. a.; DE/FR/EN-Formate wie `15.11.2026`, `15. November 2026`, `1er décembre 2026`, `November 20, 2026`. Ein `validThrough` gilt nur, wenn es plausibel ist (höchstens 400 Tage nach dem Abruf). |
| `start_date` | `JJJJ-MM-TT`, `sofort` oder `nach Vereinbarung` aus «Stellenantritt», «Eintritt», «Arbeitsbeginn», «per …», «Entrée en fonction», «Start date». |
| `seniority` | `praktikum`, `trainee`, `junior`, `senior`, `lead` oder `phd` (Titelbasis; der frühere Wert `entry` wird zu `praktikum` bzw. `trainee`). «Projektleiter» ist keine Führungsstufe. |
| `salary_hint` | z. B. `Lohnklasse 23`, `Lohnklassen 20–22` oder `CHF 90'000–110'000 pro Jahr`. Bei jobs.admin.ch stammt die Lohnklasse aus dem strukturierten Attribut. |
| `salary_range` | `{min, max, currency:'CHF', period:'year'|'month'|'hour', source}`. Ausdrückliche CHF-Beträge im Inserat ergeben `source:'Inserat'`. Eine Lohnklasse bei Bundesstellen ergibt `max` = Höchstbetrag der (höchsten) Klasse, `min` bleibt `null`, `source` z. B. `Lohnklasse 23 (Bund)`. Kantonale Lohnklassen werden nicht umgerechnet. |
| `canton` | Zweistelliges Kantonskürzel aus dem Arbeitsort (z. B. Bern → `BE`, Lausanne → `VD`, Genève → `GE`); `CANTONS` enthält Kürzel → Name. Ohne Ort wird der Katalogstandort verwendet. |

Fehlende Belege bleiben `null`; es wird nichts geschätzt.

Quelle der Bundeslöhne: Eidgenössisches Personalamt EPA, [«Lohntabelle ab Januar 2026», gültig ab 01.01.2026 (Art. 36 BPV)](https://www.epa.admin.ch/dam/de/sd-web/CtDDI6rw-V4N/Lohntabelle%202026.pdf), abgerufen über [epa.admin.ch/de/lohnsystem](https://www.epa.admin.ch/de/lohnsystem) am 3. November 2026. Die Tabelle nennt je Lohnklasse nur den Höchstbetrag (Bruttobezüge 100 %, ohne Ortszuschlag und Familienzulagen; z. B. LK 23: Fr. 149'807, LK 38: Fr. 405'656). Einen offiziellen Mindestbetrag je Klasse veröffentlicht das EPA darin nicht. Deshalb bleibt `min` leer, statt eine inoffizielle Tabelle zu übernehmen.

## Katalogerweiterung November 2026

Am 3. November 2026 wurden zwölf Arbeitgeber mit per HTTP geprüften Karriereseiten ergänzt:

- Neue Kategorie `pharma` («Pharma / Medtech (Market Access)», 💊): Roche, Novartis, Takeda Schweiz.
- Beratung / Forschung: IQVIA Schweiz, Deloitte Schweiz, KPMG Schweiz, EY Schweiz, ISPM Universität Bern, EBPI Universität Zürich, Unisanté Lausanne, BFH Gesundheit.
- Branchen- / Tariforganisationen: SwissDRG AG.

Nicht aufgenommen wurden PwC Schweiz (die Karriereseite verweigert automatisierte Abrufe mit HTTP 403) sowie Universität Basel DPH, SUPSI und Santé publique Genève (kein verifizierbares eigenes Stellenportal). Dynamische Portale (u. a. Roche/Phenom, KPMG und UZH/Prospective) können ohne Browserlauf als nicht vollständig auslesbar erscheinen.

## Automatisierung und Veröffentlichung

`.github/workflows/job-feed.yml` führt den Abruf um 05:17 und 17:17 UTC sowie manuell aus. Seine Läufe auf Entwicklungsbranches erzeugen Prüf-Artefakte. Die regelmässige Veröffentlichung auf dem separaten Branch `job-feed-data` erfolgt ausschliesslich vom Hauptbranch; sie überschreibt keinen Anwendungscode.

Für den ersten Datenstand vor der Freigabe der Gesamtanwendung gibt es den ausdrücklich getrennten Workflow `.github/workflows/job-feed-bootstrap.yml`. Nur ein Push auf den fest benannten Branch `codex/job-feed-bootstrap-20260924` startet diese einmalige Veröffentlichung. Der reguläre Workflow ignoriert diesen Branch, damit derselbe Push keinen zweiten Abruf auslöst. Der Bootstrap bricht ab, sobald `job-feed-data` bereits existiert. Vor der Veröffentlichung führt er die Regressionstests, einen frischen Abruf aller 85 Quellen, die Prüfung sämtlicher Quelldateien sowie die Chromium-Prüfung der Oberfläche mit diesem Feed aus. Der neue Datenbranch enthält ausschliesslich die öffentlichen JSON-Dateien. Screenshots, Prüfbericht und Feed bleiben zusätzlich als Actions-Artefakt verfügbar.

Dieser Bootstrap ändert weder den Hauptbranch noch Supabase und aktiviert keine regelmässigen Abrufe. Dafür muss der reguläre Workflow später gemäss `DEPLOYMENT.md` auf den Hauptbranch übernommen werden. Dessen Hauptbranch-Beschränkung bleibt unverändert.

Für die fachliche Korrektur vom 24. September dient `.github/workflows/job-feed-focus.yml` auf dem genau festgelegten Branch `codex/feed-focus-20260924`. Er verlangt den bekannten bisherigen Datencommit, ruft alle 85 Quellen mit den ergänzten Adaptern neu ab und prüft jeden veröffentlichten Volltext gegen den Fachfilter. Regressionen, vollständiges Dateiinventar, Zähler und Chromium-Prüfungen müssen erfolgreich sein. Die Veröffentlichung enthält nur JSON-Daten und baut ohne erzwungenes Überschreiben auf dem vorherigen Datencommit auf. Die Anwendung und der Hauptbranch bleiben einer eigenen Bereitstellung vorbehalten.

Die anschliessende Sichtprüfung wird über `.github/workflows/job-feed-review.yml` auf `codex/feed-review-20260924` veröffentlicht. Dieser einmalige Lauf verwendet nur das per SHA-256, erfolgreichem Ursprungslauf und bytegenauem Vergleich mit dem Datencommit geprüfte Artefakt. `scripts/review-job-feed.mjs` entfernt zwei belegte Fehlertreffer und berichtigt die fälschliche Vollständigkeitsangabe der Krebsliga. Er ergänzt keine unbeobachteten Stellen und verändert keine Quellenabrufzeiten. Regressionen sowie neue Browserprüfungen mit dem korrigierten echten Datenstand müssen erneut bestehen. `index.review` dokumentiert Herkunft und Korrekturen.

Die Wiederholung vom 24. September verwendet den bereits abgeschlossenen Abruf aus [Lauf 35965954620](https://github.com/salmonplnk/Jobs-Gesundheitsoekonomie-politik-management/actions/runs/35965954620). Dieser Lauf bestand die Quellen- und Inventarprüfung, stoppte aber an einer Browser-Netzwerkmeldung. Das unveränderliche Artefakt wird anhand von Lauf, Commit, erfolgreichen Quellenschritten und SHA-256 geprüft und darf höchstens 48 Stunden alt sein. Nur seine öffentlichen JSON-Dateien werden übernommen; sämtliche Daten- und Browserprüfungen laufen erneut. Alte Screenshots und der fehlgeschlagene Prüfbericht werden nicht übernommen.

Standardadresse des Browsers:

```
https://raw.githubusercontent.com/salmonplnk/Jobs-Gesundheitsoekonomie-politik-management/job-feed-data/data/job-feed/index.json
```

Eine andere vertrauenswürdige Feed-Adresse kann vor dem Laden von `js/feed.js` mit `window.HEALTH_JOBS_FEED_URL` gesetzt werden. Fehlt der erste veröffentlichte Datenstand, zeigt die Oberfläche dies an; sie erzeugt keine Beispieldaten als vermeintlich echte Treffer.

Der öffentliche Feed benötigt weder Supabase noch einen KI-Schlüssel. Für den bestehenden persönlichen Arbeitsplatz und die KI-Funktionen gelten weiterhin die Schritte in `DEPLOYMENT.md`. Die Gesamtanwendung erst nach deren Abnahme aktivieren.

## Lokal prüfen

```bash
npm ci --ignore-scripts
npm test
npm run feed:refresh -- --output data/job-feed
```

Für PDF-Inserate wird `pdftotext` aus `poppler-utils` benötigt; die Workflows installieren es. Browserunterstützung ist lokal optional. Wenn Chromium nicht verfügbar ist, laufen unterstützte HTML-/API-Quellen weiter; dynamische Restquellen behalten einen ehrlichen Status. Bei grossen Quellen erlaubt `--source-timeout-ms 600000` bis zu zehn Minuten unter Einhaltung der Abrufabstände.

## Abnahme

- Alle 97 Quellen sind im Index vorhanden, auch solche ohne Treffer oder ohne Portal.
- Zwei aktuelle Originalinserate gegen Titel, Arbeitgeber und vollständigen Beschrieb prüfen.
- Eine Quelle absichtlich scheitern lassen: vorhandene Inserate werden nicht geschlossen.
- Suche, Filter und Import ohne Login prüfen; beim Kontowechsel darf ein alter Import nicht ins neue Konto gelangen.
- Fehlerhafte externe Links, unsichere Weiterleitungen und ausserhalb des Feed-Verzeichnisses liegende Detaildateien werden nicht verwendet.
- Nach Veröffentlichung muss die Standardadresse gültiges JSON liefern; die Website zeigt dessen Abrufdatum und Quellenstatus an.
