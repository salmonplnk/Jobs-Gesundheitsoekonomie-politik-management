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

`npm ci --ignore-scripts` und `npm test`: **46 Tests bestanden**.

- Stellenextraktion, Einzelinserat-/Übersichtsunterscheidung, stabile IDs, Grenzen und Quellenfehler.
- Profilspeichern, ausstehende Speicherungen, Kontotrennung, verspätete Antworten, CV-Ersetzung und Wiederherstellung.
- Speicherung von Stellenänderungen, Pensumsüberschneidung, Muss-Kriterien, defekte Sicherungsdaten und Hash-Routen.
- Word-ZIP/CRC/OOXML, Unicode, HTML-Escaping, DE/FR-Anschreiben und korrekter Absenderort.
- KI-Endpunkte mit simulierten Providerantworten: Auth, Quoten, vollständige Quellen, fehlerhafte Antworten und tatsächliche Zitatprüfung.
- Gesamter Frontend-Skriptverbund in JSDOM: manuelle Erfassung, Filter, Vergleich, Bewerbungsnotizen, Suchprofile, Entwurfsversionen und Kontowechsel.
- Suchlauf mit elf Arbeitgebern, Quellenfehler, Abbruch/Neustart sowie verspätete Cloud-Leseantwort nach erfolgreicher Speicherung.

Zusätzlich alle Browser-JavaScript-Dateien und vier TypeScript-Handler auf Syntax geprüft; `git diff --check` ohne Befund.

## Noch erforderliche Prüfung bei Bereitstellung

- Kein Zugriff auf die laufende Supabase-Datenbank: Migration, RLS, Storage und RPCs sind noch nicht in einer echten PostgreSQL-/Supabase-Instanz ausgeführt worden.
- Keine bezahlten KI-Aufrufe oder Live-CV-Uploads. Die Endpunkttests simulieren Supabase und Anthropic.
- Keine flächendeckende Live-Prüfung der 85 externen Portale. Dynamische bzw. nicht unterstützte Seiten werden ausdrücklich als nicht automatisch lesbar angezeigt; Begrenzungen als Teilabdeckung.
- Die DOM-Prüfungen ersetzen keine visuelle Browserabnahme. Chromium war nicht installiert; der Download lieferte kein gültiges Archiv. Layout, Druckdialog und DOCX-Darstellung sind zusätzlich in einem echten Browser bzw. Word zu prüfen.

Migration und vier Edge Functions müssen vor Aktivierung des Frontends bereitgestellt werden. Reihenfolge und Abnahmeschritte stehen in [DEPLOYMENT.md](DEPLOYMENT.md).
