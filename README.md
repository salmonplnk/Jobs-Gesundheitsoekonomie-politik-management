# Jobs-Gesundheitsoekonomie-politik-management

Dieses Repository sammelt aktuelle Stellenanzeigen verschiedener Schweizer Gesundheitsportale. Das Skript `update_jobs.py` ruft die Seiten ab, extrahiert maximal drei Stellen pro Quelle und schreibt sie in `jobs-data.json`. Die Ergebnisse werden in `index.html` dargestellt.

## Setup

1. Python 3 installieren.
2. Abhängigkeiten installieren:

   ```
   pip install requests beautifulsoup4 lxml playwright
   playwright install
   ```

3. Scraper ausführen:

   ```
   python3 update_jobs.py
   ```

Anschließend enthält `jobs-data.json` die aktuellen Stellenangebote.