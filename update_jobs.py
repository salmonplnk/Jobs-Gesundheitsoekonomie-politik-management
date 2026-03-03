#!/usr/bin/env python3
"""
Job Scraper für Gesundheitsökonomie-Organisationen (Schweiz)

Fokus: Ökonomie, Management, Policy - KEINE medizinischen Tätigkeiten
Ziel: Aus den Unternehmenswebsites direkt crawlen, nicht aus Job-Portalen
"""

import json
import logging
from pathlib import Path
from typing import List
from urllib.parse import urljoin

try:
    import requests
    from bs4 import BeautifulSoup
    from playwright.sync_api import sync_playwright, Page
except ImportError:
    print("❌ Dependencies fehlen. Install: pip install requests beautifulsoup4 playwright")
    print("   Dann: playwright install chromium")
    exit(1)

logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')

HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; HealthEcon-Scraper/1.0)'}
OUT_FILE = Path(__file__).parent / 'jobs-data.json'

def row(title: str, url: str, location: str = "", pensum: str = "") -> dict:
    """Create job row"""
    return {"title": title, "url": url, "location": location, "pensum": pensum}

def clean(text: str) -> str:
    """Clean text"""
    return ' '.join(text.split())[:160]

def want(title: str) -> bool:
    """Filter: Nur Gesundheitsökonomie, NICHT medizinisch"""
    title_lower = title.lower()

    # MUSS eins davon enthalten
    good = any(w in title_lower for w in [
        'ökonomie', 'economics', 'oeconomist', 'health economist',
        'management', 'analyst', 'controller', 'controlling',
        'policy', 'strategist', 'coordinator', 'researcher', 'scientist',
        'planner', 'evaluator', 'consultant', 'data', 'statistician',
        'project manager', 'quality', 'risk', 'compliance'
    ])

    # DARF NICHT enthalten
    bad = any(w in title_lower for w in [
        'arzt', 'ärztin', 'pfleger', 'krankenschwester', 'nurse',
        'pflegefachperson', 'therapist', 'therapie', 'physiotherapy',
        'med tech', 'radiolog', 'labor technician', 'pharmacy', 'apothek',
        'operationsraum', 'anästhesi', 'zahnarzt', 'dentist',
        'hygiene', 'pflege'  # reine Pflege, nicht Health Management
    ])

    return good and not bad

# ============================================================
# BROWSER-BASED SCRAPERS (JavaScript-heavy Sites)
# ============================================================

def fetch_bag(page: Page) -> List[dict]:
    """BAG - Bundesamt für Gesundheit"""
    logging.info("[bag] Scraping...")
    url = "https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083353&limit=20#/shortlist"
    try:
        page.goto(url, timeout=60000, wait_until="networkidle")
        page.wait_for_selector("a.job-list-item", timeout=15000)
        soup = BeautifulSoup(page.content(), "lxml")
        jobs = []
        for a in soup.select("a.job-list-item")[:5]:
            title = clean(a.get_text())
            href = a.get("href", "")
            if href.startswith("/"):
                href = urljoin(url, href)
            if want(title) and title:
                jobs.append(row(title, href, "Bern", "100%"))
        return jobs
    except Exception as e:
        logging.error("[bag] Error: %s", e)
        return []

def fetch_usz(page: Page) -> List[dict]:
    """USZ - UniversitätsSpital Zürich"""
    logging.info("[usz] Scraping...")
    url = "https://jobs.usz.ch/?lang=de"
    try:
        page.goto(url, timeout=60000, wait_until="networkidle")
        soup = BeautifulSoup(page.content(), "lxml")
        jobs = []
        for a in soup.select("a.job__link, a[class*='job']")[:5]:
            title = clean(a.get_text())
            href = a.get("href", "")
            if href and not href.startswith("http"):
                href = urljoin(url, href)
            if want(title) and title:
                jobs.append(row(title, href, "Zürich", ""))
        return jobs
    except Exception as e:
        logging.error("[usz] Error: %s", e)
        return []

def fetch_css(page: Page) -> List[dict]:
    """CSS Versicherung"""
    logging.info("[css] Scraping...")
    url = "https://jobs.css.ch/"
    try:
        page.goto(url, timeout=60000, wait_until="networkidle")
        soup = BeautifulSoup(page.content(), "lxml")
        jobs = []
        for a in soup.select("a.job-link, a[class*='job']")[:5]:
            title = clean(a.get_text())
            href = a.get("href", "")
            if href and not href.startswith("http"):
                href = urljoin(url, href)
            if want(title) and title:
                jobs.append(row(title, href, "Luzern", ""))
        return jobs
    except Exception as e:
        logging.error("[css] Error: %s", e)
        return []

# ============================================================
# STATIC HTML SCRAPERS
# ============================================================

def fetch_generic(source: str, url: str) -> List[dict]:
    """Generic scraper für statische Websites"""
    logging.info("[%s] Scraping...", source)
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "lxml")
        jobs = []

        selectors = [
            "a.job-link", "a.job_link", "a[data-qa='job-link']",
            "a.job-title", "a[class*='position']", "a[class*='job']",
            ".job-item a", "a[href*='job']"
        ]

        for selector in selectors:
            for a in soup.select(selector)[:5]:
                title = clean(a.get_text())
                href = a.get("href", "")
                if href and title and len(title) > 5:
                    if not href.startswith("http"):
                        href = urljoin(url, href)
                    if want(title):
                        jobs.append(row(title, href, "", ""))
                        if len(jobs) >= 3:
                            break
            if jobs:
                break

        return jobs
    except Exception as e:
        logging.error("[%s] Error: %s", source, e)
        return []

# ============================================================
# MAIN
# ============================================================

def main():
    logging.info("🚀 Starting scraper für Gesundheitsökonomie...")
    results = {}

    # ===== BROWSER-BASED (JavaScript) =====
    browser_sources = {
        "bag": fetch_bag,
        "usz": fetch_usz,
        "css": fetch_css,
    }

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(extra_http_headers=HEADERS)

        for source_id, fetcher in browser_sources.items():
            jobs = fetcher(page)
            results[source_id] = jobs or [row("Offene Stellen", f"https://{source_id}.ch")]
            logging.info("[%s] %d Jobs", source_id, len(results[source_id]))

        browser.close()

    # ===== STATIC HTML =====
    request_sources = {
        "insel": "https://www.jobs.insel.ch",
        "sanitas": "https://www.sanitas.com/de/ueber-sanitas/arbeiten-bei-sanitas",
        "swica": "https://www.swica.ch/de/kampagnen/intern/jobs/freie-stellen",
        "kpt": "https://www.kpt.ch/de/ueber-kpt/arbeiten-bei-der-kpt",
        "swissmedic": "https://www.swissmedic.ch/swissmedic/en/home/about-us/jobs.html",
        "obsan": "https://www.obsan.admin.ch/de/das-obsan/offene-stellen",
        "swisstph": "https://jobs.swisstph.ch/Jobs/All",
        "careum": "https://careum.ch/ueber-uns/jobs",
        "concordia": "https://www.concordia.ch/de/ueber-uns/jobs/offene-stellen.html",
        "fmh": "https://www.fmh.ch/ueber-die-fmh/offene-stellen.cfm",
        "gdk": "https://www.gdk-cds.ch/de/",
    }

    for source_id, url in request_sources.items():
        jobs = fetch_generic(source_id, url)
        results[source_id] = jobs or [row("Offene Stellen", url)]
        logging.info("[%s] %d Jobs", source_id, len(results[source_id]))

    # ===== SAVE =====
    existing = {}
    if OUT_FILE.exists():
        try:
            existing = json.loads(OUT_FILE.read_text(encoding="utf-8"))
        except:
            pass

    existing.update(results)
    OUT_FILE.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")

    total = sum(len(v) for v in existing.values())
    logging.info("✅ Saved %d jobs from %d sources → %s", total, len(existing), OUT_FILE)

if __name__ == "__main__":
    main()
