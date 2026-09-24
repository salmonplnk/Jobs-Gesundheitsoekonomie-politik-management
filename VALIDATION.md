# Prüfung der Umsetzung 1–10

Stand: 24. September 2026. Ausgangspunkt: `7d97a09a13a28eeb99f447e97027cbdce3ca6e31`.

## Umgesetzter Umfang

| Punkt | Umsetzung |
|---|---|
| 1 · Fixes & Stabilität | Erneutes Profilspeichern, persistente ausstehende Kontospeicherung, atomare Favoriten, private Dokumente und sichere CV-Ersetzung, echtes PDF-Verarbeiten, konsistenter Cache, gültiges konfigurierbares KI-Modell, ausführbare CI statt fehlendem Scraper. |
| 2 · Stellenübersicht | Einzelinserate aus strukturierten Daten und erkennbaren Detailseiten mit Direktlink und Beschrieb; ergänzende manuelle Erfassung. |
| 3 · Filter | Tätigkeitsfeld, Arbeitsort, Pensum, Arbeitsmodell, Sprachen, Erfahrungsniveau, Anstellung, Status und Sortierung. |
| 4 · Neuigkeiten | Dauerhafte Stellenidentität, erstmals/zuletzt gesehen, gelesen, Änderungsverlauf und Status. Abruffehler schliessen keine Stelle. |
| 5 · Suchprofile | Benannte Arbeitgeberauswahlen mit eigenen Filtern und Kriterien, aktualisierbar und archivierbar. |
| 6 · Matching | Gewichtete Muss-/Wunschkriterien mit unbekannten Angaben; optionale zusätzliche KI-Prüfung mit überprüften Inserat-/CV-Zitaten. |
| 7 · Bewerbungen | Statusübersicht, Kontakte, Notizen, Bewerbungstag und nächster Schritt mit Datum. |
| 8 · Schreiben | DE/FR-Editor, vollständiger ergänzbarer Stellenbeschrieb, auswählbare Belege, Absender/Empfänger, gespeicherte Versionen, DOCX/HTML/TXT und PDF über Druckdialog. |
| 9 · Vergleich | Zwei bis vier Stellen nebeneinander mit Fakten, Beschreibung und Kriterienpassung. |
| 10 · Quellenstatus | Pakete von drei Arbeitgebern, reale Fortschrittszählung, Pausieren/Fortsetzen, Quellenfehler, Teilabdeckung, Cachealter und erneuter frischer Abruf. |

## Ausgeführte Prüfungen

Ursprüngliches Änderungspaket vom 22. September: `npm ci --ignore-scripts` und `npm test`: **57 Tests bestanden**, einschliesslich elf zusätzlicher Karten- und Übergabetests. Der aktuelle Gesamtstand mit Feed umfasst **129 bestandene Tests** (siehe unten).

- Stellenextraktion, Einzelinserat-/Übersichtsunterscheidung, stabile IDs, Grenzen und Quellenfehler.
- Profilspeichern, ausstehende Speicherungen, Kontotrennung, verspätete Antworten, CV-Ersetzung und Wiederherstellung.
- Speicherung von Stellenänderungen, Pensumsüberschneidung, Muss-Kriterien, defekte Sicherungsdaten und Hash-Routen.
- Word-ZIP/CRC/OOXML, Unicode, HTML-Escaping, DE/FR-Anschreiben und korrekter Absenderort.
- KI-Endpunkte mit simulierten Providerantworten: Auth, Quoten, vollständige Quellen, fehlerhafte Antworten und tatsächliche Zitatprüfung.
- Gesamter Frontend-Skriptverbund in JSDOM: manuelle Erfassung, Filter, Vergleich, Bewerbungsnotizen, Suchprofile, Entwurfsversionen und Kontowechsel.
- Suchlauf mit elf Arbeitgebern, Quellenfehler, Abbruch/Neustart sowie verspätete Cloud-Leseantwort nach erfolgreicher Speicherung.

Zusätzlich alle Browser-JavaScript-Dateien und vier TypeScript-Handler auf Syntax geprüft; `git diff --check` ohne Befund.

## Kartenüberarbeitung

- Geografische Schweizer Landesform, 16 belegte Ortsanker und separate Westschweiz-Auswahl; Daten und Lizenz dokumentiert.
- Neun Karten-DOM-Tests: eindeutige Organisationenzahlen, Mehrfachauswahl, Suchtext/Kategorie, Favoriten, Nulltreffer und Reset, Tastatur, 390-Pixel-Startansicht, Ansichtswechsel und Übergabe ausschliesslich suchbarer Arbeitgeber.
- Zwei zusätzliche Tests im vollständigen Skriptverbund: tatsächlicher Arbeitgeberdialog erhält genau die gefilterten IDs, Abbrechen verändert keine gespeicherte Auswahl; bei laufender Suche bleiben Suchlauf und API-Aufruf unverändert und der Pausieren-Button erhält Fokus.
- Die SVG-Karte separat mit Inkscape in hellen und dunklen Farben gerendert und visuell auf Ortszuordnung, lesbare Beschriftungen und Überschneidungen geprüft. Dies ist keine vollständige Browserprüfung des responsiven Layouts.
- Keine neue Backend-Funktion oder Migration für die Karte nötig; die Anforderungen des gesamten Änderungspakets bleiben bestehen.

## Noch erforderliche Prüfung bei Bereitstellung

- Kein Zugriff auf die laufende Supabase-Datenbank: Migration, RLS, Storage und RPCs sind noch nicht in einer echten PostgreSQL-/Supabase-Instanz ausgeführt worden.
- Keine bezahlten KI-Aufrufe oder Live-CV-Uploads. Die Endpunkttests simulieren Supabase und Anthropic.
- Die 85 Quellen wurden inzwischen in vollständigen Live-Läufen geprüft; das bedeutet keine vollständige Extraktion aus allen 85 Portalen. Dynamische bzw. nicht unterstützte Seiten werden ausdrücklich als nicht automatisch lesbar angezeigt; Begrenzungen als Teilabdeckung. Aktueller Nachweis im Feed-Abschnitt unten.
- Authentifizierte Kontoflows, Druckdialog und DOCX-Darstellung müssen zusätzlich mit einer bereitgestellten Testinstanz bzw. Word geprüft werden. Die öffentliche Oberfläche und der Gast-Workspace werden separat in Chromium geprüft; dieser Test ersetzt keine Backend-Abnahme.

Migration und vier Edge Functions müssen vor Aktivierung des Frontends bereitgestellt werden. Reihenfolge und Abnahmeschritte stehen in [DEPLOYMENT.md](DEPLOYMENT.md).


## Öffentlicher Feed – 23. September 2026

- Feed-Oberfläche ohne Anmeldung, alle 85 Quellen im Statusbereich, Filter, Mehrquellen-Zuordnung und Übernahme vollständiger Inserate in die echte persönliche Arbeitsfläche geprüft.
- Kontowechsel einschliesslich A→B→A, verspätete Antworten, unsichere Detailverweise, unerwartete URLs und Identitätskonflikte geprüft. Neuere bzw. manuelle Stellenbeschriebe und persönliche Bewerbungsnotizen bleiben beim Import erhalten.
- Runner, öffentliche Netzwerkanfragen, robots.txt, Weiterleitungen, Zeit-/Grössenlimits, vollständige und eingeschränkte Abrufe, vorherige Bestände, fehlende Quelldateien, Duplikate und 90-Tage-Aufbewahrung geschlossener Stellen geprüft.
- Gemeinsamer Crawler mit Folgeseiten, Karriere-Einstiegen und Detailseiten sowie öffentlichen Recruitee-, Lever-, Greenhouse-, Prospective-, USB-, AG- und CHUV-Adaptern geprüft. Swissmedic-Beschriebe über mehrere Artikelblöcke sowie versteckte Leermeldungen neben tatsächlichen Stellenkarten sind als Regressionen abgedeckt.
- `npm test`: **129 Tests bestanden**. TypeScript-Syntax des geänderten Such-Endpunkts und `git diff --check` ohne Befund.
- Der erneute Chromium-Download lieferte ein ungültiges Archiv. Die Browserprüfung bleibt offen; die DOM-Tests sind keine visuelle Browserabnahme.
- Vollständiger Live-Lauf vom 23.09.2026, 19:46–19:54 UTC: alle 85 Quellen besucht, 906 eindeutige Inserate aus 22 Quellen erfasst. Acht parallele Quellen mit 90 Sekunden Budget pro Quelle; lokale Browserunterstützung deaktiviert. 16 Quellen vollständig erfolgreich, sechs teilweise erfasst, drei als leer gewertet, 49 technisch nicht erfasst und elf mit Abruffehler. Die anschliessende Prüfung korrigiert eine falsche Leermeldung bei Pflegewegweiser und wiederholt fünf betroffene bzw. begrenzte Quellen mit höherem Zeitbudget. Der rohe erste Lauf wird nicht als endgültiger Stand veröffentlicht.
- Der vollständige echte Datenstand mit 906 Inseraten wurde in die Feed-Oberfläche geladen: 906 akzeptiert, 85 Quellenstatus, 25 Karten pro Seite und Übernahme eines vollständigen Inserats erfolgreich, keine DOM-Fehler.
- Der anschliessende GitHub-Lauf vom 23. September erfasste 1.080 Inserate aus 26 Quellen als Prüf-Artefakt. Dieser Zwischenstand wurde durch den folgenden frischen Lauf ersetzt.

## Veröffentlichter Feed und Browserprüfung – 24. September 2026

- Frischer Chromium-gestützter Abruf vom **24.09.2026, 06:45–06:56 UTC**: **1.075 eindeutige Inserate aus 26 Quellen**, alle **85 Quellen geprüft**. Status: **18 erfolgreich, 3 verifiziert leer, 8 teilweise erfasst, 45 nicht unterstützt und 11 Abruffehler**; keine ungeprüfte Quelle. Vier Organisationen haben kein hinterlegtes Stellenportal. Eine vollständige Extraktion aus allen 85 Portalen wird ausdrücklich nicht behauptet.
- Erfolgreiche Veröffentlichung: [GitHub Actions 35967578082](https://github.com/salmonplnk/Jobs-Gesundheitsoekonomie-politik-management/actions/runs/35967578082). **129 Regressionstests** und **12 Browserprüfungen** bestanden. Der zuvor abgeschlossene Crawl wurde unverändert aus seinem per SHA-256, Commit und Quellenschritten verifizierten Artefakt übernommen; alle Veröffentlichungsgates liefen erneut.
- Desktop (1440 px) und Mobilansicht (390 px), jeweils hell/dunkel: alle Inserate vom Frontend akzeptiert, 85 Quellenstatus, 25er-Pagination, Arbeitgeber-/Text-/Ortsfilter, Reset, expliziter Volltextimport in den Gast-Workspace sowie Karten-/Listenauswahl und Tastaturbedienung bestanden. Keine JavaScript-Fehler, unerwarteten externen Anfragen oder unvollständigen Feedantworten. Acht Screenshots erzeugt und Ansichten visuell kontrolliert; kein horizontaler Seitenüberlauf.
- Ein Chromium-`ERR_ABORTED` beim mobilen Detailabruf trat nach vollständigem Empfang auf. Der Bericht belegt HTTP 200, exakt 31.089 gelesene Bytes, Stream-Ende und erfolgreichen Volltextimport. Andere Abbrüche, Lesefehler und fehlende Inhalte bleiben blockierend. Der Index wurde in beiden Ansichten mit allen 1.954.514 Bytes gelesen.
- Die Browserprüfung nutzt die echten statischen App-Dateien und den echten Feed, aber lokale Ersatzantworten für externe Schrift-/Favicon-Ressourcen und das nicht geladene Supabase-SDK. Anmeldung, produktive Supabase-Daten, Word und Druckdialog sind dadurch nicht abgenommen.
- Stichprobe gegen die Originale: [Swissmedic Senior Controller/in](https://www.swissmedic.ch/swissmedic/en/home/about-us/jobs/fico-controlling.html) und [BAG Jurist/-in](https://jobs.admin.ch/offene-stellen/jurist-in/eb2c39de-46fa-40a4-be9a-e10f97b293d0): Titel, Arbeitgeber, Aufgaben und Anforderungen stimmen mit den erfassten Beschrieben überein.
- Datencommit **`b2570a9916f891791ae4a2370ef2f4ac853234e5`** auf `job-feed-data`: exakt **86 öffentliche JSON-Dateien**, alle Blob-Hashes stimmen mit dem geprüften Artefakt überein; kein Anwendungscode oder persönlicher Workspace enthalten. Die [öffentliche Indexadresse](https://raw.githubusercontent.com/salmonplnk/Jobs-Gesundheitsoekonomie-politik-management/job-feed-data/data/job-feed/index.json) liefert HTTP 200, gültiges JSON und `Access-Control-Allow-Origin: *`.

### Noch offen

- Supabase-Migration, vier Edge Functions und Abnahme mit getrennten Konten. Dafür besteht in dieser Arbeitsumgebung kein administrativer Supabase-Zugang.
- Aktivierung der gesamten Website und Übernahme des regulären Feed-Workflows auf den Hauptbranch; erst dadurch startet der zweimal tägliche Zeitplan. Der Datenbranch ist bereits öffentlich.
- Weitere Portal-/PDF-Adapter und belegte Bereichsfilter für die nicht bzw. teilweise erfassten Quellen; KPT-Einstieg prüfen (HTTP 404). Robots-/Zugangssperren bleiben respektiert. Vereinzelte HTML-Zeichenreferenzen in Quelltexten benötigen noch eine vollständigere Textaufbereitung.
