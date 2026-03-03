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
# Fetcher für Insel Gruppe
# ---------------------------------------------------------------------------
def fetch_insel(page: Page, url: str) -> List[dict]:
    logging.info("[insel] Fetching via Playwright → %s", url)
    try:
        page.goto(url, timeout=60000, wait_until="networkidle")
    except Exception as e:
        logging.error("[insel] Navigation-Error: %s", e)
        return []
    soup = BeautifulSoup(page.content(), "lxml")
    jobs = []
    for a in soup.select("a[data-qa='job-list-item']")[:3]:
        title = clean(a.get_text())
        href  = a.get("href", "")
        if href and not href.startswith("http"):
            href = urljoin(url, href)
        if want(title, href):
            jobs.append(row(title, href, "BE", ""))
    return jobs

# ---------------------------------------------------------------------------
# Fetcher für CSS
# ---------------------------------------------------------------------------
def fetch_css(page: Page, url: str) -> List[dict]:
    logging.info("[css] Fetching via Playwright → %s", url)
    try:
        page.goto(url, timeout=60000, wait_until="networkidle")
    except Exception as e:
        logging.error("[css] Navigation-Error: %s", e)
        return []
    soup = BeautifulSoup(page.content(), "lxml")
    jobs = []
    for a in soup.select("a.job-link, a[class*='job']")[:3]:
        title = clean(a.get_text())
        href  = a.get("href", "")
        if href and not href.startswith("http"):
            href = urljoin(url, href)
        if want(title, href):
            jobs.append(row(title, href, "LU", ""))
    return jobs

# ---------------------------------------------------------------------------
# Generic Fetcher mit Requests
# ---------------------------------------------------------------------------
def fetch_generic(source: str, url: str) -> List[dict]:
    """Generic fetcher für Websites mit statischem HTML"""
    logging.info("[%s] Fetching via Requests → %s", source, url)
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "lxml")
        jobs = []

        # Try multiple common job selectors
        selectors = [
            "a.job-link", "a.job_link", "a[data-qa='job-link']",
            "a.job-title", "a[class*='position']", "a[class*='job']",
            ".job-item a", ".job a[href*='job']"
        ]

        for selector in selectors:
            for a in soup.select(selector)[:3]:
                title = clean(a.get_text())
                href  = a.get("href", "")
                if href and title and len(title) > 5:
                    if not href.startswith("http"):
                        href = urljoin(url, href)
                    if want(title, href):
                        jobs.append(row(title, href, "", ""))
                        if len(jobs) >= 3:
                            break
            if jobs:
                break

        return jobs
    except Exception as e:
        logging.error("[%s] Error: %s", source, e)
        return []

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    results = {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(extra_http_headers=HEADERS)

        # Browser-basierte Scraper (JavaScript-Heavy Sites)
        browser_sources = {
            "bag": ("https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083353&limit=20#/shortlist", fetch_bag),
            "usz": ("https://jobs.usz.ch/?lang=de", fetch_usz),
            "insel": ("https://www.jobs.insel.ch/", fetch_insel),
            "css": ("https://jobs.css.ch/", fetch_css),
        }

        for source_id, (url, fetcher) in browser_sources.items():
            jobs = fetcher(page, url)
            results[source_id] = jobs or [row("Offene Stellen", url)]
            logging.info("[%s] %d Job(s)", source_id, len(results[source_id]))

        browser.close()

    # Request-basierte Scraper (Static HTML)
    request_sources = {
        "sanitas": "https://www.sanitas.com/de/ueber-sanitas/arbeiten-bei-sanitas/offene-stellen.html",
        "swica": "https://www.swica.ch/de/kampagnen/intern/jobs/freie-stellen",
        "kpt": "https://www.kpt.ch/de/ueber-kpt/arbeiten-bei-der-kpt/offene-stellen",
        "careum": "https://careum.ch/ueber-uns/jobs",
        "swisstph": "https://jobs.swisstph.ch/Jobs/All",
        "zhaw": "https://www.zhaw.ch/de/jobs/offene-stellen",
        "concordia": "https://www.concordia.ch/de/ueber-uns/jobs/offene-stellen.html",
        "spitex": "https://www.spitex.ch/Jobs/PgiA1/",
        "hirslanden": "https://careers.hirslanden.ch/",
        "usb": "https://www.unispital-basel.ch/jobs-und-karriere/Jobs",
    }

    for source_id, url in request_sources.items():
        jobs = fetch_generic(source_id, url)
        results[source_id] = jobs or [row("Offene Stellen", url)]
        logging.info("[%s] %d Job(s)", source_id, len(results[source_id]))

    # JSON speichern
    existing = {}
    if OUT_FILE.exists():
        try:
            existing = json.loads(OUT_FILE.read_text(encoding="utf-8"))
        except:
            pass
    existing.update(results)
    OUT_FILE.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
    logging.info("✅ jobs-data.json aktualisiert → %s mit %d Quellen", OUT_FILE.resolve(), len(results))

if __name__ == "__main__":
    main()
