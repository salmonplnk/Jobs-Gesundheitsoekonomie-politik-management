Automatischer Job-Crawler für Schweizer Gesundheits­portale.
Speichert pro Quelle max. 3 aktuelle Angebote in jobs-data.json.
"""

import json
import re
import datetime
from collections import defaultdict
from urllib.parse import urljoin

import requests

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

# --------  HIER DEINE SEITEN EINTRAGEN  ----------
SOURCES = [
    # id, url, selector (Job-Link), optional selector Ort & Pensum
    (
        "bag",
        "https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083353&limit=20#/shortlist",
        "a.job-list-item",
        None,
        None,
    ),
    (
        "bsv",
        "https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083356&limit=20#/shortlist",
        "a.job-list-item",
        None,
        None,
    ),
    ("obsan", "https://www.obsan.admin.ch/de/das-obsan/offene-stellen",
              "div.view-content a", None,             None),
    ("gfs",   "https://gesundheitsfoerderung.ch/stiftung/stellenangebote",
              "div.job-listing a",  "span.jobplace",  "span.scope"),
    (
        "lungenliga",
        "https://www.lungenliga.ch/ueber-uns/jobs",
        None,
        None,
        None,
    ),
    (
        "krebsliga",
        "https://www.krebsliga.ch/ueber-uns/jobs",
        "a.title[href^=\"https://link.ostendis.com\"]",
        "span.job-place",
        "span.pensum",
    ),
    (
        "swissmedic",
        "https://www.swissmedic.ch/swissmedic/en/home/about-us/jobs.html",
        "div.mod-teaser a",
        None,
        None,
    ),
    (
        "kssg",
        "https://jobs.h-och.ch/search/",
        "a.jobTitle-link",
        "span.jobLocation",
        None,
    ),
    (
        "css",
        "https://jobs.css.ch/",
        "div#jobs-list a.job-title",
        "span.place-of-work",
        None,
    ),
    (
        "usz",
        "https://jobs.usz.ch/?lang=de",
        "a.job__link",
        None,
        None,
    ),
    # … weitere Zeilen nach gleichem Muster …
]
# -------------------------------------------------

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; JobBot/1.0)"}
out = defaultdict(list)

def clean(txt): return re.sub(r"\s+", " ", txt).strip()


def fetch_lungenliga():
    url = (
        "https://www.lungenliga.ch/views/ajax?q=https://www.lungenliga.ch/ueber-"
        "uns/jobs&f%5B1%5D=languages%3Ade&_wrapper_format=drupal_ajax&view_name="
        "search_jobs&view_display_id=block"
    )
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    try:
        payload = r.json()
    except Exception as e:
        raise RuntimeError("invalid JSON") from e
    html = "".join(
        part.get("data", "") for part in payload if isinstance(part, dict)
    )
    soup = BeautifulSoup(html, "lxml")
    jobs = []
    for a in soup.select("a")[:3]:
        title = clean(a.get_text())
        href = a.get("href", "")
        if href and not href.startswith("http"):
            href = urljoin("https://www.lungenliga.ch", href)
        jobs.append({"title": title or "Job", "url": href, "location": "", "pensum": "-"})
    return jobs

def fetch_kssg(url: str):
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")
    jobs = []
    for row in soup.select("tr.data-row")[:3]:
        a = row.select_one("a.jobTitle-link")
        if not a:
            continue
        title = clean(a.get_text())
        href = a.get("href", "")
        if href and not href.startswith("http"):
            href = urljoin(url, href)
        loc_el = row.select_one("span.jobLocation")
        loc = clean(loc_el.get_text()) if loc_el else ""
        jobs.append({"title": title or "Job", "url": href, "location": loc, "pensum": "–"})
    return jobs

def fetch_css(url: str):
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")
    jobs = []
    for div in soup.select("div#jobs-list div.job")[:3]:
        a = div.select_one("a.job-title")
        if not a:
            continue
        title = clean(a.get("title") or a.get_text())
        href = a.get("href", "")
        if href and not href.startswith("http"):
            href = urljoin(url, href)
        loc_el = div.select_one("span.place-of-work")
        loc = clean(loc_el.get_text()) if loc_el else ""
        jobs.append({"title": title or "Job", "url": href, "location": loc, "pensum": "–"})
    return jobs

def fetch_usz(page, url: str):
    page.goto(url, timeout=30000)
    page.wait_for_load_state("networkidle")
    soup = BeautifulSoup(page.content(), "lxml")
    jobs = []
    for a in soup.select("a.job__link")[:3]:
        title = clean(a.get_text())
        href = a.get("href", "")
        if href and not href.startswith("http"):
            href = urljoin(url, href)
        jobs.append({"title": title or "Job", "url": href, "location": "", "pensum": "–"})
    return jobs

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(extra_http_headers=HEADERS, ignore_https_errors=True)
    page = context.new_page()

    for id_, url, sel_link, sel_loc, sel_pen in SOURCES:
        try:
            if id_ == "lungenliga":
                out[id_].extend(fetch_lungenliga())
                print(f"✓ {id_}: {len(out[id_])} Einträge")
                continue
            if id_ == "kssg":
                out[id_].extend(fetch_kssg(url))
                print(f"✓ {id_}: {len(out[id_])} Einträge")
                continue
            if id_ == "css":
                out[id_].extend(fetch_css(url))
                print(f"✓ {id_}: {len(out[id_])} Einträge")
                continue
            
            page.goto(url, timeout=30000)
            page.wait_for_load_state("networkidle")
            if id_ == "usz":
                out[id_].extend(fetch_usz(page, url))
                print(f"✓ {id_}: {len(out[id_])} Einträge")
                continue
            html = page.content()
            soup = BeautifulSoup(html, "lxml")

            links = soup.select(sel_link)[:3]   # max. 3
            for a in links:
                title = clean(a.get_text())
                href = a.get("href", "")
                if href and not href.startswith("http"):
                    href = urljoin(url, href)

                loc = clean(a.select_one(sel_loc).get_text()) if sel_loc and a.select_one(sel_loc) else ""
                pen = clean(a.select_one(sel_pen).get_text()) if sel_pen and a.select_one(sel_pen) else "–"

                out[id_].append({
                    "title": title or "Job",
                    "url": href,
                    "location": loc,
                    "pensum": pen,
                })
            print(f"✓ {id_}: {len(out[id_])} Einträge")
        except Exception as e:
            print(f"⚠️ {id_}: {e}")

    browser.close()
