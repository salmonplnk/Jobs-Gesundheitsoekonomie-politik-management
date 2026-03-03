#!/usr/bin/env python3
"""
Job Scraper für Gesundheitsökonomie-Organisationen (Schweiz)

CONFIG-basierter Ansatz: Jede Website hat eigene Selektoren & Einstellungen.
Nur echte Jobs werden gespeichert – keine Fallback-Links.
"""

import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Dependencies fehlen. Install: pip install requests beautifulsoup4 lxml")
    exit(1)

# Optional: Playwright für JS-heavy Sites
try:
    from playwright.sync_api import sync_playwright
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False
    print("Playwright nicht installiert – JS-Sites werden übersprungen.")
    print("Install: pip install playwright && playwright install chromium")

logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
OUT_FILE = Path(__file__).parent / 'jobs-data.json'
TIMEOUT = 20

# ============================================================
# SITE CONFIGURATION
# Jede Site hat: url, type, selectors, location, max_jobs
# type: "static" (requests) oder "browser" (Playwright)
# selectors: Liste von CSS-Selektoren, erster Treffer gewinnt
# skip: True wenn Site bekannt blockiert ist
# ============================================================

SITES = {
    # ===== STATISCHE SITES (funktionieren mit requests) =====

    "swissmedic": {
        "url": "https://www.swissmedic.ch/swissmedic/de/home/ueber-uns/jobs.html",
        "type": "static",
        "selectors": [
            "div.mod-body a[href*='stellen']",
            "div.mod-body a[href*='job']",
            "article a",
            ".mod-jobfeature a",
            "main a[href*='.html']",
        ],
        "title_min_len": 10,
        "location": "Bern",
        "max_jobs": 10,
    },

    "swisstph": {
        "url": "https://jobs.swisstph.ch/Jobs/All",
        "type": "static",
        "selectors": [
            "table.table tbody tr td a",
            "table tbody tr a",
            ".card-title a",
            "a[href*='/Jobs/']",
        ],
        "location": "Basel",
        "max_jobs": 10,
    },

    "concordia": {
        "url": "https://www.concordia.ch/de/ueber-uns/jobs/offene-stellen.html",
        "type": "static",
        "selectors": [
            "a[href*='jobs'][href*='stellen']",
            ".job-profile a",
            "a[href*='offene-stellen']",
            ".content-section a[href*='jobs']",
        ],
        "location": "Luzern",
        "max_jobs": 15,
    },

    "careum": {
        "url": "https://careum.ch/ueber-uns/jobs",
        "type": "static",
        "selectors": [
            "a[href*='job']",
            ".job-listing a",
            "article a",
            "main a",
        ],
        "location": "Zürich",
        "max_jobs": 10,
    },

    # ===== BROWSER-SITES (brauchen JavaScript / Playwright) =====

    "bag": {
        "url": "https://www.stelle.admin.ch/stelle/de/home/stellen/stelle.html/verwaltungseinheit=1083353",
        "type": "browser",
        "selectors": [
            "a.job-list-item",
            "a[href*='offene-stellen']",
            ".job-item a",
            "table tbody tr a",
            "a[href*='/stelle/']",
        ],
        "location": "Bern",
        "max_jobs": 10,
    },

    "usz": {
        "url": "https://jobs.usz.ch/?lang=de",
        "type": "browser",
        "selectors": [
            "a[class*='job']",
            "a[href*='/position/']",
            ".job-card a",
            ".position-item a",
            "a[href*='stellen']",
        ],
        "location": "Zürich",
        "max_jobs": 10,
    },

    "css": {
        "url": "https://jobs.css.ch/",
        "type": "browser",
        "selectors": [
            "a[href*='/position/']",
            "a[class*='job']",
            ".position-card a",
            ".job-card a",
            "a[href*='/stelle/']",
        ],
        "location": "Luzern",
        "max_jobs": 15,
    },

    "insel": {
        "url": "https://jobs.inselgruppe.ch/?lang=de",
        "type": "browser",
        "selectors": [
            "a.job-list-item",
            "a[href*='/position/']",
            ".job-item a",
            "a[href*='offene-stellen']",
        ],
        "location": "Bern",
        "max_jobs": 10,
    },

    "kpt": {
        "url": "https://www.kpt.ch/de/ueber-kpt/arbeiten-bei-der-kpt/offene-stellen",
        "type": "browser",
        "selectors": [
            "a[href*='stelle']",
            "a[href*='job']",
            ".job-card a",
            "article a",
        ],
        "location": "Bern",
        "max_jobs": 10,
    },

    # ===== BLOCKIERTE SITES (werden übersprungen) =====

    "fmh": {
        "url": "https://www.fmh.ch/ueber-die-fmh/offene-stellen.cfm",
        "type": "static",
        "skip": True,
        "skip_reason": "403 Forbidden – WAF blockiert Zugriff",
        "selectors": [],
        "location": "Bern",
        "max_jobs": 0,
    },

    "obsan": {
        "url": "https://www.obsan.admin.ch/de/das-obsan/offene-stellen",
        "type": "static",
        "skip": True,
        "skip_reason": "503 Service Unavailable",
        "selectors": [],
        "location": "Neuenburg",
        "max_jobs": 0,
    },

    "gdk": {
        "url": "https://www.gdk-cds.ch/de/die-gdk/stellenangebote",
        "type": "static",
        "skip": True,
        "skip_reason": "Anti-Bot-Schutz aktiv",
        "selectors": [],
        "location": "Bern",
        "max_jobs": 0,
    },
}


def clean(text: str) -> str:
    """Clean whitespace, limit length."""
    return ' '.join(text.split())[:200]


def row(title: str, url: str, location: str = "", pensum: str = "") -> dict:
    """Create a job entry."""
    return {"title": title, "url": url, "location": location, "pensum": pensum}


def extract_pensum(text: str) -> str:
    """Try to extract pensum from text like '80-100%' or '100%'."""
    import re
    m = re.search(r'(\d{1,3}\s*[-–]\s*\d{1,3}\s*%|\d{1,3}\s*%)', text)
    return m.group(0).strip() if m else ""


# ============================================================
# STATIC SCRAPER
# ============================================================

def scrape_static(source_id: str, config: dict) -> list:
    """Scrape a static HTML site using requests + BeautifulSoup."""
    url = config["url"]
    logging.info("[%s] Fetching (static)... %s", source_id, url)

    try:
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        resp.raise_for_status()
        resp.encoding = "utf-8"
    except requests.RequestException as e:
        logging.error("[%s] HTTP error: %s", source_id, e)
        return []

    soup = BeautifulSoup(resp.text, "lxml")
    jobs = []
    seen_titles = set()
    max_jobs = config.get("max_jobs", 10)
    min_len = config.get("title_min_len", 8)
    location = config.get("location", "")

    for selector in config["selectors"]:
        for a in soup.select(selector):
            title = clean(a.get_text())
            href = a.get("href", "")

            # Skip too short, navigation links, empty
            if not title or len(title) < min_len:
                continue
            if not href or href == "#" or href.startswith("javascript:"):
                continue

            # Skip duplicate titles
            title_lower = title.lower()
            if title_lower in seen_titles:
                continue
            seen_titles.add(title_lower)

            # Build full URL
            if not href.startswith("http"):
                href = urljoin(url, href)

            # Extract pensum if visible
            parent = a.parent
            parent_text = parent.get_text() if parent else ""
            pensum = extract_pensum(parent_text)

            jobs.append(row(title, href, location, pensum))

            if len(jobs) >= max_jobs:
                break
        if jobs:
            break  # First matching selector wins

    logging.info("[%s] Found %d jobs", source_id, len(jobs))
    return jobs


# ============================================================
# BROWSER SCRAPER (Playwright)
# ============================================================

def scrape_browser(source_id: str, config: dict, page) -> list:
    """Scrape a JavaScript-heavy site using Playwright."""
    url = config["url"]
    logging.info("[%s] Fetching (browser)... %s", source_id, url)

    try:
        page.goto(url, timeout=60000, wait_until="networkidle")
        # Extra wait for JS rendering
        page.wait_for_timeout(3000)
    except Exception as e:
        logging.error("[%s] Page load error: %s", source_id, e)
        return []

    soup = BeautifulSoup(page.content(), "lxml")
    jobs = []
    seen_titles = set()
    max_jobs = config.get("max_jobs", 10)
    location = config.get("location", "")

    for selector in config["selectors"]:
        for a in soup.select(selector):
            title = clean(a.get_text())
            href = a.get("href", "")

            if not title or len(title) < 8:
                continue
            if not href or href == "#" or href.startswith("javascript:"):
                continue

            title_lower = title.lower()
            if title_lower in seen_titles:
                continue
            seen_titles.add(title_lower)

            if not href.startswith("http"):
                href = urljoin(url, href)

            parent = a.parent
            parent_text = parent.get_text() if parent else ""
            pensum = extract_pensum(parent_text)

            jobs.append(row(title, href, location, pensum))

            if len(jobs) >= max_jobs:
                break
        if jobs:
            break

    logging.info("[%s] Found %d jobs", source_id, len(jobs))
    return jobs


# ============================================================
# MAIN
# ============================================================

def main():
    logging.info("Starting Job-Scraper (CONFIG-basiert)...")
    results = {}

    # 1) Static sites (parallel with ThreadPool)
    static_sites = {k: v for k, v in SITES.items()
                    if v["type"] == "static" and not v.get("skip")}
    browser_sites = {k: v for k, v in SITES.items()
                     if v["type"] == "browser" and not v.get("skip")}
    skipped_sites = {k: v for k, v in SITES.items() if v.get("skip")}

    # Log skipped sites
    for sid, cfg in skipped_sites.items():
        logging.warning("[%s] SKIPPED: %s", sid, cfg.get("skip_reason", "unknown"))

    # Parallel static scraping
    logging.info("--- Scraping %d static sites ---", len(static_sites))
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            executor.submit(scrape_static, sid, cfg): sid
            for sid, cfg in static_sites.items()
        }
        for future in as_completed(futures):
            sid = futures[future]
            try:
                jobs = future.result(timeout=30)
                if jobs:
                    results[sid] = jobs
            except Exception as e:
                logging.error("[%s] Scrape failed: %s", sid, e)

    # 2) Browser sites (sequential, shared browser)
    if browser_sites and HAS_PLAYWRIGHT:
        logging.info("--- Scraping %d browser sites ---", len(browser_sites))
        try:
            with sync_playwright() as pw:
                browser = pw.chromium.launch(headless=True)
                page = browser.new_page(extra_http_headers=HEADERS)

                for sid, cfg in browser_sites.items():
                    try:
                        jobs = scrape_browser(sid, cfg, page)
                        if jobs:
                            results[sid] = jobs
                    except Exception as e:
                        logging.error("[%s] Browser scrape failed: %s", sid, e)

                browser.close()
        except Exception as e:
            logging.error("Playwright launch failed: %s", e)
    elif browser_sites:
        logging.warning("Skipping %d browser sites (no Playwright)", len(browser_sites))

    # 3) Save results (merge with existing)
    existing = {}
    if OUT_FILE.exists():
        try:
            existing = json.loads(OUT_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass

    # Only update sources where we found jobs (don't delete old data)
    existing.update(results)
    OUT_FILE.write_text(
        json.dumps(existing, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    total = sum(len(v) for v in existing.values() if isinstance(v, list))
    logging.info("Saved %d jobs from %d sources -> %s", total, len(existing), OUT_FILE)

    # Summary
    logging.info("--- SUMMARY ---")
    for sid in sorted(existing.keys()):
        jobs = existing[sid]
        count = len(jobs) if isinstance(jobs, list) else 0
        logging.info("  %-15s %d jobs", sid, count)


if __name__ == "__main__":
    main()
