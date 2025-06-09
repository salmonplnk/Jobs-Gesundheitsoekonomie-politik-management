# update_jobs.py
"""Job-Crawler für zwei ausgewählte Portale: BAG und USZ.

Merkmale
---------
* **BAG**: Rendertes HTML aus dem Stellenportal (jobs.admin.ch) via Playwright → BS4.
* **USZ**: Spezial-Fetcher mit Playwright, Seite dynamisch geparst.
* Filter: POS/NEG-Regex + Mindestlänge verhindern irrelevante Links.
* Pro Quelle max. 3 Jobs, sonst Fallback-Link.
* Logging und Fehlerbehandlung.

Pakete
------
```bash
pip install playwright beautifulsoup4 requests lxml
playwright install chromium
```

Aufruf
------
```bash
python update_jobs.py
```
"""
from __future__ import annotations
import json, logging, re, sys
from pathlib import Path
from typing import List
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from playwright.sync_api import Page, sync_playwright

# ---------------------------------------------------------------------------
# Konfiguration
# ---------------------------------------------------------------------------
OUT_FILE = Path("jobs-data.json")
LOG_FILE = Path("update_jobs.log")
HEADERS  = {"User-Agent": "Mozilla/5.0 (compatible; JobBot/3.0)"}

POS = re.compile(r"(job|stelle|emploi|praktikum|\d+%|teilzeit|vollzeit)", re.I)
NEG = re.compile(r"(kontakt|service|impressum|pdf|lehr|abo|newsletter|publikation)", re.I)
PERCENT = re.compile(r"\b(\d{1,3}\s*%)(?:\s*-\s*(\d{1,3}\s*%))?", re.I)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(LOG_FILE, "w", "utf-8"), logging.StreamHandler(sys.stdout)],
)

# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def clean(txt: str | None) -> str:
    return re.sub(r"\s+", " ", txt or "").strip()


def want(title: str, href: str) -> bool:
    if len(title) < 6 or NEG.search(title) or NEG.search(href):
        return False
    return bool(POS.search(title) or POS.search(href))


def extract_percent(text: str) -> str:
    m = PERCENT.search(text)
    if not m:
        return ""
    return f"{m.group(1)}-{m.group(2)}" if m.group(2) else m.group(1)


def row(title: str, url: str, location: str = "", pensum: str = "") -> dict:
    return {"title": clean(title), "url": url, "location": clean(location), "pensum": clean(pensum)}

# ---------------------------------------------------------------------------
# Fetcher für USZ
# ---------------------------------------------------------------------------
def fetch_usz(page: Page, url: str) -> List[dict]:
    logging.info("[usz] Fetching via Playwright → %s", url)
    try:
        page.goto(url, timeout=60000, wait_until="networkidle")
    except Exception as e:
        logging.error("[usz] Navigation-Error: %s", e)
        return []
    # Seite vollständig laden
    soup = BeautifulSoup(page.content(), "lxml")
    jobs = []
    for a in soup.select("a.job__link")[:3]:
        title = clean(a.get_text())
        href  = a.get("href", "")
        if href.startswith("/"):
            href = urljoin(url, href)
        if want(title, href):
            jobs.append(row(title, href, "ZH", ""))
    return jobs

# ---------------------------------------------------------------------------
# Scraping für BAG
# ---------------------------------------------------------------------------
def fetch_bag(page: Page, url: str) -> List[dict]:
    logging.info("[bag] Fetching via Playwright → %s", url)
    try:
        page.goto(url, timeout=60000, wait_until="networkidle")
        page.wait_for_selector("a.job-list-item", timeout=20000)
    except Exception as e:
        logging.error("[bag] Page-Error: %s", e)
        return []
    # Parsed rendered HTML
    soup = BeautifulSoup(page.content(), "lxml")
    jobs = []
    for a in soup.select("a.job-list-item")[:3]:
        title = clean(a.get_text())
        href  = a.get("href", "")
        if href.startswith("/"):
            href = urljoin(url, href)
        if want(title, href):
            jobs.append(row(title, href, "", extract_percent(title)))
    return jobs

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    results = {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(extra_http_headers=HEADERS)

        # BAG
        bag_url = "https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083353&limit=20#/shortlist"
        bag_jobs = fetch_bag(page, bag_url)
        results["bag"] = bag_jobs or [row("Offene Stellen", bag_url)]
        logging.info("[bag] %d Job(s)", len(results["bag"]))

        # USZ
        usz_url = "https://jobs.usz.ch/?lang=de"
        usz_jobs = fetch_usz(page, usz_url)
        results["usz"] = usz_jobs or [row("Offene Stellen", usz_url)]
        logging.info("[usz] %d Job(s)", len(results["usz"]))

        browser.close()

    # JSON speichern
    existing = {}
    if OUT_FILE.exists():
        try:
            existing = json.loads(OUT_FILE.read_text(encoding="utf-8"))
        except:
            pass
    existing.update(results)
    OUT_FILE.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
    logging.info("jobs-data.json aktualisiert → %s", OUT_FILE.resolve())

if __name__ == "__main__":
    main()
