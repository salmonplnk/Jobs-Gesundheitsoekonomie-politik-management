# Öffentlicher Jobfeed

Der Feed steht oberhalb der persönlichen Arbeitsfläche und benötigt keine Anmeldung. Er zeigt fachlich passende Stellen mit Direktlink, Arbeitgeber, Ort, Pensum und Abrufdatum. Der gemeinsame Fachfilter prüft die vollständigen Aufgaben und Anforderungen auf Gesundheitsökonomie/HTA, Gesundheitspolitik/Tarife, Versorgungsforschung/Public Health, nichtklinisches Gesundheitsmanagement, Gesundheitsprojekte und Gesundheitsdaten. Ein Gesundheitsarbeitgeber allein genügt nicht. Klinische Versorgung, verpflichtende klinische Berufsqualifikationen, Pflege, allgemeine Verwaltung, Verkauf und fachfremder IT-Betrieb sind ausgeschlossen. Grenzfälle ohne belegten Fachbezug werden ausgeblendet. Dies ist ein Fachfilter, keine Garantie persönlicher Eignung.

Der Quellenbereich zeigt für jede der 85 Katalogorganisationen, ob der technische Abruf vollständig, teilweise oder nicht gelungen ist. Quellen mit passenden Stellen und die Zahl passender Inserate werden separat gezählt. Das Öffnen einer Originalquelle startet keine persönliche Suche und keinen KI-Aufruf.

## Ablauf

1. Der Node-Runner lädt `data/organizations.json` und die verifizierten Korrekturen in `data/job-source-overrides.json`.
2. Der gemeinsame Crawler verfolgt erlaubte Karriereseiten, eingebettete Portale, Folgeseiten und Einzelinserate. Für unterstützte Bewerberportale nutzt er deren öffentliche Stellendaten.
3. Nach Abgleich des Quellenbestands wendet er `js/job-relevance.js` auf jeden Volltext an, einschliesslich älterer übernommener Inserate. Nur passende Inserate werden mit Fachbereich und Begründung in einer JSON-Datei je Organisation und im kompakten, nach Inserat-URL deduplizierten `index.json` veröffentlicht. Bei gemeinsamen Inseraten bleiben alle zugehörigen Katalogquellen in `org_ids` erhalten. Der Index trägt die Filterversion in `scope.policy_version`.
4. Der Browser lädt zunächst nur den Index. Erst «Übernehmen» lädt den vollständigen Datensatz der Quelle und fügt die gewählte Stelle der persönlichen Arbeitsfläche hinzu. Vorhandene Bewerbungsnotizen, neuere Stellenstände und manuelle Beschreibungen bleiben erhalten.

Der öffentliche Datenbestand enthält ausschliesslich Informationen aus den Stellenportalen. Lebensläufe, Profile, Entwürfe, Notizen und Bewerbungsstände werden niemals in den Feed geschrieben.

## Abdeckung und Grenzen

Jede Quelle erhält einen Status: noch ungeprüft, erfolgreich, keine offenen Stellen, teilweise geprüft, nicht lesbar oder Fehler. Quellen ohne bestätigtes Stellenportal sind ausdrücklich gekennzeichnet. Erfolgreiche HTTP-Antworten allein gelten nicht als Beleg für eine vollständige Stellenliste.

Zählungen für Listen-/Detailseiten und ausstehende Seiten sowie `coverage` unterscheiden vollständige, begrenzte und ungeklärte Abrufe. `raw_job_count`, `relevant_job_count` und `filtered_out_count` trennen den Quellenbestand von passenden Stellen. Eine vollständig erfasste Quelle mit null passenden Inseraten ist keine Leermeldung des Arbeitgebers. Zeitlimits, geschützte Portale, nicht erfasste Dokument-Inserate und nicht unterstützte dynamische Seiten führen zu einem sichtbaren Hinweis. Kein CAPTCHA, Login oder sonstiger Zugangsschutz wird umgangen.

Öffentlich verlinkte PDF-Inserate werden mit Poppler vollständig als Text gelesen. Titel, Aufgaben, Anforderungen und Bewerbungshinweis müssen im Dokument belegt sein. Bildscans ohne ausreichenden Text und andere Dokumentformate bleiben als unvollständig erfasst sichtbar. Die Begrenzungen für Dateigrösse, Zeit, öffentliche Netzwerkadressen, erlaubte Hosts und robots.txt gelten auch für Dokumente.

Bei eingeschränkten oder fehlgeschlagenen Abrufen bleiben bisherige Inserate erhalten und werden als älterer Stand gekennzeichnet. Nur ein nachweislich vollständiger erfolgreicher Abruf kann fehlende Inserate schliessen. Geschlossene Inserate werden aus dem öffentlichen Index entfernt und nach 90 Tagen aus den Quelldateien gelöscht. Vor dem Schreiben gelten Grössenlimits von 24 MiB für den Index und 12 MiB pro Quelldatei. Abteilungsfilter verhindern, dass Stellen anderer Bereiche eines gemeinsamen Portals unbemerkt unter BAG, BSV oder einer Fakultät erscheinen. Der tatsächlich genannte Arbeitgeber bleibt sichtbar.

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

- Alle 85 Quellen sind im Index vorhanden, auch solche ohne Treffer oder ohne Portal.
- Zwei aktuelle Originalinserate gegen Titel, Arbeitgeber und vollständigen Beschrieb prüfen.
- Eine Quelle absichtlich scheitern lassen: vorhandene Inserate werden nicht geschlossen.
- Suche, Filter und Import ohne Login prüfen; beim Kontowechsel darf ein alter Import nicht ins neue Konto gelangen.
- Fehlerhafte externe Links, unsichere Weiterleitungen und ausserhalb des Feed-Verzeichnisses liegende Detaildateien werden nicht verwendet.
- Nach Veröffentlichung muss die Standardadresse gültiges JSON liefern; die Website zeigt dessen Abrufdatum und Quellenstatus an.
