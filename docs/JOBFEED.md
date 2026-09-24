# Öffentlicher Jobfeed

Der Feed steht oberhalb der persönlichen Arbeitsfläche und benötigt keine Anmeldung. Er zeigt einzelne Stellen mit Direktlink, Arbeitgeber, Ort, Pensum und Abrufdatum. Suchtext und Filter begrenzen die Anzeige; der Quellenbereich macht den Status jeder der 85 Katalogorganisationen sichtbar. Das Öffnen einer Originalquelle startet keine persönliche Suche und keinen KI-Aufruf.

## Ablauf

1. Der Node-Runner lädt `data/organizations.json` und die verifizierten Korrekturen in `data/job-source-overrides.json`.
2. Der gemeinsame Crawler verfolgt erlaubte Karriereseiten, eingebettete Portale, Folgeseiten und Einzelinserate. Für unterstützte Bewerberportale nutzt er deren öffentliche Stellendaten.
3. Er speichert vollständige Inserate in einer JSON-Datei je Organisation und einen kompakten, nach Inserat-URL deduplizierten `index.json`. Bei gemeinsamen Inseraten bleiben alle zugehörigen Katalogquellen in `org_ids` erhalten.
4. Der Browser lädt zunächst nur den Index. Erst «Übernehmen» lädt den vollständigen Datensatz der Quelle und fügt die gewählte Stelle der persönlichen Arbeitsfläche hinzu. Vorhandene Bewerbungsnotizen, neuere Stellenstände und manuelle Beschreibungen bleiben erhalten.

Der öffentliche Datenbestand enthält ausschliesslich Informationen aus den Stellenportalen. Lebensläufe, Profile, Entwürfe, Notizen und Bewerbungsstände werden niemals in den Feed geschrieben.

## Abdeckung und Grenzen

Jede Quelle erhält einen Status: noch ungeprüft, erfolgreich, keine offenen Stellen, teilweise geprüft, nicht lesbar oder Fehler. Quellen ohne bestätigtes Stellenportal sind ausdrücklich gekennzeichnet. Erfolgreiche HTTP-Antworten allein gelten nicht als Beleg für eine vollständige Stellenliste.

Zählungen für Listen-/Detailseiten und ausstehende Seiten sowie `coverage` unterscheiden vollständige, begrenzte und ungeklärte Abrufe. Zeitlimits, geschützte Portale, nicht erfasste Dokument-Inserate und nicht unterstützte dynamische Seiten führen zu einem sichtbaren Hinweis. Kein CAPTCHA, Login oder sonstiger Zugangsschutz wird umgangen.

Bei eingeschränkten oder fehlgeschlagenen Abrufen bleiben bisherige Inserate erhalten und werden als älterer Stand gekennzeichnet. Nur ein nachweislich vollständiger erfolgreicher Abruf kann fehlende Inserate schliessen. Geschlossene Inserate werden aus dem öffentlichen Index entfernt und nach 90 Tagen aus den Quelldateien gelöscht. Vor dem Schreiben gelten Grössenlimits von 24 MiB für den Index und 12 MiB pro Quelldatei. Abteilungsfilter verhindern, dass Stellen anderer Bereiche eines gemeinsamen Portals unbemerkt unter BAG, BSV oder einer Fakultät erscheinen. Der tatsächlich genannte Arbeitgeber bleibt sichtbar.

## Automatisierung und Veröffentlichung

`.github/workflows/job-feed.yml` führt den Abruf um 05:17 und 17:17 UTC sowie manuell aus. Seine Läufe auf Entwicklungsbranches erzeugen Prüf-Artefakte. Die regelmässige Veröffentlichung auf dem separaten Branch `job-feed-data` erfolgt ausschliesslich vom Hauptbranch; sie überschreibt keinen Anwendungscode.

Für den ersten Datenstand vor der Freigabe der Gesamtanwendung gibt es den ausdrücklich getrennten Workflow `.github/workflows/job-feed-bootstrap.yml`. Nur ein Push auf den fest benannten Branch `codex/job-feed-bootstrap-20260924` startet diese einmalige Veröffentlichung. Der reguläre Workflow ignoriert diesen Branch, damit derselbe Push keinen zweiten Abruf auslöst. Der Bootstrap bricht ab, sobald `job-feed-data` bereits existiert. Vor der Veröffentlichung führt er die Regressionstests, einen frischen Abruf aller 85 Quellen, die Prüfung sämtlicher Quelldateien sowie die Chromium-Prüfung der Oberfläche mit diesem Feed aus. Der neue Datenbranch enthält ausschliesslich die öffentlichen JSON-Dateien. Screenshots, Prüfbericht und Feed bleiben zusätzlich als Actions-Artefakt verfügbar.

Dieser Bootstrap ändert weder den Hauptbranch noch Supabase und aktiviert keine regelmässigen Abrufe. Dafür muss der reguläre Workflow später gemäss `DEPLOYMENT.md` auf den Hauptbranch übernommen werden. Dessen Hauptbranch-Beschränkung bleibt unverändert.

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

Browserunterstützung ist optional. Wenn Chromium nicht verfügbar ist, laufen unterstützte HTML-/API-Quellen weiter; dynamische Restquellen behalten einen ehrlichen Status.

## Abnahme

- Alle 85 Quellen sind im Index vorhanden, auch solche ohne Treffer oder ohne Portal.
- Zwei aktuelle Originalinserate gegen Titel, Arbeitgeber und vollständigen Beschrieb prüfen.
- Eine Quelle absichtlich scheitern lassen: vorhandene Inserate werden nicht geschlossen.
- Suche, Filter und Import ohne Login prüfen; beim Kontowechsel darf ein alter Import nicht ins neue Konto gelangen.
- Fehlerhafte externe Links, unsichere Weiterleitungen und ausserhalb des Feed-Verzeichnisses liegende Detaildateien werden nicht verwendet.
- Nach Veröffentlichung muss die Standardadresse gültiges JSON liefern; die Website zeigt dessen Abrufdatum und Quellenstatus an.
