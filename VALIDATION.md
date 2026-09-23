# Prüfung der Umsetzung 1–10

Stand: 22. September 2026. Ausgangspunkt: `7d97a09a13a28eeb99f447e97027cbdce3ca6e31`.

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

`npm ci --ignore-scripts` und `npm test`: **57 Tests bestanden**, einschliesslich elf zusätzlicher Karten- und Übergabetests.

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
- Keine flächendeckende Live-Prüfung der 85 externen Portale. Dynamische bzw. nicht unterstützte Seiten werden ausdrücklich als nicht automatisch lesbar angezeigt; Begrenzungen als Teilabdeckung.
- Die DOM-Prüfungen ersetzen keine visuelle Browserabnahme. Chromium war nicht installiert; der Download lieferte kein gültiges Archiv. Layout, Druckdialog und DOCX-Darstellung sind zusätzlich in einem echten Browser bzw. Word zu prüfen.

Migration und vier Edge Functions müssen vor Aktivierung des Frontends bereitgestellt werden. Reihenfolge und Abnahmeschritte stehen in [DEPLOYMENT.md](DEPLOYMENT.md).


## Öffentlicher Feed – 23. September 2026

- Feed-Oberfläche ohne Anmeldung, alle 85 Quellen im Statusbereich, Filter, Mehrquellen-Zuordnung und Übernahme vollständiger Inserate in die echte persönliche Arbeitsfläche geprüft.
- Kontowechsel einschliesslich A→B→A, verspätete Antworten, unsichere Detailverweise, unerwartete URLs und Identitätskonflikte geprüft. Neuere bzw. manuelle Stellenbeschriebe und persönliche Bewerbungsnotizen bleiben beim Import erhalten.
- Runner, öffentliche Netzwerkanfragen, robots.txt, Weiterleitungen, Zeit-/Grössenlimits, vollständige und eingeschränkte Abrufe, vorherige Bestände, fehlende Quelldateien, Duplikate und 90-Tage-Aufbewahrung geschlossener Stellen geprüft.
- Gemeinsamer Crawler mit Folgeseiten, Karriere-Einstiegen und Detailseiten sowie öffentlichen Recruitee-, Lever-, Greenhouse-, Prospective-, USB-, AG- und CHUV-Adaptern geprüft. Der Swissmedic-Aufgabenabschnitt «Ihre neue Herausforderung» wird berücksichtigt.
- `npm test`: **127 Tests bestanden**. TypeScript-Syntax des geänderten Such-Endpunkts und `git diff --check` ohne Befund.
- Der erneute Chromium-Download lieferte ein ungültiges Archiv. Die Browserprüfung bleibt offen; die DOM-Tests sind keine visuelle Browserabnahme.
- Der Live-Abruf aller 85 Quellen läuft separat mit echten Quellen und konservativen Fehlermeldungen. Sein abschliessendes Ergebnis wird nach Abschluss ergänzt.
